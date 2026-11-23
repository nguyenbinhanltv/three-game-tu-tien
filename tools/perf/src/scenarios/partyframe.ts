// Chân Cảnh U9: khung tổ đội (máu/linh lực/buff đồng đội, chỉ báo ngoài tầm nhìn) ở 1080p + 720p. Hai client lập tổ đội; đồng đội dùng Định Thần Phù
// rồi đứng xa ngoài tầm nhìn camera.
import { t } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'partyframe',
  desc: 'Khung tổ đội: buff đồng đội + chỉ báo ngoài tầm nhìn ở 1080p + 720p',
  usage: '[--sizes 1080p,720p]',
  async run(r: Run) {
    const sizes = list('--sizes', '1080p,720p');
    const q = { realm: 'nk12', at: 'tong_mon', god: 1 };
    const a = await r.open({ name: 'PfA', viewport: [1920, 1080], seenIntro: true, query: q });
    const b = await r.open({ name: 'PfB', viewport: [1920, 1080], seenIntro: true, query: q });
    await sleep(2500);
    await a.page.evaluate((n) => window.__game!.send('pty', { a: 'inv', n }), b.name);
    await sleep(1500);
    await b.page
      .getByRole('button', { name: t('ui.party.accept') })
      .first()
      .click();
    await sleep(1500);
    // Đồng đội (b) dùng Định Thần Phù: buff có đếm giờ hiện ở khung tổ đội của a.
    await gm(b.page, 'bag clear', 1500);
    await gm(b.page, 'give itm_dinh_than_phu 1', 1500);
    await tp(a.page, 2048, 2060);
    await tp(b.page, 2048 + 45, 2060 - 30);
    await sleep(2500);
    // Định Thần Phù chỉ 10 giây: dùng ngay trước khi chụp.
    for (let slot = 0; slot < 6; slot++, await sleep(250))
      await b.page.evaluate(([sl, rid]) => window.__game!.send('use', { slot: sl, r: rid }), [slot, `pf-${slot}-${Date.now()}`] as const);
    await sleep(1500);
    await sleep(1200);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await a.page.setViewportSize({ width: w, height: h });
      await snap(a.page, r.out, `party-${tag}.jpg`, { wait: 900 });
    }
    await snap(b.page, r.out, 'party-b-1080p.jpg', { wait: 300 });
    await a.ctx.close();
    await b.ctx.close();
  },
} satisfies Scenario;
