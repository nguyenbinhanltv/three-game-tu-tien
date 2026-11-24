// Chân Cảnh U13 (bổ sung): ba ca chụp kiểm cuối — gợi ý (E) đứng gần NPC, máu boss khi đã mất máu, chú giải chiêu bậc cao (giữ Shift).
// Dựng trạng thái bằng lệnh GM (tp/hurt/level/branch), không dựa vào đứng tay.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'uichecks',
  desc: 'Gợi ý E gần NPC, máu boss mất máu, tooltip chiêu bậc cao (1080p + 720p)',
  usage: '[--sizes 1080p,720p] [--part hint,boss,tip]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const parts = list('--part', 'hint,boss,tip');
    const shoot = async (page: Parameters<typeof snap>[0], name: string, before?: () => Promise<void>) => {
      for (const tag of sizes) {
        const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
        await page.setViewportSize({ width: w, height: h });
        await sleep(700);
        await before?.();
        await snap(page, r.out, `${name}-${tag}.jpg`, { wait: 500 });
      }
    };
    if (parts.includes('hint')) {
      const { ctx, page } = await r.open({
        name: 'ChkHint',
        viewport: [1920, 1080],
        seenIntro: true,
        query: { realm: 'nk12', at: 'tong_mon', god: 1 },
      });
      await sleep(2500);
      await tp(page, 2048, 2034.5);
      await sleep(2500);
      await shoot(page, 'chk-hint');
      await ctx.close();
    }
    if (parts.includes('boss')) {
      const { ctx, page } = await r.open({
        name: 'ChkBoss',
        viewport: [1920, 1080],
        seenIntro: true,
        query: { realm: 'nk15', at: 'boss', god: 1 },
      });
      await sleep(2500);
      await gm(page, 'tp 1640 2252');
      await sleep(3000);
      await page.keyboard.press('Tab');
      await gm(page, 'hurt 55', 1200);
      await sleep(2500);
      await shoot(page, 'chk-boss-hurt');
      await gm(page, 'hurt 20', 1200);
      await sleep(2000);
      await shoot(page, 'chk-boss-hurt20');
      await ctx.close();
    }
    if (parts.includes('tip')) {
      const { ctx, page } = await r.open({
        name: 'ChkTip',
        viewport: [1920, 1080],
        seenIntro: true,
        query: { realm: 'tc2', at: 'tong_mon', god: 1 },
      });
      await sleep(2500);
      await gm(page, 'method lac_kiem_quyet');
      await gm(page, 'level 16', 800);
      await gm(page, 'branch 16 pha_mach', 800);
      await sleep(1200);
      for (const tag of sizes) {
        const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
        await page.setViewportSize({ width: w, height: h });
        await sleep(700);
        await page.keyboard.down('Shift');
        for (const c of [7, 8]) {
          const cell = page.locator('.u2h-cell').nth(c);
          if (!(await cell.count())) continue;
          await cell.hover();
          await sleep(900);
          await snap(page, r.out, `chk-tip-${c}-${tag}.jpg`, { wait: 200 });
        }
        await page.keyboard.up('Shift');
        await page.mouse.move(8, 8);
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
