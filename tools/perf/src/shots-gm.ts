// pnpm shots:gm: chụp bảng GM (F3) và vài lệnh thử đồ: help, find, kit bậc 2 kiếm tu +10, outfit, weapon.
//   tsx src/shots-gm.ts --out <thư mục> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio), một tài khoản thử.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-gm'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-gm', command: 'pnpm shots:gm' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1300) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

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
  try {
    const name = `GmTest${String(Date.now() % 10000)}`;
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-gm] ${file}`);
    };
    const cam = (yaw: number, pitch: number, dist: number) =>
      page.evaluate(([y, p, d]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
      }, [yaw, pitch, dist] as const);

    await gm(page, 'god on');
    // Bảng GM: mỗi nhóm một ảnh.
    await page.keyboard.press('F3');
    await sleep(800);
    const tools = page.locator('.debug-tools');
    const groups: [string, string][] = [
      ['Nhân vật', 'char'],
      ['Kỹ năng', 'skill'],
      ['Trang bị', 'gear'],
      ['Trang phục', 'outfit'],
      ['Vũ khí', 'weapon'],
      ['Bản đồ', 'map'],
      ['Quái', 'mon'],
    ];
    for (const [label, id] of groups) {
      await tools.getByRole('button', { name: label, exact: true }).click();
      await sleep(400);
      await tools.scrollIntoViewIfNeeded();
      await shot(`panel-${id}.png`);
    }
    // Bấm nút trong bảng: nhóm Trang bị, bậc 2 · Kiếm tu · +10 · nữ → Mặc trọn bộ.
    await tools.getByRole('button', { name: 'Trang bị', exact: true }).click();
    await tools.locator('select').nth(0).selectOption('2');
    await tools.locator('select').nth(1).selectOption('kiem');
    await tools.locator('select').nth(2).selectOption('10');
    await tools.locator('select').nth(3).selectOption('f');
    await tools.getByRole('button', { name: 'Mặc trọn bộ' }).click();
    await sleep(1500);
    await page.keyboard.press('F3');
    await sleep(600);

    await cam(0.4, 0.75, 6);
    await sleep(2200);
    await shot('kit-bac2-kiem-tu-+10-truoc.png');
    await cam(3.5, 0.75, 6);
    await sleep(2200);
    await shot('kit-bac2-kiem-tu-+10-sau.png');

    // Lệnh qua chat: help, find, outfit.
    await gm(page, 'help kit');
    await gm(page, 'find liet mach', 1500);
    await shot('help-find.png');
    await gm(page, 'help', 1800);
    await shot('help-full.png');
    for (const [id, g] of [['set_dia_giap', 'm'], ['set_phuc_mach', 'f']]) {
      await gm(page, `outfit ${id} ${g}`, 1800);
      await cam(0.4, 0.75, 6);
      await sleep(2200);
      await shot(`outfit-${id}.png`);
    }
    await gm(page, 'weapon itm_liet_mach_kiem +10', 1800);
    await cam(3.2, 0.7, 4);
    await sleep(2200);
    await shot('weapon-liet-mach-+10.png');

    if (errors.length) console.log(`[shots-gm] ${errors.length} lỗi console:\n` + errors.slice(0, 8).join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch(async (e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
