// Biển hiệu 3D bằng chữ thư pháp (tools/calli, nhóm `sign`) của Lạc Kiếm Tông: biển cổng tam quan + hoành phi chính điện, camera tự do cố định
// (`__game.freeCam`, cần ?debug=1), 720p + 1080p. `--plain` ẩn các tấm biển thư pháp để chụp bản "trước" (chữ khối Blender gốc) cùng camera.
import { flag, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';
import { SECT } from '@dtl/shared';

/** Mắt máy và điểm nhìn tương đối tâm tông môn (x/z) và SECT.y (y). */
const VIEWS = [
  { id: 'cong_gan', eye: [0, 7, 100], at: [0, 7.4, 80], fov: 42 },
  { id: 'cong_xa', eye: [0, 7, 128], at: [0, 7.5, 96], fov: 40 },
  { id: 'hoanh_phi', eye: [0, 8.5, -8], at: [0, 8.7, -35], fov: 42 },
  { id: 'san', eye: [0, 9, 62], at: [0, 8, -20], fov: 58 },
] as const;

export default {
  name: 'calli3d',
  desc: 'Biển hiệu 3D Lạc Kiếm Tông bằng chữ thư pháp ở 720p + 1080p; --plain = bản trước (chữ khối gốc)',
  usage: '[--sizes 720p,1080p] [--plain]',
  async run(r) {
    const plain = flag('--plain');
    for (const tag of list('--sizes', '720p,1080p')) {
      const { ctx, page, errors } = await r.open({
        name: 'Calli3d',
        viewport: UI_SIZES[tag],
        query: { debug: 1 },
        seenIntro: true,
        hide: 'hud',
      });
      await gm(page, 'level 15');
      await gm(page, 'god on');
      for (const v of VIEWS) {
        await tp(page, SECT.x, SECT.z + 40);
        await page.evaluate(
          (a) => {
            const g = window.__game!;
            g.freeCam = {
              x: a.s[0] + a.e[0],
              y: a.s[1] + a.e[1],
              z: a.s[2] + a.e[2],
              tx: a.s[0] + a.t[0],
              ty: a.s[1] + a.t[1],
              tz: a.s[2] + a.t[2],
              fov: a.f,
            };
            g.scene.traverse((o: { name: string; visible: boolean }) => {
              if (o.name === 'calli_sign') o.visible = !a.plain;
            });
          },
          { s: [SECT.x, SECT.y, SECT.z], e: v.eye, t: v.at, f: v.fov, plain },
        );
        await sleep(2500);
        await snap(page, r.out, `${plain ? 'truoc' : 'sau'}-sign-${v.id}-${tag}.jpg`, { wait: 800 });
      }
      if (errors.length) console.log('  LỖI console:', errors.slice(0, 3));
      await ctx.close();
    }
  },
} satisfies Scenario;
