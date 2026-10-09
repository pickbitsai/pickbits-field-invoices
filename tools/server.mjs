// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const HOST = '127.0.0.1', PORT = 4205;
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SIGNATURE = '<title>PickBits Field Invoices</title>';
const assets = ['index.html','sw.js','manifest.webmanifest','app/core.js','app/storage.js','app/backup.js','app/renderers.js','app/demo.js','app/ui.js','app/styles.css','icons/icon.svg','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
export function createHandler({ root = ROOT, basePath = '/' } = {}) {
  if (!/^\/(?:[a-z0-9_-]+\/)*$/i.test(basePath)) throw new Error('Invalid static base path.');
  return async (req, res) => {
    const reply = (code, text) => res.writeHead(code, { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' }).end(text);
    if (req.headers.host !== `${HOST}:${PORT}`) return reply(403, 'Only the allocated loopback host is accepted.');
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Only static GET and HEAD requests are supported.');
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reply(400, 'Invalid request path.');
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { return reply(400, 'Invalid request path.'); }
    if (!pathname.startsWith(basePath)) return reply(404, 'Static file not found.');
    const file = pathname.slice(basePath.length) || 'index.html';
    if (!assets.includes(file)) return reply(404, 'Static file not found.');
    try {
      const body = await readFile(resolve(root, file));
      res.writeHead(200, { 'content-type': types[file.split('.').at(-1)], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { reply(404, 'Static file not found.'); }
  };
}
export async function startServer(options = {}) {
  if (options.host !== undefined && options.host !== HOST || options.port !== undefined && options.port !== PORT) throw new Error('Only the allocated loopback address and port are supported.');
  const server = createServer(createHandler(options));
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolveReady); });
  return server;
}
export async function stopServer(server) { server.closeAllConnections(); await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed())); }
export async function checkStatic(root = ROOT) {
  let code, body;
  await createHandler({ root })({ method: 'GET', url: '/', headers: { host: `${HOST}:${PORT}` } }, { writeHead(value) { code = value; return this; }, end(value) { body = String(value); } });
  if (code !== 200 || !body.includes(SIGNATURE)) throw new Error('Static entry point signature missing.');
  return true;
}
function openBrowser(url) {
  const command = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { stdio: 'ignore', detached: true, windowsHide: true }); child.on('error', () => console.log('Open the printed local address in your browser.')); child.unref();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('PickBits Field Invoices 0.1.0\nnode tools/server.mjs [--demo] [--no-open] [--check]\nServes static files on 127.0.0.1:4205 only. Ctrl+C stops the server.');
  else if (args.some(arg => !['--demo','--no-open','--check'].includes(arg))) { console.error('Unknown option. Use --help.'); process.exitCode = 1; }
  else if (args.includes('--check')) { await checkStatic(); console.log('PASS: static app signature verified without opening a port.'); }
  else {
    try {
      const server = await startServer(); const url = `http://${HOST}:${PORT}/${args.includes('--demo') ? '?demo=1' : ''}`;
      // Verify this server's response body before announcing readiness.
      try { const response = await fetch(url); if (!(await response.text()).includes(SIGNATURE)) throw new Error('Local server signature mismatch.'); }
      catch (error) { await stopServer(server); throw error; }
      console.log(`PickBits Field Invoices 0.1.0\n${url}\nStatic files only. Ctrl+C to stop.`);
      if (args.includes('--demo') && !args.includes('--no-open')) openBrowser(url);
      for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await stopServer(server); process.exit(0); });
    } catch (error) { console.error(`Server refused to start: ${error.code || error.message}. No alternate port will be used.`); process.exitCode = 1; }
  }
}
