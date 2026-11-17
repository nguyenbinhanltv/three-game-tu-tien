// pnpm bench:crowd (M6-3): đo ngân sách hiệu năng khi đông người — N bot headless (pnpm bots) + 1 client đo.
//
// Tự chạy `pnpm dev` ở cặp cổng riêng (PORT/CLIENT_PORT, mặc định 2675/5175; DB tạm, đăng nhập thử,
// RATE_LIMIT_EXEMPT=loopback để 100 bot không vướng giới hạn /matchmake, MAX_CLIENTS=128 để cả 100 bot và
// client đo chung MỘT kênh: trường hợp nặng nhất cho client; server thật tách kênh ở 50 người).
// Mỗi cảnh × số bot: chạy bot ở cảnh đó, rồi với mỗi renderer mở Chrome headless tắt tiếng
// (`--mute-audio`, URL `?mute=1&debug=1&gputime=1&cine=0&auto=…`, `cine=0` tắt cảnh mở đầu); mỗi renderer × preset nạp trang mới (preset đặt trong
// localStorage trước khi nạp), đứng giữa cảnh, chờ ấm máy, xoay camera trọn một vòng trong N giây và ghi:
//   - mỗi khung: CPU `Game.frame()`, draw call, tam giác (đọc ngay sau frame(), cả khung gồm hậu kỳ) và thời gian
//     từng phần (terrain, ents, vfx, env, ambient, matrix, render, dmg, camera…);
//   - GPU: tổng timestamp query của các pass (WebGPU `timestamp-query`, WebGL2 `EXT_disjoint_timer_query_webgl2`
//     nếu trình duyệt có), chia đều cho số khung trong mỗi lần resolve;
//   - cuối điểm: texture/geometry, texture MB ước tính (cách của bench.ts), JS heap, số người/quái/hạt, LOD;
//   - băng thông của client đo (byte WebSocket nhận/gửi tới server game mỗi giây);
//   - server: tick p95 của room đang chứa client đo (đọc /health mỗi giây, lấy lớn nhất trong lúc đo).
// Cảnh:
//   san     sân tông môn: bot đi lại/đứng quanh chỗ hồi sinh (--crowd), không quái.
//   rung    giữa rừng: bot cấp 15 đánh quái thường liên tục (--fight), client gọi thêm quái cho đủ.
//   boss    lòng chảo Kiếm Trủng trong room thế giới: bot cấp 15 đánh boss có xương + Kiếm Linh (gọi bằng /gm spawn,
//           chết thì gọi lại), mọi chiêu của 50/100 người: cảnh nhiều VFX nhất.
//   dungeon bí cảnh Kiếm Trủng thật (room riêng, tối đa 5 người): client đo + 4 bot vào qua cổng, đánh đợt quái và boss.
//           Không phụ thuộc --bots (luôn 4 bot), chạy một lần.
// Kết quả: bảng ra stdout, JSON ở bench/results/crowd-<ngày>.json. Bot và server luôn tắt khi xong, kể cả khi lỗi.
//
// Cờ:
//   --bots 50,100   --scenes san,rung,boss,dungeon   --renderers webgpu,webgl2   --presets medium,high
//   --seconds 10 (mỗi điểm)   --warmup 5   --size 1280x720   --dpr 1   --channel chrome|msedge|chromium   --headed
//   --screenshot: chụp ảnh giữa vòng xoay camera (bench/results/crowd-<cảnh>-<bot>-<backend>-<preset>.png)
//   --profile: ghi CPU profile trong lúc đo (Chrome DevTools mở được), in 25 hàm tốn self-time nhất; làm CPU khung cao hơn
// Biến môi trường: PORT, CLIENT_PORT, BENCH_CHANNEL.

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { C, FOREST, KIEM_TRUNG, MS_DEAD, PF_DEAD, PORTAL_POS, SPAWN_POINT } from '@dtl/shared';
import type { Browser, Page } from 'playwright';
import { createDevServer, killTree, ROOT, sleep } from './lib/devserver';
import { args, env, opt, ports } from './lib/env';
import { launchChrome } from './lib/browser';
import { gm } from './lib/game';

const OUT_DIR = path.join(ROOT, 'bench/results');

// ---------- tham số ----------
const BOTS = opt('--bots', '50,100').split(',').map(Number).filter((n) => n > 0);
const SCENES = opt('--scenes', 'san,rung,boss,dungeon').split(',').filter(Boolean);
const RENDERERS = opt('--renderers', 'webgpu,webgl2').split(',').filter(Boolean) as ('webgpu' | 'webgl2')[];
const PRESETS = opt('--presets', 'medium,high').split(',').filter(Boolean);
const SECONDS = Number(opt('--seconds', '10'));
const WARMUP = Number(opt('--warmup', '5'));
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const DPR = Number(opt('--dpr', '1'));
const CHANNEL = opt('--channel', env('BENCH_CHANNEL', 'chrome'));
const HEADED = args.includes('--headed');
/** Ghi CPU profile (CDP) trong lúc đo, lưu .cpuprofile vào bench/results và in hàm tốn self-time nhất. */
const PROFILE = args.includes('--profile');
/** Chụp ảnh màn hình giữa vòng xoay camera, lưu vào bench/results. */
const SCREENSHOT = args.includes('--screenshot');
const { port: PORT, clientPort: CLIENT_PORT } = ports(2675, 5175);

const BUDGET = { drawCalls: 300, triangles: 2_000_000, textureMB: 512, cpuP95Ms: 8, heapMB: 500, tickP95Ms: 25 };
const CAM = { pitch: 0.38, dist: 13 };

type Keep = { ids: string[]; min: number; bossIds?: string[] };
type Scene = { name: string; x: number; z: number; bots: string[]; keep?: Keep; dungeon?: boolean; /** Địa điểm `places.json` ở level khác: client đo mở trận rồi `tp` sang đó trước khi tới tâm cảnh. */ place?: string; room?: string };
const KT = { x: KIEM_TRUNG.x, z: KIEM_TRUNG.z - 12 };
const SCENE_DEFS: Record<string, Scene> = {
  san: { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, bots: ['--crowd', `${SPAWN_POINT.x},${SPAWN_POINT.z},25`, '--tp'] },
  rung: {
    name: 'rung',
    x: FOREST.x,
    z: FOREST.z,
    bots: ['--fight', `${FOREST.x},${FOREST.z},30`, '--level', '15', '--tp'],
    keep: { ids: ['mon_soi_xam', 'mon_thiet_boi_tru', 'mon_hoa_van_ho', 'mon_thach_vien'], min: 10 },
  },
  boss: {
    name: 'boss',
    x: KT.x,
    z: KT.z,
    bots: ['--fight', `${KT.x},${KT.z},30`, '--level', '15', '--tp'],
    keep: { ids: ['mon_kiem_linh'], min: 4, bossIds: ['boss_thu_mo_tuong', 'boss_huyet_lang_vuong', 'boss_kiem_khoi'] },
  },
  // V6: Vân Hải (level van_hai, Tùng Đài Đảo): bot cấp 23 sang đảo bằng /gm rồi đánh quái bay + boss Kình Vương.
  vanhai: {
    name: 'vanhai',
    x: 715,
    z: 1273,
    bots: ['--gm', 'tele all;tp vh_tung_dai', '--fight', '715,1273,30', '--level', '23'],
    keep: { ids: ['mon_van_hac'], min: 8, bossIds: ['boss_van_hai_kinh_vuong'] },
    place: 'vh_tung_dai',
    room: 'world-van_hai',
  },
  dungeon: {
    name: 'dungeon',
    x: KT.x,
    z: KT.z,
    bots: ['--dungeon', '--fight', `${KT.x},${KT.z},30`, '--level', '15', '--tp'],
    keep: { ids: [], min: 0, bossIds: ['boss_thu_mo_tuong'] },
    dungeon: true,
  },
};

// ---------- server ----------
const dev = createDevServer({
  port: PORT,
  clientPort: CLIENT_PORT,
  tag: 'crowd',
  command: 'pnpm bench:crowd',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
});

type Health = { online: number; rooms: { name: string; players: number; monsters: number; tickP95: number }[] };
async function health(): Promise<Health | null> {
  try {
    return (await (await fetch(`http://localhost:${PORT}/health`)).json()) as Health;
  } catch {
    return null;
  }
}

// ---------- bot ----------
const botRequire = createRequire(path.join(ROOT, 'apps/bot-client/package.json'));
const TSX_CLI = botRequire.resolve('tsx/cli');

class Bots {
  child: ChildProcess | null = null;
  out: string[] = [];
  async start(count: number, prefix: string, extra: string[]): Promise<number> {
    const a = [TSX_CLI, 'src/index.ts', '--count', String(count), '--duration', '3600', '--url', `ws://localhost:${PORT}`, '--prefix', prefix, ...extra];
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
const bots = new Bots();

/** Chờ server thấy đúng `n` người (rời room cũ có thể trễ vài giây). */
async function waitOnline(pred: (h: Health) => boolean, ms: number): Promise<Health | null> {
  const until = Date.now() + ms;
  let h: Health | null = null;
  while (Date.now() < until) {
    h = await health();
    if (h && pred(h)) return h;
    await sleep(500);
  }
  return h;
}

// ---------- đo trong trang ----------
type FrameRow = [cpuMs: number, drawCalls: number, triangles: number];
declare global {
  interface Window {
    __crowd: {
      rec: boolean;
      frames: FrameRow[];
      parts: Record<string, number[]>;
      gpu: number[];
      gpuOk: boolean;
      /** Pipeline/program (shader) tạo mới trong lúc đo: khác 0 nghĩa là có khựng do biên dịch lần đầu. */
      pipelines: number;
      programs: number;
      pipeDesc: string[];
      /** Đếm draw call một khung theo đích vẽ | loại object | material | tên (đặt `probe = 1` rồi đọc `probeOut`). */
      probe: number;
      probeOut: Record<string, number>;
      /** Byte thuộc tính đẩy lên GPU trong lúc đo, theo thuộc tính. */
      uploads: Record<string, number>;
      /** Material/object đang vẽ (gắn vào khóa upload). */
      drawing: string;
      /** Khung > 12 ms: [ms, pipeline tạo trong khung, phần ≥ 1 ms]. */
      long: [number, number, Record<string, number>][];
      rx: number;
      tx: number;
      cam: { t0: number; dur: number; pitch: number; dist: number } | null;
      texBytes: () => number;
      texTop: (n: number) => string[];
    };
  }
}

/** Chạy trong trang trước mọi script: đặt preset, đếm byte WebSocket tới server game, bọc `frame()`, backend và các phần. */
function initScript(preset: string, port: number): void {
  localStorage.setItem('dtl.quality', preset);
  const w = window;
  const tex = new Map<object, number>();
  const texDesc = new Map<object, string>();
  const B: Window['__crowd'] = {
    rec: false,
    frames: [],
    parts: {},
    gpu: [],
    gpuOk: false,
    pipelines: 0,
    programs: 0,
    pipeDesc: [],
    probe: 0,
    probeOut: {},
    uploads: {},
    drawing: '',
    long: [],
    rx: 0,
    tx: 0,
    cam: null,
    texBytes: () => {
      let s = 0;
      for (const v of tex.values()) s += v;
      return s;
    },
    texTop: (n) =>
      [...tex.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([t, b]) => `${(b / 1048576).toFixed(1)}MB ${texDesc.get(t)}`),
  };
  w.__crowd = B;

  // Băng thông: chỉ socket tới server game (bỏ HMR của Vite).
  const NativeWS = window.WebSocket;
  const size = (d: any): number => (typeof d === 'string' ? d.length : (d?.byteLength ?? d?.size ?? 0));
  class CountingWS extends NativeWS {
    private counted: boolean;
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.counted = String(url).includes(':' + port);
      if (this.counted) this.addEventListener('message', (e) => (B.rx += size((e as MessageEvent).data)));
    }
    send(d: any): void {
      if (this.counted) B.tx += size(d);
      super.send(d);
    }
  }
  window.WebSocket = CountingWS as typeof WebSocket;

  // Byte texture ước tính (giống bench.ts).
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

  // Thời gian từng phần trong frame() (cộng dồn trong khung, ghi khi đang đo).
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

  let patchedBackend: unknown = null;
  let gpuPending = false;
  let gpuFrames = 0;
  const hook = (g: Record<string, any>) => {
    const frame = g.frame;
    g.frame = function crowdFrame(this: unknown) {
      const r = g.renderer;
      const be = r?.backend;
      if (be && patchedBackend !== be) {
        patchedBackend = be;
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
        const pipe = be.createRenderPipeline.bind(be);
        be.createRenderPipeline = (...a: unknown[]) => {
          if (B.rec) {
            B.pipelines++;
            const ro = a[0] as any;
            const m = ro?.material;
            const o = ro?.object;
            if (B.pipeDesc.length < 40) B.pipeDesc.push(`${m?.type ?? '?'}:${m?.name || '-'} obj=${o?.type ?? '?'}:${o?.name || o?.parent?.name || '-'}${o?.isSkinnedMesh ? ' skinned' : ''}${o?.isInstancedMesh ? ' inst' : ''}`);
          }
          return pipe(...a);
        };
        const updAttr = be.updateAttribute.bind(be);
        be.updateAttribute = (attr: any) => {
          if (B.rec) {
            // Byte thực đẩy lên GPU: theo update range nếu có, không thì cả mảng.
            const arr = attr.array;
            const per = arr?.BYTES_PER_ELEMENT ?? 4;
            const ranges = attr.updateRanges as { start: number; count: number }[] | undefined;
            const bytes = ranges?.length ? ranges.reduce((s2, r2) => s2 + r2.count * per, 0) : (arr?.byteLength ?? 0);
            const k = `${B.drawing} ${arr?.constructor?.name ?? '?'}[${arr?.length ?? 0}]${attr.isInstancedBufferAttribute ? ' inst' : ''}`;
            B.uploads[k] = (B.uploads[k] ?? 0) + bytes;
          }
          return updAttr(attr);
        };
        const prog = be.createProgram.bind(be);
        be.createProgram = (...a: unknown[]) => {
          if (B.rec) B.programs++;
          return prog(...a);
        };
      }
      if (r && !r.__probed && typeof r._renderObjectDirect === 'function') {
        r.__probed = true;
        // three gán `_handleObjectFunction = _renderObjectDirect` ở constructor (và sau compileAsync): bọc cả hai.
        const direct = Object.getPrototypeOf(r)._renderObjectDirect.bind(r);
        r._handleObjectFunction = r._renderObjectDirect = (object: any, material: any, ...rest: unknown[]) => {
          if (B.rec) B.drawing = `${material?.name || material?.type || '?'}/${object?.name || object?.parent?.name || object?.type} ${object?.geometry?.attributes?.position?.count ?? 0}v`;
          if (B.probe === 2) {
            const rt = r.getRenderTarget();
            const dst = rt ? rt.texture?.name || (rt.depthTexture && !rt.texture?.isTexture ? 'depth' : 'rt') : 'screen';
            const kind = object.isSkinnedMesh ? 'skin' : object.isInstancedMesh ? 'inst' : object.isBatchedMesh ? 'batch' : object.isSprite ? 'sprite' : object.isPoints ? 'points' : object.isLine ? 'line' : 'mesh';
            let named = object;
            while (named && !named.name && named.parent) named = named.parent;
            const geo = object.geometry?.name || `${object.geometry?.type ?? '?'}/${object.geometry?.attributes?.position?.count ?? 0}v`;
            const k = `${dst} | ${kind} | ${material?.type ?? '?'}:${material?.name || '-'} | ${named?.name || '-'} | ${geo}`;
            B.probeOut[k] = (B.probeOut[k] ?? 0) + 1;
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
      wrapPart(g.dmg, 'update', 'dmg');
      wrapPart(g.offscreen, 'update', 'offscreen');
      wrapPart(g, 'updateCamera', 'camera');
      const c = B.cam;
      if (c) {
        const k = Math.min(1, (performance.now() - c.t0) / c.dur);
        g.camYaw = k * Math.PI * 2;
        g.camPitch = c.pitch;
        g.camDist = c.dist;
      }
      cur = {};
      // Đầu dò: 1 = chờ khung kế, 2 = đang đếm khung này, 3 = xong.
      if (B.probe === 1) {
        B.probeOut = {};
        B.probe = 2;
      }
      const pipes0 = B.pipelines;
      const t0 = performance.now();
      frame.call(g);
      const dt = performance.now() - t0;
      if (B.probe === 2) B.probe = 3;
      if (!B.rec || !r) return;
      B.frames.push([dt, r.info.render.drawCalls ?? r.info.render.calls, r.info.render.triangles]);
      for (const [k, v] of Object.entries(cur)) (B.parts[k] ??= []).push(v);
      if (dt > 12) {
        const p: Record<string, number> = {};
        for (const [k, v] of Object.entries(cur)) if (v >= 1) p[k] = Math.round(v * 10) / 10;
        B.long.push([Math.round(dt * 10) / 10, B.pipelines - pipes0, p]);
      }
      // GPU: resolve timestamp query khi lần trước xong; tổng thời gian chia đều cho số khung đã gộp.
      gpuFrames++;
      if (be?.trackTimestamp && !gpuPending) {
        gpuPending = true;
        const n = gpuFrames;
        gpuFrames = 0;
        Promise.all([r.resolveTimestampsAsync('render'), r.resolveTimestampsAsync('compute')])
          .then(([a, b]: [number | undefined, number | undefined]) => {
            const ms = (a ?? 0) + (b ?? 0);
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

const quant = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

type Point = {
  scene: string;
  bots: number;
  renderer: string;
  backend: string;
  preset: string;
  frames: number;
  fps: number;
  cpuMs: { p50: number; p95: number; p99: number; max: number };
  gpuMs: { p50: number; p95: number } | null;
  parts: Record<string, { mean: number; p95: number }>;
  drawCalls: { p50: number; max: number };
  triangles: { p50: number; max: number };
  textures: number;
  textureMB: number;
  geometries: number;
  jsHeapMB: number | null;
  players: number;
  monsters: number;
  particles: number;
  lod: string;
  kbpsDown: number;
  kbpsUp: number;
  serverRoom: string;
  serverPlayers: number;
  tickP95Ms: number;
  arrived: boolean;
  /** Pipeline/program tạo mới trong lúc đo, và khung > 12 ms (tối đa 10). */
  pipelines: number;
  programs: number;
  /** Draw call một khung theo `đích | loại | material | tên`, nhiều nhất trước (tối đa 30 nhóm). */
  drawBreakdown: [string, number][];
  /** Upload thuộc tính lên GPU (KB/giây) theo thuộc tính, nhiều nhất trước. */
  attrUploadKBps: [string, number][];
  /** Số node theo nhánh con cấp 1 của scene. */
  sceneNodes: string[];
  /** Material/object của pipeline tạo mới trong lúc đo (tối đa 40). */
  newPipelines: string[];
  /** Mảnh gộp VFX đã tạo (kiểu|hình|renderOrder|mảnh) tính từ lúc vào game: mỗi mảnh biên dịch shader ở lần vẽ đầu. */
  fxBuckets: string[];
  longFrames: [number, number, Record<string, number>][];
  topTextures: string[];
};

type CpuProfile = {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[];
  samples: number[];
  timeDeltas: number[];
};

/** Self-time theo hàm (tên + file:dòng), cộng mọi node trùng hàm. */
function topSelf(p: CpuProfile, n: number): [string, number][] {
  const byId = new Map(p.nodes.map((x) => [x.id, x]));
  const acc = new Map<string, number>();
  for (let i = 0; i < p.samples.length; i++) {
    const cf = byId.get(p.samples[i])?.callFrame;
    if (!cf) continue;
    const file = cf.url.split('/').pop()?.split('?')[0] ?? '';
    const k = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    acc.set(k, (acc.get(k) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000);
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}


/** Đếm quái/boss còn sống quanh tâm cảnh (theo trạng thái room client nhận). */
async function aliveNear(page: Page, sc: Scene): Promise<Record<string, number>> {
  return page.evaluate(
    ({ x, z, dead }) => {
      const g = window.__game!;
      const out: Record<string, number> = {};
      g.view?.monsters?.forEach((m: { x: number; z: number; st: number; t: string }) => {
        if (m.st !== dead && Math.hypot(m.x - x, m.z - z) < 60) out[m.t] = (out[m.t] ?? 0) + 1;
      });
      return out;
    },
    { x: sc.x, z: sc.z, dead: MS_DEAD },
  );
}

/**
 * Giữ cảnh đủ quái/boss và giữ client đo còn sống: mỗi ~2 giây đếm quái quanh tâm, thiếu thì /gm spawn,
 * mỗi ~4 giây /gm heal. Chạy song song với lúc đo cho tới khi `stop.v`.
 */
async function keeper(page: Page, sc: Scene, stop: { v: boolean }): Promise<void> {
  if (!sc.keep) return;
  const k = sc.keep;
  let i = 0;
  let healAt = 0;
  while (!stop.v) {
    try {
      const alive = await aliveNear(page, sc);
      const bossAlive = (k.bossIds ?? []).some((b) => alive[b]);
      if (k.bossIds?.length && !bossAlive) await gm(page, `spawn ${k.bossIds[i++ % k.bossIds.length]} 1`);
      const mobs = k.ids.reduce((s, id) => s + (alive[id] ?? 0), 0);
      if (k.ids.length && mobs < k.min) await gm(page, `spawn ${k.ids[i++ % k.ids.length]} ${Math.min(6, k.min - mobs)}`);
      if (Date.now() > healAt) {
        healAt = Date.now() + 4000;
        await gm(page, 'heal');
      }
      const fl = await page.evaluate(() => window.__game!.me?.()?.fl ?? 0);
      // Client đo bị hạ: hồi sinh (về điểm hồi sinh) rồi tp lại tâm cảnh.
      if (fl & PF_DEAD) {
        await page.evaluate((t) => window.__game!.send(t), C.RESPAWN);
        await sleep(500);
        await gm(page, `tp ${sc.x} ${sc.z}`);
      }
    } catch {
      /* trang đang đổi room */
    }
    await sleep(1000);
  }
}

async function openClient(browser: Browser, renderer: 'webgpu' | 'webgl2', preset: string, name: string): Promise<{ page: Page; errors: string[]; backend: string; adapter: string }> {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})(${JSON.stringify(preset)}, ${PORT});` });
  const url = `http://localhost:${CLIENT_PORT}/?mute=1&debug=1&gputime=1&cine=0&auto=${encodeURIComponent(name)}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}${(env('CROWD_QUERY')).includes('fxq=') ? '' : `&fxq=${preset}`}${env('CROWD_QUERY')}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await waitInGame(page);
  const info = await page.evaluate(async () => {
    const g = window.__game!;
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
    return { backend: be.isWebGPUBackend ? 'WebGPU' : 'WebGL2', adapter };
  });
  return { page, errors, ...info };
}

async function waitInGame(page: Page, room?: string): Promise<void> {
  await page.waitForFunction(
    (r) => {
      const g = window.__game;
      return !!g && g.frames > 30 && !!g.me?.() && (!r || g.room?.name === r);
    },
    room,
    { timeout: 120_000, polling: 250 },
  );
}

/** Dịch chuyển tới tâm cảnh và chờ ô địa hình nạp xong (như bench.ts). */
async function goTo(page: Page, sc: Scene): Promise<boolean> {
  if (sc.place && sc.room) {
    await gm(page, 'tele all');
    await gm(page, `tp ${sc.place}`);
    await waitInGame(page, sc.room);
  }
  await gm(page, `tp ${sc.x} ${sc.z}`);
  const until = Date.now() + 20_000;
  const start = Date.now();
  let lastTiles = -1;
  let stableSince = Date.now();
  let arrived = false;
  while (Date.now() < until) {
    const s = await page.evaluate(() => {
      const g = window.__game!;
      return { tiles: g.terrain.tileCount() as number, x: g.renderPos.x as number, z: g.renderPos.z as number };
    });
    arrived = Math.hypot(s.x - sc.x, s.z - sc.z) < 4;
    if (s.tiles !== lastTiles || !arrived) {
      lastTiles = s.tiles;
      stableSince = Date.now();
    }
    if (arrived && Date.now() - start > 3000 && Date.now() - stableSince > 1500) break;
    await sleep(250);
  }
  return arrived;
}

async function measure(page: Page, sc: Scene, nBots: number, renderer: string, backend: string, preset: string, arrived: boolean): Promise<Point> {
  await sleep(WARMUP * 1000);
  const roomName = await page.evaluate(() => window.__game!.room?.name as string);
  await page.evaluate(
    ({ dur, cam }) => {
      const B = window.__crowd;
      B.frames = [];
      B.parts = {};
      B.gpu = [];
      B.pipelines = 0;
      B.programs = 0;
      B.pipeDesc = [];
      B.uploads = {};
      B.long = [];
      B.rx = 0;
      B.tx = 0;
      B.cam = { t0: performance.now(), dur, pitch: cam.pitch, dist: cam.dist };
      B.rec = true;
    },
    { dur: SECONDS * 1000, cam: CAM },
  );
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  const t0 = Date.now();
  let tick = 0;
  let serverPlayers = 0;
  let shot = !SCREENSHOT;
  while (Date.now() - t0 < SECONDS * 1000) {
    if (!shot && Date.now() - t0 > SECONDS * 400) {
      shot = true;
      fs.mkdirSync(OUT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(OUT_DIR, `crowd-${sc.name}-${nBots}-${backend}-${preset}.png`) });
    }
    const h = await health();
    const r = h?.rooms.filter((x) => x.name === roomName && x.players > 0).sort((a, b) => b.players - a.players)[0];
    if (r) {
      tick = Math.max(tick, r.tickP95);
      serverPlayers = Math.max(serverPlayers, r.players);
    }
    await sleep(1000);
  }
  if (cdp) {
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: CpuProfile };
    const file = path.join(OUT_DIR, `crowd-${sc.name}-${nBots}-${backend}-${preset}.cpuprofile`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profile));
    console.log(`
[crowd] profile ${path.relative(ROOT, file)}`);
    for (const [k, ms] of topSelf(profile, 25)) console.log(`  ${ms.toFixed(0).padStart(6)} ms  ${k}`);
    await cdp.detach().catch(() => undefined);
  }
  // Đầu dò draw call ở góc camera cuối vòng (cùng hướng bắt đầu).
  await page.evaluate(() => (window.__crowd.probe = 1));
  await sleep(300);
  const raw = await page.evaluate(() => {
    const w = window;
    const B = w.__crowd;
    B.rec = false;
    B.cam = null;
    B.probe = 0;
    const g = w.__game!;
    const mem = performance.memory;
    const lod = g.ents.lodStats?.();
    return {
      frames: B.frames,
      parts: B.parts,
      gpu: B.gpu,
      pipelines: B.pipelines,
      programs: B.programs,
      pipeDesc: B.pipeDesc,
      probe: B.probeOut,
      uploads: B.uploads,
      // Số node trong cảnh theo nhánh con cấp 1 (và số node tự cập nhật ma trận).
      sceneNodes: (g.scene.children as any[]).map((c) => {
        let n = 0;
        let auto = 0;
        c.traverse((o: any) => {
          n++;
          if (o.matrixAutoUpdate) auto++;
        });
        return `${c.name || c.type} ${n} node (${auto} auto)`;
      }),
      fxBuckets: [...(g.vfx.batch.created as string[])],
      long: B.long,
      rx: B.rx,
      tx: B.tx,
      textures: g.renderer.info.memory.textures as number,
      geometries: g.renderer.info.memory.geometries as number,
      texBytes: B.texBytes(),
      top: B.texTop(5),
      heap: mem ? (mem.usedJSHeapSize as number) : null,
      players: g.ents.players.size as number,
      monsters: g.ents.monsters.size as number,
      particles: (g.vfx.particles.aliveCount?.().total as number) ?? 0,
      lod: lod ? `${lod.lod.join('/')} (ngoài khung ${lod.offscreen})` : '',
    };
  });
  const secs = (Date.now() - t0) / 1000;
  const cpu = raw.frames.map((f) => f[0]).sort((a, b) => a - b);
  const dc = raw.frames.map((f) => f[1]).sort((a, b) => a - b);
  const tri = raw.frames.map((f) => f[2]).sort((a, b) => a - b);
  const gpu = [...raw.gpu].sort((a, b) => a - b);
  const parts: Point['parts'] = {};
  for (const [k, v] of Object.entries(raw.parts)) {
    const s = [...v].sort((a, b) => a - b);
    // Phần không chạy mỗi khung vẫn tính trung bình trên mọi khung đã ghi.
    parts[k] = { mean: round(v.reduce((a, b) => a + b, 0) / Math.max(1, raw.frames.length)), p95: round(quant(s, 0.95)) };
  }
  return {
    scene: sc.name,
    bots: nBots,
    renderer,
    backend,
    preset,
    frames: raw.frames.length,
    fps: round(raw.frames.length / secs, 1),
    cpuMs: { p50: round(quant(cpu, 0.5)), p95: round(quant(cpu, 0.95)), p99: round(quant(cpu, 0.99)), max: round(cpu[cpu.length - 1] ?? 0) },
    gpuMs: gpu.length ? { p50: round(quant(gpu, 0.5)), p95: round(quant(gpu, 0.95)) } : null,
    parts,
    drawCalls: { p50: quant(dc, 0.5), max: dc[dc.length - 1] ?? 0 },
    triangles: { p50: Math.round(quant(tri, 0.5)), max: Math.round(tri[tri.length - 1] ?? 0) },
    textures: raw.textures,
    textureMB: round(raw.texBytes / 1048576, 1),
    geometries: raw.geometries,
    jsHeapMB: raw.heap === null ? null : round(raw.heap / 1048576, 1),
    players: raw.players,
    monsters: raw.monsters,
    particles: raw.particles,
    lod: raw.lod,
    kbpsDown: round(raw.rx / 1024 / secs, 1),
    kbpsUp: round(raw.tx / 1024 / secs, 1),
    serverRoom: roomName,
    serverPlayers,
    tickP95Ms: tick,
    arrived,
    pipelines: raw.pipelines,
    programs: raw.programs,
    newPipelines: raw.pipeDesc,
    fxBuckets: raw.fxBuckets,
    drawBreakdown: Object.entries(raw.probe as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 40),
    sceneNodes: raw.sceneNodes,
    attrUploadKBps: Object.entries(raw.uploads as Record<string, number>)
      .map(([k, b]) => [k, round(b / 1024 / secs, 1)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    longFrames: [...raw.long].sort((a, b) => b[0] - a[0]).slice(0, 10),
    topTextures: raw.top,
  };
}

/**
 * Một lần đo: nạp trang mới với preset đặt sẵn (như bench.ts: đổi preset lúc chạy không dựng lại đúng mọi thứ như lúc
 * nạp, vd. bóng), lên cấp 15, `enter` đưa client vào chỗ (thế giới: tp; bí cảnh: qua cổng + bot theo vào), giữ cảnh, đo.
 */
async function runOne(
  browser: Browser,
  sc: Scene,
  nBots: number,
  renderer: 'webgpu' | 'webgl2',
  preset: string,
  errorsOut: string[],
  enter?: (page: Page) => Promise<void>,
): Promise<Point> {
  const name = `Do_${renderer === 'webgpu' ? 'gpu' : 'gl'}_${preset.slice(0, 3)}`;
  const c = await openClient(browser, renderer, preset, name);
  const stop = { v: false };
  let keep: Promise<void> = Promise.resolve();
  try {
    await gm(c.page, 'level 15');
    if (enter) await enter(c.page);
    const arrived = await goTo(c.page, sc);
    keep = keeper(c.page, sc, stop);
    process.stdout.write(`[crowd] ${sc.name} ${nBots} bot ${c.backend} ${preset} … `);
    const p = await measure(c.page, sc, nBots, renderer, c.backend, preset, arrived);
    console.log(line(p));
    if (renderer === 'webgpu' && c.backend !== 'WebGPU') console.warn('[crowd] cảnh báo: yêu cầu WebGPU nhưng renderer đã lùi về WebGL2');
    return p;
  } finally {
    stop.v = true;
    await keep.catch(() => undefined);
    errorsOut.push(...c.errors.map((e) => `${sc.name}/${nBots}/${c.backend}/${preset}: ${e}`));
    await c.page.context().close().catch(() => undefined);
  }
}

/** Một cảnh ở thế giới: bot đã chạy sẵn; đo mọi renderer × preset. */
async function runWorldScene(browser: Browser, sc: Scene, nBots: number, errorsOut: string[]): Promise<Point[]> {
  const points: Point[] = [];
  for (const renderer of RENDERERS) for (const preset of PRESETS) points.push(await runOne(browser, sc, nBots, renderer, preset, errorsOut));
  return points;
}

/** Bí cảnh thật: client vào qua cổng trước (tạo room), rồi 4 bot theo vào, đánh đợt quái + boss gọi thêm. */
async function runDungeon(browser: Browser, sc: Scene, errorsOut: string[]): Promise<Point[]> {
  const points: Point[] = [];
  for (const renderer of RENDERERS) {
    for (const preset of PRESETS) {
      const enter = async (page: Page) => {
        await gm(page, `tp ${PORTAL_POS.x} ${PORTAL_POS.z + 4}`);
        await page.evaluate((t) => window.__game!.send(t), C.PORTAL);
        await waitInGame(page, 'dungeon');
        const n = await bots.start(4, `dg${renderer === 'webgpu' ? 'a' : 'b'}${preset.slice(0, 1)}`, sc.bots);
        const h = await waitOnline((x) => x.rooms.some((r) => r.name === 'dungeon' && r.players >= 5), 60_000);
        console.log(`[crowd] dungeon: ${n} bot, ${h?.rooms.find((r) => r.name === 'dungeon')?.players ?? 0} người trong bí cảnh`);
      };
      try {
        points.push(await runOne(browser, sc, 4, renderer, preset, errorsOut, enter));
      } finally {
        await bots.stop();
        await waitOnline((x) => x.online === 0, 30_000);
      }
    }
  }
  return points;
}

// ---------- báo cáo ----------
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

function over(p: Point): string[] {
  const o: string[] = [];
  if (p.drawCalls.max >= BUDGET.drawCalls) o.push('draw');
  if (p.triangles.max > BUDGET.triangles) o.push('tri');
  if (p.textureMB > BUDGET.textureMB) o.push('tex');
  if (p.cpuMs.p95 > BUDGET.cpuP95Ms) o.push('cpu');
  if (p.jsHeapMB !== null && p.jsHeapMB > BUDGET.heapMB) o.push('heap');
  if (p.tickP95Ms > BUDGET.tickP95Ms) o.push('tick');
  return o;
}

function line(p: Point): string {
  const o = over(p);
  return (
    `${p.fps} fps, cpu p50/p95/p99 ${p.cpuMs.p50}/${p.cpuMs.p95}/${p.cpuMs.p99} ms, gpu ${p.gpuMs ? `${p.gpuMs.p50}/${p.gpuMs.p95}` : '-'} ms, ` +
    `draw ${p.drawCalls.max}, tri ${Math.round(p.triangles.max / 1000)}k, tex ${p.textureMB}MB, heap ${p.jsHeapMB}MB, ` +
    `${p.players} người/${p.monsters} quái/${p.particles} hạt, ↓${p.kbpsDown} ↑${p.kbpsUp} KB/s, tick p95 ${p.tickP95Ms} ms, ${p.pipelines} pipeline mới, ${p.longFrames.length} khung > 12 ms` +
    (o.length ? `  VƯỢT ${o.join(',')}` : '') +
    (p.arrived ? '' : '  (CHƯA TỚI ĐIỂM)')
  );
}

function printTable(points: Point[]): void {
  console.log(
    '\n' +
      pad('cảnh', 9) + lpad('bot', 4) + ' ' + pad('backend', 8) + pad('preset', 8) + lpad('fps', 6) + lpad('cpu50', 7) + lpad('p95', 6) + lpad('p99', 6) +
      lpad('gpu50', 7) + lpad('gpu95', 7) + lpad('draw', 6) + lpad('tri', 7) + lpad('texMB', 7) + lpad('heap', 6) + lpad('↓KB/s', 7) + lpad('tick', 6) + '  ngân sách',
  );
  for (const p of points) {
    const o = over(p);
    console.log(
      pad(p.scene, 9) + lpad(p.bots, 4) + ' ' + pad(p.backend, 8) + pad(p.preset, 8) + lpad(p.fps, 6) + lpad(p.cpuMs.p50, 7) + lpad(p.cpuMs.p95, 6) +
        lpad(p.cpuMs.p99, 6) + lpad(p.gpuMs?.p50 ?? '-', 7) + lpad(p.gpuMs?.p95 ?? '-', 7) + lpad(p.drawCalls.max, 6) +
        lpad(Math.round(p.triangles.max / 1000) + 'k', 7) + lpad(p.textureMB, 7) + lpad(p.jsHeapMB ?? '-', 6) + lpad(p.kbpsDown, 7) +
        lpad(p.tickP95Ms, 6) + '  ' + (o.length ? 'VƯỢT ' + o.join(',') : 'đạt') + (p.arrived ? '' : ' (CHƯA TỚI ĐIỂM)'),
    );
  }
}

// ---------- main ----------
async function main(): Promise<void> {
  const started = new Date();
  await dev.start();
  const browser = await launchChrome({ channel: CHANNEL, headed: HEADED, tag: 'crowd' });
  const points: Point[] = [];
  const errors: string[] = [];
  const botLog: string[] = [];
  try {
    for (const name of SCENES) {
      const sc = SCENE_DEFS[name];
      if (!sc) throw new Error(`không có cảnh "${name}" (san, rung, boss, vanhai, dungeon)`);
      if (sc.dungeon) {
        points.push(...(await runDungeon(browser, sc, errors)));
        continue;
      }
      for (const n of BOTS) {
        const got = await bots.start(n, `b${name}`, sc.bots);
        console.log(`[crowd] ${name}: ${got}/${n} bot đã vào`);
        // Chờ bot tới chỗ (đi bộ từ chỗ hồi sinh / lên cấp) trước khi mở client đo.
        await sleep(8000);
        try {
          points.push(...(await runWorldScene(browser, sc, n, errors)));
        } finally {
          botLog.push(...bots.out.filter((l) => /lỗi|error|không vào/i.test(l)).slice(0, 5));
          await bots.stop();
          await waitOnline((h) => h.online === 0, 30_000);
        }
      }
    }
  } finally {
    await bots.stop();
    await browser.close().catch(() => undefined);
    dev.stop();
  }

  printTable(points);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const day = started.toLocaleDateString('sv-SE');
  let out = path.join(OUT_DIR, `crowd-${day}.json`);
  if (fs.existsSync(out)) out = path.join(OUT_DIR, `crowd-${day}_${started.toTimeString().slice(0, 8).replace(/:/g, '')}.json`);
  let gitSha = '';
  try {
    gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* không có git */
  }
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        kind: 'bench:crowd',
        date: started.toISOString(),
        git: gitSha,
        browser: `${CHANNEL} ${browser.version()}${HEADED ? '' : ' headless'}`,
        machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '', cores: os.cpus().length },
        settings: { bots: BOTS, scenes: SCENES, secondsPerPoint: SECONDS, warmup: WARMUP, viewport: `${VW}x${VH}`, dpr: DPR, camera: CAM, maxClients: 128 },
        budget: BUDGET,
        notes: [
          'cpuMs: thời gian CPU của Game.frame() (ghi lệnh GPU, không gồm thời gian GPU chạy); parts: ms mỗi khung theo phần',
          'gpuMs: tổng timestamp query mọi pass (render + compute) chia số khung trong mỗi lần resolve; null nếu không đo được',
          'kbpsDown/Up: byte WebSocket của client đo tới server game',
          'tickP95Ms: lớn nhất của tick p95 room chứa client đo (cửa sổ ~1200 tick gần nhất) trong lúc đo',
          'MAX_CLIENTS=128: mọi bot chung một kênh với client đo (server thật mở kênh mới ở 50 người)',
          'chạy trên Vite dev server: CPU khung hơi cao hơn bản build',
        ],
        errors,
        botLog,
        points,
      },
      null,
      2,
    ) + '\n',
  );
  if (errors.length) {
    console.log(`\nLỗi console (${errors.length}):`);
    for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e);
  }
  console.log(`\nĐã lưu ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
}

main().catch(async (e) => {
  console.error('[crowd] lỗi:', e instanceof Error ? e.message : e);
  await bots.stop().catch(() => undefined);
  dev.stop();
  process.exit(1);
});
