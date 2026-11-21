// Thể tu: găng quyền + giáp nhẹ thủ tục trên nhân vật v3 (đang mặc bộ Địa Long Hộ Giáp), cùng góc máy 720p + 1080p:
// đứng trước/trái/sau/ba phần tư, cận tay, và một đòn quyền. Ra `<out>/thetu-<giới>-<góc>-<720p|1080p>.png`.
// Dùng: pnpm shots thetu --out <thư mục tuyệt đối> [--genders m,f] [--method bat_dong_kim_than]
import fs from 'node:fs';
import path from 'node:path';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

export default {
  name: 'thetu',
  desc: 'Thể tu: găng + giáp nhẹ trên nhân vật v3, đứng 4 góc + cận tay + đòn quyền ở 720p/1080p',
  usage: '--out <dir> [--genders m,f] [--method <công pháp>]',
  async run(r) {
    const method = opt('--method', 'bat_dong_kim_than');
    for (const g of list('--genders', 'm,f')) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `T${g}`,
        viewport: [1280, 720],
        quality: 'high',
        look: { g },
        query: { chr: 'v3' },
        hide: 'hud',
        warnings: /models|chr_v3|clip/,
      });
      await gm(page, 'level 12', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'set set_dia_giap', 1500);
      await gm(page, `method ${method} 5`, 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      await page.evaluate(() => {
        const gm_ = window.__game!;
        gm_.ents.players.get(gm_.sid).model.root.remove(gm_.ents.players.get(gm_.sid).label);
      });
      const facing = await page.evaluate(() => window.__game!.facing as number);
      for (const [size, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
        await page.setViewportSize({ width: w, height: h });
        for (const [nm, yaw, pitch, dist] of [
          ['truoc', 0, 0.02, 2.0],
          ['trai', -1.5708, 0.02, 2.0],
          ['sau', 3.1416, 0.02, 2.0],
          ['ba-phan-tu', 0.7, 0.1, 1.6],
          ['tay', 0.4, 0.3, 0.95],
        ] as const) {
          await cam(page, { yaw: facing + yaw, pitch, dist });
          await sleep(900);
          fs.writeFileSync(path.join(r.out, `thetu-${gname}-${nm}-${size}.png`), await page.screenshot());
        }
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
