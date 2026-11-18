// Texture tải dần (hạng mục 4): đứng cạnh một boss + tinh anh ở Vân Lam, chụp ảnh cận cảnh trước khi bậc texture cao về
// và sau khi `__hires()` báo đã nạp xong (hoặc hết giờ), kèm số tệp/MB. `--quality high|ultra`, `--wait 90` (giây).
import { num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, faceMonster, gm, skipCutscene } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

type W = { __hires?: () => { tier: number; loaded: number; memMB: number }; __game?: { info(): Record<string, unknown> } };

export default {
  name: 'hires',
  desc: 'Texture tải dần: ảnh cận cảnh boss/tinh anh trước và sau khi bậc texture cao về + số tệp, MB',
  usage: '[--quality high] [--wait 90] [--mons boss_han_giao,elite_huyet_nha_lang]',
  async run(r) {
    const quality = opt('--quality', 'high');
    const mons = opt('--mons', 'boss_han_giao,elite_huyet_nha_lang').split(',');
    const { page } = await r.open({ name: 'Hires', quality, query: { quiet: 1 }, extra: opt('--query', ''), hide: 'chat' });
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await skipCutscene(page, 20);
    for (const m of mons) await gm(page, `spawn ${m} 1`, 1500);
    const view = { pitch: 0.25, dist: 6, yaw: Math.PI };
    await cam(page, view);
    await faceMonster(page, mons[0], view);
    const info = () => page.evaluate(() => { const w = window as unknown as W; const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } };
      return { hires: w.__hires?.() ?? null, game: w.__game?.info() ?? null, nav: { mem: n.deviceMemory, save: n.connection?.saveData, type: n.connection?.effectiveType, down: n.connection?.downlink, q: localStorage.getItem('dtl.quality') } }; });
    await sleep(1500);
    await snap(page, r.out, `truoc-${quality}.jpg`, { wait: 300 });
    const before = await info();
    const deadline = Date.now() + num('--wait', 90) * 1000;
    let last = before.hires?.loaded ?? 0;
    let stable = 0;
    while (Date.now() < deadline && stable < 8) {
      await sleep(2000);
      const n = (await info()).hires?.loaded ?? 0;
      stable = n > 0 && n === last ? stable + 1 : 0;
      last = n;
    }
    await sleep(800);
    await snap(page, r.out, `sau-${quality}.jpg`, { wait: 300 });
    writeJson(r.out, 'hires.json', { quality, before, after: await info() });
  },
} satisfies Scenario;
