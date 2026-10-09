// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of PickBits Field Invoices.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, lstat, readdir, rm, readFile } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), base = join(root, '.test-tmp');
await mkdir(base, { recursive: true }); const consumer = await mkdtemp(join(base, 'consumer-'));
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: consumer, encoding: 'utf8', windowsHide: true, env: { ...process.env, TEMP: consumer, TMP: consumer, TMPDIR: consumer }, maxBuffer: 5000000 });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`); return result.stdout;
}
try {
  // This repository starts without a commit. Include unignored files git would track as well as index entries.
  const files = [...new Set(execFileSync('git', ['ls-files','--cached','--others','--exclude-standard','-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean))];
  assert.ok(files.includes('index.html') && files.includes('LICENSE'));
  for (const file of files) {
    const source = resolve(root, file), destination = resolve(consumer, file);
    assert.ok(!relative(root, source).startsWith('..') && !relative(consumer, destination).startsWith('..'));
    const stat = await lstat(source); assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Only regular tracked files: ${file}`);
    await mkdir(dirname(destination), { recursive: true }); await copyFile(source, destination);
  }
  const packageJson = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'));
  assert.ok(!packageJson.dependencies && !packageJson.devDependencies, 'Consumer check expects zero dependencies; add offline install if dependencies are introduced.');
  const tests = (await readdir(join(consumer, 'test'))).filter(file => file.endsWith('.test.mjs')).map(file => `test/${file}`);
  const output = run(['--test', ...tests]); const counts = output.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
  assert.ok(counts); console.log(`Consumer node tests: ${counts[2]} passed, ${counts[3]} failed (${counts[1]} total).`);
  run(['tools/server.mjs','--demo','--check']); console.log(`PASS: copied ${files.length} git-trackable files; demo static entry verified; no dependencies, installs or ports needed.`);
} finally {
  assert.ok(resolve(consumer).startsWith(resolve(base) + (process.platform === 'win32' ? '\\' : '/')));
  await rm(consumer, { recursive: true, force: true });
}
