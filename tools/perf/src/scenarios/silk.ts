// Độ bóng lụa của voan bộ Đan sư (v3): ảnh trước/sau CÙNG góc máy. `--tag truoc` = `?v3silk=0` (không có lụa), `--tag sau` = mặc định.
// Mỗi bộ × giới × ánh sáng (day, dusk) × góc (xuôi sáng, ngược sáng, nghiêng) × (đứng yên, đang đi), 1080p + 720p; thêm một phối màu nhuộm khác.
//   pnpm shots silk --out <thư mục> --tag truoc|sau [--sets set_luu_ly,set_phuc_mach,set_than_tang] [--genders m,f] [--moods day,dusk]
//     [--preset high] [--sizes 1920x1080,1280x720] [--dye attire_sect] [--perf 1]
import path from 'node:path';
import type { Page } from 'playwright';
import { sleep } from '../lib/devserver';
import { flag, list, opt } from '../lib/env';
import { gm, perfSample } from '../lib/game';
import { writeJson } from '../lib/shot';
import type { Scenario } from '../lib/scenario';

const SAN = { x: 2048, z: 2088 };
/** Hướng nắng trên mặt phẳng ngang (khớp `SUN_AZIMUTH` ở `render/atmosphere.ts`): atan2(90, 120). */
const SUN = { x: Math.sin(Math.atan2(90, 120)), z: Math.cos(Math.atan2(90, 120)) };
const VIEWS = ['xuoi-sang', 'nguoc-sang', 'nghieng'] as const;

/** Đặt máy quanh nhân vật: `xuoi-sang` đứng phía mặt trời nhìn vào (nắng sau lưng máy), `nguoc-sang` đứng phía đối diện (nắng sau lưng nhân vật). */
const setCam = (page: Page, view: (typeof VIEWS)[number]) =>
  page.evaluate(
    ([v, sx, sz]) => {
      const g = window.__game!;
      const root = g.ents.players.get(g.sid).model.root as { position: { x: number; y: number; z: number } };
      const p = root.position;
      let dx = sx as number;
      let dz = sz as number;
      if (v === 'nguoc-sang') {
        dx = -dx;
        dz = -dz;
      } else if (v === 'nghieng') {
        [dx, dz] = [-(sz as number), sx as number];
      }
      g.freeCam = { x: p.x + dx * 2.7, y: p.y + 1.3, z: p.z + dz * 2.7, tx: p.x, ty: p.y + 0.95, tz: p.z, fov: 38 };
    },
    [view, SUN.x, SUN.z] as const,
  );

async function waitModel(page: Page, timeout: number): Promise<void> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const ok = await page.evaluate(() => {
      const ps = [...window.__game!.ents.players.values()] as { model: { setView?: unknown } }[];
      return ps.length > 0 && ps.every((p) => !!p.model.setView);
    });
    if (ok) return;
    await sleep(500);
  }
}

export default {
  name: 'silk',
  desc: 'Độ bóng lụa của voan Đan sư: trước/sau, nam/nữ, day/dusk, xuôi/ngược sáng, đứng/đi, 1080p + 720p, màu nhuộm khác',
  usage:
    '--tag truoc|sau [--sets set_luu_ly,set_phuc_mach,set_than_tang] [--genders m,f] [--moods day,dusk] [--preset high] [--sizes 1920x1080,1280x720] [--dye <id>] [--perf 1] [--walk-only]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const tag = opt('--tag', 'sau');
    const sets = list('--sets', 'set_luu_ly,set_phuc_mach,set_than_tang');
    const sizes = list('--sizes', '1920x1080,1280x720').map((s) => s.split('x').map(Number) as [number, number]);
    const dye = opt('--dye', 'wood_cinnabar');
    const walkOnly = flag('--walk-only');
    const perf: Record<string, unknown> = {};
    for (const mood of list('--moods', 'day,dusk')) {
      for (const g of list('--genders', 'm,f')) {
        const gname = g === 'm' ? 'nam' : 'nu';
        const { ctx, page } = await r.open({
          name: `Sk${mood[0]}${g}`,
          viewport: [1920, 1080],
          quality: opt('--preset', 'high'),
          look: { g },
          query: { mood, ...(tag === 'truoc' ? { v3silk: '0' } : {}) },
          hide: 'hud',
          seenIntro: true,
          warnings: /models|chr_v3|clip/,
        });
        await gm(page, 'level 15', 1500);
        await gm(page, 'god on', 1100);
        await gm(page, 'killall', 900);
        await gm(page, `tp ${SAN.x + (g === 'm' ? 14 : 21)} ${SAN.z}`, 1500);
        let n = 0;
        for (const set of sets) {
          await page.evaluate((rid) => window.__game!.send('lkr', { r: rid }), `sk${Date.now()}${n++}`);
          await gm(page, `set ${set}`, 1500);
          await waitModel(page, 60_000);
          await sleep(4000);
          for (const view of VIEWS) {
            await setCam(page, view);
            await sleep(900);
            for (const [w, h] of walkOnly ? [] : sizes) {
              await page.setViewportSize({ width: w, height: h });
              await sleep(900);
              const stem = `${tag}-${set.replace('set_', '')}-${gname}-${mood}-${view}-${h}p`;
              await page.screenshot({ path: path.join(r.out, `${stem}-dung.png`) });
              if (flag('--perf') && h === 1080) perf[stem] = await perfSample(page);
            }
            // Đang đi: giữ W, chụp giữa lúc di chuyển (vải động). Máy cố định nên nhân vật đi ngang qua khung.
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.keyboard.down('KeyW');
            await sleep(700);
            await setCam(page, view); // máy bắt lại nhân vật giữa lúc đi để ảnh không lệch khung
            await sleep(250);
            await page.screenshot({ path: path.join(r.out, `${tag}-${set.replace('set_', '')}-${gname}-${mood}-${view}-1080p-di.png`) });
            await page.keyboard.up('KeyW');
            await gm(page, `tp ${SAN.x + (g === 'm' ? 14 : 21)} ${SAN.z}`, 1200);
            console.log(`[shots:silk] ${tag} ${mood} ${set} ${gname} ${view}`);
          }
          // Phối màu nhuộm khác (chỉ ánh sáng xuôi sáng): ba kênh cùng một màu để thấy lụa theo màu nhuộm.
          if (walkOnly) continue;
          await page.evaluate(([d, rid]) => window.__game!.send('lkd', { dye: [d, d, d], r: rid }), [
            dye,
            `sk${Date.now()}${n++}`,
          ] as const);
          await sleep(1500);
          await waitModel(page, 60_000);
          await sleep(2500);
          await setCam(page, 'xuoi-sang');
          await sleep(900);
          for (const [w, h] of sizes) {
            await page.setViewportSize({ width: w, height: h });
            await sleep(900);
            await page.screenshot({ path: path.join(r.out, `${tag}-${set.replace('set_', '')}-${gname}-${mood}-nhuom-${dye}-${h}p.png`) });
          }
        }
        await ctx.close();
      }
    }
    if (Object.keys(perf).length) writeJson(r.out, `perf-${tag}.json`, perf);
  },
} satisfies Scenario;
