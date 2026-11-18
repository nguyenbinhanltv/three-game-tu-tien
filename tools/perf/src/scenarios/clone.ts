// Phân thân thần niệm (E4-K): quay webm + ảnh ba công pháp ở Hóa Thần sơ kỳ: tạo phân thân (G), ra chiêu theo chủ, khiêu khích/hồi, tan.
// Tài khoản thử, gọi quái thử ngay trước mặt bằng `/gm spawn`. Ảnh kèm HUD (chip phím G, ô chiêu 10).
import fs from 'node:fs';
import path from 'node:path';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const METHODS: Record<string, { id: string; name: string }> = {
  kiem: { id: 'lac_kiem_quyet', name: 'kiem-tu' },
  hophap: { id: 'bat_dong_kim_than', name: 'ho-phap' },
  dansu: { id: 'thanh_moc_dan_kinh', name: 'dan-su' },
};

export default {
  name: 'clone',
  desc: 'Phân thân thần niệm (Hóa Thần): webm + ảnh tạo, ra chiêu, khiêu khích/hồi, tan; ba công pháp; ô chiêu 10 và lĩnh vực',
  usage: '[--methods kiem,hophap,dansu] [--genders m,f]',
  async run(r) {
    for (const g of opt('--genders', 'm').split(',')) {
      for (const key of opt('--methods', 'kiem,hophap,dansu').split(',')) {
        const m = METHODS[key];
        const dir = path.join(r.out, `${m.name}-${g === 'f' ? 'nu' : 'nam'}`);
        fs.mkdirSync(dir, { recursive: true });
        const { page, ctx } = await r.open({
          name: 'Cl' + key + g,
          quality: 'high',
          look: { g },
          video: dir,
          seenIntro: true,
          query: { at: 'tong_mon' },
        });
        await gm(page, 'level 28', 1000);
        await gm(page, `method ${m.id} 5`, 1000);
        await gm(page, 'skills max', 1000);
        await gm(page, 'god on', 900);
        await gm(page, 'heal', 900);
        await gm(page, 'cd', 900);
        await cam(page, { pitch: 0.3, dist: 11, yaw: Math.PI });
        await snap(page, dir, '00-hud-o-chieu-10-linh-vuc.jpg', { wait: 1200 });
        await gm(page, 'spawn mon_soi_xam 4', 1200);
        await snap(page, dir, '01-quai-truoc-mat.jpg', { wait: 600 });
        // Chủ ra chiêu để phân thân có chiêu mà lặp, rồi hóa phân thân.
        await page.keyboard.press('Digit1');
        await sleep(700);
        await page.keyboard.press('Digit7');
        await sleep(900);
        await page.keyboard.press('KeyG');
        await snap(page, dir, '02-phan-than-xuat-hien.jpg', { wait: 500 });
        await snap(page, dir, '03-phan-than-sau-1s.jpg', { wait: 800 });
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press('Digit1');
          await sleep(1000);
          if (i === 1 || i === 3) await snap(page, dir, `04-ra-chieu-${i}.jpg`);
        }
        await snap(page, dir, '05-giua-chung.jpg', { wait: 3000 });
        await cam(page, { pitch: 0.45, dist: 16, yaw: Math.PI * 0.8 });
        await snap(page, dir, '06-goc-rong.jpg', { wait: 3000 });
        await snap(page, dir, '07-sap-tan.jpg', { wait: 5000 });
        await snap(page, dir, '08-da-tan.jpg', { wait: 3500 });
        await gm(page, 'spawn clear', 800);
        const video = page.video();
        await ctx.close();
        if (video) fs.renameSync(await video.path(), path.join(dir, `phan-than-${m.name}-${g === 'f' ? 'nu' : 'nam'}.webm`));
      }
    }
  },
} satisfies Scenario;
