// Camera mở tầm nhìn (PR #625): ảnh trước (`?vista=0`) / sau (mặc định) ở 3 điểm ngắm cảnh Vân Lam và khi ngự kiếm, 720p/1080p, kèm draw call/tam giác/ms khung.
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, perfSample, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Khớp `VISTA_SPOTS` ở apps/client/src/game/camera/vista.ts (không import xuyên gói). */
const VISTA_SPOTS = [
  { id: 'cong', x: 2048, z: 1730 },
  { id: 'thach_vien', x: 2450, z: 1760 },
  { id: 'ho', x: 1490, z: 2230 },
];
const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default {
  name: 'vista',
  desc: 'Camera mở tầm nhìn: ảnh trước/sau ở điểm ngắm cảnh Vân Lam + ngự kiếm, 720p/1080p, số đo khung',
  usage: '[--views 720p,1080p] [--modes before,after]',
  async run(r) {
    const perf: Record<string, unknown> = {};
    for (const view of list('--views', '720p,1080p')) {
      for (const mode of list('--modes', 'before,after')) {
        const { page } = await r.open({
          name: `Vista${view[0]}${mode[0]}`,
          renderer: opt('--renderer', 'webgpu'),
          viewport: VIEWS[view]!,
          extra: mode === 'before' ? 'vista=0' : '',
          seenIntro: true,
        });
        const stem = `${mode}-${view}`;
        await gm(page, 'level 15');
        await gm(page, 'god on');
        for (const s of VISTA_SPOTS) {
          await tp(page, s.x, s.z);
          await gm(page, 'killall', 1200);
          await sleep(3500);
          await snap(page, r.out, `${stem}-${s.id}.png`);
          perf[`${stem}-${s.id}`] = await perfSample(page);
        }
        // Ngự kiếm: bay lên ở sân Lạc Kiếm Tông (không quái), chờ camera mở hết cỡ rồi chụp + đo.
        await tp(page, 2048, 2100);
        await gm(page, 'killall', 1200);
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(4500);
        await snap(page, r.out, `${stem}-ngukiem.png`);
        perf[`${stem}-ngukiem`] = await perfSample(page);
        await page.close();
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
