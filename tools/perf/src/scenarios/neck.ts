// Cận cổ nhân vật v3 (sửa lỗi cổ Tinh Khuyết nam / Thần Tàng nữ): cùng camera, ở ba tư thế (đứng, chạy, chém) + 4 góc 1080p.
// Dùng: pnpm shots neck --out <thư mục> --tag <truoc|sau> (hoặc biến NECK_TAG) [--sets tinh_khuyet:m,than_tang:f]
import fs from 'node:fs';
import path from 'node:path';
import { env, list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const GM: Record<string, string> = { tinh_khuyet: 'set set_tinh_khuyet', than_tang: 'set set_than_tang' };

export default {
  name: 'neck',
  desc: 'Cận cổ + 4 góc 1080p ở đứng/chạy/chém cho Tinh Khuyết nam, Thần Tàng nữ (trước/sau sửa cổ)',
  usage: '--out <dir> [--tag sau] [--sets tinh_khuyet:m,than_tang:f]',
  async run(r) {
    const tagP = opt('--tag', env('NECK_TAG', 'sau'));
    for (const sg of list('--sets', 'tinh_khuyet:m,than_tang:f')) {
      const [s, g] = sg.split(':');
      const tag = `${tagP}-${s}-${g === 'm' ? 'nam' : 'nu'}`;
      const { ctx, page } = await r.open({
        name: `N${g}${s}`,
        viewport: [1920, 1080],
        quality: 'high',
        look: { g },
        query: { chr: 'v3', ...Object.fromEntries(new URLSearchParams(env('NECK_QUERY', '')).entries()) },
        hide: 'hud',
        warnings: /models|chr_v3|clip/,
      });
      await gm(page, 'level 12', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, GM[s], 1500);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      await page.evaluate(() => {
        const gm_ = window.__game!;
        gm_.ents.players.get(gm_.sid).model.root.remove(gm_.ents.players.get(gm_.sid).label);
      });
      const base = await page.evaluate(() => window.__game!.facing as number);
      const shot = async (name: string, yaw: number, dist: number, pitch: number) => {
        await cam(page, { yaw: base + yaw, pitch, dist });
        await sleep(250);
        fs.writeFileSync(path.join(r.out, `${tag}-${name}.png`), await page.screenshot());
      };
      const FRONT = 0;
      const BACK = 3.1416;
      const pose = async (label: string, backOnly = false) => {
        // Đang chạy thì nhân vật luôn quay lưng về camera (hướng chạy = hướng camera): chỉ chụp phía sau, hai độ cao.
        const f0 = backOnly ? (await page.evaluate(() => window.__game!.facing as number)) - base : 0;
        const views: [string, number][] = backOnly
          ? [['back', BACK + f0]]
          : [
              ['front', FRONT],
              ['left', -1.5708],
              ['right', 1.5708],
              ['back', BACK],
            ];
        for (const [n, yaw] of views) await shot(`${label}-${n}`, yaw, 1.9, 0.02);
        const nviews: [string, number][] = backOnly
          ? [['neck-back', BACK + f0]]
          : [
              ['neck-front', 0.0],
              ['neck-34', 0.6],
              ['neck-back', BACK],
              ['neck-side', 1.5708],
            ];
        for (const [n, yaw] of nviews) await shot(`${label}-${n}`, yaw, 0.7, 0.02);
      };
      await sleep(500);
      await pose('idle');
      await page.keyboard.down('KeyW');
      await sleep(1300);
      await pose('jog', true);
      await page.keyboard.up('KeyW');
      await gm(page, 'spawn mon_soi_xam 2', 1500);
      await cam(page, { yaw: base + 0.5, pitch: 0.1, dist: 2.1 });
      await page.evaluate(() => window.__game!.useSkill(1));
      await sleep(260);
      await pose('slash');
      await ctx.close();
      console.log(`[shots:neck] ${tag} xong`);
    }
  },
} satisfies Scenario;
