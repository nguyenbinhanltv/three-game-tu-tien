// Nhân vật nền: v1 (Tripo, mặc định) và v2 (`?chr=v2`, MakeHuman + đầu/tóc Tripo; `v2b` = tóc B) cùng góc để so:
// cận mặt, bán thân, toàn thân ba hướng, rồi chạy, bay, đả tọa, chém, chết. Ghi draw call/tam giác vào stats.json.
import path from 'node:path';
import { list, opt, size } from '../lib/env';
import { sleep } from '../lib/devserver';
import { motionViews } from '../lib/charshots';
import { cam, gm, info } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { centerClip, snap, writeJson } from '../lib/shot';

const QUERY: Record<string, Record<string, string>> = { old: {}, v2: { chr: 'v2' }, v2b: { chr: 'v2', hair: 'b' } };
/** [tên góc, yaw, pitch, khoảng cách]. */
const STILLS: [string, number, number, number][] = [
  ['matcan', 0, 0.02, 0.9],
  ['matgan', 0, 0, 0.5],
  ['saugan', Math.PI, 0.05, 1.5],
  ['banthan', 0, 0.05, 1.9],
  ['toanthan', 0, 0.1, 3.6],
  ['nghieng', Math.PI / 2, 0.1, 3.6],
  ['sau', Math.PI, 0.1, 3.6],
];

export default {
  name: 'chrv2',
  desc: 'Nhân vật nền v1/v2 (và tóc B) cùng góc: cận mặt, bán thân, toàn thân, chuyển động; so trước/sau khi dựng lại thân, đầu, áo v2',
  usage: '[--variant old|v2|v2b|both] [--genders m,f] [--sets none,set_liet_mach,set_kinh_quang] [--only still] [--at "2048 2088"] [--size 1100x900]',
  async run(r) {
    const [vw, vh] = size('1100x900');
    const home = opt('--at', '2048 2088');
    const stats: Record<string, unknown> = {};
    for (const variant of opt('--variant', 'both') === 'both' ? ['old', 'v2'] : list('--variant', 'old')) {
      for (const g of list('--genders', 'm,f')) {
        const { ctx, page } = await r.open({ name: `Cv${variant.slice(1)}${g}`, viewport: [vw, vh], dpr: 2, quality: 'high', look: { g }, query: QUERY[variant], hide: 'hud', warnings: /models/ });
        await gm(page, 'level 12', 1600);
        await gm(page, 'god on', 1600);
        await gm(page, `tp ${home}`, 1600);
        for (const set of list('--sets', 'none,set_liet_mach,set_kinh_quang')) {
          // Cắt cùng một ô cho mọi biến thể (nhân vật luôn ở giữa màn hình).
          const shot = (view: string) => snap(page, path.join(r.out, variant), `${set}-${g}-${view}.jpg`, { clip: centerClip(vw, vh, 600, 660) });
          await gm(page, 'set off', 1700);
          if (set !== 'none') await gm(page, `set ${set}`, 2400);
          await cam(page, { yaw: 0, pitch: 0.12, dist: 3.4 });
          await sleep(900);
          const i = await info(page);
          stats[`${variant}/${set}-${g}`] = { drawCalls: i.drawCalls, triangles: i.triangles, backend: i.backend };
          // Quay mặt nhân vật về camera: đi lùi về phía camera một nhịp ngắn.
          await page.keyboard.down('KeyS');
          await sleep(600);
          await page.keyboard.up('KeyS');
          for (const [view, yaw, pitch, dist] of STILLS) {
            await cam(page, { yaw, pitch, dist });
            await sleep(1000);
            await shot(view);
          }
          if (opt('--only', 'all') !== 'still') await motionViews(page, shot, 3.6, { die: true, home });
        }
        await gm(page, 'tp 2048 2900', 900);
        await ctx.close();
      }
    }
    writeJson(r.out, 'stats.json', stats);
  },
} satisfies Scenario;
