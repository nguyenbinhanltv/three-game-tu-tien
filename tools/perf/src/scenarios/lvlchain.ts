// Chuyển level liên tiếp trong CÙNG phiên (WebGPU): mỗi bước chụp ảnh, đo độ sáng trung bình (màn đen = lỗi) và đếm lỗi texture trong console.
// Bắt lỗi "vào bac_hoang từ level khác → màn đen + writeTexture" (texture đã bỏ bản CPU bị nạp lại, xem `neutralizeFreedTexture` ở `game/core/assets.ts`).
//   pnpm shots lvlchain --out <thư mục> [--chain van_lam,bac_hoang,van_lam,doan_mach,...] [--query keeptex=1]
import sharp from 'sharp';
import { sleep } from '../lib/devserver';
import { list, opt } from '../lib/env';
import { enterLevel, gm, shownLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'lvlchain',
  desc: 'Chuyển level liên tiếp trong một phiên: chụp, đo độ sáng (phát hiện màn đen) và lỗi texture console',
  usage: '[--chain van_lam,bac_hoang,van_lam,...] [--query keeptex=1]',
  async run(r) {
    const chain = list('--chain', 'van_lam,bac_hoang,van_lam,doan_mach,bac_hoang,van_hai,bac_hoang');
    const { page } = await r.open({
      name: 'Chain',
      quality: 'high',
      viewport: [1280, 720],
      seenIntro: true,
      hide: 'hud',
      warnings: true,
      extra: opt('--query', ''),
    });
    await gm(page, 'level 30');
    await gm(page, 'god on');
    let bad = 0;
    for (const [i, lv] of chain.entries()) {
      const e0 = r.errors.length;
      await enterLevel(page, lv);
      await sleep(3000);
      const buf = await snap(page, r.out, `${String(i + 1).padStart(2, '0')}-${lv}.jpg`);
      const st = await sharp(buf).stats();
      const mean = st.channels.reduce((a, c) => a + c.mean, 0) / st.channels.length;
      const errs = r.errors.slice(e0).filter((x) => /writeTexture|texture/i.test(x));
      const black = mean < 12;
      if (black || errs.length) bad++;
      console.log(
        `[lvlchain] ${i + 1} ${lv} shown=${await shownLevel(page)} sáng=${mean.toFixed(1)} ${black ? 'ĐEN' : 'ok'} lỗiTexture=${errs.length}`,
      );
      for (const x of errs.slice(0, 2)) console.log('   ', x.slice(0, 220));
    }
    if (bad) {
      console.error(`[lvlchain] ${bad}/${chain.length} bước đen hoặc lỗi texture`);
      process.exitCode = 1;
    }
  },
} satisfies Scenario;
