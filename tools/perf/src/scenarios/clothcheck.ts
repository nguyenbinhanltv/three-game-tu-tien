// Chân Cảnh C4 (Thiên Y pilot): Tinh Khuyết nữ, lò xo hiện tại (`lo-xo`) so với vải mô phỏng `?cloth=1` (`thien-y`).
// Mỗi bản: đứng, chạy, lướt, đòn nặng, đả tọa, ngự kiếm; ảnh cận cảnh mỗi tình huống + đo ms/khung của vải (cloth.stats) và số đỉnh.
//   pnpm shots clothcheck --out <thư mục> [--variants lo-xo,thien-y] [--size 1280x720|1920x1080]
import { sleep } from '../lib/devserver';
import fs from 'node:fs';
import { Bots } from '../lib/bots';
import { list, num, opt, size } from '../lib/env';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';
import path from 'node:path';

/** Bộ v3 có lưới vải tách riêng (`--split-cloth`): id bộ → lệnh GM mặc bộ. */
const SET_GM: Record<string, string> = {
  co_thanh: 'set set_co_thanh',
  dia_long: 'set set_dia_giap',
  kinh_quang: 'set set_kinh_quang',
  liet_mach: 'set set_liet_mach',
  luu_ly: 'set set_luu_ly',
  phuc_mach: 'set set_phuc_mach',
  than_tang: 'set set_than_tang',
  tinh_khuyet: 'set set_tinh_khuyet',
  van_kinh: 'set set_van_kinh',
};

export default {
  name: 'clothcheck',
  desc: 'C4: Tinh Khuyết nữ lò xo vs vải Thiên Y (?cloth=1): đứng/chạy/lướt/đòn nặng/đả tọa/ngự kiếm + đo ms/khung của vải',
  usage: '[--set tinh_khuyet] [--gender f|m] [--variants lo-xo,thien-y] [--size 1920x1080] [--video 1] [--bots 9]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '64' },
  async run(r) {
    const viewport = size('1920x1080');
    const variants = list('--variants', 'lo-xo,thien-y');
    const setId = opt('--set', 'tinh_khuyet');
    const gen = opt('--gender', 'f');
    const gname = gen === 'm' ? 'nam' : 'nu';
    // Hướng chạy chọn chỗ trống (không cây/băng rôn): `--run KeyW,KeyA`.
    const RUN = list('--run', 'KeyW,KeyA');
    const result: Record<string, unknown> = {};
    const video = num('--video', 0) > 0;
    const nBots = num('--bots', 0);
    for (const variant of variants) {
      const dpr = num('--dpr', 1);
      const tag = `${setId}-${gname}-${variant}-${viewport[1]}p${dpr > 1 ? '-can' : ''}`;
      const { page } = await r.open({
        name: `C${variant}`,
        viewport,
        quality: 'high',
        dpr,
        look: { g: gen },
        query: { chr: 'v3', cam: 'iso', ...(variant === 'thien-y' ? { cloth: '1' } : {}) },
        hide: 'hud',
        warnings: /models|chr_v3|clip/,
        ...(video ? { video: path.join(r.out, `_rec-${variant}`) } : {}),
      });
      const bots = nBots > 0 ? new Bots(r.port) : null;
      if (bots)
        await bots.start(nBots, `cb${variant.slice(0, 2)}`, [
          '--genders',
          gen,
          '--set',
          SET_GM[setId]!.replace('set ', ''),
          '--level',
          '15',
          '--crowd',
          '2048,2088,6',
          '--tp',
        ]);
      await gm(page, 'level 15', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, SET_GM[setId] ?? `set set_${setId}`, 1500);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
        timeout: 60_000,
        polling: 300,
      });
      await sleep(3500);
      const shot = async (n: string) => {
        const c = (await page.evaluate(`(() => {
          var g = window.__game; var v = g.renderPos.clone(); v.y += 0.9; v.project(g.camera);
          return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
        })()`)) as { x: number; y: number };
        // Cắt ĐÚNG độ phân giải gốc (không phóng): 1080p cắt 400×440 px, 720p 300×330 px; `--dpr 2` kết xuất gấp đôi và cắt 200×220 px CSS (ảnh cận 400×440 px thật).
        const base = viewport[0] >= 1900 ? 400 : 300;
        const w = Math.round(base / dpr);
        const h = Math.round((base * 1.1) / dpr);
        const x = Math.max(0, Math.min(viewport[0] - w, Math.round(c.x - w / 2)));
        const y = Math.max(0, Math.min(viewport[1] - h, Math.round(c.y - h / 2)));
        await page.screenshot({ path: path.join(r.out, `${tag}-${n}.png`), clip: { x, y, width: w, height: h } });
      };
      const hold = async (keys: string[], ms: number) => {
        for (const k of keys) await page.keyboard.down(k);
        await sleep(ms);
        for (const k of keys) await page.keyboard.up(k);
      };
      const stats = () =>
        page.evaluate(`(() => { var g = window.__game; var c = g.ents.players.get(g.sid).model.cloth; return c ? c.stats : null; })()`);
      const ms: Record<string, unknown> = {};
      await page.evaluate(
        `(() => { var g = window.__game; var c = g.ents.players.get(g.sid).model.cloth; if (c) c.measurePen = true; })()`,
      );
      // Tổng vải của mọi nhân vật trong cảnh: số bộ vải đang mô phỏng, tổng ms/khung (trung bình trượt), đỉnh xuyên thân lớn nhất của mình.
      const crowd = () =>
        page.evaluate(
          `(() => { var g = window.__game; var n = 0, ms = 0, all = 0, v3 = 0, withCloth = 0; g.ents.players.forEach(function (e) { all++; var m = e.model; if (m && m.v3) v3++; var c = m && m.cloth; if (c) withCloth++; if (c && c.active) { n++; ms += c.stats.ms; } }); var b = window.__game.ents.players.get(window.__game.sid).model.cloth.budget; return { frameAvgMs: b.avg, frameMaxMs: b.max, players: all, v3: v3, withCloth: withCloth, rigs: n, totalMs: ms }; })()`,
        );
      if (variant === 'thien-y')
        console.log(
          '[clothcheck] oldsleeve:',
          await page.evaluate(
            `(() => { var g = window.__game; var c = g.ents.players.get(g.sid).model.cloth; return c.oldMeshes.map(function (m) { var mt = m.material; return m.name + ' map=' + !!(mt && mt.map) + ' img=' + (mt && mt.map && mt.map.image && (mt.map.image.constructor.name + ':' + mt.map.image.width)) + ' uv=' + !!m.geometry.getAttribute('uv') + ' color=' + (mt && mt.color && mt.color.getHexString()); }).join(' | '); })()`,
          ),
        );
      await sleep(bots ? 6000 : 1200);
      if (bots) console.log('[clothcheck] cảnh đông:', JSON.stringify(await crowd()));
      await shot('1-dung');
      ms.dung = await stats();
      for (const k of RUN) await page.keyboard.down(k);
      await sleep(1400);
      await shot('2-chay');
      ms.chay = await stats();
      for (const k of RUN) await page.keyboard.up(k);
      await hold(RUN, 400);
      await page.keyboard.press('KeyQ');
      await sleep(250);
      await shot('3-luot');
      await sleep(900);
      await gm(page, 'spawn mon_soi_xam 1', 2500);
      await page.evaluate(() => window.__game!.useSkill(1));
      await sleep(400);
      await shot('4-don-nang');
      await sleep(900);
      await gm(page, 'killall', 800);
      await page.keyboard.press('KeyZ');
      await sleep(1800);
      await shot('5-da-toa');
      ms.datoa = await stats();
      await page.keyboard.press('KeyW');
      await sleep(500);
      await page.evaluate(() => window.__game!.toggleFly());
      await sleep(2200);
      await shot('6-ngu-kiem');
      ms.ngukiem = await stats();
      if (nBots > 0) ms.dong = await crowd();
      await page.evaluate(() => window.__game!.toggleFly());
      result[tag] = ms;
      if (bots) await bots.stop();
      if (video) {
        const vid = page.video();
        await page.context().close();
        if (vid) fs.copyFileSync(await vid.path(), path.join(r.out, `${tag}.webm`));
        fs.rmSync(path.join(r.out, `_rec-${variant}`), { recursive: true, force: true });
      } else await page.close();
    }
    writeJson(r.out, `clothcheck-${setId}-${gname}-${viewport[1]}p-${variants.join('_')}.json`, result);
  },
} satisfies Scenario;
