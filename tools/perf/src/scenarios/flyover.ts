// Bay ngang một level (DV-1): nhân vật ngự kiếm thật dọc một tuyến, camera quay theo, quay webm + ảnh vài mốc dọc đường.
// Tuyến mặc định của Bắc Hoang: từ Vọng Bắc Trạm lên bắc dọc Giới Khích tới Trấn Giới Đài (tuyến suy từ trận truyền tống của level).
import fs from 'node:fs';
import path from 'node:path';
import { padsOfLevel } from '@dtl/shared';
import { flag, opt, size } from '../lib/env';
import { cam, enterLevel, gm, tp } from '../lib/game';
import { sleep } from '../lib/devserver';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'flyover',
  desc: 'Bay ngang level theo tuyến (webm + ảnh mốc): ngự kiếm thật từ trận đầu tới trận cuối theo trục bắc',
  usage: '[--level bac_hoang] [--secs 50] [--size 1280x720]',
  async run(r) {
    const level = opt('--level', 'bac_hoang');
    requireLevel(level);
    const pads = padsOfLevel(level)
      .slice()
      .sort((a, b) => b.z - a.z);
    const from = pads[0];
    const to = pads[pads.length - 1];
    const secs = Number(opt('--secs', '50'));
    const dir = path.join(r.out, 'video');
    fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({ name: 'Fly', quality: 'high', video: dir, seenIntro: true, viewport: size('1280x720') });
    await gm(page, 'level 28', 1000);
    await gm(page, 'god on', 900);
    await enterLevel(page, level);
    await tp(page, from.x, from.z + 20);
    await cam(page, { yaw: 0, pitch: 0.2, dist: 14 });
    await page.keyboard.press('KeyF'); // ngự kiếm
    await sleep(800);
    await page.keyboard.down('Space'); // bay lên ~ vài chục mét
    await sleep(1800);
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    let shot = 0;
    while ((Date.now() - t0) / 1000 < secs) {
      const t = (Date.now() - t0) / 1000;
      // Hướng bay: bắc (yaw 0), lệch nhẹ để thấy khe từ nhiều góc; chúi nhìn xuống rồi ngẩng.
      const yaw = 0.35 * Math.sin(t / 7);
      await cam(page, { yaw, pitch: 0.22 + 0.12 * Math.sin(t / 5), dist: 16 });
      if (t > (shot + 1) * (secs / 5)) await snap(page, r.out, `fly-${String(++shot).padStart(2, '0')}.jpg`, { wait: 0 });
      await sleep(120);
    }
    await page.keyboard.up('KeyW');
    if (flag('--stats')) console.log(await page.evaluate(() => JSON.stringify(window.__game!.info())));
    const video = page.video();
    await ctx.close();
    if (video) fs.renameSync(await video.path(), path.join(r.out, `bay-ngang-${level}.webm`));
    console.log(`tuyến: ${from.id} → ${to.id}`);
  },
} satisfies Scenario;
