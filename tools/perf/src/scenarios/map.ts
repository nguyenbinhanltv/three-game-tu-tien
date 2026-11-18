// Bản đồ nhỏ và bản đồ lớn (M-3/M-4) của một level ở nhiều cỡ màn hình: ảnh cắt riêng minimap, ảnh cả màn hình, bản đồ lớn (phím M).
// Dùng sau khi đổi địa hình/`zones`/đường mòn rồi chạy lại `pnpm minimap:build`, hoặc khi sửa UI bản đồ.
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

export default {
  name: 'map',
  desc: 'Minimap + bản đồ lớn của một level ở 1080p/1440p/4K (sau khi đổi địa hình, zones hay UI bản đồ)',
  usage: '[--level van_lam|doan_mach|van_hai|thien_khuyet|bac_hoang] [--sizes 1080p,1440p,4k] [--dpr 1]',
  async run(r) {
    const level = opt('--level', 'van_lam');
    requireLevel(level);
    const log: Record<string, unknown> = {};
    for (const tag of list('--sizes', '1080p,1440p,4k')) {
      const { ctx, page, errors } = await r.open({ name: 'Map', viewport: UI_SIZES[tag], dpr: num('--dpr', 1), query: { god: 1, realm: level === 'van_lam' ? 'nk15' : 27, at: level === 'van_lam' ? 'tong_mon' : undefined }, seenIntro: true });
      if (level !== 'van_lam') await enterLevel(page, level);
      await gm(page, 'tele all');
      await sleep(6000);
      await snap(page, r.out, `${level}-full-${tag}.jpg`);
      await page.locator('.minimap-wrap').screenshot({ path: `${r.out}/${level}-minimap-${tag}.png` });
      const mm = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('.minimap canvas');
        return c ? { buf: c.width, cssPx: Math.round(c.getBoundingClientRect().width), dpr: devicePixelRatio, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') } : null;
      });
      await page.keyboard.press('KeyM');
      await snap(page, r.out, `${level}-worldmap-${tag}.jpg`, { wait: 1800 });
      await page.keyboard.press('Escape');
      log[tag] = { ...mm, errors: errors.slice(0, 4) };
      await ctx.close();
    }
    writeJson(r.out, `${level}-map.json`, log);
  },
} satisfies Scenario;
