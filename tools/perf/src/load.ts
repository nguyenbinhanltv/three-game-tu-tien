// pnpm bench:load (M6-1): đo thứ tự tải "khung hình đầu trước" ở mạng 20 Mbps, bằng Playwright + Chrome headless.
//
// Đo trên bản build thật (không phải Vite dev với hàng trăm module lẻ):
//   1. `vite build` client vào thư mục tạm, với VITE_SERVER_URL trỏ tới server game ở PORT.
//   2. Chạy riêng server game (`pnpm --filter @dtl/server start`, DB tạm, đăng nhập thử) ở PORT.
//   3. Tự phục vụ bản build ở CLIENT_PORT có gzip (giống CDN; server game không nén).
//   4. Mỗi lượt một context mới (cache lạnh), CDP `Network.emulateNetworkConditions` 20 Mbps xuống, 5 Mbps lên,
//      độ trễ 20 ms. Luôn tắt tiếng: `?mute=1` + `--mute-audio`.
// Hai kịch bản:
//   - `login`: mở trang như người mới (chưa đăng nhập): FCP (tiêu đề trong HTML), JS tới, form đăng nhập, cảnh nền 3D.
//   - `game`: `?auto=<tên>`: JS tới → khung game đầu → vào game (màn tiêu đề mờ hết) → GLB về theo thứ tự nào;
//     rồi "lần đầu chiến đấu": gọi 3 sói, ra lần lượt 6 chiêu; ghi mọi khung dài > 50 ms (khựng biên dịch
//     shader/pipeline, parse GLB, tải texture) và thời điểm khựng cuối cùng.
// Mốc thời gian tính từ lúc điều hướng (performance.timeOrigin). Mục tiêu M6-1: khung game đầu < 2 s sau khi JS tới.
// Kết quả: bảng ra stdout, JSON ở bench/results/load-<ngày>.json, so với lần đo trước.
//
// Cờ: --runs N (mặc định 2, báo trung vị)   --mbps 20   --latency 20   --scenarios login,game
//     --no-build (dùng lại bản build tạm lần trước)   --renderer webgpu|webgl2   --headed   --channel chrome|msedge|chromium
// Biến môi trường: PORT, CLIENT_PORT (mặc định 2655/5155), BENCH_CHANNEL.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';
import { createDevServer, listeningPids, ROOT, sleep } from './lib/devserver';
import { buildClient, serveDist } from './lib/dist';
import { args, env, opt, ports } from './lib/env';
import { launchChrome } from './lib/browser';
import { at } from '@dtl/shared';

const OUT_DIR = path.join(ROOT, 'bench/results');

const RUNS = Math.max(1, Number(opt('--runs', '2')));
const MBPS = Number(opt('--mbps', '20'));
const LATENCY = Number(opt('--latency', '20'));
const SCENARIOS = opt('--scenarios', 'login,game').split(',').filter(Boolean);
const RENDERER = opt('--renderer', 'webgpu');
const CHANNEL = opt('--channel', env('BENCH_CHANNEL', 'chrome'));
const HEADED = args.includes('--headed');
const NO_BUILD = args.includes('--no-build');
const { port: PORT, clientPort: CLIENT_PORT } = ports(2655, 5155);
const DIST = path.join(os.tmpdir(), `dtl-load-dist-${PORT}`);
/** Khung dài hơn ngưỡng này (khoảng giữa hai requestAnimationFrame) tính là khựng. */
const LONG_MS = 50;
/** Mục tiêu M6-1. */
const TARGET_FIRST_FRAME_MS = 2000;

// ---------- đo trong trang ----------

declare global {
  interface Window {
    __load: {
      marks: Record<string, number>;
      /** [thời điểm bắt đầu khung, độ dài] của các khung > LONG_MS. */
      long: [number, number][];
      /** [thời điểm, ms] các lần `Game.frame()` chạy > LONG_MS (khựng nằm trong code game). */
      longFrameFn: [number, number, Record<string, number>][];
    };
  }
}

/** Chạy trước mọi script của trang: theo dõi mốc bằng vòng requestAnimationFrame riêng. */
function initScript(longMs: number): void {
  const w = window;
  const L: Window['__load'] = { marks: {}, long: [], longFrameFn: [] };
  w.__load = L;
  const mark = (k: string) => {
    if (L.marks[k] === undefined) L.marks[k] = Math.round(performance.now());
  };
  let prev = 0;
  let wrapped: unknown = null;
  // Tách thời gian trong `Game.frame()` theo phần (chỉ ghi cho khung dài): địa hình, thực thể, VFX, môi trường, vẽ.
  let parts: Record<string, number> = {};
  const wrappedParts = new WeakSet<object>();
  const wrapPart = (obj: any, fn: string, label: string) => {
    if (!obj || typeof obj[fn] !== 'function' || wrappedParts.has(obj[fn])) return;
    const orig = obj[fn].bind(obj);
    const f = (...a: unknown[]) => {
      const t0 = performance.now();
      try {
        return orig(...a);
      } finally {
        parts[label] = (parts[label] ?? 0) + performance.now() - t0;
      }
    };
    wrappedParts.add(f);
    obj[fn] = f;
  };
  const loop = () => {
    const now = performance.now();
    if (prev && now - prev > longMs) L.long.push([Math.round(prev), Math.round(now - prev)]);
    prev = now;
    if (document.getElementById('stage')) mark('jsRun');
    if (document.querySelector('.login-form')) mark('loginForm');
    const boot = document.getElementById('boot');
    if (boot?.classList.contains('lit')) mark('backdropLit');
    if (boot?.classList.contains('gone')) mark('titleGone');
    const g = w.__game;
    if (g) {
      mark('gameCreated');
      if (g.frames > 0) mark('gameFirstFrame');
      if (g.started) mark('worldReady');
      if (wrapped !== g && typeof g.frame === 'function') {
        wrapped = g;
        const orig = g.frame.bind(g);
        g.frame = () => {
          wrapPart(g.terrain, 'update', 'terrain');
          wrapPart(g.ents, 'update', 'ents');
          wrapPart(g.vfx, 'update', 'vfx');
          wrapPart(g.env, 'update', 'env');
          wrapPart(g.post, 'render', 'render');
          parts = {};
          const t0 = performance.now();
          orig();
          const d = performance.now() - t0;
          if (d > longMs) {
            const p: Record<string, number> = {};
            for (const [k, v] of Object.entries(parts)) if (v >= 1) p[k] = Math.round(v);
            L.longFrameFn.push([Math.round(t0), Math.round(d), p]);
          }
        };
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

interface Resource {
  name: string;
  type: string;
  start: number;
  end: number;
  kb: number;
}

interface LoginRun {
  fcp: number;
  html: number;
  js: number;
  jsRun: number;
  loginForm: number;
  backdropLit: number;
  longFrames: number;
}

interface GameRun {
  fcp: number;
  js: number;
  jsRun: number;
  gameFirstFrame: number;
  /** khung game đầu − JS tới (mục tiêu < 2000). */
  firstFrameAfterJs: number;
  worldReady: number;
  titleGone: number;
  glbDone: number;
  glb: Resource[];
  /** Khựng trong lúc tải (trước khi màn tiêu đề mờ hết): bị màn tải che. */
  loadingStalls: { count: number; maxMs: number; list: [number, number][] };
  /** `Game.loadStats` (ms từ lúc `Game.start`), cộng mốc `gameStart` tính từ lúc điều hướng. */
  loadStats: Record<string, number>;
  /** Khựng sau khi vào game (người chơi thấy): gồm lần đầu thấy quái có xương và 6 chiêu. */
  playStalls: { count: number; maxMs: number; totalMs: number; list: [number, number][] };
  /** Thời điểm khung dài cuối cùng kết thúc (ms từ lúc điều hướng): "tới hết khựng". */
  stallFreeAt: number;
  /** Khung `Game.frame()` dài sau khi vào game (phần khựng nằm trong code game). */
  playFrameFn: [number, number, Record<string, number>][];
  /** Mọi khung `Game.frame()` dài (kể cả lúc tải), kèm thời gian theo phần. */
  frameFn: [number, number, Record<string, number>][];
  backend: string;
  errors: string[];
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: LATENCY,
    downloadThroughput: (MBPS * 1e6) / 8,
    uploadThroughput: (5 * 1e6) / 8,
  });
  await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})(${LONG_MS});` });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  return { ctx, page, errors };
}

/** Mốc chung đọc từ trang: FCP, HTML về, JS ban đầu về (entry + modulepreload trong index.html), mọi resource. */
async function readTiming(page: import('playwright').Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
    const initial = new Set<string>();
    for (const el of document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type=module][src], link[rel=modulepreload]')) {
      initial.add(new URL((el as HTMLScriptElement).src || (el as HTMLLinkElement).href, location.href).href);
    }
    const res = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => ({
      name: new URL(r.name).pathname,
      full: r.name,
      type: r.initiatorType,
      start: Math.round(r.startTime),
      end: Math.round(r.responseEnd),
      kb: Math.round((r.encodedBodySize || r.transferSize) / 1024),
    }));
    let js = -1;
    for (const r of res) if (initial.has(r.full)) js = Math.max(js, r.end);
    return {
      fcp: Math.round(fcp),
      html: Math.round(nav.responseEnd),
      js,
      res: res.map(({ full: _f, ...r }) => r),
      L: window.__load,
    };
  });
}

const rendererQ = RENDERER === 'webgl2' ? '&renderer=webgl2' : '';

async function runLogin(browser: Browser): Promise<LoginRun> {
  const { ctx, page } = await newPage(browser);
  try {
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1${rendererQ}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__load.marks.backdropLit !== undefined, undefined, { timeout: 60_000, polling: 100 });
    await sleep(500);
    const t = await readTiming(page);
    return {
      fcp: t.fcp,
      html: t.html,
      js: t.js,
      jsRun: t.L.marks.jsRun ?? Number.NaN,
      loginForm: t.L.marks.loginForm ?? Number.NaN,
      backdropLit: t.L.marks.backdropLit ?? Number.NaN,
      longFrames: t.L.long.length,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function runGame(browser: Browser, i: number): Promise<GameRun> {
  const { ctx, page, errors } = await newPage(browser);
  const name = `Load_${Date.now().toString(36).slice(-5)}${i}`;
  const gm = (cmd: string) => page.evaluate((m) => window.__game!.send('chat', { m }), '/gm ' + cmd);
  try {
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&cine=0&auto=${name}${rendererQ}${env('LOAD_QUERY')}`, {
      waitUntil: 'load',
      timeout: 120_000,
    });
    await page.waitForFunction(() => window.__load.marks.titleGone !== undefined, undefined, { timeout: 120_000, polling: 100 });
    const backend = await page.evaluate(() => (window.__game!.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'));
    // Chờ mọi GLB đang nạp xong (tối đa 30 s) để biết thời điểm và thứ tự về.
    const glbDeadline = Date.now() + 30_000;
    let last = -1;
    while (Date.now() < glbDeadline) {
      const n = await page.evaluate(
        () =>
          (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
            (r) => r.name.endsWith('.glb') && r.responseEnd > 0,
          ).length,
      );
      if (n === last && n > 0) break;
      last = n;
      await sleep(1500);
    }
    // Lần đầu chiến đấu: 3 sói (2 loài có xương) quanh mình, rồi 6 chiêu lần lượt.
    const loadStats = await page.evaluate(() => ({ ...window.__game!.loadStats }));
    await gm('level 15');
    await gm('heal');
    await gm('spawn mon_soi_xam 2');
    await gm('spawn mon_yeu_lang 1');
    await sleep(1500);
    for (let s = 0; s < 6; s++) {
      await page.evaluate((slot) => {
        const g = window.__game!;
        const id = g.ents.nextTarget('', g.renderPos.x, g.renderPos.z);
        if (id) g.setTarget(id, 'mon');
        g.useSkill(slot);
      }, s);
      await sleep(1300);
    }
    await gm('heal');
    await sleep(2000);
    const t = await readTiming(page);
    const m = t.L.marks;
    const glb = t.res.filter((r) => r.name.endsWith('.glb')).sort((a, b) => a.end - b.end);
    const before = t.L.long.filter(([s]) => s < (m.titleGone ?? Number.NaN));
    const after = t.L.long.filter(([s]) => s >= (m.titleGone ?? Number.NaN));
    const lastLong = t.L.long[t.L.long.length - 1];
    return {
      fcp: t.fcp,
      js: t.js,
      jsRun: m.jsRun ?? Number.NaN,
      gameFirstFrame: m.gameFirstFrame ?? Number.NaN,
      firstFrameAfterJs: (m.gameFirstFrame ?? Number.NaN) - t.js,
      worldReady: m.worldReady ?? Number.NaN,
      titleGone: m.titleGone ?? Number.NaN,
      glbDone: glb.length ? at(glb, glb.length - 1, 'glb').end : -1,
      glb,
      loadingStalls: { count: before.length, maxMs: Math.max(0, ...before.map((l) => l[1])), list: before },
      loadStats,
      playStalls: {
        count: after.length,
        maxMs: Math.max(0, ...after.map((l) => l[1])),
        totalMs: after.reduce((a, l) => a + l[1], 0),
        list: after,
      },
      stallFreeAt: lastLong ? lastLong[0] + lastLong[1] : 0,
      playFrameFn: t.L.longFrameFn.filter(([s]) => s >= (m.titleGone ?? Number.NaN)),
      frameFn: t.L.longFrameFn,
      backend,
      errors,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

// ---------- báo cáo ----------

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] ?? NaN) : NaN;
};
const sec = (ms: number) => (Number.isFinite(ms) && ms >= 0 ? (ms / 1000).toFixed(2) + ' s' : '—');

function previous(): { login?: LoginRun[]; game?: GameRun[]; file: string } | null {
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^load-.*\.json$/.test(f))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, at(files, i, 'files')), 'utf8'));
      if (j.mbps === MBPS && j.renderer === RENDERER) return { ...j, file: files[i] };
    } catch {
      /* file kết quả cũ hỏng: bỏ qua, xét file kế */
    }
  }
  return null;
}

async function main(): Promise<void> {
  const busy = listeningPids([CLIENT_PORT]);
  if (busy.size) throw new Error(`cổng ${CLIENT_PORT} đang bận (có thể của worktree khác: không dùng, không kill). Chọn CLIENT_PORT khác.`);
  buildClient({ dist: DIST, serverPort: PORT, reuse: NO_BUILD, tag: 'load' });
  const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'load', command: 'pnpm bench:load', serverOnly: true });
  await dev.start();
  const srv = await serveDist(DIST, CLIENT_PORT);
  console.log(`[load] phục vụ bản build ở http://localhost:${CLIENT_PORT} (gzip), mạng ${MBPS} Mbps / ${LATENCY} ms`);
  const browser = await launchChrome({ channel: CHANNEL, headed: HEADED, tag: 'load' });
  const login: LoginRun[] = [];
  const game: GameRun[] = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      if (SCENARIOS.includes('login')) {
        const r = await runLogin(browser);
        login.push(r);
        console.log(
          `[load] login #${i + 1}: FCP ${sec(r.fcp)}, JS ${sec(r.js)}, form ${sec(r.loginForm)}, cảnh nền 3D ${sec(r.backdropLit)}`,
        );
      }
      if (SCENARIOS.includes('game')) {
        const r = await runGame(browser, i);
        game.push(r);
        console.log(
          `[load] game #${i + 1} (${r.backend}): JS ${sec(r.js)}, khung đầu ${sec(r.gameFirstFrame)} (+${sec(r.firstFrameAfterJs)} sau JS), ` +
            `vào game ${sec(r.titleGone)}, GLB xong ${sec(r.glbDone)}, khựng sau khi vào ${r.playStalls.count} (max ${r.playStalls.maxMs} ms), hết khựng ${sec(r.stallFreeAt)}`,
        );
        if (r.errors.length) console.log('  lỗi console:', r.errors.slice(0, 5).join(' | '));
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    srv.close();
    dev.stop();
  }

  const prev = previous();
  const rows: [string, number, number | undefined, number?][] = [];
  if (login.length) {
    const p = prev?.login;
    const pm = (k: keyof LoginRun) => (p?.length ? median(p.map((r) => r[k] as number)) : undefined);
    rows.push(['login: FCP (tiêu đề HTML)', median(login.map((r) => r.fcp)), pm('fcp')]);
    rows.push(['login: JS ban đầu tới', median(login.map((r) => r.js)), pm('js')]);
    rows.push(['login: form đăng nhập', median(login.map((r) => r.loginForm)), pm('loginForm')]);
    rows.push(['login: cảnh nền 3D hiện', median(login.map((r) => r.backdropLit)), pm('backdropLit')]);
  }
  if (game.length) {
    const p = prev?.game;
    const pm = (f: (r: GameRun) => number) => (p?.length ? median(p.map(f)) : undefined);
    const add = (label: string, f: (r: GameRun) => number, target?: number) => rows.push([label, median(game.map(f)), pm(f), target]);
    add('game: JS ban đầu tới', (r) => r.js);
    add('game: khung game đầu', (r) => r.gameFirstFrame);
    add('game: khung đầu − JS tới', (r) => r.firstFrameAfterJs, TARGET_FIRST_FRAME_MS);
    add('game: vào game (tiêu đề mờ hết)', (r) => r.titleGone);
    add('game: GLB về hết', (r) => r.glbDone);
    add('game: hết khựng (khung > 50 ms cuối)', (r) => r.stallFreeAt);
    add('game: số khựng sau khi vào', (r) => r.playStalls.count);
    add('game: khựng dài nhất sau khi vào (ms)', (r) => r.playStalls.maxMs);
    add('game: tổng ms khựng sau khi vào', (r) => r.playStalls.totalMs);
  }
  console.log(`\nM6-1 tải ở ${MBPS} Mbps (${RUNS} lượt, trung vị${prev ? `; so với ${prev.file}` : ''}):`);
  for (const [label, v, pv, target] of rows) {
    const isCount = /số|ms\)|tổng ms/.test(label);
    const fmt = (x: number) => (isCount ? String(x) : sec(x));
    const cmp = pv !== undefined && Number.isFinite(pv) ? `  (trước ${fmt(pv)})` : '';
    const ok = target !== undefined ? (v < target ? '  ĐẠT' : '  CHƯA ĐẠT') + ` (< ${sec(target)})` : '';
    console.log(`  ${label.padEnd(40)} ${fmt(v).padStart(9)}${cmp}${ok}`);
  }
  if (game.length) {
    console.log('  thứ tự GLB về (lượt cuối):');
    for (const g of at(game, game.length - 1, 'game').glb)
      console.log(`    ${g.name.padEnd(44)} ${String(g.kb).padStart(6)} KB  ${sec(g.start)} → ${sec(g.end)}`);
    const pf = at(game, game.length - 1, 'game').playFrameFn;
    if (pf.length)
      console.log(
        '  Game.frame() > 50 ms sau khi vào (lượt cuối):',
        pf.map(([s, d, p]) => `${sec(s)}:${d}ms ${JSON.stringify(p)}`).join(', '),
      );
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  let file = path.join(OUT_DIR, `load-${day}.json`);
  if (fs.existsSync(file)) file = path.join(OUT_DIR, `load-${day}_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ date: new Date().toISOString(), mbps: MBPS, latency: LATENCY, renderer: RENDERER, runs: RUNS, login, game }, null, 2),
  );
  console.log(`\n[load] lưu ${path.relative(ROOT, file)}`);
  const fail = game.some((r) => !(r.firstFrameAfterJs < TARGET_FIRST_FRAME_MS));
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => {
  console.error('[load] lỗi:', e);
  process.exitCode = 1;
});
