import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimitFromEnv } from './ratelimit';
import { log } from './log';

import { at } from '@dtl/shared';
const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..', '..');

/** Nạp file .env đơn giản (KEY=VALUE mỗi dòng). Biến môi trường thật được ưu tiên. */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[at(m, 1)] === undefined) process.env[at(m, 1)] = at(m, 2).replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(path.join(SERVER_ROOT, '.env.local'));
loadEnvFile(path.join(SERVER_ROOT, '.env'));

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
const wantDevBypass = process.env.AUTH_DEV_BYPASS === '1';
// Chốt chặn: đăng nhập thử (ai cũng vào được, có lệnh GM) không bao giờ bật ở production
// hoặc khi đã cấu hình đăng nhập Google, kể cả khi lỡ mang theo file .env.local.
const devBypassBlocked = process.env.NODE_ENV === 'production' || googleClientId !== '';
if (wantDevBypass && devBypassBlocked) {
  log.warn('[config] AUTH_DEV_BYPASS=1 bị bỏ qua vì đang ở production hoặc đã cấu hình GOOGLE_CLIENT_ID.');
}

export const config = {
  port: Number(process.env.PORT ?? 2567),
  dbFile: process.env.DB_FILE ?? path.join(SERVER_ROOT, 'data', 'game.db'),
  /** Cho đăng nhập bằng tài khoản giả khi phát triển. KHÔNG bật trên VPS. */
  devBypass: wantDevBypass && !devBypassBlocked,
  googleClientId,
  /** Bỏ qua danh sách mời (mọi tài khoản Google đều vào được). Mặc định tắt. */
  openInvite: process.env.OPEN_INVITE === '1',
  clientDist: path.join(REPO_ROOT, 'apps', 'client', 'dist'),
  /** Số người tối đa mỗi kênh của bản đồ thế giới. Đầy thì tự mở kênh mới. */
  maxClients: Math.max(1, Number(process.env.MAX_CLIENTS ?? 50)),
  /**
   * Giới hạn tần suất theo IP cho POST /matchmake và bắt tay WebSocket (mỗi loại một xô).
   * RATE_LIMIT_BURST (mặc định 40), RATE_LIMIT_PER_MIN (20), TRUST_PROXY=1 để đọc X-Forwarded-For,
   * RATE_LIMIT_EXEMPT=loopback|ip,... miễn giới hạn cho bot ở máy dev (bị bỏ qua khi production).
   */
  rateLimit: rateLimitFromEnv(process.env),
};
