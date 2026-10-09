// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices, FORMAT = 'pickbits-field-invoices-backup', ITERATIONS = 600000;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  function bytes64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
  function from64(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
  function buildBackup(state, demo = false) { return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), demo, stamp: F.STAMP, data: F.clone(state) }; }
  function validateBackup(payload) {
    if (payload?.format !== FORMAT || payload.version !== 1 || !payload.data || typeof payload.data.settings !== 'object') throw new Error('Not a supported Field Invoices backup.');
    for (const key of ['customers', 'services', 'materials', 'invoices']) if (!Array.isArray(payload.data[key])) throw new Error(`Backup is missing ${key}.`);
    const state = F.migrate(payload.data);
    for (const key of ['customers', 'services', 'materials']) for (const item of state[key]) {
      if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Invalid ${key} name in backup.`);
    }
    for (const invoice of state.invoices) {
      if (typeof invoice.customer.name !== 'string' || !F.dateValue(invoice.date)) throw new Error('Invalid invoice customer or date in backup.');
      for (const correction of invoice.corrections) if (!correction || !Array.isArray(correction.fields) || correction.fields.some(f => !f || typeof f.field !== 'string')) throw new Error('Invalid correction log in backup.');
      if (invoice.business) F.cleanSettings(invoice.business);
    }
    return state;
  }
  const aad = e => encoder.encode(JSON.stringify({ format: e.format, version: e.version, kdf: e.kdf, iterations: e.iterations, salt: e.salt, iv: e.iv, cipher: e.cipher, stamp: e.stamp }));
  async function derive(passphrase, salt, iterations) {
    if (!crypto.subtle) throw new Error('Encryption needs HTTPS or the local demo server.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBackup(payload, passphrase) {
    validateBackup(payload);
    if (!passphrase) return F.clone(payload);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const e = { format: FORMAT + '-encrypted', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM', salt: bytes64(salt), iv: bytes64(iv), stamp: F.STAMP };
    const key = await derive(passphrase, salt, e.iterations);
    e.ciphertext = bytes64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(e) }, key, encoder.encode(JSON.stringify(payload)))));
    return e;
  }
  async function decodeBackup(input, passphrase = '') {
    const e = typeof input === 'string' ? JSON.parse(input) : input;
    if (e?.format === FORMAT) { validateBackup(e); return e; }
    if (e?.format !== FORMAT + '-encrypted' || e.version !== 1 || e.kdf !== 'PBKDF2-SHA256' || e.cipher !== 'AES-256-GCM' || !Number.isInteger(e.iterations) || e.iterations < ITERATIONS || e.iterations > 2000000) throw new Error('Unsupported encrypted backup.');
    try {
      const salt = from64(e.salt), iv = from64(e.iv), ciphertext = from64(e.ciphertext);
      if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid envelope.');
      const key = await derive(passphrase, salt, e.iterations);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(e) }, key, ciphertext);
      const payload = JSON.parse(decoder.decode(plain)); validateBackup(payload); return payload;
    } catch { throw new Error('Could not decrypt backup. Check the passphrase; the file may be damaged. No data was imported.'); }
  }
  function mergeBackup(state, payload, { demo = false, restoreSettings = false } = {}) {
    const incoming = validateBackup(payload);
    if (Boolean(payload.demo) !== demo) throw new Error('Demo backups stay in demo mode; real backups stay in real mode.');
    const next = F.clone(state), counts = {};
    const numbers = new Map(next.invoices.map(i => [i.number, i.id]));
    for (const invoice of incoming.invoices) if (numbers.has(invoice.number) && numbers.get(invoice.number) !== invoice.id) throw new Error(`Invoice number conflict: ${invoice.number}. Nothing was imported.`);
    for (const key of ['customers', 'services', 'materials', 'invoices']) { next[key] = F.mergeById(next[key], incoming[key]); counts[key] = next[key].length - state[key].length; }
    if (restoreSettings || !next.settings.name) next.settings = incoming.settings;
    next.numberFloor = Math.max(next.numberFloor, incoming.numberFloor, next.settings.nextNumber);
    next.settings.nextNumber = next.numberFloor;
    next.usedNumbers = [...new Set([...next.usedNumbers, ...incoming.usedNumbers])];
    if (!next.draft) next.draft = incoming.draft;
    Object.assign(state, next); return counts;
  }
  function csvCell(value) {
    let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }
  function invoiceCSV(state) {
    const rows = [['number', 'date', 'customer', 'subtotal', 'tax', 'total', 'paid_status', F.STAMP]];
    for (const i of F.active(state.invoices)) { const t = F.totals(i); rows.push([i.number, i.date, i.customer.name, t.subtotal.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2), t.balanceDue <= 0 ? 'Paid' : t.amountPaid > 0 ? 'Partial' : 'Unpaid', F.STAMP]); }
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  Object.assign(F, { ITERATIONS, buildBackup, validateBackup, encryptBackup, decodeBackup, mergeBackup, invoiceCSV });
})();
