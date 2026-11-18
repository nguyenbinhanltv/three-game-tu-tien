// Thần phẩm (bậc 6): cột sáng rơi đồ + thông báo toàn phòng + ô túi + tooltip. Món vào túi bằng `/gm roll <mẫu> 5` (qua tx + ledger thật);
// phần hình của lúc rơi là tin `sys` dựng tại client (xác suất rơi thật ~0,6% nên không chờ được), đưa vào đúng bộ xử lý của phòng.
import { opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, hideUi } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { centerClip, snap } from '../lib/shot';

export default {
  name: 'thanpham',
  desc: 'Thần phẩm: cột sáng rơi đồ, thông báo toàn phòng, ô túi + tooltip (so với Thiên phẩm)',
  usage: '[--size 1280x800] [--item itm_thanh_phong_kiem] [--name "Thanh Phong Kiếm"]',
  async run(r) {
    const [vw, vh] = size('1280x800');
    const item = opt('--item', 'itm_thanh_phong_kiem');
    // Server gửi TÊN món và tên phẩm đã dịch (`itemName`, `t('ui.quality.N')`); tin dựng ở đây theo đúng khuôn đó.
    const name = opt('--name', 'Thanh Phong Kiếm');
    const quals = ['Phàm phẩm', 'Linh phẩm', 'Huyền phẩm', 'Địa phẩm', 'Thiên phẩm', 'Thần phẩm'];
    const { ctx, page } = await r.open({ name: 'Than', viewport: [vw, vh], dpr: 1, quality: 'high', extra: '', warnings: /models/ });
    await gm(page, 'level 15', 1600);
    await gm(page, 'god on', 1200);
    await gm(page, 'tp 2048 2088', 1600);
    await cam(page, { yaw: 0, pitch: 0.2, dist: 7 });
    await gm(page, 'spawn mon_soi_xam', 2500);
    for (const q of [3, 4, 5]) await gm(page, `roll ${item} ${q} 12`, 900);
    const src = await page.evaluate(() => {
      const g = window.__game as unknown as { view: { monsters: Map<string, unknown> } };
      return [...g.view.monsters.keys()][0] ?? '';
    });
    console.log(`[shots:thanpham] nguồn rơi: ${src || '(không có)'}`);
    const send = (q: number, text: boolean) =>
      page.evaluate(
        ([s, i, qq, withText, nm, ql]) => {
          const g = window.__game as unknown as { room: { onMessageHandlers: { emit(k: string, m: unknown): void } } };
          g.room.onMessageHandlers.emit('sys', { k: 'sys.loot_gear', p: { item: nm, quality: ql }, t: 'loot', i, src: s, q: qq });
          if (withText) g.room.onMessageHandlers.emit('sys', { k: 'sys.loot_than', p: { name: 'Đạo hữu', item: nm }, t: 'good' });
        },
        [src, item, q, text, name, quals[q]] as const,
      );
    await send(4, false);
    await snap(page, r.out, 'drop-thien.jpg', { wait: 1800 });
    await sleep(3500);
    await send(5, true);
    await snap(page, r.out, 'drop-than.jpg', { wait: 1800 });
    await snap(page, r.out, 'drop-than-clip.jpg', { clip: centerClip(vw, vh, 640, 640, 0.1), wait: 600 });
    await sleep(4500);
    await hideUi(page, 'none');
    await page.keyboard.press('KeyB');
    await snap(page, r.out, 'tui.jpg', { wait: 1500 });
    const slot = page.locator("[data-q='5']").first();
    if (await slot.count()) {
      await slot.hover();
      await snap(page, r.out, 'tui-tooltip-than.jpg', { wait: 1200 });
    } else console.log('[shots:thanpham] không thấy ô data-q=5');
    const s4 = page.locator("[data-q='4']").first();
    if (await s4.count()) {
      await s4.hover();
      await snap(page, r.out, 'tui-tooltip-thien.jpg', { wait: 1200 });
    }
    await ctx.close();
  },
} satisfies Scenario;
