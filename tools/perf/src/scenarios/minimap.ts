// Minimap "La Bàn Thiên Cơ" (U2-7): chụp đầu, xoay camera (vành + bản đồ xoay theo), phóng/thu bằng hạt ngọc, sang vùng mới (dải lụa mở, sương tan
// theo đường đi) ở từng cỡ màn hình, kèm video thao tác. `--variants` chỉ là nhãn tên ảnh.
import { LEVELS } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

/** Tâm gần đúng (trung bình đỉnh) của vùng thứ `i` trong level. */
const centroid = (level: string, i: number): [number, number] => {
  const poly = LEVELS[level]!.zones![i]!.poly;
  return [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
};

export default {
  name: 'minimap',
  desc: 'Minimap la bàn: đầu, xoay camera, zoom, vào vùng mới (dải lụa), sương tan; ảnh + video ở 720p/1080p',
  usage: '[--variants sau] [--sizes 720p,1080p]',
  async run(r) {
    const variant = list('--variants', 'sau')[0]!;
    for (const tag of list('--sizes', '720p,1080p')) {
      const vp = UI_SIZES[tag] ?? UI_SIZES['1080p'];
      const { ctx, page } = await r.open({
        name: 'Mm' + tag.slice(0, 3),
        viewport: vp,
        seenIntro: true,
        video: `${r.out}/video-${variant}-${tag}`,
        query: { god: 1, realm: 'nk12', at: 'tong_mon', debug: undefined },
      });
      const out = (n: string) => `minimap-${variant}-${n}-${tag}.jpg`;
      // Chờ bản đồ thủy mặc dựng xong (dựng nền, chia lát).
      await page.evaluate(async () => {
        const url = '/src/ui/minimap/ink.ts';
        const m = (await import(/* @vite-ignore */ url)) as { inkMap(): unknown };
        while (!m.inkMap()) await new Promise((res) => setTimeout(res, 100));
      });
      await sleep(1500);
      await snap(page, r.out, out('1-dau'), { wait: 400 });
      // Xoay camera một vòng: vành và bản đồ xoay theo.
      for (let i = 0; i <= 24; i++) {
        await cam(page, { yaw: (i / 24) * Math.PI * 2 });
        if (i === 6) await snap(page, r.out, out('2-xoay'), { wait: 0 });
        await sleep(130);
      }
      const bead = page.locator('.mm2-bead');
      await bead.nth(0).click();
      await sleep(900);
      await snap(page, r.out, out('3-phong-to'), { wait: 0 });
      await bead.nth(1).click();
      await bead.nth(1).click();
      await sleep(1200);
      await snap(page, r.out, out('4-thu-nho'), { wait: 0 });
      await bead.nth(0).click();
      await sleep(600);
      // Sang vùng khác: dải lụa chạy hiệu ứng mở, đường vừa đi còn vệt sương đã tan.
      const [x, z] = centroid('van_lam', 4);
      await tp(page, x, z);
      await sleep(500);
      await snap(page, r.out, out('5-vung-moi-mo'), { wait: 0 });
      await sleep(1500);
      await snap(page, r.out, out('6-vung-moi'), { wait: 0 });
      await ctx.close();
    }
  },
} satisfies Scenario;
