// pnpm perf:server (B12, cổng server): chỉ cần CPU nên chạy được trong CI (`.github/workflows/server-gate.yml`).
// Chạy server game riêng (DB tạm, đăng nhập thử, MAX_CLIENTS=128 để mọi bot CHUNG MỘT KÊNH = ca nặng nhất, RATE_LIMIT_EXEMPT=loopback),
// N bot `apps/bot-client` đi săn, chờ `--warm` giây (đủ để p95 trượt của server không còn mẫu lúc đăng nhập), rồi hỏi `/health`
// mỗi 5 s trong `--seconds` giây. Sau đó bot rời êm (server lưu nhân vật), đối soát sổ cái trên DB tạm, tắt server.
// CHẶN (mã thoát 1): bot vào thiếu, tick p95 của room nào > `--tick-ms` (8), có dòng `refId`, sổ cái lệch.
//   pnpm perf:server [--count 100] [--warm 60] [--seconds 60] [--tick-ms 8] [--botargs "--level 15"] [--no-ledger]
//                    [--out bench/results] [--md <file>] [--label tên]
// Cổng 2725/5225 (PORT/CLIENT_PORT đổi được). Ra: server-<nhãn>.json (+ bảng Markdown nếu có --md).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createDevServer, ROOT, sleep } from './lib/devserver';
import { Bots } from './lib/bots';
import { childEnv, env, flag, num, opt, outDir, ports } from './lib/env';
import { quant, round } from './lib/isoreport';
import { parseBotLines } from './lib/aoiparse';
import { evaluate, gateMarkdown, roomStats, type HealthRoom, type ServerGateInput } from './lib/servergate';

const COUNT = num('--count', 100);
const WARM = num('--warm', 60);
const SECONDS = num('--seconds', 60);
const TICK_MS = num('--tick-ms', 8);
const BOT_ARGS = opt('--botargs', '--level 15').split(/\s+/).filter(Boolean);
const LABEL = opt('--label', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
const MD = opt('--md', '');
const { port, clientPort } = ports(2725, 5225);
const POLL_MS = 5000;

async function health(): Promise<{ online: number; rooms: HealthRoom[] } | null> {
  try {
    return (await (await fetch(`http://localhost:${port}/health`)).json()) as { online: number; rooms: HealthRoom[] };
  } catch {
    return null;
  }
}

/** Chạy `ledgerCheck.ts` của server trên DB tạm (server còn sống nhưng không còn ai online: không giao dịch nào đang diễn ra). */
function ledgerCheck(dbFile: string): { ok: boolean; summary: string } {
  const serverDir = path.join(ROOT, 'apps/server');
  const tsx = createRequire(path.join(serverDir, 'package.json')).resolve('tsx/cli');
  const r = spawnSync(process.execPath, [tsx, 'src/tools/ledgerCheck.ts'], {
    cwd: serverDir,
    env: childEnv({ DB_FILE: dbFile }),
    encoding: 'utf8',
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split(/\r?\n/).filter(Boolean);
  for (const l of out) console.log(`[ledger] ${l}`);
  const ok = r.status === 0;
  const head = out.find((l) => /nhân vật, \d+ dòng sổ cái/.test(l)) ?? '';
  return { ok, summary: ok ? `khớp (${head})` : `${out.filter((l) => /^\[/.test(l)).length} chỗ lệch hoặc lỗi chạy (mã ${r.status})` };
}

async function main(): Promise<void> {
  const dev = createDevServer({
    port,
    clientPort,
    tag: 'servergate',
    command: 'pnpm perf:server',
    serverOnly: true,
    env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
  });
  const bots = new Bots(port);
  let inp: ServerGateInput | null = null;
  try {
    await dev.start();
    const joined = await bots.start(COUNT, 'gate', BOT_ARGS);
    console.log(`[servergate] ${joined}/${COUNT} bot đã vào, chờ ${WARM} s rồi đo ${SECONDS} s`);
    await sleep(WARM * 1000);
    const from = bots.out.length;
    const polls: HealthRoom[][] = [];
    const until = Date.now() + SECONDS * 1000;
    while (Date.now() < until) {
      const h = await health();
      if (h) polls.push(h.rooms);
      await sleep(POLL_MS);
    }
    const { kbps } = parseBotLines(bots.out.slice(from));
    const sorted = [...kbps].sort((a, b) => a - b);
    // Dòng `refId` tính trên TOÀN BỘ log bot (kể cả lúc đăng nhập và lúc rời), không chỉ cửa sổ đo.
    await bots.stop();
    const refIdLines = bots.out.filter((l) => /refId/.test(l)).length;
    let ledger: { ok: boolean; summary: string } | null = null;
    if (!flag('--no-ledger')) {
      for (let i = 0; i < 30 && ((await health())?.online ?? 0) > 0; i++) await sleep(500);
      await sleep(1000);
      ledger = ledgerCheck(dev.dbFile);
    }
    inp = {
      botsWanted: COUNT,
      botsJoined: joined,
      rooms: roomStats(polls),
      refIdLines,
      ledgerOk: ledger ? ledger.ok : null,
      ledgerSummary: ledger?.summary ?? '',
      kbpsPerBotP95: sorted.length ? round(quant(sorted, 0.95)) : null,
    };
  } finally {
    await bots.stop();
    dev.stop();
  }
  if (!inp) return;
  const { ok, checks } = evaluate(inp, { tickMs: TICK_MS, minBots: COUNT });
  const note = `${COUNT} bot chung một kênh (\`${BOT_ARGS.join(' ')}\`), chờ ${WARM} s, đo ${SECONDS} s; ${process.platform}/${process.arch}, Node ${process.version}${env('GITHUB_ACTIONS') ? ', runner GitHub Actions' : ''}.`;
  const md = gateMarkdown(inp, checks, ok, note);
  console.log('\n' + md);
  const dir = outDir('bench/results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `server-${LABEL}.json`),
    JSON.stringify({ label: LABEL, ok, limits: { tickMs: TICK_MS }, ...inp, checks }, null, 1),
  );
  if (MD) {
    const f = path.resolve(env('INIT_CWD', process.cwd()), MD);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, md);
  }
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[servergate] lỗi:', e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
});
