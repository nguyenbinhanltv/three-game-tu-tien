// pnpm shots:e2d: dãy ảnh Đan Hỏa Kiếp (E2-D, Kết Đan 55 s) + thẻ Chương 2, GPU thật, tắt tiếng.
//   tsx src/shots-e2d.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Vào bằng tài khoản thử với ?realm=nk15&god=1 rồi `/gm trib ket_dan` (đưa về Trúc Cơ 19 viên mãn, cấp Kết Đan Dịch), chụp theo mốc giây từ lúc HUD kiếp hiện.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2618/5218); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e2d'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2618);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5218);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2d', command: 'pnpm shots:e2d' });
type G = { __game?: Record<string, any> };
const renderQ = (RENDERER === 'webgl2' ? '&renderer=webgl2' : '') + opt('--query', '');

/** Mốc chụp (giây từ lúc HUD hiện) → tên tệp. */
const MARKS: [number, string][] = [
  [6, '01-pha1-loi-van-tu'],
  [13.2, '02-pha2-dan-tran-cat-canh'],
  [16, '03-pha2-dan-tran-bat-dau'],
  [27, '04-pha2-nguong-dan-giua'],
  [34, '05-pha2-dan-day'],
  [40.6, '06-pha3-loi-hoa-bat-dau'],
  [43.8, '07-pha3-tia-cuoi-bao-truoc'],
  [46.2, '08-pha3-tia-cuoi-no'],
  [50, '09-pha3-mua-set-hoa'],
  [56.2, '10-thanh-cong-ascend'],
  [58.6, '11-the-chuong-ket-dan'],
];

async function enter(page: Page, name: string, q: string): Promise<void> {
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
    // 1) Độ kiếp Kết Đan.
    {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
      await enter(page, 'Dan' + (Date.now() % 100000), '&realm=nk15&god=1');
      await sleep(2500);
      await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm trib ket_dan' }));
      await page.waitForSelector('.trib', { timeout: 30_000 });
      const t0 = Date.now();
      let sweepShot = 0;
      let seen = 0;
      /** Chờ tới giây `sec`; trong pha 2 thấy vạch quét 18 m mới thì chụp ngay (báo trước 0,9 s). */
      const waitTo = async (sec: number) => {
        while (t0 + sec * 1000 > Date.now()) {
          const n = await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).filter((h: { sh?: string; r?: number }) => h.sh === 'rect' && h.r === 18).length);
          if (n > seen && sweepShot < 2 && Date.now() - t0 > 14_000) {
            seen = n;
            await page.evaluate(() => {
              const g = (window as unknown as G).__game!;
              g.camPitch = 1.0;
              g.camDist = 26;
              g.camDistCur = 26;
            });
            await sleep(120);
            await page.screenshot({ path: path.join(OUT, `04b-pha2-tia-quet-${++sweepShot}.png`) });
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
        console.log(`[shots-e2d] ${file} @ ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      log.me = await page.evaluate(() => (window as unknown as G).__game!.me?.()?.lv);
      log.hazards = await page.evaluate(() => (window as unknown as G).__game!.hazardLog ?? []);
      await page.close();
    }
    // 2) Thẻ Chương 2 khi lần đầu tới Đoạn Mạch.
    {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const name = 'Ch2' + (Date.now() % 100000);
      await enter(page, name, '&realm=tc1&god=1');
      await sleep(2500);
      await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm tp dm_tram' }));
      await page.waitForSelector('.chapter-card', { timeout: 30_000 });
      await sleep(1300);
      await page.screenshot({ path: path.join(OUT, '12-the-chuong-2-doan-mach.png') });
      await page.close();
    }
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'e2d-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e2d] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
