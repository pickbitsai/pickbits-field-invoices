// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = new URL('../icons/', import.meta.url);
function crc32(bytes) { let crc = ~0; for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ ~0) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); }
function lineDistance(x, y, x1, y1, x2, y2) { const t = Math.max(0, Math.min(1, ((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2))); return Math.hypot(x-x1-t*(x2-x1), y-y1-t*(y2-y1)); }
export function iconPNG(size) {
  const pixels = Buffer.alloc((size * 3 + 1) * size);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const x = col * 512 / size, y = row * 512 / size;
    let colour = [25, 91, 73];
    if (x >= 160 && x <= 352 && y >= 120 && y <= 390) colour = [255, 253, 243];
    if ([[197,180,315,180],[197,221,287,221],[197,262,315,262]].some(l => lineDistance(x, y, ...l) <= 8)) colour = [25,91,73];
    if ([[214,318,242,346],[242,346,302,284]].some(l => lineDistance(x, y, ...l) <= 9)) colour = [196,138,35];
    const index = row * (size * 3 + 1) + 1 + col * 3;
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = colour[channel];
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await mkdir(root, { recursive: true }); for (const size of [180, 192, 512]) await writeFile(new URL(`icon-${size}.png`, root), iconPNG(size)); console.log('PASS: 3 neutral app icons generated, no dependencies.'); }
