// Chân Cảnh S1b: cảm giác đòn nặng. Gọi một quái, ra chiêu nặng (Kiếm Khí Trảm), chụp khung +30 ms và +150 ms (đồng hồ game)
// sau lúc đòn trúng. Chạy chậm thời gian (`?slowmo=`, bản dev) để chụp đúng mốc; chạy hai lần (trước/sau S1b) rồi so ảnh.
//   pnpm shots hitfeel --out <thư mục> [--view 720p|1080p] [--tag truoc|sau] [--slowmo 0.1]
import { num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, faceMonster, gm, skipCutscene } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'hitfeel',
  desc: 'Đòn nặng: ảnh khung +30 ms và +150 ms sau lúc trúng (720p/1080p), để so trước/sau S1b',
  usage: '[--view 720p|1080p] [--tag truoc|sau] [--slowmo 0.1] [--hits 2]',
  async run(r) {
    const view = opt('--view', '720p');
    const tag = opt('--tag', 'sau');
    const slow = num('--slowmo', 0.1);
    const { page } = await r.open({
      name: 'HitFeel',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', slowmo: slow, quiet: 1 },
      seenIntro: true,
      hide: 'chat',
    });
    await gm(page, 'level 12', 900);
    await gm(page, 'god on', 900);
    await enterLevel(page, 'van_lam');
    await skipCutscene(page, 20);
    const log: Record<string, unknown>[] = [];
    for (let k = 0; k < num('--hits', 2); k++) {
      await gm(page, 'killall', 900);
      await gm(page, 'heal', 900);
      await gm(page, 'spawn mon_soi_xam 1', 3000);
      await cam(page, { pitch: 0.9, dist: 9 });
      await faceMonster(page, 'mon_soi_xam', {});
      // Hẹn giờ trong trang: thấy máu quái giảm thì ghi mốc, Node chụp sau 30/150 ms thời gian game = 30/slow ms thật.
      // Chuỗi thuần để tsx không chèn `__name` vào hàm chạy trong trang.
      await page.evaluate(`(() => {
        var g = window.__game;
        var ent = Array.from(g.view.monsters.entries()).find(function (e) { return e[1].t === 'mon_soi_xam' && e[1].st !== 4; });
        window.__hit = null;
        if (!ent) return;
        var mid = ent[0];
        var hp0 = ent[1].hp;
        g.targetId = mid;
        var tick = function () {
          var cur = g.view.monsters.get(mid);
          if (cur && cur.hp < hp0) window.__hit = { at: performance.now(), hp0: hp0 };
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);
      const idx = await page.evaluate(() => window.__game!.bar().findIndex((b) => b.id === 'skl_kiem_khi_tram'));
      if (idx < 0) throw new Error('không có Kiếm Khí Trảm trên thanh chiêu');
      await page.evaluate((i) => window.__game!.useSkill(i), idx);
      const t0 = Date.now();
      let hit = false;
      while (Date.now() - t0 < 6000 && !hit) {
        hit = await page.evaluate(() => !!(window as unknown as { __hit?: unknown }).__hit);
        if (!hit) await sleep(10);
      }
      if (!hit) {
        log.push({ k, hit: false });
        continue;
      }
      const seen = Date.now();
      for (const ms of [30, 150]) {
        const wait = Math.max(0, ms / slow - (Date.now() - seen));
        await sleep(wait);
        await snap(page, r.out, `${tag}-${view}-hit${k}-plus${ms}ms.png`, { wait: 0 });
        log.push({ k, plus: ms, realDelayMs: Date.now() - seen });
      }
      await sleep(2500);
    }
    writeJson(r.out, `${tag}-${view}.json`, log);
  },
} satisfies Scenario;
