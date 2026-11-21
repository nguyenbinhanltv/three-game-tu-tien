// TN-3: ảnh duyệt Vấn Đỉnh Âm Dương Giới, cùng góc máy, 4 thời điểm, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots vandinh --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1]
// Camera tự do `__game.freeCam` (URL có `?debug=1`): góc máy cố định theo toạ độ thế giới. Cao độ eye/at tính tương đối mặt đất tại điểm đứng.
import { flag, list, opt } from '../lib/env';
import { enterLevel, gm, perfSample, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Điểm đứng để máy chủ nạp ô địa hình quanh đó (toạ độ thế giới). */
  stand: [number, number];
  eye: [number, number, number];
  at: [number, number, number];
  fov?: number;
}

export const VIEWS: View[] = [
  { name: 'conggioi', stand: [1024, 1500], eye: [1000, 10, 1570], at: [1024, 12, 1380], fov: 60 },
  { name: 'ho', stand: [724, 1254], eye: [770, 8, 1330], at: [690, 6, 1190], fov: 60 },
  { name: 'rungre', stand: [694, 794], eye: [720, 9, 860], at: [660, 10, 740], fov: 60 },
  { name: 'dinh', stand: [1024, 554], eye: [1000, 12, 640], at: [1024, 18, 500], fov: 58 },
  { name: 'ranh', stand: [1024, 640], eye: [990, 14, 660], at: [1210, 10, 620], fov: 64 },
  { name: 'dongkho', stand: [1354, 794], eye: [1330, 9, 860], at: [1400, 10, 740], fov: 60 },
  { name: 'giotri', stand: [1324, 1254], eye: [1290, 9, 1330], at: [1360, 10, 1200], fov: 60 },
];

export default {
  name: 'vandinh',
  desc: 'TN-3: ảnh Vấn Đỉnh Âm Dương Giới (7 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--tag <nhãn>]',
  async run(r) {
    const tag = opt('--tag', 'vd');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Vd${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 36');
        await gm(page, 'god on');
        await enterLevel(page, 'van_dinh');
        for (const v of views) {
          await tp(page, v.stand[0], v.stand[1]);
          await gm(page, 'killall', 600);
          await page.evaluate(
            (a) => {
              const g0 = window.__game!.renderPos.y;
              window.__game!.freeCam = {
                x: a.v.eye[0],
                y: g0 + a.v.eye[1],
                z: a.v.eye[2],
                tx: a.v.at[0],
                ty: g0 + a.v.at[1],
                tz: a.v.at[2],
                fov: a.v.fov,
              };
            },
            { v },
          );
          const stem = `${tag}-${viewport[1]}p-${mood}-${v.name}`;
          await snap(page, r.out, `${stem}.png`, { wait: settleMs() });
          if (flag('--perf') && viewport[1] === 1080) perf[stem] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    if (Object.keys(perf).length) writeJson(r.out, `perf-${tag}.json`, perf);
  },
} satisfies Scenario;
