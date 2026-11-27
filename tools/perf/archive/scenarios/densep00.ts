// #676: điểm đầu rừng tre (2470, 2012) sau tp lần đầu (ô chưa nạp) và lần hai (ô đã nạp); chờ 3 s cho camera/bóng ổn rồi mới chụp a, b sau 1,5 s.
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'densep00',
  desc: 'Điểm đầu rừng tre Vân Lam: ảnh a/b ổn định sau tp lần đầu và lần hai (kiểm prop dày không bật/mất)',
  usage: '[--out <thư mục>]',
  async run(r) {
    const { ctx, page } = await r.open({ name: 'DenseP00', renderer: 'webgpu', quality: 'high', viewport: [1920, 1080], seenIntro: true });
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await gm(page, 'killall', 800);
    for (const round of ['1', '2']) {
      if (round === '2') {
        await tp(page, 2540, 2012);
        await sleep(2500);
      }
      await tp(page, 2470, 2012);
      await snap(page, r.out, `r${round}-a.png`, { wait: 3000 });
      await snap(page, r.out, `r${round}-b.png`, { wait: 1500 });
    }
    await ctx.close();
  },
} satisfies Scenario;
