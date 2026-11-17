// Ảnh cảnh cố định để so trước/sau khi đổi render (P2-A2/A6) và ảnh duyệt bản đồ mới (E2-A/E3-A/E4-A).
// Vân Lam: danh sách điểm đặt tay; level khác: điểm suy từ dữ liệu (tâm vùng, điểm đáng chú ý, boss, tinh anh, toàn cảnh).
import { FOREST, LAKE, SPAWN_POINT } from '@dtl/shared';
import { flag, list, opt, size } from '../lib/env';
import { cam, enterLevel, gm, perfSample, tp } from '../lib/game';
import { levelPoints, requireLevel, type LevelPoint } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

const VAN_LAM: LevelPoint[] = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.0, pitch: 0.3, dist: 16 },
  { name: 'sondao', x: 2048, z: 2330, yaw: 3.14, pitch: 0.3, dist: 14 },
  { name: 'dao', x: 2048, z: 2150, yaw: 3.14, pitch: 0.28, dist: 14 },
  { name: 'rung', x: FOREST.x - 40, z: FOREST.z, yaw: 1.2, pitch: 0.28, dist: 14 },
  { name: 'ho', x: LAKE.x - 185, z: LAKE.z, yaw: -1.57, pitch: 0.24, dist: 14 },
  { name: 'khe', x: 2000, z: 2540, yaw: 3.14, pitch: 0.22, dist: 16 },
  { name: 'cothu', x: 2500, z: 2100, yaw: 0, pitch: 0.18, dist: 14 },
  { name: 'bohd', x: 1490, z: 2230, yaw: -1.57, pitch: 0.2, dist: 14 },
  { name: 'suoi', x: 2390, z: 2400, yaw: 3.14, pitch: 0.3, dist: 14 },
  { name: 'vach', x: 2450, z: 1790, yaw: 3.14, pitch: 0.28, dist: 14 },
  { name: 'ranh', x: 2048 + 1070, z: 2300, yaw: -1.57, pitch: 0.2, dist: 14 },
  { name: 'trencao', x: 2200, z: 2250, yaw: 0, pitch: 1.2, dist: 700 },
  { name: 'dinh', x: 2400, z: 1700, yaw: 3.14, pitch: 0.4, dist: 16 },
];
/** Mặc định của Vân Lam khi không có `--points`: 5 điểm chuẩn. */
const VAN_LAM_DEFAULT = ['san', 'sondao', 'rung', 'ho', 'dinh'];

const LEVEL = opt('--level', 'van_lam');
const points = (): LevelPoint[] => {
  requireLevel(LEVEL);
  const only = list('--points', LEVEL === 'van_lam' ? VAN_LAM_DEFAULT.join(',') : '');
  return (LEVEL === 'van_lam' ? VAN_LAM : levelPoints(LEVEL)).filter((p) => !only.length || only.includes('all') || only.includes(p.name));
};

export default {
  name: 'points',
  desc: 'Ảnh cảnh cố định theo điểm (trước/sau khi đổi render; duyệt bản đồ mới với --level)',
  usage: '[--level <id>] [--points a,b|all] [--renderers webgpu,webgl2 | --renderer webgpu] [--presets low,medium,high] [--size 1280x720] [--query a=b] [--perf] [--dry]',
  dry() {
    if (!flag('--dry')) return false;
    for (const p of points()) console.log(`${LEVEL}/${p.name}\t${Math.round(p.x)}, ${Math.round(p.z)}`);
    return true;
  },
  async run(r) {
    const perf: Record<string, unknown> = {};
    for (const renderer of list('--renderers', opt('--renderer', 'webgpu,webgl2'))) {
      for (const preset of list('--presets', 'low,medium,high')) {
        const { ctx, page } = await r.open({ name: `Shot${renderer === 'webgpu' ? 'gpu' : 'gl'}${preset[0]}`, renderer, quality: preset, viewport: size('1280x720'), extra: opt('--query', ''), warnings: true });
        await gm(page, `level ${LEVEL === 'van_lam' ? 15 : 27}`);
        await gm(page, 'god on');
        if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
        for (const p of points()) {
          await tp(page, p.x, p.z);
          await cam(page, p);
          const stem = `${LEVEL === 'van_lam' ? '' : LEVEL + '-'}${renderer}-${preset}-${p.name}`;
          await snap(page, r.out, `${stem}.png`, { wait: settleMs() });
          if (flag('--perf')) perf[stem] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    if (flag('--perf')) writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
