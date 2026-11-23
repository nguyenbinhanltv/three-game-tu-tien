// Chữ thư pháp (tools/calli, nhóm `chapter` + `screen`) ở: màn tiêu đề + màn tải (phụ đề vùng), Bản đồ chương (phím N), màn chết/hồi sinh.
// 720p + 1080p. `--plain` chặn ảnh thư pháp → bản "trước" (chữ thường). Kiểm 0 lỗi console (bản --plain có lỗi tải ảnh do cố ý chặn).
import { flag, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gameUrl } from '../lib/browser';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'calliscreen',
  desc: 'Chữ thư pháp ở màn tiêu đề/tải, Bản đồ chương, màn chết ở 720p + 1080p; --plain = bản trước',
  usage: '[--sizes 720p,1080p] [--parts title,load,chapters,dead] [--plain] [--loadwait 700]',
  async run(r) {
    const plain = flag('--plain');
    const tag = plain ? 'truoc' : 'sau';
    const parts = list('--parts', 'title,load,chapters,dead');
    for (const size of list('--sizes', '720p,1080p')) {
      const viewport = UI_SIZES[size];
      // Màn tiêu đề (đăng nhập) và màn tải của vùng cuối (đặt `dtl.lastZone` = tranh Thiên Khuyết): trang không đăng nhập tự động.
      for (const [part, art] of [
        ['title', ''],
        ['load', 'thien_khuyet_co_thanh'],
      ] as const) {
        if (!parts.includes(part)) continue;
        const ctx = await r.browser.newContext({ viewport: { width: viewport[0], height: viewport[1] } });
        if (art)
          await ctx.addInitScript((a) => {
            localStorage.setItem('dtl.lastZone', a);
            localStorage.setItem('dtl.lastLevel', 'thien_khuyet');
          }, art);
        const page = await ctx.newPage();
        if (plain) await page.route('**/assets/calli/**', (rt) => rt.abort());
        await page.goto(gameUrl(r.clientPort, art ? { auto: 'Cscr' + (Date.now() % 1000) } : {}), { waitUntil: 'load' });
        await sleep(art ? Number(list('--loadwait', '700')[0]) : 3500);
        await snap(page, r.out, `${tag}-${part}-${size}.jpg`);
        await ctx.close();
      }
      if (!parts.includes('chapters') && !parts.includes('dead')) continue;
      const { ctx, page, errors } = await r.open({
        name: 'Cscr',
        viewport,
        query: { realm: 'nk12', at: 'tong_mon', god: 1, quiet: 1 },
        seenIntro: true,
      });
      if (plain) await page.route('**/assets/calli/**', (rt) => rt.abort());
      await sleep(1500);
      if (parts.includes('chapters')) {
        await page.keyboard.press('KeyN');
        await sleep(2000);
        await snap(page, r.out, `${tag}-chapters-${size}.jpg`);
        await page.keyboard.press('KeyN');
        await sleep(500);
      }
      if (parts.includes('dead')) {
        await gm(page, 'god off');
        await gm(page, 'die', 300);
        await sleep(4500); // mực thủy mặc phủ màn rồi bảng hồi sinh hiện
        await snap(page, r.out, `${tag}-dead-${size}.jpg`);
      }
      if (errors.length && !plain) console.log('  LỖI console:', errors.slice(0, 3));
      await ctx.close();
    }
  },
} satisfies Scenario;
