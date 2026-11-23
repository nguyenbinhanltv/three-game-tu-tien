// Chân Cảnh U7: bảng tên + thanh máu trên đầu quái/người cho camera chéo (thường, tinh anh, boss, người chơi) ở 1080p + 720p.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'nameplate',
  desc: 'Bảng tên/thanh máu quái thường, tinh anh, boss quanh người chơi (camera chéo) ở 1080p + 720p',
  usage: '[--sizes 1080p,720p]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const { ctx, page } = await r.open({
      name: 'Nameplate',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk15', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    // Chat có giới hạn tần suất: mỗi lệnh cách nhau ≥ 3 s.
    await gm(page, 'spawn elite_huyet_nha_lang', 3200);
    await gm(page, 'spawn mon_soi_xam 2', 3200);
    await gm(page, 'hurt 70', 3200);
    await sleep(2500);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await snap(page, r.out, `nameplate-${tag}.jpg`, { wait: 900 });
    }
    await ctx.close();
  },
} satisfies Scenario;
