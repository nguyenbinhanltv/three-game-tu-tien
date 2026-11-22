// TN-7: phòng cầu Cửu Kiều (cầu 1 Thạch, cầu 2 Kiếm Ảnh) qua đường thật: Dẫn Kiều Nhân (tab Cửu Kiều) → vé một lần → room cầu → ảnh lúc vào và lúc quái/bóng xuất hiện.
//   pnpm shots kieu --out <thư mục> [--bridge 1|2] [--sizes 1920x1080,1280x720]
import { flag, opt, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, tp, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'kieu',
  desc: 'TN-7: vào phòng cầu qua Dẫn Kiều Nhân bằng vé thật, chụp tab Cửu Kiều, lúc vào và lúc đợt đầu xuất hiện',
  usage: '[--bridge 1|2] [--iso 1] [--sizes 1920x1080,1280x720]',
  async run(r) {
    const n = Number(opt('--bridge', '1'));
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      const { ctx, page } = await r.open({
        name: `Kieu${viewport[1]}`,
        quality: 'high',
        viewport,
        seenIntro: true,
        warnings: true,
        ...(flag('--iso') ? { query: { cam: 'iso' } } : {}),
      });
      await gm(page, 'level 45');
      await gm(page, 'god on');
      if (n > 1) await gm(page, `kieu ${n - 1}`);
      await enterLevel(page, 'cuu_kieu');
      await tp(page, 1024, 1494); // cạnh Dẫn Kiều Nhân
      await page.evaluate(() => (window.__game as unknown as { openNpc(id: string): void }).openNpc('npc_dan_kieu_nhan'));
      await sleep(800);
      const tab = page.getByRole('tab', { name: /Cửu Kiều/ });
      if (await tab.count()) await tab.first().click();
      await sleep(600);
      await snap(page, r.out, `kieu${n}-${viewport[1]}p-dan-kieu-nhan.png`, { wait: 400 });
      await page.evaluate((m) => window.__game!.send('kieu', { n: m }), n);
      await waitLevel(page, `kieu_${n}`, 3000);
      await snap(page, r.out, `kieu${n}-${viewport[1]}p-vao.png`, { wait: 800 });
      await sleep(9000); // đợt đầu (delay 6–8 s)
      await snap(page, r.out, `kieu${n}-${viewport[1]}p-dot1.png`, { wait: 400 });
      await ctx.close();
    }
  },
} satisfies Scenario;
