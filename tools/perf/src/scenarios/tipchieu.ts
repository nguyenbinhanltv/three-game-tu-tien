// Chân Cảnh U4: chú giải chiêu (sát thương ước tính, tầm, hình vùng trên sàn, nhánh) ở 1080p + 720p, rê chuột vào vài ô thanh chiêu.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'tipchieu',
  desc: 'Chú giải chiêu: sát thương, tầm, hình vùng, nhánh (Kiếm tu) ở 1080p + 720p',
  usage: '[--sizes 1080p,720p] [--cells 0,2,5,7] [--method lac_kiem_quyet]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const cells = list('--cells', '0,3,6,7,8').map(Number);
    const method = list('--method', 'lac_kiem_quyet')[0]!;
    const { ctx, page } = await r.open({
      name: 'TipChieu',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'tc2', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    await gm(page, `method ${method}`);
    await gm(page, 'level 16', 800);
    await gm(page, 'branch 16 pha_mach', 800);
    await sleep(1200);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await sleep(600);
      for (const c of cells) {
        const cell = page.locator('.u2h-cell').nth(c);
        if (!(await cell.count())) continue;
        await cell.hover();
        await sleep(700);
        await snap(page, r.out, `tip-${method}-${c}-${tag}.jpg`, { wait: 200 });
        await page.mouse.move(8, 8);
      }
    }
    await ctx.close();
  },
} satisfies Scenario;
