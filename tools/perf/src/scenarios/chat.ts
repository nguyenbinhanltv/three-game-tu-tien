// Khung Trò chuyện góc trái dưới: thu gọn rồi mở lại bằng nút mũi tên, bằng bấm thanh tiêu đề và bằng phím Enter; chụp mở/thu/mở lại ở từng cỡ màn hình
// và quay video thao tác. Kiểm cả trạng thái `data-collapsed` lẫn `localStorage dtl.chatCollapsed`. `--variants truoc,sau` chỉ là nhãn tên ảnh.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, skipCutscene, waitInGame } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

export default {
  name: 'chat',
  desc: 'Khung chat: mở, thu gọn, mở lại (nút, thanh tiêu đề, Enter) ở 720p/1080p, ảnh + video + kiểm trạng thái',
  usage: '[--variants truoc,sau] [--sizes 720p,1080p]',
  async run(r) {
    const variant = list('--variants', 'sau')[0]!;
    const result: Record<string, unknown> = {};
    for (const tag of list('--sizes', '720p,1080p')) {
      const vp = UI_SIZES[tag] ?? UI_SIZES['1080p'];
      const { ctx, page } = await r.open({
        name: 'Chat' + tag.slice(0, 3),
        viewport: vp,
        seenIntro: true,
        video: `${r.out}/video-${variant}-${tag}`,
        query: { god: 1, realm: 'nk12', at: 'tong_mon', debug: undefined },
      });
      await sleep(2500);
      for (const c of ['heal', 'heal', 'heal', 'heal']) await gm(page, c, 400);
      await page.evaluate(() => window.__game!.send('chat', { m: 'xin chào đạo hữu' }));
      await sleep(800);
      const fold = page.locator('.u2h-chat .u2h-fold');
      const st = () =>
        page.evaluate(() => ({
          collapsed: document.querySelector('.u2h-chat')?.getAttribute('data-collapsed') === '1',
          saved: localStorage.getItem('dtl.chatCollapsed'),
          box: (() => {
            const b = document.querySelector('.u2h-chat')!.getBoundingClientRect();
            return [Math.round(b.width), Math.round(b.height)];
          })(),
        }));
      const collapse = async () => {
        if (!(await st()).collapsed) await fold.click();
        await sleep(300);
      };
      const log: Record<string, unknown> = {};
      await snap(page, r.out, `chat-${variant}-1-mo-${tag}.jpg`, { wait: 600 });
      log.mo = await st();
      await fold.click();
      await sleep(500);
      await snap(page, r.out, `chat-${variant}-2-thu-${tag}.jpg`, { wait: 300 });
      log.thu = await st();
      await fold.click().catch(() => undefined);
      await sleep(500);
      await snap(page, r.out, `chat-${variant}-3-mo-lai-nut-${tag}.jpg`, { wait: 300 });
      log.moLaiNut = await st();
      // Thu lại rồi mở bằng bấm thanh tiêu đề
      await fold.click().catch(() => undefined);
      await sleep(300);
      await page
        .locator('.u2h-chat .u2h-card-head')
        .click({ position: { x: 30, y: 10 }, timeout: 3000 })
        .catch(() => undefined);
      await sleep(500);
      log.moLaiTieuDe = await st();
      // Thu lại rồi mở bằng Enter
      await collapse();
      await page.keyboard.press('Enter');
      await sleep(600);
      await snap(page, r.out, `chat-${variant}-4-enter-${tag}.jpg`, { wait: 300 });
      log.moLaiEnter = await st();
      await page.keyboard.press('Escape');
      await sleep(500);
      log.sauEsc = await st();
      // Nhớ qua tải lại: thu gọn rồi tải lại trang, vẫn còn thu gọn
      await collapse();
      await page.reload();
      await waitInGame(page);
      await skipCutscene(page);
      await sleep(1500);
      log.sauTaiLai = await st();
      result[tag] = log;
      await ctx.close();
    }
    writeJson(r.out, `chat-${variant}.json`, result);
    console.log(JSON.stringify(result, null, 1));
  },
} satisfies Scenario;
