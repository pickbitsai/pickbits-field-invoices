// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices;
  const BUCKETS = 64, STORE = 'invoiceBuckets';
  const namespace = demo => demo ? 'pickbits-field-invoices.demo' : 'pickbits-field-invoices.live';
  function bucketIndex(id) { let hash = 0; for (const c of String(id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return hash % BUCKETS; }
  const bucketKey = index => `bucket-${String(index).padStart(2, '0')}`;
  function bucketize(records) {
    const result = Array.from({ length: BUCKETS }, (_, bucket) => ({ id: bucketKey(bucket), bucket, invoices: [] })), seen = new Set();
    for (const record of records) {
      if (!record?.id || seen.has(record.id)) throw new Error('Invalid or duplicate invoice id.');
      seen.add(record.id); result[bucketIndex(record.id)].invoices.push(record);
    }
    return result;
  }
  function flattenBuckets(buckets) {
    const records = [], seen = new Set(), seenBuckets = new Set();
    for (const b of buckets) {
      if (!Number.isInteger(b.bucket) || b.bucket < 0 || b.bucket >= BUCKETS || b.id !== bucketKey(b.bucket) || !Array.isArray(b.invoices) || seenBuckets.has(b.bucket)) throw new Error('Damaged invoice bucket. Writes are stopped; keep this browser data.');
      seenBuckets.add(b.bucket);
      for (const i of b.invoices) {
        if (!i?.id || bucketIndex(i.id) !== b.bucket || seen.has(i.id)) throw new Error('Damaged invoice record. Writes are stopped; keep this browser data.');
        seen.add(i.id); records.push(i);
      }
    }
    return records;
  }
  function openDatabase(indexedDB, name) {
    return new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(name, 2);
      let blocked = false;
      request.onblocked = () => { blocked = true; reject(new Error('Close other app tabs before upgrading storage.')); };
      request.onerror = () => reject(request.error || new Error('Could not open invoice storage.'));
      request.onupgradeneeded = () => {
        const db = request.result, transaction = request.transaction;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (db.objectStoreNames.contains('invoices')) {
          const read = transaction.objectStore('invoices').getAll();
          read.onerror = () => transaction.abort();
          read.onsuccess = () => {
            try {
              const target = transaction.objectStore(STORE); target.clear();
              bucketize(read.result).filter(b => b.invoices.length).forEach(b => target.put(b));
              const verify = target.getAll();
              verify.onsuccess = () => {
                try {
                  const actual = flattenBuckets(verify.result);
                  if (actual.length !== read.result.length) throw new Error('Migration count mismatch.');
                  db.deleteObjectStore('invoices');
                } catch { transaction.abort(); }
              };
              verify.onerror = () => transaction.abort();
            } catch { transaction.abort(); }
          };
        }
      };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
  }
  function readBuckets(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll();
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Invoice read failed.'));
    });
  }
  function writeBuckets(db, changes) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      for (const b of changes) { if (b.invoices.length) store.put(b); else store.delete(b.id); }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Invoice write failed.'));
    });
  }
  class Storage {
    constructor({ localStorage, indexedDB, demo = false, locks } = {}) {
      this.local = localStorage; this.indexedDB = indexedDB; this.ns = namespace(demo); this.demo = demo; this.locks = locks;
      this.state = F.emptyState(); this.db = null; this.queue = Promise.resolve(); this.mode = 'localStorage'; this.ready = false;
    }
    get(key, fallback = null) {
      const value = this.local.getItem(`${this.ns}.${key}`);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch { throw new Error(`Could not read ${key}. Keep browser data and restore a backup in a fresh browser.`); }
    }
    put(key, value) { this.local.setItem(`${this.ns}.${key}`, JSON.stringify(value)); }
    remove(key) { this.local.removeItem(`${this.ns}.${key}`); }
    async recover() {
      const pending = this.get('pending');
      if (!pending) return;
      if (!this.db) throw new Error('A pending invoice save needs IndexedDB. Reopen this browser with storage enabled.');
      await writeBuckets(this.db, pending.changes);
      this.put('meta', pending.meta); this.remove('pending');
    }
    async readUnlocked() {
      await this.recover();
      let state;
      if (this.db) state = { ...this.get('meta', {}), invoices: flattenBuckets(await readBuckets(this.db)) };
      else state = this.get('fallback', { ...this.get('meta', {}), invoices: this.get('invoices', []) });
      state = F.migrate(state);
      const counter = this.get('counter', { floor: 1, used: [] });
      state.numberFloor = Math.max(state.numberFloor, counter.floor);
      state.settings.nextNumber = Math.max(state.settings.nextNumber, state.numberFloor);
      state.usedNumbers = [...new Set([...state.usedNumbers, ...counter.used])];
      return state;
    }
    read() {
      const run = () => this.readUnlocked();
      const locked = () => this.locks ? this.locks.request(`${this.ns}.write`, run) : run();
      const pending = this.queue.then(locked); this.queue = pending.catch(() => {}); return pending;
    }
    async init() {
      const run = () => this.initialize();
      return this.locks ? this.locks.request(`${this.ns}.write`, run) : run();
    }
    async initialize() {
      const meta = this.get('meta', {});
      try { this.db = await openDatabase(this.indexedDB, `${this.ns}-store`); this.mode = 'IndexedDB'; }
      catch (error) {
        if (meta.storageMode === 'IndexedDB' || this.get('pending')) throw new Error(`History could not be opened: ${error.message} No records were overwritten.`);
        this.mode = 'localStorage';
      }
      if (this.db) {
        await this.recover();
        const fallback = this.get('fallback'), legacy = this.get('invoices');
        if (fallback || legacy) {
          const current = flattenBuckets(await readBuckets(this.db));
          const source = fallback || { ...meta, invoices: legacy };
          const migrated = F.migrate({ ...source, invoices: F.mergeById(current, source.invoices) });
          await this.persist(migrated, current);
          const verify = flattenBuckets(await readBuckets(this.db));
          if (verify.length !== migrated.invoices.length) throw new Error('Storage migration verification failed.');
          this.remove('fallback'); this.remove('invoices');
        }
      }
      this.state = await this.readUnlocked();
      await this.persist(this.state, this.db ? flattenBuckets(await readBuckets(this.db)) : []);
      this.ready = true; return this.state;
    }
    async persist(state, previous = this.state.invoices) {
      // Reserve numbers before any invoice write. A failed write can leave a gap, never a reused number.
      const counter = this.get('counter', { floor: 1, used: [] });
      this.put('counter', { floor: Math.max(counter.floor, state.numberFloor), used: [...new Set([...counter.used, ...state.usedNumbers])] });
      if (!this.db) { this.put('fallback', state); return; }
      const before = bucketize(previous), after = bucketize(state.invoices);
      const changes = after.filter((b, i) => JSON.stringify(b) !== JSON.stringify(before[i]));
      const { invoices, ...meta } = state; meta.storageMode = 'IndexedDB';
      // Write-ahead journal makes catalogue + bucket commits recoverable across tab termination.
      this.put('pending', { meta, changes });
      await writeBuckets(this.db, changes);
      this.put('meta', meta); this.remove('pending');
    }
    transaction(change) {
      const run = async () => {
        if (!this.ready) throw new Error('Storage is not ready.');
        const before = await this.readUnlocked(), next = F.clone(before);
        const result = await change(next);
        next.revision = before.revision + 1;
        await this.persist(next, before.invoices); this.state = next;
        return result;
      };
      const locked = () => this.locks ? this.locks.request(`${this.ns}.write`, run) : run();
      const pending = this.queue.then(locked); this.queue = pending.catch(() => {}); return pending;
    }
    async resetDemo() {
      if (!this.demo) throw new Error('Only demo data can be reset.');
      await this.transaction(state => Object.assign(state, F.demoState()));
    }
    close() { this.db?.close(); }
  }
  Object.assign(F, { BUCKETS, namespace, bucketIndex, bucketKey, bucketize, flattenBuckets, openDatabase, readBuckets, writeBuckets, Storage });
})();
