import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..', 'server');
const calliManifest = path.resolve(here, 'src/base/calliManifest.json');
const uiStrings = path.resolve(here, '../../packages/content/data/i18n/vi.ui.json');

/** Khung hình đầu trong index.html hiện trước khi JS chạy: chèn tiêu đề từ i18n (`ui.title`) lúc build. */
function titleFromI18n(assetBase: string): Plugin {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'dtl-title-i18n',
    transformIndexHtml(html) {
      const title = (JSON.parse(fs.readFileSync(uiStrings, 'utf8')) as Record<string, string>)['ui.title'];
      // Ảnh thư pháp tên có hash (server cache immutable cho /assets/*): lấy tên + cỡ từ manifest của tools/calli.
      const calli = (JSON.parse(fs.readFileSync(calliManifest, 'utf8')) as Record<string, { file: string; w: number; h: number }>)['title'];
      return html
        .replaceAll('%DTL_ASSET_BASE%', assetBase)
        .replaceAll('%DTL_CALLI_TITLE_W%', String(calli.w))
        .replaceAll('%DTL_CALLI_TITLE_H%', String(calli.h))
        .replaceAll('%DTL_CALLI_TITLE%', calli.file)
        .replaceAll('%DTL_TITLE%', esc(title));
    },
  };
}

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

/**
 * Dev/preview: phục vụ `.asset-cache/` (do `pnpm assets:pull` kéo từ R2) trước `public/`, để chạy offline
 * khi không đặt VITE_ASSET_BASE. File không có trong cache thì rơi xuống public/ của Vite.
 */
function assetCache(): Plugin {
  const root = path.resolve(here, '../../.asset-cache');
  const serve = (req: { url?: string; method?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    if (!fs.existsSync(root) || (req.method !== 'GET' && req.method !== 'HEAD') || !req.url) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.url.split('?')[0]);
    } catch {
      return next();
    }
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', fs.statSync(file).size);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') return void res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
  return {
    name: 'dtl-asset-cache',
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}

// Cổng đổi được qua biến môi trường để nhiều worktree chạy song song. Biến môi trường thật
// được ưu tiên, sau đó tới apps/server/.env.local (đã gitignore, server cũng đọc file này):
//   CLIENT_PORT  cổng Vite dev (mặc định 5173) và preview (mặc định 4173). Preview chạy bản build
//                nên chỉ tự nối server ở 4173→2567; cổng khác thì build với VITE_SERVER_URL.
//   PORT         cổng server Colyseus mà client dev nối tới (mặc định 2567)
// VITE_SERVER_URL (ghi đè cách suy từ PORT) do Vite tự đọc từ process.env và apps/client/.env*,
// không lấy từ file env của server để không bị đóng cứng vào bản build production.
export default defineConfig(({ command, mode }) => {
  // Giá trị từ file env của server chỉ dùng khi chạy dev/preview, không bao giờ vào bản build.
  const env = command === 'serve' ? { ...loadEnv(mode, serverDir, ''), ...process.env } : process.env;
  const clientPort = env.CLIENT_PORT ? Number(env.CLIENT_PORT) : undefined;
  // VITE_ASSET_BASE (CDN/R2): process.env hoặc apps/client/.env*; trống = asset cùng origin (.asset-cache/ rồi public/).
  const assetBase = (process.env.VITE_ASSET_BASE ?? loadEnv(mode, here, 'VITE_').VITE_ASSET_BASE ?? '').trim().replace(/\/+$/, '');
  return {
    plugins: [react(), titleFromI18n(assetBase ? `${assetBase}/` : '/'), assetCache()],
    define: command === 'serve' ? { 'import.meta.env.VITE_DEV_SERVER_PORT': JSON.stringify(String(Number(env.PORT || 2567))) } : {},
    // strictPort: cổng bận thì báo lỗi thay vì âm thầm nhảy sang cổng khác (có thể là của worktree khác).
    server: { port: clientPort ?? 5173, strictPort: true, host: true },
    preview: { port: clientPort ?? 4173, strictPort: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  };
});
