// pnpm shots:trib: ảnh ba pha độ kiếp (S2-C) + thẻ chương ngự kiếm lần đầu, GPU thật, tắt tiếng.
//   tsx src/shots-trib.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Vào bằng tài khoản thử với ?realm=nk15&god=1 (bất tử để xem trọn 40 giây) rồi `/gm trib`, chụp theo mốc giây tính từ lúc HUD độ kiếp hiện.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2608/5208); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-trib'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2608);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5208);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-trib', command: 'pnpm shots:trib' });
type G = { __game?: Record<string, any> };
const renderQ = (RENDERER === 'webgl2' ? '&renderer=webgl2' : '') + opt('--query', '');

/** Mốc chụp (giây từ lúc HUD hiện) → tên tệp. */
const MARKS: [number, string][] = [
  [5, '1-pha1-loi-van'],
  [27, '2z-pha2-cuoi'],
  [29.4, '3a-pha3-tia-cuoi-bao-truoc'],
  [31.6, '3b-pha3-tia-cuoi-no'],
  [36, '3c-pha3-mua-set'],
];

async function enter(page: Page, name: string, q: string): Promise<void> {
  // Bỏ cảnh mở đầu/thẻ chương Lạc Kiếm Tông lần đầu (nếu không nó chiếm màn hình lúc chụp).
  await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
  await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${renderQ}${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const w = (window as unknown as G).__game;
    return !!w && w.frames > 30 && !!w.me?.();
  }, undefined, { timeout: 120_000, polling: 250 });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const log: Record<string, unknown> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    // 1) Độ kiếp ba pha.
    {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
      await enter(page, 'Kiep' + (Date.now() % 100000), '&realm=nk15&god=1');
      await sleep(2500);
      // Kích bằng lệnh GM sau khi vào để HUD nhận đúng tin `tribstart` (qua `?tribulation=1` HUD dựng lại từ cờ nên lệch vài giây).
      await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm trib' }));
      await page.waitForSelector('.trib', { timeout: 30_000 });
      const t0 = Date.now();
      let netShots = 0;
      let seen = 0;
      /** Chờ tới giây `sec`; trong lúc đó (pha 2) thấy vạch lôi võng mới (vòng bán kính TRIB_NET.r = 2,1) thì chụp ngay (báo trước 1 s). */
      const waitTo = async (sec: number) => {
        while (t0 + sec * 1000 > Date.now()) {
          const n = await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).filter((h: { r?: number }) => h.r === 2.1).length);
          if (n > seen && netShots < 2 && Date.now() - t0 > 12_000) {
            seen = n;
            // Nhìn từ trên xuống ngay khi vạch tới (báo trước 1 s) để thấy đủ ba vạch, rồi cận cảnh góc thấp.
            await page.evaluate(() => {
              const g = (window as unknown as G).__game!;
              g.camPitch = 1.2;
              g.camDist = 30;
              g.camDistCur = 30;
            });
            await sleep(150);
            await page.screenshot({ path: path.join(OUT, `2-pha2-loi-vong-${++netShots}-tren-xuong.png`) });
            await page.evaluate(() => {
              const g = (window as unknown as G).__game!;
              g.camPitch = 0.45;
              g.camDist = 9;
              g.camDistCur = 9;
            });
          } else seen = Math.max(seen, n);
          await sleep(50);
        }
      };
      for (const [sec, file] of MARKS) {
        await waitTo(sec - 0.01);
        const wait = t0 + sec * 1000 - Date.now();
        if (wait > 0) await sleep(wait);
        await page.screenshot({ path: path.join(OUT, file + '.png') });
        console.log(`[shots-trib] ${file} @ ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      log.hazards = await page.evaluate(() => (window as unknown as G).__game!.hazardLog ?? []);
      await page.close();
    }
    // 2) Ngự kiếm lần đầu ở Ngưng Khí 3: thẻ chương + gợi ý.
    {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await enter(page, 'Bay' + (Date.now() % 100000), '&realm=3&god=1');
      await sleep(3000);
      await page.keyboard.press('KeyF');
      await sleep(1200);
      await page.screenshot({ path: path.join(OUT, '4-nghi-thuc-ngu-kiem.png') });
      await page.close();
    }
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'trib-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-trib] lỗi console:\n' + [...new Set(errors)].join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
