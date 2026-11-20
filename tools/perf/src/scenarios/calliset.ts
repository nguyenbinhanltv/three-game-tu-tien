// Tên bộ trang phục bằng chữ thư pháp (tools/calli, nhóm `outfit`) ở dấu triện của khung Hoa Trúc Thiên Giải (bảng Nhân vật, phím C),
// 720p + 1080p. Đổi bộ bằng GM `set <id> <số món>` rồi chụp khi dấu triện đang hiện. `--plain` chặn ảnh thư pháp → bản "trước" (chữ thường).
import { flag, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

const SETS = ['set_lac_kiem', 'set_liet_mach', 'set_van_kinh', 'set_tinh_khuyet', 'set_than_tang'];

export default {
  name: 'calliset',
  desc: 'Tên bộ trang phục chữ thư pháp ở dấu triện Hoa Trúc ở 720p + 1080p; --plain = bản trước',
  usage: '[--sizes 720p,1080p] [--sets set_lac_kiem,…] [--plain]',
  async run(r) {
    const plain = flag('--plain');
    for (const tag of list('--sizes', '720p,1080p')) {
      const { ctx, page, errors } = await r.open({
        name: 'Cset',
        viewport: UI_SIZES[tag],
        look: { g: 'm' },
        query: { realm: 'nk12', at: 'tong_mon', god: 1, quiet: 1 },
        seenIntro: true,
      });
      if (plain) await page.route('**/assets/calli/**', (rt) => rt.abort());
      await gm(page, 'set off');
      await sleep(800);
      await page.keyboard.press('KeyC');
      await sleep(1500);
      for (const id of list('--sets', SETS.join(','))) {
        await gm(page, `set ${id} 2`, 120);
        await sleep(900); // dấu triện hiện đủ (22–80% của 2,4 s)
        await snap(page, r.out, `${plain ? 'truoc' : 'sau'}-outfit-${id}-${tag}.jpg`, { wait: 0 });
        await sleep(2200);
      }
      if (errors.length) console.log('  LỖI console:', errors.slice(0, 3));
      await ctx.close();
    }
  },
} satisfies Scenario;
