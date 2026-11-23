// Chân Cảnh M1–M5 (pilot Lạc Kiếm Tông): ảnh tiểu cảnh camera chéo, 6 điểm × 4 thời điểm × 2 cỡ ảnh, cùng góc trước/sau, kèm số đo.
//   pnpm shots tieucanh --out <thư mục> [--tag truoc|sau] [--moods dawn,day,dusk,night] [--views 720p,1080p] [--points a,b|all] [--perf 1] [--at x,z;x,z] (tọa độ tương đối tâm)
//   `--clip 1` quay đoạn đi bộ xuyên tông môn (webm 30–60 s, `--secs`); `--hit 1` thêm khung +30 ms sau trúng đòn ở điểm đánh.
import { SECT } from '@dtl/shared';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { cam, enterLevel, faceMonster, gm, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Điểm đứng (tương đối tâm tông môn). Khớp bản đồ tiểu cảnh `docs/map/lac-kiem-tieu-canh.md`. */
export const POINTS: { name: string; x: number; z: number }[] = [
  { name: 'congbai', x: 0, z: 114 },
  { name: 'aosen', x: -60, z: 58 },
  { name: 'kiembia', x: 66, z: 58 },
  { name: 'loivach', x: -116, z: 62 },
  { name: 'cautreo', x: -150, z: 84 },
  { name: 'thachlam', x: 96, z: -8 },
];
const SIZES: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default {
  name: 'tieucanh',
  desc: 'Chân Cảnh M: ảnh tiểu cảnh Lạc Kiếm Tông (6 điểm × 4 giờ × 720p/1080p, camera chéo) + đo hiệu năng + clip đi bộ',
  usage:
    '[--tag truoc|sau] [--moods dawn,day,dusk,night] [--views 720p,1080p] [--points a,b|all] [--perf 1] [--hit 1] [--clip 1 --secs 40]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const only = list('--points', 'all');
    const extra = opt('--at', '')
      .split(';')
      .filter(Boolean)
      .map((q, i) => {
        const [x, z] = q.split(',').map(Number) as [number, number];
        return { name: `at${i}`, x, z };
      });
    const pts = [...POINTS.filter((p) => only.includes('all') || only.includes(p.name)), ...extra].filter(
      (p) => !extra.length || extra.includes(p) || flag('--with-base'),
    );
    const perf: Record<string, unknown> = {};
    for (const view of list('--views', '720p,1080p')) {
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Tc${mood[0]}${view[0]}`,
          quality: opt('--preset', 'high'),
          viewport: SIZES[view]!,
          query: { mood, cam: 'iso', quiet: 1 },
          extra: opt('--query', ''),
          seenIntro: true,
          hide: 'chat',
          warnings: true,
        });
        await gm(page, 'level 15');
        await gm(page, 'god on');
        for (const p of pts) {
          await tp(page, SECT.x + p.x, SECT.z + p.z);
          await gm(page, 'killall', 800);
          await snap(page, r.out, `${tag}-${view}-${mood}-${p.name}.png`, { wait: 2200 });
          if (flag('--perf')) perf[`${view}-${mood}-${p.name}`] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    if (flag('--hit')) {
      const view = list('--views', '720p,1080p')[0]!;
      const { ctx, page } = await r.open({
        name: 'TcHit',
        quality: 'high',
        viewport: SIZES[view]!,
        query: { cam: 'iso', quiet: 1, slowmo: 0.1 },
        extra: opt('--query', ''),
        seenIntro: true,
        hide: 'chat',
      });
      await gm(page, 'level 12', 900);
      await gm(page, 'god on', 900);
      await enterLevel(page, 'van_lam');
      await skipCutscene(page, 20);
      await tp(page, SECT.x + 4, SECT.z + 40);
      await gm(page, 'killall', 900);
      await gm(page, 'spawn mon_soi_xam 1', 3000);
      await cam(page, { pitch: 0.9, dist: 9 });
      await faceMonster(page, 'mon_soi_xam', {});
      await page.evaluate(() => (window.__game as unknown as { useSkill(n: number): void }).useSkill(0));
      await sleep(30);
      await snap(page, r.out, `${tag}-${view}-hit-30ms.png`);
      await ctx.close();
    }
    writeJson(r.out, `perf-${tag}.json`, perf);
    void num;
  },
} satisfies Scenario;
