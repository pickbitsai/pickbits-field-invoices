// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, stopServer, HOST, PORT, SIGNATURE } from './server.mjs';
const output = fileURLToPath(new URL('../.test-tmp/browser/', import.meta.url));
await mkdir(output, { recursive: true });
process.env.TEMP = output; process.env.TMP = output; process.env.TMPDIR = output;
async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  try { const root = execSync('npm root -g', { encoding: 'utf8', windowsHide: true }).trim(); return await import(pathToFileURL(join(root, 'playwright', 'index.js')).href); } catch { return null; }
}
export async function verifyBrowser() {
  const imported = await loadPlaywright(), pw = imported?.chromium ? imported : imported?.default;
  if (!pw) { console.log('SKIP: optional browser checks — Playwright is not installed. Zero dependencies were added.'); return; }
  const systemChromium = process.platform === 'win32' ? [
    join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe')
  ].find(path => existsSync(path)) : null;
  const engines = ['chromium', 'webkit'].filter(name => pw[name] && (existsSync(pw[name].executablePath()) || name === 'chromium' && systemChromium));
  for (const name of ['chromium', 'webkit'].filter(name => !engines.includes(name))) console.log(`SKIP: ${name} browser executable is not installed.`);
  if (!engines.length) return;
  const basePath = '/field-invoices/', base = `http://${HOST}:${PORT}${basePath}`;
  let server = await startServer({ basePath });
  let passed = 0, failed = 0, currentPage;
  async function check(name, run) { try { await run(); passed++; console.log(`PASS: ${name}`); } catch (error) { failed++; if (currentPage) { await currentPage.screenshot({ path: join(output, 'failure.png'), fullPage: true }); console.error('Browser notice:', await currentPage.locator('#error').innerText()); } throw new Error(`${name}: ${error.message}`, { cause: error }); } }
  try {
    const response = await fetch(base); assert.ok((await response.text()).includes(SIGNATURE));
    for (const engine of engines) {
      const browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' && !existsSync(pw[engine].executablePath()) ? { executablePath: systemChromium } : {}) });
      try {
        const context = await browser.newContext({ viewport: { width: 1366, height: 1050 }, locale: 'en-US', acceptDownloads: true });
        await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = []; currentPage = page;
        page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept()); page.setDefaultTimeout(12000);
        const idle = () => page.waitForFunction(() => !document.body.hasAttribute('aria-busy'));
        const nav = async name => { await page.locator(`[data-screen="${name}"]:visible`).click(); await idle(); };
        const action = async name => { await page.locator(`[data-action="${name}"]`).first().click(); await idle(); };
        const value = (name, text) => page.locator(`[name="${name}"]`).fill(text);
        await check(`${engine}: first-run settings and editable trade starter`, async () => {
          await page.goto(base); await page.locator('#settingsForm').waitFor();
          await value('name', 'Example Field Care'); await value('technician', 'Ari Wrenvale'); await value('addressLines', '81 Lantern Willow Lane\nMesa, AZ');
          await value('phone', '(480) 555-0101'); await value('email', 'office@example.org'); await value('registration', 'Registration example'); await value('taxRate', '8');
          await page.locator('#logoFile').setInputFiles(fileURLToPath(new URL('../icons/icon-512.png', import.meta.url)));
          await page.waitForFunction(() => document.querySelector('#logoPreview').naturalWidth === 400);
          await page.locator('[name="starter"]').selectOption('lawn'); await page.locator('#settingsForm [type="submit"]').click();
          await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor();
          await nav('catalogue'); const item = page.locator('.catalogue-item').first(); await item.locator('[name="price"]').fill('100'); await item.locator('[name="taxable"]').check(); await item.locator('[type="submit"]').click();
          await page.getByText('Catalogue item saved.', { exact: true }).waitFor();
        });
        await check(`${engine}: customer profile, private notes and cycle`, async () => {
          await nav('customers'); await action('add-customer'); await value('name', 'Bryn Mossden'); await value('address', '19 Pebble Lantern Court'); await value('city', 'Mesa'); await value('phone', '(480) 555-0102'); await value('notes', 'PRIVATE GATE NOTE'); await page.locator('[name="cycle"]').selectOption('days'); await value('days', '14');
          await page.locator('#customerForm [type="submit"]').click(); await page.getByRole('heading', { name: 'Bryn Mossden', exact: true }).waitFor();
          assert.equal(await page.locator('.month').count(), 12);
        });
        await check(`${engine}: draft autosave, reload, bucketed save and calculated tax`, async () => {
          await action('start-visit'); await page.locator('#visitForm').waitFor(); await action('punch-in');
          await page.locator('#pick-services').selectOption('starter-lawn-services-0'); await page.locator('[data-action="add-line"][data-id="services"]').click(); await idle();
          await value('notes', 'Mowed and cleared the walkway.'); await page.waitForFunction(() => document.querySelector('#draftStatus')?.textContent === 'Draft saved locally');
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pickbits-field-invoices.live.meta')).draft.notes), 'Mowed and cleared the walkway.');
          await page.reload(); await nav('visit'); assert.equal(await page.locator('[name="notes"]').inputValue(), 'Mowed and cleared the walkway.');
          await page.locator('#visitForm [type="submit"]').click(); await page.locator('#documentPreview').waitFor();
          const text = await page.locator('#documentPreview').innerText(); assert.ok(text.includes('INV-0001')); assert.ok(text.includes('$108.00')); assert.ok(!text.includes('PRIVATE GATE NOTE'));
          const buckets = await page.evaluate(async () => { const F = globalThis.FieldInvoices, db = await F.openDatabase(indexedDB, F.namespace(false) + '-store'); const buckets = await F.readBuckets(db); db.close(); return buckets; });
          assert.equal(buckets.flatMap(b => b.invoices).length, 1); assert.ok(buckets.every(b => b.bucket >= 0 && b.bucket < 64));
        });
        await check(`${engine}: correction, output stamp, summaries and PNG`, async () => {
          await action('correct'); await value('services.0.price', '110'); await value('correctionNote', 'Updated agreed rate'); await page.locator('#visitForm [type="submit"]').click(); await page.locator('#documentPreview .doc-corrected').waitFor();
          assert.ok((await page.locator('#documentPreview').innerText()).includes('INV-0001'));
          assert.ok((await page.locator('#documentPreview').innerText()).includes('Made with PickBits Field Invoices'));
          assert.ok(await page.locator('#documentPreview .document-logo').isVisible());
          await page.locator('#variant').selectOption('summary'); assert.ok(!(await page.locator('#documentPreview').innerText()).includes('$'));
          await page.locator('#variant').selectOption('invoice');
          const downloadPromise = page.waitForEvent('download'); await action('share-image'); const download = await downloadPromise; const path = join(output, `${engine}-invoice.png`); await download.saveAs(path); const bytes = await readFile(path); assert.equal(bytes.readUInt32BE(16), 900);
          await page.screenshot({ path: join(output, `${engine}-invoice-page.png`), fullPage: true });
          if (engine === 'chromium') { await page.evaluate(() => { document.querySelector('#printArea').innerHTML = document.querySelector('#documentPreview').innerHTML; }); await page.pdf({ path: join(output, 'invoice.pdf'), format: 'Letter', printBackground: true }); }
        });
        await check(`${engine}: soft delete/restore, same as last time, reports and customer history`, async () => {
          await action('delete'); await page.getByText('Deleted', { exact: false }).first().waitFor(); await action('restore');
          await nav('customers'); await action('customer'); assert.equal(await page.locator('.month.visited').count(), 1); await action('start-visit'); await action('same-last'); assert.equal(await page.locator('[name="services.0.price"]').inputValue(), '110');
          await nav('reports'); for (const period of ['day','week','month','due']) { await page.locator('#reportPeriod').selectOption(period); await page.locator('#reportContent').waitFor(); }
          assert.ok(!(await page.locator('#reportContent').innerText()).includes('Bryn Mossden'));
        });
        await check(`${engine}: Settings encrypted export/import and CSV export`, async () => {
          await nav('settings'); await page.locator('#backupPassphrase').fill('synthetic test passphrase'); const downloadPromise = page.waitForEvent('download'); await action('export-backup'); const download = await downloadPromise; const path = join(output, `${engine}-backup.json`); await download.saveAs(path);
          const envelope = JSON.parse(await readFile(path, 'utf8')); assert.equal(envelope.cipher, 'AES-256-GCM'); assert.ok(!JSON.stringify(envelope).includes('Bryn Mossden'));
          await page.locator('#backupFile').setInputFiles(path); await page.locator('#backupPassphrase').fill('wrong'); await action('import-backup'); await page.locator('#error').waitFor({ state: 'visible' }); assert.ok((await page.locator('#error').innerText()).includes('No data was imported'));
          await page.locator('#backupPassphrase').fill('synthetic test passphrase'); await action('import-backup'); await page.getByText('Imported 0 customers and 0 invoices.', { exact: true }).waitFor();
          const csvPromise = page.waitForEvent('download'); await action('csv'); const csv = await csvPromise; const csvPath = join(output, `${engine}-invoices.csv`); await csv.saveAs(csvPath); assert.ok((await readFile(csvPath, 'utf8')).includes('INV-0001'));
        });
        await check(`${engine}: demo history month tables, sticky headers and newest-50 pagination`, async () => {
          await page.goto(base + '?demo=1'); await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor();
          assert.match(await page.locator('#main .badge.red').first().innerText(), /^Overdue since [A-Za-z]+ \d+/);
          await nav('customers'); await action('customer'); assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(await page.locator('#main').innerText()));
          await nav('reports'); for (const period of ['day', 'week', 'month', 'due']) {
            await page.locator('#reportPeriod').selectOption(period); assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(await page.locator('#reportContent').innerText()));
          }
          await nav('history'); assert.equal(await page.locator('.history-table tbody tr').count(), 50);
          assert.equal(await page.locator('#historyCount').innerText(), 'Showing 50 of 111 invoices');
          assert.ok(await page.locator('.history-month').count() >= 2);
          assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(await page.locator('#historyResults').innerText()));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.ok(await page.evaluate(() => document.documentElement.scrollHeight < 5500));
          assert.equal(await page.locator('.history-table tbody').first().evaluate(el => getComputedStyle(el).display), 'table-row-group');
          await page.screenshot({ path: join(output, `${engine}-demo-history-desktop.png`), fullPage: true });
          await page.screenshot({ path: join(output, `${engine}-demo-history-viewport.png`) });
          await page.evaluate(() => scrollTo(0, 700));
          assert.ok(Math.abs((await page.locator('.history-month-title').first().boundingBox()).y) <= 1);
          await action('history-more'); assert.equal(await page.locator('.history-table tbody tr').count(), 100);
          await action('history-more'); assert.equal(await page.locator('.history-table tbody tr').count(), 111);
          assert.equal(await page.locator('[data-action="history-more"]').count(), 0);
        });
        await check(`${engine}: history search, status filters and deleted invoice restore`, async () => {
          await page.locator('#search').fill('LAURA MARTINEZ'); assert.equal(await page.locator('.history-table tbody tr').count(), 3);
          await page.locator('#search').fill('no matching customer'); assert.equal(await page.locator('.history-table tbody tr').count(), 0);
          await page.locator('#search').fill(''); assert.equal(await page.locator('.history-table tbody tr').count(), 50);
          for (const [filter, total] of [['unpaid', 5], ['paid', 106], ['corrected', 1], ['deleted', 0]]) {
            await page.locator('#historyStatus').selectOption(filter); assert.equal(await page.locator('#historyCount').innerText(), `Showing ${Math.min(total, 50)} of ${total} invoices`);
          }
          await page.locator('#historyStatus').selectOption('corrected'); await page.locator('#search').fill('cf-0001');
          assert.equal(await page.locator('.history-table tbody tr').count(), 1); await action('document'); await action('delete');
          await nav('history'); await page.locator('#historyStatus').selectOption('deleted'); assert.equal(await page.locator('.history-table tbody tr').count(), 1);
          await action('document'); await action('restore'); await nav('history'); assert.equal(await page.locator('.history-table tbody tr').count(), 0);
          await page.locator('#historyStatus').selectOption('corrected'); await action('document');
        });
        await check(`${engine}: demo invoice table, aligned totals, full address and print layout`, async () => {
          const preview = page.locator('#documentPreview');
          assert.deepEqual(await preview.locator('.doc-items th').allTextContents(), ['Description', 'Qty', 'Rate', 'Amount']);
          assert.ok((await preview.locator('.doc-bill-to').innerText()).includes('Mesa, AZ 85204'));
          assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(await page.locator('#main').innerText()));
          const layout = await preview.evaluate(el => {
            const box = selector => el.querySelector(selector).getBoundingClientRect();
            return { rights: [...el.querySelectorAll('.doc-totals dd')].map(e => e.getBoundingClientRect().right), header: box('.doc-header').top, meta: box('.doc-meta').top, business: box('.doc-business').left, number: box('.doc-meta').left };
          });
          assert.ok(layout.rights.every(x => Math.abs(x - layout.rights[0]) < 1)); assert.equal(layout.header, layout.meta); assert.ok(layout.number > layout.business);
          await page.screenshot({ path: join(output, `${engine}-demo-invoice-page.png`), fullPage: true });
          const downloadPromise = page.waitForEvent('download'); await action('share-image'); await (await downloadPromise).saveAs(join(output, `${engine}-demo-invoice.png`));
          await page.evaluate(() => { document.querySelector('#printArea').innerHTML = document.querySelector('#documentPreview').innerHTML; });
          await page.emulateMedia({ media: 'print' }); assert.ok(await page.locator('#printArea .doc-items').isVisible()); assert.ok(!(await page.locator('nav').isVisible()));
          assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(255, 255, 255)');
          if (engine === 'chromium') await page.pdf({ path: join(output, 'demo-invoice.pdf'), format: 'Letter', printBackground: true });
          await page.emulateMedia({ media: 'screen' });
          await page.locator('#variant').selectOption('summary'); assert.equal(await preview.locator('.doc-items th').count(), 2); assert.ok(!(await preview.innerText()).includes('$'));
          await page.locator('#variant').selectOption('invoice');
        });
        await check(`${engine}: mobile bottom navigation, More destinations and draft preservation`, async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await nav('home');
          assert.deepEqual(await page.locator('nav button:visible').evaluateAll(nodes => nodes.map(n => n.dataset.screen)), ['home', 'visit', 'customers', 'history', 'more']);
          const bounds = await page.locator('nav').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390); assert.ok(Math.abs(bounds.y + bounds.height - 844) < 1);
          for (const destination of ['reports', 'catalogue', 'settings']) { await nav('more'); await nav(destination); assert.equal(await page.locator('nav [data-screen="more"]').getAttribute('aria-current'), 'page'); }
          await nav('customers'); await action('start-visit'); await value('notes', 'Please close the west gate after service.');
          await nav('more'); await nav('visit'); assert.equal(await page.locator('[name="notes"]').inputValue(), 'Please close the west gate after service.');
          await nav('history'); await page.locator('#historyStatus').selectOption('all'); assert.equal(await page.locator('.history-table tbody tr').count(), 50);
          await page.screenshot({ path: join(output, `${engine}-demo-history-mobile.png`), fullPage: true });
          await action('document'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: join(output, `${engine}-demo-invoice-mobile.png`), fullPage: true });
          await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
          assert.ok(await page.locator('nav [data-screen="more"]').evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); }));
          await nav('more'); await page.screenshot({ path: join(output, `${engine}-demo-more-mobile.png`), fullPage: true });
        });
        await check(`${engine}: demo isolation, reset, mobile layout and offline cold navigation`, async () => {
          await page.goto(base + '?demo=1'); await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor(); assert.ok(await page.locator('#demoBanner').isVisible());
          await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(output, `${engine}-demo-mobile.png`), fullPage: true });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await action('reset-demo'); await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor();
          await page.evaluate(async () => { await navigator.serviceWorker.ready; });
          await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
          // A stopped server exercises real cache fallback in both engines; WebKit's
          // offline-emulation switch can fail navigations before its worker handles them.
          await stopServer(server); server = null;
          await page.reload(); await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor(); assert.ok(await page.locator('#demoBanner').isVisible());
          await page.goto(base); await page.getByRole('heading', { name: 'A good day to get things done.' }).waitFor(); assert.equal(await page.locator('#businessName').innerText(), 'Example Field Care'); assert.ok(!(await page.locator('#demoBanner').isVisible()));
          server = await startServer({ basePath });
          await page.setViewportSize({ width: 1360, height: 1050 }); await page.screenshot({ path: join(output, `${engine}-dashboard.png`), fullPage: true });
        });
        await check(`${engine}: browser fallback with IndexedDB unavailable`, async () => {
          const fallbackContext = await browser.newContext();
          try {
            await fallbackContext.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get: () => undefined }); });
            const fallbackPage = await fallbackContext.newPage(); await fallbackPage.goto(base); await fallbackPage.locator('#settingsForm').waitFor(); await fallbackPage.locator('[name="name"]').fill('Fallback Example'); await fallbackPage.locator('#settingsForm [type="submit"]').click(); await fallbackPage.getByRole('heading', { name: 'A good day to get things done.' }).waitFor(); await fallbackPage.reload(); await fallbackPage.getByRole('heading', { name: 'A good day to get things done.' }).waitFor(); assert.equal(await fallbackPage.locator('#businessName').innerText(), 'Fallback Example');
          } finally { await fallbackContext.close(); }
        });
        assert.deepEqual(errors, [], 'No browser script errors'); await context.close();
      } finally { await browser.close(); }
    }
  } finally { if (server) await stopServer(server); console.log(`Browser checks: ${passed} passed, ${failed} failed; server stopped on ${HOST}:${PORT}.`); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyBrowser();
