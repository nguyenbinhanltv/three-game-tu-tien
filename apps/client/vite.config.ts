import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
});
