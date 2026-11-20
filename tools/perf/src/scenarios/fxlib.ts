// Thư viện hình mesh VFX (VS-1): mỗi hình một ảnh 1280×720 (đặt trước mặt nhân vật, cùng camera) rồi ghép tờ xem trước.
//   --shapes slash_thick,blade_giant   (mặc định: cả thư viện)   --palette bat_dong_kim_than (bảng màu, mặc định Kiếm tu)
import path from 'node:path';
import { FX_LIB_SHAPES, FLIP_ATLASES } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

/** Cách đặt từng hình để nhìn rõ: cỡ, xoay (độ, YXZ), nâng cao, góc nhìn camera. */
const LOOK: Record<string, { s: number; rot?: [number, number, number]; y?: number; pitch?: number; tone?: string; card?: string }> = {
  slash_thick: { s: 1.6, rot: [0, 0, -20], y: 1.1 },
  slash_thin: { s: 1.6, rot: [0, 0, 15], y: 1.1 },
  slash_cross: { s: 1.5, y: 1.1 },
  slash_fan: { s: 1.6, y: 1.1 },
  blade_flying: { s: 1.6, rot: [-80, 0, 0], y: 1.2 },
  blade_stuck: { s: 1.8, rot: [-60, 0, 0], y: 0.9 },
  blade_giant: { s: 3.2, rot: [-90, 0, 0], y: 0.1 },
  blade_ghost: { s: 1.6, rot: [-80, 0, 0], y: 1.2 },
  shock_cone: { s: 2.4, y: 0.1, pitch: 0.5 },
  crack_radial: { s: 2.4, y: 0.12, pitch: 0.9 },
  rift_line: { s: 4, y: 0.12, pitch: 0.7 },
  rubble_a: { s: 0.7, y: 0.5, rot: [20, 30, 10] },
  rubble_b: { s: 0.8, y: 0.5, rot: [10, 80, 0] },
  rubble_c: { s: 0.8, y: 0.5, rot: [0, 120, 20] },
  rune_ring2: { s: 2, y: 0.12, pitch: 0.8 },
  rune_array: { s: 1.7, y: 0.1, pitch: 0.4 },
  dragon_sword: { s: 1.4, y: 0.1 },
  sword_halo: { s: 2.4, y: 1.6 },
  spark_streak: { s: 1.5, rot: [-30, 0, 0], y: 1.2 },
  petal_blade: { s: 1.8, rot: [-20, 0, 0], y: 1.1 },
  // Hộ pháp: đứng theo +Y, đáy ở mặt đất (y tính từ ngực nhân vật).
  seal_block: { s: 1.2, y: -1.1, rot: [0, 30, 0] },
  bell_cage: { s: 0.9, y: -1.1 },
  rock_spire: { s: 1.6, y: -1.1, rot: [0, 40, 0] },
  shield_plate: { s: 1.1, y: -1.1, rot: [0, 150, 0] },
  diamond_cage: { s: 0.8, y: -1.1, rot: [0, 25, 0] },
};

export default {
  name: 'fxlib',
  desc: 'Thư viện hình mesh VFX (VS-1): ảnh từng hình + flipbook, cùng camera, để duyệt phong cách',
  usage: '[--shapes slash_thick,blade_giant] [--palette bat_dong_kim_than] [--flips]',
  async run(r) {
    const shapes = list('--shapes', FX_LIB_SHAPES.join(','));
    const { ctx, page } = await r.open({ name: 'Afxlib', viewport: [1280, 720], dpr: 1, quality: 'high', hide: 'hud', warnings: /models/ });
    await gm(page, 'god on', 800);
    await gm(page, 'tp 2048 2088', 1500);
    const run = async (name: string, ev: Record<string, unknown>, ms = 900) => {
      await page.evaluate(
        `(() => { const g = window.__game; const me = g.cur;
          const tl = { skill: 'x', events: [${JSON.stringify({ type: 'mesh', t: 0, dur: 3.5, sweep: 0, erodeFrom: 0.95, alpha: 1, shadow: false, ...ev })}] };
          g.skillFx.runner.startAt(tl, { actor: { x: me.x, y: me.y, z: me.z, yaw: g.facing, model: {} }, palette: ${JSON.stringify(opt('--palette', 'lac_kiem_quyet'))} }); })()`,
      );
      await sleep(ms);
      await snap(page, r.out, `${name}.jpg`, { wait: 0 });
      await sleep(3200);
    };
    if (process.argv.includes('--punch')) {
      // Kiểm `vignette` (PostPipeline.punch): tối / sáng ở viền, giữ 3 s để chụp.
      await page.evaluate(`window.__game.post.flash(0.9)`);
      await sleep(60);
      await snap(page, r.out, 'flash-ref.jpg', { wait: 0 });
      await sleep(1500);
      for (const tone of ['dark', 'light']) {
        await page.evaluate(`window.__game.post.punch(0.5, '${tone}', 3000)`);
        await sleep(250);
        console.log('[punch]', tone, await page.evaluate('window.__game.post.punchLevel()'));
        await snap(page, r.out, `punch-${tone}.jpg`, { wait: 0 });
        await sleep(3000);
      }
      await ctx.close();
      return;
    }
    for (const s of shapes) {
      const l = LOOK[s] ?? { s: 1.5 };
      await cam(page, { yaw: Math.PI, pitch: l.pitch ?? 0.2, dist: 2.2 });
      await sleep(400);
      await run(s, { shape: s, scale: l.s * 1.5, rot: l.rot, offset: [0, l.y ?? 1, 2.6], tone: l.tone ?? 'body' });
    }
    if (process.argv.includes('--flips')) {
      for (const a of FLIP_ATLASES) {
        await cam(page, { yaw: Math.PI, pitch: 0.2, dist: 2.2 });
        for (const k of [0.15, 0.4, 0.7]) {
          await page.evaluate(
            `(() => { const g = window.__game; const me = g.cur; const tl = { skill: 'x', events: [${JSON.stringify({ type: 'mesh', t: 0, shape: 'flip', flip: a, dur: 2, scale: 2.4, alpha: 1, offset: [0, 1.5, 2.6], tone: 'body' })}] };
              g.skillFx.runner.startAt(tl, { actor: { x: me.x, y: me.y, z: me.z, yaw: g.facing, model: {} }, palette: ${JSON.stringify(opt('--palette', 'lac_kiem_quyet'))} }); })()`,
          );
          await sleep(k * 2000);
          await snap(page, r.out, `flip-${a}-${Math.round(k * 100)}.jpg`, { wait: 0 });
          await sleep(2200 - k * 2000);
        }
      }
    }
    void path;
    await ctx.close();
  },
} satisfies Scenario;
