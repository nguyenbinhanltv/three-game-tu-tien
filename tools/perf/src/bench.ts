// pnpm bench:client: đo hiệu năng client theo đường camera cố định, bằng Playwright (Chromium headless).
//
// Tự chạy `pnpm dev` ở cặp cổng riêng (PORT/CLIENT_PORT, mặc định 2635/5135) với DB tạm và đăng nhập thử,
// mở game với `?mute=1&debug=1&cine=0&auto=<tên>` (+ `&renderer=webgl2`), lần lượt cho mỗi renderer × preset:
//   dịch chuyển bằng `/gm tp` tới sân tông môn, rừng linh thảo, bờ hồ sương mù; chờ ô địa hình nạp xong;
//   xoay camera trọn một vòng trong N giây; ghi mỗi khung: thời gian CPU của `frame()`, draw call, tam giác.
// Không sửa code game: bench bọc `__game.frame` (vòng `setAnimationLoop` gọi `this.frame()` nên bọc ở
// instance là đủ) và bọc `backend.createTexture/destroyTexture` để ước tính byte texture trên GPU
// (`renderer.info.memory` của three r178 chỉ đếm số texture). `renderer.info.autoReset = false` và engine
// reset ở đầu `frame()`, nên số đọc ngay sau `frame()` là của cả khung (pass cảnh + hậu kỳ).
//
// Kết quả: bảng ra stdout, JSON ở bench/results/<ngày>.json (trùng ngày thì thêm giờ), so với lần đo trước
// và báo chỉ số xấu đi quá 10%. Server luôn được tắt khi xong, kể cả khi lỗi hoặc Ctrl+C.
//
// Cờ:
//   --renderers webgpu,webgl2   --presets low,medium,high   --seconds 8 (mỗi điểm)   --size 1280x720
//   --channel chrome|msedge|chromium (mặc định chrome nếu có, không thì Chromium của Playwright)
//   --dpr 1 (devicePixelRatio giả lập, ví dụ 2 cho màn HiDPI)   --headed (mở cửa sổ thật, vẫn tắt tiếng)
//   --switch N: không đo; đổi preset N lần khi đang bắn VFX, báo lỗi console và rò geometry/texture (pnpm bench:switch)
// Biến môi trường: PORT, CLIENT_PORT (cổng cho server/Vite do bench tự chạy), BENCH_CHANNEL.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FOREST, LAKE, LAKE_WATER_R, SPAWN_POINT } from '@dtl/shared';
import { chromium, type Browser, type Page } from 'playwright';
import { createDevServer, ROOT, sleep } from './devserver';

const OUT_DIR = path.join(ROOT, 'bench/results');

// ---------- tham số ----------
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const RENDERERS = opt('--renderers', 'webgpu,webgl2').split(',').filter(Boolean) as ('webgpu' | 'webgl2')[];
const PRESETS = opt('--presets', 'low,medium,high').split(',').filter(Boolean);
const SECONDS = Number(opt('--seconds', '8'));
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const CHANNEL = opt('--channel', process.env.BENCH_CHANNEL ?? 'chrome');
const HEADED = args.includes('--headed');
/** devicePixelRatio giả lập; engine lấy min(dpr, pixelRatio của preset) nên dpr 1 làm các preset chỉ khác hậu kỳ/bóng. */
const DPR = Number(opt('--dpr', '1'));
const PORT = Number(process.env.PORT ?? 2635);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5135);

/** Đường camera cố định: sân tông môn (chỗ hồi sinh), giữa rừng, bờ đông hồ (nhìn ra mặt nước khi xoay). */
const WAYPOINTS = [
  { name: 'san_tong_mon', x: SPAWN_POINT.x, z: SPAWN_POINT.z },
  { name: 'rung', x: FOREST.x, z: FOREST.z },
  { name: 'ho', x: LAKE.x + LAKE_WATER_R + 12, z: LAKE.z },
];
const CAM = { pitch: 0.38, dist: 13 };

/** Ngưỡng desktop trong skill perf-budget. */
const BUDGET = { drawCalls: 300, triangles: 2_000_000, textureMB: 512, cpuP95Ms: 8, heapMB: 500 };

// ---------- quản lý server dev ----------
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'bench', command: 'pnpm bench:client' });
const startServer = dev.start;
const stopServer = dev.stop;

// ---------- đo trong trang ----------
type FrameRow = [cpuMs: number, drawCalls: number, triangles: number];
type BenchWindow = {
  __bench: {
    rec: boolean;
    frames: FrameRow[];
    cam: { t0: number; dur: number; yaw0: number; pitch: number; dist: number } | null;
    texBytes: () => number;
    texCount: () => number;
    texTop: (n: number) => string[];
    patched: unknown;
  };
  __game?: Record<string, any>;
};

/** Chạy trong trang trước mọi script của game: đặt preset, bắt `window.__game` để bọc `frame()` và backend. */
function initScript(preset: string): void {
  localStorage.setItem('dtl.quality', preset);
  const w = window as unknown as BenchWindow;
  const tex = new Map<object, number>();
  const texDesc = new Map<object, string>();
  const B: BenchWindow['__bench'] = {
    rec: false,
    frames: [],
    cam: null,
    texBytes: () => {
      let s = 0;
      for (const v of tex.values()) s += v;
      return s;
    },
    texCount: () => tex.size,
    texTop: (n) =>
      [...tex.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([t, b]) => `${(b / 1048576).toFixed(1)}MB ${texDesc.get(t)}`),
    patched: null,
  };
  w.__bench = B;
  // Byte/điểm ảnh: số kênh × byte mỗi kênh (hằng số của three r178); nén khối ≈ 1 B/px (BC7/ASTC 4x4), 0,5 với BC1/ETC1/RGTC1.
  const COMPS: Record<number, number> = { 1021: 1, 1022: 4, 1023: 4, 1026: 1, 1027: 1, 1028: 1, 1029: 1, 1030: 2, 1031: 2, 1033: 4 };
  const TYPE_B: Record<number, number> = { 1009: 1, 1010: 1, 1011: 2, 1012: 2, 1013: 4, 1014: 4, 1015: 4, 1016: 2, 1017: 2, 1018: 2, 1020: 4, 35902: 4 };
  const HALF_BLOCK = new Set([33776, 33777, 36196, 37492, 36283, 36284, 35840, 35841]);
  const bytesOf = (t: any, o: any): number => {
    const w0 = Math.max(1, o?.width ?? t.image?.width ?? 1);
    const h0 = Math.max(1, o?.height ?? t.image?.height ?? 1);
    const d0 = Math.max(1, o?.depth ?? 1);
    const levels = Math.max(1, o?.levels ?? 1);
    const bpp = t.isCompressedTexture ? (HALF_BLOCK.has(t.format) ? 0.5 : 1) : (COMPS[t.format] ?? 4) * (TYPE_B[t.type] ?? 1);
    const samples = Math.max(1, t.isRenderTargetTexture ? (o?.sampleCount ?? 1) : 1);
    let total = 0;
    for (let l = 0; l < levels; l++) {
      const d = t.is3DTexture ? Math.max(1, d0 >> l) : d0;
      total += Math.max(1, w0 >> l) * Math.max(1, h0 >> l) * d * bpp;
    }
    return total * samples;
  };
  const hook = (g: Record<string, any>) => {
    const frame = g.frame;
    g.frame = function benchFrame(this: unknown) {
      const r = g.renderer;
      const be = r?.backend;
      // Backend có thể đổi trong init() (WebGPU lùi WebGL2), nên bọc lại khi thấy backend mới.
      if (be && B.patched !== be) {
        B.patched = be;
        const create = be.createTexture.bind(be);
        const destroy = be.destroyTexture.bind(be);
        be.createTexture = (t: object, o: unknown) => {
          create(t, o);
          tex.set(t, bytesOf(t, o));
          const a = t as any;
          const oo = o as any;
          texDesc.set(t, `${a.name || a.constructor?.name} ${oo?.width}x${oo?.height}x${oo?.depth ?? 1} L${oo?.levels ?? 1} f${a.format} t${a.type} s${oo?.sampleCount ?? 1}`);
        };
        be.destroyTexture = (t: object) => {
          tex.delete(t);
          texDesc.delete(t);
          destroy(t);
        };
      }
      const c = B.cam;
      if (c) {
        const k = Math.min(1, (performance.now() - c.t0) / c.dur);
        g.camYaw = c.yaw0 + k * Math.PI * 2;
        g.camPitch = c.pitch;
        g.camDist = c.dist;
      }
      const t0 = performance.now();
      frame.call(g);
      const dt = performance.now() - t0;
      if (B.rec && r) B.frames.push([dt, r.info.render.drawCalls ?? r.info.render.calls, r.info.render.triangles]);
    };
  };
  let game: Record<string, any> | undefined;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set: (g) => {
      game = g;
      // Engine gán __game rồi gọi start() ngay sau: bọc sau tác vụ hiện tại.
      queueMicrotask(() => hook(g));
    },
  });
}

const quant = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

type Point = {
  name: string;
  x: number;
  z: number;
  /** Đã tới đúng chỗ sau /gm tp (sai thì số đo là của chỗ khác). */
  arrived: boolean;
  frames: number;
  fps: number;
  cpuMs: { p50: number; p95: number; max: number; mean: number };
  drawCalls: { p50: number; max: number };
  triangles: { p50: number; max: number };
  textures: number;
  textureMB: number;
  geometries: number;
  terrainTiles: number;
  monsters: number;
  jsHeapMB: number | null;
  /** Texture lớn nhất (ước tính): byte, tên, kích thước, mip, format/type của three, số mẫu. */
  topTextures: string[];
};
type Run = {
  renderer: string;
  backend: string;
  adapter: string;
  preset: string;
  viewport: string;
  pixelRatio: number;
  loadMs: number;
  loadStats: Record<string, number>;
  points: Point[];
  errors: string[];
};

/** Server bỏ tin chat cách tin trước dưới 800 ms (`Sim.onChat`, `sys.chat_rate`), nên chờ đủ trước lệnh kế tiếp. */
const GM_GAP_MS = 1000;

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as BenchWindow).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(GM_GAP_MS);
}

async function runOne(browser: Browser, renderer: 'webgpu' | 'webgl2', preset: string): Promise<Run> {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  // tsx (esbuild keepNames) chèn helper `__name` vào hàm đã biên dịch; trang không có helper này nên tạo shim.
  await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})(${JSON.stringify(preset)});` });
  const name = `Bench_${renderer === 'webgpu' ? 'gpu' : 'gl'}_${preset}`.slice(0, 14);
  const url = `http://localhost:${CLIENT_PORT}/?mute=1&debug=1&cine=0&auto=${encodeURIComponent(name)}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}`;
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(
      () => {
        const g = (window as unknown as BenchWindow).__game;
        return !!g && g.frames > 30 && !!g.me?.();
      },
      undefined,
      { timeout: 120_000, polling: 250 },
    );
    const loadMs = Date.now() - t0;
    const info = await page.evaluate(async () => {
      const g = (window as unknown as BenchWindow).__game!;
      const be = g.renderer.backend;
      let adapter = '';
      if (be.isWebGPUBackend) {
        const a = await (navigator as any).gpu?.requestAdapter();
        const i = a?.info ?? {};
        adapter = [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ');
      } else {
        const gl = be.gl as WebGL2RenderingContext | undefined;
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        adapter = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
      }
      return { backend: be.isWebGPUBackend ? 'WebGPU' : 'WebGL2', adapter, pixelRatio: g.renderer.getPixelRatio(), loadStats: { ...g.loadStats } };
    });
    await gm(page, 'level 15');
    const points: Point[] = [];
    for (const wp of WAYPOINTS) {
      await gm(page, `tp ${wp.x} ${wp.z}`);
      await gm(page, 'heal');
      // Chờ tới nơi và ô địa hình quanh đó nạp xong (số ô đứng yên 1,5 giây, tối thiểu 3 giây, tối đa 20 giây).
      const until = Date.now() + 20_000;
      const start = Date.now();
      let lastTiles = -1;
      let stableSince = Date.now();
      let arrived = false;
      while (Date.now() < until) {
        const s = await page.evaluate(() => {
          const g = (window as unknown as BenchWindow).__game!;
          return { tiles: g.terrain.tileCount() as number, x: g.renderPos.x as number, z: g.renderPos.z as number };
        });
        const near = Math.hypot(s.x - wp.x, s.z - wp.z) < 3;
        arrived = near;
        if (s.tiles !== lastTiles || !near) {
          lastTiles = s.tiles;
          stableSince = Date.now();
        }
        if (near && Date.now() - start > 3000 && Date.now() - stableSince > 1500) break;
        await sleep(250);
      }
      await page.evaluate(
        ({ dur, cam }) => {
          const B = (window as unknown as BenchWindow).__bench;
          B.frames = [];
          B.cam = { t0: performance.now(), dur, yaw0: 0, pitch: cam.pitch, dist: cam.dist };
          B.rec = true;
        },
        { dur: SECONDS * 1000, cam: CAM },
      );
      const recStart = Date.now();
      await sleep(SECONDS * 1000);
      const raw = await page.evaluate(() => {
        const w = window as unknown as BenchWindow;
        const B = w.__bench;
        B.rec = false;
        B.cam = null;
        const g = w.__game!;
        const mem = (performance as any).memory;
        return {
          frames: B.frames,
          textures: g.renderer.info.memory.textures as number,
          texBytes: B.texBytes(),
          top: B.texTop(6),
          geometries: g.renderer.info.memory.geometries as number,
          tiles: g.terrain.tileCount() as number,
          monsters: g.ents.monsters.size as number,
          heap: mem ? (mem.usedJSHeapSize as number) : null,
        };
      });
      const secs = (Date.now() - recStart) / 1000;
      const cpu = raw.frames.map((f) => f[0]).sort((a, b) => a - b);
      const dc = raw.frames.map((f) => f[1]).sort((a, b) => a - b);
      const tri = raw.frames.map((f) => f[2]).sort((a, b) => a - b);
      points.push({
        name: wp.name,
        x: wp.x,
        z: wp.z,
        arrived,
        frames: raw.frames.length,
        fps: round(raw.frames.length / secs, 1),
        cpuMs: {
          p50: round(quant(cpu, 0.5)),
          p95: round(quant(cpu, 0.95)),
          max: round(cpu[cpu.length - 1] ?? 0),
          mean: round(cpu.reduce((s, v) => s + v, 0) / Math.max(1, cpu.length)),
        },
        drawCalls: { p50: quant(dc, 0.5), max: dc[dc.length - 1] ?? 0 },
        triangles: { p50: Math.round(quant(tri, 0.5)), max: Math.round(tri[tri.length - 1] ?? 0) },
        textures: raw.textures,
        textureMB: round(raw.texBytes / 1024 / 1024, 1),
        geometries: raw.geometries,
        terrainTiles: raw.tiles,
        monsters: raw.monsters,
        jsHeapMB: raw.heap === null ? null : round(raw.heap / 1024 / 1024, 1),
        topTextures: raw.top,
      });
    }
    return { renderer, backend: info.backend, adapter: info.adapter, preset, viewport: `${VW}x${VH}`, pixelRatio: info.pixelRatio, loadMs, loadStats: info.loadStats, points, errors };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

// ---------- đổi preset liên tục (--switch N) ----------
type SwitchSample = { step: number; preset: string; geometries: number; textures: number; gpuTextures: number; programs: number };
type SwitchRun = { renderer: string; backend: string; switches: number; samples: SwitchSample[]; leaks: string[]; errors: string[] };

/**
 * Nạp game một lần, rồi đổi preset `n` lần theo vòng cao → thấp → vừa → thấp → cao… (gồm mọi cặp chuyển),
 * trong lúc liên tục bắn VFX (mưa kiếm, sét, chém, nổ) quanh nhân vật. Mỗi lần đổi chờ ~0,6 giây cho đủ khung.
 * Đạt khi: không lỗi console/pageerror, và sau vòng đầu (đã dựng đủ mọi pipeline/material) số geometry,
 * texture (renderer.info.memory) và texture GPU sống không tăng thêm quá 2 ở cùng preset.
 */
async function runSwitch(browser: Browser, renderer: 'webgpu' | 'webgl2', n: number): Promise<SwitchRun> {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && /webgpu|pipeline|attachment|GL_INVALID/i.test(m.text()))) errors.push(m.text().slice(0, 300));
  });
  await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})("high");` });
  const name = `Swap_${renderer === 'webgpu' ? 'gpu' : 'gl'}`;
  const url = `http://localhost:${CLIENT_PORT}/?mute=1&debug=1&cine=0&auto=${name}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}`;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => {
      const g = (window as unknown as BenchWindow).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    const backend = await page.evaluate(() => ((window as unknown as BenchWindow).__game!.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'));
    // VFX liên tục: mỗi 150 ms một hiệu ứng quanh nhân vật (đủ loại material có markBloom).
    await page.evaluate(() => {
      const g = (window as unknown as BenchWindow).__game!;
      let i = 0;
      (window as any).__swapFx = setInterval(() => {
        const p = g.renderPos;
        const v = g.vfx;
        const at = p.clone().add({ x: 3, y: 1, z: 0 });
        switch (i++ % 5) {
          case 0: v.swordRain(p.x + 4, p.y, p.z, 3, 0x9fe8ff); break;
          case 1: v.lightning(p.x - 3, p.y, p.z + 2); break;
          case 2: v.burst(at, 0xffd27a); break;
          case 3: v.slash(p.clone().add({ x: 0, y: 1, z: 0 }), () => at, 0x9fe8ff); break;
          default: v.pillar(() => at, 0xd6c4ff, 0.6); break;
        }
      }, 150);
    });
    const order = ['low', 'medium', 'low', 'high', 'medium', 'high'];
    const samples: SwitchSample[] = [];
    for (let step = 0; step < n; step++) {
      const preset = order[step % order.length];
      const s = await page.evaluate(async (q) => {
        const w = window as unknown as BenchWindow;
        const g = w.__game!;
        g.setQuality(q);
        await new Promise((r) => setTimeout(r, 600));
        const m = g.renderer.info.memory;
        const progs = (g.renderer.info as any).programs;
        return { geometries: m.geometries as number, textures: m.textures as number, gpuTextures: w.__bench.texCount(), programs: Array.isArray(progs) ? progs.length : (progs ?? 0) };
      }, preset);
      samples.push({ step, preset, ...s });
    }
    await page.evaluate(() => clearInterval((window as any).__swapFx));
    // So vòng đầu với vòng cuối, cùng preset.
    const leaks: string[] = [];
    for (const preset of new Set(order)) {
      const at = samples.filter((s) => s.preset === preset);
      if (at.length < 3) continue;
      const first = at[1];
      const last = at[at.length - 1];
      for (const k of ['geometries', 'textures', 'gpuTextures'] as const) {
        if (last[k] - first[k] > 2) leaks.push(`${preset}: ${k} ${first[k]} → ${last[k]}`);
      }
    }
    return { renderer, backend, switches: n, samples, leaks, errors };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function mainSwitch(n: number): Promise<void> {
  await startServer();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: CHANNEL === 'chromium' ? undefined : CHANNEL, headless: !HEADED, args: launchArgs });
  } catch {
    browser = await chromium.launch({ headless: !HEADED, args: launchArgs });
  }
  let fail = false;
  try {
    for (const renderer of RENDERERS) {
      const r = await runSwitch(browser, renderer, n);
      console.log(`\n[switch] ${r.backend}: ${r.switches} lần đổi preset, ${r.errors.length} lỗi console, ${r.leaks.length ? 'RÒ: ' + r.leaks.join('; ') : 'không rò'}`);
      for (const s of r.samples) console.log(`  #${lpad(s.step, 2)} ${pad(s.preset, 7)} geo ${lpad(s.geometries, 5)} tex ${lpad(s.textures, 4)} gpuTex ${lpad(s.gpuTextures, 4)} prog ${s.programs}`);
      for (const e of [...new Set(r.errors)].slice(0, 10)) console.log('  lỗi: ' + e);
      if (renderer === 'webgpu' && r.backend !== 'WebGPU') console.warn('[switch] cảnh báo: yêu cầu WebGPU nhưng renderer đã lùi về WebGL2');
      if (r.errors.length || r.leaks.length) fail = true;
    }
  } finally {
    await browser.close().catch(() => undefined);
    stopServer();
  }
  console.log(fail ? '\n[switch] KHÔNG ĐẠT' : '\n[switch] ĐẠT');
  process.exitCode = fail ? 1 : 0;
}

// ---------- báo cáo ----------
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

function flags(p: Point): string {
  const over: string[] = [];
  if (p.drawCalls.max >= BUDGET.drawCalls) over.push('draw');
  if (p.triangles.max > BUDGET.triangles) over.push('tri');
  if (p.textureMB > BUDGET.textureMB) over.push('tex');
  if (p.cpuMs.p95 > BUDGET.cpuP95Ms) over.push('cpu');
  if (p.jsHeapMB !== null && p.jsHeapMB > BUDGET.heapMB) over.push('heap');
  const verdict = over.length ? 'VƯỢT ' + over.join(',') : 'đạt';
  return p.arrived ? verdict : verdict + ' (CHƯA TỚI ĐIỂM, số đo là của chỗ khác)';
}

function printRuns(runs: Run[]): void {
  console.log(
    '\n' +
      pad('backend', 8) + pad('preset', 8) + pad('điểm', 14) + lpad('fps', 6) + lpad('cpu p50', 9) + lpad('p95', 7) + lpad('draw max', 10) +
      lpad('tri max', 10) + lpad('tex', 6) + lpad('tex MB', 8) + lpad('heap MB', 9) + '  ngân sách',
  );
  for (const r of runs) {
    for (const p of r.points) {
      console.log(
        pad(r.backend, 8) + pad(r.preset, 8) + pad(p.name, 14) + lpad(p.fps, 6) + lpad(p.cpuMs.p50, 9) + lpad(p.cpuMs.p95, 7) +
          lpad(p.drawCalls.max, 10) + lpad(Math.round(p.triangles.max / 1000) + 'k', 10) + lpad(p.textures, 6) + lpad(p.textureMB, 8) +
          lpad(p.jsHeapMB ?? '-', 9) + '  ' + flags(p),
      );
    }
  }
}

/** So với lần đo trước: chỉ số tăng quá 10% (cpu p95, draw max, tri max, tex MB). */
function compare(runs: Run[], prevFile: string | null): { worse: string[]; pairs: number } {
  if (!prevFile) return { worse: [], pairs: 0 };
  let pairs = 0;
  const prev = JSON.parse(fs.readFileSync(prevFile, 'utf8')) as { runs: Run[] };
  const worse: string[] = [];
  for (const r of runs) {
    const pr = prev.runs?.find((x) => x.renderer === r.renderer && x.preset === r.preset && x.viewport === r.viewport && x.pixelRatio === r.pixelRatio);
    if (!pr) continue;
    for (const p of r.points) {
      const pp = pr.points.find((x) => x.name === p.name);
      if (!pp) continue;
      pairs++;
      const check = (label: string, now: number, before: number, floor: number) => {
        if (now > before * 1.1 && now - before > floor) worse.push(`${r.backend}/${r.preset}/${p.name}: ${label} ${before} → ${now}`);
      };
      check('cpu p95 (ms)', p.cpuMs.p95, pp.cpuMs.p95, 0.5);
      check('draw max', p.drawCalls.max, pp.drawCalls.max, 3);
      check('tri max', p.triangles.max, pp.triangles.max, 5000);
      check('tex MB', p.textureMB, pp.textureMB, 1);
    }
  }
  return { worse, pairs };
}

// ---------- main ----------
async function main(): Promise<void> {
  const started = new Date();
  await startServer();
  let browser: Browser;
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  try {
    browser = await chromium.launch({ channel: CHANNEL === 'chromium' ? undefined : CHANNEL, headless: !HEADED, args: launchArgs });
  } catch (e) {
    if (CHANNEL === 'chromium') throw e;
    console.warn(`[bench] không mở được channel "${CHANNEL}" (${(e as Error).message.split('\n')[0]}), dùng Chromium của Playwright`);
    browser = await chromium.launch({ headless: !HEADED, args: launchArgs });
  }
  const runs: Run[] = [];
  try {
    for (const renderer of RENDERERS) {
      for (const preset of PRESETS) {
        process.stdout.write(`[bench] ${renderer} / ${preset} … `);
        const r = await runOne(browser, renderer, preset);
        runs.push(r);
        console.log(`${r.backend} (${r.adapter || '?'}), nạp ${(r.loadMs / 1000).toFixed(1)} s, ${r.errors.length} lỗi console`);
        if (renderer === 'webgpu' && r.backend !== 'WebGPU') console.warn('[bench] cảnh báo: yêu cầu WebGPU nhưng renderer đã lùi về WebGL2');
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    stopServer();
  }

  printRuns(runs);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const day = started.toLocaleDateString('sv-SE');
  const previous = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(f))
    .sort()
    .pop();
  let out = path.join(OUT_DIR, `${day}.json`);
  if (fs.existsSync(out)) out = path.join(OUT_DIR, `${day}_${started.toTimeString().slice(0, 8).replace(/:/g, '')}.json`);
  const { worse, pairs } = compare(runs, previous ? path.join(OUT_DIR, previous) : null);
  let gitSha = '';
  try {
    gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* không có git */
  }
  const result = {
    kind: 'bench:client',
    date: started.toISOString(),
    git: gitSha,
    browser: `${CHANNEL} ${browser.version()}${HEADED ? '' : ' headless'}`,
    machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '', cores: os.cpus().length },
    settings: { secondsPerPoint: SECONDS, viewport: `${VW}x${VH}`, dpr: DPR, camera: CAM, waypoints: WAYPOINTS, devServer: true },
    budget: BUDGET,
    notes: [
      'cpuMs: thời gian CPU của Game.frame() (gồm ghi lệnh GPU, không gồm thời gian GPU chạy)',
      'textureMB: ước tính từ kích thước/định dạng khi backend tạo texture (gồm render target, chưa gồm canvas/swapchain)',
      'chạy trên Vite dev server (module chưa gộp, React dev): CPU khung hơi cao hơn bản build',
    ],
    comparedWith: previous ?? null,
    regressions: worse,
    runs,
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  if (previous) {
    if (!pairs) console.log(`\nKhông so được với ${previous}: không có điểm nào cùng renderer/preset/kích thước/pixelRatio`);
    else console.log(`\nSo với ${previous} (${pairs} điểm): ${worse.length ? 'xấu đi quá 10%:' : 'không chỉ số nào xấu đi quá 10%'}`);
    for (const w of worse) console.log('  ' + w);
  }
  const errs = runs.flatMap((r) => r.errors.map((e) => `${r.backend}/${r.preset}: ${e}`));
  if (errs.length) {
    console.log(`\nLỗi console (${errs.length}):`);
    for (const e of errs.slice(0, 20)) console.log('  ' + e);
  }
  console.log(`\nĐã lưu ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
}

const SWITCH = Number(opt('--switch', '0'));
(SWITCH > 0 ? mainSwitch(SWITCH) : main()).catch((e) => {
  console.error('[bench] lỗi:', e instanceof Error ? e.message : e);
  stopServer();
  process.exit(1);
});
