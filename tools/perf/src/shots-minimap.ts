// pnpm --filter @dtl/perf shots:minimap --out <thư mục tuyệt đối> [--variant truoc|sau]
// Chụp bản đồ nhỏ ở 1080p, 1440p, 4K (DPR 1) và 1080p@2x: ảnh cắt riêng minimap + ảnh cả màn hình.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2697/5297); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-minimap'));
const V = opt('--variant', 'sau');
const PORT = Number(process.env.PORT ?? 2697);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5297);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-minimap', command: 'pnpm shots:minimap' });
type G = { __game?: Record<string, any> };
const ONLY = opt('--only', '');
const SIZES: [string, number, number, number][] = [
  ['1080p', 1920, 1080, 1],
  ['1440p', 2560, 1440, 1],
  ['4k', 3840, 2160, 1],
  ['1080p-dpr2', 1920, 1080, 2],
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    for (const [tag, w, h, dsf] of SIZES.filter((s) => !ONLY || s[0] === ONLY)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const name = 'Mm' + (Date.now() % 1000000);
      await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=${name}&god=1&realm=nk15&at=tong_mon`, { waitUntil: 'load' });
      await page.waitForFunction(() => { const g = (window as unknown as G).__game; return !!g && g.frames > 6 && !!g.me?.(); }, undefined, { timeout: 300_000, polling: 250 });
      await sleep(6500);
      await page.screenshot({ path: path.join(OUT, `full-${V}-${tag}.jpg`), type: 'jpeg', quality: 70 });
      const el = page.locator('.minimap-wrap');
      await el.screenshot({ path: path.join(OUT, `minimap-${V}-${tag}.png`) });
      const info = await page.evaluate(() => {
        const c = document.querySelector('.minimap canvas') as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        return { buf: c.width, cssPx: Math.round(r.width), dpr: devicePixelRatio, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') };
      });
      log[tag] = { ...info, errors: errors.slice(0, 4) };
      await ctx.close();
    }
    fs.writeFileSync(path.join(OUT, `minimap-${V}-log.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
