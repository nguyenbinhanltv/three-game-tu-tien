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
  usage: '[--styles off,painted] [--views 720p,1080p] [--spots cong,thach_vien,ho|none] [--fly 9.5,5] [--no-fly]',
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
          query: { mood: 'day', quiet: 1, style: style === 'painted' ? 'painted' : undefined, far: style === 'painted' ? 1 : undefined },
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
        // Ngự kiếm trên sân tông môn: chân trời lộ ra, vùng xa hiện rõ; đo có/không vòm (mesh.visible) để biết chi phí
        await tp(page, 2048, 2100);
        await gm(page, 'killall', 1200);
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(style === 'painted' ? 16000 : 4500);
        const ready = await page.evaluate(
          () => (window.__game as unknown as { farBackdrop?: { ready: boolean } | null }).farBackdrop?.ready ?? null,
        );
        await snap(page, r.out, `${style}-${view}-ngukiem.png`);
        perf[`${style}-${view}-ngukiem`] = { ...((await perfSample(page)) as object), farReady: ready };
        if (style === 'painted') {
          await page.evaluate(() => {
            const g = window.__game as unknown as { farBackdrop?: { mesh: { visible: boolean } } | null };
            if (g.farBackdrop) g.farBackdrop.mesh.visible = false;
          });
          await sleep(1500);
          await snap(page, r.out, `${style}-${view}-ngukiem-novom.png`);
          perf[`${style}-${view}-ngukiem-novom`] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    // Ngự kiếm ở nhiều mức pitch camera vista (?vistafly=độ, chỉ có tác dụng với ?far=1): để chọn mức trung gian
    if (list('--styles', 'off,painted').includes('painted') && !process.argv.includes('--no-fly')) {
      for (const pitch of list('--fly', '9.5,5')) {
        const { ctx, page } = await r.open({
          name: `PVf${pitch}`,
          quality: opt('--preset', 'high'),
          viewport: VIEWS['1080p']!,
          query: { mood: 'day', quiet: 1, style: 'painted', far: 1, vistafly: pitch },
          seenIntro: true,
          warnings: true,
        });
        await gm(page, 'level 15', 2500);
        await gm(page, 'god on', 2500);
        await tp(page, 2048, 2100);
        await gm(page, 'killall', 1200);
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(6000);
        await snap(page, r.out, `painted-1080p-ngukiem-p${pitch}.png`);
        perf[`painted-1080p-ngukiem-p${pitch}`] = await perfSample(page);
        await ctx.close();
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
