// Chân Cảnh C3c: giọng động tác đao tu (`dt`). Đao tu mặc Địa Long Hộ Giáp đánh một con sói: ba đòn thường rồi Kiếm Khí Trảm;
// chụp khung tụ lực (nửa đường tới hit), +30 ms và +150 ms sau khung `hit` (đồng hồ game, `?slowmo=`), từ hai góc (chéo mặc định và gần).
// Bản "trước" = đặt `voice` của `dao_tu` về `kt` trong paths.json (giọng kiếm tu cũ) rồi chạy lại với `--tag truoc`.
//   pnpm shots daotuhit --out <thư mục> [--tag sau|truoc] [--gender m|f] [--slowmo 0.1] [--video 1]
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { num, opt } from '../lib/env';
import { cam, faceMonster, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'daotuhit',
  desc: 'Đao tu giọng `dt`: ba đòn thường + Kiếm Khí Trảm, ảnh tụ lực/+30/+150 ms, tùy chọn video',
  usage: '[--tag sau|truoc] [--gender m|f] [--slowmo 0.1] [--video 1] [--method liet_nhan_dao_kinh] [--set set_dia_giap]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const g = opt('--gender', 'm');
    const gname = g === 'm' ? 'nam' : 'nu';
    const slow = num('--slowmo', 0.1);
    const video = num('--video', 0) > 0;
    const videoDir = path.join(r.out, `_rec-${tag}-${gname}`);
    const { ctx, page } = await r.open({
      name: `DH${g}`,
      viewport: [1280, 720],
      quality: 'high',
      look: { g },
      query: { chr: 'v3', cam: 'iso' },
      hide: 'hud',
      warnings: /models|chr_v3|clip/,
      ...(video ? { video: videoDir } : {}),
    });
    await gm(page, 'level 15', 1500);
    await gm(page, 'god on', 1200);
    await gm(page, `set ${opt('--set', 'set_dia_giap')}`, 1500);
    await gm(page, `method ${opt('--method', 'liet_nhan_dao_kinh')} 5`, 1200);
    await gm(page, 'killall', 800);
    await gm(page, 'tp 2048 2088', 1500);
    await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
      timeout: 60_000,
      polling: 300,
    });
    await sleep(3500);
    // Đồng hồ hiện trong video (ms từ lúc nạp trang, cùng gốc `performance.now()` của `<tag>-events.json`) để tìm khung theo sự kiện.
    if (video)
      await page.evaluate(`(() => {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;right:10px;top:10px;z-index:99999;padding:4px 10px;background:#000c;color:#0f0;font:700 22px monospace';
        document.body.appendChild(d);
        var f = function () { d.textContent = String(Math.round(performance.now())); requestAnimationFrame(f); };
        requestAnimationFrame(f);
      })()`);
    // Móc sự kiện chiêu của mình: ghi giờ `windup` và `hit` (chuỗi thuần để tsx không chèn __name).
    await page.evaluate(`(() => {
      var g = window.__game; window.__ev = [];
      g.onSkillEvent(function (sid, e) { if (sid === g.sid) window.__ev.push({ k: e.kind, s: e.skill, c: e.combo, at: performance.now(), hitIn: e.hitIn }); });
    })()`);
    // Chậm thời gian TRÌNH DIỄN của nhân vật mình (VS-1 `fxSlow`): server/mạng chạy thật, nên đòn không bị hủy như `?slowmo`.
    const slowOn = () =>
      video ? Promise.resolve() : page.evaluate(`window.__game.fxSlow = { scale: ${slow}, until: performance.now() + 9000 }`);
    const shoot = async (name: string, ms: number, evKind: 'hit' | 'windup', from: number) => {
      // Chờ sự kiện thứ `nth` (đếm theo loại), rồi chụp sau `ms` ms đồng hồ game (= ms/slow thật).
      const t0 = Date.now();
      let at = -1;
      while (Date.now() - t0 < 8000 && at < 0) {
        at = (await page.evaluate(
          `(() => { var l = window.__ev.slice(${from}).filter(function (x) { return x.k === '${evKind}'; }); return l[0] ? performance.now() - l[0].at : -1; })()`,
        )) as number;
        if (at < 0) await sleep(8);
      }
      if (at < 0) return false;
      const wait = ms / (video ? 1 : slow) - at;
      if (wait > 0) await sleep(wait);
      await snap(page, r.out, `${tag}-${gname}-${name}.png`, { wait: 0 });
      return true;
    };
    await gm(page, 'spawn mon_soi_xam 1', 3000);
    await cam(page, { pitch: 0.9, dist: 7 });
    await faceMonster(page, 'mon_soi_xam', {});
    await page.evaluate(`(() => { var g = window.__game; var e = Array.from(g.view.monsters.entries())[0]; if (e) g.targetId = e[0]; })()`);
    // Ba đòn thường: bấm mỗi 0,9 s (GCD 1 s).
    for (let i = 0; i < 3; i++) {
      const n0 = (await page.evaluate('window.__ev.length')) as number;
      await slowOn();
      await page.evaluate(() => window.__game!.useSkill(0));
      if (!video) {
        await shoot(`d${i + 1}-tu-luc`, 150, 'windup', n0);
        await shoot(`d${i + 1}-hit-plus30ms`, 30, 'hit', n0);
        await shoot(`d${i + 1}-hit-plus150ms`, 150, 'hit', n0);
      }
      await sleep(1300 / (video ? 1 : slow));
    }
    const kkt = await page.evaluate(() => window.__game!.bar().findIndex((b) => b.id === 'skl_kiem_khi_tram'));
    if (kkt >= 0) {
      const n1 = (await page.evaluate('window.__ev.length')) as number;
      await slowOn();
      await page.evaluate((i) => window.__game!.useSkill(i), kkt);
      if (!video) {
        await shoot('kkt-tu-luc', 150, 'windup', n1);
        await shoot('kkt-hit-plus30ms', 30, 'hit', n1);
        await shoot('kkt-hit-plus150ms', 150, 'hit', n1);
      }
      await sleep(1800 / (video ? 1 : slow));
    }
    fs.writeFileSync(path.join(r.out, `${tag}-${gname}-events.json`), JSON.stringify(await page.evaluate('window.__ev'), null, 1));
    if (video) {
      const vid = page.video();
      await ctx.close();
      if (vid) fs.copyFileSync(await vid.path(), path.join(r.out, `${tag}-${gname}-daotu.webm`));
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  },
} satisfies Scenario;
