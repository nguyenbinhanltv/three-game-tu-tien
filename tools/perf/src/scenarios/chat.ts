// Khung Trò chuyện "Truyền Âm Gian" (U2-7b): tab kênh (Tất cả/Thế giới/Tổ đội/Hệ thống/Chiến đấu), tên vật phẩm bấm xem chú giải, kéo giãn kích thước
// (nhớ qua tải lại), thu gọn thành thẻ ngọc có số tin chưa đọc, mở lại bằng thẻ/thanh tiêu đề/Enter; ảnh + video + kiểm trạng thái ở từng cỡ màn hình.
// `--variants` chỉ là nhãn tên ảnh.
import { ITEM, itemName } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { skipCutscene, waitInGame } from '../lib/game';
import type { Page } from 'playwright';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

type Inject = { text: string; type: string; from?: string; ch?: string; item?: { id: string; q?: number } };

/** Đẩy dòng vào log của client như tin thật (cùng `pushLog` của game). */
async function inject(page: Page, lines: Inject[]): Promise<void> {
  await page.evaluate(async (ls) => {
    const url = '/src/ui/store.ts';
    const m = (await import(/* @vite-ignore */ url)) as {
      pushLog(t: string, ty: string, f?: string, x?: { ch?: string; item?: unknown }): void;
    };
    for (const l of ls) m.pushLog(l.text, l.type, l.from, { ch: l.ch, item: l.item });
  }, lines);
  await sleep(300);
}

export default {
  name: 'chat',
  desc: 'Khung chat U2-7b: tab, tooltip vật phẩm, kéo giãn, thu gọn + chưa đọc, mở lại (thẻ/tiêu đề/Enter), nhớ qua tải lại; ảnh + video ở 720p/1080p',
  usage: '[--variants sau] [--sizes 720p,1080p]',
  async run(r) {
    const variant = list('--variants', 'sau')[0]!;
    const result: Record<string, unknown> = {};
    const potion = ITEM.has('itm_hoi_xuan_dan') ? 'itm_hoi_xuan_dan' : [...ITEM.keys()][0]!;
    const gear = [...ITEM.values()].find((d) => d.rarity >= 2)?.id ?? potion;
    const base: Inject[] = [
      { text: 'Chào mừng đạo hữu đến Lạc Kiếm Tông.', type: 'good' },
      {
        text: 'Hàn Thanh Vân mời ngươi cùng đi Đoạn Mạch Trận vào giờ Tý, nhớ mang đủ đan dược hồi khí và phù truyền tống để khỏi phải quay lại.',
        type: 'chat',
        from: 'Hàn Thanh Vân',
      },
      { text: 'Ta đợi ở Truyền Tống Trận.', type: 'party', from: 'Mặc Ly' },
      { text: `Nhặt được ${itemName(potion)} x3.`, type: 'loot', item: { id: potion } },
      { text: `Nhặt được ${itemName(gear)} (Địa phẩm).`, type: 'loot', item: { id: gear, q: 2 } },
      { text: 'Tu vi +120.', type: 'xp' },
      { text: 'Chiêu thức chưa hồi xong.', type: 'bad', ch: 'combat' },
      { text: 'Linh Lang chịu 57 sát thương.', type: 'bad', ch: 'combat' },
      { text: 'Ai bán Dưỡng Khí Đan giá 40 linh thạch, tìm ta ở chợ phía Đông.', type: 'chat', from: 'Tô Mộ Bạch' },
    ];
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
      const out = (n: string) => `chat-${variant}-${n}-${tag}.jpg`;
      const st = () =>
        page.evaluate(() => {
          const c = document.querySelector('.u2h-chat');
          const b = c?.getBoundingClientRect();
          const tab = document.querySelector('.u2h-chat-tab[data-on="1"]')?.textContent ?? null;
          const log = document.querySelector('.u2h-chat-log');
          const input = document.querySelector('.u2h-chat-input');
          const lines = log ? Array.from(log.querySelectorAll('.chat-line')) : [];
          const last = lines[lines.length - 1]?.getBoundingClientRect();
          return {
            collapsed: !!document.querySelector('.u2h-chat-mini'),
            tab,
            box: b ? [Math.round(b.width), Math.round(b.height)] : null,
            lines: lines.length,
            unread: document.querySelector('.u2h-unread')?.textContent ?? null,
            saved: {
              tab: localStorage.getItem('dtl.chatTab'),
              size: localStorage.getItem('dtl.chatSize'),
              collapsed: localStorage.getItem('dtl.chatCollapsed'),
            },
            lastAboveInput: !last || !input ? null : last.bottom <= input.getBoundingClientRect().top + 0.5,
          };
        });
      const log: Record<string, unknown> = {};
      await inject(page, base);
      await snap(page, r.out, out('1-tat-ca'), { wait: 500 });
      log.tatCa = await st();
      // Rê chuột vào tên vật phẩm: chú giải theo phẩm.
      await page.locator('.u2h-chat-item').first().hover();
      await sleep(500);
      await snap(page, r.out, out('2-chu-giai'), { wait: 0 });
      await page.mouse.move(vp[0] / 2, vp[1] / 3);
      for (const [i, name] of ['the-gioi', 'he-thong', 'chien-dau'].entries()) {
        await page
          .locator('.u2h-chat-tab')
          .nth(i === 0 ? 1 : i === 1 ? 3 : 4)
          .click();
        await sleep(400);
        await snap(page, r.out, out(`${3 + i}-${name}`), { wait: 0 });
        log[name] = await st();
      }
      await page.locator('.u2h-chat-tab').nth(0).click();
      // Kéo giãn: nắm góc trên-phải, kéo sang phải và lên.
      const grip = (await page.locator('.u2h-chat-grip').boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + 120, grip.y - 90, { steps: 8 });
      await page.mouse.up();
      await sleep(400);
      await snap(page, r.out, out('6-keo-gian'), { wait: 0 });
      log.keoGian = await st();
      // Thu gọn rồi có tin mới: thẻ ngọc chạy tin cuối + số chưa đọc.
      await page.locator('.u2h-chat .u2h-fold').click();
      await sleep(400);
      await inject(page, [
        { text: 'Tới chưa?', type: 'party', from: 'Mặc Ly' },
        { text: 'Ta ở cổng núi.', type: 'chat', from: 'Hàn Thanh Vân' },
        { text: 'Tu vi +80.', type: 'xp' },
      ]);
      await snap(page, r.out, out('7-thu-gon'), { wait: 400 });
      log.thuGon = await st();
      await page.locator('.u2h-chat-pill').click();
      await sleep(500);
      await snap(page, r.out, out('8-mo-lai'), { wait: 0 });
      log.moLaiThe = await st();
      // Enter khi đang thu gọn: mở lại hẳn.
      await page.locator('.u2h-chat .u2h-fold').click();
      await sleep(300);
      await page.keyboard.press('Enter');
      await sleep(500);
      log.moLaiEnter = await st();
      await page.keyboard.press('Escape');
      // Chọn tab Chiến đấu, tải lại: tab + kích thước còn nguyên.
      await page.locator('.u2h-chat-tab').nth(4).click();
      await page.reload();
      await waitInGame(page);
      await skipCutscene(page);
      await sleep(1500);
      await snap(page, r.out, out('9-sau-tai-lai'), { wait: 0 });
      log.sauTaiLai = await st();
      result[tag] = log;
      await ctx.close();
    }
    writeJson(r.out, `chat-${variant}.json`, result);
    console.log(JSON.stringify(result));
  },
} satisfies Scenario;
