// Chân Cảnh U5: bảng tổng kết trận. Vào phó bản bằng cổng thật, dọn từng đợt bằng `killall` (qua damageMonster nên số liệu do server cộng thật)
// cho tới khi server gửi bảng tổng kết, rồi chụp ở 1080p + 720p.
import { LEVELS } from '@dtl/content';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, clearMonsters, enterLevel, gm, monsters, tp, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'recap',
  desc: 'Bảng tổng kết trận sau khi hoàn thành bí cảnh (số liệu server tổng hợp) ở 1080p + 720p',
  usage: '[--level phuc_mach] [--sizes 1080p,720p]',
  async run(r) {
    const id = opt('--level', 'phuc_mach');
    const sizes = list('--sizes', '1080p,720p');
    const dg = LEVELS[id]?.dungeon;
    const portal = dg && LEVELS[dg.returnLevel]?.portals?.find((p) => p.to === id);
    if (!dg || !portal) throw new Error(`level ${id} không phải phó bản có cổng`);
    const { page } = await r.open({ name: 'Rc', query: { quiet: 1 } });
    await gm(page, `level ${dg.minLevel + 2}`);
    await gm(page, 'god on');
    await enterLevel(page, dg.returnLevel);
    await tp(page, portal.x, portal.z);
    await page.keyboard.press('KeyE');
    await waitLevel(page, id);
    await gm(page, 'god on', 1000);
    await cam(page, { pitch: 0.55, dist: 24, yaw: 0 });
    let got = false;
    for (let i = 0; i < 90 && !got; i++) {
      const left = await monsters(page);
      if (left.length) {
        // Đứng sát quái để chúng giao chiến (quái mất mục tiêu sẽ miễn sát thương), hạ máu qua các ngưỡng pha rồi dọn.
        await gm(page, `tp ${Math.round(left[0]!.x)} ${Math.round(left[0]!.z + 6)}`, 900);
        for (const cmd of ['hurt 65', 'hurt 30', 'hurt 1']) await gm(page, cmd, 700);
        await clearMonsters(page, 3);
      } else await sleep(1500);
      got = (await page.locator('[data-testid="recap"]').count()) > 0;
      if (i % 5 === 0) console.log(`[recap] ${i}: ${left.length} quái`);
    }
    if (!got) throw new Error('không nhận được bảng tổng kết sau khi dọn phó bản');
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await snap(page, r.out, `recap-${tag}.jpg`, { wait: 800 });
    }
  },
} satisfies Scenario;
