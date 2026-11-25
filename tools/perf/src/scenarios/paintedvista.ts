// Họa Cảnh P3: vùng xa nướng một lần ở điểm ngắm cảnh Vân Lam (camera mở tầm nhìn #625): ảnh mặc định | ?style=painted + số đo.
//   pnpm shots paintedvista --out <thư mục tuyệt đối> [--styles off,painted] [--views 720p,1080p] [--spots cong,thach_vien,ho]
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, perfSample, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Khớp `VISTA_SPOTS` ở apps/client/src/game/camera/vista.ts (không import xuyên gói). */
const SPOTS = [
  { id: 'cong', x: 2048, z: 1730 },
  { id: 'thach_vien', x: 2450, z: 1760 },
  { id: 'ho', x: 1490, z: 2230 },
];
const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default {
  name: 'paintedvista',
  desc: 'Họa Cảnh P3: vùng xa (núi nướng một lần) ở điểm ngắm cảnh Vân Lam, mặc định | painted, 720p/1080p + số đo',
  usage: '[--styles off,painted] [--views 720p,1080p] [--spots cong,thach_vien,ho]',
  async run(r) {
    const only = list('--spots', 'all');
    const spots = SPOTS.filter((s) => only.includes('all') || only.includes(s.id));
    const perf: Record<string, unknown> = {};
    for (const style of list('--styles', 'off,painted')) {
      for (const view of list('--views', '1080p')) {
        const { ctx, page } = await r.open({
          name: `PV${style[0]}${view[0]}`,
          quality: opt('--preset', 'high'),
          viewport: VIEWS[view]!,
          query: { mood: 'day', quiet: 1, style: style === 'painted' ? 'painted' : undefined },
          seenIntro: true,
          warnings: true,
        });
        await gm(page, 'level 15', 2500);
        await gm(page, 'god on', 2500);
        for (const s of spots) {
          await tp(page, s.x, s.z);
          await gm(page, 'killall', 1200);
          // lần nướng vùng xa chia qua nhiều khung (worker CPU + 96 lát GPU): chờ đủ
          await sleep(style === 'painted' ? 14000 : 3500);
          await snap(page, r.out, `${style}-${view}-${s.id}.png`);
          perf[`${style}-${view}-${s.id}`] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
