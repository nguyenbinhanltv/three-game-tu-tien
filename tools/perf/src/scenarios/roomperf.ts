// Diễn Võ Trường: ĐO NGÂN SÁCH HIỆU NĂNG của phòng tập theo từng cảnh mẫu + cảnh đông người.
//   pnpm --filter @dtl/perf exec tsx src/roomperf.ts --out <thư mục> [--query style=dahoa] [--seconds 3] [--bots 8] [--only id1,id2] [--quality high]
// Mỗi cảnh của `data/lab/scenes.json` (cảnh có `act` thì đo TRONG LÚC đánh) và một cảnh đông (client + N bot chung phòng, có bầy quái, mình
// đang đánh): draw call, tam giác, thời gian `Game.frame()` ở CPU (trung bình + p95), GPU (timestamp query, `?gputime=1`), bộ nhớ texture
// (ước tính từ kích thước/định dạng/mip, gồm render target, như `bench:client`), heap JS. So với ngân sách: < 300 draw call, ≤ 2 triệu tam giác,
// ≤ 512 MB texture, CPU < 8 ms. Chạy trên Vite dev nên CPU cao hơn bản build; máy đang chạy worker khác thì CPU/GPU lệch, đo lại lúc rảnh.
import { LAB_SCENES } from '@dtl/content';
import type { Page } from 'playwright';
import { Bots } from '../lib/bots';
import { sleep } from '../lib/devserver';
import { num, opt } from '../lib/env';
import { enterLevel, gm, shownLevel, skipCutscene, waitInGame, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';
import fs from 'node:fs';
import path from 'node:path';

const BUDGET = { draw: 300, tris: 2_000_000, texMB: 512, cpuMs: 8 };

interface Sample {
  frames: number;
  fps: number;
  cpuAvg: number;
  cpuP95: number;
  gpuAvg: number | null;
  drawAvg: number;
  drawMax: number;
  trisMax: number;
  texMB: number;
  heapMB: number;
  /** Texture lớn nhất (để tìm điểm nóng). */
  texTop: string[];
  /** CPU trung bình (ms) của từng hệ trong `Game.frame()` + `khac` = phần còn lại (như `iso.ts`). */
  parts: Record<string, number>;
}
interface Row extends Sample {
  id: string;
  kind: 'tĩnh' | 'đang đánh' | 'đông';
  over: string[];
}

/** Chạy trong trang trước mọi script game: bọc `frame()` đo CPU + draw call + tam giác, gộp GPU timestamp, đếm byte texture. */
function initScript(): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const tex = new Map<object, number>();
  const desc = new Map<object, string>();
  const P = {
    rec: false,
    frames: [] as number[][],
    gpu: [] as number[],
    patched: null as unknown,
    parts: [] as Record<string, number>[],
    texBytes: () => {
      let s = 0;
      for (const v of tex.values()) s += v;
      return s;
    },
    texTop: (n: number) =>
      [...tex.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([t, b]) => `${(b / 1048576).toFixed(1)} MB ${desc.get(t)}`),
  };
  (window as any).__roomPerf = P;
  // Byte/điểm ảnh (hằng số three r178), như tools/perf/src/bench.ts.
  const COMPS: Record<number, number> = { 1021: 1, 1022: 4, 1023: 4, 1026: 1, 1027: 1, 1028: 1, 1029: 1, 1030: 2, 1031: 2, 1033: 4 };
  const TYPE_B: Record<number, number> = { 1009: 1, 1010: 1, 1011: 2, 1012: 2, 1013: 4, 1014: 4, 1015: 4, 1016: 2, 1017: 2, 1018: 2, 1020: 4, 35902: 4 };
  const HALF = new Set([33776, 33777, 36196, 37492, 36283, 36284, 35840, 35841]);
  const bytesOf = (t: any, o: any): number => {
    const w0 = Math.max(1, o?.width ?? t.image?.width ?? 1);
    const h0 = Math.max(1, o?.height ?? t.image?.height ?? 1);
    const d0 = Math.max(1, o?.depth ?? 1);
    const levels = Math.max(1, o?.levels ?? 1);
    const bpp = t.isCompressedTexture ? (HALF.has(t.format) ? 0.5 : 1) : (COMPS[t.format] ?? 4) * (TYPE_B[t.type] ?? 1);
    const samples = Math.max(1, t.isRenderTargetTexture ? (o?.sampleCount ?? 1) : 1);
    let total = 0;
    for (let l = 0; l < levels; l++) total += Math.max(1, w0 >> l) * Math.max(1, h0 >> l) * (t.is3DTexture ? Math.max(1, d0 >> l) : d0) * bpp;
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
    g.frame = function roomPerfFrame(this: unknown) {
      const r = g.renderer;
      const be = r?.backend;
      if (be && P.patched !== be) {
        P.patched = be;
        const create = be.createTexture.bind(be);
        const destroy = be.destroyTexture.bind(be);
        be.createTexture = (t: any, o: any) => {
          create(t, o);
          tex.set(t, bytesOf(t, o));
          const src = String(t.image?.src ?? t.source?.data?.src ?? t.userData?.url ?? '').split('/').slice(-2).join('/').slice(0, 70);
          desc.set(
            t,
            `${t.name || t.constructor?.name} ${o?.width}x${o?.height}${(o?.depth ?? 1) > 1 ? 'x' + o.depth : ''} L${o?.levels ?? 1} f${t.format} t${t.type}${t.isCompressedTexture ? ' NÉN' : ''}${t.isRenderTargetTexture ? ' RT' : ''}${t.isDepthTexture ? ' DEPTH' : ''}${src ? ' ' + src : ''}`,
          );
        };
        be.destroyTexture = (t: object) => {
          tex.delete(t);
          desc.delete(t);
          destroy(t);
        };
      }
      // Cùng danh sách hệ với tools/perf/src/iso.ts.
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
      if (P.rec && r) {
        P.frames.push([dt, r.info.render.drawCalls ?? r.info.render.calls, r.info.render.triangles]);
        P.parts.push({ ...cur });
      }
      gpuFrames++;
      if (be?.trackTimestamp && !gpuPending) {
        gpuPending = true;
        const n = gpuFrames;
        gpuFrames = 0;
        Promise.all([r.resolveTimestampsAsync('render'), r.resolveTimestampsAsync('compute')])
          .then(([a, b]: [number | undefined, number | undefined]) => {
            const ms = (a ?? 0) + (b ?? 0);
            if (ms > 0 && P.rec) P.gpu.push(ms / n);
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
      // Engine gán __game rồi gọi start() ngay sau: bọc sau tác vụ hiện tại.
      queueMicrotask(() => hook(g));
    },
  });
}

const measure = (pg: Page, seconds: number): Promise<Sample> =>
  pg.evaluate(async (sec) => {
    const P = (window as any).__roomPerf;
    P.frames = [];
    P.gpu = [];
    P.parts = [];
    P.rec = true;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, sec * 1000));
    P.rec = false;
    const wall = performance.now() - t0;
    const f = P.frames as number[][];
    const cpu = f.map((x) => x[0]!).sort((a, b) => a - b);
    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      frames: f.length,
      fps: Math.round((f.length * 1000) / wall),
      cpuAvg: r2(avg(cpu)),
      cpuP95: r2(cpu[Math.min(cpu.length - 1, Math.floor(cpu.length * 0.95))] ?? 0),
      gpuAvg: P.gpu.length ? r2(avg(P.gpu)) : null,
      drawAvg: Math.round(avg(f.map((x) => x[1]!))),
      drawMax: Math.max(0, ...f.map((x) => x[1]!)),
      trisMax: Math.max(0, ...f.map((x) => x[2]!)),
      texMB: Math.round((P.texBytes() / 1048576) * 10) / 10,
      heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6),
      texTop: P.texTop(6),
      parts: (() => {
        const labels = new Set<string>();
        for (const p of P.parts as Record<string, number>[]) for (const k of Object.keys(p)) labels.add(k);
        const out: Record<string, number> = {};
        let sum = 0;
        for (const k of labels) {
          const v = (P.parts as Record<string, number>[]).reduce((a, p) => a + (p[k] ?? 0), 0) / Math.max(1, P.parts.length);
          out[k] = r2(v);
          sum += v;
        }
        out.khac = r2(Math.max(0, avg(cpu) - sum));
        return out;
      })(),
    };
  }, seconds);

/**
 * Phân rã tam giác của khung hiện tại theo nhóm đối tượng: duyệt cảnh, lấy lưới đang hiện và (cầu bao) nằm trong khung nhìn, đếm tam giác
 * (lưới có chỉ mục: index/3; lưới instancing nhân với số bản). Khóa nhóm = chuỗi tên tổ tiên gần nhất có tên (2 cấp) + loại lưới. Tổng ước lượng so với
 * `renderer.info` để biết phần sai lệch (LOD ẩn bằng cách khác, bóng đổ vẽ thêm một lượt…).
 */
const breakdown = (pg: Page) =>
  pg.evaluate(async () => {
    const g = window.__game as any;
    const cam = g.camera;
    cam.updateMatrixWorld();
    const proj = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
    const e = proj.elements;
    // Mặt phẳng khung nhìn (Gribb-Hartmann).
    const planes: number[][] = [];
    const row = (i: number, sgn: number) => [e[3]! + sgn * e[i]!, e[7]! + sgn * e[i + 4]!, e[11]! + sgn * e[i + 8]!, e[15]! + sgn * e[i + 12]!];
    for (let i = 0; i < 3; i++) {
      planes.push(row(i, 1));
      planes.push(row(i, -1));
    }
    const inView = (o: any): boolean => {
      const geo = o.geometry;
      if (!geo) return false;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const bs = geo.boundingSphere;
      if (!bs) return true;
      if (o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.frustumCulled === false) return true;
      const c = bs.center.clone().applyMatrix4(o.matrixWorld);
      const sc = o.matrixWorld.getMaxScaleOnAxis();
      const rad = bs.radius * sc;
      for (const pl of planes) {
        const n = Math.hypot(pl[0]!, pl[1]!, pl[2]!) || 1;
        if ((pl[0]! * c.x + pl[1]! * c.y + pl[2]! * c.z + pl[3]!) / n < -rad) return false;
      }
      return true;
    };
    const acc = new Map<string, { tris: number; meshes: number }>();
    let total = 0;
    g.scene.traverse((o: any) => {
      if (!o.isMesh || !o.geometry) return;
      for (let p = o; p; p = p.parent) if (p.visible === false) return;
      if (!inView(o)) return;
      const geo = o.geometry;
      const base = (geo.index ? geo.index.count : (geo.attributes.position?.count ?? 0)) / 3;
      const n = o.isInstancedMesh ? (o.count ?? 1) : 1;
      const tris = base * n;
      const names: string[] = [];
      for (let p = o.parent; p && names.length < 2; p = p.parent) if (p.name) names.push(p.name);
      const key = `${names.reverse().join('/') || '(không tên)'} · ${o.isInstancedMesh ? 'inst' : o.isSkinnedMesh ? 'skin' : 'mesh'}${o.name ? ' ' + o.name : ''}`;
      const a = acc.get(key) ?? { tris: 0, meshes: 0 };
      a.tris += tris;
      a.meshes += 1;
      acc.set(key, a);
      total += tris;
    });
    const list = [...acc.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 30).map(([k, v]) => ({ k, tris: Math.round(v.tris), meshes: v.meshes }));
    // Tắt đổ bóng của mọi đèn một lúc: hiệu số tam giác renderer báo = phần của lượt vẽ bóng.
    const frames = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
    await frames();
    const withShadow = g.renderer.info.render.triangles as number;
    const lights: any[] = [];
    g.scene.traverse((o: any) => {
      if (o.isLight && o.castShadow) lights.push(o);
    });
    for (const l of lights) l.castShadow = false;
    await frames();
    const noShadow = g.renderer.info.render.triangles as number;
    for (const l of lights) l.castShadow = true;
    await frames();
    return { total: Math.round(total), info: withShadow, noShadow, lights: lights.length, list };
  });

/** Nhắm quái gần nhất và bấm ô chiêu (0 = đòn thường, bật tự đánh). */
const attack = (pg: Page, slot: number) =>
  pg.evaluate((s) => {
    const g = window.__game!;
    const me = g.info();
    let best = '';
    let bd = 1e9;
    g.view.monsters.forEach((m, id) => {
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (m.st !== 4 && d < bd) {
        bd = d;
        best = id;
      }
    });
    g.targetId = best;
    g.useSkill(s);
  }, slot);

function verdict(s: Sample): string[] {
  const over: string[] = [];
  if (s.drawMax >= BUDGET.draw) over.push(`draw ${s.drawMax}`);
  if (s.trisMax > BUDGET.tris) over.push(`tam giác ${(s.trisMax / 1e6).toFixed(2)}M`);
  if (s.texMB > BUDGET.texMB) over.push(`texture ${s.texMB} MB`);
  if (s.cpuAvg >= BUDGET.cpuMs) over.push(`CPU ${s.cpuAvg} ms`);
  return over;
}

export default {
  name: 'roomperf',
  desc: 'Diễn Võ Trường: đo ngân sách hiệu năng (draw call, tam giác, texture, CPU/GPU ms) ở mọi cảnh mẫu + cảnh đông N bot',
  usage: '[--query style=dahoa] [--seconds 3] [--bots 8] [--only id1,id2] [--quality high] [--maps van_lam,doan_mach]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const seconds = num('--seconds', 3);
    const nBots = num('--bots', 8);
    const quality = opt('--quality', 'high');
    const only = opt('--only', '')
      .split(',')
      .filter(Boolean);
    const { page: pg, ctx } = await r.open({
      name: 'RoomPerf',
      quality,
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1, gputime: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
    });
    // Bộ đo phải có mặt TRƯỚC khi game tạo renderer (đếm đủ texture): cài rồi tải lại trang.
    // tsx (esbuild keepNames) chèn helper `__name` vào hàm đã biên dịch; trang không có helper này nên tạo shim (như bench.ts).
    await ctx.addInitScript({ content: `globalThis.__name ??= (f) => f; (${initScript.toString()})();` });
    await pg.reload({ waitUntil: 'load' });
    await waitInGame(pg);
    await skipCutscene(pg, 20);
    const maps = opt('--maps', '')
      .split(',')
      .filter(Boolean);
    // `--maps`: chỉ đo cảnh bản đồ thật (phiên riêng, không vào phòng tập) ở chỗ đứng đầu tiên của từng level.
    if (!maps.length) {
      await gm(pg, 'dvt');
      await waitLevel(pg, 'dien_vo');
    }
    const backend = await pg.evaluate(() => (window.__game as unknown as { renderer: { backend: { isWebGPUBackend?: boolean } } }).renderer.backend.isWebGPUBackend);
    const rows: Row[] = [];
    const push = (id: string, kind: Row['kind'], s: Sample) => {
      const row: Row = { id, kind, ...s, over: verdict(s) };
      rows.push(row);
      if (opt('--parts', '') === '1') console.log(`[roomperf]    hệ: ${Object.entries(s.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
      console.log(
        `[roomperf] ${id.padEnd(26)} ${kind.padEnd(9)} draw ${String(s.drawMax).padStart(3)}  tri ${(s.trisMax / 1000).toFixed(0).padStart(5)}k  CPU ${s.cpuAvg.toFixed(2)}/${s.cpuP95.toFixed(2)} ms  GPU ${s.gpuAvg ?? '—'} ms  tex ${s.texMB} MB  ${s.fps} fps${row.over.length ? '  VƯỢT: ' + row.over.join(', ') : ''}`,
      );
    };
    for (const sc of maps.length ? [] : LAB_SCENES) {
      if (only.length && !only.includes(sc.id)) continue;
      await gm(pg, 'scene ' + sc.id, 3500);
      if (sc.act) {
        await attack(pg, sc.act.slot);
        await sleep(Math.min(600, sc.act.waitMs));
        // Giữ nhịp đánh suốt cửa sổ đo: bấm lại chiêu mỗi 900 ms (chiêu đang hồi thì game bỏ qua).
        const again = setInterval(() => void attack(pg, sc.act!.slot).catch(() => undefined), 900);
        try {
          push(sc.id, 'đang đánh', await measure(pg, seconds));
        } finally {
          clearInterval(again);
        }
      } else push(sc.id, 'tĩnh', await measure(pg, seconds));
    }
    // ---- cảnh đông: client + N bot chung một phòng, bầy quái không chết, mình đang đánh ----
    for (const lv of maps) {
      if ((await shownLevel(pg)) !== lv) await enterLevel(pg, lv);
      await gm(pg, 'god on', 900);
      await sleep(2500);
      push('map_' + lv, 'tĩnh', await measure(pg, seconds));
      if (opt('--break', '') === '1') {
        const b = await breakdown(pg);
        console.log(`[roomperf] phân rã tam giác ${lv}: ước lượng một lượt ${b.total} · renderer ${b.info} · tắt bóng (${b.lights} đèn) ${b.noShadow}`);
        for (const x of b.list.slice(0, 20)) console.log(`[roomperf]    ${String(x.tris).padStart(8)}  ${String(x.meshes).padStart(4)} lưới  ${x.k}`);
        writeJson(r.out, `break-${lv}.json`, b);
      }
    }
    if (nBots > 0 && !maps.length && (!only.length || only.includes('crowd'))) {
      const key = 'perf' + nBots;
      await gm(pg, 'dvt');
      await waitLevel(pg, 'van_lam');
      await gm(pg, 'dvt ' + key);
      await waitLevel(pg, 'dien_vo');
      const bots = new Bots(r.port);
      try {
        const joined = await bots.start(nBots, 'pf' + nBots + 'b', ['--gm', 'dvt ' + key, '--crowd', '1300,985,7']);
        const players = () => pg.evaluate(() => (window.__game as unknown as { room: { state: { players: { size: number } } } }).room.state.players.size);
        const until = Date.now() + 60_000;
        while (Date.now() < until && (await players()) < nBots + 1) await sleep(500);
        await sleep(3000);
        console.log(`[roomperf] cảnh đông: ${joined} bot vào game, client thấy ${await players()} người`);
        push(`crowd_${nBots}_dung`, 'đông', await measure(pg, seconds));
        await gm(pg, 'build lac_kiem_quyet 30', 1500);
        await gm(pg, 'spawn mon_soi_xam 8', 1800);
        await gm(pg, 'lockhp', 900);
        await gm(pg, 'god', 900);
        await attack(pg, 0);
        await sleep(1500);
        const again = setInterval(() => void attack(pg, 1 + Math.floor(Math.random() * 4)).catch(() => undefined), 700);
        try {
          push(`crowd_${nBots}_danh`, 'đông', await measure(pg, Math.max(5, seconds)));
        } finally {
          clearInterval(again);
        }
        await snap(pg, r.out, 'crowd.png', { wait: 100 });
      } finally {
        await bots.stop();
      }
    }
    const md = [
      `| Cảnh | Loại | Draw call (lớn nhất) | Tam giác | CPU ms (tb / p95) | GPU ms | Texture MB | fps | Ngân sách |`,
      `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
      ...rows.map(
        (x) =>
          `| \`${x.id}\` | ${x.kind} | ${x.drawMax} | ${(x.trisMax / 1000).toFixed(0)} nghìn | ${x.cpuAvg.toFixed(2)} / ${x.cpuP95.toFixed(2)} | ${x.gpuAvg ?? '—'} | ${x.texMB} | ${x.fps} | ${x.over.length ? 'VƯỢT: ' + x.over.join(', ') : 'đạt'} |`,
      ),
    ].join('\n');
    fs.writeFileSync(path.join(r.out, 'roomperf.md'), md + '\n');
    writeJson(r.out, 'roomperf.json', { backend: backend ? 'webgpu' : 'webgl2', quality, seconds, budget: BUDGET, rows });
    // Danh sách texture đang sống cuối phiên, lớn trước (để khảo sát bộ nhớ texture): `textures.json`.
    const texAll = await pg.evaluate(() => {
      const P = (window as unknown as { __roomPerf: { texTop(n: number): string[]; texBytes(): number } }).__roomPerf;
      return { totalMB: Math.round((P.texBytes() / 1048576) * 10) / 10, list: P.texTop(400) };
    });
    writeJson(r.out, 'textures.json', texAll);
    const bad = rows.filter((x) => x.over.length);
    console.log(`[roomperf] ${rows.length} cảnh, ${bad.length} cảnh vượt ngân sách; backend ${backend ? 'WebGPU' : 'WebGL2'}, preset ${quality}`);
    console.log('[roomperf] texture lớn nhất: ' + (rows[rows.length - 1]?.texTop ?? []).join(' | '));
  },
} satisfies Scenario;
