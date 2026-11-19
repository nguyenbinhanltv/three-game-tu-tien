// MAP-2 "Ngũ Cảnh Thiên Địa": ảnh trước/sau Đoạn Mạch Cổ Cốc, cùng góc máy, 4 thời điểm, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots doanmach --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// Camera tự do `__game.freeCam` (cần `?debug=1`, do lib/shot bật). Toạ độ góc máy là thế giới (x, z); độ cao = địa hình + `dy`.
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from '@dtl/content';
import { terrainOf } from '@dtl/shared';
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

/** Sáu góc máy: trạm, đường ra bia mạch, vực cầu đá gãy, mộ cổ, vách đứt mạch, toàn cảnh. `eye/at` = [x, dy, z]. */
export const VIEWS: View[] = [
  { name: 'tram', eye: [1024, 6, 1070], at: [1024, 10, 980], fov: 56 },
  { name: 'machtinh', eye: [1240, 5, 1150], at: [1279, 9, 1199], fov: 58 },
  { name: 'cauda', eye: [1470, 8, 1010], at: [1504, 6, 974], fov: 60 },
  { name: 'congmo', eye: [630, 6, 980], at: [584, 10, 944], fov: 58 },
  { name: 'vachdut', eye: [1030, 10, 540], at: [1044, 40, 484], fov: 60 },
  { name: 'toancanh', eye: [1500, 160, 1560], at: [950, 20, 950], fov: 58 },
];

const eyeAt = (v: View, p: 'eye' | 'at') => {
  const t = terrainOf(LEVELS.doan_mach!);
  const [x, dy, z] = v[p];
  return { x, y: t.heightAt(x, z) + dy, z };
};

export default {
  name: 'doanmach',
  desc: 'MAP-2: ảnh trước/sau Đoạn Mạch (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--video 1] [--secs 45] [--tag truoc|sau]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    const cam = (page: import('playwright').Page, v: View) => {
      const e = eyeAt(v, 'eye');
      const a = eyeAt(v, 'at');
      return page.evaluate(
        (c) => {
          window.__game!.freeCam = { x: c.e.x, y: c.e.y, z: c.e.z, tx: c.a.x, ty: c.a.y, tz: c.a.z, fov: c.fov };
        },
        { e, a, fov: v.fov },
      );
    };
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Dm${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 27');
        await gm(page, 'god on');
        await enterLevel(page, 'doan_mach');
        await gm(page, 'killall', 1200);
        for (const v of views) {
          await tp(page, v.eye[0], v.eye[2]);
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
      const { page, ctx } = await r.open({
        name: 'DmVid',
        quality: preset,
        viewport: [1920, 1080],
        query: { mood: opt('--vmood', 'dusk') },
        video: dir,
        seenIntro: true,
      });
      await gm(page, 'level 27');
      await gm(page, 'god on');
      await enterLevel(page, 'doan_mach');
      await gm(page, 'killall', 1000);
      await skipCutscene(page, 10);
      await hideUi(page, 'hud');
      await tp(page, 1024, 1060);
      const secs = num('--secs', 45);
      const t = terrainOf(LEVELS.doan_mach!);
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < secs) {
        const u = (Date.now() - t0) / 1000 / secs;
        // Một vòng quanh trạm trung tâm: bán kính 160 → 420 → 200 m, độ cao 20 → 110 → 30 m.
        const R = 200 + 220 * Math.sin(u * Math.PI) - 40 * u;
        const h = 20 + 90 * Math.sin(u * Math.PI);
        const a = u * Math.PI * 2;
        const x = 1024 + Math.sin(a) * R;
        const z = 1024 + Math.cos(a) * R;
        await page.evaluate(
          (c) => {
            window.__game!.freeCam = { x: c.x, y: c.y, z: c.z, tx: 1024, ty: c.ty, tz: 1024, fov: 58 };
          },
          { x, z, y: t.heightAt(x, z) + h, ty: t.heightAt(1024, 1024) + 15 },
        );
        await sleep(100);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${tag}-bay-quanh.webm`));
    }
  },
} satisfies Scenario;
