import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');

// Cổng đổi được qua biến môi trường để nhiều worktree chạy song song. Biến môi trường thật
// được ưu tiên, sau đó tới apps/server/.env.local (đã gitignore, server cũng đọc file này):
//   CLIENT_PORT      cổng Vite dev (mặc định 5173) và preview (mặc định 4173)
//   PORT             cổng server Colyseus mà client dev nối tới (mặc định 2567)
//   VITE_SERVER_URL  URL WebSocket đầy đủ, ghi đè cách suy từ PORT
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, serverDir, ''), ...process.env };
  const clientPort = env.CLIENT_PORT ? Number(env.CLIENT_PORT) : undefined;
  const serverPort = Number(env.PORT || 2567);
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DEV_SERVER_PORT': JSON.stringify(String(serverPort)),
      ...(env.VITE_SERVER_URL ? { 'import.meta.env.VITE_SERVER_URL': JSON.stringify(env.VITE_SERVER_URL) } : {}),
    },
    // strictPort: cổng bận thì báo lỗi thay vì âm thầm nhảy sang cổng khác (có thể là của worktree khác).
    server: { port: clientPort ?? 5173, strictPort: true, host: true },
    preview: { port: clientPort ?? 4173, strictPort: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  };
});
