// MAP-1 "Ngự Cảnh Thiên Địa": ảnh trước/sau Lạc Kiếm Tông, cùng góc máy, 4 thời điểm trong ngày, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots lackiem --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// `?mood=` đổi thời điểm; level chưa có `dusk` riêng thì lấy sắc bình minh. `--video 1` quay một vòng bay quanh tông môn (webm, ~45 s).
import fs from 'node:fs';
import path from 'node:path';
import { SECT } from '@dtl/shared';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { cam, gm, hideUi, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  dist: number;
}

/** Quy ước yaw (xem points.ts): 0 nhìn về bắc (-z), π nhìn về nam, -π/2 nhìn về tây, π/2 về đông. */
export const VIEWS: View[] = [
  { name: 'cong', x: SECT.x, z: SECT.z + 90, yaw: 0, pitch: 0.2, dist: 14 },
  { name: 'san', x: SECT.x, z: SECT.z + 30, yaw: 0, pitch: 0.16, dist: 12 },
  { name: 'nang', x: SECT.x - 40, z: SECT.z + 20, yaw: 2.2, pitch: 0.3, dist: 14 },
  { name: 'tay', x: SECT.x + 70, z: SECT.z + 10, yaw: -1.2, pitch: 0.22, dist: 16 },
  { name: 'sondao', x: SECT.x, z: SECT.z + 250, yaw: 0, pitch: 0.25, dist: 16 },
  { name: 'rung', x: 2300, z: 2090, yaw: -1.57, pitch: 0.2, dist: 16 },
  { name: 'trencao', x: 2200, z: 2250, yaw: 0, pitch: 1.2, dist: 700 },
];

export default {
  name: 'lackiem',
  desc: 'MAP-1: ảnh trước/sau Lạc Kiếm Tông (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay quanh',
  usage: '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--video 1] [--secs 45] [--tag truoc|sau]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({ name: `Lk${mood[0]}${viewport[1]}`, quality: preset, viewport, query: { mood }, seenIntro: true, hide: 'hud', warnings: true });
        await gm(page, 'level 15');
        await gm(page, 'god on');
        await gm(page, 'killall', 1200);
        for (const v of views) {
          await tp(page, v.x, v.z);
          await gm(page, 'killall', 600);
          await cam(page, v);
          const stem = `${tag}-${viewport[1]}p-${mood}-${v.name}`;
          await snap(page, r.out, `${stem}.png`, { wait: settleMs() });
          if (flag('--perf') && viewport[1] === 1080) perf[stem] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    if (flag('--perf')) writeJson(r.out, `perf-${tag}-${preset}.json`, perf);
    if (flag('--video')) {
      const dir = path.join(r.out, 'video');
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({ name: 'LkVid', quality: preset, viewport: [1920, 1080], query: { mood: opt('--vmood', 'dawn') }, video: dir, seenIntro: true });
      await gm(page, 'level 15');
      await gm(page, 'god on');
      await gm(page, 'killall', 1000);
      await skipCutscene(page, 10);
      await hideUi(page, 'hud');
      await tp(page, SECT.x, SECT.z + 40);
      const secs = num('--secs', 45);
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < secs) {
        const t = (Date.now() - t0) / 1000;
        // Vòng quanh tông môn, dần xa ra rồi lên cao: yaw quay đủ một vòng.
        await cam(page, { yaw: (t / secs) * Math.PI * 2, pitch: 0.18 + 0.5 * Math.sin((t / secs) * Math.PI), dist: 14 + 90 * Math.sin((t / secs) * Math.PI) });
        await sleep(100);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${tag}-bay-quanh.webm`));
    }
  },
} satisfies Scenario;
