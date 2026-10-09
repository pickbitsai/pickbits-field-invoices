// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, plain, sample } from './helpers.mjs';
const F = harness();

test('demo retains its worked-example counts and uses complete addresses and distinct notes', () => {
  const s = F.demoState('2026-10-08');
  assert.equal(s.customers.length, 25); assert.equal(s.invoices.length, 111);
  assert.equal(s.invoices.filter(i => F.totals(i).balanceDue > 0).length, 5);
  assert.equal(s.invoices.filter(i => i.corrections.length).length, 1);
  const due = F.dueReport(s, '2026-10-08'); assert.equal(due.length, 25); assert.equal(due.filter(r => r.overdue).length, 6);
  assert.equal(new Set(s.invoices.map(i => i.notes)).size, 111);
  assert.equal(new Set(s.customers.map(c => c.name)).size, 25);
  for (const c of s.customers) {
    assert.match(F.addressLines(c).join(', '), /^\d+ [NSEW] .+, (Mesa|Gilbert|Chandler), AZ \d{5}$/);
    assert.match(c.email, /^[a-z]+[.][a-z.]+@example\.(com|org|net)$/);
    assert.match(c.phone, /^\(480\) 555-01\d{2}$/);
    assert.ok(c.notes); assert.ok(!/Private note|synthetic|fictional/i.test(c.notes));
  }
  for (const i of s.invoices) assert.equal(i.customer.state, 'AZ');
  assert.match(s.settings.addressLines[1], /^Mesa, AZ \d{5}$/);
  assert.ok(s.invoices.some(i => /oleanders/.test(i.notes)));
  assert.ok(s.invoices.some(i => /overseeding/.test(i.notes)));
});

test('friendly dates use device locale with en-US fallback and keep calendar days stable', () => {
  assert.equal(F.formatDate('2026-09-27'), 'Sep 27, 2026');
  assert.equal(F.formatDate('2026-09-27', 'long'), 'September 27, 2026');
  assert.equal(F.formatDate('2026-10-06', 'due'), 'Oct 6');
  assert.equal(F.formatDate('2026-09-01', 'month'), 'September 2026');
  assert.equal(F.formatDate('2026-02-31'), ''); assert.equal(F.formatTimestamp('bad'), '');
  const localized = harness({ navigator: { language: 'es-US' } });
  const expected = new Intl.DateTimeFormat('es-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date('2026-09-27T12:00:00Z'));
  assert.equal(localized.formatDate('2026-09-27', 'long'), expected);
  for (const timeZone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    const previous = process.env.TZ;
    try { process.env.TZ = timeZone; assert.equal(harness().formatDate('2026-09-27'), 'Sep 27, 2026'); }
    finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
});

test('history sorts newest first with number tie-break, groups months and pages without mutation', () => {
  const s = F.demoState('2026-10-08'), before = JSON.stringify(s.invoices);
  const first = F.invoiceHistory(s.invoices), next = F.invoiceHistory(s.invoices, { limit: 100 }), all = F.invoiceHistory(s.invoices, { limit: 150 });
  assert.equal(first.count, 50); assert.equal(first.total, 111); assert.equal(next.count, 100); assert.equal(all.count, 111);
  const rows = result => result.groups.flatMap(g => g.invoices);
  assert.deepEqual(plain(rows(next).slice(0, 50)), plain(rows(first)));
  assert.equal(new Set(rows(all).map(i => i.id)).size, 111);
  rows(all).forEach((i, n, list) => { if (n) assert.ok(list[n - 1].date > i.date || list[n - 1].date === i.date && list[n - 1].sequence > i.sequence); });
  for (const g of all.groups) assert.ok(g.invoices.every(i => i.date.startsWith(g.month)));
  assert.equal(JSON.stringify(s.invoices), before);
});

test('history combines customer or number search with payment, corrected and deleted filters', () => {
  const s = F.demoState('2026-10-08');
  const corrected = s.invoices.find(i => i.corrections.length);
  assert.equal(F.invoiceHistory(s.invoices, { status: 'unpaid' }).total, 5);
  assert.equal(F.invoiceHistory(s.invoices, { status: 'paid' }).total, 106);
  assert.equal(F.invoiceHistory(s.invoices, { status: 'corrected' }).total, 1);
  assert.equal(F.invoiceHistory(s.invoices, { search: '  LAURA MARTINEZ  ' }).total, 3);
  assert.equal(F.invoiceHistory(s.invoices, { search: corrected.number.toLowerCase(), status: 'corrected' }).total, 1);
  assert.equal(F.invoiceHistory(s.invoices, { search: 'no such customer' }).count, 0);
  const unpaid = s.invoices.find(i => F.totals(i).balanceDue > 0); unpaid.money.amountPaid = 1;
  assert.equal(F.invoiceHistory(s.invoices, { status: 'unpaid' }).total, 5, 'partial payment remains unpaid');
  corrected.deletedAt = '2026-10-08';
  assert.equal(F.invoiceHistory(s.invoices).total, 110);
  assert.equal(F.invoiceHistory(s.invoices, { status: 'corrected' }).total, 0);
  assert.equal(F.invoiceHistory(s.invoices, { status: 'deleted', search: corrected.number }).total, 1);
});

test('documents have a full bill-to, friendly dates and ordered totals; CSV retains ISO', () => {
  const { state, draft } = sample(F); Object.assign(state.customers[0], { state: 'AZ', zip: '85204' });
  draft.date = '2026-09-27'; draft.taxRate = 10;
  Object.assign(draft.money, { discount: 20, credit: 5, previousBalance: 12, amountPaid: 30, paymentType: 'Check' });
  const i = F.saveInvoice(state, draft), d = F.documentData(i, state.settings);
  assert.deepEqual(plain(d.totals.map(r => r.label)), ['Subtotal', 'Discount', 'Tax (10%)', 'Credit', 'Previous balance', 'Total', 'Paid · Check', 'Balance due']);
  assert.deepEqual(plain(d.totals.map(r => r.amount)), ['$100.00', '−$20.00', '$8.00', '−$5.00', '$12.00', '$95.00', '$30.00', '$65.00']);
  for (const output of [F.invoiceText(i, state.settings), F.invoiceHTML(i, state.settings)]) {
    assert.ok(output.includes('September 27, 2026')); assert.ok(output.includes('Mesa, AZ 85204')); assert.ok(!output.includes('2026-09-27'));
  }
  const html = F.invoiceHTML(i, state.settings);
  assert.match(html, /<table class="doc-items">/); assert.match(html, /<th scope="col" class="numeric">Amount/);
  assert.match(html, /<dl class="doc-totals">/); assert.match(html, /<dt>Balance due<\/dt><dd>\$65.00/);
  assert.ok(F.invoiceCSV(state).includes('2026-09-27')); assert.equal(i.date, '2026-09-27');
});

test('canvas aligns rate, amount and every total on fixed right edges, with header metadata at top right', () => {
  const { state, draft } = sample(F); Object.assign(state.customers[0], { state: 'AZ', zip: '85204' });
  draft.date = '2026-09-27'; draft.money.paymentType = 'Cash'; const i = F.saveInvoice(state, draft);
  const painted = [], ctx = { measureText: value => ({ width: value.length * 8 }), fillText(text, x, y) { painted.push({ text, x, y, align: this.textAlign }); }, fillRect() {} };
  F.invoiceCanvas(i, state.settings, 'invoice', () => ({ getContext: () => ctx }));
  const title = painted.find(p => p.text === 'INVOICE INV-0001'), date = painted.find(p => p.text === 'September 27, 2026');
  assert.equal(title.align, 'right'); assert.equal(title.x, 846); assert.equal(date.x, title.x); assert.ok(date.y < 160);
  for (const label of ['Description', 'Qty', 'Rate', 'Amount', 'Bill to', 'Mesa, AZ 85204', 'Paid · Cash', F.STAMP]) assert.ok(painted.some(p => p.text === label), label);
  const money = painted.filter(p => p.text.startsWith('$'));
  assert.ok(money.length >= 6); assert.ok(money.every(p => p.align === 'right'));
  assert.ok(money.filter(p => p.y > painted.find(p => p.text === 'Subtotal').y - 1).every(p => p.x === 846));
});

test('long invoice rows wrap in each canvas column and excessively long images still fail safely', () => {
  const { state, draft } = sample(F); draft.services[0].name = 'Long description '.repeat(40); const i = F.saveInvoice(state, draft);
  const marks = [], ctx = { measureText: value => ({ width: value.length * 9 }), fillText(text, x, y) { marks.push({ text, x, y }); }, fillRect() {} };
  F.invoiceCanvas(i, state.settings, 'invoice', () => ({ getContext: () => ctx }));
  const description = marks.filter(p => p.text.includes('Long description'));
  assert.ok(description.length > 5); assert.ok(description.every(p => p.text.length * 9 <= 385));
  assert.ok(marks.find(p => p.text === 'Subtotal').y > description.at(-1).y);
  i.notes = 'long paragraph '.repeat(10000);
  assert.throws(() => F.invoiceCanvas(i, state.settings, 'invoice', () => ({ getContext: () => ctx })), /Print \/ PDF/);
});
