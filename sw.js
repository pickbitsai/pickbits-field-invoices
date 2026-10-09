// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
'use strict';
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `field-invoices:${new URL(SCOPE).pathname}:`;
const CACHE_NAME = CACHE_PREFIX + '0.1.0-2';
const FILES = ['index.html', 'app/styles.css', 'app/core.js', 'app/storage.js', 'app/backup.js', 'app/renderers.js', 'app/demo.js', 'app/ui.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const ALLOWED = new Set(FILES.map(file => new URL(file, SCOPE).href));
const APP = new URL('index.html', SCOPE).href;
function cacheKey(request) {
  const url = new URL(request.url); url.search = ''; url.hash = '';
  return request.mode === 'navigate' ? APP : url.href;
}
async function validResponse(response, navigation) {
  return response.ok && !response.redirected && response.type !== 'opaque' && (!navigation || (await response.clone().text()).includes('id="main"'));
}
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME), key = cacheKey(request);
  try {
    // Abort stalled network attempts so an installed field app opens promptly offline.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3500);
    let response;
    try { response = await fetch(request, { signal: controller.signal }); } finally { clearTimeout(timer); }
    if (await validResponse(response, request.mode === 'navigate')) {
      try { await cache.put(key, response.clone()); } catch { /* Quota failures do not break the network response. */ }
      return response;
    }
    return await cache.match(key) || response;
  } catch { return await cache.match(key) || Response.error(); }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); await cache.addAll([...ALLOWED]); await self.skipWaiting(); })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate' || ALLOWED.has(cacheKey(request))) event.respondWith(networkFirst(request));
});
