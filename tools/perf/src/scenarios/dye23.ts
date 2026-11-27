// Nhuộm kênh 2 (viền/lót/đai) và kênh 3 (tua/kim loại) của nhân vật v3: ảnh trước/sau ở 1080p và 720p.
// Mỗi bộ × giới: ảnh gốc (`0-goc`, chưa nhuộm, mốc so), ba kênh cùng một màu (`1-ba-kenh-cung-mau`: viền và kim loại cũng đỏ) rồi vài phối màu khác nhau (tin `lkd`). Mốc "chỉ kênh 1 như trước PR" cần build main. Cùng góc 3/4 trước mặt.
//   pnpm shots dye23 --out <thư mục> [--sets set_dan_tam,set_huyen_giap,...] [--genders m,f] [--quality high] [--query a=b]
import path from 'node:path';
import type { Page } from 'playwright';
import { sleep } from '../lib/devserver';
import { list, opt } from '../lib/env';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const SAN = { x: 2048, z: 2088 };
/** Bốn bộ có nhiều vùng màu rõ: lục + vàng, giáp đen + đồng, đất + vàng, tím xám. */
const SETS = ['set_dan_tam', 'set_huyen_giap', 'set_liet_mach', 'set_than_tang'];
/** Phối màu [kênh 1, kênh 2, kênh 3]; `null` = không nhuộm. */
const MIXES: { name: string; dye3: string[] | null }[] = [
  { name: '0-goc', dye3: null },
  { name: '1-ba-kenh-cung-mau', dye3: ['wood_cinnabar', 'wood_cinnabar', 'wood_cinnabar'] },
  { name: '2-do-ngoc-den', dye3: ['wood_cinnabar', 'attire_ivory', 'attire_ink'] },
  { name: '3-lam-do-ngoc', dye3: ['attire_sect', 'wood_cinnabar', 'attire_ivory'] },
  { name: '4-tim-luc-ngoc', dye3: ['attire_rogue', 'wood_roof', 'attire_ivory'] },
];
const SIZES: [string, number, number][] = [
  ['1080p', 1920, 1080],
  ['720p', 1280, 720],
];

const frontCam = (page: Page) =>
  page.evaluate(() => {
    const g = window.__game!;
    const root = g.ents.players.get(g.sid).model.root as { rotation: { y: number }; position: { x: number; y: number; z: number } };
    const a = root.rotation.y + 0.45;
    const p = root.position;
    g.freeCam = { x: p.x + Math.sin(a) * 2.6, y: p.y + 1.25, z: p.z + Math.cos(a) * 2.6, tx: p.x, ty: p.y + 0.95, tz: p.z, fov: 38 };
  });

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
  name: 'dye23',
  desc: 'Nhuộm kênh 2/3 nhân vật v3: trước/sau, 4 bộ × nam/nữ × vài phối màu, 1080p + 720p',
  usage: '[--sets set_a,set_b] [--genders m,f] [--quality high] [--query a=b]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const sets = list('--sets', SETS.join(','));
    const genders = list('--genders', 'm,f');
    const quality = opt('--quality', 'high');
    const extra = opt('--query', '');
    for (const g of genders) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `D23${g}`,
        viewport: [1920, 1080],
        quality,
        look: { g },
        extra,
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
        await page.evaluate((rid) => window.__game!.send('lkr', { r: rid }), `d23r${Date.now()}${n++}`);
        await gm(page, `set ${set}`, 1500);
        for (const m of MIXES) {
          if (m.dye3)
            await page.evaluate(([dye, rid]) => window.__game!.send('lkd', { dye, r: rid }), [m.dye3, `d23${Date.now()}${n++}`] as const);
          else await page.evaluate((rid) => window.__game!.send('lkr', { r: rid }), `d23r${Date.now()}${n++}`);
          await sleep(1500);
          await waitModel(page, 60_000);
          await sleep(m === MIXES[0] ? 5000 : 2500);
          await frontCam(page);
          await sleep(1200);
          for (const [label, w, h] of SIZES) {
            await page.setViewportSize({ width: w, height: h });
            await sleep(1200);
            await page.screenshot({ path: path.join(r.out, `${set.replace('set_', '')}-${gname}-${m.name}-${label}.png`) });
          }
          console.log(`[shots:dye23] ${set} ${gname} ${m.name}`);
        }
      }
      await ctx.close();
    }
  },
} satisfies Scenario;
