// Chân Cảnh U6: gợi ý tương tác (E) đứng cạnh NPC không đè thanh chiêu / khối sinh lực, ở 1080p + 720p.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'uxhint',
  desc: 'Gợi ý tương tác cạnh NPC ở 1080p + 720p (kiểm không đè thanh chiêu)',
  usage: '[--sizes 1080p,720p]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const { ctx, page } = await r.open({
      name: 'UxHint',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    await gm(page, 'method lac_kiem_quyet');
    await tp(page, 2048, 2040);
    await sleep(2000);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await snap(page, r.out, `hint-${tag}.jpg`, { wait: 800 });
    }
    await ctx.close();
  },
} satisfies Scenario;
