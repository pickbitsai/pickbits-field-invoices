// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices = {};
  const STAMP = 'Made with PickBits Field Invoices', SCHEMA = 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => crypto.randomUUID();
  const number = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const cents = value => Math.round((number(value) + Number.EPSILON) * 100);
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function dateValue(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const d = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value ? d : null;
  }
  const deviceLocale = () => globalThis.navigator?.language || 'en-US';
  function formatDate(value, style = 'short', locale = deviceLocale()) {
    const d = dateValue(value);
    if (!d) return '';
    const options = { timeZone: 'UTC', month: style === 'long' || style === 'month' ? 'long' : 'short' };
    if (style !== 'month' && style !== 'monthShort') options.day = 'numeric';
    if (style !== 'due') options.year = style === 'monthShort' ? '2-digit' : 'numeric';
    return new Intl.DateTimeFormat(locale, options).format(d);
  }
  function formatTimestamp(value, locale = deviceLocale()) {
    const d = new Date(value);
    return Number.isFinite(+d) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '';
  }
  function addressLines(customer = {}) {
    const locality = [customer.city, customer.state].filter(Boolean).join(', ');
    return [customer.address, [locality, customer.zip].filter(Boolean).join(' ')].filter(Boolean);
  }
  const iso = d => d.toISOString().slice(0, 10);
  function addDays(day, n) { const d = dateValue(day); if (!d) return ''; d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function addMonth(day) {
    const d = dateValue(day); if (!d) return '';
    const dayOfMonth = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dayOfMonth, last)); return iso(d);
  }
  const defaults = () => ({ name: '', addressLines: [], phone: '', email: '', registration: '', logo: '', ink: '#195b49', prefix: 'INV-', nextNumber: 1, taxRate: 0, terms: 'Payment due on receipt.', instructions: '', technician: '' });
  function cleanSettings(input = {}) {
    const s = { ...defaults(), ...clone(input) };
    for (const key of ['name', 'phone', 'email', 'registration', 'prefix', 'terms', 'instructions', 'technician']) s[key] = String(s[key] || '').slice(0, 4000);
    s.addressLines = (Array.isArray(s.addressLines) ? s.addressLines : []).map(String).slice(0, 8);
    s.ink = /^#[a-f0-9]{6}$/i.test(s.ink) ? s.ink : '#195b49';
    s.logo = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s.logo || '') && s.logo.length < 800000 ? s.logo : '';
    s.nextNumber = Math.max(1, Math.floor(number(s.nextNumber)));
    s.taxRate = Math.min(100, Math.max(0, number(s.taxRate)));
    return s;
  }
  function emptyState() { return { schema: SCHEMA, settings: defaults(), customers: [], services: [], materials: [], invoices: [], draft: null, numberFloor: 1, usedNumbers: [], revision: 0 }; }
  function mergeById(current, incoming) {
    const result = clone(current), ids = new Set(result.map(item => item.id));
    for (const item of incoming) if (!ids.has(item.id)) { result.push(clone(item)); ids.add(item.id); }
    return result;
  }
  function normalizeInvoice(value) {
    const d = clone(value);
    for (const key of ['services', 'materials', 'corrections', 'sentLog']) if (d[key] != null && !Array.isArray(d[key])) throw new Error(`Invalid invoice ${key}.`);
    for (const key of ['customer', 'money']) if (d[key] != null && (typeof d[key] !== 'object' || Array.isArray(d[key]))) throw new Error(`Invalid invoice ${key}.`);
    d.customer = d.customer || {};
    d.services = Array.isArray(d.services) ? d.services : [];
    d.materials = Array.isArray(d.materials) ? d.materials : [];
    for (const line of [...d.services, ...d.materials]) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) throw new Error('Invalid invoice line.');
      line.name = String(line.name || line.label || 'Unnamed item');
      line.quantity = line.quantity == null ? 1 : number(line.quantity);
      line.price = number(line.price); line.taxable = line.taxable === true;
    }
    d.money = { discount: 0, credit: 0, previousBalance: 0, amountPaid: 0, paymentType: '', ...(d.money || {}) };
    d.taxRate = number(d.taxRate); d.corrections ||= []; d.sentLog ||= [];
    for (const key of ['notes', 'technician', 'date', 'timeIn', 'timeOut']) d[key] = String(d[key] || '');
    return d;
  }
  function reserveNumber(state) {
    let n = Math.max(state.numberFloor, state.settings.nextNumber);
    const used = new Set([...state.usedNumbers, ...state.invoices.map(i => i.number).filter(Boolean)]);
    let label;
    do { if (!Number.isSafeInteger(n) || n > 999999999) throw new Error('Invoice number limit reached.'); label = state.settings.prefix + String(n++).padStart(4, '0'); } while (used.has(label));
    state.numberFloor = state.settings.nextNumber = n; state.usedNumbers.push(label);
    return { number: label, sequence: n - 1 };
  }
  function migrate(input = {}) {
    if (number(input.schema) > SCHEMA) throw new Error('This data needs a newer version of the app.');
    const state = { ...emptyState(), ...clone(input), schema: SCHEMA };
    state.settings = cleanSettings(state.settings);
    for (const key of ['customers', 'services', 'materials', 'invoices']) {
      if (!Array.isArray(state[key]) || state[key].some(item => !item || typeof item.id !== 'string' || !item.id)) throw new Error(`Invalid ${key} records.`);
      state[key] = mergeById([], state[key]);
    }
    state.invoices = state.invoices.map(normalizeInvoice);
    state.usedNumbers = Array.isArray(state.usedNumbers) ? state.usedNumbers.filter(n => typeof n === 'string') : [];
    state.numberFloor = Math.max(1, number(state.numberFloor), state.settings.nextNumber, ...state.invoices.map(i => number(i.sequence) + 1));
    for (const inv of state.invoices) if (inv.number?.startsWith(state.settings.prefix)) {
      const suffix = inv.number.slice(state.settings.prefix.length);
      if (/^\d+$/.test(suffix)) state.numberFloor = Math.max(state.numberFloor, Number(suffix) + 1);
    }
    state.settings.nextNumber = state.numberFloor;
    for (const inv of state.invoices) if (!inv.number) Object.assign(inv, reserveNumber(state));
    const numbers = new Set();
    for (const i of state.invoices) { if (typeof i.number !== 'string' || numbers.has(i.number)) throw new Error('Duplicate or invalid invoice number.'); numbers.add(i.number); }
    state.usedNumbers = [...new Set([...state.usedNumbers, ...numbers])];
    return state;
  }
  function totals(data) {
    const lines = [...(data.services || []), ...(data.materials || [])];
    const amounts = lines.map(l => cents(number(l.quantity ?? 1) * number(l.price)));
    const raw = amounts.reduce((a, b) => a + b, 0);
    const discount = Math.min(raw, Math.max(0, cents(data.money?.discount)));
    const taxable = amounts.reduce((sum, value, i) => sum + (lines[i].taxable ? value : 0), 0);
    const subtotal = raw - discount;
    // Allocate the invoice discount proportionally across taxable and exempt lines.
    const tax = Math.round((raw ? taxable * subtotal / raw : 0) * Math.min(100, Math.max(0, number(data.taxRate))) / 100);
    const credit = cents(data.money?.credit), previousBalance = cents(data.money?.previousBalance), amountPaid = cents(data.money?.amountPaid);
    const total = subtotal + tax - credit + previousBalance;
    return Object.fromEntries(Object.entries({ raw, discount, subtotal, tax, credit, previousBalance, total, amountPaid, balanceDue: total - amountPaid }).map(([k, v]) => [k, v / 100]));
  }
  const active = invoices => invoices.filter(i => !i.deletedAt);
  function invoiceHistory(invoices, { search = '', status = 'all', limit = 50 } = {}) {
    const query = search.trim().toLocaleLowerCase();
    const matches = invoices.filter(i => {
      if (status === 'deleted' ? !i.deletedAt : i.deletedAt) return false;
      if (status === 'corrected' && !i.corrections?.length) return false;
      if (status === 'paid' && totals(i).balanceDue > 0) return false;
      if (status === 'unpaid' && totals(i).balanceDue <= 0) return false;
      return `${i.number} ${i.customer.name}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => b.date.localeCompare(a.date) || b.sequence - a.sequence);
    const visible = matches.slice(0, limit), groups = [];
    for (const invoice of visible) {
      const month = invoice.date.slice(0, 7);
      if (groups.at(-1)?.month !== month) groups.push({ month, invoices: [] });
      groups.at(-1).invoices.push(invoice);
    }
    return { groups, count: visible.length, total: matches.length };
  }
  const visitsFor = (state, id) => active(state.invoices).filter(i => i.customerId === id).sort((a, b) => b.date.localeCompare(a.date) || String(b.savedAt).localeCompare(String(a.savedAt)));
  function nextDue(customer, invoices) {
    const last = active(invoices).filter(i => i.customerId === customer.id && dateValue(i.date)).map(i => i.date).sort().at(-1);
    if (customer.nextDue && (!last || customer.nextDue > last)) return customer.nextDue;
    const base = last || customer.since;
    if (!base) return customer.nextDue || '';
    if (customer.cycle?.type === 'monthly') return last ? addMonth(base) : base;
    if (customer.cycle?.type === 'days') return last ? addDays(base, Math.max(1, number(customer.cycle.days))) : base;
    return '';
  }
  function dueReport(state, start = today(), end = addDays(start, 6)) {
    return state.customers.filter(c => !c.archived).map(customer => ({ customer, date: nextDue(customer, state.invoices) })).filter(r => r.date && r.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.customer.name.localeCompare(b.customer.name)).map(r => ({ ...r, overdue: r.date < start }));
  }
  function stopsReport(state, period, anchor = today(), technician = '') {
    const d = dateValue(anchor); if (!d) throw new Error('Choose a valid report date.');
    let start = anchor, end = anchor;
    if (period === 'week') { start = addDays(anchor, -((d.getUTCDay() + 6) % 7)); end = addDays(start, 6); }
    if (period === 'month') { start = anchor.slice(0, 7) + '-01'; end = addDays(addMonth(start), -1); }
    const visits = active(state.invoices).filter(i => i.date >= start && i.date <= end && (!technician || i.technician === technician)).sort((a, b) => a.date.localeCompare(b.date) || a.timeIn.localeCompare(b.timeIn));
    return { start, end, visits, total: visits.reduce((sum, i) => sum + totals(i).total, 0), balance: visits.reduce((sum, i) => sum + totals(i).balanceDue, 0) };
  }
  function monthStrip(state, id, anchor = today()) {
    const d = dateValue(anchor); d.setUTCDate(1);
    return Array.from({ length: 12 }, (_, i) => {
      const m = new Date(d); m.setUTCMonth(m.getUTCMonth() - 11 + i); const month = iso(m).slice(0, 7);
      const visits = visitsFor(state, id).filter(v => v.date.startsWith(month));
      return { month, count: visits.length, total: visits.reduce((sum, v) => sum + totals(v).total, 0) };
    });
  }
  function blankDraft(settings = defaults(), customerId = '') {
    return normalizeInvoice({ id: uid(), customerId, customer: {}, date: today(), timeIn: '', timeOut: '', technician: settings.technician, taxRate: settings.taxRate, services: [], materials: [], notes: '', money: {} });
  }
  function catalogueLine(item, customer = {}) {
    return { id: uid(), itemId: item.id, name: item.name, unit: item.unit || 'visit', quantity: 1, price: number(customer.prices?.[item.id] ?? item.price), taxable: item.taxable === true };
  }
  function sameAsLastTime(state, draft) {
    const previous = visitsFor(state, draft.customerId).find(i => i.id !== draft.id);
    if (!previous) throw new Error('This customer has no previous visit.');
    const customer = state.customers.find(c => c.id === draft.customerId) || {}, copy = clone(draft);
    for (const key of ['services', 'materials']) copy[key] = previous[key].map(line => {
      const item = state[key].find(i => i.id === line.itemId);
      return { ...clone(line), id: uid(), price: number(customer.prices?.[line.itemId] ?? item?.price ?? line.price) };
    });
    return copy;
  }
  const correctionKeys = ['date', 'timeIn', 'timeOut', 'technician', 'customer', 'services', 'materials', 'notes', 'money', 'taxRate'];
  function correctionFields(before, after) {
    return correctionKeys.filter(k => JSON.stringify(before[k] ?? '') !== JSON.stringify(after[k] ?? '')).map(field => ({ field, from: clone(before[field] ?? ''), to: clone(after[field] ?? '') }));
  }
  function validateInvoice(draft) {
    if (!draft.customerId || !draft.customer?.name?.trim()) throw new Error('Select a customer before saving.');
    if (!dateValue(draft.date)) throw new Error('Enter a valid visit date.');
    if (![...draft.services, ...draft.materials].length) throw new Error('Add at least one service or material.');
    for (const l of [...draft.services, ...draft.materials]) if (!l.name.trim() || !Number.isFinite(Number(l.quantity)) || number(l.quantity) <= 0 || !Number.isFinite(Number(l.price)) || number(l.price) < 0) throw new Error('Lines need a name, positive quantity and non-negative price.');
    for (const key of ['discount', 'credit', 'previousBalance', 'amountPaid']) if (number(draft.money[key]) < 0) throw new Error('Enter non-negative charge adjustments.');
    if (number(draft.taxRate) < 0 || number(draft.taxRate) > 100) throw new Error('Tax rate must be between 0 and 100.');
    if (draft.timeIn && draft.timeOut && draft.timeOut < draft.timeIn) throw new Error('Punch out must be after punch in on the same day.');
  }
  function saveInvoice(state, draft, note = '') {
    const old = state.invoices.find(i => i.id === draft.id), customer = state.customers.find(c => c.id === draft.customerId);
    const invoice = normalizeInvoice(draft);
    if (!customer) throw new Error('Customer no longer exists.');
    invoice.customer = Object.fromEntries(['name', 'address', 'city', 'state', 'zip', 'phone', 'email'].map(k => [k, String(customer[k] || '')]));
    validateInvoice(invoice);
    if (old?.deletedAt) throw new Error('Restore this invoice before correcting it.');
    if (old && (draft.savedAt !== old.savedAt || (draft.revision || 0) !== (old.revision || 0))) throw new Error('This invoice changed in another tab. Reopen it before saving.');
    const now = new Date().toISOString();
    if (old) {
      invoice.number = old.number; invoice.sequence = old.sequence; invoice.business = clone(old.business || state.settings);
      invoice.corrections = clone(old.corrections); invoice.sentLog = clone(old.sentLog);
      const fields = correctionFields(old, invoice);
      if (fields.length || note.trim()) invoice.corrections.push({ id: uid(), at: now, note: note.trim(), fields });
    } else { Object.assign(invoice, reserveNumber(state)); invoice.business = clone(state.settings); invoice.createdAt = now; }
    invoice.savedAt = now;
    invoice.revision = (old?.revision || 0) + 1;
    state.invoices = state.invoices.filter(i => i.id !== invoice.id).concat(invoice);
    if (visitsFor(state, customer.id)[0]?.id === invoice.id) {
      customer.prices ||= {};
      for (const line of [...invoice.services, ...invoice.materials]) if (line.itemId) customer.prices[line.itemId] = number(line.price);
    }
    state.draft = null;
    return invoice;
  }
  const starters = {
    lawn: { label: 'Lawn care', services: ['Mow and edge', 'Hedge trim', 'Seasonal cleanup'], materials: [['Mulch', 'bag'], ['Seed', 'lb']] },
    pest: { label: 'Pest control', services: ['Property inspection', 'Routine pest service', 'Follow-up visit'], materials: [['Monitoring supplies', 'each']] },
    pool: { label: 'Pool', services: ['Pool cleaning', 'Filter cleaning', 'Equipment inspection'], materials: [['Filter cartridge', 'each']] },
    cleaning: { label: 'House cleaning', services: ['Routine cleaning', 'Deep cleaning', 'Move-out cleaning'], materials: [['Cleaning supplies', 'each']] }
  };
  function loadStarter(state, trade) {
    const list = starters[trade]; if (!list) return;
    for (const key of ['services', 'materials']) {
      const records = list[key].map((v, i) => ({ id: `starter-${trade}-${key}-${i}`, name: Array.isArray(v) ? v[0] : v, unit: Array.isArray(v) ? v[1] : 'visit', price: '', taxable: false }));
      state[key] = mergeById(state[key], records);
    }
  }
  function distanceMetres(a, b) {
    const rad = v => v * Math.PI / 180, lat = rad(b.latitude - a.latitude), lng = rad(b.longitude - a.longitude);
    const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - Math.min(1, h)));
  }
  function validLocation(p) { return p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180; }
  function nearestCustomers(customers, point) {
    if (!validLocation(point)) throw new Error('Location is unavailable.');
    return customers.filter(c => validLocation(c.location) && !c.archived).map(customer => ({ customer, metres: distanceMetres(point, customer.location) })).sort((a, b) => a.metres - b.metres).slice(0, 5);
  }
  Object.assign(F, { STAMP, SCHEMA, clone, uid, number, cents, money, esc, today, dateValue, deviceLocale, formatDate, formatTimestamp, addressLines, invoiceHistory, addDays, addMonth, defaults, cleanSettings, emptyState, mergeById, normalizeInvoice, reserveNumber, migrate, totals, active, visitsFor, nextDue, dueReport, stopsReport, monthStrip, blankDraft, catalogueLine, sameAsLastTime, correctionFields, validateInvoice, saveInvoice, starters, loadStarter, distanceMetres, validLocation, nearestCustomers });
})();
