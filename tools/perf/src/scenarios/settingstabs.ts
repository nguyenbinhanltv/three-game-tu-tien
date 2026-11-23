// Chân Cảnh U11: bảng Cài đặt dạng tab (Đồ họa / Âm thanh / Điều khiển / Giao diện) ở 1080p + 720p. Bản cũ (một danh sách dài) không có tab:
// chạy trên bản trước thì chỉ chụp một ảnh bảng.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

const TABS = ['graphics', 'audio', 'controls', 'interface'];

export default {
  name: 'settingstabs',
  desc: 'Bảng Cài đặt từng tab ở 1080p + 720p',
  usage: '[--sizes 1080p,720p]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const { ctx, page } = await r.open({
      name: 'SetTabs',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await sleep(500);
      await page.keyboard.press('KeyO');
      await sleep(1200);
      const has = (await page.getByTestId('settings-graphics').count()) > 0;
      if (!has) {
        await snap(page, r.out, `settings-all-${tag}.jpg`, { wait: 300 });
      } else {
        for (const id of TABS) {
          await page.locator('.k-tabs [role="tab"]').nth(TABS.indexOf(id)).click();
          await sleep(500);
          await snap(page, r.out, `settings-${id}-${tag}.jpg`, { wait: 300 });
        }
      }
      await page.keyboard.press('Escape');
      await sleep(400);
    }
    await ctx.close();
  },
} satisfies Scenario;
