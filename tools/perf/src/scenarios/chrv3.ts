// Nhân vật v3 (Lạc Kiếm Môn Phục trên Mannequin + clip UAL trực tiếp) so với bản hiện tại, CÙNG chuỗi hành động và camera, cùng bộ
// `set_lac_kiem`: ảnh cận mặt → đứng nghỉ → chạy → chém 3 chiêu (ô 1-3) → trúng đòn nhẹ/nặng → ngã/đứng dậy → đả tọa → ngự kiếm →
// chết/hồi sinh. Mỗi (giới × bản) một webm + ảnh cận mặt; `v1` = mặc định, `v2` = `?chr=v2`, `v3` = `?chr=v3`.
// Cắt phần tải/vào game bằng ffmpeg (đặt FFMPEG=đường_dẫn nếu không có trong PATH).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import { centerClip, snap } from '../lib/shot';
import type { Scenario } from '../lib/scenario';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

export default {
  name: 'chrv3',
  desc: 'Video so nhân vật hiện tại (v1/v2) với v3 (Lạc Kiếm trên Mannequin + UAL trực tiếp) cùng chuỗi hành động, nam/nữ',
  usage: '[--genders m,f] [--variants v1,v2,v3] [--size 960x600]',
  async run(r) {
    const viewport = size('960x600');
    for (const g of list('--genders', 'm,f')) {
      for (const v of list('--variants', 'v1,v3')) {
        const tag = `${g === 'm' ? 'nam' : 'nu'}-${v}`;
        const dir = path.join(r.out, `_rec-${tag}`);
        const t0 = Date.now();
        const { ctx, page } = await r.open({ name: `V3${g}${v}`, viewport, quality: 'high', look: { g }, query: v === 'v1' ? {} : { chr: v }, hide: 'hud', warnings: /models|chr_v3|clip/, video: dir });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, 'set set_lac_kiem', 1200);
        await gm(page, 'killall', 800);
        await gm(page, 'tp 2048 2088', 1500);
        if (v === 'v3') await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, { timeout: 60_000, polling: 300 });
        else if (v !== 'v1' || true) await page.waitForFunction(() => window.__game!.ents?.players.get(window.__game!.sid)?.model?.dirHits === true, undefined, { timeout: 60_000, polling: 300 });
        // Camera 3/4 gần, đặt lại trước mỗi pha (camera theo khu có thể kéo xa).
        const frame = () => cam(page, { yaw: 0.5, pitch: 0.08, dist: 3.4 });
        await frame();
        const tScene = Date.now();
        await sleep(1500);
        await cam(page, { yaw: 0, pitch: 0.02, dist: 0.9 }); // cận mặt
        await sleep(1200);
        await snap(page, r.out, `${tag}-canmat.jpg`, { clip: centerClip(viewport[0], viewport[1], 480, 360) });
        await frame();
        await sleep(1500); // đứng nghỉ
        await page.keyboard.down('KeyW'); // chạy
        await sleep(2600);
        await page.keyboard.up('KeyW');
        await sleep(600);
        await frame();
        await gm(page, 'spawn mon_soi_xam 1', 1500); // chém
        await frame();
        for (const slot of [1, 2, 3]) {
          await page.evaluate((n) => window.__game!.useSkill(n), slot);
          await sleep(1300);
        }
        await gm(page, 'killall', 700);
        for (const heavy of [false, true]) {
          await page.evaluate((hv) => {
            const g2 = window.__game!;
            const m = g2.ents.players.get(g2.sid).model;
            const y = m.root.rotation.y;
            m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), noStop: true, heavy: hv, crit: hv });
          }, heavy);
          await sleep(1300);
        }
        await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.knockdown());
        await sleep(3000);
        await frame();
        await page.keyboard.press('KeyZ'); // đả tọa
        await sleep(2600);
        await page.keyboard.press('KeyW');
        await sleep(600);
        await page.evaluate(() => window.__game!.toggleFly()); // ngự kiếm
        await sleep(900);
        await page.keyboard.down('KeyW');
        await sleep(1800);
        await page.keyboard.up('KeyW');
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(1500);
        await frame();
        await gm(page, 'die', 4200);
        await page.evaluate(() => window.__game!.send('resp', {}));
        await sleep(2200);
        const vid = page.video();
        await ctx.close();
        if (vid) {
          const raw = await vid.path();
          const dst = path.join(r.out, `${tag}.webm`);
          const ss = Math.max(0, (tScene - t0) / 1000 - 0.3);
          const cut = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', raw, '-c:v', 'libvpx', '-b:v', '1.5M', '-an', dst]);
          if (cut.status !== 0) fs.copyFileSync(raw, dst);
        }
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[shots:chrv3] ${tag}.webm`);
      }
    }
  },
} satisfies Scenario;
