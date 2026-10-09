// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
export function harness(globals = {}) {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa, console, setTimeout, clearTimeout, ...globals });
  for (const file of ['core', 'storage', 'backup', 'renderers', 'demo']) vm.runInContext(readFileSync(new URL(`../app/${file}.js`, import.meta.url), 'utf8'), context, { filename: `${file}.js` });
  return context.FieldInvoices;
}
export const plain = value => JSON.parse(JSON.stringify(value));
export function memoryStorage() {
  const values = new Map(); let fail = false;
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem(key, value) { if (fail) throw new Error('Quota exceeded'); values.set(key, String(value)); }, removeItem: key => values.delete(key), key: index => [...values.keys()][index], get length() { return values.size; }, failWrites(value = true) { fail = value; }, values };
}
// Minimal asynchronous transactional IDB double. Real engines are covered by optional browser checks.
export function fakeIndexedDB() {
  const databases = new Map(); let failWrite = false;
  function makeDB(name, version, tables = new Map()) {
    const db = { name, version, tables, objectStoreNames: { contains: key => db.tables.has(key) }, createObjectStore(key) { db.tables.set(key, new Map()); }, deleteObjectStore(key) { db.tables.delete(key); }, close() {} };
    db.transaction = (key, mode) => transaction(db, mode);
    return db;
  }
  function transaction(db, mode, onCommit) {
    const tx = { pending: 0, aborted: false, work: structuredClone(db.tables), error: null };
    tx.abort = () => { tx.aborted = true; tx.error = new Error('Transaction aborted'); };
    function finish() {
      setImmediate(() => {
        if (tx.finished || tx.pending) return;
        tx.finished = true;
        if (mode === 'readwrite' && failWrite) { failWrite = false; tx.abort(); }
        if (tx.aborted) { tx.onabort?.(); onCommit?.(false); return; }
        if (mode !== 'readonly') db.tables = tx.work;
        tx.oncomplete?.(); onCommit?.(true);
      });
    }
    function request(fn) {
      const r = {}; tx.pending++;
      setImmediate(() => {
        try { r.result = fn(); r.onsuccess?.(); } catch (error) { r.error = error; tx.error = error; tx.aborted = true; r.onerror?.(); }
        tx.pending--; finish();
      }); return r;
    }
    tx.objectStore = key => ({
      getAll: () => request(() => structuredClone([...tx.work.get(key).values()])),
      put: value => request(() => tx.work.get(key).set(value.id, structuredClone(value))),
      delete: id => request(() => tx.work.get(key).delete(id)),
      clear: () => request(() => tx.work.get(key).clear())
    });
    finish(); return tx;
  }
  return {
    databases,
    failNextWrite() { failWrite = true; },
    seedLegacy(name, records) { databases.set(name, makeDB(name, 1, new Map([['invoices', new Map(records.map(r => [r.id, structuredClone(r)]))]]))); },
    open(name, version) {
      const r = {};
      setImmediate(() => {
        const db = databases.get(name) || makeDB(name, 0); r.result = db;
        if (db.version < version) {
          const saved = structuredClone(db.tables);
          r.transaction = transaction(db, 'upgrade', ok => {
            if (ok) { db.version = version; databases.set(name, db); r.onsuccess?.(); }
            else { db.tables = saved; r.error = new Error('Upgrade failed'); r.onerror?.(); }
          });
          // Upgrade store creation/deletion updates the transaction's schema too.
          db.createObjectStore = key => { db.tables.set(key, new Map()); r.transaction.work.set(key, new Map()); };
          db.deleteObjectStore = key => { db.tables.delete(key); r.transaction.work.delete(key); };
          r.onupgradeneeded?.();
        } else r.onsuccess?.();
      }); return r;
    }
  };
}
export function sample(F) {
  const state = F.emptyState(); state.settings.name = 'Example Field Care'; state.settings.phone = '(480) 555-0101'; state.settings.email = 'office@example.org'; state.settings.addressLines = ['81 Lantern Willow Lane', 'Mesa, AZ']; state.settings.registration = 'Registration example'; state.settings.instructions = 'Reference your invoice number.'; state.settings.technician = 'Ari Wrenvale';
  state.customers.push({ id: 'customer-1', name: 'Bryn Mossden', address: '19 Pebble Lantern Court', city: 'Mesa', phone: '(480) 555-0102', notes: 'PRIVATE GATE NOTE', prices: {}, cycle: { type: 'monthly' }, since: '2026-01-01' });
  state.services.push({ id: 'service-1', name: 'Mow and edge', price: 100, taxable: true, unit: 'visit' });
  const draft = F.blankDraft(state.settings, 'customer-1'); draft.date = '2026-01-31'; draft.customer = plain(state.customers[0]); draft.services = [F.catalogueLine(state.services[0])]; return { state, draft };
}
