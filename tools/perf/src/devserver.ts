// Chạy `pnpm dev` ở cặp cổng riêng cho các công cụ đo (bench, compat): kiểm cổng trống trước, DB tạm,
// đăng nhập thử; luôn tắt cả cây tiến trình khi xong, kể cả khi lỗi hay Ctrl+C. Không bao giờ dùng hay
// kill tiến trình đang nghe ở cổng bận lúc bắt đầu (có thể của worktree khác).

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PID đang nghe trên các cổng (chỉ dùng để kiểm cổng trống và dọn tiến trình con của chính công cụ). */
export function listeningPids(ports: number[]): Map<number, number> {
  const found = new Map<number, number>();
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && ports.includes(Number(m[1]))) found.set(Number(m[1]), Number(m[2]));
      }
      // IPv6: netstat -p TCP không in, hỏi riêng.
      const out6 = execFileSync('netstat', ['-ano', '-p', 'TCPv6'], { encoding: 'utf8' });
      for (const line of out6.split(/\r?\n/)) {
        const m = line.match(/^\s*TCP\s+\[[^\]]*\]:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && ports.includes(Number(m[1]))) found.set(Number(m[1]), Number(m[2]));
      }
    } else {
      for (const p of ports) {
        try {
          const out = execFileSync('lsof', ['-t', `-iTCP:${p}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
          if (out) found.set(p, Number(out.split('\n')[0]));
        } catch {
          /* cổng trống */
        }
      }
    }
  } catch (e) {
    console.warn('[devserver] không đọc được danh sách cổng:', (e as Error).message);
  }
  return found;
}

export function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    /* đã thoát */
  }
}

export interface DevServer {
  readonly port: number;
  readonly clientPort: number;
  readonly logFile: string;
  start(): Promise<void>;
  stop(): void;
}

/**
 * `tag` dùng trong tên file log/DB tạm và tiền tố log; `command` là tên lệnh gợi ý khi cổng bận.
 * `serverOnly`: chỉ chạy server game (`pnpm --filter @dtl/server start`), không Vite; `clientPort` khi đó
 * do công cụ tự phục vụ nên chỉ được kiểm trống lúc đầu, không bao giờ bị kill lúc tắt.
 * `env`: biến môi trường thêm cho server (vd. `RATE_LIMIT_EXEMPT=loopback` khi chạy bot).
 * Đăng ký tự tắt khi tiến trình thoát hoặc nhận SIGINT/SIGTERM/SIGHUP.
 */
export function createDevServer(o: { port: number; clientPort: number; tag: string; command: string; serverOnly?: boolean; env?: Record<string, string> }): DevServer {
  const { port, clientPort, tag } = o;
  const owned = o.serverOnly ? [port] : [port, clientPort];
  let child: ChildProcess | null = null;
  let stopped = false;
  const stamp = Date.now();
  const logFile = path.join(os.tmpdir(), `dtl-${tag}-${port}-${stamp}.log`);
  const dbFile = path.join(os.tmpdir(), `dtl-${tag}-${port}-${stamp}.db`);

  /** Tắt cả cây tiến trình đã spawn, rồi mọi tiến trình còn nghe ở hai cổng (trước khi chạy đã trống, nên chắc chắn là của mình). */
  function stop(): void {
    if (!child || stopped) return;
    stopped = true;
    if (child.pid) killTree(child.pid);
    for (let i = 0; i < 10; i++) {
      const left = listeningPids(owned);
      if (left.size === 0) break;
      for (const pid of new Set(left.values())) killTree(pid);
      execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},300)']);
    }
    const still = listeningPids(owned);
    if (still.size) console.warn(`[${tag}] cổng vẫn bận sau khi tắt: ${[...still.keys()].join(', ')}`);
    else console.log(`[${tag}] đã tắt server, cổng ${owned.join('/')} trống`);
    for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true });
  }
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      stop();
      process.exit(130);
    });
  }

  async function waitHttp(url: string, ms: number): Promise<void> {
    const until = Date.now() + ms;
    let last = '';
    while (Date.now() < until) {
      if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`server thoát sớm (mã ${child.exitCode}), xem ${logFile}`);
      try {
        const r = await fetch(url);
        if (r.ok) return;
        last = 'HTTP ' + r.status;
      } catch (e) {
        last = (e as Error).message;
      }
      await sleep(500);
    }
    throw new Error(`hết giờ chờ ${url} (${last}), xem ${logFile}`);
  }

  async function start(): Promise<void> {
    const busy = listeningPids([port, clientPort]);
    if (busy.size) {
      throw new Error(
        `cổng ${[...busy.keys()].join(', ')} đang bận (có thể của worktree khác: không dùng, không kill). ` +
          `Chọn cặp khác: PORT=26xx CLIENT_PORT=51xx ${o.command}`,
      );
    }
    const script = o.serverOnly ? 'pnpm --filter @dtl/server start' : 'pnpm dev';
    console.log(`[${tag}] chạy ${script} ở ${o.serverOnly ? port : `${port}/${clientPort}`} (log: ${logFile})`);
    const log = fs.openSync(logFile, 'w');
    child = spawn(script, {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), CLIENT_PORT: String(clientPort), AUTH_DEV_BYPASS: '1', DB_FILE: dbFile, NODE_ENV: 'development', ...o.env },
      stdio: ['ignore', log, log],
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
    });
    await waitHttp(`http://localhost:${port}/health`, 90_000);
    if (!o.serverOnly) await waitHttp(`http://localhost:${clientPort}/`, 60_000);
  }

  return { port, clientPort, logFile, start, stop };
}
