// #676: prop dày (đá dựng `prop_da_dung`, tre `prop_truc`) vẫn mờ khi che nhân vật (withSightFade) qua đường pool từng bản.
// Người chơi đứng SAU vật (phía xa camera chéo Vân Lam, hướng 30°) → vật nằm giữa camera và người: ảnh `che-*`; đối chứng đứng TRƯỚC vật: `truoc-*`.
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };
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
      // Hướng ngang từ người tới camera (đọc thật từ game, không đoán hướng iso).
      await tp(page, TARGETS[0]![1] + 8, TARGETS[0]![2] + 8);
      await sleep(2500);
      const dir = await page.evaluate(() => {
        const g = window.__game as unknown as { camera: { position: { x: number; z: number } }; renderPos: { x: number; z: number } };
        const dx = g.camera.position.x - g.renderPos.x;
        const dz = g.camera.position.z - g.renderPos.z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
      });
      console.log(`  hướng người→camera (${dir.x.toFixed(2)}, ${dir.z.toFixed(2)})`);
      for (const [name, x, z] of TARGETS) {
        // sau vật: người ở xa camera hơn vật 2,5 m (vật nằm giữa camera và người); trước vật: gần camera hơn 6 m
        await tp(page, x - dir.x * 2.5, z - dir.z * 2.5);
        await snap(page, r.out, `che-${name}-${view}.png`, { wait: 3000 });
        await tp(page, x + dir.x * 6, z + dir.z * 6);
        await sleep(300);
        await snap(page, r.out, `truoc-${name}-${view}.png`, { wait: 3000 });
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
