/**
 * Zero-dependency static file server for local development.
 *
 *   npm start            -> http://localhost:5173
 *   PORT=8080 npm start  -> http://localhost:8080
 *
 * Why a server at all? Browsers only expose the microphone to "secure
 * contexts", and http://localhost counts as one while file:// does not.
 *
 * Safety: binds to loopback only and serves an allow-list (index.html and
 * /assets/**), so nothing else in the repository folder can be downloaded.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/**
 * Map a request URL to an absolute file path inside `root`, or `null` when the
 * request is not allowed (outside the allow-list, traversal attempt, bad encoding).
 */
export function resolveRequestPath(requestUrl, root = ROOT) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  // NUL bytes are never valid; backslashes are path separators on Windows but
  // plain characters on POSIX, so reject them everywhere for identical behaviour.
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  if (pathname === '/') pathname = '/index.html';
  if (pathname !== '/index.html' && !pathname.startsWith('/assets/')) return null;

  const full = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

export function createServer(root = ROOT) {
  return http.createServer(async (req, res) => {
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end('Method Not Allowed');
      return;
    }

    const filePath = resolveRequestPath(req.url ?? '/', root);
    if (!filePath) {
      res.writeHead(404, headers).end('Not Found');
      return;
    }

    try {
      const body = await readFile(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, headers).end('Not Found');
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? '', 10) || 5173;
  const server = createServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: PORT=${port + 1} npm start`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  Voxtab is running at  http://localhost:${port}\n`);
    console.log('  Open it in Chrome, Edge or Safari. Press Ctrl+C to stop.\n');
  });
}
