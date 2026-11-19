// Ảnh/video duyệt mỹ thuật bí cảnh (DUN-1): vào bằng cổng thật (vé một lần) bằng tài khoản thử bất tử, chụp các điểm nhìn cố định của level
// (lối vào, toàn cảnh, điểm wow, vành vách...) ở 720p + 1080p, một cảnh chiến đấu boss (`--battle 1`: gọi boss cuối bằng GM, chụp lúc nó ra chiêu),
// số đo khung hình (`--perf 1`) và video đi một lượt (`--video 1`). Dùng chung cho bản trước/sau (`--tag truoc|sau` chỉ là nhãn tên ảnh).
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from '@dtl/content';
import { flag, list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import {
  cam,
  clearMonsters,
  enterLevel,
  gm,
  hideUi,
  hazards,
  perfSample,
  resetHazards,
  skipCutscene,
  tp,
  waitHazard,
  waitLevel,
} from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snapSizes, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Vị trí người chơi so với tâm bí cảnh (m). */
  at: [number, number];
  /** Hướng nhìn (dx, dz) trên mặt phẳng thế giới. */
  look: [number, number];
  pitch: number;
  dist: number;
}

/** Điểm nhìn từng level (so với `dungeon.center`); level chưa khai báo dùng bộ chung. */
const VIEWS: Record<string, View[]> = {
  kiem_trung: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 30], look: [0, -1], pitch: 0.78, dist: 80 },
    { name: '03-cu-kiem-bac', at: [0, 16], look: [0, -1], pitch: 0.06, dist: 10 },
    { name: '04-nghia-dia-kiem', at: [-48, 22], look: [-1, -0.3], pitch: 0.08, dist: 9 },
    { name: '05-kiem-tran', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-vanh-cu-kiem', at: [40, 40], look: [0.6, -0.8], pitch: 0.04, dist: 8 },
  ],
};
const FALLBACK: View[] = [
  { name: '01-vao', at: [0, 52], look: [0, -1], pitch: 0.2, dist: 12 },
  { name: '02-toan-canh', at: [0, 30], look: [0, -1], pitch: 0.78, dist: 72 },
  { name: '03-giua', at: [0, 12], look: [0, -1], pitch: 0.3, dist: 16 },
  { name: '04-tay', at: [-26, 24], look: [0.55, -0.83], pitch: 0.14, dist: 18 },
  { name: '05-dong', at: [26, 24], look: [-0.55, -0.83], pitch: 0.14, dist: 18 },
];

export default {
  name: 'dungeonart',
  desc: 'Bí cảnh theo dữ liệu: điểm ảnh cố định 720p+1080p, cảnh chiến đấu boss, video đi một lượt (duyệt mỹ thuật phó bản)',
  usage:
    '--level <id phó bản> --out <thư mục tuyệt đối> [--tag truoc|sau] [--sizes 720p,1080p] [--views a,b] [--battle 1] [--perf 1] [--video 1] [--preset low|medium|high|ultra] [--renderer webgpu|webgl2] [--query a=b]',
  async run(r) {
    const id = opt('--level', 'kiem_trung');
    const dg = LEVELS[id]?.dungeon;
    const home = dg && LEVELS[dg.returnLevel];
    const portal = home?.portals?.find((p) => p.to === id);
    if (!dg || !portal) throw new Error(`level ${id} không phải phó bản có cổng`);
    const c = dg.center;
    const tag = opt('--tag', 'sau');
    const sizes = list('--sizes', '720p,1080p');
    const dir = path.join(r.out, 'video');
    const video = flag('--video');
    if (video) fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({
      name: 'DunArt',
      renderer: opt('--renderer', 'webgpu'),
      quality: opt('--preset', 'high'),
      extra: opt('--query', ''),
      query: { quiet: 1 },
      hide: 'chat',
      seenIntro: true,
      video: video ? dir : undefined,
    });
    await gm(page, `level ${dg.minLevel + 2}`);
    await gm(page, 'god on');
    await enterLevel(page, dg.returnLevel);
    await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
    await tp(page, portal.x, portal.z);
    await page.keyboard.press('KeyE');
    await waitLevel(page, id);
    await skipCutscene(page, 10);
    await gm(page, 'god on', 1000);
    if (!flag('--hud')) await hideUi(page, 'hud');

    // Hiệu chỉnh hướng nhìn: hướng đi thế giới ứng với yaw 0 và chiều quay của yaw (như `xichkhe`).
    const pos = () => page.evaluate(() => ({ x: window.__game!.renderPos.x, z: window.__game!.renderPos.z }));
    const run = async (ms: number) => {
      await page.keyboard.down('KeyW');
      await sleep(ms);
      await page.keyboard.up('KeyW');
    };
    const heading = async (yaw: number) => {
      await cam(page, { yaw, pitch: 0.3, dist: 14 });
      await sleep(500);
      const a = await pos();
      await run(700);
      const b = await pos();
      return Math.atan2(b.z - a.z, b.x - a.x);
    };
    await gm(page, `tp ${c.x} ${c.z + 24}`, 1200);
    const t0 = await heading(0);
    const t1 = await heading(0.5);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const k = wrap(t1 - t0) >= 0 ? 1 : -1;
    const yawTo = (dx: number, dz: number) => k * wrap(Math.atan2(dz, dx) - t0);

    const only = list('--views', '');
    const views = (VIEWS[id] ?? FALLBACK).filter((v) => !only.length || only.includes(v.name) || only.includes(v.name.slice(3)));
    const perf: Record<string, unknown> = {};
    for (const v of views) {
      await gm(page, 'killall', 700);
      await gm(page, `tp ${Math.round(c.x + v.at[0])} ${Math.round(c.z + v.at[1])}`, 1100);
      await cam(page, { yaw: yawTo(v.look[0], v.look[1]), pitch: v.pitch, dist: v.dist });
      await snapSizes(page, r.out, `${tag}-${v.name}`, sizes, 1300);
      if (flag('--perf')) perf[v.name] = await perfSample(page);
    }
    if (flag('--perf')) writeJson(r.out, 'perf.json', perf);

    if (flag('--battle')) {
      // Cảnh chiến đấu boss: gọi boss cuối bằng GM ngay trước mặt, đứng sát đài chiến, chụp lúc nó ra chiêu (vạch báo) rồi lúc nó vào pha máu thấp.
      const last = dg.waves[dg.waves.length - 1]!.mons.find((m) => m.id.startsWith('boss_'))?.id;
      if (!last) throw new Error('đợt cuối không có boss');
      await gm(page, 'killall', 700);
      await gm(page, `tp ${c.x} ${c.z + 16}`, 1100);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.38, dist: 24 });
      await gm(page, `spawn ${last} 1`, 2500);
      await skipCutscene(page, 40);
      await resetHazards(page);
      const got = await waitHazard(page, 25_000);
      await snapSizes(page, r.out, `${tag}-90-boss-chieu`, sizes, 300);
      await gm(page, 'hurt 30', 900);
      await gm(page, 'heal', 600);
      await snapSizes(page, r.out, `${tag}-91-boss-pha-cuoi`, sizes, 1200);
      writeJson(r.out, 'battle.json', { boss: last, telegraph: got, hazards: await hazards(page) });
      await gm(page, 'spawn clear', 900);
      await clearMonsters(page);
    }

    if (video) {
      // Một lượt đi: từ lối vào đi thẳng lên bắc vào đài chiến; camera thấp sau lưng, đảo nhẹ hai bên rồi nâng dần.
      await gm(page, 'killall', 700);
      await gm(page, `tp ${dg.spawn.x} ${dg.spawn.z + 8}`, 1300);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.16, dist: 10 });
      await sleep(600);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 30; i++) {
        await cam(page, { yaw: yawTo(Math.sin(i * 0.3) * 0.5, -1), pitch: 0.1 + 0.08 * Math.sin(i * 0.22), dist: 9 + (i % 12) * 0.5 });
        await sleep(500);
      }
      await page.keyboard.up('KeyW');
      await sleep(600);
    }
    const v = page.video();
    await ctx.close();
    if (v && video) fs.renameSync(await v.path(), path.join(dir, `${opt('--name', id.replace(/_/g, '-'))}-${tag}.webm`));
  },
} satisfies Scenario;
