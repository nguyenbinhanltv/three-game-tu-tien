// Cổ Thần (TN-5): bộ giáp + găng nâng cấp (huyết đồng, gai xương) và hóa hình (thân to) trên nhân vật v3, cùng góc máy 720p + 1080p,
// rồi HUD (thanh Cổ huyết + số sao) và bảng Công pháp (thang sao). Ra `<out>/cothan-<giới>-<trạng thái>-<góc>-<720p|1080p>.png`.
// Dùng: pnpm shots cothan --out <thư mục tuyệt đối> [--genders m,f] [--stars 3]
import fs from 'node:fs';
import path from 'node:path';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const METHOD = 'co_than_quyet';

export default {
  name: 'cothan',
  desc: 'Cổ Thần: giáp nâng cấp + hóa hình thân to nhiều góc, HUD Cổ huyết/sao và bảng thang sao ở 720p/1080p',
  usage: '--out <dir> [--genders m,f] [--stars 3]',
  async run(r) {
    const stars = opt('--stars', '3');
    for (const g of list('--genders', 'm,f')) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `C${g}`,
        viewport: [1280, 720],
        quality: 'high',
        look: { g },
        query: { chr: 'v3' },
        warnings: /models|chr_v3|clip/,
      });
      await gm(page, 'level 32', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'set set_dia_giap', 1500);
      await gm(page, `method ${METHOD} 5`, 1200);
      await gm(page, `stars ${stars}`, 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      const facing = await page.evaluate(() => window.__game!.facing as number);
      const shot = async (state: string, nm: string, size: string, yaw: number, pitch: number, dist: number, wait = 900) => {
        await cam(page, { yaw: facing + yaw, pitch, dist });
        await sleep(wait);
        fs.writeFileSync(path.join(r.out, `cothan-${gname}-${state}-${nm}-${size}.png`), await page.screenshot());
      };
      const angles = [
        ['truoc', 0, 0.06, 3.0],
        ['trai', -1.5708, 0.06, 3.0],
        ['sau', 3.1416, 0.06, 3.0],
        ['ba-phan-tu', 0.7, 0.1, 3.0],
        ['vai', -0.9, 0.12, 1.6],
      ] as const;
      for (const [size, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
        await page.setViewportSize({ width: w, height: h });
        for (const [nm, yaw, pitch, dist] of angles) await shot('thuong', nm, size, yaw, pitch, dist);
      }
      // Hóa hình: bấm phím Y (chiêu tư thế `skl_hoa_hinh`) rồi chụp lúc thân đã to hết (windup 0,6 s + to ra ~0,45 s).
      await gm(page, 'cd', 1200);
      for (const [size, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
        await page.setViewportSize({ width: w, height: h });
        await gm(page, 'cd', 1200);
        await page.keyboard.press('y', { delay: 80 }); // chiêu tư thế: phím Y
        await sleep(2200);
        for (const [nm, yaw, pitch, dist] of angles) await shot('hoahinh', nm, size, yaw, pitch, nm === 'vai' ? dist + 1.2 : dist, 500); // cùng góc/khoảng cách với 'thuong' để so tỉ lệ
        await sleep(12_500); // hết tư thế 12 s trước lượt kế
      }
      // HUD + bảng Công pháp.
      await cam(page, { yaw: facing, pitch: 0.08, dist: 4.2 });
      await page.keyboard.press('k');
      await sleep(1500);
      await page.evaluate(() => document.querySelector('[data-testid="star-panel"]')?.scrollIntoView({ block: 'center' }));
      await sleep(600);
      fs.writeFileSync(path.join(r.out, `cothan-${gname}-bang-cong-phap-1080p.png`), await page.screenshot());
      await ctx.close();
      await sleep(30_000); // nghỉ giữa các bộ (tránh nhân vật ma khi reconnect)
    }
  },
} satisfies Scenario;
