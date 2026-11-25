// B3 (kế hoạch hiệu năng bản đồ): ngự kiếm thẳng qua bản đồ một tuyến cố định (giữ W), đo khung dài (>33 ms), p95 CPU khung và thời gian
// `Terrain.update` mỗi lần gọi. Chạy cùng kịch bản trước/sau để so; số ghi vào `terrainflow.json`.
//   pnpm shots terrainflow --out <thư mục> [--level van_lam] [--secs 20] [--views 1280x720] [--from 700,2048] [--query k=v]
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

export default {
  name: 'terrainflow',
  desc: 'Ngự kiếm thẳng qua bản đồ (giữ W): số khung >33 ms, p95 khung, thời gian Terrain.update (B3 nạp ô địa hình)',
  usage: '[--level van_lam] [--secs 20] [--views 1280x720] [--from x,z] [--query k=v]',
  async run(r) {
    const level = opt('--level', 'van_lam');
    const secs = Number(opt('--secs', '20'));
    const [vw, vh] = opt('--views', '1280x720').split('x').map(Number) as [number, number];
    const [fx, fz] = opt('--from', '700,2048').split(',').map(Number) as [number, number];
    const { page } = await r.open({
      name: 'TerrainFlow',
      quality: 'high',
      viewport: [vw, vh],
      query: { cam: 'iso' },
      extra: opt('--query', ''),
      seenIntro: true,
    });
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await enterLevel(page, level);
    await tp(page, fx, fz);
    await gm(page, 'killall', 1200);
    await sleep(4000); // ô quanh điểm xuất phát nạp xong
    await page.evaluate(() => window.__game!.toggleFly());
    await sleep(3000); // bay lên, camera mở
    // Móc: đo từng khung (rAF) và mỗi lần Terrain.update.
    await page.evaluate(() => {
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
      w.__tf_raf = requestAnimationFrame(loop);
    });
    await page.keyboard.down('KeyW');
    await sleep(secs * 1000);
    await page.keyboard.up('KeyW');
    const res = await page.evaluate(() => {
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
        from: tf.p0,
        to: { x: Math.round(w.__game.renderPos.x), z: Math.round(w.__game.renderPos.z) },
      };
    });
    console.log('[terrainflow]', JSON.stringify(res));
    writeJson(r.out, 'terrainflow.json', { level, secs, view: [vw, vh], ...res });
  },
} satisfies Scenario;
