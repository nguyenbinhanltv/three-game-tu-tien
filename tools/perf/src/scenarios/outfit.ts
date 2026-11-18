// Trang phục mặc thật trên nhân vật (áo retarget + phụ kiện gắn xương của bộ trang bị): nam/nữ × đứng ba hướng × chạy, ngự kiếm,
// đả tọa, chém để soát xuyên lưới; in chênh draw call/tam giác khi mặc. Dùng sau khi thêm/sửa bộ, áo `set_*`, phụ kiện hay kiếm.
import { flag, list, num, opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { motionViews, slash, stillViews } from '../lib/charshots';
import { cam, gm, hideUi, info } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { centerClip, snap } from '../lib/shot';

export default {
  name: 'outfit',
  desc: 'Bộ trang bị mặc thật (áo + phụ kiện) nam/nữ: đứng 3 hướng, chạy, bay, đả tọa, chém; soát xuyên lưới',
  usage: '[--sets set_liet_mach,… | --kit <bậc 1-4> --sets kiem,hophap,dansu] [--genders m,f] [--only still|motion] [--level 12] [--dye attire_sect] [--dist 3.4] [--size 1100x900] [--panel] [--matrix]',
  async run(r) {
    const [vw, vh] = size('1100x900');
    const dist = num('--dist', 3.4);
    const only = opt('--only', 'all');
    // --kit <bậc>: mặc bằng `/gm kit <bậc> <nhánh> <m|f>` (cả bộ + kiếm bậc đó); --sets khi ấy là nhánh.
    const kit = opt('--kit', '');
    const sets = list('--sets', kit ? 'kiem,hophap,dansu' : 'set_liet_mach');
    for (const g of list('--genders', 'm,f')) {
      const { ctx, page } = await r.open({ name: `Out${g}`, viewport: [vw, vh], dpr: 2, quality: 'high', look: { g, dye: opt('--dye', 'attire_sect') }, extra: opt('--query', ''), hide: 'hud', warnings: /models/ });
      await gm(page, `level ${opt('--level', kit ? '28' : '12')}`, 1600);
      await gm(page, 'god on', 1600);
      await gm(page, 'tp 2048 2088', 1600);
      for (const set of sets) {
        // Nhân vật luôn ở giữa màn hình (camera bám theo): cắt sát để thấy rõ phụ kiện.
        const shot = (view: string) => snap(page, r.out, `${set}-${g}-${view}.jpg`, { clip: centerClip(vw, vh, 560, 560, 0.22) });
        await gm(page, 'set off', 1700);
        await cam(page, { yaw: 0, pitch: 0.12, dist });
        await sleep(800);
        const bare = await info(page);
        await gm(page, kit ? `kit ${kit} ${set} ${g}` : `set ${set}`, kit ? 3500 : 2200);
        await sleep(800);
        const worn = await info(page);
        const code = await page.evaluate(() => (window.__game!.me()?.sa as string | undefined) ?? '');
        console.log(`[shots:outfit] ${set} ${g}: mã phụ kiện '${code}'; draw ${bare.drawCalls}→${worn.drawCalls}, tam giác ${bare.triangles}→${worn.triangles}`);
        if (flag('--panel')) {
          // Bảng nhân vật (phím C): xem trước 3D phải mặc đúng áo của bộ.
          await hideUi(page, 'none');
          await page.keyboard.press('KeyC');
          await snap(page, r.out, `${set}-${g}-bang.jpg`, { wait: 3500 });
          await page.keyboard.press('KeyC');
          await hideUi(page, 'hud');
        }
        if (only !== 'motion') await stillViews(page, shot, dist);
        if (only !== 'still') await motionViews(page, shot, dist);
        if (flag('--matrix')) {
          // Ma trận clip: chém của ba công pháp (chiêu ô 1 và 2, giữa động tác).
          for (const mt of ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh']) {
            await gm(page, `method ${mt} 15`, 1500);
            for (const slot of [1, 2]) await slash(page, shot, dist, slot, `${mt}-${slot}`);
            await gm(page, 'killall', 1500);
          }
        }
      }
      // Dời nhân vật đi xa trước khi đóng phiên: avatar còn nằm lại một lúc, phiên giới tính sau sẽ chụp chồng lên nó.
      await gm(page, 'tp 2048 2900', 900);
      await ctx.close();
    }
  },
} satisfies Scenario;
