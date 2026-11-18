// Quay video đi dọc một level (duyệt mỹ thuật bản đồ, E4-I): đứng ở điểm đầu mỗi chặng rồi giữ W cho nhân vật chạy tới điểm kế, camera cố định hướng nhìn theo chặng.
// Tài khoản thử bất tử (`god on`). Mỗi chặng lấy hai điểm liên tiếp trong `--route` (tên điểm của `levelPoints`: zone_*, poi_*, boss_*, trencao…).
import fs from 'node:fs';
import path from 'node:path';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, hideUi, skipCutscene } from '../lib/game';
import { levelPoints, requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';

export default {
  name: 'fly',
  desc: 'Video webm chạy dọc một level qua danh sách điểm (duyệt mỹ thuật bản đồ)',
  usage: '--level <id> [--route poi_a,zone_b,...] [--secs 9] [--hud 0|1] [--name <tên file>]',
  async run(r) {
    const level = opt('--level', 'thien_khuyet');
    requireLevel(level);
    const pts = levelPoints(level);
    const names = opt(
      '--route',
      pts
        .filter((p) => /^(zone|poi)_/.test(p.name))
        .map((p) => p.name)
        .join(','),
    ).split(',');
    const route = names.map((n) => pts.find((p) => p.name === n)).filter((p): p is NonNullable<typeof p> => !!p);
    if (route.length < 2) throw new Error('cần ít nhất 2 điểm trong --route');
    const secs = Number(opt('--secs', '9'));
    const dir = path.join(r.out, 'video');
    fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({ name: 'Fly', quality: 'medium', video: dir, seenIntro: true });
    await gm(page, `level 27`);
    await gm(page, 'god on', 900);
    await enterLevel(page, level);
    await skipCutscene(page, 10);
    if (opt('--hud', '0') !== '1') await hideUi(page, 'hud');
    const pos = () => page.evaluate(() => ({ x: window.__game!.renderPos.x, z: window.__game!.renderPos.z }));
    const run = async (ms: number) => {
      await page.keyboard.down('KeyW');
      await sleep(ms);
      await page.keyboard.up('KeyW');
    };
    // Hiệu chỉnh: hướng đi thế giới ứng với yaw 0 và chiều quay của yaw.
    const heading = async (yaw: number) => {
      await cam(page, { yaw, pitch: 0.3, dist: 14 });
      await sleep(600);
      const a = await pos();
      await run(900);
      const b = await pos();
      return Math.atan2(b.z - a.z, b.x - a.x);
    };
    await gm(page, `tp ${Math.round(route[0].x)} ${Math.round(route[0].z)}`, 1500);
    const t0 = await heading(0);
    const t1 = await heading(0.5);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const k = wrap(t1 - t0) >= 0 ? 1 : -1;
    for (let i = 0; i + 1 < route.length; i++) {
      const a = route[i];
      const b = route[i + 1];
      await gm(page, `tp ${Math.round(a.x)} ${Math.round(a.z)}`, 1600);
      const phi = Math.atan2(b.z - a.z, b.x - a.x);
      await cam(page, { yaw: k * wrap(phi - t0), pitch: 0.24, dist: 12 });
      await sleep(500);
      await run(secs * 1000);
    }
    await sleep(500);
    const video = page.video();
    await ctx.close();
    if (video) fs.renameSync(await video.path(), path.join(dir, `${opt('--name', `bay-ngang-${level}`)}.webm`));
  },
} satisfies Scenario;
