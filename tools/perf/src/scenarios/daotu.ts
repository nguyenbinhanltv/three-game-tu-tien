// Đao tu: đao lớn thủ tục trên nhân vật v3 (mặc bộ Địa Long Hộ Giáp), cùng góc máy 720p + 1080p: đao trên lưng (nghỉ) và đao
// cầm tay (vừa ra đòn) ở trước/trái/sau/ba phần tư/cận tay, rồi HUD với thanh Khí thế. Ra `<out>/daotu-<giới>-<góc>-<720p|1080p>.png`.
// Dùng: pnpm shots daotu --out <thư mục tuyệt đối> [--genders m,f] [--method liet_nhan_dao_kinh]
import fs from 'node:fs';
import path from 'node:path';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, perfSample } from '../lib/game';
import type { Scenario } from '../lib/scenario';

export default {
  name: 'daotu',
  desc: 'Đao tu: đao lớn thủ tục trên nhân vật v3, đao lưng + đao cầm tay nhiều góc + HUD Khí thế ở 720p/1080p',
  usage: '--out <dir> [--genders m,f] [--method <công pháp>]',
  async run(r) {
    const method = opt('--method', 'liet_nhan_dao_kinh');
    for (const g of list('--genders', 'm,f')) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `D${g}`,
        viewport: [1280, 720],
        quality: 'high',
        look: { g },
        query: { chr: 'v3' },
        hide: 'hud',
        warnings: /models|chr_v3|clip/,
      });
      await gm(page, 'level 12', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'set set_dia_giap', 1500);
      await gm(page, `method ${method} 5`, 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      await page.evaluate(() => {
        const gm_ = window.__game!;
        gm_.ents.players.get(gm_.sid).model.root.remove(gm_.ents.players.get(gm_.sid).label);
      });
      // Đo draw call/tam giác cùng khung: Đao tu (đao lớn) so với Kiếm tu (kiếm), nhân vật gần camera (LOD0).
      await cam(page, { yaw: 0, pitch: 0.06, dist: 3.6 });
      const withGear = await perfSample(page);
      await gm(page, 'method lac_kiem_quyet 5', 1200);
      const noGear = await perfSample(page);
      console.log(
        `[shots:daotu] ${gname}: Đao tu draw ${withGear.drawCalls} / tam giác ${withGear.triangles}; Kiếm tu draw ${noGear.drawCalls} / tam giác ${noGear.triangles}`,
      );
      await gm(page, `method ${method} 5`, 1200);
      const facing = await page.evaluate(() => window.__game!.facing as number);
      for (const [size, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
        await page.setViewportSize({ width: w, height: h });
        for (const drawn of [false, true]) {
          for (const [nm, yaw, pitch, dist] of [
            ['truoc', 0, 0.06, 3.0],
            ['trai', -1.5708, 0.06, 3.0],
            ['sau', 3.1416, 0.06, 3.0],
            ['ba-phan-tu', 0.7, 0.1, 3.0],
            ['tay', -0.8, -0.05, 1.7],
            ['can-sau', 3.1416, 0.1, 1.35],
            ['can-trai', -1.5708, -0.02, 1.4],
            ['can-phai', 1.5708, -0.02, 1.4],
          ] as const) {
            await cam(page, { yaw: facing + yaw, pitch, dist });
            // đao cầm tay: ra đòn rồi chụp ngay (đao rút khi giao chiến, tra lại sau vài giây)
            if (drawn) await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.attack());
            // đao cầm tay: chờ đòn đánh xong, nhân vật về tư thế giao chiến (Sword_Idle) để thấy tay nắm chuôi
            await sleep(drawn ? 1500 : 900);
            fs.writeFileSync(path.join(r.out, `daotu-${gname}-${drawn ? 'cam' : 'lung'}-${nm}-${size}.png`), await page.screenshot());
          }
        }
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
