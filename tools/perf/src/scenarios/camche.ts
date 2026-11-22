// Cấm chế sư: cờ trận cầm tay (lưng/tay) + bốn kiểu trận trên đất (sát, khốn, hộ, sinh tử) trên nhân vật v3, cùng góc máy 720p + 1080p.
// Trận bơm thẳng tin S.FX `tran_<kiểu>` (giống server gửi) quanh nhân vật. Ra `<out>/camche-<giới>-<cảnh>-<720p|1080p>.png`.
// Dùng: pnpm shots camche --out <thư mục tuyệt đối> [--genders m,f] [--method cam_che_kinh]
import fs from 'node:fs';
import path from 'node:path';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

export default {
  name: 'camche',
  desc: 'Cấm chế sư: cờ trận cầm tay + bốn kiểu trận trên đất trên nhân vật v3 ở 720p/1080p',
  usage: '--out <dir> [--genders m,f] [--method <công pháp>]',
  async run(r) {
    const method = opt('--method', 'cam_che_kinh');
    for (const g of list('--genders', 'm,f')) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `K${g}`,
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
      const facing = await page.evaluate(() => window.__game!.facing as number);
      for (const [size, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
        await page.setViewportSize({ width: w, height: h });
        // cờ trận: trên lưng (nghỉ) và cầm tay (vừa ra đòn)
        for (const drawn of [false, true]) {
          for (const [nm, yaw, pitch, dist] of [
            ['truoc', 0, 0.06, 3.0],
            ['sau', 3.1416, 0.06, 3.0],
            ['tay', -0.8, -0.05, 1.7],
          ] as const) {
            await cam(page, { yaw: facing + yaw, pitch, dist });
            if (drawn) await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.attack());
            await sleep(drawn ? 1500 : 900);
            fs.writeFileSync(path.join(r.out, `camche-${gname}-${drawn ? 'cam' : 'lung'}-${nm}-${size}.png`), await page.screenshot());
          }
        }
        // bốn kiểu trận: đặt dưới chân hoặc trước mặt, nhìn từ sau-trên (góc chơi thường) và từ trên cao
        for (const [mode, rad, ahead] of [
          ['sat', 9, false],
          ['khon', 5, true],
          ['ho', 6, false],
          ['sinhtu', 7, false],
        ] as const) {
          await page.evaluate(
            ([m, rr, a]) => {
              const gm_ = window.__game!;
              const me = gm_.ents.players.get(gm_.sid);
              const x = me.x + (a ? Math.sin(gm_.facing) * 4 : 0);
              const z = me.z + (a ? Math.cos(gm_.facing) * 4 : 0);
              void gm_.onFx({ t: `tran_${m}`, src: gm_.sid, x, y: me.y, z, r: rr, d: 10 });
            },
            [mode, rad, ahead] as const,
          );
          await sleep(1200);
          for (const [nm, yaw, pitch, dist] of [
            ['sau', 3.1416, 0.2, 5.5],
            ['cao', 3.1416, 0.9, 12],
          ] as const) {
            await cam(page, { yaw: facing + yaw, pitch, dist });
            await sleep(500);
            fs.writeFileSync(path.join(r.out, `camche-${gname}-tran-${mode}-${nm}-${size}.png`), await page.screenshot());
          }
          await page.evaluate(
            (m) =>
              void window.__game!.onFx({
                t: `tran_tick_${m}`,
                src: window.__game!.sid,
                x: window.__game!.ents.players.get(window.__game!.sid).x,
                z: window.__game!.ents.players.get(window.__game!.sid).z,
                r: 6,
              }),
            mode,
          );
          await sleep(4000);
        }
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
