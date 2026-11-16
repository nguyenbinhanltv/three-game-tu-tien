// pnpm shots:e2codex --out <thư mục>: ảnh asset 2D Codex đợt E2 trong game: túi đồ với icon bậc 2, thanh chiêu/bảng công pháp bậc cao,
// khung boss + khung mục tiêu có chân dung Đoạn Mạch, màn tải Đoạn Mạch, thẻ chương Kết Đan.
//   tsx src/shots-e2codex.ts --out <thư mục> [--renderer webgpu|webgl2]
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
const OUT = path.resolve(opt('--out', 'shots-e2codex'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2codex', command: 'pnpm shots:e2codex' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','medium');" });
    const page = await ctx.newPage();
    const name = `E2c${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    const url = `http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`;
    // Màn tải: đặt vùng cuối là Đoạn Mạch rồi mở trang, chụp ngay khi đang kết nối.
    await page.addInitScript({ content: "localStorage.setItem('dtl.lastZone','doan_mach');" });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot.art-on.art-zone .ts-art.ready', { timeout: 30_000 }).catch(() => undefined);
    await sleep(900);
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-e2codex] ${file}`);
    };
    await shot('loading-doan-mach.png');
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    await gm(page, 'level 22', 1500);
    await gm(page, 'god on', 1200);
    await gm(page, 'gold 20000', 1300);
    for (const id of ['itm_ket_dan_dich', 'itm_ngung_dan_mach_tinh', 'itm_mach_tinh_phien', 'itm_hoang_sa_thao', 'itm_pha_canh_dan_2', 'itm_hoi_mach_dan', 'itm_kim_cuong_dan_2', 'itm_bao_huyet_dan_2', 'itm_manh_luc_dan_2', 'itm_liet_mach_kiem', 'itm_mach_van_dao_bao', 'itm_sa_thach_ho_uyen', 'itm_kho_ha_van_ngoa', 'itm_ngan_mach_dai_lung', 'itm_mach_tinh_ngoc_boi', 'itm_hoang_sa_gioi_chi', 'itm_lm_dao_bao', 'itm_dg_dao_bao', 'itm_pm_dao_bao', 'itm_pm_ngoc_boi'])
      await gm(page, `give ${id} 3`, 1150);
    await page.keyboard.press('KeyB');
    await sleep(1200);
    await page.mouse.move(5, 5);
    await shot('bag-bac2.png');
    await page.keyboard.press('KeyB');
    await sleep(400);
    await gm(page, 'method lac_kiem_quyet 5', 1200);
    await page.keyboard.press('KeyV');
    await sleep(1200);
    await shot('method-bac2.png');
    await page.keyboard.press('Escape');
    // Boss + tinh anh Đoạn Mạch: khung boss và khung mục tiêu có chân dung.
    await gm(page, 'tp dm_tram', 1300);
    await gm(page, 'killall', 1300);
    await gm(page, 'spawn boss_dia_mach_long 1', 3500);
    await page.evaluate(() => (window as unknown as G).__game!.targetNearest?.());
    await page.keyboard.press('Tab');
    await sleep(1500);
    await shot('boss-dia-mach-long.png');
    await gm(page, 'killall', 1300);
    await gm(page, 'spawn elite_ho_mach_khoi_tuong 1', 3500);
    await page.keyboard.press('Tab');
    await sleep(1500);
    await shot('elite-ho-mach-khoi-tuong.png');
    // Thẻ chương Kết Đan (nền tranh nhạt).
    await gm(page, 'killall', 1300);
    await gm(page, 'realm tc', 1200);
    await page.evaluate(() => (window as unknown as G).__game!.chapter('ch2'));
    await sleep(1600);
    await shot('chapter-ch2.png');
    if (errors.length) console.log('[shots-e2codex] lỗi console:', [...new Set(errors)]);
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
