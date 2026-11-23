// Chân Cảnh C3b: trúng đòn theo hướng (trước/sau/trái/phải) × cấp đòn, ngã chết ra xa người hạ gục.
//   pnpm shots hitdir --out <thư mục> --mode video [--die front|back] [--gender m|f]   → webm ~15 s: 4 hướng nhẹ, 2 hướng nặng, rồi chết
//   pnpm shots hitdir --out <thư mục> --mode stills [--gender m|f]                      → ảnh +30 ms và +150 ms sau đòn nặng từ trước/sau (chạy chậm `?slowmo=`)
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { num, opt } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

const LABEL = `(t) => {
  var d = document.getElementById('anim-label');
  if (!d) { d = document.createElement('div'); d.id = 'anim-label';
    d.style.cssText = 'position:fixed;left:12px;top:10px;z-index:99999;padding:6px 12px;background:#000a;color:#fff;font:600 20px sans-serif;border-radius:6px;pointer-events:none';
    document.body.appendChild(d); }
  d.textContent = t;
}`;

/** Gọi `model.hitReact` của mình từ phía `side` (hướng tính theo hướng nhìn hiện tại của model). Chuỗi thuần: tsx chèn __name vào hàm lồng. */
const hitJs = (side: string, tier: number, heavy: boolean) => `(() => {
  var g = window.__game; var m = g.ents.players.get(g.sid).model; var y = m.root.rotation.y;
  var f = [Math.sin(y), Math.cos(y)]; var l = [Math.cos(y), -Math.sin(y)];
  var d = { front: [-f[0], -f[1]], back: f, left: l, right: [-l[0], -l[1]] }['${side}'];
  m.hitReact({ crit: false, heavy: ${heavy}, tier: ${tier}, delay: 0, noStop: true, dirX: d[0], dirZ: d[1] });
})()`;

export default {
  name: 'hitdir',
  desc: 'C3b: trúng đòn 4 hướng × cấp đòn + ngã chết ra xa người hạ gục (video ~15 s hoặc ảnh +30/+150 ms)',
  usage: '--mode video|stills|dash [--die front|back] [--gender m|f] [--slowmo 0.1]',
  async run(r) {
    const mode = opt('--mode', 'video');
    const g = opt('--gender', 'm');
    const die = opt('--die', 'front');
    const slow = num('--slowmo', 0.1);
    const tag = `${g === 'm' ? 'nam' : 'nu'}`;
    const videoDir = path.join(r.out, `_rec-${tag}-${die}`);
    const { ctx, page } = await r.open({
      name: `HD${g}`,
      viewport: [960, 600],
      quality: 'high',
      look: { g },
      query: { chr: 'v3', cam: 'iso', ...(mode === 'stills' ? { slowmo: slow } : {}) },
      hide: 'hud',
      warnings: /models|chr_v3|clip/,
      ...(mode === 'video' ? { video: videoDir } : {}),
    });
    await gm(page, 'level 15', 1500);
    await gm(page, 'god on', 1200);
    await gm(page, 'killall', 800);
    await gm(page, 'tp 2048 2088', 1500);
    await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
      timeout: 60_000,
      polling: 300,
    });
    await sleep(3500);
    await cam(page, { pitch: 0.9, dist: 6 });
    if (mode === 'dash') {
      // C3e: lướt tấn công (`Sword_Dash`) so với lướt thuần (`Roll`): gọi `dashFrom` trượt 3 m về phía trước, chụp +100/+220 ms thật.
      for (const [name, strike] of [
        ['lan', false],
        ['dao', true],
      ] as const) {
        await sleep(2500);
        await page.evaluate(`(() => {
          var g = window.__game; var m = g.ents.players.get(g.sid).model; var y = m.root.rotation.y;
          m.dashFrom(g.cur.x - Math.sin(y) * 3, g.cur.z - Math.cos(y) * 3, 0.35, ${strike});
        })()`);
        for (const ms of [100, 220]) {
          await sleep(ms - (ms === 220 ? 100 : 0));
          await snap(page, r.out, `${tag}-luot-${name}-plus${ms}ms.png`, { wait: 0 });
        }
      }
      return;
    }
    const label = (t: string) => page.evaluate(`(${LABEL})(${JSON.stringify(t)})`);
    if (mode === 'stills') {
      for (const [side, tier, heavy] of [
        ['front', 2, true],
        ['back', 2, true],
        ['left', 1, false],
        ['right', 1, false],
      ] as const) {
        await sleep(2500);
        await page.evaluate(hitJs(side, tier, heavy));
        for (const ms of [30, 150]) {
          await sleep(ms / slow - (ms === 150 ? 30 / slow : 0));
          await snap(page, r.out, `${tag}-${side}-t${tier}-plus${ms}ms.png`, { wait: 0 });
        }
      }
      // Chết: người hạ gục ở phía trước / phía sau; chụp 0,6 s và 1,8 s (đồng hồ game) sau lúc chết.
      await page.evaluate(hitJs(die, 3, true));
      await sleep(150 / slow);
      await gm(page, 'die', 100);
      for (const ms of [600, 1800]) {
        await sleep(ms / slow - (ms === 1800 ? 600 / slow : 0));
        await snap(page, r.out, `${tag}-chet-${die}-plus${ms}ms.png`, { wait: 0 });
      }
      return;
    }
    const seq: [string, string, number, boolean][] = [
      ['trước (nhẹ)', 'front', 0, false],
      ['sau (nhẹ)', 'back', 0, false],
      ['trái (vừa)', 'left', 1, false],
      ['phải (vừa)', 'right', 1, false],
      ['trước (nặng)', 'front', 2, true],
      ['sau (nặng)', 'back', 2, true],
      ['trước (chiêu cuối)', 'front', 3, true],
    ];
    for (const [name, side, tier, heavy] of seq) {
      await label(`trúng đòn ${name}`);
      await page.evaluate(hitJs(side, tier, heavy));
      await sleep(heavy ? 2000 : 1300);
    }
    await label(`chết: người hạ gục ở phía ${die === 'front' ? 'trước' : 'sau'}`);
    await page.evaluate(hitJs(die, 3, true));
    await sleep(150);
    await gm(page, 'die', 100);
    await sleep(3500);
    const vid = page.video();
    await ctx.close();
    if (vid) fs.copyFileSync(await vid.path(), path.join(r.out, `hitdir-${tag}-chet-${die}.webm`));
    fs.rmSync(videoDir, { recursive: true, force: true });
  },
} satisfies Scenario;
