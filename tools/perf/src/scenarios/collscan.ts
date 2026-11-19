// COL-1 / C-0: quét vật thể có hình của một level, so với collider shared (vòng tròn `terrain.colliders` + hình 3D `terrain.collision`),
// báo cáo vật nào thiếu va chạm. Đi lưới qua vùng chơi (cảnh streaming theo vị trí người chơi), mỗi điểm gọi `__game.collScan`.
//   pnpm shots collscan --level van_lam --out <thư mục tuyệt đối> [--step 240] [--limit 400] [--shots 6] [--dry]
// Ra: collscan-<level>.json (đếm + nhóm + danh sách thiếu) và ảnh `<level>-miss<N>.png` (khung va chạm F3 bật) cho các nhóm thiếu nhiều nhất.
import fs from 'node:fs';
import path from 'node:path';
import '@dtl/content';
import { LEVELS } from '@dtl/content';
import { type CircleCollider, collisionOf, footprintDist, type Shape, terrainOf } from '@dtl/shared';
import { flag, num, opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, skipCutscene, tp, waitLevel } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { settleMs, sheet, snap, writeJson } from '../lib/shot';
import { classify, type Item, summarize } from './collscan.lib';

const LEVEL = opt('--level', 'van_lam');

function grid(level: string, step: number): { x: number; z: number }[] {
  const t = terrainOf(level);
  const dg = LEVELS[level]?.dungeon;
  if (dg) {
    // Bí cảnh: lưới quanh tâm, trong vách hang (`bound`, mặc định 120 m).
    const half = (dg.bound ?? 120) * 0.9;
    const out: { x: number; z: number }[] = [{ x: dg.spawn.x, z: dg.spawn.z }];
    for (let x = dg.center.x - half; x <= dg.center.x + half; x += step)
      for (let z = dg.center.z - half; z <= dg.center.z + half; z += step)
        if (Math.hypot(x - dg.center.x, z - dg.center.z) <= half) out.push({ x, z });
    return out;
  }
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
    const dg0 = LEVELS[LEVEL]?.dungeon;
    const pts = grid(LEVEL, step).slice(0, num('--limit', 400));
    const walking = flag('--walk');
    const videoDir = path.join(r.out, 'video');
    const video = walking && flag('--video');
    if (video) fs.mkdirSync(videoDir, { recursive: true });
    const { ctx, page } = await r.open({
      name: 'CollScan',
      viewport: size('1280x720'),
      warnings: true,
      video: video ? videoDir : undefined,
    });
    await gm(page, `level ${LEVEL === 'van_lam' ? 15 : Math.max(dg0 ? (dg0.minLevel ?? 0) + 2 : 27, requireLevel(LEVEL).minLevel ?? 0)}`);
    await gm(page, 'god on');
    const dg = LEVELS[LEVEL]?.dungeon;
    if (dg) {
      // Bí cảnh: vào bằng cổng thật ở level cha (vé một lần).
      const portal = LEVELS[dg.returnLevel]?.portals?.find((p) => p.to === LEVEL);
      if (!portal) throw new Error(`level ${LEVEL} không có cổng vào`);
      if (dg.returnLevel !== 'van_lam') await enterLevel(page, dg.returnLevel);
      await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
      await sleep(1500);
      await tp(page, portal.x, portal.z);
      await sleep(1500);
      await page.keyboard.press('KeyE');
      await waitLevel(page, LEVEL);
      await skipCutscene(page, 10);
      await gm(page, 'god on', 1000);
    } else if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
    if (flag('--tree')) {
      await tp(page, num('--tx', 2048), num('--tz', 2040));
      await new Promise((res) => setTimeout(res, 1500));
      const tree = await page.evaluate(() => window.__game!.collTree(3));
      console.log(tree.join(String.fromCharCode(10)));
    }
    if (walking) {
      // Video đi thử có lớp F3: --walk x,z,giây[,yaw] [--name tên] [--fly 1] [--dist 9] [--pitch 0.35]. W tiến theo hướng camera (yaw 0 = về -z).
      const [wx, wz, secs, yaw] = opt('--walk', '2048,2062,8,0').split(',').map(Number) as [number, number, number, number | undefined];
      await tp(page, wx, wz);
      await page.evaluate(() => window.__game!.setDebugColliders(true));
      await cam(page, { yaw: yaw ?? 0, pitch: num('--pitch', 0.35), dist: num('--dist', 9) });
      if (flag('--fly')) await page.evaluate(() => window.__game!.toggleFly());
      await sleep(1200);
      await page.keyboard.down('KeyW');
      if (flag('--up')) await page.keyboard.down('Space');
      // Contact sheet 3x3: 9 khung đều nhau trong lúc giữ W, chú thích toạ độ + cao độ (đọc được leo bậc, chặn tường/cây mà không cần xem video).
      const frames: { img: Buffer; caption: string }[] = [];
      let maxY = -Infinity;
      const total = secs * 1000;
      for (let k = 0; k < 9; k++) {
        await sleep(total / 9);
        const at = await page.evaluate(() => ({
          x: window.__game!.renderPos.x,
          y: window.__game!.renderPos.y,
          z: window.__game!.renderPos.z,
        }));
        maxY = Math.max(maxY, at.y);
        frames.push({
          img: await page.screenshot(),
          caption: `${((k + 1) * secs) / 9 > 0 ? (((k + 1) * secs) / 9).toFixed(1) : '0'} s · x ${at.x.toFixed(1)} z ${at.z.toFixed(1)} · cao ${at.y.toFixed(2)}`,
        });
      }
      console.log(`[walk] cao nhất ${maxY.toFixed(2)}`);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('Space');
      await sleep(500);
      const end = await page.evaluate(() => ({
        x: window.__game!.renderPos.x,
        y: window.__game!.renderPos.y,
        z: window.__game!.renderPos.z,
      }));
      console.log(`[walk] ${opt('--name', 'walk')}: (${wx}, ${wz}) → (${end.x.toFixed(1)}, ${end.y.toFixed(1)}, ${end.z.toFixed(1)})`);
      await sheet(
        ctx,
        path.join(r.out, `${LEVEL}-${opt('--name', 'walk')}-sheet.png`),
        [0, 1, 2].map((row) => ({
          label: row === 0 ? `${LEVEL} · ${opt('--name', 'walk')} · bắt đầu (${wx}, ${wz})` : '',
          cells: frames.slice(row * 3, row * 3 + 3),
        })),
        { cell: 420, ratio: 9 / 16 },
      );
      await ctx.close(); // đóng context (mới ghi xong file video nếu có `--video`)
      const vids = !video ? [] : fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
      const newest = !video
        ? undefined
        : vids.map((f) => ({ f, t: fs.statSync(path.join(videoDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
      if (newest) fs.renameSync(path.join(videoDir, newest.f), path.join(r.out, `${LEVEL}-${opt('--name', 'walk')}.webm`));
      if (video) fs.rmSync(videoDir, { recursive: true, force: true });
      return;
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
    const rep = summarize(
      LEVEL,
      classify([...seen.values()], t.colliders as CircleCollider[], collisionOf(LEVEL).shapes as Shape[], footprintDist, t.groundAt),
    );
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
