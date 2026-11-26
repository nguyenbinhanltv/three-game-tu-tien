// Họa Cảnh (`?style=painted`): ảnh so sánh mặc định | painted cùng điểm, cùng góc camera chéo, kèm số đo draw call/khung.
//   pnpm shots painted --out <thư mục tuyệt đối> [--level <id>] [--moods day,night] [--views 720p,1080p] [--points a,b|all] [--styles off,painted] [--preset high] [--renderer webgpu|webgl2]
// Ảnh: <style>-<view>-<mood>-<điểm>.png; số đo: perf.json (drawCalls, triangles, textures, frameMs, heapMB mỗi điểm).
import { sleep } from '../lib/devserver';
import { list, num, opt } from '../lib/env';
import { enterLevel, gm, perfSample, tp } from '../lib/game';
import { levelPoints, requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Điểm đứng (thế giới, mét): Thung Lũng Thanh Phong (VALLEY 2048,2460), suối, rừng (FOREST 2450,2110), sơn môn (SECT 2048,2048). */
export const POINTS: { name: string; x: number; z: number }[] = [
  { name: 'thunglung', x: 2048, z: 2420 },
  { name: 'giua', x: 2110, z: 2490 },
  { name: 'suoi', x: 2390, z: 2440 },
  // có cây và nhà (kiểm P6): rìa rừng Thanh Mộc và sân sơn môn Lạc Kiếm Tông
  { name: 'rung', x: 2450, z: 2150 },
  { name: 'sonmon', x: 2048, z: 2120 },
];

/** Điểm của level đang chụp: Vân Lam giữ danh sách đặt tay; level khác suy từ dữ liệu (P9), ảnh tên `<style>-<view>-<mood>-<điểm>.png`. */
const LEVEL = opt('--level', 'van_lam');
const pointsOf = (): { name: string; x: number; z: number }[] => (LEVEL === 'van_lam' ? POINTS : levelPoints(requireLevel(LEVEL).id));

const SIZES: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default {
  name: 'painted',
  desc: 'Họa Cảnh: ảnh so sánh mặc định | ?style=painted ở Thung Lũng Thanh Phong (ngày/đêm × 720p/1080p) + số đo',
  usage:
    '[--level <id>] [--styles off,painted] [--moods day,night] [--views 720p,1080p] [--points a,b|all] [--preset high] [--burst N] [--spawn <id quái> --spawn-n N] [--cast 0,1,2: bấm chiêu ở ô số này giữa các khung burst]',
  async run(r) {
    const only = list('--points', 'all');
    const pts = pointsOf().filter((p) => only.includes('all') || only.includes(p.name));
    const perf: Record<string, unknown> = {};
    for (const style of list('--styles', 'off,painted')) {
      for (const view of list('--views', '720p,1080p')) {
        for (const mood of list('--moods', 'day,night')) {
          const { ctx, page } = await r.open({
            name: `Pt${style[0]}${mood[0]}${view[0]}`,
            quality: opt('--preset', 'high'),
            viewport: SIZES[view]!,
            query: { mood, cam: 'iso', quiet: 1, style: style === 'painted' ? 'painted' : undefined },
            extra: opt('--query', ''),
            seenIntro: true,
            warnings: true,
          });
          await gm(page, `level ${LEVEL === 'van_lam' ? 15 : Math.max(27, requireLevel(LEVEL).minLevel ?? 0)}`, 2500);
          if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
          await gm(page, 'god on', 2500);
          await gm(page, 'killall', 2500);
          // --spawn <id quái> [--spawn-n N]: đặt quái quanh người để bắt chiêu vùng (telegraph) trên nền cỏ
          const spawn = opt('--spawn', '');
          if (spawn) await gm(page, `spawn ${spawn} ${num('--spawn-n', 3)}`, 2500);
          let first = true;
          for (const p of pts) {
            await tp(page, p.x, p.z);
            await sleep(first ? 3000 : 0);
            const cast = list('--cast', '').filter(Boolean).map(Number);
            const press = async (k: number): Promise<void> => {
              if (cast.length) await page.evaluate((i) => window.__game!.useSkill(i), cast[k % cast.length]!);
            };
            await press(0);
            await snap(page, r.out, `${style}-${view}-${mood}-${p.name}.png`, { wait: first ? 6000 : 4000 });
            // --burst N: thêm N khung cách nhau ~2,5 s (bắt hiệu ứng thoáng qua như chiêu vùng của quái)
            for (let b = 1; b < num('--burst', 1); b++) {
              await press(b);
              await snap(page, r.out, `${style}-${view}-${mood}-${p.name}-b${b}.png`, { wait: 2500 });
            }
            first = false;
            perf[`${style}-${view}-${mood}-${p.name}`] = await perfSample(page);
          }
          await ctx.close();
        }
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
