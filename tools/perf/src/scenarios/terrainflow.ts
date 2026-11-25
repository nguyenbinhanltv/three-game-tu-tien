// B3 (kế hoạch hiệu năng bản đồ): ngự kiếm thẳng qua bản đồ một tuyến cố định (giữ W), đo khung dài (>33 ms), p95 CPU khung và thời gian
// `Terrain.update` mỗi lần gọi. Chạy cùng kịch bản trước/sau để so; số ghi vào `terrainflow.json`.
//   pnpm shots terrainflow --out <thư mục> [--level van_lam|van_hai|cuu_kieu] [--lv cấp GM] [--trace 1: ghi nguồn khung dài] [--secs 20] [--views 1280x720] [--from 700,2048] [--query k=v]
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';
import { terrainOf } from '@dtl/shared';
import { requireLevel } from '../lib/levelpoints';

export default {
  name: 'terrainflow',
  desc: 'Ngự kiếm thẳng qua bản đồ (giữ W): số khung >33 ms, p95 khung, thời gian Terrain.update (B3 nạp ô địa hình)',
  usage:
    '[--level van_lam|van_hai|cuu_kieu] [--lv cấp GM] [--trace 1: ghi nguồn khung dài] [--secs 20] [--views 1280x720] [--from x,z] [--query k=v]',
  async run(r) {
    const level = opt('--level', 'van_lam');
    const secs = Number(opt('--secs', '20'));
    const [vw, vh] = opt('--views', '1280x720').split('x').map(Number) as [number, number];
    // Level khác Vân Lam: xuất phát ở giữa mép nam vùng chơi, bay thẳng về phía bắc (z giảm) như tuyến Vân Lam.
    const b = level === 'van_lam' ? null : terrainOf(requireLevel(level)).playBounds;
    const [fx, fz] = (opt('--from', '') || (b ? `${(b.x0 + b.x1) / 2},${b.z1 - 40}` : '700,2048')).split(',').map(Number) as [
      number,
      number,
    ];
    const { page } = await r.open({
      name: 'TerrainFlow',
      quality: 'high',
      viewport: [vw, vh],
      query: { cam: 'iso' },
      extra: opt('--query', ''),
      seenIntro: true,
    });
    await gm(page, `level ${opt('--lv', level === 'cuu_kieu' ? '46' : level === 'van_hai' ? '24' : '15')}`);
    await gm(page, 'god on');
    const tLoad = Date.now();
    await enterLevel(page, level);
    const loadMs = Date.now() - tLoad;
    await tp(page, fx, fz);
    await gm(page, 'killall', 1200);
    await sleep(4000); // ô quanh điểm xuất phát nạp xong
    await page.evaluate(() => window.__game!.toggleFly());
    await sleep(3000); // bay lên, camera mở
    // Móc: đo từng khung (rAF) và mỗi lần Terrain.update.
    const wantTrace = opt('--trace', '') !== '';
    await page.evaluate((wt) => {
      (window as unknown as Record<string, unknown>).__tf_wantTrace = wt;
      (globalThis as unknown as { __name?: (f: unknown) => unknown }).__name ??= (f) => f; // tsx (keepNames) chèn __name vào hàm gửi sang trình duyệt
      const g = window.__game as unknown as { terrain: { update: (...a: number[]) => void }; renderPos: { x: number; z: number } };
      const w = window as unknown as Record<string, unknown>;
      const frames: number[] = [];
      const upd: number[] = [];
      const orig = g.terrain.update.bind(g.terrain);
      g.terrain.update = (...a: number[]) => {
        const t = performance.now();
        orig(...a);
        upd.push(performance.now() - t);
      };
      let last = performance.now();
      const loop = () => {
        const n = performance.now();
        frames.push(n - last);
        last = n;
        w.__tf_raf = requestAnimationFrame(loop);
      };
      w.__tf = { frames, upd, p0: { x: g.renderPos.x, z: g.renderPos.z } };
      // --trace: với mỗi khung CPU dài (> 25 ms trong Game.frame) hoặc khung rAF > 33 ms ghi nguồn: hệ nào (budget), pipeline mới biên dịch, geometry/texture mới,
      // heap giảm (nghi GC), long task. Khung rAF dài mà CPU Game.frame ngắn = chờ GPU/trình biên dịch/GC ngoài khung.
      const trace: Record<string, unknown>[] = [];
      w.__tf_trace = trace;
      if (w.__tf_wantTrace) {
        const r = (
          g as unknown as { renderer: { backend?: Record<string, unknown>; info: { memory: { geometries: number; textures: number } } } }
        ).renderer;
        const be = r.backend as { createRenderPipeline?: (...a: unknown[]) => unknown } | undefined;
        const pipes: string[] = [];
        if (be?.createRenderPipeline) {
          const cp = be.createRenderPipeline.bind(be);
          be.createRenderPipeline = (...a: unknown[]) => {
            const ro = a[0] as {
              material?: { name?: string; type?: string };
              object?: { name?: string; type?: string; geometry?: { attributes?: { position?: { count?: number } } } };
            };
            pipes.push(
              `${ro?.material?.name || ro?.material?.type}/${ro?.object?.name || ro?.object?.type} ${ro?.object?.geometry?.attributes?.position?.count ?? 0}v`,
            );
            return cp(...a);
          };
        }
        const gb = (g as unknown as { budget: { end: () => void; cur: Record<string, number> } }).budget;
        const mem = performance as unknown as { memory?: { usedJSHeapSize: number } };
        let lastGeo = r.info.memory.geometries;
        let lastTex = r.info.memory.textures;
        let lastHeap = mem.memory?.usedJSHeapSize ?? 0;
        let lastEnd = performance.now();
        const endOrig = gb.end.bind(gb);
        const t00 = performance.now();
        gb.end = () => {
          const now = performance.now();
          const total = Object.values(gb.cur).reduce((a, b) => a + b, 0);
          const heap = mem.memory?.usedJSHeapSize ?? 0;
          if (total > 25 || now - lastEnd > 33) {
            trace.push({
              t: Math.round(now - t00),
              dtFrame: Math.round(now - lastEnd),
              cpu: Math.round(total * 10) / 10,
              parts: Object.fromEntries(Object.entries(gb.cur).map(([k, v]) => [k, Math.round(v * 10) / 10])),
              pipes: pipes.splice(0).slice(-6),
              dGeo: r.info.memory.geometries - lastGeo,
              dTex: r.info.memory.textures - lastTex,
              heapDropMB: Math.round(Math.max(0, lastHeap - heap) / 1e5) / 10,
              pos: [Math.round(g.renderPos.x), Math.round(g.renderPos.z)],
            });
          } else pipes.length = 0;
          lastGeo = r.info.memory.geometries;
          lastTex = r.info.memory.textures;
          lastHeap = heap;
          lastEnd = now;
          endOrig();
        };
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) trace.push({ longtask: Math.round(e.duration), t: Math.round(e.startTime - t00) });
          }).observe({ entryTypes: ['longtask'] });
        } catch {
          /* longtask không hỗ trợ */
        }
      }
      w.__tf_raf = requestAnimationFrame(loop);
    }, wantTrace);
    await page.keyboard.down('KeyW');
    await sleep(secs * 1000);
    await page.keyboard.up('KeyW');
    const res = await page.evaluate(() => {
      (globalThis as unknown as { __name?: (f: unknown) => unknown }).__name ??= (f) => f;
      const w = window as unknown as Record<string, unknown> & { __game: { renderPos: { x: number; z: number } } };
      cancelAnimationFrame(w.__tf_raf as number);
      const tf = w.__tf as { frames: number[]; upd: number[]; p0: { x: number; z: number } };
      const q = (a: number[], p: number) => {
        const s = [...a].sort((x, y) => x - y);
        return Math.round((s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0) * 100) / 100;
      };
      const f = tf.frames.slice(2);
      return {
        frames: f.length,
        long33: f.filter((x) => x > 33).length,
        long50: f.filter((x) => x > 50).length,
        frameP50: q(f, 0.5),
        frameP95: q(f, 0.95),
        frameP99: q(f, 0.99),
        frameMax: q(f, 1),
        updCalls: tf.upd.length,
        updP95: q(tf.upd, 0.95),
        updMax: q(tf.upd, 1),
        updOver4: tf.upd.filter((x) => x > 4).length,
        trace: (w.__tf_trace as unknown[]).slice(0, 60),
        from: tf.p0,
        to: { x: Math.round(w.__game.renderPos.x), z: Math.round(w.__game.renderPos.z) },
      };
    });
    console.log('[terrainflow]', JSON.stringify(res));
    writeJson(r.out, 'terrainflow.json', { level, secs, view: [vw, vh], loadMs, ...res });
  },
} satisfies Scenario;
