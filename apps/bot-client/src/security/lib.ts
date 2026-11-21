// Phần chung của bộ kiểm tra bảo mật: đích HTTP/WS, check(), join(), kiểu, server tạm (R-7, tách từ security-check.ts).
import { Client, type Room } from 'colyseus.js';
import { type InitMsg, ROOM_WORLD, S } from '@dtl/shared';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { defaultServerHttp } from '../target';

export const HTTP = process.argv[2] ?? defaultServerHttp();
export const WS = HTTP.replace(/^http/, 'ws');
export const W = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Chờ tới khi `cond()` đúng (tối đa `ms`, mặc định 5 s, thăm dò 25 ms), trả kết quả cuối. Dùng thay `W(cố định)` ở bài kiểm tra "server đã xử lý lệnh":
 * ngủ cố định 150–500 ms làm bài hỏng chập chờn khi máy/CI đang tải (server chưa kịp phản hồi), còn bài đúng thì thoát sớm.
 */
export async function waitUntil(cond: () => boolean, ms = 5000): Promise<boolean> {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await W(25);
  return cond();
}
/** Số mục HỎNG (dùng chung giữa các nhóm bài). */
export const stats = { failed: 0 };

export function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) stats.failed++;
}

export async function health(): Promise<boolean> {
  try {
    return (await fetch(HTTP + '/health')).ok;
  } catch {
    return false;
  }
}

export interface P {
  x: number;
  y: number;
  z: number;
  hp: number;
  fl: number;
  lv: number;
  yaw: number;
}
export interface CharV {
  xp: number;
  xpNeed: number;
  gold: number;
  level: number;
  bk: number;
  root: string;
  /** Đạo (TN-3): nguồn đã chọn, rỗng = chưa chọn. */
  dao?: string;
  trial: number;
  retry: number;
}
export interface M {
  t: string;
  x: number;
  z: number;
  hp: number;
  mhp: number;
  st: number;
}

export async function join(name: string): Promise<{ client: Client; room: Room; init: InitMsg }> {
  const client = new Client(WS);
  const room = await client.joinOrCreate(ROOM_WORLD, { dev: name });
  const init = await new Promise<InitMsg>((res) => room.onMessage(S.INIT, res));
  room.onMessage('*', () => {});
  return { client, room, init };
}

/** Hậu tố ngẫu nhiên của lần chạy (đặt tên nhân vật thử). */
export const tag = Math.random().toString(36).slice(2, 7);

/** Phiên dùng chung của các nhóm bài (một nhân vật thử `kiemthu` vào thế giới). */
export interface Ctx {
  client: Client;
  room: Room;
  init: InitMsg;
  me: () => P;
  mons: () => Map<string, M>;
  gm: (cmd: string) => Promise<void>;
}

/** Cổng TCP trống (để server tạm không đụng server của worktree khác). */
function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

/**
 * Dựng tạm một server với `env` (DB tạm, cổng trống), chạy `fn` rồi tắt. AUTH_DEV_BYPASS=1 luôn được bật
 * để chứng minh chốt chặn trong config.ts thắng (giống lỡ mang .env.local lên VPS).
 */
export async function withServer(env: Record<string, string>, fn: (http: string) => Promise<void>): Promise<void> {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-sec-'));
  const port = await freePort();
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    DB_FILE: path.join(tmp, 'game.db'),
    AUTH_DEV_BYPASS: '1',
    ...env,
  };
  delete childEnv.RATE_LIMIT_EXEMPT;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const http = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    // 120 × 0,5 s = 60 s: lần đầu `tsx` biên dịch lạnh, hoặc máy đang chạy server/trình duyệt khác thì 30 s không đủ.
    for (let i = 0; i < 120 && !up && child.exitCode === null; i++) {
      await W(500);
      up = await fetch(http + '/health').then(
        (r) => r.ok,
        () => false,
      );
    }
    if (!up)
      throw new Error(
        `server tạm không lên sau 60 s (${JSON.stringify(env)}; ${child.exitCode === null ? 'tiến trình vẫn chạy, có thể khởi động chậm' : 'thoát mã ' + child.exitCode}):
${log.slice(-800)}`,
      );
    await fn(http);
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode !== null ? r(null) : child.once('exit', r)));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
