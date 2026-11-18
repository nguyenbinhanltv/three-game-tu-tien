// Thiên Nhân Kiếp (E4-D/L): quay webm + dãy khung ba pha cho nam và nữ. Tài khoản thử bất tử (để xem hết 80 s), `/gm trib hoa_than` vào room
// `tribulation`; người chơi giả lập "bot giỏi": đứng vào trận môn khắc chế theo dòng HUD, đặt thế thân ở trận môn thứ hai rồi lùi ra giữa sân.
import fs from 'node:fs';
import path from 'node:path';
import { ELEMENTS, tribDef, tribSealPos } from '@dtl/shared';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

import { at } from '@dtl/shared';
const NAMES: Record<string, string> = { Kim: 'kim', Mộc: 'moc', Thủy: 'thuy', Hỏa: 'hoa', Thổ: 'tho' };
const NG = at(tribDef('hoa_than').phases, 0).nguHanh!;

export default {
  name: 'thiennhan',
  desc: 'Thiên Nhân Kiếp (Hóa Thần): webm + dãy khung 3 pha, thẻ chương ascend_hn, nam và nữ',
  usage: '[--genders m,f]',
  async run(r) {
    for (const g of opt('--genders', 'm,f').split(',')) {
      const dir = path.join(r.out, g === 'f' ? 'nu' : 'nam');
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({ name: 'Tn' + g, quality: 'high', look: { g }, video: dir, seenIntro: true });
      await gm(page, 'god on', 900);
      await gm(page, 'trib hoa_than', 500);
      await waitLevel(page, 'do_kiep', 1500);
      await gm(page, 'god on', 900);
      await skipCutscene(page, 10);
      await cam(page, { pitch: 0.55, dist: 30, yaw: 0 });
      const hud = (sel: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
      // Chờ HUD kiếp hiện (tribstart) rồi tính mốc 0.
      for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('.trib'))); i++) await sleep(250);
      const t0 = Date.now();
      const anchor = await page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
      const goto = (p: { x: number; z: number }) => gm(page, `tp ${p.x.toFixed(1)} ${p.z.toFixed(1)}`, 0);
      const seal = (i: number) => tribSealPos(anchor, NG.ring, i);
      const T = () => (Date.now() - t0) / 1000;
      const done = new Set<string>();
      const once = async (k: string, at: number, f: () => Promise<unknown>) => {
        if (!done.has(k) && T() >= at) {
          done.add(k);
          await f();
        }
      };
      let lastShot = -9;
      let n = 0;
      let lastEl = '';
      while (T() < 88) {
        const t = T();
        // Pha 1: đứng vào trận môn khắc chế khi HUD báo (dòng "Tia X giáng: đứng trận môn Y"); lùi ra giữa sân sau khi nổ.
        if (t < 25.5) {
          const txt = await hud('[data-testid=hanh-hint]');
          const m = /Tia (\S+) giáng: đứng trận môn (\S+)/.exec(txt);
          if (m && txt !== lastEl) {
            lastEl = txt;
            await goto(seal(ELEMENTS.indexOf(NAMES[at(m, 2)] as (typeof ELEMENTS)[number])));
            await snap(page, dir, `p1-${String(n++).padStart(2, '0')}-tia-${NAMES[at(m, 1)]}-tran-mon-${NAMES[at(m, 2)]}.jpg`, {
              wait: 1800,
            });
          }
        }
        await once('clone1', 26, async () => {
          await goto(seal(1));
          await sleep(900);
          await page.keyboard.press('KeyG');
          await snap(page, dir, 'p2-00-the-than-tran-mon-hai.jpg', { wait: 700 });
          await goto(anchor);
        });
        await once('pillar', 49.5, () => snap(page, dir, 'p2-01-cot-thien-phat-bao.jpg'));
        await once('link', 52.7, () => snap(page, dir, 'p2-02-mach-noi-the-than-ganh.jpg'));
        await once('clone2', 56.5, async () => {
          await goto(seal(1));
          await sleep(900);
          await page.keyboard.press('KeyG');
          await snap(page, dir, 'p3-00-the-than-moi.jpg', { wait: 600 });
          await goto(anchor);
        });
        await once('final', 61, () => snap(page, dir, 'p3-01-tia-lon-bao.jpg'));
        await once('final2', 64, () => snap(page, dir, 'p3-02-tia-lon-no-the-than-chan.jpg'));
        await once('ascend', 81, () => snap(page, dir, 'p4-00-ascend.jpg'));
        await once('card', 82.8, () => snap(page, dir, 'p4-01-the-chuong-ascend_hn.jpg'));
        await once('card2', 84.5, () => snap(page, dir, 'p4-02-the-chuong.jpg'));
        if (t - lastShot >= 2.5) {
          lastShot = t;
          await snap(page, dir, `khung-${String(Math.round(t)).padStart(2, '0')}s.jpg`);
        }
        await sleep(150);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `thien-nhan-kiep-${g === 'f' ? 'nu' : 'nam'}.webm`));
    }
  },
} satisfies Scenario;
