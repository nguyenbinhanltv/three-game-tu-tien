// pnpm shots:e3f: ảnh UI trang bị bậc 3 (E3-F): bảng Thăng Bậc trước/sau, tab chế tạo bộ bậc 3, tooltip món bậc 3, bảng luyện đan bậc 3.
//   tsx src/shots-e3f.ts --out <thư mục> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio), một tài khoản thử, dựng cảnh bằng lệnh GM.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3f'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3f', command: 'pnpm shots:p38' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1900) => {
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
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','medium');" });
    const page = await ctx.newPage();
    const name = `E3f${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-e3f] ${file}`);
    };
    await gm(page, 'level 20', 1500);
    await gm(page, 'god on', 1900);
    await gm(page, 'tp 2092 2064', 1800);
    await gm(page, 'gold 20000', 1900);
    for (const [id, n] of [['itm_kinh_hoa_sa', 80], ['itm_thiet_tinh', 40], ['itm_linh_tran', 20], ['itm_bich_ngoc_nhi', 2], ['itm_van_hai_lo', 20]] as const) await gm(page, `give ${id} ${n}`, 1900);
    await gm(page, 'set set_liet_mach 4', 2200);
    await gm(page, 'plus 5 robe', 1900);
    await page.evaluate(() => (window as unknown as G).__game!.openNpc('npc_thiet_lao'));
    await sleep(1200);
    await page.getByRole('tab', { name: /Thăng Bậc/ }).first().click({ timeout: 8000 });
    await sleep(700);
    await page.mouse.move(5, 5);
    await sleep(400);
    await shot('promote-truoc.png');
    // Tooltip món bậc 1 trong bảng (rê chuột vào biểu tượng đầu tiên).
    await page.locator('[data-testid^="promote-"] .item, [data-testid^="promote-"] [class*="slot"]').first().hover({ timeout: 4000 }).catch(() => {});
    await sleep(500);
    await shot('promote-tooltip-bac2.png');
    await page.mouse.move(5, 5);
    await sleep(400);
    await page.locator('[data-testid^="promote-"] button:has-text("Thăng Bậc")').first().click();
    await sleep(1500);
    await shot('promote-sau.png');
    await page.locator('[data-testid^="promote-"] .item, [data-testid^="promote-"] [class*="slot"]').first().hover({ timeout: 4000 }).catch(() => {});
    await sleep(500);
    await shot('promote-tooltip-bac3.png');
    await page.getByRole('tab', { name: /Chế tạo/ }).first().click({ timeout: 8000 });
    await sleep(700);
    await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 30 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; }));
    await sleep(400);
    await shot('forge-bac3.png');
    // Thêm một món bậc 3 (roll Huyền phẩm) rồi mở túi: tooltip so sánh với đồ bậc 2 đang mặc.
    await gm(page, 'roll itm_kq_van_ngoa 3 21', 1900);
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm tp 2092 2090' }));
    await sleep(1500);
    await page.keyboard.press('b');
    await sleep(900);
    const cells = await page.locator('.bag-cell').count();
    for (let i = 0; i < Math.min(cells, 40); i++) {
      await page.locator('.bag-cell').nth(i).hover({ timeout: 2000 }).catch(() => {});
      await sleep(250);
      if (await page.evaluate(() => /Bậc 3/.test(document.body.innerText) && /(So với|đang mặc)/i.test(document.body.innerText))) break;
    }
    await sleep(400);
    await shot('tooltip-so-sanh-bac3.png');
    await gm(page, 'tp 2004 2064', 2200);
    await page.evaluate(() => (window as unknown as G).__game!.openNpc('npc_duoc_su'));
    await sleep(1200);
    await page.getByRole('tab', { name: /Luyện đan/ }).first().click({ timeout: 8000 }).catch(() => {});
    await sleep(700);
    await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 30 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; }));
    await sleep(400);
    await shot('luyen-dan-bac3.png');
    if (errors.length) console.log('[shots-e3f] lỗi console:', [...new Set(errors)]);
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
