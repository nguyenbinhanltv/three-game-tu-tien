// pnpm shots:m4: chụp ảnh bản đồ lớn, điểm đánh dấu chia sẻ trong tổ đội và Truyền Tống Trận (M-4) bằng 2 tab.
//   tsx src/shots-m4.ts --out <thư mục> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), vào game tắt tiếng (?mute=1, --mute-audio) bằng hai tài khoản thử.
// Bấm bằng chuột thật lên canvas bản đồ (vị trí màn hình tính từ `window.__wm` do WorldMap ghi ra).
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-m4'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-m4', command: 'pnpm shots:m4' });
type G = { __game?: Record<string, any>; __wm?: { view: { cx: number; cz: number; scale: number }; w: number; h: number } };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const send = (page: Page, type: string, msg: unknown) => page.evaluate(([t, m]) => (window as unknown as G).__game!.send(t as string, m), [type, msg] as const);

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

/** Vị trí màn hình (px trang) của điểm thế giới trên canvas bản đồ lớn, theo khung nhìn hiện tại. */
async function mapPoint(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('.worldmap canvas').boundingBox();
  const wm = await page.evaluate(() => (window as unknown as G).__wm!);
  if (!box) throw new Error('không thấy canvas bản đồ');
  return { x: box.x + wm.w / 2 + (x - wm.view.cx) * wm.view.scale, y: box.y + wm.h / 2 + (z - wm.view.cz) * wm.view.scale };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const stamp = String(Date.now() % 10000);
    const names = [`BanDoA${stamp}`, `BanDoB${stamp}`];
    const pages: Page[] = [];
    for (const name of names) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => {
          const g = (window as unknown as G).__game;
          return !!g && g.frames > 30 && !!g.me?.();
        },
        undefined,
        { timeout: 120_000, polling: 250 },
      );
      await clearIntro(page);
      await gm(page, 'level 12');
      await gm(page, 'god on');
      await gm(page, 'tele all');
      await gm(page, 'tp 2048 2088');
      await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        g.camYaw = 0;
        g.camPitch = 0.25;
        g.camDist = 12;
      });
      pages.push(page);
    }
    const [A, B] = pages;
    const shot = async (page: Page, file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-m4] ${file}`);
    };
    const pos = (page: Page) => page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      return { x: Math.round(g.cur.x), z: Math.round(g.cur.z) };
    });

    // Tổ đội A + B (để điểm đánh dấu được chia sẻ).
    await send(A, 'pty', { a: 'inv', n: names[1] });
    await sleep(800);
    await B.getByRole('button', { name: /Nhận lời/ }).first().click({ timeout: 8000 });
    await sleep(1500);

    // 1. Bản đồ lớn của A.
    await A.keyboard.press('KeyM');
    await sleep(1200);
    await shot(A, 'worldmap-full.png');

    // 1b. Zoom gần quanh hồ (nhãn vùng ngoài mép, không đè biểu tượng).
    const lake = await mapPoint(A, 1640, 2230);
    await A.mouse.move(lake.x, lake.y);
    for (let i = 0; i < 4; i++) {
      await A.mouse.wheel(0, -120);
      await sleep(150);
    }
    await sleep(500);
    await shot(A, 'worldmap-zoom.png');
    const forest = await mapPoint(A, 2335, 2110);
    void forest;
    for (let i = 0; i < 6; i++) {
      await A.mouse.wheel(0, 120);
      await sleep(120);
    }
    await sleep(400);

    // 2. Bộ lọc: tắt lớp Quái và Thu thập.
    await A.getByRole('button', { name: 'Quái', exact: true }).click();
    await A.getByRole('button', { name: 'Thu thập', exact: true }).click();
    await sleep(500);
    await shot(A, 'worldmap-filter-off.png');
    await A.getByRole('button', { name: 'Quái', exact: true }).click();
    await A.getByRole('button', { name: 'Thu thập', exact: true }).click();

    // 3. Đặt điểm đánh dấu bằng chuột phải: A ở phía bắc sân (cách B ~65 m, ngay trước camera của B).
    const pm = await mapPoint(A, 2090, 2030);
    await A.mouse.click(pm.x, pm.y, { button: 'right' });
    await sleep(1500);
    await shot(A, 'worldmap-marker.png');
    const markA = await A.evaluate(() => (window as unknown as G).__game && JSON.stringify((document.querySelector('.worldmap') ? 1 : 0)));
    void markA;
    await A.keyboard.press('KeyM');
    await sleep(600);

    // 4. B thấy điểm của A (cột sáng ở phía trước) và tự đặt một điểm phía sau (mũi tên ở rìa).
    await sleep(1200);
    await shot(B, 'marker-shared-beam.png');
    await B.keyboard.press('KeyM');
    await sleep(900);
    const pb = await mapPoint(B, 2048, 2240);
    await B.mouse.click(pb.x, pb.y, { button: 'right' });
    await sleep(1500);
    await shot(B, 'worldmap-marker-shared.png');
    await B.keyboard.press('KeyM');
    await sleep(1200);
    await shot(B, 'marker-edge-arrow.png');

    // 5. Truyền tống: A mở bản đồ, bấm trận Thung Lũng.
    await A.keyboard.press('KeyM');
    await sleep(900);
    const pad = await mapPoint(A, 2010, 2375);
    await A.mouse.move(pad.x, pad.y);
    await sleep(600);
    await shot(A, 'worldmap-tele-hover.png');
    await A.mouse.click(pad.x, pad.y);
    await sleep(1000);
    await shot(A, 'worldmap-tele-casting.png');
    await A.keyboard.press('KeyM');
    await sleep(900);
    await shot(A, 'tele-cast-ring.png');
    const before = await pos(A);
    await sleep(2800);
    await shot(A, 'tele-arrived.png');
    await sleep(2500);
    await shot(A, 'tele-arrived-settled.png');
    const after = await pos(A);
    console.log(`[shots-m4] vị trí A: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    // Vòng chờ hồi chiêu: bấm lại ngay thì bị từ chối.
    await A.keyboard.press('KeyM');
    await sleep(900);
    await shot(A, 'worldmap-cooldown.png');
  } finally {
    await browser.close();
    dev.stop();
  }
  if (errors.length) console.log(`[shots-m4] ${errors.length} lỗi console:\n` + errors.slice(0, 10).join('\n'));
  else console.log('[shots-m4] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
