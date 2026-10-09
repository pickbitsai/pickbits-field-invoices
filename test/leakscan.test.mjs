// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { scanText, leakscan } from './leakscan.mjs';
test('repository text passes the public leakscan', async () => { const result = await leakscan(); assert.deepEqual(result.findings, []); assert.ok(result.scanned >= 25); });
test('leakscan catches absolute drive paths and private workspace names', () => { for (const value of [['C', ':', '/', 'private'].join(''), ['D', ':', '\\', 'private'].join(''), 'pickbits' + '-services']) assert.ok(scanText(value).length); });
test('leakscan catches every required credential family and PEM keys', () => {
  for (const prefix of ['sk-', ...['p','o','u','s','r'].map(letter => 'gh' + letter + '_'), ...['b','p','a','r','s','c'].map(letter => 'xox' + letter + '-')]) assert.ok(scanText(prefix + 'X'.repeat(20)).length, prefix);
  assert.ok(scanText('AK' + 'IA' + 'A'.repeat(16)).length); assert.ok(scanText('-----BEGIN ' + 'PRIVATE KEY-----').length); assert.ok(scanText('-----BEGIN RSA ' + 'PRIVATE KEY-----').length);
});
test('leakscan catches each forbidden string case-insensitively', () => { for (const chunks of [['pickbits','.ai']]) assert.ok(scanText(chunks.join('').toUpperCase()).length); });
test('leakscan allows only reserved fictional phone numbers and example email domains', () => {
  for (const phone of ['555-0100', '555-0199', '(480) 555-0142', '(480)5550142', '480-555-0118', '4805550127', '14805550142', '+14805550142']) assert.deepEqual(scanText(phone), []);
  for (const chunks of [['480','555','0200'], ['212','867','5309']]) for (const value of [chunks.join('-'), chunks.join(''), '1' + chunks.join(''), '+1' + chunks.join(''), '(' + chunks[0] + ')' + chunks.slice(1).join('')]) assert.ok(scanText(value).length);
  for (const domain of ['example.com','example.org','example.net']) assert.deepEqual(scanText('synthetic@' + domain), []);
  assert.ok(scanText('person@' + ['private', 'invalid'].join('.')).length);
});
test('all shipped JavaScript parses and every first-party source has SPDX and copyright', async () => {
  async function walk(url) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      if (['.git','.test-tmp','node_modules','test-output'].includes(entry.name)) continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.(js|mjs|html|css|svg)$/.test(entry.name)) continue;
      // The vendored release-guard scanner keeps its own upstream header.
      if (path.href.endsWith('/scripts/release-guard.mjs')) continue;
      const source = await readFile(path, 'utf8'), first = source.split(/\r?\n/).slice(0, 2).join('\n');
      assert.match(first, /SPDX-License-Identifier: Apache-2.0/); assert.match(first, /Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices/);
      if (entry.name.endsWith('.js')) new vm.Script(source, { filename: entry.name });
    }
  }
  await walk(new URL('../', import.meta.url));
});
