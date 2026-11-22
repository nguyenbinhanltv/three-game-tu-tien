// TN-7: ảnh duyệt Thiên Lộ Giới (chương 7 Cửu Kiều), cùng góc máy, 4 thời điểm, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots cuukieu --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1]
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
  { name: 'kieudau', stand: [1024, 1500], eye: [1000, 10, 1570], at: [1024, 12, 1400], fov: 60 },
  { name: 'duongtruc', stand: [1024, 1300], eye: [1000, 14, 1400], at: [1024, 16, 1130], fov: 62 },
  { name: 'duongmay', stand: [724, 1084], eye: [770, 8, 1160], at: [690, 6, 1010], fov: 60 },
  { name: 'bialo', stand: [1324, 1084], eye: [1290, 9, 1160], at: [1360, 10, 1010], fov: 60 },
  { name: 'bacCuoi', stand: [1024, 640], eye: [1000, 12, 720], at: [1024, 18, 560], fov: 58 },
  { name: 'boss', stand: [854, 554], eye: [900, 9, 640], at: [850, 8, 540], fov: 58 },
  { name: 'chuoiCau', stand: [1100, 560], eye: [1090, 24, 565], at: [1190, 52, 210], fov: 64 },
  { name: 'thac', stand: [380, 590], eye: [270, -22, 520], at: [371, 6, 584], fov: 66 },
  { name: 'toanCanh', stand: [1024, 1300], eye: [1100, 34, 1580], at: [1000, 14, 1000], fov: 58 },
];

export default {
  name: 'cuukieu',
  desc: 'TN-7: ảnh Thiên Lộ Giới (7 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--tag <nhãn>]',
  async run(r) {
    const tag = opt('--tag', 'ck');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Ck${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 44');
        await gm(page, 'god on');
        await enterLevel(page, 'cuu_kieu');
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
