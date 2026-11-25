// #676: prop dày (đá dựng `prop_da_dung`, tre `prop_truc`) vẫn mờ khi che nhân vật (withSightFade) qua đường pool từng bản.
// Người chơi đứng SAU vật (phía xa camera chéo Vân Lam, hướng 30°) → vật nằm giữa camera và người: ảnh `che-*`; đối chứng đứng TRƯỚC vật: `truoc-*`.
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };
const YAW = (30 * Math.PI) / 180; // hướng camera iso Vân Lam (khớp camiso)
/** Vật (tâm) từ `allProps`: đá dựng (2457, 2004), tre (2449, 2000). */
const TARGETS: [string, number, number][] = [
  ['da', 2457, 2004],
  ['truc', 2449, 2000],
];

export default {
  name: 'densefade',
  desc: 'Mờ khi che nhân vật của đá dựng/tre (prop dày): đứng sau vật và đứng trước vật, 720p + 1080p',
  usage: '[--out <thư mục>]',
  async run(r) {
    for (const [view, size] of Object.entries(VIEWS)) {
      const { ctx, page } = await r.open({
        name: `DenseFade${view}`,
        renderer: 'webgpu',
        quality: 'high',
        viewport: size,
        seenIntro: true,
      });
      await gm(page, 'level 15');
      await gm(page, 'god on');
      await gm(page, 'killall', 800);
      for (const [name, x, z] of TARGETS) {
        // sau vật: lùi xa camera ~3 m; trước vật: tiến về camera ~5 m (không bị vật che)
        await tp(page, x - Math.sin(YAW) * 3, z - Math.cos(YAW) * 3);
        await snap(page, r.out, `che-${name}-${view}.png`, { wait: 3000 });
        await tp(page, x + Math.sin(YAW) * 5, z + Math.cos(YAW) * 5);
        await sleep(300);
        await snap(page, r.out, `truoc-${name}-${view}.png`, { wait: 3000 });
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
