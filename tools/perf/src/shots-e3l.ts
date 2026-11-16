// pnpm shots:e3l: dãy ảnh Tam Trọng Kiếp (E3-L, Nguyên Anh 65 s, room riêng), GPU thật, tắt tiếng.
//   tsx src/shots-e3l.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Vào bằng tài khoản thử với ?realm=nk15&god=1 rồi `/gm trib nguyen_anh` (Kết Đan 23 viên mãn; server chuyển sang room `tribulation`), chụp theo mốc giây từ lúc HUD kiếp hiện.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2698/5298); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3l'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2698);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5298);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3l', command: 'pnpm shots:e3l' });
type G = { __game?: Record<string, any> };
const renderQ = (RENDERER === 'webgl2' ? '&renderer=webgl2' : '') + opt('--query', '');

/** Mốc chụp (giây từ lúc HUD kiếp hiện) → tên tệp. */
const MARKS: [number, string][] = [
  [3, '01-pha1-loi-bat-dau'],
  [12.5, '02-pha1-loi-day'],
  [19.4, '03-pha2-hoa-o-bao'],
  [21.5, '04-pha2-xuat-khieu'],
  [27, '05-pha2-o-chay'],
  [38, '06-pha2-hoa-day'],
  [43.5, '07-pha3-tam-ma-cat-canh'],
  [47, '08-pha3-tam-canh-bong'],
  [61, '09-pha3-cuoi-kiep'],
  [66.2, '10-thanh-cong-ascend'],
  [68.2, '11-the-chuong-nguyen-anh'],
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
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await enter(page, 'Anh' + (Date.now() % 100000), '&realm=tc4&god=1');
    await sleep(2500);
    await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm trib nguyen_anh' }));
    // Qua room `tribulation` (chuyển room, tải cảnh, độ trễ bắt đầu 3,5 s): HUD kiếp hiện là mốc 0.
    await page.waitForSelector('.trib', { timeout: 90_000 });
    const t0 = Date.now();
    let chainShot = 0;
    let castShot = 0;
    let seenChain = 0;
    let seenCast = 0;
    let soulSent = false;
    const hz = (f: string) => page.evaluate((fn) => ((window as unknown as G).__game!.hazardLog ?? []).filter(new Function('h', 'return ' + fn) as (h: unknown) => boolean).length, f);
    const top = async (file: string) => {
      await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        g.camPitch = 1.0;
        g.camDist = 26;
        g.camDistCur = 26;
      });
      await sleep(120);
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 85 });
      await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        g.camPitch = 0.45;
        g.camDist = 9;
        g.camDistCur = 9;
      });
    };
    const waitTo = async (sec: number) => {
      while (t0 + sec * 1000 > Date.now()) {
        const el = (Date.now() - t0) / 1000;
        // Tia xích (pha 1): vạch 16 m nối hai tia, báo 1,3 s.
        if (el < 17 && chainShot < 2) {
          const n = await hz("h.sh === 'rect' && h.r === 16");
          if (n > seenChain && el > 3) {
            seenChain = n;
            await top(`02b-pha1-tia-xich-${++chainShot}.jpg`);
          } else seenChain = Math.max(seenChain, n);
        }
        // Xuất khiếu: bấm X ngay đầu pha lửa (giây 19).
        if (!soulSent && el > 19) {
          soulSent = true;
          await page.keyboard.press('KeyX');
        }
        // Bóng tâm ma ra chiêu của người chơi (vùng `spirit`).
        if (el > 43 && castShot < 2) {
          const n = await hz("h.k === 'spirit'");
          if (n > seenCast) {
            seenCast = n;
            await top(`08b-pha3-tam-ma-ra-chieu-${++castShot}.jpg`);
          } else seenCast = Math.max(seenCast, n);
        }
        await sleep(50);
      }
    };
    for (const [sec, file] of MARKS) {
      await waitTo(sec - 0.01);
      const wait = t0 + sec * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      await page.screenshot({ path: path.join(OUT, file + '.jpg'), type: 'jpeg', quality: 85 });
      console.log(`[shots-e3l] ${file} @ ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    log.me = await page.evaluate(() => (window as unknown as G).__game!.me?.()?.lv);
    log.hazards = await page.evaluate(() => (window as unknown as G).__game!.hazardLog ?? []);
    await page.close();
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'e3l-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e3l] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
