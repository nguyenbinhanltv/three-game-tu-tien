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
  usage: '--out <thư mục> [--mood night] [--noink] [--other] [--frames 4]',
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
    // `--other`: một người chơi thứ hai (trình duyệt phụ, 640×360) bay song song cách ~5 m để kiểm vệt của NGƯỜI KHÁC (mờ ×0,5).
    let otherPage: import('playwright').Page | null = null;
    let otherCtx: { close(): Promise<void> } | null = null;
    if (flag('--other')) {
      const o = await r.open({
        name: 'FlyTrailB',
        viewport: [640, 360],
        dpr: 1,
        quality: 'low',
        look: { g: 'm' },
        query: { realm: 'nk12', god: 1, quiet: 1, ...(mood ? { mood } : {}) },
        hide: 'hud',
        warnings: /models/,
      });
      otherPage = o.page;
      otherCtx = o.ctx;
      await otherPage.waitForFunction(() => !!window.__game, undefined, { timeout: 120_000 });
      await sleep(2500);
      await gm(otherPage, 'level 32', 1500);
    }
    const fly = () => page.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
    const frames = Number(opt('--frames', '3'));
    // Camera chéo MẶC ĐỊNH của game (không đặt lại); lúc ngự kiếm game kéo xa ×1,35 nên mỗi cỡ chụp thêm bản cắt cận chính giữa khung (nhân vật ở giữa).
    for (const [w, h, tag] of [
      [1920, 1080, '1080p'],
      [1280, 720, '720p'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(700);
      await gm(page, 'tp 2040 2095', 1200);
      if (otherPage) {
        await gm(otherPage, 'tp 2040 2090', 1200);
        await otherPage.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
        await otherPage.keyboard.down('KeyD');
      }
      await fly();
      await page.keyboard.down('KeyD');
      // Khung +30 ms, +150 ms, +400 ms sau lúc bật ngự kiếm (vệt vừa mọc), rồi các khung bay ổn định.
      let t = 0;
      for (const ms of [30, 150, 400]) {
        await snap(page, r.out, `bay-${tag}-+${ms}ms.jpg`, { wait: ms - t });
        t = ms;
      }
      await sleep(900);
      for (let i = 0; i < frames; i++) await snap(page, r.out, `bay-${tag}-on-dinh-${i}.jpg`, { wait: 300 });
      await page.keyboard.up('KeyD');
      await fly();
      if (otherPage) {
        await otherPage.keyboard.up('KeyD');
        await otherPage.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
      }
      await sleep(1200);
    }
    await otherCtx?.close();
    await ctx.close();
  },
} satisfies Scenario;
