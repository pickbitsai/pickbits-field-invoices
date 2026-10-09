// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function worker(fetch) {
  const listeners = {}, deleted = [], entries = new Map(), scope = 'https://example.org/field-invoices/';
  const cache = { async match(key) { return entries.get(key)?.clone(); }, async put(key, value) { entries.set(key, value.clone()); }, async addAll(urls) { for (const url of urls) entries.set(url, new Response('<main id="main">cached app</main>')); } };
  const caches = { async open() { return cache; }, async keys() { return ['unrelated-app', 'field-invoices:/another/:old', 'field-invoices:/field-invoices/:old']; }, async delete(key) { deleted.push(key); } };
  const self = { registration: { scope }, clients: { async claim() {} }, async skipWaiting() {}, addEventListener(name, handler) { listeners[name] = handler; } };
  const context = vm.createContext({ self, caches, fetch, URL, Response, AbortController, setTimeout, clearTimeout });
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + '\n globalThis.testAPI = { networkFirst, cacheKey, CACHE_NAME };', context);
  return { api: context.testAPI, listeners, deleted, entries, scope };
}
test('service worker precaches only sub-path assets and removes only its own stale caches', async () => {
  const w = worker(async () => new Response('online')); let install, activate;
  w.listeners.install({ waitUntil(p) { install = p; } }); await install;
  assert.equal(w.entries.size, 13); assert.ok([...w.entries.keys()].every(k => k.startsWith(w.scope)));
  w.listeners.activate({ waitUntil(p) { activate = p; } }); await activate;
  assert.deepEqual(w.deleted, ['field-invoices:/field-invoices/:old']);
});
test('network-first navigation verifies app signature and falls back on outage or invalid content', async () => {
  let response = new Response('<main id="main">online app</main>');
  const w = worker(async () => { if (!response) throw new Error('offline'); return response.clone(); });
  const request = { url: w.scope + '?demo=1', mode: 'navigate', method: 'GET' };
  assert.ok((await (await w.api.networkFirst(request)).text()).includes('online app'));
  response = new Response('maintenance', { status: 503 }); assert.ok((await (await w.api.networkFirst(request)).text()).includes('online app'));
  response = null; assert.ok((await (await w.api.networkFirst({ ...request, url: w.scope })).text()).includes('online app'));
  assert.equal(w.api.cacheKey(request), w.scope + 'index.html');
});
test('service worker leaves other origins, other scopes and mutation requests alone', () => {
  const w = worker(async () => new Response('online')); let handled = 0;
  for (const request of [{ url: 'https://example.net/index.html', method: 'GET', mode: 'navigate' }, { url: 'https://example.org/another/', method: 'GET', mode: 'navigate' }, { url: w.scope, method: 'POST', mode: 'navigate' }]) w.listeners.fetch({ request, respondWith() { handled++; } });
  assert.equal(handled, 0);
});
