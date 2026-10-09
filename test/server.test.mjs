// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler, HOST, PORT, SIGNATURE, checkStatic, startServer } from '../tools/server.mjs';
async function request(url, { host = `${HOST}:${PORT}`, method = 'GET', basePath = '/' } = {}) {
  let status, headers, body;
  await createHandler({ basePath })({ url, method, headers: { host } }, { writeHead(code, value) { status = code; headers = value; return this; }, end(value) { body = value?.toString() || ''; } });
  return { status, headers, body };
}
test('static server handler pins allocated loopback host and checks application body', async () => { assert.equal(HOST, '127.0.0.1'); assert.equal(PORT, 4205); const response = await request('/?demo=1'); assert.equal(response.status, 200); assert.ok(response.body.includes(SIGNATURE)); assert.equal(await checkStatic(), true); });
test('static handler refuses foreign hosts, writes, traversal and unlisted private files', async () => {
  for (const host of ['example.com:4205', 'localhost:4205', '127.0.0.1', '127.0.0.1:9999']) assert.equal((await request('/', { host })).status, 403);
  assert.equal((await request('/', { method: 'POST' })).status, 405);
  for (const path of ['/../package.json','/%2e%2e/package.json','/.git/config','/.env','/test/helpers.mjs','/tools/server.mjs','/app/../package.json']) assert.equal((await request(path)).status, 404);
  assert.equal((await request('https://example.com/')).status, 400);
});
test('app assets and manifest serve from a sub-path without root-relative URLs', async () => {
  const response = await request('/field-invoices/?demo=1', { basePath: '/field-invoices/' }); assert.equal(response.status, 200);
  assert.equal((await request('/field-invoices/app/ui.js', { basePath: '/field-invoices/' })).status, 200);
  assert.ok(!response.body.includes('src="/')); assert.ok(!response.body.includes('href="/'));
  const manifest = JSON.parse((await request('/manifest.webmanifest')).body); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
});
test('neutral raster app icons have expected PNG dimensions', async () => { for (const size of [180,192,512]) { const bytes = await readFile(new URL(`../icons/icon-${size}.png`, import.meta.url)); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size); } });
test('server refuses an alternate or ephemeral port before binding', async () => { for (const options of [{ port: 0 }, { port: 9999 }, { host: '0.0.0.0' }, { host: '' }]) await assert.rejects(startServer(options), /Only the allocated/); });
