// Chữ thư pháp (tools/calli) ở chỗ hiển thị thật: tên cảnh giới/địa danh (thẻ chương), tên chiêu tối thượng… ở 720p + 1080p.
// Gọi thẳng hàm của engine/store (không cần chơi tới) rồi chụp giữa lúc hiện. `--plain` chặn ảnh thư pháp để chụp bản "trước" (chữ thường)
// cùng camera. Kiểm 0 lỗi console.
import { flag, list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

type Item = { id: string; lv?: number; wait?: number };
/** nhóm → mục. `lv` = cấp nhân vật (để {realm} ra đúng tên cảnh giới). */
const GROUPS: Record<string, Item[]> = {
  realm: ['trib:15', 'ascend:16', 'ascend_kd:20', 'ascend_na:24', 'ascend_hn:28', 'ascend_ab:32'].map((s) => ({
    id: s.split(':')[0],
    lv: +s.split(':')[1],
  })),
  place: ['sect:15', 'dungeon:15', 'ch2:20', 'ch3:24', 'ch4:28', 'ch5:32'].map((s) => ({ id: s.split(':')[0], lv: +s.split(':')[1] })),
  ult: ['skl_van_kiem_quy_tong', 'skl_kim_cuong_bat_hoai', 'skl_hoi_thien_dan_lo'].map((id) => ({ id, lv: 15, wait: 2200 })),
};

export default {
  name: 'calli',
  desc: 'Chữ thư pháp (cảnh giới, địa danh, chiêu tối thượng…) ở 720p + 1080p; --plain = bản trước (chữ thường)',
  usage: '[--groups realm,place,ult] [--sizes 720p,1080p] [--plain]',
  async run(r) {
    const plain = flag('--plain');
    for (const g of list('--groups', opt('--group', 'realm,place,ult'))) {
      for (const tag of list('--sizes', '720p,1080p')) {
        for (const it of GROUPS[g] ?? []) {
          const { ctx, page, errors } = await r.open({
            name: 'Calli',
            viewport: UI_SIZES[tag],
            query: { god: 1, realm: it.lv ?? 15, at: 'tong_mon' },
            seenIntro: true,
          });
          if (plain) await page.route('**/assets/calli/**', (rt) => rt.abort());
          await sleep(2500);
          // Thẻ chiêu chỉ 0,6 s: kéo dài hoạt ảnh để chụp đúng lúc hiện đủ (chỉ trong kịch bản chụp).
          if (g === 'ult')
            await page.addStyleTag({
              content: '.ult-card,.ult-card-name{animation-duration:8s!important}.ult-card-name .calli{animation-duration:2s!important}',
            });
          await page.evaluate(
            async ([group, id]) => {
              // Đường dẫn là biến để tsc không tìm module (trình duyệt tự nạp từ Vite dev).
              const eng = '/src/game/engine/cine.ts';
              const store = '/src/ui/store.ts';
              if (group === 'ult') {
                const { useUI } = await import(/* @vite-ignore */ store);
                useUI.setState({ ultCard: { id: Date.now(), skill: id, color: 'ffd45a', until: Date.now() + 5000 } });
              } else {
                const m = await import(/* @vite-ignore */ eng);
                m.chapter(window.__game!, id as never, false);
              }
            },
            [g, it.id],
          );
          await snap(page, r.out, `${plain ? 'truoc' : 'sau'}-${g}-${it.id}-${tag}.jpg`, { wait: it.wait ?? 1500 });
          if (errors.length) console.log('  LỖI console:', errors.slice(0, 3));
          await ctx.close();
        }
      }
    }
  },
} satisfies Scenario;
