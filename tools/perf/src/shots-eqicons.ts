// pnpm shots:eqicons: chụp túi đồ (B) và bảng nhân vật (C) với đủ icon trang bị mới (28 món).
//   tsx src/shots-eqicons.ts --out <thư mục>
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio), một tài khoản thử, đồ cấp bằng lệnh GM.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-eqicons'));
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-eqicons', command: 'pnpm shots:eqicons' });
type G = { __game?: Record<string, any> };
const gm = async (page: Page, cmd: string, wait = 700) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const ITEMS = [
  'itm_ho_uyen_vai', 'itm_ho_uyen_da', 'itm_ho_uyen_thiet', 'itm_van_ngoa_vai', 'itm_van_ngoa_da', 'itm_van_ngoa_van',
  'itm_dai_lung_vai', 'itm_dai_lung_da', 'itm_dai_lung_ngoc', 'itm_ngoc_boi_moc', 'itm_ngoc_boi_thanh', 'itm_ngoc_boi_linh', 'itm_gioi_chi_dong',
  'itm_lk_dao_bao', 'itm_lk_ho_uyen', 'itm_lk_dai_lung', 'itm_lk_van_ngoa',
  'itm_hg_dao_bao', 'itm_hg_ho_uyen', 'itm_hg_dai_lung', 'itm_hg_van_ngoa',
  'itm_dt_dao_bao', 'itm_dt_ngoc_boi', 'itm_dt_dai_lung', 'itm_dt_gioi_chi',
  'itm_hgl_kiem', 'itm_hgl_dao_bao', 'itm_hgl_gioi_chi',
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=Icon${Date.now() % 10000}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    for (let i = 0; i < 20; i++) {
      const cut = await page.evaluate(() => { const h = document.querySelector('.hud'); return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut'); });
      if (!cut) break;
      await page.keyboard.press('Space');
      await sleep(500);
    }
    await gm(page, 'level 15');
    await gm(page, 'god on');
    for (const id of ITEMS) await gm(page, `give ${id} 1`, 1300);
    await sleep(800);
    await page.keyboard.press('KeyB');
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'tui-do.png') });
    const fb = await page.evaluate(() => document.querySelectorAll('.content-icon-fallback, [data-icon-fallback]').length);
    console.log(`[shots-eqicons] tui-do.png (ô emoji dự phòng: ${fb})`);
    // Mặc bộ Lạc Kiếm (4 món đầu của nhóm bộ nằm ở ô 13–16) rồi mở lại túi: ô trang bị phía trên cũng có icon.
    for (const slot of [13, 14, 15, 16, 25]) {
      await page.locator('.bag-grid > *').nth(slot - (slot > 16 ? 0 : 0)).click().catch(() => {});
      await sleep(250);
      await page.getByRole('button', { name: /Trang bị|Mặc/ }).first().click({ timeout: 1500 }).catch(() => {});
      await sleep(500);
    }
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, 'tui-do-da-mac.png') });
    console.log('[shots-eqicons] tui-do-da-mac.png');
    await page.keyboard.press('KeyB');
    await page.keyboard.press('KeyC');
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'bang-nhan-vat.png') });
    console.log('[shots-eqicons] bang-nhan-vat.png');
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-eqicons] lỗi console:\n' + errors.slice(0, 12).join('\n'));
}
main().catch((e) => { console.error(e); dev.stop(); process.exit(1); });
