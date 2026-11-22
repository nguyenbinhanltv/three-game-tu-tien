// Build client production vào thư mục tạm và phục vụ tĩnh có gzip như CDN (dùng chung cho `bench:load` và `bench:crowd --build`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from './devserver';
import { childEnv } from './env';

/** `vite build` client vào `dist` (VITE_SERVER_URL trỏ server game ở `serverPort`); `reuse` dùng lại bản build có sẵn. */
export function buildClient(o: { dist: string; serverPort: number; reuse?: boolean; tag: string }): void {
  if (o.reuse && fs.existsSync(path.join(o.dist, 'index.html'))) {
    console.log(`[${o.tag}] dùng lại bản build ${o.dist}`);
    return;
  }
  console.log(`[${o.tag}] vite build → ${o.dist}`);
  execFileSync('pnpm', ['--filter', '@dtl/client', 'exec', 'vite', 'build', '--outDir', o.dist, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...childEnv(), VITE_SERVER_URL: `ws://localhost:${o.serverPort}` },
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.ktx2': 'image/ktx2',
};
/** Loại file CDN nén (GLB meshopt, ảnh, font, âm thanh đã nén sẵn). */
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm']);

export function serveDist(DIST: string, CLIENT_PORT: number): Promise<http.Server> {
  const gz = new Map<string, Buffer>();
  const srv = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      const ext = path.extname(file);
      const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
      headers['cache-control'] =
        url.pathname.startsWith('/assets/') && !url.pathname.endsWith('manifest.json') ? 'public, max-age=31536000, immutable' : 'no-cache';
      let body: Buffer = fs.readFileSync(file);
      if (GZIP.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
        let z = gz.get(file);
        if (!z) gz.set(file, (z = zlib.gzipSync(body, { level: 9 })));
        body = z;
        headers['content-encoding'] = 'gzip';
      }
      headers['content-length'] = String(body.length);
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(CLIENT_PORT, () => resolve(srv));
  });
}
