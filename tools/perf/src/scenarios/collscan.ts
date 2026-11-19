// COL-1 / C-0: quét vật thể có hình của một level, so với collider shared (vòng tròn `terrain.colliders` + hình 3D `terrain.collision`),
// báo cáo vật nào thiếu va chạm. Đi lưới qua vùng chơi (cảnh streaming theo vị trí người chơi), mỗi điểm gọi `__game.collScan`.
//   pnpm shots collscan --level van_lam --out <thư mục tuyệt đối> [--step 240] [--limit 400] [--shots 6] [--dry]
// Ra: collscan-<level>.json (đếm + nhóm + danh sách thiếu) và ảnh `<level>-miss<N>.png` (khung va chạm F3 bật) cho các nhóm thiếu nhiều nhất.
import '@dtl/content';
import { type CircleCollider, footprintDist, type Shape, terrainOf } from '@dtl/shared';
import { flag, num, opt } from '../lib/env';
import { cam, enterLevel, gm, tp } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';
import { classify, type Item, summarize } from './collscan.lib';

const LEVEL = opt('--level', 'van_lam');

function grid(level: string, step: number): { x: number; z: number }[] {
  const t = terrainOf(level);
  const b = t.playBounds;
  const pts: { x: number; z: number }[] = [];
  for (let x = b.x0 + step / 2; x < b.x1; x += step)
    for (let z = b.z0 + step / 2; z < b.z1; z += step) {
      const px = Math.min(Math.max(x, t.margin + 2), t.size - t.margin - 2);
      const pz = Math.min(Math.max(z, t.margin + 2), t.size - t.margin - 2);
      if (t.playWall !== Infinity && t.playDist(px, pz) > t.playWall - 20) continue;
      pts.push({ x: px, z: pz });
    }
  return pts;
}

export default {
  name: 'collscan',
  desc: 'Quét vật thể có hình của level, so với collider shared, báo cáo thiếu va chạm (JSON + ảnh)',
  usage: '[--level <id>] [--step 240] [--limit 400] [--shots 6] [--dry]',
  dry() {
    if (!flag('--dry')) return false;
    console.log(`${LEVEL}: ${grid(LEVEL, num('--step', 240)).length} điểm quét`);
    return true;
  },
  async run(r) {
    requireLevel(LEVEL);
    const step = num('--step', 240);
    const pts = grid(LEVEL, step).slice(0, num('--limit', 400));
    const { ctx, page } = await r.open({ name: 'CollScan', viewport: [1280, 720], warnings: true });
    await gm(page, `level ${LEVEL === 'van_lam' ? 15 : Math.max(27, requireLevel(LEVEL).minLevel ?? 0)}`);
    await gm(page, 'god on');
    if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
    if (flag('--tree')) {
      await tp(page, num('--tx', 2048), num('--tz', 2040));
      await new Promise((res) => setTimeout(res, 1500));
      const tree = await page.evaluate(() => window.__game!.collTree(3));
      console.log(tree.join(String.fromCharCode(10)));
    }
    if (flag('--at')) {
      // Ảnh một điểm (kiểm lớp phủ F3): --at x,z [--dist 60] [--pitch 1.1]
      const [ax, az] = opt('--at', '2048,2060').split(',').map(Number) as [number, number];
      await tp(page, ax, az);
      await page.evaluate(() => window.__game!.setDebugColliders(true));
      await cam(page, { yaw: 3.14, pitch: num('--pitch', 1.1), dist: num('--dist', 60) });
      await snap(page, r.out, `${LEVEL}-at.png`, { wait: settleMs() });
      await ctx.close();
      return;
    }
    const seen = new Map<string, Item>();
    for (const p of pts) {
      await tp(page, p.x, p.z);
      await new Promise((res) => setTimeout(res, 900));
      const half = step * 0.75;
      const box = { x0: p.x - half, z0: p.z - half, x1: p.x + half, z1: p.z + half };
      const items = (await page.evaluate((b) => window.__game!.collScan({ box: b }), box)) as Item[];
      for (const it of items) seen.set(`${it.path}|${it.i}|${it.x}|${it.z}|${it.y0}`, it);
    }
    const t = terrainOf(LEVEL);
    const rep = summarize(LEVEL, classify([...seen.values()], t.colliders as CircleCollider[], t.collision.shapes as Shape[], footprintDist, t.groundAt));
    writeJson(r.out, `collscan-${LEVEL}.json`, rep);
    console.log(`[collscan] ${LEVEL}: ${rep.total} vật, cần va chạm ${rep.needs}, đã phủ ${rep.covered}, thiếu ${rep.missing}`);
    for (const g of rep.groups.slice(0, 15)) console.log(`  ${String(g.missing).padStart(5)} / ${String(g.n).padStart(5)}  ${g.group}`);
    await page.evaluate(() => window.__game!.setDebugColliders(true));
    let n = 0;
    for (const g of rep.groups.filter((x) => x.missing > 0).slice(0, num('--shots', 6))) {
      await tp(page, g.sample.x + 8, g.sample.z + 8);
      await cam(page, { yaw: 2.4, pitch: 0.3, dist: 22 });
      await snap(page, r.out, `${LEVEL}-miss${++n}.png`, { wait: settleMs() });
    }
    await ctx.close();
  },
} satisfies Scenario;
