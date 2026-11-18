// Quái Dị Vực (DV-2): gọi từng quái chương 5 bằng `/gm spawn` ở sân tông môn (chưa có bản đồ Bắc Hoang), đánh thử bằng chiêu thường
// và chiêu 1–3 ở cấp 28: quay webm + dãy ảnh (quái xuất hiện, vạch báo lao, trúng đòn, chết). Tài khoản thử, bất tử để xem trọn clip.
import fs from 'node:fs';
import path from 'node:path';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'divuc',
  desc: 'Quái Dị Vực chương 5: gọi bằng /gm spawn, đánh thử, quay webm + ảnh (xuất hiện, vạch báo, trúng đòn, chết)',
  usage: '[--mons mon_liet_hoa_ma_nguu,mon_u_anh_cot_loc] [--methods lac_kiem_quyet]',
  async run(r) {
    for (const id of opt('--mons', 'mon_liet_hoa_ma_nguu,mon_u_anh_cot_loc').split(',')) {
      const dir = path.join(r.out, id);
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({ name: 'Dv' + id.slice(4, 10), quality: 'high', look: { g: 'm' }, video: dir, seenIntro: true, query: { at: 'tong_mon' } });
      await gm(page, 'level 28', 1000);
      await gm(page, `method ${opt('--methods', 'lac_kiem_quyet')} 5`, 1000);
      await gm(page, 'skills max', 1000);
      await gm(page, 'god on', 900);
      await gm(page, 'heal', 900);
      await cam(page, { pitch: 0.28, dist: 12, yaw: Math.PI });
      await gm(page, `spawn ${id}`, 1500);
      await snap(page, dir, '01-xuat-hien.jpg', { wait: 1200 });
      await sleep(2500);
      await snap(page, dir, '02-vach-bao.jpg', { wait: 800 });
      await snap(page, dir, '03-lao-toi.jpg', { wait: 900 });
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(`Digit${1 + (i % 3)}`);
        await sleep(1100);
        if (i === 1 || i === 5) await snap(page, dir, `04-danh-${i}.jpg`);
      }
      await gm(page, 'killall', 1500);
      await snap(page, dir, '05-chet-1.jpg', { wait: 300 });
      await snap(page, dir, '06-chet-2.jpg', { wait: 900 });
      await snap(page, dir, '07-xac.jpg', { wait: 1800 });
      await gm(page, 'spawn clear', 800);
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${id}.webm`));
    }
  },
} satisfies Scenario;
