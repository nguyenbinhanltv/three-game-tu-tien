// MAP-3 "Ngự Cảnh Thiên Địa": ảnh trước/sau Vân Hải Phù Đảo, cùng góc máy, 4 thời điểm trong ngày, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots vanhai --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// `?mood=` đổi thời điểm. `--video 1` quay một vòng bay quanh Phù Đảo Các (webm, ~45 s). Chạy ở bản main để có ảnh "trước" (main không có `dusk` riêng, lấy sắc bình minh).
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { enterLevel, gm, hideUi, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Mắt máy và điểm nhìn: x/z tương đối Phù Đảo Các (HUB), y tuyệt đối (mặt đảo ~124 m, biển mây ~60 m). */
  eye: [number, number, number];
  at: [number, number, number];
  fov?: number;
  /** Giây đồng hồ của `vanHaiWow` (thuyền, cá kình) cố định khi chụp, để cá nằm trong khung; ảnh "trước" không có các vật này. */
  wow?: number;
}

/** Tâm Phù Đảo Các (khớp `islands[0]` ở `van_hai.terrain.json`). */
const HUB = { x: 1024, z: 1024, y: 124 };

/** Sáu góc máy cố định (camera tự do `__game.freeCam`, chỉ có tác dụng khi URL có `?debug=1`): không bị địa hình đẩy camera. */
export const VIEWS: View[] = [
  { name: 'hub', wow: 200, eye: [0, 134, 70], at: [0, 128, -10], fov: 58 },
  { name: 'bienmay', wow: 569, eye: [-120, 150, 30], at: [-500, 100, 140], fov: 64 },
  { name: 'cau', wow: 300, eye: [-70, 132, 30], at: [-150, 126, 60], fov: 60 },
  { name: 'tungdai', wow: 450, eye: [-380, 150, 170], at: [-360, 130, 168], fov: 62 },
  { name: 'trencao', wow: 700, eye: [420, 330, -300], at: [-40, 110, 60], fov: 58 },
  { name: 'laucanh', wow: 100, eye: [70, 205, -400], at: [6, 195, -694], fov: 62 },
  { name: 'kinh', wow: 569, eye: [0, 150, 0], at: [-672, 345, 198], fov: 62 },
  { name: 'phongxa', wow: 914, eye: [0, 140, -60], at: [-500, 120, -700], fov: 66 },
];

export default {
  name: 'vanhai',
  desc: 'MAP-3: ảnh trước/sau Vân Hải (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay quanh',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--video 1] [--secs 45] [--tag truoc|sau]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Vh${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 27');
        await gm(page, 'god on');
        await enterLevel(page, 'van_hai');
        await gm(page, 'killall', 1200);
        for (const v of views) {
          await tp(page, HUB.x, HUB.z + 40);
          await gm(page, 'killall', 600);
          await page.evaluate(
            (a) => {
              window.__game!.vanHaiWow?.freeze(a.v.wow ?? null);
              window.__game!.freeCam = {
                x: a.s[0] + a.v.eye[0],
                y: a.v.eye[1],
                z: a.s[2] + a.v.eye[2],
                tx: a.s[0] + a.v.at[0],
                ty: a.v.at[1],
                tz: a.s[2] + a.v.at[2],
                fov: a.v.fov,
              };
            },
            { s: [HUB.x, HUB.y, HUB.z], v },
          );
          if (flag('--probe')) {
            console.log(
              JSON.stringify(
                await page.evaluate(() =>
                  window.__game!.vanHaiWow?.group.children.map((c) => [
                    c.name,
                    c.geometry?.attributes.position.count,
                    c.count,
                    c.visible,
                    c.position.x | 0,
                    c.position.y | 0,
                    c.position.z | 0,
                  ]),
                ),
              ),
            );
          }
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
        name: 'VhVid',
        quality: preset,
        viewport: [1920, 1080],
        query: { mood: opt('--vmood', 'dawn') },
        video: dir,
        seenIntro: true,
      });
      await gm(page, 'level 27');
      await gm(page, 'god on');
      await enterLevel(page, 'van_hai');
      await gm(page, 'killall', 1000);
      await skipCutscene(page, 10);
      await hideUi(page, 'hud');
      await tp(page, HUB.x, HUB.z + 40);
      const secs = num('--secs', 45);
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < secs) {
        const u = (Date.now() - t0) / 1000 / secs;
        // Một vòng quanh Phù Đảo Các: bán kính 150 → 480 → 200 m, cao hơn mặt đảo 12 → 110 → 20 m, nhìn vào tâm đảo.
        const R = 150 + 330 * Math.sin(u * Math.PI) - 100 * u;
        const h = 12 + 98 * Math.sin(u * Math.PI);
        const a = u * Math.PI * 2 + Math.PI;
        await page.evaluate(
          (c) => {
            window.__game!.freeCam = {
              x: c.x + Math.sin(c.a) * c.R,
              y: c.y + c.h,
              z: c.z + Math.cos(c.a) * c.R,
              tx: c.x,
              ty: c.y + 6,
              tz: c.z,
              fov: 58,
            };
          },
          { x: HUB.x, y: HUB.y, z: HUB.z, a, R, h },
        );
        await sleep(100);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${tag}-bay-quanh.webm`));
    }
  },
} satisfies Scenario;
