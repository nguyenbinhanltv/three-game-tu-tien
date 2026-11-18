// Skin toàn thân trên nhân vật v3 (`?chr=v3`, Mannequin + clip UAL trực tiếp): mặc bằng `/gm skin <id>` rồi quay một video đứng → chạy
// → chém 3 đòn → đả tọa → ngự kiếm, kèm ba ảnh đứng (trước/nghiêng/sau). Mỗi (giới × skin) một webm + ảnh.
// Cắt phần tải/vào game bằng ffmpeg (đặt FFMPEG=đường_dẫn nếu không có trong PATH).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
/** Skin → giới tính nhân vật mặc được (khớp `gender` trong items.json). */
const GENDER: Record<string, string> = {
  itm_skin_varkessa: 'f',
  itm_skin_duskrella: 'f',
  itm_skin_crimson_knight: 'm',
  itm_skin_noxavyra: 'f',
  itm_skin_kings_demon: 'f',
};

export default {
  name: 'skinv3',
  desc: 'Video skin toàn thân trên nhân vật v3: đứng, chạy, chém, đả tọa, ngự kiếm + ảnh đứng ba hướng',
  usage: '[--ids itm_skin_duskrella,itm_skin_crimson_knight] [--size 960x720]',
  async run(r) {
    const [vw, vh] = size('960x720');
    for (const id of list('--ids', 'itm_skin_duskrella,itm_skin_crimson_knight')) {
      const g = GENDER[id] ?? 'f';
      const tag = `${id.replace('itm_skin_', '')}-${g === 'm' ? 'nam' : 'nu'}`;
      const dir = path.join(r.out, `_rec-${tag}`);
      const t0 = Date.now();
      const { ctx, page } = await r.open({
        name: `Sk3${g}`,
        viewport: [vw, vh],
        quality: 'high',
        look: { g },
        query: { chr: 'v3' },
        hide: 'hud',
        warnings: /models|chr_v3|clip/,
        video: dir,
      });
      await gm(page, 'level 12', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await gm(page, `skin ${id}`, 5000);
      const sn = await page.evaluate(() => (window.__game!.me()?.sn as string | undefined) ?? '');
      console.log(`[shots:skinv3] ${id}: server báo sn='${sn}'`);
      const frame = () => cam(page, { yaw: 0.5, pitch: 0.08, dist: 3.6 });
      await frame();
      const tScene = Date.now();
      for (const [view, yaw] of [
        ['truoc', 0],
        ['nghieng', Math.PI / 2],
        ['sau', Math.PI],
      ] as const) {
        await cam(page, { yaw, pitch: 0.1, dist: 3.6 });
        await sleep(1500);
        await snap(page, r.out, `${tag}-dung-${view}.jpg`);
      }
      await frame();
      await page.keyboard.down('KeyW');
      await sleep(2600);
      await page.keyboard.up('KeyW');
      await sleep(500);
      await frame();
      await gm(page, 'spawn mon_soi_xam 1', 1500);
      await frame();
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__game!.useSkill(1));
        await sleep(1150);
      }
      await gm(page, 'killall', 700);
      await frame();
      await page.keyboard.press('KeyZ');
      await sleep(2600);
      await snap(page, r.out, `${tag}-datoa.jpg`);
      await page.keyboard.press('KeyW');
      await sleep(700);
      await frame();
      await page.evaluate(() => window.__game!.toggleFly());
      await sleep(900);
      await page.keyboard.down('KeyW');
      await sleep(2400);
      await snap(page, r.out, `${tag}-ngukiem.jpg`);
      await page.keyboard.up('KeyW');
      await page.evaluate(() => window.__game!.toggleFly());
      await sleep(1500);
      const vid = page.video();
      await ctx.close();
      if (vid) {
        const raw = await vid.path();
        const dst = path.join(r.out, `${tag}.webm`);
        const ss = Math.max(0, (tScene - t0) / 1000 - 0.3);
        const cut = spawnSync(FFMPEG, [
          '-y',
          '-loglevel',
          'error',
          '-ss',
          ss.toFixed(2),
          '-i',
          raw,
          '-c:v',
          'libvpx',
          '-b:v',
          '1.5M',
          '-an',
          dst,
        ]);
        if (cut.status !== 0) fs.copyFileSync(raw, dst);
      }
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[shots:skinv3] ${tag}.webm`);
    }
  },
} satisfies Scenario;
