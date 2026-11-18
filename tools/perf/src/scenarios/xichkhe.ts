// Ảnh/video duyệt mỹ thuật phó bản Xích Tẫn Khích (DV-3K): vào bằng cổng thật (vé một lần) bằng tài khoản thử bất tử, chụp 6 điểm cố định
// (lối vào, toàn cảnh, bia giữ, khe mạch/vị trí boss, vách hẻm, nhìn dọc hẻm) rồi tùy chọn quay một lượt đi dọc hẻm. Mỗi điểm dọn quái trước (`killall`).
// Số đo khung hình (`--perf`) ghi vào perf.json cùng thư mục. Dùng chung cho bản trước và sau để so ảnh (`?xichart=0` chỉ tắt vết nứt + đèn nhấn).
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from '@dtl/content';
import { flag, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, hideUi, perfSample, skipCutscene, tp, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

import { at } from '@dtl/shared';
const ID = 'xich_tan_khich';

export default {
  name: 'xichkhe',
  desc: 'Xích Tẫn Khích: 6 điểm ảnh cố định + video đi một lượt (duyệt mỹ thuật phó bản)',
  usage: '--out <thư mục tuyệt đối> [--video 1] [--perf 1] [--renderer webgpu|webgl2] [--preset low|medium|high] [--query a=b]',
  async run(r) {
    const dg = at(LEVELS, ID).dungeon!;
    const home = at(LEVELS, dg.returnLevel);
    const portal = home.portals!.find((p) => p.to === ID)!;
    const c = dg.center;
    const dir = path.join(r.out, 'video');
    const video = flag('--video');
    if (video) fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({
      name: 'Xich',
      renderer: opt('--renderer', 'webgpu'),
      quality: opt('--preset', 'medium'),
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
    await waitLevel(page, ID);
    await skipCutscene(page, 10);
    await gm(page, 'god on', 1000);
    if (!flag('--hud')) await hideUi(page, 'hud');

    // Hiệu chỉnh hướng nhìn: hướng đi thế giới ứng với yaw 0 và chiều quay của yaw (như `fly`).
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
    await gm(page, `tp ${c.x} ${c.z + 20}`, 1200);
    const t0 = await heading(0);
    const t1 = await heading(0.5);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const k = wrap(t1 - t0) >= 0 ? 1 : -1;
    const yawTo = (dx: number, dz: number) => k * wrap(Math.atan2(dz, dx) - t0);

    const pts: { name: string; x: number; z: number; look: [number, number]; pitch: number; dist: number }[] = [
      { name: '01-vao', x: dg.spawn.x, z: dg.spawn.z + 4, look: [0, -1], pitch: 0.2, dist: 12 },
      { name: '02-toan-canh', x: c.x, z: c.z + 34, look: [0, -1], pitch: 0.78, dist: 72 },
      { name: '03-bia-giu', x: c.x, z: c.z + 12, look: [0, -1], pitch: 0.3, dist: 16 },
      { name: '04-khe-mach', x: c.x - 26, z: c.z + 24, look: [0.55, -0.83], pitch: 0.14, dist: 18 },
      { name: '05-vach-hem', x: c.x - 4, z: c.z + 6, look: [1, -0.1], pitch: 0.06, dist: 9 },
      { name: '06-doc-hem', x: c.x, z: c.z + 62, look: [0, -1], pitch: 0.09, dist: 8 },
    ];
    const perf: Record<string, unknown> = {};
    const clear = async () => {
      await gm(page, 'killall', 900);
    };
    for (const p of pts) {
      await clear();
      await gm(page, `tp ${Math.round(p.x)} ${Math.round(p.z)}`, 1100);
      await cam(page, { yaw: yawTo(p.look[0], p.look[1]), pitch: p.pitch, dist: p.dist });
      await snap(page, r.out, `${p.name}.png`, { wait: 1300 });
      if (flag('--perf')) perf[p.name] = await perfSample(page);
    }
    if (flag('--perf')) writeJson(r.out, 'perf.json', perf);

    if (video) {
      // Một lượt đi: từ lối vào đi thẳng lên bắc dọc hẻm, qua bia giữ, tới tận cuối hẻm; camera sau lưng thấp rồi nâng dần.
      await clear();
      await gm(page, `tp ${dg.spawn.x} ${dg.spawn.z + 8}`, 1300);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.2, dist: 11 });
      await sleep(600);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 24; i++) {
        await cam(page, { yaw: yawTo(Math.sin(i * 0.35) * 0.5, -1), pitch: 0.16 + 0.1 * Math.sin(i * 0.26), dist: 10 + (i % 12) * 0.5 });
        await sleep(500);
      }
      await page.keyboard.up('KeyW');
      await sleep(600);
    }
    const v = page.video();
    await ctx.close();
    if (v && video) fs.renameSync(await v.path(), path.join(dir, `${opt('--name', 'xich-tan-khich')}.webm`));
  },
} satisfies Scenario;
