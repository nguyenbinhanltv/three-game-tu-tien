// Chân Cảnh U10: bảng Nhân vật (tranh / 3D xoay được) và Túi đồ ở 1080p + 720p, kể cả hai bảng mở cùng lúc.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

const GEAR = [
  'kit 2 kiem +5 m',
  'gold 50000',
  'give itm_hoi_xuan_dan 12',
  'give itm_linh_thao 30',
  'roll weapon 3 20',
  'roll robe 2 12',
  'roll ring 3 16',
];

export default {
  name: 'charbag',
  desc: 'Bảng Nhân vật (tranh + 3D xoay được) và Túi đồ, riêng và cùng mở, ở 1080p + 720p',
  usage: '[--sizes 1080p,720p]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const { ctx, page } = await r.open({
      name: 'CharBag',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    for (const c of GEAR) await gm(page, c);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await sleep(500);
      await page.keyboard.press('KeyC');
      await sleep(1500);
      await snap(page, r.out, `char-art-${tag}.jpg`, { wait: 400 });
      const v3 = page.getByTestId('char-view-3d');
      if (await v3.count()) {
        await v3.click();
        await sleep(2500);
        const st = page.getByTestId('char-preview');
        const bb = await st.boundingBox();
        if (bb) {
          await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
          await page.mouse.down();
          await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2, { steps: 6 });
          await page.mouse.up();
        }
        await sleep(800);
        await snap(page, r.out, `char-3d-${tag}.jpg`, { wait: 300 });
        await page.keyboard.press('KeyB');
        await sleep(1200);
        await snap(page, r.out, `char-bag-${tag}.jpg`, { wait: 300 });
        await page.getByTestId('char-view-art').click();
        await page.keyboard.press('KeyB');
        await page.keyboard.press('KeyC');
      } else {
        await page.keyboard.press('KeyB');
        await sleep(1200);
        await snap(page, r.out, `char-bag-${tag}.jpg`, { wait: 300 });
        await page.keyboard.press('KeyB');
        await page.keyboard.press('KeyC');
      }
      await sleep(500);
    }
    await ctx.close();
  },
} satisfies Scenario;
