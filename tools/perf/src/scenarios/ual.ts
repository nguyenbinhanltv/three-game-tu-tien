// UAL (Quaternius CC0, anim_human_ual): video trước/sau khi dùng clip UAL trong game. Mỗi (giới × đời nhân vật × bản) một webm:
// đứng nghỉ → nhảy → lướt (Q) → trúng đòn trước/nặng → ngã/đứng dậy → chết. `old` = `?ual=0` (clip K-3 cũ), `new` = có UAL.
// Cắt phần tải/vào game bằng ffmpeg (đặt FFMPEG=đường_dẫn nếu không có trong PATH; thiếu thì giữ video thô).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

export default {
  name: 'ual',
  desc: 'Video trước/sau khi dùng clip UAL (nhảy, lướt, trúng đòn, ngã/dậy, chết) cho nam/nữ × nhân vật v1/v2',
  usage: '[--genders m,f] [--chr v1,v2] [--variants old,new] [--size 960x600]',
  async run(r) {
    const viewport = size('960x600');
    for (const g of list('--genders', 'm,f')) {
      for (const chr of list('--chr', 'v1,v2')) {
        for (const v of list('--variants', 'old,new')) {
          const tag = `${g === 'm' ? 'nam' : 'nu'}-${chr}-${v}`;
          const dir = path.join(r.out, `_rec-${tag}`);
          const t0 = Date.now();
          const { ctx, page } = await r.open({
            name: `U${g}${chr}${v[0]}`,
            viewport,
            quality: 'high',
            look: { g },
            query: { ...(chr === 'v2' && { chr: 'v2' }), ...(v === 'old' && { ual: 0 }) },
            hide: 'hud',
            warnings: /models/,
            video: dir,
          });
          await gm(page, 'level 12', 1500);
          await gm(page, 'god on', 1200);
          await gm(page, 'method lac_kiem_quyet 5', 1200);
          await gm(page, 'killall', 800);
          await gm(page, 'tp 2048 2088', 1500);
          // Chờ thư viện K-3 (và UAL ở bản mới) nạp lười xong.
          await page.waitForFunction(() => {
            const g2 = window.__game!;
            const m = g2.ents?.players.get(g2.sid)?.model;
            return !!m && m.dirHits === true;
          }, undefined, { timeout: 60_000, polling: 300 });
          if (v === 'new') await page.waitForFunction(() => window.__game!.ents.players.get(window.__game!.sid).model.clipLength('ual_death') > 0, undefined, { timeout: 30_000, polling: 300 });
          // Camera cận cảnh góc 3/4, giữ cố định (camera theo khu kéo xa lại nếu chỉ đặt một lần).
          const yaw0 = await page.evaluate(() => window.__game!.cur.yaw as number);
          const keepCam = setInterval(() => void cam(page, { yaw: yaw0 + 0.9, pitch: 0.08, dist: 3.4 }).catch(() => undefined), 50);
          const tScene = Date.now();
          await sleep(1500);
          await page.keyboard.down('Space');
          await sleep(150);
          await page.keyboard.up('Space');
          await sleep(1800);
          await page.evaluate(() => window.__game!.useDash());
          await sleep(1500);
          for (const heavy of [false, true]) {
            await page.evaluate((hv) => {
              const g2 = window.__game!;
              const m = g2.ents.players.get(g2.sid).model;
              const y = m.root.rotation.y;
              m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), noStop: true, heavy: hv, crit: hv });
            }, heavy);
            await sleep(1300);
          }
          await page.evaluate(() => {
            const g2 = window.__game!;
            g2.ents.players.get(g2.sid).model.knockdown();
          });
          await sleep(3800);
          await gm(page, 'die', 4200);
          await page.evaluate(() => window.__game!.send('resp', {}));
          await sleep(2500);
          clearInterval(keepCam);
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
          console.log(`[shots:ual] ${tag}.webm`);
        }
      }
    }
  },
} satisfies Scenario;
