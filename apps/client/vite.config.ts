import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..', 'server');
const calliManifest = path.resolve(here, 'src/ui/calli/manifest.json');
const uiStrings = path.resolve(here, '../../packages/content/data/i18n/vi.ui.json');

/** Khung hình đầu trong index.html hiện trước khi JS chạy: chèn tiêu đề từ i18n (`ui.title`) lúc build. */
function titleFromI18n(): Plugin {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'dtl-title-i18n',
    transformIndexHtml(html) {
      const title = (JSON.parse(fs.readFileSync(uiStrings, 'utf8')) as Record<string, string>)['ui.title'];
      // Ảnh thư pháp tên có hash (server cache immutable cho /assets/*): lấy tên + cỡ từ manifest của tools/calli.
      const calli = (JSON.parse(fs.readFileSync(calliManifest, 'utf8')) as Record<string, { file: string; w: number; h: number }>)['title'];
      return html
        .replaceAll('%DTL_CALLI_TITLE_W%', String(calli.w))
        .replaceAll('%DTL_CALLI_TITLE_H%', String(calli.h))
        .replaceAll('%DTL_CALLI_TITLE%', calli.file)
        .replaceAll('%DTL_TITLE%', esc(title));
    },
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
  return {
    plugins: [react(), titleFromI18n()],
    define: command === 'serve' ? { 'import.meta.env.VITE_DEV_SERVER_PORT': JSON.stringify(String(Number(env.PORT || 2567))) } : {},
    // strictPort: cổng bận thì báo lỗi thay vì âm thầm nhảy sang cổng khác (có thể là của worktree khác).
    server: { port: clientPort ?? 5173, strictPort: true, host: true },
    preview: { port: clientPort ?? 4173, strictPort: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  };
});
