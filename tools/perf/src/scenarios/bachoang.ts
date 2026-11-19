// MAP-5 "Ngũ Cảnh Thiên Địa" — Bắc Hoang: ảnh trước/sau cùng góc máy, 4 thời điểm, hai cỡ ảnh, kèm số đo hiệu năng và video bay.
//   pnpm shots bachoang --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// Camera tự do `__game.freeCam` (URL có `?debug=1`): góc máy cố định theo toạ độ thế giới, không bị địa hình đẩy.
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { enterLevel, gm, perfSample, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Điểm đứng để máy chủ nạp ô địa hình quanh đó, mắt máy và điểm nhìn (toạ độ thế giới; y tuyệt đối). */
  stand: [number, number];
  eye: [number, number, number];
  at: [number, number, number];
  fov?: number;
}

export const VIEWS: View[] = [
  { name: 'tram', stand: [1024, 1540], eye: [1024, 88, 1600], at: [1024, 78, 1400], fov: 58 },
  { name: 'khich', stand: [1024, 960], eye: [1000, 84, 1010], at: [1024, 66, 860], fov: 60 },
  { name: 'khoc', stand: [834, 1340], eye: [900, 80, 1420], at: [760, 74, 1220], fov: 58 },
  { name: 'tragioi', stand: [1084, 600], eye: [1060, 84, 650], at: [1084, 76, 540], fov: 56 },
  { name: 'trencao', stand: [1024, 900], eye: [1180, 190, 1180], at: [1024, 70, 700], fov: 58 },
  { name: 'phongbac', stand: [1024, 420], eye: [1024, 90, 480], at: [1024, 120, 120], fov: 64 },
];

export default {
  name: 'bachoang',
  desc: 'MAP-5: ảnh trước/sau Bắc Hoang (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay',
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
          name: `Bh${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 30');
        await gm(page, 'god on');
        await enterLevel(page, 'bac_hoang');
        for (const v of views) {
          await tp(page, v.stand[0], v.stand[1]);
          await gm(page, 'killall', 600);
          await page.evaluate(
            (a) => {
              window.__game!.freeCam = {
                x: a.v.eye[0],
                y: a.v.eye[1],
                z: a.v.eye[2],
                tx: a.v.at[0],
                ty: a.v.at[1],
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
    if (flag('--video')) {
      const dir = path.join(r.out, 'video');
      fs.mkdirSync(dir, { recursive: true });
      const { ctx, page } = await r.open({
        name: 'BhVideo',
        quality: preset,
        viewport: [1280, 720],
        query: { mood: opt('--vmood', 'dusk') },
        seenIntro: true,
        hide: 'hud',
        video: dir,
      });
      await gm(page, 'level 30');
      await gm(page, 'god on');
      await enterLevel(page, 'bac_hoang');
      await tp(page, 1024, 960);
      const secs = num('--secs', 45);
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < secs) {
        const a = ((Date.now() - t0) / 1000 / secs) * Math.PI * 2;
        await page.evaluate((k) => {
          window.__game!.freeCam = { x: 1024 + Math.cos(k) * 190, y: 96, z: 900 + Math.sin(k) * 190, tx: 1024, ty: 70, tz: 900, fov: 60 };
        }, a);
        await sleep(100);
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
