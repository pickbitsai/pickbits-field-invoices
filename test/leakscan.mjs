// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Client and private names are never listed here; release-guard checks them from a denylist kept outside the repo.
const forbidden = [['pickbits','.ai']].map(parts => parts.join(''));
export function scanText(text, path = 'text') {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const add = rule => findings.push(`${path}:${index + 1} ${rule}`);
    if (/\b[A-Z]:[\/\\]/i.test(line)) add('absolute drive path');
    if (line.toLowerCase().includes('pickbits' + '-services')) add('private workspace name');
    if (/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[a-z]-[A-Za-z0-9-]{10,}|AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16})/.test(line)) add('credential literal');
    if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(line)) add('private key');
    if (forbidden.some(word => line.toLowerCase().includes(word))) add('private identity');
    const phones = line.match(/\+1\d{10}\b|\b1[2-9]\d{9}\b|(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]?\d{4}\b|\b[2-9]\d{9}\b|\b\d{3}[ .-]\d{4}\b/g) || [];
    for (const phone of phones) {
      const digits = phone.replace(/\D/g, ''), national = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
      if (!/^(?:[2-9]\d{2})?55501\d{2}$/.test(national)) add('non-synthetic phone');
    }
    for (const match of line.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) if (!/^example\.(com|org|net)$/i.test(match[1])) add('non-synthetic email');
  });
  return findings;
}
export async function leakscan(directory = root) {
  let scanned = 0; const findings = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (['.git','node_modules','.test-tmp','dist','build','test-output','demo-data','outbox','outboxes'].includes(entry.name)) continue;
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) { findings.push(`${relative(directory, full)} symbolic link is not allowed in public source`); continue; }
      if (entry.isDirectory()) await walk(full);
      else {
        const bytes = await readFile(full);
        if (bytes.includes(0) && !/\.(?:js|mjs|ts|tsx|css|html|json|md|txt|csv|svg)$/i.test(entry.name)) continue;
        const text = bytes.toString('utf8'); if (text.includes('\ufffd')) { findings.push(`${relative(directory, full)} unknown non-UTF8 file`); continue; }
        scanned++; findings.push(...scanText(text, relative(directory, full).replaceAll('\\', '/')));
      }
    }
  }
  await walk(directory); return { scanned, findings };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scanned, findings } = await leakscan(); console.log(`leakscan: ${scanned} text files, ${findings.length} findings`);
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; } else console.log('PASS: public source contains no prohibited identities, paths, credentials, phones or emails.');
}
