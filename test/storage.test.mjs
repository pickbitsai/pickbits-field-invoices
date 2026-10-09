// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, plain, memoryStorage, fakeIndexedDB, sample } from './helpers.mjs';
const F = harness();
test('64 id-hashed buckets round-trip and reject duplicate or misplaced records', () => {
  const records = Array.from({ length: 400 }, (_, i) => ({ id: `invoice-${i}` })), buckets = F.bucketize(records);
  assert.equal(buckets.length, 64); assert.ok(buckets.every(b => b.invoices.length));
  assert.deepEqual(plain(F.flattenBuckets(buckets)).sort((a, b) => a.id.localeCompare(b.id)), records.sort((a, b) => a.id.localeCompare(b.id)));
  assert.throws(() => F.bucketize([{ id: 'x' }, { id: 'x' }]), /duplicate/); buckets[0].invoices.push({ id: 'wrong-bucket' }); assert.throws(() => F.flattenBuckets(buckets), /Damaged/);
});
test('IndexedDB saves survive a fresh store and retain soft deletion', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), storage = new F.Storage({ localStorage: local, indexedDB }); await storage.init(); assert.equal(storage.mode, 'IndexedDB');
  const { state, draft } = sample(F); await storage.transaction(s => { Object.assign(s, state); F.saveInvoice(s, draft); });
  await storage.transaction(s => { s.invoices[0].deletedAt = '2026-02-01'; });
  const reopen = new F.Storage({ localStorage: local, indexedDB }); await reopen.init(); assert.equal(reopen.state.invoices[0].number, 'INV-0001'); assert.equal(F.active(reopen.state.invoices).length, 0); assert.equal(local.getItem(`${storage.ns}.pending`), null);
});
test('localStorage fallback is durable and migrations start empty safely', async () => {
  const local = memoryStorage(), storage = new F.Storage({ localStorage: local }); await storage.init(); assert.equal(storage.mode, 'localStorage');
  const { state, draft } = sample(F); await storage.transaction(s => { Object.assign(s, state); F.saveInvoice(s, draft); });
  const reopen = new F.Storage({ localStorage: local }); await reopen.init(); assert.equal(reopen.state.invoices.length, 1); assert.equal(reopen.state.settings.name, state.settings.name);
});
test('fallback upgrades into buckets and removes the source only after verification', async () => {
  const local = memoryStorage(), fallback = new F.Storage({ localStorage: local }); await fallback.init(); const { state, draft } = sample(F);
  await fallback.transaction(s => { Object.assign(s, state); F.saveInvoice(s, draft); });
  const indexedDB = fakeIndexedDB(), upgraded = new F.Storage({ localStorage: local, indexedDB }); await upgraded.init(); assert.equal(upgraded.state.invoices.length, 1); assert.equal(local.getItem(`${fallback.ns}.fallback`), null); assert.equal(upgraded.mode, 'IndexedDB');
});
test('legacy per-invoice IndexedDB layout migrates transactionally into buckets', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(); indexedDB.seedLegacy(`${F.namespace(false)}-store`, [{ id: 'legacy', date: '2026-01-01', services: [] }]);
  const storage = new F.Storage({ localStorage: local, indexedDB }); await storage.init(); assert.equal(storage.state.invoices[0].id, 'legacy'); assert.equal(storage.state.invoices[0].number, 'INV-0001'); assert.equal(storage.db.objectStoreNames.contains('invoices'), false);
});
test('migration merges local legacy invoices with existing bucket IDs', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), store = new F.Storage({ localStorage: local, indexedDB }); await store.init();
  const { state, draft } = sample(F); await store.transaction(s => { Object.assign(s, state); F.saveInvoice(s, draft); });
  local.setItem(`${store.ns}.invoices`, JSON.stringify([{ id: draft.id, notes: 'must not replace' }, { id: 'legacy-second', date: '2026-02-01' }]));
  const second = new F.Storage({ localStorage: local, indexedDB }); await second.init(); assert.equal(second.state.invoices.length, 2); assert.notEqual(second.state.invoices.find(i => i.id === draft.id).notes, 'must not replace');
});
test('failed bucket commits retain journal and recover together with metadata on reopen', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), storage = new F.Storage({ localStorage: local, indexedDB }); await storage.init(); const { state, draft } = sample(F);
  indexedDB.failNextWrite(); await assert.rejects(storage.transaction(s => { Object.assign(s, state); F.saveInvoice(s, draft); }), /abort/i);
  assert.ok(local.getItem(`${storage.ns}.pending`)); assert.equal(storage.state.invoices.length, 0);
  const reopen = new F.Storage({ localStorage: local, indexedDB }); await reopen.init(); assert.equal(reopen.state.invoices.length, 1); assert.equal(reopen.state.customers.length, 1); assert.equal(reopen.state.numberFloor, 2);
});
test('quota failure is surfaced without reporting a successful save', async () => {
  const local = memoryStorage(), storage = new F.Storage({ localStorage: local }); await storage.init(); local.failWrites();
  await assert.rejects(storage.transaction(s => { s.settings.name = 'Unsaved'; }), /Quota/); assert.equal(storage.state.settings.name, '');
});
test('unreadable buckets or unavailable established IndexedDB never become an empty fallback', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), storage = new F.Storage({ localStorage: local, indexedDB }); await storage.init();
  await assert.rejects(new F.Storage({ localStorage: local }).init(), /No records were overwritten/);
  storage.db.tables.get('invoiceBuckets').set('bad', { id: 'bad', bucket: 90, invoices: [] });
  await assert.rejects(new F.Storage({ localStorage: local, indexedDB }).init(), /Damaged/);
});
test('malformed local JSON is surfaced rather than replaced with an empty store', async () => { const local = memoryStorage(); local.setItem(`${F.namespace(false)}.fallback`, '{broken'); await assert.rejects(new F.Storage({ localStorage: local }).init(), /Could not read/); assert.equal(local.getItem(`${F.namespace(false)}.fallback`), '{broken'); });
test('queued transactions read latest state and reserve sequential invoice numbers', async () => {
  const local = memoryStorage(), storage = new F.Storage({ localStorage: local }); await storage.init(); const { state, draft } = sample(F); await storage.transaction(s => Object.assign(s, state));
  await Promise.all(Array.from({ length: 12 }, (_, n) => storage.transaction(s => F.saveInvoice(s, { ...draft, id: `queued-${n}` }))));
  assert.equal(new Set(storage.state.invoices.map(i => i.number)).size, 12); assert.equal(storage.state.settings.nextNumber, 13);
});
test('demo namespace, backup and reset never modify real data', async () => {
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), real = new F.Storage({ localStorage: local, indexedDB }), demo = new F.Storage({ localStorage: local, indexedDB, demo: true });
  await real.init(); await real.transaction(s => { s.settings.name = 'Real settings'; }); const before = JSON.stringify(await real.read());
  await demo.init(); await demo.resetDemo(); await demo.transaction(s => { s.customers[0].name = 'Demo change'; }); await demo.resetDemo(); assert.equal(demo.state.customers.length, 25); assert.notEqual(demo.state.customers[0].name, 'Demo change'); assert.equal(JSON.stringify(await real.read()), before); await assert.rejects(real.resetDemo(), /Only demo/);
});
test('initialization and concurrent tabs share the write lock and latest invoice sequence', async () => {
  let chain = Promise.resolve(); const locks = { request(name, run) { const task = chain.then(run); chain = task.catch(() => {}); return task; } };
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), a = new F.Storage({ localStorage: local, indexedDB, locks }), b = new F.Storage({ localStorage: local, indexedDB, locks });
  await Promise.all([a.init(), b.init()]); const { state, draft } = sample(F); await a.transaction(s => Object.assign(s, state));
  await Promise.all([a.transaction(s => F.saveInvoice(s, { ...draft, id: 'tab-a' })), b.transaction(s => F.saveInvoice(s, { ...draft, id: 'tab-b' }))]);
  const final = await a.read(); assert.equal(final.invoices.length, 2); assert.equal(new Set(final.invoices.map(i => i.number)).size, 2); assert.equal(final.numberFloor, 3);
});
test('backup snapshot waits for an in-flight transaction instead of replaying its journal', async () => {
  let chain = Promise.resolve(); const locks = { request(name, run) { const task = chain.then(run); chain = task.catch(() => {}); return task; } };
  const local = memoryStorage(), indexedDB = fakeIndexedDB(), writer = new F.Storage({ localStorage: local, indexedDB, locks }), reader = new F.Storage({ localStorage: local, indexedDB, locks });
  await writer.init(); await reader.init();
  const change = writer.transaction(s => { s.settings.name = 'Committed name'; });
  const snapshot = reader.read(); await change;
  assert.equal((await snapshot).settings.name, 'Committed name'); assert.equal(local.getItem(`${writer.ns}.pending`), null);
});
