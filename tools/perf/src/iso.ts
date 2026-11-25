// pnpm perf:iso (Chân Cảnh O0): đo nền hiệu năng camera chéo (mặc định) trên mọi bản đồ, bí cảnh, 9 phòng cầu Cửu Kiều,
// sân độ kiếp, mỗi nơi 4 điểm + 1 cảnh đánh đông (≥ 10 quái + chiêu), theo preset Trung/Cao/Cực cao.
//
// Mỗi điểm ghi: draw call, tam giác (p50/max), số material/texture/geometry, texture MB (ước tính), bộ nhớ GPU ước tính
// (texture + buffer hình học), CPU `Game.frame()` p50/p95 và thời gian từng hệ (render, ents, vfx, terrain, env…),
// GPU ms (timestamp query, `?gputime=1`) nếu trình duyệt có, draw call theo nhóm (địa hình/kiến trúc/prop/cỏ/VFX/nhân vật),
// JS heap. Cả lần chạy: tải lần đầu MB (byte mạng của lần nạp trang đầu), GPU/adapter.
// Headless Chromium tắt tiếng (`?mute=1`, `--mute-audio`), tắt vsync (`--disable-gpu-vsync --disable-frame-rate-limit`) để CPU/GPU ms
// không bị trần 60 fps che. Camera đứng yên ở góc chéo khóa của level (không xoay, không zoom).
//
//   pnpm perf:iso [--presets medium,high,ultra] [--seconds 4] [--size 1280x720] [--out <thư mục>] [--baseline <iso-*.json>]
//                 [--only van_lam,kiem_trung,kieu_3,trib:do_kiep,fight] [--quick] [--igpu] [--noshadow] [--bots 10] [--dump-inst] [--query a=b] [--renderer webgpu|webgl2] [--channel chrome|chromium]
// `--quick`: preset high, 2 giây/điểm, chỉ Vân Lam + một bí cảnh + một phòng cầu + cảnh đánh (cho máy người dùng tự chạy).
// `--settle-max N`: trước mỗi điểm đo chờ cảnh NẠP XONG (tam giác, byte texture, số geometry ổn định 3 giây liền; tối đa N giây, mặc định 40);
//   không chờ thì điểm đầu của level đo khi ô địa hình/prop/texture còn đang nạp (baseline cũ ghi Vân Lam 354k tam giác/94 MB so với 821k/460–500 MB thật).
// `--recycle N`: mở trang mới sau mỗi N mục tiêu (mặc định 3) để WebGPU không mất thiết bị khi đổi nhiều level liền.
// `--resume <iso-checkpoint.json>`: làm tiếp từ checkpoint (ghi sau MỖI mục tiêu vào `<out>/iso-checkpoint.json`); bỏ qua mục tiêu đã xong. Chỉ ghép
//   khi cùng viewport/cách đo/backend và tùy chọn đo (--seconds, --cpu-throttle, --igpu, --noshadow, --query, --quick, --bots). Checkpoint được GIỮ khi dùng
//   --only/--quick/--bots (xóa chỉ khi chạy đủ danh sách). Dừng giữa chừng (Ctrl+C, hết giờ) không mất số đã đo; chạy theo nhóm bằng `--only a,b` rồi `--resume`.
// Trước khi chạy kiểm ĐỦ asset so sổ khóa (worktree thiếu asset đo ra số thấp một cách im lặng): thiếu thì thoát; `--allow-missing-assets` bỏ qua.
// `--igpu`: ép GPU tiết kiệm điện (`--force_low_power_gpu`) để đo iGPU Intel/AMD nếu máy có.
// `--cpu-throttle N`: làm chậm CPU N lần qua CDP (`Emulation.setCPUThrottlingRate`) để MÔ PHỎNG máy yếu (ví dụ 4 ≈ laptop tầm trung, 6 ≈ iGPU yếu).
//   Đây là ƯỚC LƯỢNG chỉ về CPU: không mô phỏng băng thông/độ trễ GPU, nên không thay cho số đo máy thật; kết quả ghi `emulation` để khỏi nhầm.
// Ra: iso-<ngày>.json + iso-<ngày>.md (+ so baseline) trong `--out` (mặc định bench/results). Server dev tự chạy ở cổng riêng và luôn tắt khi xong.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { LEVELS } from '@dtl/content';
import { FOREST, LAKE, SPAWN_POINT } from '@dtl/shared';
import { createDevServer, sleep } from './lib/devserver';
import { Bots } from './lib/bots';
import { flag, list, opt, outDir, ports, size } from './lib/env';
import { gameUrl, launchChrome, reportErrors, watchErrors } from './lib/browser';
import { drawSources } from './lib/drawsrc';
import { enterLevel, gm, skipCutscene, tp, waitInGame, waitLevel } from './lib/game';
import { levelPoints } from './lib/levelpoints';
import { checkAssets, readLockFiles } from './lib/assetcheck';
import { BASELINE_METHOD } from './lib/gate';
import { type Checkpoint, type RunOpts, emptyCheckpoint, incompatibility, isDone, markDone } from './lib/isocheckpoint';
import { bucketGroups, compareRuns, stat, toMarkdown, type IsoPoint, type IsoRun, round } from './lib/isoreport';

const QUICK = flag('--quick');
const PRESETS = list('--presets', QUICK ? 'high' : 'medium,high,ultra');
const SECONDS = Number(opt('--seconds', QUICK ? '2' : '4'));
const [VW, VH] = size('1280x720');
/** `--bots N`: chỉ đo cảnh đông người (N bot cấp 15 đánh quái quanh rừng Vân Lam, client đo đứng giữa): `van_lam/dong<N>`. */
const BOTS = Number(opt('--bots', '0'));
const NOSHADOW = flag('--noshadow');
/** Tối đa chờ cảnh nạp xong trước mỗi điểm đo (giây). */
const SETTLE_MAX = Number(opt('--settle-max', '40')) * 1000;
/** Số mục tiêu (bản đồ/phó bản) đo trên một trang trước khi mở trang mới: WebGPU dễ mất thiết bị khi đổi nhiều level liền. 0 = không mở lại. */
const RECYCLE = Number(opt('--recycle', '3'));
/** `--trace N`: chỉ ghi chuỗi thời gian N giây ở điểm đầu Vân Lam (chẩn đoán nạp muộn). */
const TRACE = Number(opt('--trace', '0'));
const CPU_THROTTLE = Math.max(1, Number(opt('--cpu-throttle', '1')) || 1);
const EXTRA = opt('--query', '');
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = list('--only', '');
const { port: PORT, clientPort: CLIENT_PORT } = ports(2685, 5185);

/** Kiểu mục tiêu và cách tới. */
interface Target {
  id: string;
  kind: IsoPoint['kind'];
}

const dungeons = Object.entries(LEVELS).filter(([id, l]) => l.dungeon && !l.tribulation && !id.startsWith('kieu_'));
const MAP_IDS = Object.keys(LEVELS).filter((id) => !LEVELS[id]!.dungeon);
const KIEU = Array.from({ length: 9 }, (_, i) => `kieu_${i + 1}`);
/** Sân độ kiếp: id level → id kiếp dùng với `/gm trib`. */
const TRIB: Record<string, string> = { do_kiep: 'hoa_than', do_kiep_bac_hoang: 'anh_bien' };

function targets(): Target[] {
  const t: Target[] = [
    ...MAP_IDS.map((id): Target => ({ id, kind: 'map' })),
    ...dungeons.map(([id]): Target => ({ id, kind: 'dungeon' })),
    ...KIEU.map((id): Target => ({ id, kind: 'kieu' })),
    ...Object.keys(TRIB).map((id): Target => ({ id, kind: 'trib' })),
  ];
  const quick = new Set(['van_lam', 'kiem_trung', 'kieu_1']);
  return t.filter((x) => (ONLY.length ? ONLY.includes(x.id) : QUICK ? quick.has(x.id) : true));
}

/** Chạy trong trang trước mọi script game: bọc `frame()` đo CPU, thời gian từng hệ, GPU timestamp, byte texture. */
function initScript(preset: string): void {
  localStorage.setItem('dtl.quality', preset);
  localStorage.setItem('dtl.qualityLock', '1');
  const w = window as any;
  const tex = new Map<object, number>();
  const rtTex = new WeakSet<object>();
  const B = {
    rec: false,
    passes: {} as Record<string, number>,
    long: [] as { at: number; dt: number; parts: Record<string, number>; pipes: number; pipeNames: string[] }[],
    frames: [] as number[][],
    dc: [] as number[],
    parts: {} as Record<string, number[]>,
    gpu: [] as number[],
    gpuOk: false,
    dropGpu: false,
    pipes: 0,
    pipes0: 0,
    pipeNames: [] as string[],
    patched: null as unknown,
  };
  w.__iso = B;
  w.__isoTexBytes = () => {
    let s = 0;
    for (const v of tex.values()) s += v;
    return s;
  };
  /** Phần của `__isoTexBytes` thuộc đích vẽ (render target: MSAA/MRT ×số mẫu, phình theo viewport), tách khỏi texture tài sản. */
  w.__isoRtBytes = () => {
    let s = 0;
    for (const [t, v] of tex) if (rtTex.has(t)) s += v;
    return s;
  };
  const COMPS: Record<number, number> = { 1021: 1, 1022: 4, 1023: 4, 1026: 1, 1027: 1, 1028: 1, 1029: 1, 1030: 2, 1031: 2, 1033: 4 };
  const TYPE_B: Record<number, number> = {
    1009: 1,
    1010: 1,
    1011: 2,
    1012: 2,
    1013: 4,
    1014: 4,
    1015: 4,
    1016: 2,
    1017: 2,
    1018: 2,
    1020: 4,
    35902: 4,
  };
  const HALF = new Set([33776, 33777, 36196, 37492, 36283, 36284, 35840, 35841]);
  const bytesOf = (t: any, o: any): number => {
    const w0 = Math.max(1, o?.width ?? t.image?.width ?? 1);
    const h0 = Math.max(1, o?.height ?? t.image?.height ?? 1);
    const d0 = Math.max(1, o?.depth ?? 1);
    const levels = Math.max(1, o?.levels ?? 1);
    const bpp = t.isCompressedTexture ? (HALF.has(t.format) ? 0.5 : 1) : (COMPS[t.format] ?? 4) * (TYPE_B[t.type] ?? 1);
    const samples = Math.max(1, t.isRenderTargetTexture ? (o?.sampleCount ?? 1) : 1);
    let total = 0;
    for (let l = 0; l < levels; l++)
      total += Math.max(1, w0 >> l) * Math.max(1, h0 >> l) * (t.is3DTexture ? Math.max(1, d0 >> l) : d0) * bpp;
    return total * samples;
  };
  let cur: Record<string, number> = {};
  const wrapped = new WeakSet<object>();
  const wrapPart = (obj: any, fn: string, label: string) => {
    if (!obj || typeof obj[fn] !== 'function' || wrapped.has(obj[fn])) return;
    const orig = obj[fn];
    const f = function (this: unknown, ...a: unknown[]) {
      const t0 = performance.now();
      try {
        return orig.apply(this, a);
      } finally {
        cur[label] = (cur[label] ?? 0) + performance.now() - t0;
      }
    };
    wrapped.add(f);
    obj[fn] = f;
  };
  let gpuPending = false;
  let gpuFrames = 0;
  const hook = (g: Record<string, any>) => {
    const frame = g.frame;
    g.frame = function isoFrame(this: unknown) {
      const r = g.renderer;
      const be = r?.backend;
      if (be && B.patched !== be) {
        B.patched = be;
        const create = be.createTexture.bind(be);
        const destroy = be.destroyTexture.bind(be);
        be.createTexture = (t: object, o: unknown) => {
          create(t, o);
          tex.set(t, bytesOf(t, o));
          if ((t as any).isRenderTargetTexture) rtTex.add(t);
        };
        be.destroyTexture = (t: object) => {
          tex.delete(t);
          destroy(t);
        };
        // Chẩn đoán khung dài: đếm pipeline mới và ghi tên vật liệu/đối tượng (biên dịch lúc vẽ lần đầu).
        const pipe = be.createRenderPipeline.bind(be);
        be.createRenderPipeline = (...a: unknown[]) => {
          const ro = a[0] as any;
          B.pipes++;
          if (B.pipeNames.length >= 12) B.pipeNames.shift(); // vòng đệm: luôn là các pipeline MỚI NHẤT
          B.pipeNames.push(
            `${ro?.material?.name || ro?.material?.type}/${ro?.object?.name || ro?.object?.parent?.name || ro?.object?.type} ${ro?.object?.geometry?.attributes?.position?.count ?? 0}v o${ro?.object?.renderOrder ?? 0}`,
          );
          return pipe(...a);
        };
      }
      if (r && !r.__isoProbed && typeof r._renderObjectDirect === 'function') {
        r.__isoProbed = true;
        const direct = Object.getPrototypeOf(r)._renderObjectDirect.bind(r);
        r._handleObjectFunction = r._renderObjectDirect = (object: any, material: any, ...rest: unknown[]) => {
          if (B.rec) {
            const rt = r.getRenderTarget();
            const dst = rt ? rt.texture?.name || (rt.depthTexture && !rt.texture?.isTexture ? 'depth' : 'rt') : 'screen';
            const kind = object.isSkinnedMesh ? 'skin' : object.isInstancedMesh ? 'inst' : object.isBatchedMesh ? 'batch' : 'mesh';
            const k = `${dst}|${kind}|${material?.type ?? '?'}`;
            B.passes[k] = (B.passes[k] ?? 0) + 1;
          }
          return direct(object, material, ...rest);
        };
      }
      wrapPart(g.terrain, 'update', 'terrain');
      wrapPart(g.ents, 'update', 'ents');
      wrapPart(g.vfx, 'update', 'vfx');
      wrapPart(g.env, 'update', 'env');
      wrapPart(g.ambient, 'update', 'ambient');
      wrapPart(g.scene, 'updateMatrixWorld', 'matrix');
      wrapPart(g.post, 'render', 'render');
      wrapPart(g.post, 'update', 'post');
      wrapPart(g.dmg, 'update', 'ui');
      wrapPart(g.offscreen, 'update', 'offscreen');
      wrapPart(g, 'updateCamera', 'camera');
      cur = {};
      const t0 = performance.now();
      frame.call(g);
      const dt = performance.now() - t0;
      if (!r) return;
      if (B.rec) {
        if (dt > 12 && B.long.length < 8)
          B.long.push({
            pipes: B.pipes,
            pipeNames: B.pipeNames.slice(-4),
            at: Math.round(performance.now()),
            dt: Math.round(dt * 10) / 10,
            parts: Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Math.round(v * 10) / 10])),
          });
        B.frames.push([dt, r.info.render.drawCalls ?? r.info.render.calls, r.info.render.triangles]);
        for (const [k, v] of Object.entries(cur)) (B.parts[k] ??= []).push(v);
      }
      // GPU: resolve ở MỌI khung kể cả lúc không ghi. `resolveTimestampsAsync` trả TỔNG thời gian mọi query từ lần resolve trước và pool chỉ có 2048 query;
      // không xả thì giữa hai điểm đo (enterLevel, tp, sleep…) query dồn lại và mẫu đầu = tổng hàng trăm khung chia cho vài khung. Lô đầu sau khi bật ghi
      // (`B.dropGpu`) có thể gồm khung trước lúc ghi nên bị bỏ.
      gpuFrames++;
      if (be?.trackTimestamp && !gpuPending) {
        gpuPending = true;
        const n = gpuFrames;
        gpuFrames = 0;
        Promise.all([r.resolveTimestampsAsync('render'), r.resolveTimestampsAsync('compute')])
          .then(([a, b]: [number | undefined, number | undefined]) => {
            const ms = (a ?? 0) + (b ?? 0);
            if (B.dropGpu) {
              B.dropGpu = false;
              return;
            }
            if (ms > 0 && B.rec) {
              B.gpu.push(ms / n);
              B.gpuOk = true;
            }
          })
          .catch(() => undefined)
          .finally(() => (gpuPending = false));
      }
    };
  };
  let game: Record<string, any> | undefined;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set: (g) => {
      game = g;
      queueMicrotask(() => hook(g));
    },
  });
}

/** Chờ cảnh nạp xong: tam giác một khung, byte texture GPU và số geometry không đổi (≤ 1%) trong 3 lần lấy mẫu liền (1 s/lần). */
async function settle(page: Page, label: string, maxMs = SETTLE_MAX): Promise<void> {
  const t0 = Date.now();
  let prev: { tris: number; tex: number; geo: number } | null = null;
  let ok = 0;
  const near = (a: number, b: number, abs: number) => Math.abs(a - b) <= Math.max(abs, 0.01 * Math.max(a, b));
  while (Date.now() - t0 < maxMs) {
    await sleep(1000);
    const s = await page.evaluate(() => {
      const w = window as any;
      const r = w.__game.renderer;
      return { tris: r.info.render.triangles as number, tex: w.__isoTexBytes() as number, geo: r.info.memory.geometries as number };
    });
    ok = prev && near(prev.tris, s.tris, 500) && near(prev.tex, s.tex, 65536) && prev.geo === s.geo ? ok + 1 : 0;
    prev = s;
    if (ok >= 3) return;
  }
  console.warn(`  [settle] ${label}: chưa ổn định sau ${maxMs / 1000} s (đo luôn)`);
}

/** Đặt chỗ đo: bắt đầu ghi, chờ `SECONDS` (có thể kèm hàm chạy chiêu), dừng, gom số liệu. */
async function measure(page: Page, id: string, target: Target, preset: string, during?: () => Promise<void>): Promise<IsoPoint> {
  // A/B: `--noshadow` tắt đèn đổ bóng của mặt trời (đo phần CPU/GPU do bóng).
  if (NOSHADOW) await page.evaluate(() => void ((window as any).__game.env.sun.castShadow = false));
  await page.evaluate(() => {
    const B = (window as any).__iso;
    B.frames = [];
    B.long = [];
    B.passes = {};
    B.parts = {};
    B.gpu = [];
    B.dropGpu = true;
    B.pipes0 = B.pipes;
    B.pipeNames = []; // khung dài chỉ được gán cho pipeline biên dịch TRONG lần đo này
    B.rec = true;
  });
  const t0 = Date.now();
  if (during) await during();
  const left = SECONDS * 1000 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  const secs = (Date.now() - t0) / 1000;
  const raw = await page.evaluate(() => {
    const w = window as any;
    const B = w.__iso;
    B.rec = false;
    const g = w.__game;
    const mats = new Set<unknown>();
    const geos = new Set<any>();
    g.scene.traverse((o: any) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
      if (o.geometry) geos.add(o.geometry);
    });
    let geoBytes = 0;
    for (const geo of geos) {
      for (const a of Object.values(geo.attributes ?? {}) as any[]) geoBytes += a.array?.byteLength ?? 0;
      geoBytes += geo.index?.array?.byteLength ?? 0;
    }
    const mem = (performance as any).memory;
    return {
      frames: B.frames as number[][],
      passes: B.passes as Record<string, number>,
      long: B.long as IsoPoint['longFrames'],
      newPipes: (B.pipes - B.pipes0) as number,
      parts: B.parts as Record<string, number[]>,
      gpu: B.gpu as number[],
      textures: g.renderer.info.memory.textures as number,
      geometries: g.renderer.info.memory.geometries as number,
      materials: mats.size,
      texBytes: w.__isoTexBytes() as number,
      rtBytes: w.__isoRtBytes() as number,
      geoBytes,
      monsters: g.ents.monsters.size as number,
      heap: mem ? (mem.usedJSHeapSize as number) : null,
    };
  });
  const src = await drawSources(page, 40);
  if (flag('--dump-inst')) {
    // Chẩn đoán O2: liệt kê InstancedMesh hiện có theo (cha gần nhất có tên | tên | số đỉnh | vật liệu) với số bản và có đổ bóng không.
    const dump = await page.evaluate(() => {
      const m = new Map<string, { n: number; inst: number; shadow: number; verts: number }>();
      (window as any).__game.scene.traverse((o: any) => {
        if (!o.isInstancedMesh || !o.visible) return;
        let par = o.parent;
        while (par && !par.name) par = par.parent;
        const k = `${par?.name ?? '-'} | ${o.name || '·'} | ${o.geometry.attributes.position.count}v | ${(Array.isArray(o.material) ? o.material[0] : o.material)?.name || o.material?.type}`;
        const e = m.get(k) ?? { n: 0, inst: 0, shadow: 0, verts: o.geometry.attributes.position.count };
        e.n++;
        e.inst += o.count;
        if (o.castShadow) e.shadow++;
        m.set(k, e);
      });
      return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25);
    });
    console.log(`  --- instanced ${id}:\n` + dump.map(([k, v]) => `    ${v.n}× ${k} · bản ${v.inst} · đổ bóng ${v.shadow}`).join('\n'));
  }

  const kinds = await page.evaluate(() => {
    const out: Record<string, { dc: number; tris: number; shadow: number }> = {
      skin: { dc: 0, tris: 0, shadow: 0 },
      instanced: { dc: 0, tris: 0, shadow: 0 },
      basic: { dc: 0, tris: 0, shadow: 0 },
      static: { dc: 0, tris: 0, shadow: 0 },
    };
    const walk = (o: any) => {
      if (!o.visible) return;
      if ((o.isMesh || o.isPoints || o.isLine) && o.geometry) {
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const k = o.isSkinnedMesh
          ? 'skin'
          : o.isInstancedMesh
            ? 'instanced'
            : /Basic|Line|Points|Sprite/.test(mat?.type ?? '')
              ? 'basic'
              : 'static';
        const n = (o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count ?? 0)) / 3;
        out[k]!.dc++;
        out[k]!.tris += Math.round(n * (o.isInstancedMesh ? o.count : 1));
        if (o.castShadow) out[k]!.shadow++;
      }
      for (const c of o.children) walk(c);
    };
    walk((window as any).__game.scene);
    return out;
  });
  const cpu = raw.frames.map((f) => f[0]!);
  const dc = raw.frames.map((f) => f[1]!).sort((a, b) => a - b);
  const tri = raw.frames.map((f) => f[2]!).sort((a, b) => a - b);
  const mb = (n: number) => round(n / 1048576, 1);
  return {
    id,
    target: target.id,
    kind: target.kind,
    preset,
    frames: raw.frames.length,
    fps: round(raw.frames.length / secs, 1),
    cpuMs: stat(cpu),
    parts: Object.fromEntries(Object.entries(raw.parts).map(([k, v]) => [k, round(v.reduce((a, x) => a + x, 0) / Math.max(1, v.length))])),
    gpuMs: raw.gpu.length ? stat(raw.gpu) : null,
    drawCalls: { p50: dc[Math.floor(dc.length / 2)] ?? 0, max: dc[dc.length - 1] ?? 0 },
    triangles: { p50: Math.round(tri[Math.floor(tri.length / 2)] ?? 0), max: Math.round(tri[tri.length - 1] ?? 0) },
    textures: raw.textures,
    textureMB: mb(raw.texBytes),
    textureAssetMB: mb(raw.texBytes - raw.rtBytes),
    textureRtMB: mb(raw.rtBytes),
    geometries: raw.geometries,
    materials: raw.materials,
    gpuMemMB: mb(raw.texBytes + raw.geoBytes),
    jsHeapMB: raw.heap === null ? null : mb(raw.heap),
    monsters: raw.monsters,
    byCat: bucketGroups(src.groups),
    longFrames: raw.long,
    newPipelines: raw.newPipes,
    passes: Object.fromEntries(Object.entries(raw.passes).map(([k, v]) => [k, round(v / Math.max(1, raw.frames.length), 1)])),
    kinds: kinds as IsoPoint['kinds'],
    topGroups: src.groups.slice(0, 6).map(({ key, dc: d, tris, shadow }) => ({ key, dc: d, tris, shadow })),
  };
}

/** Bốn điểm đo của mục tiêu, tọa độ thế giới. */
function pointsOf(t: Target): { name: string; x: number; z: number }[] {
  const lv = LEVELS[t.id]!;
  if (lv.dungeon) {
    const c = lv.dungeon.center;
    return [
      ['vao', 0, 50],
      ['giua', 0, 16],
      ['tay', -30, 24],
      ['dong', 30, 24],
    ].map(([name, dx, dz]) => ({ name: name as string, x: c.x + (dx as number), z: c.z + (dz as number) }));
  }
  if (t.id === 'van_lam') {
    // Sân tông môn, cổng tam quan, rừng linh thảo, bờ hồ (khớp bench.ts/camiso.ts).
    return [
      { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z },
      { name: 'cong', x: 2048, z: 2128 },
      { name: 'rung', x: FOREST.x, z: FOREST.z },
      { name: 'ho', x: LAKE.x - 185, z: LAKE.z },
    ];
  }
  const all = levelPoints(t.id).filter((p) => p.name !== 'trencao');
  const pick = [
    ...all.filter((p) => p.name.startsWith('poi_')),
    ...all.filter((p) => p.name.startsWith('zone_')),
    ...all.filter((p) => p.name.startsWith('boss_')),
  ];
  return (pick.length ? pick : all).slice(0, 4);
}

async function dungeonEnter(page: Page, t: Target): Promise<void> {
  const lv = LEVELS[t.id]!;
  const dg = lv.dungeon!;
  await gm(page, `level ${Math.min(60, Math.max(15, dg.minLevel + 2))}`);
  await gm(page, 'god on');
  if (t.kind === 'trib') {
    // Đang trong một kiếp trước (65–80 s) thì `/gm trib` bị từ chối: chờ kiếp kết thúc và được đưa ra ngoài.
    await page.waitForFunction(() => !/^do_kiep/.test(window.__game?.shownLevel ?? ''), undefined, { timeout: 150_000, polling: 500 });
    await sleep(2000);
    await gm(page, `trib ${TRIB[t.id]}`, 500);
    await waitLevel(page, t.id, 1500);
  } else if (t.kind === 'kieu') {
    const n = Number(t.id.slice(5));
    if (n > 1) await gm(page, `kieu ${n - 1}`);
    await enterLevel(page, 'cuu_kieu');
    await tp(page, 1024, 1494);
    await page.evaluate((m) => window.__game!.send('kieu', { n: m }), n);
    await waitLevel(page, t.id, 3000);
  } else {
    const portal = LEVELS[dg.returnLevel]?.portals?.find((p) => p.to === t.id);
    if (!portal) throw new Error(`không có cổng vào ${t.id}`);
    await enterLevel(page, dg.returnLevel);
    await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
    await sleep(1200);
    await tp(page, portal.x, portal.z);
    await sleep(1200);
    await page.keyboard.press('KeyE');
    await waitLevel(page, t.id);
  }
  await skipCutscene(page, 10);
  await gm(page, 'god on', 900);
}

/** Cảnh đánh đông: gọi ≥ 12 quái quanh người, ra chiêu liên tục trong lúc đo. */
async function fight(page: Page, t: Target, preset: string): Promise<IsoPoint> {
  const lv = LEVELS[t.id]!;
  // Quái thường nằm ở `camps`; `spawns` chỉ có tinh anh/boss.
  const sp =
    lv.camps?.find((c) => !c.mon.startsWith('boss_') && !c.mon.startsWith('elite_')) ?? lv.spawns.find((s) => !s.mon.startsWith('boss_'));
  const mon = sp?.mon ?? lv.dungeon?.waves[0]?.mons.find((m) => !m.id.startsWith('boss_'))?.id ?? lv.dungeon?.waves[0]?.mons[0]?.id;
  if (!mon) throw new Error(`không tìm được quái để gọi ở ${t.id}`);
  const spot = sp ? { x: sp.x, z: sp.z } : lv.dungeon ? { x: lv.dungeon.center.x, z: lv.dungeon.center.z + 16 } : { x: 0, z: 0 };
  await tp(page, spot.x, spot.z);
  await gm(page, 'killall', 800);
  await gm(page, `spawn ${mon} 12`, 2500);
  await gm(page, 'god on', 300);
  await settle(page, `${t.id}/danh_dong`, 12_000); // cảnh đánh có quái/chiêu chuyển động: chờ ngắn hơn
  return measure(page, `${t.id}/danh_dong`, { ...t, kind: 'fight' }, preset, async () => {
    const end = Date.now() + SECONDS * 1000;
    let i = 0;
    while (Date.now() < end) {
      await page.evaluate((n) => window.__game!.useSkill(n), i++ % 4);
      await sleep(450);
    }
  });
}

async function runPreset(
  browser: Awaited<ReturnType<typeof launchChrome>>,
  preset: string,
  errors: string[],
  meta: Partial<IsoRun>,
  ck: Checkpoint,
  saveCk: () => void,
): Promise<IsoPoint[]> {
  const boot = async (): Promise<{ ctx: import('playwright').BrowserContext; page: Page }> => {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})(${JSON.stringify(preset)});` });
    const page = await ctx.newPage();
    if (CPU_THROTTLE > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    watchErrors(page, { tag: preset, into: errors });
    // Byte ĐÃ GIẢI NÉN của mọi response từ Vite dev server (module TS chưa gộp, HMR, source map) tới lúc vào game: KHÔNG so được với ngân sách tải lần đầu
    // (đo bằng `pnpm bench:load` trên bản build có gzip). Ngắt listener sau khi chốt số để không giữ body suốt lần chạy.
    let bytes = 0;
    const onResponse = (r: import('playwright').Response) =>
      void r.body().then(
        (b) => (bytes += b.length),
        () => undefined,
      );
    page.on('response', onResponse);
    const name = `Iso${preset[0]}${Date.now() % 10000}`;
    await page.goto(gameUrl(CLIENT_PORT, { debug: 1, auto: name, gputime: 1, cine: 0 }, { renderer: RENDERER, extra: EXTRA }), {
      waitUntil: 'load',
      timeout: 120_000,
    });
    await waitInGame(page);
    await sleep(6000);
    page.off('response', onResponse);
    if (meta.devBytesMB === null || meta.devBytesMB === undefined) meta.devBytesMB = round(bytes / 1048576, 1);
    await skipCutscene(page);
    if (!meta.adapter) {
      Object.assign(
        meta,
        await page.evaluate(async () => {
          const be = window.__game!.renderer.backend;
          let adapter = '';
          if (be.isWebGPUBackend) {
            const i = (await (navigator as any).gpu?.requestAdapter())?.info ?? {};
            adapter = [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ');
          } else {
            const gl = be.gl as WebGL2RenderingContext;
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            adapter = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
          }
          return { adapter, backend: be.isWebGPUBackend ? 'WebGPU' : 'WebGL2' };
        }),
      );
    }
    return { ctx, page };
  };
  let { ctx, page } = await boot();
  const out: IsoPoint[] = [];
  if (TRACE > 0) {
    // `--trace N`: chỉ ghi chuỗi thời gian N giây của điểm đầu Vân Lam (tam giác, byte texture, đích vẽ, geometry, số texture) mỗi 3 s,
    // không đo gì khác: xem số có còn tăng sau khi "ổn định" (texture tải dần, LOD/cây xa nạp muộn) không.
    await gm(page, 'level 45');
    await gm(page, 'god on');
    await enterLevel(page, 'van_lam');
    const p0 = pointsOf({ id: 'van_lam', kind: 'map' })[0]!;
    await tp(page, p0.x, p0.z);
    await gm(page, 'killall', 1000);
    const t0 = Date.now();
    console.log('  giây | tam giác | texture MB (tổng) | tài sản | đích vẽ | geometry | texture');
    while ((Date.now() - t0) / 1000 < TRACE) {
      const s = await page.evaluate(() => {
        const w = window as any;
        const r = w.__game.renderer;
        return {
          tris: r.info.render.triangles,
          tex: w.__isoTexBytes(),
          rt: w.__isoRtBytes?.() ?? 0,
          geo: r.info.memory.geometries,
          ntex: r.info.memory.textures,
        };
      });
      const mbf = (n: number) => Math.round((n / 1048576) * 10) / 10;
      console.log(
        `  ${String(Math.round((Date.now() - t0) / 1000)).padStart(4)} | ${String(s.tris).padStart(8)} | ${mbf(s.tex)} | ${mbf(s.tex - s.rt)} | ${mbf(s.rt)} | ${s.geo} | ${s.ntex}`,
      );
      await sleep(3000);
    }
    await ctx.close().catch(() => undefined);
    return out;
  }
  if (BOTS > 0) {
    // Cảnh đông người: không `killall` (bot cần quái), client tới giữa rừng, chờ bot kéo tới rồi đo.
    const t: Target = { id: 'van_lam', kind: 'fight' };
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await tp(page, FOREST.x, FOREST.z);
    await sleep(12_000);
    out.push(await measure(page, `van_lam/dong${BOTS}`, t, preset));
    console.log(`  [${preset}] van_lam/dong${BOTS}: dc ${out.at(-1)!.drawCalls.p50}, cpu p95 ${out.at(-1)!.cpuMs.p95} ms`);
    // Ghi vào checkpoint như mọi mục tiêu: báo cáo cuối dựng từ `ck.points`.
    markDone(ck, preset, `van_lam/dong${BOTS}`, out);
    ck.meta = { adapter: meta.adapter, backend: meta.backend, devBytesMB: meta.devBytesMB };
    saveCk();
    await ctx.close().catch(() => undefined);
    return out;
  }
  const ts = targets();
  let sinceBoot = 0;
  for (const t of ts) {
    if (isDone(ck, preset, t.id)) {
      console.log(`  [${preset}] ${t.id}: đã có trong checkpoint, bỏ qua`);
      continue;
    }
    if (RECYCLE > 0 && sinceBoot >= RECYCLE && t.kind !== 'trib') {
      // Mở trang mới: WebGPU dễ mất thiết bị khi đổi nhiều level liền (thấy ở Vân Hải sau 3 level).
      await ctx.close().catch(() => undefined);
      ({ ctx, page } = await boot());
      sinceBoot = 0;
    }
    sinceBoot++;
    const before = out.length;
    try {
      if (t.kind === 'map') {
        await gm(page, 'level 45');
        await gm(page, 'god on');
        await enterLevel(page, t.id);
      } else await dungeonEnter(page, t);
      for (const p of pointsOf(t)) {
        await tp(page, p.x, p.z);
        await gm(page, 'killall', 1000);
        await sleep(1500);
        await settle(page, `${t.id}/${p.name}`);
        out.push(await measure(page, `${t.id}/${p.name}`, t, preset));
        console.log(`  [${preset}] ${t.id}/${p.name}: dc ${out.at(-1)!.drawCalls.p50}, cpu p95 ${out.at(-1)!.cpuMs.p95} ms`);
      }
      // Một cảnh đánh đông cho mỗi bản đồ/bí cảnh thường (phòng cầu/sân độ kiếp đã có quái riêng của chúng).
      if (t.kind === 'map' || t.kind === 'dungeon') out.push(await fight(page, t, preset));
      markDone(ck, preset, t.id, out.slice(before));
      ck.meta = { adapter: meta.adapter, backend: meta.backend, devBytesMB: meta.devBytesMB };
      ck.errors = errors.slice();
      saveCk();
    } catch (e) {
      errors.push(`${preset}/${t.id}: ${e instanceof Error ? e.message : e}`);
      console.warn(`  [${preset}] bỏ ${t.id}: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
      out.length = before; // không giữ điểm dở dang của mục tiêu lỗi
      sinceBoot = RECYCLE; // trang có thể đã hỏng (mất thiết bị GPU/phòng): mở trang mới trước mục tiêu kế
    }
  }
  await ctx.close().catch(() => undefined);
  return out;
}

/** Tên GPU của máy (Windows: WMI) để ghi vào báo cáo và biết có iGPU không. */
function listGpus(): string[] {
  if (process.platform !== 'win32') return [];
  try {
    const o = execFileSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    return o
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Thoát nếu worktree thiếu asset so sổ khóa (số đo sẽ thấp một cách im lặng). `--allow-missing-assets` bỏ qua. */
function assertAssets(): void {
  if (flag('--allow-missing-assets')) return;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const r = checkAssets(readLockFiles(path.join(root, 'assets/asset-lock.json')), path.join(root, 'apps/client/public'));
  if (!r.missing.length) return;
  console.error(
    `[perf:iso] thiếu ${r.missing.length}/${r.total} tệp asset của cảnh so với sổ khóa (vd ${r.missing.slice(0, 5).join(', ')}).
` + 'Số đo sẽ THẤP một cách im lặng (thiếu kiến trúc/prop/cây). Chạy `pnpm assets:pull` rồi đo lại; cố ý thì thêm --allow-missing-assets.',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  assertAssets();
  const dev = createDevServer({
    port: PORT,
    clientPort: CLIENT_PORT,
    tag: 'perf-iso',
    command: 'pnpm perf:iso',
    ...(BOTS > 0 ? { env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' } } : {}),
  });
  const bots = new Bots(PORT);
  const gpus = listGpus();
  console.log(`[perf:iso] GPU máy: ${gpus.join(' | ') || '(không đọc được)'}`);
  const errors: string[] = [];
  const meta: Partial<IsoRun> = {};
  const method = SETTLE_MAX > 0 ? BASELINE_METHOD : undefined;
  const ckDir = outDir('bench/results');
  fs.mkdirSync(ckDir, { recursive: true });
  const ckFile = path.join(ckDir, 'iso-checkpoint.json');
  /** Tùy chọn quyết định cách đo: lưu vào checkpoint, khác thì không `--resume` (số đo không so được). */
  const runOpts: RunOpts = {
    seconds: SECONDS,
    cpuThrottle: CPU_THROTTLE,
    igpu: flag('--igpu'),
    noshadow: NOSHADOW,
    query: EXTRA,
    quick: QUICK,
    bots: BOTS,
  };
  let ck = emptyCheckpoint(`${VW}x${VH}`, method, runOpts);
  const resume = opt('--resume', '');
  if (resume) {
    const loaded = JSON.parse(fs.readFileSync(path.resolve(resume), 'utf8')) as Checkpoint;
    const why = incompatibility(loaded, {
      viewport: `${VW}x${VH}`,
      method,
      backend: RENDERER === 'webgpu' ? 'WebGPU' : 'WebGL2',
      opts: runOpts,
    });
    if (why) throw new Error(`không làm tiếp được từ ${resume}: ${why}`);
    ck = loaded;
    errors.push(...ck.errors);
    Object.assign(meta, ck.meta);
    console.log(`[perf:iso] làm tiếp từ checkpoint: ${ck.done.length} mục tiêu đã xong, ${ck.points.length} điểm`);
  }
  /** Ghi checkpoint nguyên tử (tệp tạm rồi đổi tên) sau mỗi mục tiêu. */
  const saveCk = (): void => {
    ck.backend = meta.backend;
    fs.writeFileSync(`${ckFile}.tmp`, JSON.stringify(ck));
    fs.renameSync(`${ckFile}.tmp`, ckFile);
  };
  let browser: Awaited<ReturnType<typeof launchChrome>> | undefined;
  try {
    await dev.start();
    if (BOTS > 0)
      console.log(
        `[perf:iso] ${await bots.start(BOTS, 'iso', ['--level', '15', '--fight', `${FOREST.x},${FOREST.z},40`, '--tp'])} bot đã vào`,
      );
    browser = await launchChrome({
      channel: opt('--channel', 'chrome'),
      args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', ...(flag('--igpu') ? ['--force_low_power_gpu'] : [])],
      tag: 'perf-iso',
    });
    for (const preset of PRESETS) await runPreset(browser, preset, errors, meta, ck, saveCk);
  } finally {
    await browser?.close().catch(() => undefined);
    await bots.stop();
    dev.stop();
  }
  // `--trace` chỉ in chuỗi thời gian, không đo điểm nào: không ghi iso-*.json rỗng trông như một lần đo thật.
  if (TRACE > 0) return;
  if (ck.points.length === 0) throw new Error('không có điểm đo nào (mọi mục tiêu đều lỗi?): không ghi báo cáo rỗng');
  const date = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const run: IsoRun = {
    version: 1,
    date,
    adapter: `${meta.adapter ?? ''}${gpus.length ? ` [máy: ${gpus.join(', ')}]` : ''}`,
    backend: meta.backend ?? '?',
    viewport: `${VW}x${VH}`,
    quick: QUICK,
    ...(method ? { method } : {}),
    ...(CPU_THROTTLE > 1 || flag('--igpu') ? { emulation: { cpuThrottle: CPU_THROTTLE, igpu: flag('--igpu') } } : {}),
    devBytesMB: meta.devBytesMB ?? null,
    points: ck.points,
    errors,
  };
  const dir = outDir('bench/results');
  fs.mkdirSync(dir, { recursive: true });
  const bp = opt('--baseline', '');
  const deltas = bp ? compareRuns(JSON.parse(fs.readFileSync(path.resolve(bp), 'utf8')) as IsoRun, run) : [];
  fs.writeFileSync(path.join(dir, `iso-${date}.json`), JSON.stringify(run, null, 1));
  fs.writeFileSync(path.join(dir, `iso-${date}.md`), toMarkdown(run, deltas));
  console.log(toMarkdown(run, deltas));
  reportErrors('perf-iso', errors);
  console.log(`[perf-iso] ghi ${path.join(dir, `iso-${date}.json`)} (.md cạnh bên)`);
  // Chỉ xóa checkpoint khi đã chạy ĐỦ danh sách (không `--only`/`--quick`/`--bots`): chạy theo nhóm cần checkpoint để `--resume` nhóm kế.
  if (ONLY.length === 0 && !QUICK && BOTS === 0) fs.rmSync(ckFile, { force: true });
  else console.log(`[perf-iso] giữ checkpoint ${ckFile}: làm tiếp nhóm khác bằng --resume ${ckFile}`);
}

main().catch((e) => {
  console.error('[perf-iso] lỗi:', e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
});
