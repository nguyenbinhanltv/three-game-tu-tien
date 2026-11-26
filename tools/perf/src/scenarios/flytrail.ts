// V-P10 đợt 3b: vệt phi kiếm hai tông (lõi mực + thân lam ngọc cộng sáng). Bay ngang ở sân tông môn Lạc Kiếm Tông (nền đá sáng) giữ phím tiến, chụp liên tiếp
// ở 1080p và 720p, ngày hoặc đêm; `--noink` = bản cũ (`?trailink=0`) để so trước/sau. Camera chéo khóa góc mặc định của game.
import { flag, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'flytrail',
  desc: 'Vệt phi kiếm khi ngự kiếm bay ngang sân tông môn (ngày/đêm, 1080p + 720p, trước/sau lớp mực)',
  usage: '--out <thư mục> [--mood night] [--noink] [--frames 4]',
  async run(r) {
    const mood = opt('--mood', '');
    const { ctx, page } = await r.open({
      name: 'FlyTrail',
      viewport: [1920, 1080],
      seenIntro: true,
      look: { g: 'm' },
      query: { realm: 'nk12', god: 1, chr: 'v3', quiet: 1, ...(mood ? { mood } : {}), ...(flag('--noink') ? { trailink: 0 } : {}) },
      hide: 'hud',
    });
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 120_000 });
    await sleep(2500);
    await gm(page, 'level 32', 1500);
    await gm(page, 'tp 2048 2095', 1800);
    await gm(page, 'killall', 800);
    await page.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
    await sleep(1500);
    const frames = Number(opt('--frames', '4'));
    for (const [w, h, tag] of [
      [1920, 1080, '1080p'],
      [1280, 720, '720p'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(700);
      await gm(page, 'tp 2040 2095', 1200);
      await page.keyboard.down('KeyD');
      await sleep(900);
      for (let i = 0; i < frames; i++) await snap(page, r.out, `bay-${tag}-${i}.jpg`, { wait: 300 });
      await page.keyboard.up('KeyD');
    }
    await ctx.close();
  },
} satisfies Scenario;
