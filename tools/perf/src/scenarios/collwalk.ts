// COL-B: đi thử va chạm của một level (video webm + ảnh có khung va chạm F3): đâm vào vật rắn (thân cây/trụ/tường), đi lên mặt đi được (cầu/bậc),
// ngự kiếm bay sát một vật rắn rồi xuyên qua vùng tán. Số liệu in ra console và ghi `collwalk-<level>.json` để đính vào PR.
//   pnpm shots collwalk --level doan_mach --out <thư mục> [--bump x_maple_trunk] [--walk prop_cau_da_gay] [--size 1920x1080] [--video 1]
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from '@dtl/content';
import { type BoxShape, collisionOf, terrainOf } from '@dtl/shared';
import { flag, opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, skipCutscene, tp } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

const LEVEL = opt('--level', 'doan_mach');

function hubOf(level: string): { x: number; z: number } | undefined {
  const l = LEVELS[level];
  return l?.dungeon?.spawn ?? (l as { spawn?: { x: number; z: number } } | undefined)?.spawn ?? l?.portals?.[0];
}

export default {
  name: 'collwalk',
  desc: 'Đi thử va chạm một level: đâm vật rắn, leo mặt đi được, ngự kiếm sát vật (video + ảnh F3 + JSON)',
  usage: '--level <id> [--bump <tag>] [--walk <tag>] [--size 1920x1080] [--video 1]',
  async run(r) {
    requireLevel(LEVEL);
    const shapes = collisionOf(LEVEL).shapes;
    const bumpTag = opt('--bump', '');
    const walkTag = opt('--walk', '');
    const [w, h] = size('1280x720');
    const dir = path.join(r.out, 'video');
    if (flag('--video')) fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({
      name: 'CollWalk',
      quality: 'medium',
      viewport: [w, h],
      seenIntro: true,
      ...(flag('--video') ? { video: dir } : {}),
    });
    await gm(page, 'level 28');
    await gm(page, 'god on', 900);
    if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
    await skipCutscene(page, 10);
    await gm(page, 'killall', 900);
    await page.evaluate(() => window.__game!.setDebugColliders(true));
    const pos = () =>
      page.evaluate(() => ({ x: window.__game!.renderPos.x, y: window.__game!.renderPos.y, z: window.__game!.renderPos.z }));
    const run = async (ms: number) => {
      await page.keyboard.down('KeyW');
      await sleep(ms);
      await page.keyboard.up('KeyW');
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const t = terrainOf(LEVEL);
    const clearAt = (x: number, z: number) =>
      Math.abs(t.groundAt(x, z) - t.groundAt(x + 1, z)) < 1.5 &&
      !shapes.some((s) => s.k === 'cyl' && Math.hypot(s.x - x, s.z - z) < s.r + 1);
    // Hiệu chỉnh hướng đi theo yaw camera (như kịch bản `fly`).
    const probe = async (yaw: number) => {
      await cam(page, { yaw, pitch: 0.3, dist: 14 });
      await sleep(600);
      const a = await pos();
      await run(700);
      const b = await pos();
      return Math.atan2(b.z - a.z, b.x - a.x);
    };
    const hub = hubOf(LEVEL) ?? { x: t.size / 2, z: t.size / 2 };
    await tp(page, hub.x, hub.z);
    const t0 = await probe(0);
    const t1 = await probe(0.5);
    const k = wrap(t1 - t0) >= 0 ? 1 : -1;
    const camFor = (theta: number): number => k * wrap(theta - t0);
    const out: Record<string, unknown> = { level: LEVEL, beats: [] };
    const beats = out.beats as unknown[];
    const nearest = (pred: (s: (typeof shapes)[number]) => boolean) =>
      shapes.filter(pred).sort((a, b) => Math.hypot(a.x - hub.x, a.z - hub.z) - Math.hypot(b.x - hub.x, b.z - hub.z));

    if (bumpTag) {
      // Vài vật rắn gần trạm: đứng cách 8 m theo hướng thoáng, chạy thẳng vào tâm 3 giây.
      const picks = nearest((s) => s.tag === bumpTag && s.k === 'cyl').slice(2, 5);
      let n = 0;
      for (const s of picks) {
        if (s.k !== 'cyl') continue;
        let ang = 0;
        for (let a = 0; a < 6.28; a += 0.4) {
          if (clearAt(s.x + Math.cos(a) * 8, s.z + Math.sin(a) * 8)) {
            ang = a;
            break;
          }
        }
        const sx = s.x + Math.cos(ang) * 8;
        const sz = s.z + Math.sin(ang) * 8;
        await tp(page, sx, sz);
        const theta = Math.atan2(s.z - sz, s.x - sx);
        await cam(page, { yaw: camFor(theta), pitch: 0.35, dist: 12 });
        await sleep(500);
        let minD = 1e9;
        await page.keyboard.down('KeyW');
        for (let i = 0; i < 24; i++) {
          await sleep(125);
          const p = await pos();
          minD = Math.min(minD, Math.hypot(p.x - s.x, p.z - s.z));
          if (i === 14) await snap(page, r.out, `${LEVEL}-bump${++n}.png`, { wait: 0 });
        }
        await page.keyboard.up('KeyW');
        const blocked = minD >= s.r - 0.05;
        beats.push({ beat: 'bump', tag: s.tag, at: [s.x, s.z], radius: s.r, minDist: +minD.toFixed(2), blocked });
        console.log(`[collwalk] bump ${s.tag} r=${s.r.toFixed(2)} gần nhất ${minD.toFixed(2)} ${blocked ? 'CHẶN' : 'XUYÊN!'}`);
      }
      // Ngự kiếm bay lệch khỏi thân (cách mép 2,5 m) xuyên vùng tán: không bị chặn.
      const s0 = picks[0];
      if (s0 && s0.k === 'cyl') {
        await tp(page, s0.x - 14, s0.z + s0.r + 2.5);
        await cam(page, { yaw: camFor(0), pitch: 0.2, dist: 14 });
        await page.keyboard.press('KeyF');
        await sleep(900);
        const a = await pos();
        await run(3000);
        const b = await pos();
        await snap(page, r.out, `${LEVEL}-fly.png`, { wait: 0 });
        await page.keyboard.press('KeyF');
        beats.push({ beat: 'fly-past-trunk', dx: +(b.x - a.x).toFixed(1) });
        console.log(`[collwalk] ngự kiếm bay sát thân ${(b.x - a.x).toFixed(1)} m theo +x trong 3 s`);
      }
    }
    if (walkTag) {
      const s = nearest((x) => x.tag === walkTag && x.k === 'box' && !!x.walk)[0] as BoxShape | undefined;
      if (s) {
        // Đứng ở mép -z cục bộ của hộp, chạy dọc +z cục bộ.
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const sx = s.x - fx * (s.hz + 3);
        const sz = s.z - fz * (s.hz + 3);
        await tp(page, sx, sz);
        await cam(page, { yaw: camFor(Math.atan2(fz, fx)), pitch: 0.35, dist: 12 });
        await sleep(500);
        const ys: number[] = [];
        await page.keyboard.down('KeyW');
        for (let i = 0; i < 24; i++) {
          await sleep(125);
          ys.push((await pos()).y);
          if (i === 14) await snap(page, r.out, `${LEVEL}-walk.png`, { wait: 0 });
        }
        await page.keyboard.up('KeyW');
        beats.push({ beat: 'walk', tag: s.tag, y: [+ys[0]!.toFixed(2), +Math.max(...ys).toFixed(2)], top: s.y1 });
        console.log(`[collwalk] walk ${s.tag}: y ${ys[0]!.toFixed(2)} → max ${Math.max(...ys).toFixed(2)} (đỉnh hộp ${s.y1})`);
      } else console.log(`[collwalk] không có hộp đi được với tag ${walkTag}`);
    }
    await snap(page, r.out, `${LEVEL}-final.png`, { wait: settleMs() });
    writeJson(r.out, `collwalk-${LEVEL}.json`, out);
    const video = page.video();
    await ctx.close();
    if (video && flag('--video')) fs.renameSync(await video.path(), path.join(dir, `${LEVEL}-collwalk.webm`));
  },
} satisfies Scenario;
