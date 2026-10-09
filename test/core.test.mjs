// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, plain, sample } from './helpers.mjs';
const F = harness();
test('empty-store migration initializes all stores and schema', () => { const s = F.migrate({}); assert.equal(s.schema, F.SCHEMA); assert.equal(s.settings.nextNumber, 1); assert.deepEqual(plain(s.invoices), []); });
test('migration merges duplicate IDs, preserves edits and normalizes old lines', () => {
  const s = F.migrate({ schema: 1, services: [{ id: 'a', name: 'Custom' }, { id: 'a', name: 'Older' }], invoices: [{ id: 'old', services: [{ label: 'Work', price: '25' }], date: '2026-01-01' }] });
  assert.equal(s.services.length, 1); assert.equal(s.services[0].name, 'Custom'); assert.equal(s.invoices[0].services[0].quantity, 1); assert.equal(s.invoices[0].number, 'INV-0001'); assert.deepEqual(plain(F.migrate(s)), plain(s));
});
test('migration retains display numbers and raises the sequence floor', () => { const s = F.migrate({ schema: 1, invoices: [{ id: 'a', number: 'INV-0042' }] }); assert.equal(F.reserveNumber(s).number, 'INV-0043'); });
test('future schemas and malformed collections fail before migration', () => { assert.throws(() => F.migrate({ schema: 99 }), /newer/); assert.throws(() => F.migrate({ customers: [{}] }), /Invalid/); });
test('totals include material quantities, proportional discount, tax, credit, balance and payment', () => {
  const d = { services: [{ quantity: 1, price: 100, taxable: true }, { quantity: 1, price: 50, taxable: false }], materials: [{ quantity: 2, price: 25, taxable: true }], taxRate: 10, money: { discount: 20, credit: 15, previousBalance: 30, amountPaid: 100 } };
  assert.deepEqual(plain(F.totals(d)), { raw: 200, discount: 20, subtotal: 180, tax: 13.5, credit: 15, previousBalance: 30, total: 208.5, amountPaid: 100, balanceDue: 108.5 });
});
test('money is rounded per line and over-discount does not create negative tax', () => { assert.equal(F.totals({ services: [{ price: .1, quantity: 3 }], money: {} }).total, .3); assert.equal(F.totals({ services: [{ price: 10, taxable: true }], money: { discount: 30 }, taxRate: 8 }).tax, 0); });
test('sequential numbering, changing prefixes and lower settings never reuse numbers', () => {
  const { state, draft } = sample(F), first = F.saveInvoice(state, draft); assert.equal(first.number, 'INV-0001');
  state.settings.nextNumber = 1; first.deletedAt = '2026-02-01';
  const second = F.saveInvoice(state, { ...draft, id: 'second' }); assert.equal(second.number, 'INV-0002');
  state.settings.prefix = 'NEW-'; assert.equal(F.saveInvoice(state, { ...draft, id: 'third' }).number, 'NEW-0003');
  state.settings.prefix = 'INV-'; assert.equal(F.saveInvoice(state, { ...draft, id: 'fourth' }).number, 'INV-0004');
});
test('corrections keep number, saved business, send log and detailed before/after', () => {
  const { state, draft } = sample(F), first = F.saveInvoice(state, draft); first.sentLog.push({ method: 'text' });
  state.settings.name = 'New business name'; const change = plain(first); change.services[0].price = 120;
  const saved = F.saveInvoice(state, change, 'Corrected rate'); assert.equal(saved.number, first.number); assert.equal(state.settings.nextNumber, 2); assert.equal(saved.business.name, 'Example Field Care'); assert.equal(saved.sentLog.length, 1); assert.equal(saved.corrections[0].fields[0].field, 'services'); assert.equal(saved.corrections[0].fields[0].from[0].price, 100);
});
test('deleted and stale invoices cannot be silently overwritten', () => {
  const { state, draft } = sample(F), inv = F.saveInvoice(state, draft); const stale = { ...plain(inv), savedAt: 'old' }; assert.throws(() => F.saveInvoice(state, stale), /another tab/);
  inv.deletedAt = '2026-02-01'; assert.throws(() => F.saveInvoice(state, plain(inv)), /Restore/); delete inv.deletedAt; assert.equal(F.active(state.invoices).length, 1);
});
test('correction revision guards stale drafts even if timestamps are identical', () => { const { state, draft } = sample(F); const saved = F.saveInvoice(state, draft), stale = plain(saved); saved.revision++; assert.throws(() => F.saveInvoice(state, stale), /another tab/); });
test('same as last time copies work with new IDs and current remembered prices, not payment or times', () => {
  const { state, draft } = sample(F), old = F.saveInvoice(state, draft); state.customers[0].prices['service-1'] = 125;
  const next = F.blankDraft(state.settings, 'customer-1'), copied = F.sameAsLastTime(state, next);
  assert.equal(copied.services[0].price, 125); assert.notEqual(copied.services[0].id, old.services[0].id); assert.equal(copied.money.amountPaid, 0); assert.equal(copied.timeIn, ''); assert.equal(copied.date, next.date); assert.equal(old.services[0].price, 100);
});
test('older correction does not overwrite latest customer remembered prices', () => { const { state, draft } = sample(F); const old = F.saveInvoice(state, draft); const later = { ...draft, id: 'later', date: '2026-02-14' }; later.services = [{ ...draft.services[0], price: 140 }]; F.saveInvoice(state, later); const change = plain(old); change.services[0].price = 90; F.saveInvoice(state, change); assert.equal(state.customers[0].prices['service-1'], 140); });
test('monthly dates clamp to month end and daily cycles cross leap years', () => { assert.equal(F.addMonth('2026-01-31'), '2026-02-28'); assert.equal(F.addMonth('2024-01-31'), '2024-02-29'); assert.equal(F.addDays('2024-02-28', 2), '2024-03-01'); assert.equal(F.dateValue('2026-02-31'), null); });
test('next due handles cycles, explicit overrides, deleted visits and unscheduled customers', () => {
  const { state, draft } = sample(F); const c = state.customers[0]; assert.equal(F.nextDue(c, []), '2026-01-01'); const i = F.saveInvoice(state, draft); assert.equal(F.nextDue(c, state.invoices), '2026-02-28');
  c.cycle = { type: 'days', days: 14 }; assert.equal(F.nextDue(c, state.invoices), '2026-02-14'); c.nextDue = '2026-03-05'; assert.equal(F.nextDue(c, state.invoices), '2026-03-05'); c.nextDue = ''; i.deletedAt = 'now'; assert.equal(F.nextDue(c, state.invoices), '2026-01-01'); c.cycle = { type: '' }; assert.equal(F.nextDue(c, state.invoices), '');
});
test('Due report includes overdue, excludes future/archived and advances on completion', () => {
  const { state, draft } = sample(F); F.saveInvoice(state, draft); state.customers.push({ id: 'future', name: 'Future', nextDue: '2026-04-01' }, { id: 'archived', name: 'Archived', nextDue: '2026-02-01', archived: true });
  let due = F.dueReport(state, '2026-03-01', '2026-03-07'); assert.equal(due.length, 1); assert.equal(due[0].overdue, true); F.saveInvoice(state, { ...draft, id: 'next', date: '2026-03-01' }); due = F.dueReport(state, '2026-03-01', '2026-03-07'); assert.equal(due.length, 0);
});
test('daily weekly monthly stops and twelve-month strip use active visits', () => {
  const { state, draft } = sample(F); F.saveInvoice(state, draft); F.saveInvoice(state, { ...draft, id: 'next', date: '2026-02-01' });
  assert.equal(F.stopsReport(state, 'day', '2026-01-31').visits.length, 1); assert.equal(F.stopsReport(state, 'week', '2026-02-01').visits.length, 2); assert.equal(F.stopsReport(state, 'month', '2026-02-15').visits.length, 1); assert.equal(F.stopsReport(state, 'month', '2026-02-15', 'Missing').visits.length, 0);
  const strip = F.monthStrip(state, 'customer-1', '2026-02-01'); assert.equal(strip.length, 12); assert.equal(strip.at(-1).count, 1); assert.equal(strip.at(-2).total, 100);
});
test('starter lists are opt-in, editable and idempotent without preset prices', () => { const s = F.emptyState(); assert.equal(s.services.length, 0); for (const trade of Object.keys(F.starters)) F.loadStarter(s, trade); const count = s.services.length; s.services[0].price = 80; F.loadStarter(s, 'lawn'); assert.equal(s.services.length, count); assert.equal(s.services[0].price, 80); assert.equal(s.materials[0].price, ''); });
test('GPS lookup uses only stored coordinates and orders nearest customers', () => { const list = [{ id: 'a', location: { latitude: 33.4, longitude: -111.8 } }, { id: 'b', location: { latitude: 33.41, longitude: -111.8 } }, { id: 'c' }]; assert.equal(F.nearestCustomers(list, { latitude: 33.409, longitude: -111.8 })[0].customer.id, 'b'); assert.throws(() => F.nearestCustomers(list, { latitude: 999, longitude: 0 }), /unavailable/); });
test('demo has 25 synthetic customers, three months, unpaid, one correction and due work', () => { const s = F.demoState('2026-10-08'); assert.equal(s.customers.length, 25); assert.ok(s.invoices.length > 90); assert.equal(s.invoices.filter(i => i.corrections.length).length, 1); assert.ok(s.invoices.some(i => F.totals(i).balanceDue > 0)); assert.ok(F.dueReport(s, '2026-10-08').length > 0); assert.ok(s.customers.every(c => /555-01\d\d/.test(c.phone))); assert.equal(new Set(s.invoices.map(i => i.number)).size, s.invoices.length); });
