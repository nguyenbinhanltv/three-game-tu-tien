// Chân Cảnh C1/C2: nhân vật đọc rõ ở góc 52°. Chụp mình ở Lạc Kiếm Tông (ngày) hoặc một phó bản tối, tùy chọn có sói để thấy khung
// +30 ms sau trúng đòn; `--query hero=0` là đối chứng (không viền/đèn phụ). Đo draw call/khung ở `herolight.json`.
//   pnpm shots herolight --out <thư mục> [--view 720p|1080p] [--tag sau|truoc] [--level van_lam|kiem_trung] [--hit 1]
import { num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, faceMonster, gm, perfSample, skipCutscene } from '../lib/game';
import { Bots } from '../lib/bots';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'herolight',
  desc: 'Hero light + tỉ lệ nhân vật (C1/C2): ảnh nhân vật mình ở sân tông môn/phó bản tối, tùy chọn +30 ms sau đòn, đo draw call',
  usage: '[--view 720p|1080p] [--tag sau|truoc] [--level van_lam] [--hit 1] [--bots 4: thêm bot đánh quái quanh sân] [--query hero=0]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
  async run(r) {
    const view = opt('--view', '720p');
    const tag = opt('--tag', 'sau');
    const level = opt('--level', 'van_lam');
    const slow = num('--slowmo', 0.1);
    const hit = num('--hit', 0) > 0;
    const { page } = await r.open({
      name: 'HeroLight',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', ...(hit ? { slowmo: slow } : {}), quiet: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
      hide: 'chat',
    });
    await gm(page, `level ${num('--lv', 12)}`, 900);
    await gm(page, 'god on', 900);
    await enterLevel(page, level);
    await skipCutscene(page, 20);
    await gm(page, 'killall', 900);
    await cam(page, { pitch: 0.9, dist: 9 });
    const log: Record<string, unknown> = { level };
    const nBots = num('--bots', 0);
    const bots = nBots > 0 ? new Bots(r.port) : null;
    if (bots) {
      log.bots = await bots.start(nBots, 'hb', ['--fight', '2048,2090,7', '--tp', '--level', '12']);
      await gm(page, 'spawn mon_soi_xam 3', 3500);
      await sleep(4000);
    }
    await snap(page, r.out, `${tag}-${view}-${level}${nBots ? '-dong' : ''}-dung.png`, { wait: 800 });
    log.perf = await perfSample(page);
    // Chẩn đoán hero light: vòng chân, số mesh mang userData.hero, bản sao viền tối, xương có scale khác 1.
    log.diag = await page.evaluate(`(() => {
      var g = window.__game; var out = { ring: null, hero: 0, ghosts: 0, scaled: [], bones: [] };
      g.scene.traverse(function (o) {
        if (o.name === 'hero-ring') out.ring = { visible: o.visible, count: o.count, parent: !!o.parent };
        if (o.userData && o.userData.hero) out.hero++;
        if (o.userData && o.userData.heroGhost) out.ghosts++;
        if (o.isBone && out.bones.length < 60 && /shoulder|clavicle|hand|head/i.test(o.name)) out.bones.push(o.name + ':' + o.scale.x.toFixed(2));
        if (o.isBone && o.scale && Math.abs(o.scale.x - 1) > 0.01) out.scaled.push(o.name + ':' + o.scale.x.toFixed(2));
      });
      return out;
    })()`);
    if (hit) {
      await gm(page, 'spawn mon_soi_xam 1', 3000);
      await faceMonster(page, 'mon_soi_xam', {});
      await page.evaluate(`(() => {
        var g = window.__game;
        var ent = Array.from(g.view.monsters.entries()).find(function (e) { return e[1].t === 'mon_soi_xam' && e[1].st !== 4; });
        window.__hit = null;
        if (!ent) return;
        g.targetId = ent[0];
        var hp0 = ent[1].hp;
        var tick = function () {
          var cur = g.view.monsters.get(ent[0]);
          if (cur && cur.hp < hp0) window.__hit = { at: performance.now() };
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);
      const idx = await page.evaluate(() => window.__game!.bar().findIndex((b) => b.id === 'skl_kiem_khi_tram'));
      if (idx >= 0) await page.evaluate((i) => window.__game!.useSkill(i), idx);
      const t0 = Date.now();
      let got = false;
      while (Date.now() - t0 < 6000 && !got) {
        got = await page.evaluate(() => !!(window as unknown as { __hit?: unknown }).__hit);
        if (!got) await sleep(10);
      }
      log.hit = got;
      if (got) {
        const seen = Date.now();
        for (const ms of [30, 150]) {
          await sleep(Math.max(0, ms / slow - (Date.now() - seen)));
          await snap(page, r.out, `${tag}-${view}-${level}${nBots ? '-dong' : ''}-hit-plus${ms}ms.png`, { wait: 0 });
        }
      }
    }
    await bots?.stop();
    writeJson(r.out, `${tag}-${view}-${level}${nBots ? '-dong' : ''}-herolight.json`, log);
  },
} satisfies Scenario;
