// Chạy bot headless (`apps/bot-client`) làm tiến trình con cho công cụ đo/chụp cần đám đông (bench:crowd, shots n7).
// Server phải bật `RATE_LIMIT_EXEMPT=loopback` (bot chung một IP) và `MAX_CLIENTS` đủ lớn để mọi bot chung kênh với client đo.
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { killTree, ROOT, sleep } from './devserver';

const botRequire = createRequire(path.join(ROOT, 'apps/bot-client/package.json'));
const TSX_CLI = botRequire.resolve('tsx/cli');

export class Bots {
  child: ChildProcess | null = null;
  out: string[] = [];
  constructor(private port: number) {}

  /** Chạy `count` bot với các cờ `extra` (`--crowd`, `--set`…); trả số bot đã vào room. */
  async start(count: number, prefix: string, extra: string[]): Promise<number> {
    const a = [
      TSX_CLI,
      'src/index.ts',
      '--count',
      String(count),
      '--duration',
      '3600',
      '--url',
      `ws://localhost:${this.port}`,
      '--prefix',
      prefix,
      ...extra,
    ];
    this.out = [];
    this.child = spawn(process.execPath, a, { cwd: path.join(ROOT, 'apps/bot-client'), stdio: ['pipe', 'pipe', 'pipe'] });
    const onData = (d: Buffer) => this.out.push(...String(d).split(/\r?\n/).filter(Boolean));
    this.child.stdout!.on('data', onData);
    this.child.stderr!.on('data', onData);
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      const line = this.out.find((l) => /bot đã vào/.test(l));
      if (line) return Number(line.match(/(\d+) bot đã vào/)?.[1] ?? 0);
      if (this.child.exitCode !== null) break;
      await sleep(250);
    }
    throw new Error('bot không khởi động được:\n' + this.out.slice(-10).join('\n'));
  }

  /** Gửi "quit" để bot rời room êm; quá 20 giây thì kill cả cây. */
  async stop(): Promise<void> {
    const c = this.child;
    if (!c) return;
    this.child = null;
    try {
      c.stdin!.write('quit\n');
    } catch {
      /* đã thoát */
    }
    const until = Date.now() + 20_000;
    while (c.exitCode === null && Date.now() < until) await sleep(200);
    if (c.exitCode === null && c.pid) killTree(c.pid);
  }
}
