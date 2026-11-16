// pnpm shots:e3k (E3-K): ảnh nguyên anh xuất khiếu (X, thám thính + chết), ngự không (không kiếm ≤ 30 m, ngự kiếm trên 30 m), thuấn di (Q).
//   tsx src/shots-e3k.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Vào bằng tài khoản thử, `/gm level 24`, bấm phím thật (X, F, Space, Q), chụp từng mốc (JPG, 1600×900).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2705/5205); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3k'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2705);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5205);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3k', command: 'pnpm shots:e3k' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1200) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const shot = async (page: Page, file: string, clip?: { x: number; y: number; width: number; height: number }) => {
  await page.screenshot({ path: path.join(OUT, file + '.jpg'), type: 'jpeg', quality: 85, clip });
  console.log(`[shots-e3k] ${file}`);
};
const cam = (page: Page, yaw: number, pitch: number, dist: number) =>
  page.evaluate(
    ([y, p, d]) => {
      const g = (window as unknown as G).__game!;
      g.camYaw = y;
      g.camPitch = p;
      g.camDist = d;
      g.camDistCur = d;
    },
    [yaw, pitch, dist],
  );
const pos = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as G).__game!;
  const m = g.me?.();
  return { x: g.cur.x, y: g.cur.y, z: g.cur.z, fl: m?.fl, hp: m?.hp, mhp: m?.mhp, lv: m?.lv };
});

async function clearIntro(page: Page): Promise<void> {
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    const hidden = await page.evaluate(() => {
      const h = document.querySelector('.hud');
      return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
    });
    if (!hidden) return;
    await page.keyboard.press('Space');
    await sleep(500);
  }
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
    const name = 'E3K' + (Date.now() % 100000);
    await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&god=1&realm=nk15${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    log.backend = await page.evaluate(() => (window as unknown as G).__game!.info?.().backend);
    await gm(page, 'method lac_kiem_quyet 3');
    // Trước Nguyên Anh: không có nút X.
    await gm(page, 'level 23', 1500);
    await shot(page, '01-thanh-chieu-truoc-nguyen-anh', { x: 400, y: 740, width: 800, height: 150 });
    await gm(page, 'level 24', 1800);
    await gm(page, 'tp 2048 2088', 2500);
    await page.mouse.move(800, 300);
    await cam(page, 0, 0.3, 8);
    await sleep(1200);
    await shot(page, '02-thanh-chieu-nguyen-anh-nut-x', { x: 400, y: 740, width: 800, height: 150 });
    const slot = page.locator('.skill[aria-label*="(X)"]').first();
    if (await slot.count()) {
      await slot.hover();
      await sleep(700);
      await shot(page, '03-tooltip-xuat-khieu', { x: 300, y: 450, width: 1000, height: 440 });
      await page.mouse.move(800, 300);
    }

    // ---------- Thuấn di (Q) ----------
    await gm(page, 'cd');
    await cam(page, 0.9, 0.3, 11);
    await sleep(500);
    const before = await pos(page);
    await page.keyboard.press('KeyQ');
    await sleep(120);
    await shot(page, '06-thuan-di-vua-dich');
    await sleep(350);
    await shot(page, '07-thuan-di-tan');
    const after = await pos(page);
    log.blink = { before, after, dist: Math.hypot(after.x - before.x, after.z - before.z) };
    log.fx = await page.evaluate(() => (window as unknown as G).__game!.soulLog);

    // ---------- Xuất khiếu thám thính (X) ----------
    await sleep(5600); // thuấn di tính là giao chiến: đợi hết 5 giây mới xuất khiếu được
    await cam(page, 0.5, 0.35, 10);
    await page.keyboard.press('KeyX');
    await sleep(500);
    await cam(page, 0.5, 0.12, 4.5);
    await sleep(600);
    await shot(page, '08-xuat-khieu-nguyen-anh-can-canh');
    await cam(page, 0.5, 0.35, 10);
    await sleep(400);
    await shot(page, '08b-xuat-khieu-vua-roi-than-xac');
    await page.keyboard.down('KeyW');
    await sleep(1000);
    await page.keyboard.up('KeyW');
    await cam(page, 0.5 - Math.PI / 2, 0.3, 15);
    await sleep(700);
    await shot(page, '09-nguyen-anh-bay-xa-than-xac-o-lai');
    await cam(page, 0.5, 0.1, 5);
    await page.keyboard.down('KeyW');
    await sleep(1400);
    await shot(page, '09b-nguyen-anh-can-canh-vat-lieu-linh-the');
    await page.keyboard.up('KeyW');
    log.soulOut = await pos(page);
    await sleep(400);
    await shot(page, '10-nut-x-dang-xuat-khieu', { x: 400, y: 740, width: 800, height: 150 });
    await page.keyboard.press('KeyX');
    await sleep(600);
    await shot(page, '11-nhap-lai-than-xac');
    log.soulIn = await pos(page);
    await shot(page, '12-nut-x-hoi-chieu', { x: 400, y: 740, width: 800, height: 150 });

    await gm(page, 'cd');
    // ---------- Ngự không: bay không kiếm dưới 30 m, kiếm hiện lại trên 30 m ----------
    await gm(page, 'tp 2048 2088', 2500);
    await page.mouse.move(800, 300);
    await page.keyboard.press('KeyF');
    await sleep(500);
    await page.keyboard.down('Space');
    await sleep(1000);
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyW');
    await sleep(1400);
    log.sky = await pos(page);
    await page.keyboard.up('KeyW');
    await cam(page, 2.5, 0.16, 8);
    await sleep(900);
    await shot(page, '04-ngu-khong-khong-kiem');
    await cam(page, 2.5, 0.55, 6.5);
    await sleep(900);
    await shot(page, '04b-ngu-khong-gon-linh-khi-duoi-chan');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await sleep(3400);
    await page.keyboard.up('Space');
    log.high = await pos(page);
    await cam(page, 2.5, 0.14, 8);
    await sleep(600);
    await shot(page, '05-tren-30m-ngu-kiem');
    await page.keyboard.down('ShiftLeft');
    await sleep(4200);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    log.low = await pos(page);
    await gm(page, 'tp 2048 2088', 2500);
    await page.keyboard.press('KeyF');
    await sleep(2500);
    // ---------- Chết ở Nguyên Anh: nguyên anh thoát ra ----------
    await gm(page, 'god off');
    await cam(page, 0.4, 0.4, 12);
    await gm(page, 'die', 600);
    await sleep(1800);
    await shot(page, '13-chet-nguyen-anh-thoat-khieu');
    await sleep(4500);
    await shot(page, '14-nguyen-anh-bay-ve-noi-an-toan');
    await sleep(5000);
    log.afterDeath = await pos(page);
    await shot(page, '15-hoi-sinh-30-phan-tram');
    await page.close();
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'e3k-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e3k] lỗi console:\n' + [...new Set(errors)].join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
