// Prop dày (tre, dương xỉ) chọn theo từng bản (#676): chuỗi khung 1080p đi xuyên rừng tre Vân Lam để soi mép màn hình có bật prop không.
// Mỗi điểm trên đường: ảnh ngay sau khi tới (~0,35 s, một nhịp chọn lại) và ảnh khi đã ổn (1,5 s); hai ảnh giống nhau = không bật muộn.
// Sau đó chạy nhanh (ngự kiếm + giữ phím) và chụp liên tiếp. Chạy A/B: dùng cùng điểm trên hai bản (`--out` khác nhau).
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

/** Đường qua cụm tre (2400,2160) → (2520,2040) → (2580,2100) của Vân Lam, bước ~15 m. */
const PATH: [number, number][] = [
  [2380, 2180],
  [2400, 2160],
  [2420, 2140],
  [2440, 2120],
  [2460, 2090],
  [2480, 2070],
  [2500, 2050],
  [2520, 2040],
  [2550, 2070],
  [2580, 2100],
];

export default {
  name: 'densefly',
  desc: 'Chuỗi khung 1080p xuyên rừng tre Vân Lam (kiểm prop dày không bật ở mép màn hình)',
  usage: '[--out <thư mục>]',
  async run(r) {
    const { ctx, page } = await r.open({ name: 'DenseFly', renderer: 'webgpu', quality: 'high', viewport: [1920, 1080], seenIntro: true });
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await gm(page, 'killall', 800);
    for (const [i, [x, z]] of PATH.entries()) {
      await tp(page, x, z);
      await sleep(350);
      await snap(page, r.out, `p${String(i).padStart(2, '0')}-a.png`);
      await sleep(1500);
      await snap(page, r.out, `p${String(i).padStart(2, '0')}-b.png`);
    }
    // Chạy nhanh: bay + giữ phím tiến, chụp liên tiếp (không cố định vị trí giữa hai bản, chỉ để soi mép).
    await tp(page, PATH[0]![0], PATH[0]![1]);
    await sleep(1500);
    await page.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    for (let i = 0; i < 8; i++) await snap(page, r.out, `run${String(i).padStart(2, '0')}.png`, { wait: 350 });
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
    await ctx.close();
  },
} satisfies Scenario;
