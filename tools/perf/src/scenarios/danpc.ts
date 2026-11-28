// Dạ Họa: ảnh nhanh để soát độ đọc NPC (nhãn + thân), vật rơi, mép sương xa và minimap ban đêm ở vài điểm.
//   pnpm shots danpc --out <thư mục> [--query style=dahoa] [--at 2048,2045;2004,2064]  (cặp x,z cách nhau dấu ;)
import path from 'node:path';
import { opt } from '../lib/env';
import { gm, skipCutscene } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { sleep } from '../lib/devserver';

export default {
  name: 'danpc',
  desc: 'Dạ Họa: ảnh soát NPC/vật rơi/mép sương/minimap ở các tọa độ',
  usage: '[--query style=dahoa] [--at 2048,2045;2004,2064]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const spots = opt('--at', '2048,2045;2004,2064;2092,2064').split(';').filter(Boolean);
    const { page: pg } = await r.open({
      name: 'DaNpc',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', 'style=dahoa'),
      seenIntro: true,
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'level 15');
    await gm(pg, 'god on');
    for (const s of spots) {
      const [x, z] = s.split(',');
      await gm(pg, `tp ${x} ${z}`, 3500);
      await skipCutscene(pg, 12);
      await gm(pg, 'killall', 1200);
      await gm(pg, 'spawn mon_soi_xam 2', 1500);
      await gm(pg, 'killall', 1500);
      await sleep(1200);
      await pg.screenshot({ path: path.join(r.out, `danpc-${x}-${z}.png`) });
    }
  },
} satisfies Scenario;
