// Thiên Nhân Ngũ Suy (TN-4): chụp từng ải ở 720p + 1080p. Tài khoản thử bất tử vào thẳng từng ải bằng `/gm trib ngu_suy <ải>`;
// kịch bản đóng vai "người chơi giỏi" thao tác đúng (đọc dấu trên sân qua `__game.suyLog` của bản dev) để ải chạy trọn và có đủ các khoảnh khắc:
// đầu ải (điều tức), giữa ải (đang thao tác), cuối ải (suy khí nặng nhất). Bất tử không cứu được thanh suy khí: không thao tác thì ải thất bại.
import fs from 'node:fs';
import path from 'node:path';
import { suySectorYaw, tribDef } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snapSizes } from '../lib/shot';

const DEF = tribDef('ngu_suy');
const SLUG = ['1-linh-luc-suy', '2-nhuc-than-suy', '3-than-thuc-suy', '4-tho-nguyen-suy', '5-dao-tam-suy'];

interface Mark {
  s: string;
  n: number;
  x: number;
  z: number;
  r: number;
  pg: number;
  lv: number;
  at: number;
}

export default {
  name: 'ngusuy',
  desc: 'Thiên Nhân Ngũ Suy: từng ải ở 720p + 1080p (đầu ải, giữa ải, cuối ải), tùy chọn webm',
  usage: '[--stages 1,2,3,4,5] [--sizes 720p,1080p] [--video] [--pitch 0.55] [--dist 26]',
  async run(r) {
    const sizes = list('--sizes', '720p,1080p');
    const video = process.argv.includes('--video');
    for (const sv of list('--stages', '1,2,3,4,5')) {
      const k = Math.max(1, Math.min(DEF.phases.length, Number(sv) || 1));
      const ph = DEF.phases[k - 1]!;
      const dir = path.join(r.out, SLUG[k - 1]!);
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({ name: 'Suy' + k, quality: 'high', seenIntro: true, ...(video ? { video: dir } : {}) });
      await gm(page, 'god on', 900);
      await gm(page, `trib ngu_suy ${k}`, 500);
      await waitLevel(page, 'do_kiep', 1500);
      await gm(page, 'god on', 900);
      await skipCutscene(page, 10);
      await cam(page, { pitch: Number(opt('--pitch', '0.55')), dist: Number(opt('--dist', '26')), yaw: 0 });
      for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('[data-testid=suy-bar]'))); i++) await sleep(250);
      const t0 = Date.now();
      const T = () => (Date.now() - t0) / 1000;
      const len = ph.end - (DEF.phases[k - 2]?.end ?? 0);
      const marks = (): Promise<Mark[]> => page.evaluate(() => Object.values(window.__game!.suyLog ?? {}) as never);
      const text = (sel: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
      const me = () => page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
      const anchor = await me();
      let lastTp = 0;
      let lastKey = '';
      // `/gm tp` đi qua chat nên thưa nhịp ≥ 850 ms (server bỏ tin chat dày hơn 800 ms).
      const goto = async (key: string, p: { x: number; z: number }) => {
        if (key === lastKey || Date.now() - lastTp < 850) return;
        lastKey = key;
        lastTp = Date.now();
        await gm(page, `tp ${p.x.toFixed(1)} ${p.z.toFixed(1)}`, 0);
      };
      const shots: [number, string][] = [
        [1.5, '01-dau-ai'],
        [len * 0.3, '02-giua-ai'],
        [len * 0.55, '03-giua-ai'],
        [len * 0.82, '04-cuoi-ai'],
      ];
      let castAt = 0;
      let xAt = 0;
      while (T() < len - 1.2) {
        const t = T();
        const ms = await marks();
        const now = Date.now();
        if (ph.mechanic === 'suy_linh') {
          const m = ms.find((x) => x.s === 'nhan' && x.pg === 1);
          if (m) await goto(`nhan:${m.at}`, m);
        } else if (ph.mechanic === 'suy_the') {
          const m = ms.find((x) => x.s === 'toi' && x.pg === 1);
          if (m) await goto(`toi:${m.at}`, m);
        } else if (ph.mechanic === 'suy_thuc') {
          const m = ms.find((x) => x.s === 'thuc');
          if (m?.pg === 3 && now >= xAt) {
            xAt = now + 400;
            await page.keyboard.press('KeyX');
          } else if (m?.pg === 1 && m.lv) {
            let i = 0;
            while (i < m.lv && (m.n & (1 << i)) !== 0) i++;
            const a = suySectorYaw(i, m.lv);
            await goto(`thuc:${m.at}`, { x: m.x + Math.sin(a) * 5, z: m.z + Math.cos(a) * 5 });
          }
        } else if (ph.mechanic === 'suy_tho') {
          const m = ms.find((x) => x.s === 'den' && x.pg === 0) ?? ms.find((x) => x.s === 'den' && (x.pg === 2 || x.pg === 3));
          if (m) await goto(`den:${m.n}:${m.pg === 0 ? m.at : 'aim'}`, m);
          else await goto('tam-san', anchor);
        } else if (ph.mechanic === 'suy_tam') {
          // Nhịp phá vọng: ra một đòn đánh thường vào Tâm Ma Ảnh; nhịp tĩnh: không làm gì.
          const strike = (await text('[data-testid=suy-hint]')).includes('Phá vọng');
          if (strike && now >= castAt) {
            castAt = now + 500;
            await page.evaluate(() => {
              const g = window.__game!;
              for (const [id, m] of g.view.monsters) if (m.t === 'mon_tam_ma' && m.st !== 4) g.send('sk', { id: 'skl_phi_kiem', t: id });
            });
          }
        }
        const due = shots[0];
        if (due && t >= due[0]) {
          shots.shift();
          await snapSizes(page, dir, due[1], sizes, 250);
        }
        await sleep(120);
      }
      console.log(`  ải ${k}: thanh cuối "${await text('[data-testid=suy-bar]')}"`);
      // Chờ tin qua ải (hoặc thất bại) rồi chụp khung kết.
      await sleep(2200);
      await snapSizes(page, dir, '05-ket-ai', sizes, 250);
      const v = page.video();
      await ctx.close();
      if (v) fs.renameSync(await v.path(), path.join(dir, `${SLUG[k - 1]}.webm`));
    }
  },
} satisfies Scenario;
