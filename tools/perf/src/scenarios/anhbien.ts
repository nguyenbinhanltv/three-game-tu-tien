// Nhật Thực Kiếp (DV-3K, Anh Biến): quay webm + dãy khung ba pha. Tài khoản thử bất tử (xem hết 90 s), `/gm trib anh_bien` vào room
// `tribulation-do_kiep_bac_hoang`; "bot giỏi": mỗi nhịp tia đứng cạnh bia chưa sáng lúc tia bắn rồi lùi ra giữa sân.
import fs from 'node:fs';
import path from 'node:path';
import { tribDef, tribLevelOf, tribSealPos } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const DEF = tribDef('anh_bien');
const DL = DEF.phases[0].danLoi!;
const CTR = LEVELS[tribLevelOf(DEF)].dungeon!.center;

export default {
  name: 'anhbien',
  desc: 'Nhật Thực Kiếp (Anh Biến): webm + dãy khung 3 pha, năm Trấn Giới Bia, Nhật Thực Dực Chủ, khe khép, thẻ chương ascend_ab',
  usage: '[--genders m,f]',
  async run(r) {
    for (const g of opt('--genders', 'm').split(',')) {
      const dir = path.join(r.out, g === 'f' ? 'nu' : 'nam');
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({ name: 'Ab' + g, quality: 'high', look: { g }, video: dir, seenIntro: true });
      await gm(page, 'god on', 900);
      await gm(page, 'trib anh_bien', 500);
      try {
        await waitLevel(page, 'do_kiep_bac_hoang', 1500);
      } catch (e) {
        console.log('[anhbien] không vào được level kiếp. Lỗi trang:\n  ' + [...new Set(r.errors)].slice(0, 12).join('\n  '));
        throw e;
      }
      await gm(page, 'god on', 900);
      await skipCutscene(page, 10);
      await cam(page, { pitch: 0.5, dist: 34, yaw: 0 });
      for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('.trib'))); i++) await sleep(250);
      const t0 = Date.now();
      const T = () => (Date.now() - t0) / 1000;
      const goto = (p: { x: number; z: number }) => gm(page, `tp ${p.x.toFixed(1)} ${p.z.toFixed(1)}`, 0);
      const done = new Set<string>();
      const once = async (k: string, at: number, f: () => Promise<unknown>) => {
        if (!done.has(k) && T() >= at) {
          done.add(k);
          await f();
        }
      };
      let lastShot = -9;
      let k = -1;
      while (T() < 96) {
        const t = T();
        // Pha 1: tia bắn ở giây 2, 5, 8, …; đứng cạnh bia k lúc tia bắn, rồi ra giữa sân.
        if (t >= 2 && t < 25) {
          const kk = Math.floor((t - 2) / 3);
          const ph = (t - 2) % 3;
          if (kk > k && kk <= 4 && ph < 0.6) {
            k = kk;
            await goto(tribSealPos(CTR, DL.ring, kk));
            await snap(page, dir, `p1-${String(kk).padStart(2, '0')}-bia-${kk + 1}.jpg`, { wait: 1500 });
            await goto(CTR);
          }
        }
        await once('boss', 27, () => snap(page, dir, 'p2-00-nhat-thuc-duc-chu.jpg'));
        await once('smash', 36, () => snap(page, dir, 'p2-01-dap-bia-bao.jpg'));
        await once('hold', 58, () => snap(page, dir, 'p2-02-bia-giu.jpg'));
        await once('final', 70, () => snap(page, dir, 'p3-00-tia-cuoi-bao.jpg'));
        await once('final2', 73.5, () => snap(page, dir, 'p3-01-khe-khep.jpg'));
        await once('ascend', 91, () => snap(page, dir, 'p4-00-ascend.jpg'));
        await once('card', 92.8, () => snap(page, dir, 'p4-01-the-chuong-ascend_ab.jpg'));
        if (t - lastShot >= 3) {
          lastShot = t;
          await snap(page, dir, `khung-${String(Math.round(t)).padStart(2, '0')}s.jpg`);
        }
        await sleep(150);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `nhat-thuc-kiep-${g === 'f' ? 'nu' : 'nam'}.webm`));
    }
  },
} satisfies Scenario;
