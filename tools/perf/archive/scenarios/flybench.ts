// V-P10: đo draw call + thời gian khung CẢNH BAY THẬT ở sân tông môn Lạc Kiếm Tông, camera chéo mặc định. Bốn mức: đứng yên (nền), bay một mình, bay cùng N bot đang bay.
// Bot bay liên tục (`--fly`), tụ quanh người chơi (`--crowd` + `--tp`). `--noink`: đối chứng bản cũ không lớp mực vệt (`?trailink=0`). Kết quả ở `flybench.json`.
// ĐO THỜI GIAN KHUNG nên phải chạy RIÊNG (không song song với việc khác).
//   pnpm shots flybench --out <thư mục> [--bots 8] [--noink] [--view 720p|1080p]
import { num, opt, flag } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, perfSample } from '../lib/game';
import { Bots } from '../lib/bots';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'flybench',
  desc: 'V-P10: đo draw call/khung của cảnh bay (đứng yên, bay một mình, bay cùng N bot) ở sân tông môn',
  usage: '[--bots 8] [--noink] [--view 720p|1080p]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
  async run(r) {
    const view = opt('--view', '720p');
    const { ctx, page } = await r.open({
      name: 'FlyBench',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      seenIntro: true,
      look: { g: 'm' },
      query: { realm: 'nk12', god: 1, chr: 'v3', quiet: 1, ...(flag('--noink') ? { trailink: 0 } : {}) },
      hide: 'hud',
    });
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 120_000 });
    await sleep(2500);
    await gm(page, 'level 32', 1500);
    await gm(page, 'tp 2048 2095', 1800);
    await gm(page, 'killall', 800);
    const fly = () => page.evaluate(() => (window.__game as unknown as { toggleFly(): void }).toggleFly());
    const log: Record<string, unknown> = { view, noink: flag('--noink') };
    log.dungYen = await perfSample(page);
    log.dungYen2 = await perfSample(page);
    await fly();
    await sleep(1500);
    await page.keyboard.down('KeyD');
    await sleep(1200);
    log.bayMotMinh = await perfSample(page);
    log.bayMotMinh2 = await perfSample(page);
    await snap(page, r.out, `bay-mot-minh-${view}.jpg`, { wait: 200 });
    const n = num('--bots', 8);
    if (n > 0) {
      const bots = new Bots(r.port);
      try {
        log.botsVao = await bots.start(n, 'fb', ['--fly', '--crowd', '2048,2095,8', '--tp', '--level', '32']);
        await sleep(6000);
        log.bayCungBot = await perfSample(page);
        log.bayCungBot2 = await perfSample(page);
        await snap(page, r.out, `bay-${n}-bot-${view}.jpg`, { wait: 200 });
      } finally {
        await bots.stop();
      }
    }
    await page.keyboard.up('KeyD');
    writeJson(r.out, 'flybench.json', log);
    console.log(JSON.stringify(log, null, 1));
    await ctx.close();
  },
} satisfies Scenario;
