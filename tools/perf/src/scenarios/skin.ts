// Skin toàn thân (ô ngoại hình): mặc bằng `/gm skin <id>` trên nhân vật nam và nữ rồi chụp đứng ba hướng + các tư thế dễ lộ
// lỗi trọng số nhất (chạy, ngự kiếm, đả tọa, chém, chết); thêm một ảnh trước/sau khi tháo để thấy skin đè trang phục.
// Dùng khi thêm skin mới hoặc sửa `skin_prep.py`/`retarget_set.py`.
import { list, num, opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { motionViews, stillViews } from '../lib/charshots';
import { cam, gm, info } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { centerClip, snap } from '../lib/shot';

export default {
  name: 'skin',
  desc: 'Skin toàn thân (ô ngoại hình) nam/nữ: đứng 3 hướng, chạy, bay, đả tọa, chém, chết; soát trọng số và xuyên lưới',
  usage: '[--ids itm_skin_varkessa] [--genders m,f] [--set <id bộ đang mặc bên dưới>] [--only still|motion] [--dist 3.6] [--size 1100x900]',
  async run(r) {
    const [vw, vh] = size('1100x900');
    const dist = num('--dist', 3.6);
    const only = opt('--only', 'all');
    for (const g of list('--genders', 'm,f')) {
      const { ctx, page } = await r.open({ name: `Skin${g}`, viewport: [vw, vh], dpr: 2, quality: 'high', look: { g }, hide: 'hud', warnings: /models/ });
      await gm(page, 'level 20', 1600);
      await gm(page, 'god on', 1600);
      await gm(page, 'tp 2048 2088', 1600);
      // Mặc sẵn một bộ bên dưới: skin phải đè lên, tháo skin thì bộ hiện lại.
      const under = opt('--set', 'set_liet_mach');
      await gm(page, `set ${under}`, 2400);
      for (const id of list('--ids', 'itm_skin_varkessa')) {
        const shot = (view: string) => snap(page, r.out, `${id}-${g}-${view}.jpg`, { clip: centerClip(vw, vh, 620, 680) });
        await cam(page, { yaw: 0, pitch: 0.1, dist });
        await sleep(900);
        const bare = await info(page);
        await shot('0-truoc-khi-mac');
        await gm(page, `skin ${id}`, 4500);
        const worn = await info(page);
        const sn = await page.evaluate(() => (window.__game!.me()?.sn as string | undefined) ?? '');
        console.log(`[shots:skin] ${id} ${g}: server báo sn='${sn}'; draw ${bare.drawCalls}→${worn.drawCalls}, tam giác ${bare.triangles}→${worn.triangles}`);
        if (only !== 'motion') await stillViews(page, shot, dist);
        if (only !== 'still') await motionViews(page, shot, dist, { die: true, home: '2048 2088' });
        await gm(page, 'skin off', 3000);
        await cam(page, { yaw: 0, pitch: 0.1, dist });
        await shot('9-sau-khi-thao');
      }
      await gm(page, 'tp 2048 2900', 900);
      await ctx.close();
    }
  },
} satisfies Scenario;
