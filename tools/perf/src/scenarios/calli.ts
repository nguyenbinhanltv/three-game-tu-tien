// Thẻ chương dùng chữ thư pháp (tools/calli): tên cảnh giới (độ kiếp/đột phá) và địa danh khi vào nơi mới, ở 720p + 1080p.
// Gọi thẳng `chapter()` của engine (không cần chơi tới) rồi chụp giữa thẻ. Kiểm 0 lỗi console.
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

/** nhóm → [thẻ, cấp để {realm} ra đúng tên cảnh giới]. */
const GROUPS: Record<string, [string, number][]> = {
  realm: [
    ['trib', 15],
    ['ascend', 16],
    ['ascend_kd', 20],
    ['ascend_na', 24],
    ['ascend_hn', 28],
    ['ascend_ab', 32],
  ],
  place: [
    ['sect', 15],
    ['dungeon', 15],
    ['ch2', 20],
    ['ch3', 24],
    ['ch4', 28],
    ['ch5', 32],
  ],
};

export default {
  name: 'calli',
  desc: 'Thẻ chương chữ thư pháp (cảnh giới / địa danh) ở 720p + 1080p',
  usage: '[--groups realm,place] [--sizes 720p,1080p]',
  async run(r) {
    for (const g of list('--groups', opt('--group', 'realm,place'))) {
      for (const tag of list('--sizes', '720p,1080p')) {
        for (const [kind, lv] of GROUPS[g] ?? []) {
          const { ctx, page, errors } = await r.open({
            name: 'Calli',
            viewport: UI_SIZES[tag],
            query: { god: 1, realm: lv, at: 'tong_mon' },
            seenIntro: true,
          });
          await sleep(2500);
          await page.evaluate(async (k) => {
            const url = '/src/game/engine/cine.ts'; // biến để tsc không tìm module (trình duyệt tự nạp từ Vite dev)
            const m = await import(/* @vite-ignore */ url);
            m.chapter(window.__game!, k as never, false);
          }, kind);
          await snap(page, r.out, `${g}-${kind}-${tag}.jpg`, { wait: 1500 });
          if (errors.length) console.log('  LỖI console:', errors.slice(0, 3));
          await ctx.close();
        }
      }
    }
  },
} satisfies Scenario;
