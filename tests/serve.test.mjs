import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRequestPath, createServer } from '../scripts/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('serves index.html for "/" and files under /assets', () => {
  assert.equal(resolveRequestPath('/', ROOT), path.join(ROOT, 'index.html'));
  assert.equal(resolveRequestPath('/index.html?x=1', ROOT), path.join(ROOT, 'index.html'));
  assert.equal(resolveRequestPath('/assets/js/app.js', ROOT), path.join(ROOT, 'assets', 'js', 'app.js'));
});

test('refuses everything outside the allow-list', () => {
  for (const url of ['/package.json', '/.git/config', '/legacy/streamlit_app/mystreamlit_app.py', '/tests/commands.test.mjs', '/README.md']) {
    assert.equal(resolveRequestPath(url, ROOT), null, url);
  }
});

test('refuses path traversal in every encoding', () => {
  for (const url of [
    '/assets/../package.json',
    '/assets/../../etc/passwd',
    '/assets/%2e%2e/package.json',
    '/assets/%2e%2e%2f%2e%2e%2fpackage.json',
    '/assets/..%5c..%5cpackage.json',
    '/assets/..\\..\\package.json',
    '/assets/%00.js',
    '/assets/%E0%A4%A',
  ]) {
    assert.equal(resolveRequestPath(url, ROOT), null, url);
  }
});

const server = createServer(ROOT);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
  server.closeAllConnections?.();
  server.close();
});

test('HTTP: 200 with security headers for the app shell', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('HTTP: 404 for private files, 405 for writes', async () => {
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});
