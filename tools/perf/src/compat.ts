// pnpm compat: kiểm tương thích trình duyệt (M6-4) bằng Playwright.
//
// Tự chạy `pnpm dev` ở cặp cổng riêng (PORT/CLIENT_PORT, mặc định 2645/5145), rồi với mỗi trình duyệt:
//   1. Dò tính năng ở một trang cùng origin: WebGPU (adapter, feature nén texture), WebGL2 (renderer,
//      extension nén), canPlayType Opus/WebM và AAC/M4A, giải mã từng file âm thanh trong
//      `audio/manifest.json` bằng OfflineAudioContext (không ra loa) theo đúng thứ tự chọn của audio.ts,
//      và nạp metadata của âm môi trường/nhạc bằng HTMLAudioElement (muted, volume 0, không play).
//   2. Mở game `?mute=1&debug=1&cine=0&auto=<tên>` ở mỗi preset (Thấp/Vừa/Cao; Chromium thêm một lượt ép
//      `renderer=webgl2`): backend thật, thời gian vào game, ảnh chụp cùng góc camera ở sân tông môn,
//      FPS và CPU `frame()` p50/p95 trong vài giây, lỗi/cảnh báo console.
//   3. Ở preset Vừa: nạp mọi asset trong manifest qua `AssetCache` (GLB meshopt + texture), parse hai
//      texture KTX2 Basis mẫu (fixtures/) qua transcoder; thử input: giữ W (đi được), Tab (chọn quái
//      vừa gọi bằng /gm spawn), lăn chuột (đổi khoảng cách camera), kéo chuột ở chế độ "strafe"
//      (xoay camera), bấm canvas ở chế độ chuột (pointer lock).
// Luôn tắt tiếng: URL có `?mute=1` (game không nạp file âm thanh), Chromium chạy `--mute-audio`, Firefox
// đặt `media.volume_scale = 0`; phần kiểm giải mã không phát gì ra loa. WebKit của Playwright chỉ gần
// đúng Safari (cùng engine, khác nền tảng: trên Windows không có codec hệ thống như macOS).
//
// Kết quả: bảng ra stdout, JSON + ảnh ở bench/results/compat-<ngày>/ (gitignore).
// Cờ: --browsers chrome,msedge,firefox,webkit (thêm chromium = Chromium của Playwright)
//     --presets low,medium,high   --seconds 4 (đo FPS mỗi preset)   --size 1280x720   --headed
//     --no-webgl2 (bỏ lượt ép WebGL2 trên Chromium)
//     --no-audio-live (bỏ lượt âm thanh thật: game không ?mute=1 nhưng âm lượng 0 + tắt tiếng mức trình duyệt)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SPAWN_POINT } from '@dtl/shared';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from 'playwright';
import { createDevServer, ROOT, sleep } from './lib/devserver';
import { args, opt, ports } from './lib/env';
import { CHROME_ARGS } from './lib/browser';
import { gm } from './lib/game';

const BROWSERS = opt('--browsers', 'chrome,msedge,firefox,webkit').split(',').filter(Boolean);
const PRESETS = opt('--presets', 'low,medium,high').split(',').filter(Boolean);
const SECONDS = Number(opt('--seconds', '4'));
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const HEADED = args.includes('--headed');
const WEBGL2_PASS = !args.includes('--no-webgl2');
const AUDIO_LIVE = !args.includes('--no-audio-live');
const { port: PORT, clientPort: CLIENT_PORT } = ports(2645, 5145);
const ORIGIN = `http://localhost:${CLIENT_PORT}`;
const FIXTURES = path.join(ROOT, 'tools/perf/fixtures');
const KTX2_SAMPLES = ['2d_etc1s.ktx2', '2d_uastc.ktx2'];
/** Góc chụp cố định ở sân tông môn (giống nhau mọi trình duyệt để so ảnh). */
const SHOT = { x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.6, pitch: 0.32, dist: 14 };

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'compat', command: 'pnpm compat' });

declare global {
  interface Window {
    __compat: { rec: boolean; cpu: number[]; t0: number };
    __audioLive: { ok: number; fail: number; playing: string[] };
  }
}

/** Chạy trước script của game: đặt preset/chế độ điều khiển, bọc `__game.frame` để đo CPU khung. */
function initScript(o: { preset: string }): void {
  localStorage.setItem('dtl.quality', o.preset);
  localStorage.setItem('dtl.controls', 'mouse');
  const w = window;
  w.__compat = { rec: false, cpu: [], t0: 0 };
  let game: Record<string, any> | undefined;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set: (g) => {
      game = g;
      queueMicrotask(() => {
        const frame = g.frame;
        g.frame = function compatFrame(this: unknown) {
          const t0 = performance.now();
          frame.call(g);
          if (w.__compat.rec) w.__compat.cpu.push(performance.now() - t0);
        };
      });
    },
  });
}

// ---------- dò tính năng ----------
type AudioCheck = { file: string; kind: string; canPlay: string; decoded: boolean; seconds: number | null; error?: string; chosen: boolean };
type Probe = {
  userAgent: string;
  webgpu: { api: boolean; adapter: string; features: string[]; error?: string };
  webgl2: { ok: boolean; renderer: string; compressed: string[] };
  canPlay: Record<string, string>;
  audio: AudioCheck[];
  streams: { file: string; ok: boolean; error?: string; seconds: number | null }[];
};

async function probe(page: Page): Promise<Probe> {
  await page.goto(`${ORIGIN}/audio/manifest.json`, { waitUntil: 'load' });
  return page.evaluate(async () => {
    const out: Probe = {
      userAgent: navigator.userAgent,
      webgpu: { api: 'gpu' in navigator, adapter: '', features: [] },
      webgl2: { ok: false, renderer: '', compressed: [] },
      canPlay: {},
      audio: [],
      streams: [],
    };
    try {
      const a = await (navigator as any).gpu?.requestAdapter();
      if (a) {
        const i = a.info ?? {};
        out.webgpu.adapter = [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ') || '(có adapter)';
        out.webgpu.features = [...a.features].filter((f: string) => f.startsWith('texture-compression')).sort();
      } else if (out.webgpu.api) out.webgpu.error = 'requestAdapter() trả null';
    } catch (e) {
      out.webgpu.error = String(e);
    }
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      out.webgl2.ok = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.webgl2.renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      out.webgl2.compressed = (gl.getSupportedExtensions() ?? []).filter((e) => /compressed|compression/.test(e)).sort();
    }
    // Cùng bảng MIME và thứ tự chọn với apps/client/src/game/audio/audio.ts.
    const MIME: Record<string, string[]> = {
      webm: ['audio/webm; codecs="opus"'],
      ogg: ['audio/ogg; codecs="opus"', 'audio/ogg; codecs="vorbis"'],
      m4a: ['audio/mp4; codecs="mp4a.40.2"'],
      mp3: ['audio/mpeg'],
    };
    const el = document.createElement('audio');
    for (const [ext, types] of Object.entries(MIME)) out.canPlay[ext] = types.map((t) => el.canPlayType(t) || '""').join(' | ');
    const typesOf = (f: string) => MIME[f.split('.').pop()!.toLowerCase()] ?? [];
    const playable = (f: string) => typesOf(f).some((t) => el.canPlayType(t) !== '');
    const m = await (await fetch('/audio/manifest.json')).json();
    const list = (s: any): string[] => (Array.isArray(s) ? s : typeof s === 'string' ? [s] : list(s?.src));
    const decodeAll = async (kind: string, srcs: string[]) => {
      const chosen = srcs.find(playable);
      for (const f of srcs) {
        const row: AudioCheck = { file: f, kind, canPlay: typesOf(f).map((t) => el.canPlayType(t)).join('|'), decoded: false, seconds: null, chosen: f === chosen };
        try {
          const buf = await (await fetch('/audio/' + f)).arrayBuffer();
          const ctx = new OfflineAudioContext(2, 44100, 44100);
          const ab = await ctx.decodeAudioData(buf);
          row.decoded = true;
          row.seconds = Math.round(ab.duration * 100) / 100;
        } catch (e) {
          row.error = String((e as Error)?.message ?? e).slice(0, 120);
        }
        out.audio.push(row);
      }
    };
    for (const [, s] of Object.entries(m.sprites ?? {})) await decodeAll('sprite', list(s));
    for (const [, s] of Object.entries(m.ambient ?? {})) await decodeAll('ambient', list((s as any).src));
    for (const [, s] of Object.entries(m.music ?? {})) await decodeAll('music', list((s as any).src));
    // Nhạc/âm môi trường phát dạng stream qua <audio>: chỉ nạp metadata của file được chọn, không play.
    const streams = [...Object.values(m.ambient ?? {}), ...Object.values(m.music ?? {})].map((s: any) => list(s.src).find(playable)).filter(Boolean) as string[];
    for (const f of streams) {
      const a = new Audio();
      a.muted = true;
      a.volume = 0;
      a.preload = 'metadata';
      const r = await new Promise<{ ok: boolean; error?: string }>((res) => {
        const t = setTimeout(() => res({ ok: false, error: 'hết giờ' }), 8000);
        a.onloadedmetadata = () => (clearTimeout(t), res({ ok: true }));
        a.onerror = () => (clearTimeout(t), res({ ok: false, error: `MediaError ${a.error?.code}` }));
        a.src = '/audio/' + f;
      });
      out.streams.push({ file: f, ...r, seconds: Number.isFinite(a.duration) ? Math.round(a.duration * 10) / 10 : null });
      a.removeAttribute('src');
      a.load();
    }
    return out;
  });
}

// ---------- chạy game ----------
type Inputs = { keyboardMoveM: number; tabTarget: string; wheelDist: [number, number]; dragYaw: [number, number]; pointerLock: boolean | string };
type Assets = { glb: { id: string; ok: boolean; ms: number; meshes?: number; error?: string }[]; ktx2: { file: string; ok: boolean; format?: string; error?: string }[]; ktx2Config?: Record<string, boolean> };
type GameRun = {
  preset: string;
  forced: string;
  ok: boolean;
  backend: string;
  adapter: string;
  pixelRatio: number;
  loadMs: number;
  fps: number;
  cpuP50: number;
  cpuP95: number;
  drawCalls: number;
  triangles: number;
  shot: string;
  inputs?: Inputs;
  assets?: Assets;
  errors: string[];
  warnings: string[];
  fail?: string;
};


/** Bơm đủ khung để cảnh vẽ lại khi trình duyệt headless bóp requestAnimationFrame. */
async function waitFrames(page: Page, n: number, ms: number): Promise<void> {
  const f0 = await page.evaluate(() => window.__game!.frames as number);
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const f = await page.evaluate(() => window.__game!.frames as number);
    if (f - f0 >= n) return;
    await sleep(100);
  }
}

async function runGame(browser: Browser, label: string, outDir: string, preset: string, forced: '' | 'webgl2', full: boolean): Promise<GameRun> {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
    else if (m.type() === 'warning') warnings.push(m.text().slice(0, 300));
  });
  await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})(${JSON.stringify({ preset })});` });
  const name = `C_${label.slice(0, 4)}_${preset.slice(0, 3)}${forced ? '_gl' : ''}`;
  const run: GameRun = { preset, forced, ok: false, backend: '', adapter: '', pixelRatio: 0, loadMs: 0, fps: 0, cpuP50: 0, cpuP95: 0, drawCalls: 0, triangles: 0, shot: '', errors, warnings };
  const t0 = Date.now();
  try {
    await page.goto(`${ORIGIN}/?mute=1&debug=1&cine=0&auto=${name}${forced ? '&renderer=webgl2' : ''}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => {
      const g = window.__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 150_000, polling: 250 });
    run.loadMs = Date.now() - t0;
    Object.assign(
      run,
      await page.evaluate(async () => {
        const g = window.__game!;
        const be = g.renderer.backend;
        let adapter = '';
        if (be.isWebGPUBackend) {
          const i = be.adapter?.info ?? (await (navigator as any).gpu?.requestAdapter())?.info ?? {};
          adapter = [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ');
        } else {
          const gl = be.gl as WebGL2RenderingContext | undefined;
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          adapter = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
        }
        return { backend: be.isWebGPUBackend ? 'WebGPU' : 'WebGL2', adapter, pixelRatio: g.renderer.getPixelRatio() as number };
      }),
    );
    await gm(page, `tp ${SHOT.x} ${SHOT.z}`);
    await gm(page, 'heal');
    // Ảnh: cùng góc camera, chờ ô địa hình/asset nạp xong (vài trăm khung).
    await page.evaluate((s) => {
      const g = window.__game!;
      g.camYaw = s.yaw;
      g.camPitch = s.pitch;
      g.camDist = s.dist;
    }, SHOT);
    await sleep(2500);
    await waitFrames(page, 20, 8000);
    // FPS + CPU khung.
    await page.evaluate(() => {
      const c = window.__compat;
      c.cpu = [];
      c.t0 = performance.now();
      c.rec = true;
    });
    await sleep(SECONDS * 1000);
    const perf = await page.evaluate(() => {
      const w = window;
      w.__compat.rec = false;
      const secs = (performance.now() - w.__compat.t0) / 1000;
      const cpu = [...w.__compat.cpu].sort((a, b) => a - b);
      const q = (k: number) => cpu[Math.min(cpu.length - 1, Math.floor(k * cpu.length))] ?? 0;
      const info = w.__game!.renderer.info.render;
      return { fps: cpu.length / secs, p50: q(0.5), p95: q(0.95), dc: info.drawCalls ?? info.calls, tri: info.triangles };
    });
    run.fps = Math.round(perf.fps * 10) / 10;
    run.cpuP50 = Math.round(perf.p50 * 100) / 100;
    run.cpuP95 = Math.round(perf.p95 * 100) / 100;
    run.drawCalls = perf.dc;
    run.triangles = perf.tri;
    run.shot = `${label}_${preset}${forced ? '_webgl2' : ''}.png`;
    await page.screenshot({ path: path.join(outDir, run.shot) });

    if (full) {
      run.assets = await checkAssets(page);
      run.inputs = await checkInputs(page);
    }
    run.ok = true;
  } catch (e) {
    run.fail = (e as Error).message.split('\n')[0];
    try {
      run.shot = `${label}_${preset}${forced ? '_webgl2' : ''}_FAIL.png`;
      await page.screenshot({ path: path.join(outDir, run.shot) });
    } catch {
      run.shot = '';
    }
  } finally {
    await ctx.close().catch(() => undefined);
  }
  return run;
}

/** Nạp mọi GLB trong manifest bằng AssetCache riêng (module của chính game qua Vite dev) + parse KTX2 mẫu. */
async function checkAssets(page: Page): Promise<Assets> {
  const samples = KTX2_SAMPLES.map((f) => ({ file: f, b64: fs.readFileSync(path.join(FIXTURES, f)).toString('base64') }));
  return page.evaluate(async (samples) => {
    const A = await import(/* @vite-ignore */ '/src/game/core/assets.ts' as string);
    const g = window.__game!;
    const out: Assets = { glb: [], ktx2: [] };
    const cache = new A.AssetCache();
    await cache.attach(g.renderer);
    const manifest = await cache.getManifest();
    for (const id of Object.keys(manifest.assets)) {
      const t0 = performance.now();
      try {
        const h = await cache.acquire(id);
        let meshes = 0;
        h.scene.traverse((o: any) => o.isMesh && meshes++);
        out.glb.push({ id, ok: true, ms: Math.round(performance.now() - t0), meshes });
        h.release();
      } catch (e) {
        out.glb.push({ id, ok: false, ms: Math.round(performance.now() - t0), error: String((e as Error)?.message ?? e).slice(0, 160) });
      }
    }
    const ktx2 = A.createKtx2Loader();
    try {
      await A.detectKtx2Support(ktx2, g.renderer);
      out.ktx2Config = { ...ktx2.workerConfig };
      for (const s of samples) {
        const bin = Uint8Array.from(atob(s.b64), (c) => c.charCodeAt(0));
        try {
          const tex: any = await new Promise((res, rej) => ktx2.parse(bin.buffer, res, rej));
          out.ktx2.push({ file: s.file, ok: true, format: `${tex.format} ${tex.image?.width ?? tex.mipmaps?.[0]?.width}px ${tex.mipmaps?.length ?? 0} mip` });
          tex.dispose();
        } catch (e) {
          out.ktx2.push({ file: s.file, ok: false, error: String((e as Error)?.message ?? e).slice(0, 160) });
        }
      }
    } finally {
      ktx2.dispose();
    }
    return out;
  }, samples);
}

async function checkInputs(page: Page): Promise<Inputs> {
  const state = () =>
    page.evaluate(() => {
      const g = window.__game!;
      return { x: g.cur.x as number, z: g.cur.z as number, target: g.targetId as string, dist: g.camDist as number, yaw: g.camYaw as number };
    });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // Bàn phím: giữ W 1,2 giây.
  const s0 = await state();
  await page.keyboard.down('KeyW');
  await sleep(1200);
  await page.keyboard.up('KeyW');
  await sleep(300);
  const s1 = await state();
  // Tab chọn quái vừa gọi ra cạnh mình.
  await gm(page, 'spawn mon_soi_xam 1');
  await sleep(800);
  await page.keyboard.press('Tab');
  await sleep(400);
  const s2 = await state();
  // Lăn chuột trên canvas.
  await page.mouse.move(VW / 2, VH / 2);
  await page.mouse.wheel(0, 400);
  await sleep(400);
  const s3 = await state();
  // Kéo chuột (chế độ strafe: kéo để xoay camera, không pointer lock).
  await page.evaluate(() => window.__game!.setControls('strafe'));
  await page.mouse.move(VW / 2, VH / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(VW / 2 + i * 15, VH / 2);
  await page.mouse.up();
  await sleep(300);
  const s4 = await state();
  // Chế độ chuột: bấm canvas xin pointer lock (headless có thể từ chối; chỉ ghi lại).
  await page.evaluate(() => window.__game!.setControls('mouse'));
  await page.mouse.click(VW / 2, VH / 2);
  await sleep(600);
  const lock = await page.evaluate(() => !!document.pointerLockElement);
  return {
    keyboardMoveM: Math.round(Math.hypot(s1.x - s0.x, s1.z - s0.z) * 100) / 100,
    tabTarget: s2.target,
    wheelDist: [Math.round(s2.dist * 10) / 10, Math.round(s3.dist * 10) / 10],
    dragYaw: [Math.round(s3.yaw * 100) / 100, Math.round(s4.yaw * 100) / 100],
    pointerLock: lock,
  };
}

// ---------- so ảnh ----------
const DIFF_THRESHOLD = 48;
type ShotDiff = { shot: string; ref: string; meanDiff: number; pctOver: number };

/**
 * So mỗi ảnh với ảnh Chrome (WebGPU) cùng preset, bằng canvas trong một trang Chromium. Cảnh có phần động
 * (mây, nước, NPC, quái, giờ trong ngày) nên ảnh giống hệt là không thể: chỉ số dùng để bắt lỗi shader
 * lớn (màn đen, mất sương/chỉnh màu, sai gamma), còn so bằng mắt vẫn cần thiết.
 */
async function compareShots(outDir: string, results: BrowserResult[]): Promise<ShotDiff[]> {
  const ref = (preset: string) => results.find((r) => r.id === 'chrome')?.games.find((g) => g.ok && g.preset === preset && !g.forced && g.backend === 'WebGPU')?.shot;
  const pairs: { shot: string; ref: string }[] = [];
  for (const r of results)
    for (const g of r.games) {
      const rf = ref(g.preset);
      if (g.ok && g.shot && rf && rf !== g.shot) pairs.push({ shot: g.shot, ref: rf });
    }
  if (!pairs.length) return [];
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.evaluate("globalThis.__name ??= (f) => f");
    const out: ShotDiff[] = [];
    for (const p of pairs) {
      const a = 'data:image/png;base64,' + fs.readFileSync(path.join(outDir, p.shot)).toString('base64');
      const b = 'data:image/png;base64,' + fs.readFileSync(path.join(outDir, p.ref)).toString('base64');
      const r = await page.evaluate(
        async ({ a, b, th }) => {
          const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => Object.assign(new Image(), { onload: function (this: HTMLImageElement) { res(this); }, onerror: rej, src }));
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          const w = Math.min(ia.width, ib.width);
          const h = Math.min(ia.height, ib.height);
          const px = (img: HTMLImageElement) => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const x = c.getContext('2d')!;
            x.drawImage(img, 0, 0);
            return x.getImageData(0, 0, w, h).data;
          };
          const da = px(ia);
          const db = px(ib);
          let sum = 0;
          let over = 0;
          for (let i = 0; i < da.length; i += 4) {
            const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
            sum += d;
            if (d > th) over++;
          }
          const n = da.length / 4;
          return { mean: sum / n, pct: (over / n) * 100 };
        },
        { a, b, th: DIFF_THRESHOLD },
      );
      out.push({ ...p, meanDiff: Math.round(r.mean * 10) / 10, pctOver: Math.round(r.pct * 10) / 10 });
    }
    return out;
  } finally {
    await browser.close();
  }
}

// ---------- trình duyệt ----------
// ---------- âm thanh thật, không ra tiếng ----------
type AudioLive = {
  blockWebm: boolean;
  ok: boolean;
  fetched: { file: string; status: number }[];
  decodeOk: number;
  decodeFail: number;
  playing: string[];
  audioWarnings: string[];
  fail?: string;
};

/**
 * Chạy đường âm thanh của game như người chơi thật nhưng KHÔNG ra loa: URL không có `?mute=1` (để game
 * nạp và giải mã file), âm lượng master của game = 0 (localStorage `dtl.vol`), cộng tắt tiếng ở mức trình
 * duyệt (Chromium `--mute-audio`, Firefox `media.volume_scale = 0`). Chỉ gọi cho trình duyệt có hai lớp
 * tắt tiếng đó. `blockWebm`: trả 404 cho mọi .webm để thử đường lùi sang .m4a (giống Safari không có Opus).
 */
async function runAudioLive(browser: Browser, label: string, blockWebm: boolean): Promise<AudioLive> {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const out: AudioLive = { blockWebm, ok: false, fetched: [], decodeOk: 0, decodeFail: 0, playing: [], audioWarnings: [] };
  page.on('console', (m) => {
    if (m.text().includes('[audio]') && m.type() !== 'info') out.audioWarnings.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => out.audioWarnings.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (/^\/audio\/(sfx|amb|music)\//.test(u.pathname)) out.fetched.push({ file: u.pathname.slice(7), status: r.status() });
  });
  if (blockWebm) await page.route('**/audio/**/*.webm', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.addInitScript({
    content: `globalThis.__name ??= (f) => f;
      localStorage.setItem('dtl.vol', JSON.stringify({ master: 0, music: 0, ambient: 0, sfx: 0, ui: 0 }));
      localStorage.setItem('dtl.mute', '0');
      localStorage.setItem('dtl.quality', 'low');
      window.__audioLive = { ok: 0, fail: 0, playing: [] };
      const BAC = window.BaseAudioContext || window.AudioContext;
      if (BAC) {
        const dec = BAC.prototype.decodeAudioData;
        BAC.prototype.decodeAudioData = function (buf, ...rest) {
          return dec.call(this, buf, ...rest).then((b) => (window.__audioLive.ok++, b), (e) => { window.__audioLive.fail++; throw e; });
        };
      }
      // <audio> của game không gắn vào DOM nên không bắt sự kiện ở document được: bọc play() để nghe từng phần tử.
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...rest) {
        if (!this.__live) {
          this.__live = true;
          this.addEventListener('playing', () => {
            if (this.currentSrc) window.__audioLive.playing.push(new URL(this.currentSrc).pathname.slice(7));
          });
        }
        return play.apply(this, rest);
      };`,
  });
  try {
    await page.goto(`${ORIGIN}/?auto=A_${label.slice(0, 4)}${blockWebm ? '_m4a' : ''}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => {
      const g = window.__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 150_000, polling: 250 });
    // Thao tác đầu tiên mở khóa AudioContext (unlockAudio trong keydown).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('KeyW');
    await sleep(6000);
    const r = await page.evaluate(() => window.__audioLive);
    out.decodeOk = r.ok;
    out.decodeFail = r.fail;
    out.playing = [...new Set(r.playing)];
    out.ok = true;
  } catch (e) {
    out.fail = (e as Error).message.split('\n')[0];
  } finally {
    await ctx.close().catch(() => undefined);
  }
  return out;
}

async function launch(id: string): Promise<{ browser: Browser; type: BrowserType; name: string }> {
  if (id === 'chrome' || id === 'msedge') return { browser: await chromium.launch({ channel: id, headless: !HEADED, args: CHROME_ARGS }), type: chromium, name: id === 'chrome' ? 'Chrome' : 'Edge' };
  if (id === 'chromium') return { browser: await chromium.launch({ headless: !HEADED, args: CHROME_ARGS }), type: chromium, name: 'Chromium (Playwright)' };
  if (id === 'firefox')
    return { browser: await firefox.launch({ headless: !HEADED, firefoxUserPrefs: { 'media.volume_scale': '0.0' } }), type: firefox, name: 'Firefox (Playwright)' };
  if (id === 'webkit') return { browser: await webkit.launch({ headless: !HEADED }), type: webkit, name: 'WebKit (Playwright, gần đúng Safari)' };
  throw new Error('trình duyệt không hỗ trợ: ' + id);
}

type BrowserResult = { id: string; name: string; version: string; probe?: Probe; games: GameRun[]; audioLive: AudioLive[]; fail?: string };

async function main(): Promise<void> {
  const started = new Date();
  const outDir = path.join(ROOT, 'bench/results', `compat-${started.toLocaleDateString('sv-SE')}`);
  fs.mkdirSync(outDir, { recursive: true });
  await dev.start();
  const results: BrowserResult[] = [];
  try {
    for (const id of BROWSERS) {
      const res: BrowserResult = { id, name: id, version: '', games: [], audioLive: [] };
      results.push(res);
      let browser: Browser | null = null;
      try {
        const l = await launch(id);
        browser = l.browser;
        res.name = l.name;
        res.version = browser.version();
        console.log(`\n[compat] ${res.name} ${res.version}`);
        const ctx = await browser.newContext();
        await ctx.addInitScript({ content: "globalThis.__name ??= (f) => f;" });
        const page = await ctx.newPage();
        res.probe = await probe(page);
        await ctx.close();
        const p = res.probe;
        console.log(`  WebGPU: ${p.webgpu.adapter || p.webgpu.error || (p.webgpu.api ? '?' : 'không có navigator.gpu')}; WebGL2: ${p.webgl2.ok ? p.webgl2.renderer : 'không'}`);
        console.log(`  âm thanh: ${p.audio.filter((a) => a.chosen && a.decoded).length}/${p.audio.filter((a) => a.chosen).length} file được chọn giải mã được; stream ${p.streams.filter((s) => s.ok).length}/${p.streams.length}`);
        const passes: { preset: string; forced: '' | 'webgl2' }[] = PRESETS.map((preset) => ({ preset, forced: '' as const }));
        if (WEBGL2_PASS && l.type === chromium) passes.push({ preset: 'medium', forced: 'webgl2' });
        for (const ps of passes) {
          process.stdout.write(`  game ${ps.preset}${ps.forced ? ' (ép WebGL2)' : ''} … `);
          const g = await runGame(browser, id, outDir, ps.preset, ps.forced, ps.preset === 'medium' && !ps.forced);
          res.games.push(g);
          console.log(
            g.ok
              ? `${g.backend}, vào game ${(g.loadMs / 1000).toFixed(1)} s, ${g.fps} fps, CPU p95 ${g.cpuP95} ms, ${g.drawCalls} draw, ${g.errors.length} lỗi/${g.warnings.length} cảnh báo`
              : `LỖI: ${g.fail}`,
          );
          if (g.inputs) console.log(`    input: ${JSON.stringify(g.inputs)}`);
          if (g.assets) console.log(`    asset: GLB ${g.assets.glb.filter((a) => a.ok).length}/${g.assets.glb.length}, KTX2 ${g.assets.ktx2.filter((a) => a.ok).length}/${g.assets.ktx2.length}`);
        }
        // Âm thanh thật chỉ ở trình duyệt có tắt tiếng mức trình duyệt (WebKit của Playwright không có cờ đó).
        if (AUDIO_LIVE && (l.type === chromium || l.type === firefox)) {
          for (const blockWebm of [false, true]) {
            const a = await runAudioLive(browser, id, blockWebm);
            res.audioLive.push(a);
            const kinds = (f: string) => f.split('.').pop();
            console.log(
              `  âm thanh thật${blockWebm ? ' (chặn .webm)' : ''}: ${a.ok ? '' : 'LỖI ' + a.fail + '; '}tải ${a.fetched.filter((f) => f.status === 200).length} file (${[...new Set(a.fetched.filter((f) => f.status === 200).map((f) => kinds(f.file)))].join('/')}), ` +
                `giải mã ${a.decodeOk} đạt/${a.decodeFail} lỗi, đang phát: ${a.playing.join(', ') || 'không'}${a.audioWarnings.length ? `, ${a.audioWarnings.length} cảnh báo [audio]` : ''}`,
            );
          }
        }
      } catch (e) {
        res.fail = (e as Error).message.split('\n')[0];
        console.log(`  KHÔNG CHẠY ĐƯỢC: ${res.fail}`);
      } finally {
        await browser?.close().catch(() => undefined);
      }
    }
  } finally {
    dev.stop();
  }
  const diffs = await compareShots(outDir, results);
  for (const d of diffs) console.log(`  ảnh ${d.shot} so với ${d.ref}: lệch trung bình ${d.meanDiff}/255, ${d.pctOver}% điểm ảnh lệch > ${DIFF_THRESHOLD}`);
  const out = path.join(outDir, 'compat.json');
  fs.writeFileSync(
    out,
    JSON.stringify(
      { kind: 'compat', date: started.toISOString(), machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '' }, viewport: `${VW}x${VH}`, headless: !HEADED, shot: SHOT, diffs, results },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nĐã lưu ${path.relative(ROOT, out).replace(/\\/g, '/')} và ảnh trong cùng thư mục`);
}

main().catch((e) => {
  console.error('[compat] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
