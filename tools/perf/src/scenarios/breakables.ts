// Chân Cảnh S1c: vật thể vỡ ở Lạc Kiếm Tông. Đứng cạnh cụm vò/bia, gọi một sói, ra Kiếm Khí Trảm (cấp nặng), chụp: nguyên vẹn,
// rồi +30 ms, +150 ms, +600 ms (đồng hồ game, `?slowmo=`) sau lúc trúng. `--query brk=0` chụp bản không có vật vỡ (đối chứng).
//   pnpm shots breakables --out <thư mục> [--view 720p|1080p] [--tag sau] [--slowmo 0.1] [--at 2052.5,2090.4]
import { num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, faceMonster, gm, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'breakables',
  desc: 'Vật thể vỡ (vò, bia, cọc) ở Lạc Kiếm Tông: nguyên vẹn → vỡ +30/+150/+600 ms (720p/1080p)',
  usage: '[--view 720p|1080p] [--tag sau] [--slowmo 0.1] [--at x,z] [--query brk=0]',
  async run(r) {
    const view = opt('--view', '720p');
    const tag = opt('--tag', 'sau');
    const slow = num('--slowmo', 0.1);
    const [ax, az] = opt('--at', '2052.5,2090.4').split(',').map(Number) as [number, number];
    const { page } = await r.open({
      name: 'Breakables',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', slowmo: slow, quiet: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
      hide: 'chat',
    });
    await gm(page, 'level 12', 900);
    await gm(page, 'god on', 900);
    await enterLevel(page, 'van_lam');
    await skipCutscene(page, 20);
    await tp(page, ax, az);
    await gm(page, 'killall', 900);
    await cam(page, { pitch: 0.9, dist: 9, yaw: Math.PI });
    await snap(page, r.out, `${tag}-${view}-0-nguyen-ven.png`, { wait: 700 });
    await gm(page, 'spawn mon_soi_xam 1', 3000);
    await cam(page, { pitch: 0.9, dist: 9 });
    await faceMonster(page, 'mon_soi_xam', {});
    const log: Record<string, unknown> = {};
    log.mons = await page.evaluate(() => {
      const g = window.__game!;
      return {
        me: { x: g.cur.x, z: g.cur.z },
        mons: [...g.view.monsters.values()].filter((m) => m.t === 'mon_soi_xam').map((m) => ({ x: m.x, z: m.z })),
      };
    });
    // Chuỗi thuần để tsx không chèn `__name` vào hàm chạy trong trang. Mốc = lần đầu có mảnh vỡ bay (lúc vật vỡ).
    await page.evaluate(`(() => {
      var g = window.__game;
      var ent = Array.from(g.view.monsters.entries()).find(function (e) { return e[1].t === 'mon_soi_xam' && e[1].st !== 4; });
      window.__hit = null;
      if (ent) g.targetId = ent[0];
      var hp0 = ent ? ent[1].hp : 0;
      var tick = function () {
        var cur = ent ? g.view.monsters.get(ent[0]) : null;
        // Có vật vỡ: mốc là lúc mảnh bay; không có (?brk=0, đối chứng): mốc là lúc quái mất máu.
        if (g.breakables ? g.breakables.shardCount > 0 : cur && cur.hp < hp0) window.__hit = { at: performance.now() };
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
    log.hit = hit;
    if (hit) {
      const seen = Date.now();
      for (const ms of [30, 150, 600]) {
        await sleep(Math.max(0, ms / slow - (Date.now() - seen)));
        await snap(page, r.out, `${tag}-${view}-plus${ms}ms.png`, { wait: 0 });
      }
      log.after = await page.evaluate(() => {
        const b = (window.__game as unknown as { breakables?: { aliveCount: number; shardCount: number } }).breakables;
        return b ? { alive: b.aliveCount, shards: b.shardCount } : null;
      });
    }
    writeJson(r.out, `${tag}-${view}-breakables.json`, log);
  },
} satisfies Scenario;
