// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices, $ = selector => document.querySelector(selector), e = F.esc;
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  let store, state, screen = 'home', draft, savedDraftJSON = '', selectedCustomer = '', selectedInvoice = '', variant = 'invoice', search = '', historyStatus = 'all', historyLimit = 50, reportPeriod = 'week', reportDate = F.today(), reportTech = '', draftTimer, toastTimer, logoData = '', working = false;
  const field = (label, name, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
  const textarea = (label, name, value = '', extra = '') => `<label ${extra}>${label}<textarea name="${name}">${e(value)}</textarea></label>`;
  const button = (label, action, id = '', classes = '') => `<button type="button" class="${classes}" data-action="${action}" data-id="${e(id)}">${label}</button>`;
  const empty = text => `<div class="empty">${text}</div>`;
  const heading = (title, subtitle, action = '') => `<header class="page-head"><div><span class="eyebrow">FIELD NOTEBOOK</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</header>`;
  const status = i => { const t = F.totals(i); return `<span class="badge ${t.balanceDue > 0 ? 'amber' : ''}">${t.balanceDue <= 0 ? 'Paid' : t.amountPaid > 0 ? 'Part paid' : 'Unpaid'}</span>`; };
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
  function fail(error) { $('#error').textContent = error.message || String(error); $('#error').hidden = false; }
  function busy(value) {
    working = value;
    if (value) document.body.setAttribute('aria-busy', 'true'); else document.body.removeAttribute('aria-busy');
    // Structural actions can replace form nodes. Keep focus and edits out of those
    // nodes until their save/render completes; background draft saves stay editable.
    for (const container of [$('#main'), ...document.querySelectorAll('nav'), $('#demoBanner')]) container.inert = value;
  }
  async function mutate(fn) { const result = await store.transaction(fn); state = store.state; return result; }
  function titleBusiness() { $('#businessName').textContent = state.settings.name || 'Set up your business'; document.documentElement.style.setProperty('--ink', state.settings.ink); }
  function render() {
    titleBusiness();
    if (!state.settings.name) screen = 'settings';
    const activeScreen = screen === 'customer' ? 'customers' : screen === 'document' ? 'history' : screen;
    for (const b of document.querySelectorAll('[data-screen]')) { b.setAttribute('aria-current', b.dataset.screen === activeScreen || b.dataset.screen === 'more' && ['reports', 'catalogue', 'settings'].includes(screen) ? 'page' : 'false'); b.disabled = !state.settings.name && !['settings', 'more'].includes(b.dataset.screen); }
    const views = { home: homeView, visit: visitView, customers: customersView, customer: customerView, history: historyView, document: documentView, reports: reportsView, catalogue: catalogueView, settings: settingsView, more: moreView };
    $('#main').innerHTML = (views[screen] || homeView)();
    if ($('#draftStatus')) $('#draftStatus').textContent = JSON.stringify(draft) === savedDraftJSON ? 'Draft saved locally' : 'Unsaved draft changes';
  }
  function customerRow(c, extra = '') {
    return `<div class="list-row"><div>${button(e(c.name), 'customer', c.id, 'link')}<p>${e(F.addressLines(c).join(', '))}</p>${extra}</div><div class="actions">${button('Start visit', 'start-visit', c.id, 'small')}</div></div>`;
  }
  function moreView() {
    return heading('More', 'Reports, your catalogue and business settings.') + `<section class="card more-links">${[['reports', 'Reports', 'Due work and completed stops'], ['catalogue', 'Catalogue', 'Services, materials and prices'], ['settings', 'Settings', 'Business details and backups']].map(([key, label, description]) => `<button data-screen="${key}" ${!state.settings.name && key !== 'settings' ? 'disabled' : ''}><strong>${label}</strong><small>${description}</small></button>`).join('')}</section>`;
  }
  function historyRows(invoices) {
    return invoices.length ? invoices.map(i => `<div class="list-row"><div>${button(e(i.number), 'document', i.id, 'link')} <span class="muted">${e(F.formatDate(i.date))}</span><strong>${e(i.customer.name)}</strong><p>${e(i.services.map(l => l.name).join(' · '))}</p>${i.corrections.length ? '<span class="badge">Corrected</span> ' : ''}${i.deletedAt ? '<span class="badge red">Deleted</span>' : status(i)}</div><div><strong>${F.money(F.totals(i).total)}</strong><small>${F.money(F.totals(i).balanceDue)} due</small></div></div>`).join('') : empty('No visits here yet.');
  }
  function homeView() {
    const due = F.dueReport(state), active = F.active(state.invoices), todayStops = active.filter(i => i.date === F.today());
    const unpaid = active.filter(i => F.totals(i).balanceDue > 0);
    return heading('A good day to get things done.', new Intl.DateTimeFormat(F.deviceLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()), button('＋ New visit', 'new-visit', '', 'primary')) +
      `<div class="stats"><div class="stat featured"><small>Due in the next 7 days</small><strong>${due.length}</strong></div><div class="stat"><small>Stops today</small><strong>${todayStops.length}</strong></div><div class="stat"><small>Outstanding · ${unpaid.length} invoices</small><strong>${F.money(unpaid.reduce((sum, i) => sum + F.totals(i).balanceDue, 0))}</strong></div></div>
      <div class="grid"><section class="card"><div class="card-head"><h2>Coming up</h2><span class="badge">Includes overdue</span></div>${due.length ? due.slice(0, 6).map(r => customerRow(r.customer, `<span class="badge ${r.overdue ? 'red' : 'amber'}">${r.overdue ? 'Overdue since' : 'Due'} ${e(F.formatDate(r.date, 'due'))}</span>`)).join('') : empty('All caught up. Set a service cycle on a customer to see what’s next.')}${button('Open Due report', 'due-report', '', 'small space')}</section>
      <section class="card"><div class="card-head"><h2>Recent visits</h2><span class="muted">On this device</span></div>${historyRows(active.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4))}</section></div>
      <div class="hero"><h3>Your business. Your device.</h3><p>Customer details and history stay in this browser. Export an encrypted backup regularly — clearing site data deletes your records.</p><div class="actions space">${button('Backup & settings', 'settings', '', 'small')}${button('Nearest customer', 'nearest', '', 'small')}</div></div>`;
  }
  function lineEditor(line, index, kind) {
    const root = `${kind}.${index}`;
    return `<div class="line-editor">${field('Item', `${root}.name`, line.name, 'text', 'required')}${field('Quantity', `${root}.quantity`, line.quantity, 'number', 'min="0.01" step="any" required')}${field('Unit price', `${root}.price`, line.price, 'number', 'min="0" step="0.01" required')}${field('Unit', `${root}.unit`, line.unit)}${button('Remove', 'remove-line', `${kind}:${index}`, 'small danger remove-line')}<label class="check"><input name="${root}.taxable" type="checkbox" ${line.taxable ? 'checked' : ''}>Taxable</label></div>`;
  }
  function totalsHTML(d) {
    const t = F.totals(d);
    return `<div class="totals"><div><span>Subtotal after discount</span><span>${F.money(t.subtotal)}</span></div>${t.tax ? `<div><span>Tax (${d.taxRate}%)</span><span>${F.money(t.tax)}</span></div>` : ''}${t.credit ? `<div><span>Credit</span><span>−${F.money(t.credit)}</span></div>` : ''}${t.previousBalance ? `<div><span>Previous balance</span><span>${F.money(t.previousBalance)}</span></div>` : ''}<div><span>Total</span><strong>${F.money(t.total)}</strong></div><div class="grand"><span>Balance due</span><span>${F.money(t.balanceDue)}</span></div></div>`;
  }
  function visitView() {
    draft ||= F.clone(state.draft || F.blankDraft(state.settings));
    const c = state.customers.find(c => c.id === draft.customerId), old = state.invoices.find(i => i.id === draft.id);
    const picker = key => `<div class="actions space"><label style="flex:1">Add from catalogue<select id="pick-${key}"><option value="">Choose ${key === 'services' ? 'a service' : 'a material'}…</option>${state[key].filter(i => !i.archived).map(i => `<option value="${e(i.id)}">${e(i.name)}${i.price === '' ? ' · set price' : ` · ${F.money(i.price)}`}</option>`).join('')}</select></label>${button('Add', 'add-line', key)}${button('Custom item', 'custom-line', key, 'small')}</div>`;
    return heading(old ? `Correct ${e(old.number)}` : 'Visit & invoice', 'Draft changes save automatically on this device.', button('New visit', 'new-visit', '', 'small')) +
      `<form id="visitForm"><section class="card"><div class="card-head"><h2>1. The visit</h2><span class="badge" id="draftStatus">Draft saved locally</span></div><div class="form-grid"><label class="full">Customer<select name="customerId" required><option value="">Select customer…</option>${state.customers.filter(c => !c.archived || c.id === draft.customerId).map(c => `<option value="${e(c.id)}" ${c.id === draft.customerId ? 'selected' : ''}>${e(c.name)} · ${e(F.addressLines(c).join(', '))}</option>`).join('')}</select></label>${field('Date', 'date', draft.date, 'date', 'required')}${field('Technician', 'technician', draft.technician)}${field('Punch in', 'timeIn', draft.timeIn, 'time')}${field('Punch out', 'timeOut', draft.timeOut, 'time')}</div><div class="actions space">${button('Punch in now', 'punch-in')}${button('Punch out now', 'punch-out')}${button('Same as last time', 'same-last')}${button('Nearest customer', 'nearest', '', 'small')}</div>${c?.notes ? `<div class="private-note space"><strong>Private customer notes · never on invoices</strong><br>${e(c.notes)}</div>` : ''}${!state.customers.length ? `<p class="space">${button('Add your first customer', 'add-customer', '', 'primary')}</p>` : ''}</section>
      <section class="card"><h2>2. Services & materials</h2><h3>Services</h3>${draft.services.map((l, i) => lineEditor(l, i, 'services')).join('') || '<p class="muted">Add the work you did.</p>'}${picker('services')}<h3 class="section-space">Materials used</h3>${draft.materials.map((l, i) => lineEditor(l, i, 'materials')).join('')}${picker('materials')}<div class="space">${textarea('Visit notes (visible to customer)', 'notes', draft.notes)}</div></section>
      <section class="card"><h2>3. Charges & payment</h2><div class="form-grid">${field('Discount ($)', 'money.discount', draft.money.discount, 'number', 'min="0" step="0.01"')}${field('Tax rate (%)', 'taxRate', draft.taxRate, 'number', 'min="0" max="100" step="0.001"')}${field('Credit ($)', 'money.credit', draft.money.credit, 'number', 'min="0" step="0.01"')}${field('Previous balance ($)', 'money.previousBalance', draft.money.previousBalance, 'number', 'min="0" step="0.01"')}${field('Amount paid ($)', 'money.amountPaid', draft.money.amountPaid, 'number', 'min="0" step="0.01"')}<label>Payment type<select name="money.paymentType"><option value="">Not recorded</option>${['Cash', 'Check', 'Card', 'Transfer', 'Payment app', 'Other'].map(p => `<option ${draft.money.paymentType === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>${field('Payment reference (optional)', 'money.reference', draft.money.reference || '')}</div><p class="field-help space">Recording a payment does not process it. Discounts reduce taxable and exempt lines proportionally. Credits apply after tax.</p><div id="visitTotals">${totalsHTML(draft)}</div>${old ? `<div class="space">${textarea('Correction note', 'correctionNote', draft.correctionNote || '')}</div>` : ''}<div class="actions space"><button class="primary" type="submit">${old ? 'Save correction' : 'Save invoice'} & preview</button><span class="field-help">${old ? 'Keeps its invoice number.' : 'A permanent number is assigned on save.'}</span></div></section></form>`;
  }
  function customersView() {
    const list = state.customers.filter(c => `${c.name} ${c.address} ${c.city}`.toLowerCase().includes(search.toLowerCase()));
    return heading('Customers', `${state.customers.length} customers · private notes, remembered prices and service history`, button('＋ Add customer', 'add-customer', '', 'primary')) + `<section class="card"><label class="search">Search customers<input id="search" type="search" value="${e(search)}" placeholder="Name, street or city"></label><div id="customerList">${list.map(c => customerRow(c, `<small>Next due: ${e(F.formatDate(F.nextDue(c, state.invoices)) || 'Not scheduled')}</small>`)).join('') || empty('No customers yet. Add one to start your first visit.')}</div></section>`;
  }
  function customerView() {
    const c = state.customers.find(c => c.id === selectedCustomer) || { id: '', name: '', cycle: { type: '' }, since: F.today(), prices: {} };
    const visits = F.visitsFor(state, c.id), totals = visits.reduce((sum, i) => sum + F.totals(i).total, 0);
    const strip = F.monthStrip(state, c.id);
    return heading(c.id ? e(c.name) : 'New customer', c.id ? `Customer since ${e(F.formatDate(c.since) || 'not recorded')} · Next due ${e(F.formatDate(F.nextDue(c, state.invoices)) || 'not scheduled')}` : 'A few details now. A useful history with every visit.', c.id ? button('Start visit', 'start-visit', c.id, 'primary') : '') +
      (c.id ? `<section class="card"><div class="card-head"><h2>Last 12 months</h2><strong>${F.money(strip.reduce((s, m) => s + m.total, 0))}</strong></div><div class="month-strip">${strip.map(m => `<div class="month ${m.count ? 'visited' : ''}" title="${e(F.formatDate(m.month + '-01', 'month'))} · ${F.money(m.total)}">${e(F.formatDate(m.month + '-01', 'monthShort'))}<strong>${m.count}</strong>visits</div>`).join('')}</div><p class="field-help space">${visits.length} lifetime visits · ${F.money(totals)} invoiced · ${F.money(visits.reduce((s, i) => s + F.totals(i).amountPaid, 0))} paid</p></section>` : '') +
      `<form id="customerForm" class="card"><h2>Customer details</h2><div class="form-grid">${field('Name', 'name', c.name, 'text', 'required maxlength="200"')}${field('Phone', 'phone', c.phone)}${field('Street address', 'address', c.address)}${field('City', 'city', c.city)}${field('State', 'state', c.state, 'text', 'maxlength="2"')}${field('ZIP', 'zip', c.zip)}${field('Email', 'email', c.email, 'email')}${field('Customer since', 'since', c.since, 'date')}<label>Service cycle<select name="cycle"><option value="">As needed</option><option value="monthly" ${c.cycle?.type === 'monthly' ? 'selected' : ''}>Monthly</option><option value="days" ${c.cycle?.type === 'days' ? 'selected' : ''}>Every N days</option></select></label>${field('Days between visits', 'days', c.cycle?.days || 14, 'number', 'min="1" max="3650"')}${field('Next-due override (optional)', 'nextDue', c.nextDue, 'date')}${textarea('Private notes · gate, pets, property and special instructions', 'notes', c.notes, 'class="full"')}</div><p class="field-help space">Next due advances from the latest visit. A future override takes priority until that visit is completed.</p>${c.id ? `<details><summary>Remembered prices</summary><div class="form-grid">${[...state.services, ...state.materials].map(i => field(e(i.name), `price:${i.id}`, c.prices?.[i.id] ?? '', 'number', 'min="0" step="0.01" placeholder="Use catalogue price"')).join('')}</div></details>` : ''}<div class="actions space"><button class="primary" type="submit">Save customer</button>${c.id ? button(c.location ? 'Update GPS position here' : 'Remember GPS position here', 'remember-location', c.id) : ''}${button('Back to customers', 'customers')}</div>${c.location ? '<p class="field-help space">A GPS position is saved locally for nearest-customer lookup.</p>' : ''}</form>${c.id ? `<section class="card"><h2>Service history</h2>${historyRows(visits)}</section>` : ''}`;
  }
  function historyView() {
    const result = F.invoiceHistory(state.invoices, { search, status: historyStatus, limit: historyLimit });
    const rows = invoices => invoices.map(i => { const t = F.totals(i); return `<tr><td data-label="Number">${button(e(i.number), 'document', i.id, 'link')}</td><td data-label="Date">${e(F.formatDate(i.date))}</td><td data-label="Customer">${e(i.customer.name)}</td><td data-label="Service">${e(i.services.map(l => l.name).join(' · '))}</td><td data-label="Total" class="numeric">${F.money(t.total)}</td><td data-label="Balance" class="numeric">${F.money(t.balanceDue)}</td><td data-label="Status">${i.corrections.length ? '<span class="badge">Corrected</span> ' : ''}${i.deletedAt ? '<span class="badge red">Deleted</span>' : status(i)}</td></tr>`; }).join('');
    return heading('History', 'Re-send, correct or restore any saved invoice.', button('Export invoices CSV', 'csv', '', 'small')) + `<section class="card history-controls"><label class="search">Search history<input type="search" id="search" value="${e(search)}" placeholder="Customer or invoice number"></label><label>Status<select id="historyStatus">${['all', 'unpaid', 'paid', 'corrected', 'deleted'].map(s => `<option value="${s}" ${s === historyStatus ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label><p id="historyCount" role="status">Showing ${result.count} of ${result.total} invoices</p></section>
      <div id="historyResults">${result.groups.map(g => `<section class="history-month"><h2 class="history-month-title">${e(F.formatDate(g.month + '-01', 'month'))}</h2><table class="history-table" aria-label="${e(F.formatDate(g.month + '-01', 'month'))} invoices"><thead><tr><th scope="col">Number</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col">Service</th><th scope="col" class="numeric">Total</th><th scope="col" class="numeric">Balance</th><th scope="col">Status</th></tr></thead><tbody>${rows(g.invoices)}</tbody></table></section>`).join('') || empty('No invoices match your search and status.')}</div>${result.count < result.total ? button('Show more', 'history-more', '', 'space') : ''}`;
  }
  function changeValue(value) {
    if (Array.isArray(value)) return value.map(changeValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, changeValue(val)]));
    if (typeof value === 'string' && F.dateValue(value)) return F.formatDate(value);
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return F.formatTimestamp(value);
    return value;
  }
  function documentView() {
    const i = state.invoices.find(i => i.id === selectedInvoice);
    if (!i) return heading('Invoice unavailable', 'Return to History to choose an invoice.');
    const corrections = i.corrections.map(c => `<details><summary>${e(F.formatTimestamp(c.at))} · ${e(c.note || 'Correction')}</summary>${c.fields.map(f => `<p class="correction-log"><strong>${e(f.field)}</strong><br>Before: ${e(JSON.stringify(changeValue(f.from)))}<br>After: ${e(JSON.stringify(changeValue(f.to)))}</p>`).join('')}</details>`).join('');
    return heading(e(i.number), `${e(i.customer.name)} · ${e(F.formatDate(i.date))}${i.deletedAt ? ' · Deleted' : ''}`, button('Back to History', 'history', '', 'small')) +
      `<section class="card"><div class="row"><label>Document<select id="variant"><option value="invoice" ${variant === 'invoice' ? 'selected' : ''}>Invoice</option><option value="summary" ${variant === 'summary' ? 'selected' : ''}>Visit summary (no prices)</option></select></label><div class="actions">${button('Print / PDF', 'print', '', 'primary')}${button('Share image', 'share-image')}${button('Share text', 'share-text')}${button('Email', 'email')}</div></div><div class="actions space">${i.deletedAt ? button('Restore invoice', 'restore', i.id) : button('Correct invoice', 'correct', i.id) + button('Delete invoice', 'delete', i.id, 'danger')}<small>${i.sentLog.length} share/export actions · delivery is not tracked</small></div></section>
      <div id="documentPreview">${F.invoiceHTML(i, state.settings, variant)}</div>${corrections ? `<section class="card"><h2>Change log</h2>${corrections}</section>` : ''}`;
  }
  function reportsView() {
    const due = reportPeriod === 'due', report = due ? null : F.stopsReport(state, reportPeriod, reportDate, reportTech);
    const list = due ? F.dueReport(state, reportDate, F.addDays(reportDate, 6)) : [];
    const content = due ? `<h2>${list.length} due through ${e(F.formatDate(F.addDays(reportDate, 6)))}</h2><p class="muted">Includes overdue customers. Completed visits advance the next-due date.</p>${list.map(r => customerRow(r.customer, `<span class="badge ${r.overdue ? 'red' : 'amber'}">${r.overdue ? 'Overdue since' : 'Due'} ${e(F.formatDate(r.date, 'due'))}</span>`)).join('') || empty('No customers due in this window.')}` : `<h2>${report.visits.length} stops · ${e(F.formatDate(report.start))} to ${e(F.formatDate(report.end))}</h2><p>${F.money(report.total)} invoiced · ${F.money(report.balance)} balance due</p><div class="table-wrap"><table><thead><tr><th>Date / time</th><th>Customer / city</th><th>Work</th><th>Technician</th></tr></thead><tbody>${report.visits.map(i => `<tr><td>${e(F.formatDate(i.date))}<br>${e(i.timeIn)}–${e(i.timeOut)}</td><td>${e(i.customer.name)}<br>${e(i.customer.city)}</td><td>${e([...i.services, ...i.materials].map(l => `${l.name} (${l.quantity} ${l.unit})`).join(', '))}</td><td>${e(i.technician)}</td></tr>`).join('')}</tbody></table></div>`;
    return heading('Reports', 'See the work completed and the customers coming due.', button('Print report', 'print-report', '', 'small')) + `<section class="card"><div class="form-grid"><label>Report<select id="reportPeriod">${[['day', 'Daily stops'], ['week', 'Weekly stops'], ['month', 'Monthly stops'], ['due', 'Due report']].map(([v, label]) => `<option value="${v}" ${v === reportPeriod ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Anchor date<input id="reportDate" type="date" value="${reportDate}" required></label>${!due ? `<label>Technician<select id="reportTech"><option value="">All technicians</option>${[...new Set(state.invoices.map(i => i.technician))].filter(Boolean).map(t => `<option ${t === reportTech ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>` : ''}</div></section><section class="card" id="reportContent">${content}<p class="doc-stamp">${F.STAMP}</p></section>`;
  }
  function catalogueView() {
    const starter = `<section class="card"><div class="row"><div><h2>Start with a trade</h2><p class="muted">Optional plain-name starters. Enter your own prices and tax flags.</p></div><div class="actions"><label>Trade<select id="starter">${Object.entries(F.starters).map(([key, s]) => `<option value="${key}">${s.label}</option>`).join('')}</select></label>${button('Load starter list', 'load-starter')}</div></div></section>`;
    const sections = ['services', 'materials'].map(key => {
      const items = state[key].map(i => `<form class="catalogue-item" data-kind="${key}" data-id="${e(i.id)}"><div class="line-editor">${field('Name', 'name', i.name, 'text', 'required')}${field('Unit', 'unit', i.unit || 'each')}${field('Default price', 'price', i.price, 'number', 'min="0" step="0.01" placeholder="Set price"')}<button type="submit" class="small">Save</button>${button('Remove', 'remove-item', `${key}:${i.id}`, 'small danger')}<label class="check"><input name="taxable" type="checkbox" ${i.taxable ? 'checked' : ''}>Taxable by default</label></div></form>`).join('');
      return `<section class="card"><h2>${key === 'services' ? 'Services' : 'Materials'}</h2>${items || empty('No items yet.')}${button(`＋ Add ${key === 'services' ? 'service' : 'material'}`, 'add-item', key, 'space')}</section>`;
    }).join('');
    return heading('Your catalogue', 'Set your services, materials and usual prices. Each visit can use a different price.') + starter + sections;
  }
  function settingsView() {
    const s = state.settings, first = !s.name; logoData = s.logo;
    return heading(first ? 'Make it your own.' : 'Settings', first ? 'A few details, then you’re ready for the field. Everything stays on this device.' : `${store.mode} history · Your settings are included in backups.`) +
      `<form id="settingsForm"><section class="card"><h2>Business details</h2><div class="form-grid">${field('Business name', 'name', s.name, 'text', 'required maxlength="200"')}${field('Default technician', 'technician', s.technician)}${textarea('Address lines', 'addressLines', s.addressLines.join('\n'), 'class="full"')}${field('Business phone', 'phone', s.phone)}${field('Business email', 'email', s.email, 'email')}${field('Licence / registration (optional free text)', 'registration', s.registration)}${field('Ink / accent colour', 'ink', s.ink, 'color')}<label>Logo (PNG, JPEG or WebP)<input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp"><span class="field-help">Resized and stored locally.</span></label><div><img id="logoPreview" class="logo-preview" alt="Business logo preview" ${s.logo ? `src="${e(s.logo)}"` : 'hidden'}>${button('Remove logo', 'remove-logo', '', 'small')}</div></div></section><section class="card"><h2>Invoices</h2><div class="form-grid">${field('Invoice prefix', 'prefix', s.prefix, 'text', 'maxlength="30"')}${field('Next invoice number', 'nextNumber', s.nextNumber, 'number', `min="${state.numberFloor}" max="999999999" step="1" required`)}${field('Default tax rate (%)', 'taxRate', s.taxRate, 'number', 'min="0" max="100" step="0.001"')}${textarea('Payment terms', 'terms', s.terms)}${textarea('Payment instructions', 'instructions', s.instructions)}</div><p class="field-help space">Numbers never go backwards on this device. A changed prefix keeps the sequence. Saved invoices retain their original business details.</p>${first ? `<label>Optional starter list<select name="starter"><option value="">Start with an empty catalogue</option>${Object.entries(F.starters).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>` : ''}<button class="primary space" type="submit">${first ? 'Save & start' : 'Save settings'}</button></section></form>
      <section class="card" id="backup"><h2>Backup</h2><p>Data lives in this browser. Clearing site data deletes it. Keep regular encrypted backups somewhere safe.</p><div class="backup-warning">Without a passphrase, the exported JSON is readable by anyone who has the file. A lost encryption passphrase cannot be recovered.</div><div class="form-grid space"><label>Backup passphrase (optional for export)<input id="backupPassphrase" type="password" autocomplete="new-password" placeholder="Use a long, unique passphrase"></label><label>Import backup<input id="backupFile" type="file" accept=".json,application/json"></label></div><label class="check space"><input id="restoreSettings" type="checkbox">Also restore business settings (existing records are kept)</label><div class="actions space">${button('Export backup', 'export-backup', '', 'primary')}${button('Import selected backup', 'import-backup')}${button('Export invoices CSV', 'csv')}</div><p class="field-help space">Import adds missing IDs and keeps existing records, corrections and deletions. Conflicting invoice numbers are rejected. ${demo ? 'Demo backups can only be imported into demo mode.' : 'Use backups to move data; devices do not sync.'}</p></section>`;
  }
  function formObject(form) { return Object.fromEntries(new FormData(form)); }
  function updateDraft(form) {
    for (const input of form.elements) {
      if (!input.name) continue;
      const path = input.name.split('.'); let current = draft;
      for (const part of path.slice(0, -1)) current = current[part];
      current[path.at(-1)] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? F.number(input.value) : input.value;
    }
    const c = state.customers.find(c => c.id === draft.customerId); draft.customer = c ? Object.fromEntries(['name', 'address', 'city', 'state', 'zip', 'phone', 'email'].map(k => [k, c[k] || ''])) : {};
  }
  async function saveDraft() {
    clearTimeout(draftTimer); if (!draft) return;
    const snapshot = F.clone(draft); await mutate(s => { s.draft = snapshot; });
    savedDraftJSON = JSON.stringify(snapshot);
    if ($('#draftStatus') && JSON.stringify(draft) === savedDraftJSON) $('#draftStatus').textContent = 'Draft saved locally';
  }
  async function navigate(next) { if (screen === 'visit') await saveDraft(); screen = next; search = ''; historyLimit = 50; render(); window.scrollTo(0, 0); }
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
  function currentInvoice() { const i = state.invoices.find(i => i.id === selectedInvoice); if (!i) throw new Error('Choose a saved invoice.'); return i; }
  async function recordShare(method) { await mutate(s => { const i = s.invoices.find(i => i.id === selectedInvoice); i.sentLog.push({ at: new Date().toISOString(), method, variant }); }); }
  async function getPosition() {
    if (!navigator.geolocation) throw new Error('GPS needs a supported browser and HTTPS.');
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => reject(new Error('Location unavailable or permission declined. Select a customer manually.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
  }
  async function imageForInvoice() {
    const i = currentInvoice(), b = F.cleanSettings(i.business || state.settings); let logo = null;
    if (b.logo) { logo = new Image(); logo.src = b.logo; await logo.decode(); }
    const canvas = F.invoiceCanvas(i, state.settings, variant, () => document.createElement('canvas'), logo);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image. Use Print / PDF.')), 'image/png'));
  }
  async function resizedLogo(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10000000) throw new Error('Choose a PNG, JPEG or WebP under 10 MB.');
    const url = URL.createObjectURL(file), img = new Image();
    try {
      img.src = url; await img.decode(); const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png');
    } finally { URL.revokeObjectURL(url); }
  }
  async function action(name, id) {
    if (name === 'history-more') { historyLimit += 50; const scroll = window.scrollY; render(); window.scrollTo(0, scroll); $('#main [data-action="history-more"]')?.focus({ preventScroll: true }); return; }
    if (['settings', 'customers', 'history'].includes(name)) return navigate(name);
    if (name === 'new-visit' || name === 'start-visit') {
      if (draft && (draft.services.length || draft.materials.length) && !confirm('Start a new visit and replace the current draft? Saved invoices remain in History.')) return;
      draft = F.blankDraft(state.settings, id || ''); await saveDraft(); return navigate('visit');
    }
    if (name === 'customer' || name === 'add-customer') { selectedCustomer = id; return navigate('customer'); }
    if (name === 'document') { selectedInvoice = id; variant = 'invoice'; return navigate('document'); }
    if (name === 'due-report') { reportPeriod = 'due'; return navigate('reports'); }
    if (name === 'punch-in' || name === 'punch-out') {
      const d = new Date(), time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      draft[name === 'punch-in' ? 'timeIn' : 'timeOut'] = time; await saveDraft(); render(); return;
    }
    if (name === 'same-last') { if ((draft.services.length || draft.materials.length) && !confirm('Replace the draft services and materials with the last visit?')) return; draft = F.sameAsLastTime(state, draft); await saveDraft(); render(); return; }
    if (name === 'add-line' || name === 'custom-line') {
      const item = name === 'custom-line' ? { id: '', name: '', price: 0, unit: id === 'services' ? 'visit' : 'each' } : state[id].find(i => i.id === $(`#pick-${id}`).value);
      if (!item) throw new Error('Choose a catalogue item first.');
      draft[id].push(F.catalogueLine(item, state.customers.find(c => c.id === draft.customerId))); await saveDraft(); render(); return;
    }
    if (name === 'remove-line') { const [kind, index] = id.split(':'); draft[kind].splice(Number(index), 1); await saveDraft(); render(); return; }
    if (name === 'correct') { draft = F.clone(currentInvoice()); await saveDraft(); return navigate('visit'); }
    if (name === 'delete' || name === 'restore') {
      if (name === 'delete' && !confirm('Move this invoice to deleted history? You can restore it later.')) return;
      await mutate(s => { const i = s.invoices.find(i => i.id === id); if (name === 'delete') i.deletedAt = new Date().toISOString(); else delete i.deletedAt; }); render(); return;
    }
    if (name === 'print' || name === 'print-report') {
      $('#printArea').innerHTML = name === 'print' ? F.invoiceHTML(currentInvoice(), state.settings, variant) : `<div class="document"><h1>${e(state.settings.name)}</h1>${$('#reportContent').innerHTML}</div>`;
      await Promise.all([...$('#printArea').querySelectorAll('img')].map(img => img.decode().catch(() => {}))); window.print();
      if (name === 'print') await recordShare('print/PDF'); return;
    }
    if (name === 'share-text' || name === 'email') {
      const i = currentInvoice(), text = F.invoiceText(i, state.settings, variant);
      if (name === 'email') { location.href = `mailto:${encodeURIComponent(i.customer.email || '')}?subject=${encodeURIComponent(`${variant === 'summary' ? 'Visit summary' : 'Invoice'} ${i.number}`)}&body=${encodeURIComponent(text)}`; }
      else if (navigator.share) await navigator.share({ title: i.number, text });
      else { download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFilename(i.number)}.txt`); toast('Text downloaded. Send it with your own messages or email app.'); }
      await recordShare(name); return;
    }
    if (name === 'share-image') {
      const blob = await imageForInvoice(), file = new File([blob], `${safeFilename(currentInvoice().number)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: currentInvoice().number }); else download(blob, file.name);
      await recordShare('image'); return;
    }
    if (name === 'nearest') {
      const list = F.nearestCustomers(state.customers, await getPosition());
      if (!list.length) throw new Error('No customer GPS positions yet. Open a customer while at their property and choose Remember GPS position here.');
      screen = 'nearest'; $('#main').innerHTML = heading('Nearby customers', 'Choose the right property. Distance alone does not identify a customer.') + `<section class="card">${list.map(r => customerRow(r.customer, `<span class="badge">${Math.round(r.metres)} m away</span>`)).join('')}</section>`; return;
    }
    if (name === 'remember-location') { const point = await getPosition(); await mutate(s => { s.customers.find(c => c.id === id).location = point; }); toast('GPS position saved on this device.'); return; }
    if (name === 'load-starter') { await mutate(s => F.loadStarter(s, $('#starter').value)); render(); toast('Starter list loaded. Set your prices before invoicing.'); return; }
    if (name === 'add-item') { await mutate(s => s[id].push({ id: F.uid(), name: 'New item', unit: id === 'services' ? 'visit' : 'each', price: '', taxable: false })); render(); return; }
    if (name === 'remove-item') { const [kind, item] = id.split(':'); if (!confirm('Remove this catalogue item? Saved visit details are kept.')) return; await mutate(s => { s[kind] = s[kind].filter(i => i.id !== item); }); render(); return; }
    if (name === 'remove-logo') { logoData = ''; $('#logoPreview').hidden = true; return; }
    if (name === 'csv') { download(new Blob([F.invoiceCSV(state)], { type: 'text/csv;charset=utf-8' }), 'invoices.csv'); toast('Invoice CSV downloaded.'); return; }
    if (name === 'export-backup') {
      const passphrase = $('#backupPassphrase').value;
      if (!passphrase && !confirm('Export an unencrypted backup? Anyone with the file can read customer details and private notes.')) return;
      const payload = await F.encryptBackup(F.buildBackup(await store.read(), demo), passphrase);
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `field-invoices-${demo ? 'demo-' : ''}${F.today()}${passphrase ? '-encrypted' : ''}.json`); $('#backupPassphrase').value = ''; toast('Backup downloaded. Store it safely.'); return;
    }
    if (name === 'import-backup') {
      const file = $('#backupFile').files[0]; if (!file) throw new Error('Choose a backup file first.');
      if (file.size > 50000000) throw new Error('Backup exceeds the 50 MB import limit.');
      const payload = await F.decodeBackup(await file.text(), $('#backupPassphrase').value), options = { demo, restoreSettings: $('#restoreSettings').checked };
      F.mergeBackup(F.clone(state), payload, options);
      if (!confirm('Merge this backup? Missing records will be added. Existing IDs will be kept.')) return;
      const counts = await mutate(s => F.mergeBackup(s, payload, options)); draft = null; render(); toast(`Imported ${counts.customers} customers and ${counts.invoices} invoices.`); return;
    }
    if (name === 'reset-demo') { if (!confirm('Reset all demo edits and start fresh?')) return; await store.resetDemo(); state = store.state; draft = null; screen = 'home'; render(); return; }
  }
  const safeFilename = value => String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'invoice';
  document.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target || working) return;
    const nav = target.dataset.screen, name = target.dataset.action; if (!nav && !name) return;
    busy(true); target.disabled = true; $('#error').hidden = true;
    try { if (screen === 'visit') { if ($('#visitForm')) updateDraft($('#visitForm')); await saveDraft(); } if (nav) await navigate(nav); else await action(name, target.dataset.id || ''); }
    catch (error) { if (error.name !== 'AbortError') fail(error); }
    finally { busy(false); target.disabled = false; }
  });
  document.addEventListener('input', event => {
    if (event.target.closest('#visitForm')) {
      updateDraft($('#visitForm')); $('#visitTotals').innerHTML = totalsHTML(draft); $('#draftStatus').textContent = 'Saving draft…'; clearTimeout(draftTimer);
      draftTimer = setTimeout(() => saveDraft().catch(fail), 250);
    }
    if (event.target.id === 'search') {
      const pos = event.target.selectionStart; search = event.target.value; historyLimit = 50; render(); $('#search').focus(); if ($('#search').type !== 'search') return; try { $('#search').setSelectionRange(pos, pos); } catch {}
    }
  });
  document.addEventListener('change', async event => {
    try {
      const el = event.target;
      if (el.name === 'customerId' && screen === 'visit') { updateDraft($('#visitForm')); await saveDraft(); render(); }
      if (el.id === 'historyStatus') { historyStatus = el.value; historyLimit = 50; render(); $('#historyStatus').focus(); }
      if (el.id === 'variant') { variant = el.value; render(); }
      if (el.id === 'reportPeriod') { reportPeriod = el.value; render(); }
      if (el.id === 'reportDate' && F.dateValue(el.value)) { reportDate = el.value; render(); }
      if (el.id === 'reportTech') { reportTech = el.value; render(); }
      if (el.id === 'logoFile') { logoData = await resizedLogo(el.files[0]); $('#logoPreview').src = logoData; $('#logoPreview').hidden = false; }
    } catch (error) { fail(error); }
  });
  document.addEventListener('submit', async event => {
    event.preventDefault(); if (working) return; busy(true); $('#error').hidden = true;
    const form = event.target, submit = form.querySelector('[type=submit]'); if (submit) submit.disabled = true;
    try {
      const data = formObject(form);
      if (form.id === 'settingsForm') {
        const first = !state.settings.name;
        await mutate(s => { s.settings = F.cleanSettings({ ...s.settings, ...data, addressLines: data.addressLines.split('\n').filter(Boolean), logo: logoData, nextNumber: Math.max(s.numberFloor, F.number(data.nextNumber)) }); s.numberFloor = s.settings.nextNumber; if (data.starter) F.loadStarter(s, data.starter); });
        screen = first ? 'home' : 'settings'; render(); toast('Business settings saved.');
      }
      if (form.id === 'customerForm') {
        const id = selectedCustomer || F.uid();
        await mutate(s => {
          const old = s.customers.find(c => c.id === id) || {}, prices = { ...(old.prices || {}) };
          for (const [key, value] of Object.entries(data)) if (key.startsWith('price:')) { if (value === '') delete prices[key.slice(6)]; else prices[key.slice(6)] = F.number(value); }
          const customer = { ...old, id, prices, ...Object.fromEntries(['name', 'phone', 'email', 'address', 'city', 'state', 'zip', 'since', 'notes', 'nextDue'].map(k => [k, String(data[k] || '').trim()])), cycle: { type: data.cycle, days: Math.max(1, F.number(data.days)) } };
          if (!customer.name) throw new Error('Enter a customer name.'); s.customers = s.customers.filter(c => c.id !== id).concat(customer);
        }); selectedCustomer = id; render(); toast('Customer saved.');
      }
      if (form.id === 'visitForm') {
        clearTimeout(draftTimer); updateDraft(form); const snapshot = F.clone(draft);
        const invoice = await mutate(s => F.saveInvoice(s, snapshot, data.correctionNote || ''));
        draft = null; selectedInvoice = invoice.id; screen = 'document'; variant = 'invoice'; render(); toast(`${invoice.number} saved.`);
      }
      if (form.classList.contains('catalogue-item')) {
        await mutate(s => { const item = s[form.dataset.kind].find(i => i.id === form.dataset.id); Object.assign(item, { name: data.name.trim(), unit: data.unit.trim(), price: data.price === '' ? '' : F.number(data.price), taxable: data.taxable === 'on' }); }); toast('Catalogue item saved.');
      }
    } catch (error) { fail(error); } finally { busy(false); if (submit) submit.disabled = false; }
  });
  $('#error').addEventListener('click', () => { $('#error').hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'visit') saveDraft().catch(fail); });
  function connection() { $('#connection').textContent = navigator.onLine ? 'Ready for the field' : 'Working offline'; }
  window.addEventListener('online', connection); window.addEventListener('offline', connection);
  async function init() {
    busy(true);
    $('#demoBanner').hidden = !demo; connection();
    store = new F.Storage({ localStorage, indexedDB: globalThis.indexedDB, locks: navigator.locks, demo });
    state = await store.init();
    savedDraftJSON = JSON.stringify(state.draft);
    if (demo && !state.demoSeeded) { await store.resetDemo(); state = store.state; }
    render();
    busy(false);
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register(new URL('../sw.js', new URL('./app/', location.href)), { scope: './' }); }
      catch { toast('Offline installation unavailable. Use HTTPS or the local server.'); }
    }
  }
  init().catch(error => { busy(false); $('#main').innerHTML = '<h1>Storage needs attention</h1><p>Records were not overwritten. Keep this browser’s site data. Close other tabs and reopen the app, or restore a backup in a fresh browser.</p>'; fail(error); });
})();
