// MAP-4 "Ngự Cảnh Thiên Địa": ảnh trước/sau Thiên Khuyết Cổ Thành, cùng góc máy, 4 thời điểm, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots thienkhuyet --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// Mẫu từ `lackiem` (camera tự do `__game.freeCam`, chỉ có tác dụng khi URL có `?debug=1`). Toạ độ thế giới tuyệt đối (mặt bằng chơi cao y = 80).
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { enterLevel, gm, hideUi, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  eye: [number, number, number];
  at: [number, number, number];
  fov?: number;
}

/** Sáu góc cố định. */
export const VIEWS: View[] = [
  { name: 'tram', eye: [1024, 90, 1110], at: [1030, 96, 800], fov: 58 },
  { name: 'dailo', eye: [1030, 86, 760], at: [1043, 104, 330], fov: 58 },
  { name: 'quangtruong', eye: [1044, 90, 560], at: [1044, 112, 244], fov: 60 },
  { name: 'cong', eye: [1100, 84, 380], at: [1044, 104, 236], fov: 55 },
  { name: 'trencao', eye: [1300, 280, 900], at: [1040, 90, 380], fov: 56 },
  { name: 'phongxa', eye: [1024, 140, 1180], at: [1024, 330, -300], fov: 66 },
];

const SPOT: [number, number] = [1024, 1036];

export default {
  name: 'thienkhuyet',
  desc: 'MAP-4: ảnh trước/sau Thiên Khuyết (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay quanh',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--video 1] [--secs 45] [--tag truoc|sau]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    const setCam = (page: import('playwright').Page, v: View) =>
      page.evaluate((a) => {
        window.__game!.freeCam = { x: a.eye[0], y: a.eye[1], z: a.eye[2], tx: a.at[0], ty: a.at[1], tz: a.at[2], fov: a.fov };
      }, v);
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Tk${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 27');
        await gm(page, 'god on');
        await enterLevel(page, 'thien_khuyet');
        await gm(page, 'killall', 1200);
        for (const v of views) {
          await tp(page, SPOT[0], SPOT[1]);
          await gm(page, 'killall', 600);
          await setCam(page, v);
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
      const { page, ctx } = await r.open({
        name: 'TkVid',
        quality: preset,
        viewport: [1920, 1080],
        query: { mood: opt('--vmood', 'dusk') },
        video: dir,
        seenIntro: true,
      });
      await gm(page, 'level 27');
      await gm(page, 'god on');
      await enterLevel(page, 'thien_khuyet');
      await gm(page, 'killall', 1000);
      await skipCutscene(page, 10);
      await hideUi(page, 'hud');
      await tp(page, SPOT[0], SPOT[1]);
      const secs = num('--secs', 45);
      const t0 = Date.now();
      // Bay dọc đại lộ lên Điện Tiền rồi quanh cổng Thần Tàng Điện (z 1036 → 244), cao 12 → 60 → 30 m, lắc nhẹ sang hai bên.
      while ((Date.now() - t0) / 1000 < secs) {
        const u = (Date.now() - t0) / 1000 / secs;
        const z = 1100 - u * 840;
        const x = 1030 + Math.sin(u * Math.PI * 3) * 60;
        const h = 90 + 40 * Math.sin(u * Math.PI);
        await page.evaluate(
          (c) => {
            window.__game!.freeCam = { x: c.x, y: c.h, z: c.z, tx: 1044, ty: 110, tz: c.z - 260, fov: 60 };
          },
          { x, z, h },
        );
        await sleep(100);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${tag}-bay-doc.webm`));
    }
  },
} satisfies Scenario;
