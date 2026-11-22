// TN-9 PR2 (Lôi tu): kiếm có hồ quang điện một lớp nhẹ (ánh tím điện + phát sáng bậc 1) trên nhân vật v3, đứng 4 góc + cận tay ở 720p/1080p,
// rồi HUD với thanh Lôi tích và Lôi ấn trên mục tiêu sau một đòn Lôi Ấn Kích. Ra `<out>/loitu-<giới>-<trạng thái>-<góc>-<720p|1080p>.png`.
// Dùng: pnpm shots loitu --out <thư mục tuyệt đối> [--genders m,f]
import fs from 'node:fs';
import path from 'node:path';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const METHOD = 'cuu_tieu_loi_kinh';
const MON = 'elite_liet_cot_bao';
const SIZES = { '720p': [1280, 720], '1080p': [1920, 1080] } as const;

export default {
  name: 'loitu',
  desc: 'Lôi tu: kiếm điện nhiều góc + HUD Lôi tích/Lôi ấn ở 720p/1080p',
  usage: '--out <dir> [--genders m,f]',
  async run(r) {
    for (const g of list('--genders', 'm,f')) {
      const gname = g === 'm' ? 'nam' : 'nu';
      const { ctx, page } = await r.open({
        name: `L${g}`,
        viewport: [1280, 720],
        quality: 'high',
        look: { g },
        query: { chr: 'v3' },
        warnings: /models|chr_v3|clip/,
      });
      await gm(page, 'level 32', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'set set_dia_giap', 1500);
      await gm(page, `method ${METHOD} 5`, 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 2500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      const facing = await page.evaluate(() => window.__game!.facing as number);
      const shot = async (state: string, nm: string, size: string, yaw: number, pitch: number, dist: number) => {
        await cam(page, { yaw: facing + yaw, pitch, dist });
        // kiếm cầm tay: ra đòn rồi chụp sau 0,9 s (kiếm chỉ rút khi giao chiến, tra lại sau vài giây) để thấy ánh kiếm điện ở tay
        await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.attack());
        await sleep(900);
        fs.writeFileSync(path.join(r.out, `loitu-${gname}-${state}-${nm}-${size}.png`), await page.screenshot());
      };
      const angles = [
        ['truoc', 0, 0.06, 3.0],
        ['trai', -1.5708, 0.06, 3.0],
        ['sau', 3.1416, 0.06, 3.0],
        ['ba-phan-tu', 0.7, 0.1, 3.0],
        ['tay', -0.8, -0.05, 1.7],
      ] as const;
      for (const [size, [w, h]] of Object.entries(SIZES)) {
        await page.setViewportSize({ width: w, height: h });
        for (const [nm, yaw, pitch, dist] of angles) await shot('thuong', nm, size, yaw, pitch, dist);
      }
      // HUD: Lôi tích đầy một nửa + Lôi ấn trên mục tiêu sau một đòn Lôi Ấn Kích (quái cách người ~7 m, chọn đúng mục tiêu).
      await gm(page, 'tp 2048 2095', 1800);
      await gm(page, `spawn ${MON} 1`, 1800);
      await gm(page, 'tp 2048 2088', 1800);
      await gm(page, 'cd', 1300);
      await page.evaluate((mon) => {
        const gg = window.__game as unknown as {
          view: { monsters: Map<string, { t: string; st: number }> };
          setTarget?: (id: string, kind: string) => void;
          bar(): { id: string }[];
          useSkill(i: number): void;
        };
        const e = [...gg.view.monsters.entries()].find(([, m]) => m.t === mon && m.st !== 3);
        if (e) gg.setTarget?.(e[0], 'mon');
        gg.useSkill(gg.bar().findIndex((s) => s.id === 'skl_loi_an_kich'));
      }, MON);
      await sleep(900);
      for (const [size, [w, h]] of Object.entries(SIZES)) {
        await page.setViewportSize({ width: w, height: h });
        await cam(page, { yaw: facing + 1.25, pitch: 0.35, dist: 7 });
        await sleep(900);
        fs.writeFileSync(path.join(r.out, `loitu-${gname}-hud-${size}.png`), await page.screenshot());
      }
      await ctx.close();
      await sleep(30_000); // nghỉ giữa các bộ (tránh nhân vật ma khi reconnect)
    }
  },
} satisfies Scenario;
