// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
(() => {
  const F = globalThis.FieldInvoices;
  function documentData(invoice, settings, variant = 'invoice') {
    const business = F.cleanSettings(invoice.business || settings), summary = variant === 'summary', t = F.totals(invoice);
    const items = [...(invoice.services || []), ...(invoice.materials || [])].map(l => ({
      description: l.name + (!summary && l.taxable ? ' (taxable)' : ''),
      quantity: `${l.quantity ?? 1} ${l.unit || 'each'}`, rate: F.money(l.price),
      amount: F.money(F.cents(F.number(l.quantity ?? 1) * F.number(l.price)) / 100)
    }));
    const totals = summary ? [] : [
      { label: 'Subtotal', amount: F.money(t.raw) },
      ...(t.discount ? [{ label: 'Discount', amount: `−${F.money(t.discount)}` }] : []),
      ...(t.tax ? [{ label: `Tax (${invoice.taxRate}%)`, amount: F.money(t.tax) }] : []),
      ...(t.credit ? [{ label: 'Credit', amount: `−${F.money(t.credit)}` }] : []),
      ...(t.previousBalance ? [{ label: 'Previous balance', amount: F.money(t.previousBalance) }] : []),
      { label: 'Total', amount: F.money(t.total), emphasis: true },
      { label: `Paid${invoice.money?.paymentType ? ` · ${invoice.money.paymentType}` : ''}${invoice.money?.reference ? ` · ${invoice.money.reference}` : ''}`, amount: F.money(t.amountPaid) },
      { label: 'Balance due', amount: F.money(t.balanceDue), emphasis: true }
    ];
    return { business, summary, items, totals, title: `${summary ? 'VISIT SUMMARY' : 'INVOICE'} ${invoice.number || 'DRAFT — number assigned on save'}`, date: F.formatDate(invoice.date, 'long'),
      contacts: [...business.addressLines, business.phone, business.email, business.registration].filter(Boolean),
      customer: [invoice.customer?.name || 'Customer', ...F.addressLines(invoice.customer), invoice.customer?.phone, invoice.customer?.email].filter(Boolean),
      visit: `Technician: ${invoice.technician || 'Not entered'} | In: ${invoice.timeIn || '—'} | Out: ${invoice.timeOut || '—'}` };
  }
  function documentRows(invoice, settings, variant = 'invoice') {
    const d = documentData(invoice, settings, variant), b = d.business;
    const rows = [{ kind: 'business', text: b.name }, ...d.contacts.map(text => ({ kind: 'small', text })), { kind: 'title', text: d.title }];
    if (invoice.corrections?.length) rows.push({ kind: 'corrected', text: 'Corrected' });
    rows.push({ kind: 'text', text: `Date: ${d.date}` }, { kind: 'heading', text: 'Bill to' }, ...d.customer.map(text => ({ kind: 'text', text })), { kind: 'small', text: d.visit });
    rows.push({ kind: 'heading', text: d.summary ? 'Description | Qty' : 'Description | Qty | Rate | Amount' });
    for (const l of d.items) rows.push({ kind: 'line', text: `${l.description} | ${l.quantity}${d.summary ? '' : ` | ${l.rate} | ${l.amount}`}` });
    for (const r of d.totals) rows.push({ kind: 'total', text: `${r.label}: ${r.amount}` });
    if (invoice.notes) rows.push({ kind: 'heading', text: 'Visit notes' }, { kind: 'text', text: invoice.notes });
    if (!d.summary) for (const text of [b.terms, b.instructions].filter(Boolean)) rows.push({ kind: 'text', text });
    rows.push({ kind: 'stamp', text: F.STAMP });
    return { business: b, rows };
  }
  function invoiceText(invoice, settings, variant) { return documentRows(invoice, settings, variant).rows.map(r => r.text).join('\n'); }
  function invoiceHTML(invoice, settings, variant) {
    const d = documentData(invoice, settings, variant), { business } = d, e = F.esc;
    const logo = business.logo ? `<img class="document-logo" src="${F.esc(business.logo)}" alt="Business logo">` : '';
    return `<article class="document" style="--doc-ink:${business.ink}">
      <header class="doc-header"><div>${logo}<div class="doc-business">${e(business.name)}</div>${d.contacts.map(t => `<div class="doc-small">${e(t)}</div>`).join('')}</div><div class="doc-meta"><div class="doc-title">${e(d.title)}</div><div class="doc-date">${e(d.date)}</div>${invoice.corrections?.length ? '<div class="doc-corrected">Corrected</div>' : ''}</div></header>
      <section class="doc-bill-to"><div class="doc-heading">Bill to</div>${d.customer.map((t, n) => `<div class="${n ? 'doc-text' : 'doc-customer'}">${e(t)}</div>`).join('')}</section>
      <p class="doc-small doc-visit">${e(d.visit)}</p>
      <table class="doc-items"><thead><tr><th scope="col">Description</th><th scope="col" class="numeric">Qty</th>${d.summary ? '' : '<th scope="col" class="numeric">Rate</th><th scope="col" class="numeric">Amount</th>'}</tr></thead><tbody>${d.items.map(l => `<tr><td>${e(l.description)}</td><td class="numeric">${e(l.quantity)}</td>${d.summary ? '' : `<td class="numeric">${e(l.rate)}</td><td class="numeric">${e(l.amount)}</td>`}</tr>`).join('')}</tbody></table>
      ${d.totals.length ? `<dl class="doc-totals">${d.totals.map(r => `<div${r.emphasis ? ' class="doc-emphasis"' : ''}><dt>${e(r.label)}</dt><dd>${e(r.amount)}</dd></div>`).join('')}</dl>` : ''}
      ${invoice.notes ? `<section class="doc-notes"><div class="doc-heading">Visit notes</div><div class="doc-text">${e(invoice.notes)}</div></section>` : ''}
      ${d.summary ? '' : `<div class="doc-terms">${[business.terms, business.instructions].filter(Boolean).map(t => `<div class="doc-text">${e(t)}</div>`).join('')}</div>`}
      <div class="doc-stamp">${e(F.STAMP)}</div></article>`;
  }
  function wrapText(ctx, text, width) {
    const result = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width <= width) { line = next; continue; }
        if (line) result.push(line);
        line = '';
        // Split unbroken words too, so imported content cannot run off the image.
        for (const char of word) { if (ctx.measureText(line + char).width > width && line) { result.push(line); line = ''; } line += char; }
      }
      result.push(line);
    }
    return result;
  }
  function canvasLayout(ctx, invoice, settings, variant, draw = false, logo = null) {
    const d = documentData(invoice, settings, variant), { business } = d, width = 900, margin = 54, right = width - margin;
    let y = 48;
    ctx.textBaseline = 'top';
    function text(value, x, top, available, size = 20, bold = false, align = 'left') {
      ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`; ctx.textAlign = align;
      ctx.fillStyle = bold ? business.ink : '#23352f';
      const lines = wrapText(ctx, value, available);
      const bottom = top + lines.length * size * 1.4;
      if (bottom > 15000) throw new Error('This document is too long for one image. Use Print / PDF instead.');
      if (draw) lines.forEach((line, n) => ctx.fillText(line, x, top + n * size * 1.4));
      return bottom;
    }
    function rule(top, x = margin) { if (draw) { ctx.fillStyle = '#dce3d9'; ctx.fillRect(x, top, right - x, 1); } }
    let leftBottom = y;
    if (logo) { const scale = Math.min(220 / logo.width, 100 / logo.height); if (draw) ctx.drawImage(logo, margin, y, logo.width * scale, logo.height * scale); leftBottom += logo.height * scale + 20; }
    leftBottom = text(business.name, margin, leftBottom, 420, 28, true) + 8;
    for (const contact of d.contacts) leftBottom = text(contact, margin, leftBottom, 420, 16) + 3;
    let metaBottom = text(d.title, right, y, 330, 24, true, 'right') + 10;
    metaBottom = text(d.date, right, metaBottom, 330, 18, false, 'right');
    if (invoice.corrections?.length) metaBottom = text('Corrected', right, metaBottom + 8, 330, 18, true, 'right');
    y = Math.max(leftBottom, metaBottom) + 24; rule(y); y += 20;
    y = text('Bill to', margin, y, right - margin, 18, true) + 6;
    d.customer.forEach((line, n) => { y = text(line, margin, y, right - margin, 18, n === 0) + 2; });
    y = text(d.visit, margin, y + 18, right - margin, 16) + 22;
    const columns = d.summary ? [
      { key: 'description', label: 'Description', x: margin, width: 580, align: 'left' },
      { key: 'quantity', label: 'Qty', x: right, width: 170, align: 'right' }
    ] : [
      { key: 'description', label: 'Description', x: margin, width: 385, align: 'left' },
      { key: 'quantity', label: 'Qty', x: 566, width: 100, align: 'right' },
      { key: 'rate', label: 'Rate', x: 704, width: 112, align: 'right' },
      { key: 'amount', label: 'Amount', x: right, width: 120, align: 'right' }
    ];
    y = Math.max(...columns.map(c => text(c.label, c.x, y, c.width, 17, true, c.align))) + 10; rule(y);
    for (const item of d.items) { y += 12; y = Math.max(...columns.map(c => text(item[c.key], c.x, y, c.width, 19, false, c.align))) + 12; rule(y); }
    if (d.totals.length) y += 18;
    for (const r of d.totals) {
      if (r.emphasis) { rule(y, 452); y += 9; }
      y = Math.max(text(r.label, 452, y, 238, 19, r.emphasis), text(r.amount, right, y, 138, 19, r.emphasis, 'right')) + 10;
    }
    if (invoice.notes) { y = text('Visit notes', margin, y + 18, right - margin, 18, true) + 6; y = text(invoice.notes, margin, y, right - margin, 18); }
    if (!d.summary) for (const line of [business.terms, business.instructions].filter(Boolean)) y = text(line, margin, y + 18, right - margin, 17);
    y += 28; rule(y); y = text(F.STAMP, margin, y + 18, right - margin, 14);
    return { width, height: Math.ceil(y + 50) };
  }
  function invoiceCanvas(invoice, settings, variant, createCanvas, logo = null) {
    const canvas = createCanvas(), size = canvasLayout(canvas.getContext('2d'), invoice, settings, variant, false, logo);
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvasLayout(ctx, invoice, settings, variant, true, logo); return canvas;
  }
  Object.assign(F, { documentData, documentRows, invoiceText, invoiceHTML, wrapText, canvasLayout, invoiceCanvas });
})();
