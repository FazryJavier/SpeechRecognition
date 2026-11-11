import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCommand } from '../assets/js/commands.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');

test('CSP meta tag only allows same-origin scripts and styles', () => {
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'CSP meta tag missing');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
});

test('page has no inline scripts, <style> blocks, style attributes or on* handlers (would break CSP)', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, 'inline <script>');
  assert.doesNotMatch(html, /<style[\s>]/i, '<style> block');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'style attribute');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler');
});

test('every local src/href in index.html exists on disk', () => {
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((ref) => !ref.startsWith('#') && !/^(?:[a-z]+:)?\/\//i.test(ref) && ref !== './');
  assert.ok(refs.length >= 3);
  for (const ref of refs) assert.ok(existsSync(path.join(ROOT, ref)), `missing file: ${ref}`);
});

test('every id used by app.js exists in index.html', () => {
  const used = new Set([...appJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  assert.ok(used.size > 10);
  for (const id of used) assert.match(html, new RegExp(`id="${id}"`), `#${id} missing from index.html`);
});

test('every <use href="#i-..."> icon has a symbol in the sprite', () => {
  const used = new Set([...html.matchAll(/<use href="#(i-[a-z-]+)"/g)].map((m) => m[1]));
  const used2 = new Set([...appJs.matchAll(/icon\('([a-z-]+)'\)/g)].map((m) => `i-${m[1]}`));
  for (const id of [...used, ...used2]) assert.match(html, new RegExp(`<symbol id="${id}"`), `symbol ${id} missing`);
});

test('every data-say phrase in the static HTML is a command Voxtab understands', () => {
  const phrases = [...html.matchAll(/data-say="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(phrases.length >= 8);
  for (const phrase of phrases) {
    const { intent } = parseCommand(phrase);
    assert.ok(['open', 'search', 'close'].includes(intent), `"${phrase}" -> ${intent}`);
  }
});
