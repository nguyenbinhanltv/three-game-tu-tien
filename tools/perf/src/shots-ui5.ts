// pnpm shots:ui5: ảnh kiểm UI-5 (hoàn thiện): bảng độ kiếp, hồi sinh, nhiều độ phân giải (1366×768, 1080p, 1440p, 4K) và đo UI.
//   tsx src/shots-ui5.ts --out <thư mục tuyệt đối> [--scenes do-kiep,hoi-sinh,kich-thuoc] [--variants truoc,sau]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2692/5292); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ui5'));
const PORT = Number(process.env.PORT ?? 2692);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5292);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-ui5', command: 'pnpm shots:ui5' });
type G = { __game?: Record<string, any> };
const only = opt('--scenes', '').split(',').filter(Boolean);
const variants = opt('--variants', 'truoc,sau').split(',') as ('truoc' | 'sau')[];
const want = (id: string) => !only.length || only.includes(id);
const SIZES: [string, number, number][] = [
  ['1366x768', 1366, 768],
  ['1080p', 1920, 1080],
  ['1440p', 2560, 1440],
  ['4k', 3840, 2160],
];
const gm = async (page: Page, m: string) => {
  await page.evaluate((x) => (window as unknown as G).__game!.send('chat', { m: x }), m);
  await sleep(1200);
};
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 70 });
const sized = async (page: Page, id: string, v: string, sizes = SIZES) => {
  for (const [tag, w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(1000);
    await shot(page, `${id}-${v}-${tag}`);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    for (const v of variants) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      const name = 'Ui5' + v[0] + (Date.now() % 100000);
      await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&ngj=${v === 'sau' ? 1 : 0}&auto=${name}&god=1&realm=nk15&at=tong_mon`, { waitUntil: 'load' });
      await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
      await sleep(6500);
      if (want('kich-thuoc')) {
        // HUD + bảng Nhân vật + bảng Túi cùng mở ở từng cỡ, rồi thu nhỏ khi đang mở: kiểm bố cục 1366×768 → 4K
        for (const [tag, w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          await sleep(900);
          await page.keyboard.press('c');
          await sleep(300);
          await page.keyboard.press('b');
          await sleep(900);
          await shot(page, `kich-thuoc-${v}-${tag}`);
          await page.keyboard.press('c');
          await page.keyboard.press('b');
          await sleep(300);
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await sleep(600);
        await page.keyboard.press('c');
        await sleep(300);
        await page.keyboard.press('b');
        await sleep(600);
        await page.setViewportSize({ width: 1366, height: 768 });
        await sleep(1200);
        await shot(page, `kich-thuoc-thu-nho-${v}-1366x768`);
        await page.keyboard.press('c');
        await page.keyboard.press('b');
        await page.setViewportSize({ width: 1920, height: 1080 });
        await sleep(500);
      }
      if (want('do-kiep')) {
        await gm(page, '/gm trib');
        await sleep(4500); // sau thẻ chương: băng pha độ kiếp
        await sized(page, 'do-kiep', v, SIZES.slice(0, 3));
        await sleep(3000);
      }
      if (want('hoi-sinh')) {
        await gm(page, '/gm god off');
        await gm(page, '/gm die');
        await sleep(3500);
        await sized(page, 'hoi-sinh', v, SIZES.slice(0, 3));
      }
      log[v] = { errors: errors.slice(0, 6) };
      await ctx.close();
    }
    fs.writeFileSync(path.join(OUT, 'ui5-log.json'), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
