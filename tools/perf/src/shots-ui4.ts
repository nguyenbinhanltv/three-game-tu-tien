// pnpm shots:ui4: ảnh trước/sau + video webm các màn đặc trưng kiểu Ngọc Giản (UI-4): đăng nhập + tạo nhân vật, màn tải,
// băng chuyền chọn công pháp, vòng quét khi độ kiếp, bản đồ lớn. 1080p/1440p; video 1280×720 cho màn có chuyển động.
//   tsx src/shots-ui4.ts --out <thư mục tuyệt đối> [--scenes dang-nhap,man-tai,bang-chuyen,do-kiep,ban-do] [--variants truoc,sau] [--video 0]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2690/5290); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ui4'));
const PORT = Number(process.env.PORT ?? 2690);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5290);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-ui4', command: 'pnpm shots:ui4' });
type G = { __game?: Record<string, any> };
const only = opt('--scenes', '').split(',').filter(Boolean);
const variants = opt('--variants', 'truoc,sau').split(',') as ('truoc' | 'sau')[];
const VIDEO = opt('--video', '1') !== '0';
const SIZES = [
  ['1080p', 1920, 1080],
  ['1440p', 2560, 1440],
] as const;
const want = (id: string) => !only.length || only.includes(id);

const base = (v: string, q: string) => `http://localhost:${CLIENT_PORT}/?mute=1&ngj=${v === 'sau' ? 1 : 0}${q ? '&' + q : ''}`;
const gm = async (page: Page, m: string) => {
  await page.evaluate((x) => (window as unknown as G).__game!.send('chat', { m: x }), m);
  await sleep(1200);
};
const inGame = (page: Page) => page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
const nm = (p: string) => p + (Date.now() % 100000);

async function newPage(browser: Browser, name: string, video: boolean, w = 1920, h = 1080) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(video ? { recordVideo: { dir: path.join(OUT, '_vid'), size: { width: 1280, height: 720 } } } : {}) });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
  return { ctx, page, errors };
}
const sizes = async (page: Page, id: string, v: string) => {
  for (const [tag, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, `${id}-${v}-${tag}.jpg`), type: 'jpeg', quality: 84 });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
};
async function finish(ctx: Awaited<ReturnType<typeof newPage>>['ctx'], page: Page, vidName?: string) {
  const vp = page.video();
  await ctx.close();
  if (vp && vidName) {
    const p = await vp.path();
    fs.copyFileSync(p, path.join(OUT, vidName + '.webm'));
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    for (const v of variants) {
      // 1) đăng nhập + tạo nhân vật (chọn giới tính nữ), rồi 2) màn tải: bấm vào game và chụp dọc đường tải
      if (want('dang-nhap') || want('man-tai')) {
        const name = nm('Ui4' + v[0]);
        const { ctx, page, errors } = await newPage(browser, name, VIDEO && v === 'sau');
        await page.goto(base(v, ''), { waitUntil: 'load' });
        await page.waitForSelector('.login-form input', { timeout: 60_000 });
        await sleep(2500);
        await page.fill('.login-form input', name);
        if (want('dang-nhap')) {
          await sizes(page, 'dang-nhap', v);
          await page.locator('.look-gender').nth(1).click().catch(() => undefined);
          await sleep(600);
          await page.screenshot({ path: path.join(OUT, `dang-nhap-nu-${v}-1080p.jpg`), type: 'jpeg', quality: 84 });
        }
        await page.locator('.login-form .btn.primary').first().click();
        let shots = 0;
        for (let k = 0; k < 40 && shots < 4; k++) {
          await sleep(140);
          if (want('man-tai') && (await page.locator('.ts-loading').count()) && !(await page.evaluate(() => !!document.querySelector('.hud')))) {
            shots++;
            await page.screenshot({ path: path.join(OUT, `man-tai-${v}-${shots}.jpg`), type: 'jpeg', quality: 84 });
          }
        }
        await inGame(page).catch(() => undefined);
        await sleep(1500);
        log[`dang-nhap-${v}`] = { errors: errors.slice(0, 5) };
        await finish(ctx, page, v === 'sau' ? 'dang-nhap-man-tai' : undefined);
      }
      // 3) băng chuyền công pháp
      if (want('bang-chuyen')) {
        const name = nm('Ui4c' + v[0]);
        const { ctx, page, errors } = await newPage(browser, name, VIDEO && v === 'sau');
        await page.goto(base(v, `auto=${name}&god=1&realm=tc1&at=tong_mon`), { waitUntil: 'load' });
        await inGame(page);
        await sleep(2500);
        await page.keyboard.press('k');
        await sleep(900);
        if (v === 'sau') {
          await sizes(page, 'bang-cong-phap', v);
          await page.locator('.method .k-btn', { hasText: /băng chuyền/i }).first().click();
          await sleep(900);
          await sizes(page, 'bang-chuyen', v);
          await page.keyboard.press('ArrowRight');
          await sleep(600);
          await page.keyboard.press('ArrowRight');
          await sleep(900);
          await page.screenshot({ path: path.join(OUT, `bang-chuyen-the3-${v}-1080p.jpg`), type: 'jpeg', quality: 84 });
          await page.keyboard.press('ArrowLeft');
          await sleep(900);
        } else {
          await sizes(page, 'bang-chuyen', v); // trước = bảng Công pháp cũ
        }
        log[`bang-chuyen-${v}`] = { errors: errors.slice(0, 5) };
        await finish(ctx, page, v === 'sau' ? 'bang-chuyen' : undefined);
      }
      // 4) vòng quét + vết nứt khi độ kiếp / đột phá
      if (want('do-kiep')) {
        const name = nm('Ui4d' + v[0]);
        const { ctx, page, errors } = await newPage(browser, name, VIDEO && v === 'sau');
        await page.goto(base(v, `auto=${name}&god=1&realm=nk15&at=tong_mon`), { waitUntil: 'load' });
        await inGame(page);
        await sleep(2500);
        await gm(page, '/gm trib');
        // thẻ chương 'trib' kéo dài ~3 s; chụp bốn nhịp quanh đó
        for (const [i, ms] of [350, 450, 500, 600].entries()) {
          await sleep(ms);
          await page.screenshot({ path: path.join(OUT, `do-kiep-${v}-${i + 1}.jpg`), type: 'jpeg', quality: 84 });
        }
        await sizes(page, 'do-kiep-khung', v);
        await sleep(4000);
        log[`do-kiep-${v}`] = { errors: errors.slice(0, 5) };
        await finish(ctx, page, v === 'sau' ? 'do-kiep' : undefined);
      }
      // 5) bản đồ lớn
      if (want('ban-do')) {
        const name = nm('Ui4m' + v[0]);
        const { ctx, page, errors } = await newPage(browser, name, false);
        await page.goto(base(v, `auto=${name}&god=1&realm=nk12&at=tong_mon`), { waitUntil: 'load' });
        await inGame(page);
        await sleep(6500); // vào thế giới rồi chờ hết khung chuyển cảnh đầu (chụp sớm hơn ~4 s thấy ảnh kép/tách màu của lúc nạp cảnh, không phải do bảng)
        await page.keyboard.press('m');
        await sleep(1500);
        await sizes(page, 'ban-do', v);
        log[`ban-do-${v}`] = { errors: errors.slice(0, 5) };
        await finish(ctx, page);
      }
    }
    fs.rmSync(path.join(OUT, '_vid'), { recursive: true, force: true });
    fs.writeFileSync(path.join(OUT, 'ui4-log.json'), JSON.stringify(log, null, 2));
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
