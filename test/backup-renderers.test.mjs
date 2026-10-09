// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, plain, sample, memoryStorage } from './helpers.mjs';
const F = harness();
test('encrypted backup round trip preserves settings and hides customer data', async () => {
  const { state, draft } = sample(F); F.saveInvoice(state, draft); const backup = F.buildBackup(state), envelope = await F.encryptBackup(backup, 'a long synthetic test passphrase');
  assert.equal(envelope.iterations, 600000); assert.equal(envelope.cipher, 'AES-256-GCM'); assert.ok(!JSON.stringify(envelope).includes(state.customers[0].name)); assert.deepEqual(plain(await F.decodeBackup(envelope, 'a long synthetic test passphrase')), plain(backup));
});
test('encrypted exports use random salts and IVs', async () => { const backup = F.buildBackup(sample(F).state); const a = await F.encryptBackup(backup, 'test passphrase'), b = await F.encryptBackup(backup, 'test passphrase'); assert.notEqual(a.salt, b.salt); assert.notEqual(a.iv, b.iv); assert.notEqual(a.ciphertext, b.ciphertext); });
test('wrong passphrase and ciphertext/header tampering fail with no partial import', async () => {
  const { state } = sample(F), encrypted = await F.encryptBackup(F.buildBackup(state), 'correct test passphrase');
  const local = memoryStorage(), storage = new F.Storage({ localStorage: local }); await storage.init(); const before = JSON.stringify(storage.state);
  const attempt = async (payload, password) => { const decoded = await F.decodeBackup(payload, password); await storage.transaction(s => F.mergeBackup(s, decoded)); };
  await assert.rejects(attempt(encrypted, 'wrong'), /No data was imported/);
  const broken = plain(encrypted); broken.ciphertext = (broken.ciphertext[0] === 'A' ? 'B' : 'A') + broken.ciphertext.slice(1); await assert.rejects(attempt(broken, 'correct test passphrase'), /No data was imported/);
  const header = plain(encrypted); header.stamp = 'changed'; await assert.rejects(attempt(header, 'correct test passphrase'), /No data was imported/); assert.equal(JSON.stringify(storage.state), before);
});
test('unsupported crypto versions and excessive KDF work are rejected', async () => { const envelope = await F.encryptBackup(F.buildBackup(sample(F).state), 'passphrase'); await assert.rejects(F.decodeBackup({ ...envelope, version: 2 }), /Unsupported/); await assert.rejects(F.decodeBackup({ ...envelope, iterations: 9999999 }), /Unsupported/); });
test('plain export remains available, versioned and stamped', async () => { const payload = await F.encryptBackup(F.buildBackup(sample(F).state), ''); assert.equal(payload.stamp, F.STAMP); assert.equal((await F.decodeBackup(JSON.stringify(payload))).data.customers.length, 1); });
test('merge by id adds missing records and keeps current corrections/deletions/settings', () => {
  const { state, draft } = sample(F); const invoice = F.saveInvoice(state, draft), payload = F.buildBackup(state); const target = F.emptyState();
  const counts = F.mergeBackup(target, payload); assert.equal(counts.invoices, 1); assert.equal(target.settings.name, state.settings.name); target.invoices[0].deletedAt = '2026-02-01'; target.settings.name = 'Local business';
  assert.equal(F.mergeBackup(target, payload).invoices, 0); assert.equal(target.invoices[0].deletedAt, '2026-02-01'); assert.equal(target.settings.name, 'Local business'); assert.equal(target.invoices[0].number, invoice.number);
  F.mergeBackup(target, payload, { restoreSettings: true }); assert.equal(target.settings.name, state.settings.name);
});
test('import keeps number high-water mark and rejects cross-device duplicate numbers atomically', () => {
  const { state, draft } = sample(F); F.saveInvoice(state, draft); const other = plain(state); other.invoices[0].id = 'different'; const snapshot = JSON.stringify(state);
  assert.throws(() => F.mergeBackup(state, F.buildBackup(other)), /conflict/); assert.equal(JSON.stringify(state), snapshot);
  other.invoices[0].number = 'OTHER-0040'; other.invoices[0].sequence = 40; other.numberFloor = 41; F.mergeBackup(state, F.buildBackup(other)); assert.equal(state.settings.nextNumber, 41);
});
test('malformed and demo/live mismatched backups cannot mutate a real store', () => { const state = F.emptyState(), before = JSON.stringify(state); assert.throws(() => F.mergeBackup(state, F.buildBackup(F.demoState(), true)), /Demo backups/); const bad = F.buildBackup(state); delete bad.data.materials; assert.throws(() => F.mergeBackup(state, bad), /missing materials/); assert.equal(JSON.stringify(state), before); });
test('malformed nested invoice data and duplicate imported numbers are rejected before merge', () => {
  const { state, draft } = sample(F); F.saveInvoice(state, draft); const before = JSON.stringify(state);
  for (const corrupt of [p => { p.data.invoices[0].corrections = {}; }, p => { p.data.invoices[0].services = [null]; }, p => { p.data.invoices[0].corrections = [{ fields: null }]; }, p => { p.data.invoices.push({ ...p.data.invoices[0], id: 'other' }); }]) {
    const payload = F.buildBackup(state); corrupt(payload); assert.throws(() => F.mergeBackup(state, payload)); assert.equal(JSON.stringify(state), before);
  }
});
test('HTML and text render settings, permanent number, tax, correction and output stamp', () => {
  const { state, draft } = sample(F); draft.taxRate = 8; const i = F.saveInvoice(state, draft); i.corrections.push({ note: 'Example' });
  for (const output of [F.invoiceHTML(i, state.settings), F.invoiceText(i, state.settings)]) for (const text of ['Example Field Care', 'Registration example', '(480) 555-0101', 'office@example.org', '81 Lantern Willow Lane', 'INV-0001', 'Mow and edge', 'Subtotal', 'Tax (8%)', '$8.00', '$108.00', 'Corrected', 'Payment due on receipt.', 'Reference your invoice number.', F.STAMP]) assert.ok(output.includes(text), text);
  assert.ok(!F.invoiceText(i, state.settings).includes('PRIVATE GATE NOTE')); assert.ok(F.invoiceText(i, state.settings).endsWith(F.STAMP));
});
test('zero tax hides tax row; summary has quantities and no prices/payment details', () => { const { state, draft } = sample(F), i = F.saveInvoice(state, draft); assert.ok(!F.invoiceText(i, state.settings).includes('Tax (')); for (const output of [F.invoiceText(i, state.settings, 'summary'), F.invoiceHTML(i, state.settings, 'summary')]) { assert.ok(output.includes('VISIT SUMMARY INV-0001')); assert.ok(output.includes('Mow and edge')); assert.ok(!output.includes('$')); assert.ok(!output.includes('Payment due')); assert.ok(output.includes(F.STAMP)); } });
test('HTML escapes untrusted text, strips remote logos and validates accent colour', () => { const { state, draft } = sample(F); draft.notes = '<img src=x onerror=alert(1)>'; state.settings.logo = 'https://example.com/logo.png'; state.settings.ink = 'red;position:fixed'; const i = F.saveInvoice(state, draft); const html = F.invoiceHTML(i, state.settings); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('src="https://')); assert.ok(!html.includes('position:fixed')); });
test('canvas renderer wraps long words and paints the same number/settings/stamp without a DOM', () => {
  const { state, draft } = sample(F); const i = F.saveInvoice(state, draft); const painted = [], ctx = { measureText: value => ({ width: value.length * 9 }), fillText: text => painted.push(text), fillRect() {}, drawImage() {} }; const canvas = { getContext: () => ctx };
  const result = F.invoiceCanvas(i, state.settings, 'invoice', () => canvas, { width: 300, height: 100 }); assert.equal(result.width, 900); assert.ok(result.height > 500);
  for (const text of ['Example Field Care', 'INVOICE INV-0001', F.STAMP]) assert.ok(painted.includes(text)); assert.ok(F.wrapText(ctx, 'x'.repeat(200), 100).every(l => l.length <= 11));
  painted.length = 0; F.invoiceCanvas(i, state.settings, 'summary', () => canvas); assert.ok(!painted.some(t => t.includes('$'))); assert.ok(painted.includes(F.STAMP));
});
test('CSV quotes values, neutralizes formulas, marks paid status and excludes deleted invoices', () => { const { state, draft } = sample(F); state.customers[0].name = '=UNTRUSTED,"text"'; const i = F.saveInvoice(state, draft); let csv = F.invoiceCSV(state); assert.ok(csv.includes('"\'=UNTRUSTED,""text"""')); assert.ok(csv.includes('Unpaid')); assert.ok(csv.includes(F.STAMP)); i.deletedAt = 'now'; csv = F.invoiceCSV(state); assert.ok(!csv.includes('INV-0001')); });
