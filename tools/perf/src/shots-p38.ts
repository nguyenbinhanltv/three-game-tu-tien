// pnpm shots:p38: chụp ảnh pháp bảo phụ và luyện đan (P3-8): 3 pháp bảo đeo + kích hoạt, tooltip, ô thanh chiêu, bảng luyện đan phẩm chất.
//   tsx src/shots-p38.ts --out <thư mục> [--renderer webgpu|webgl2] [--only art|alchemy]
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
const OUT = path.resolve(opt('--out', 'shots-p38'));
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-p38', command: 'pnpm shots:p38' });
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

const ARTS = [
  { id: 'itm_tu_kim_ho_lo', file: 'ho-lo' },
  { id: 'itm_tran_hon_linh', file: 'linh' },
  { id: 'itm_thanh_lien_an', file: 'an' },
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const name = `PhapBao${String(Date.now() % 10000)}`;
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
    await gm(page, 'level 12');
    await gm(page, 'god on');
    await gm(page, 'method lac_kiem_quyet 3');
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-p38] ${file}`);
    };
    const cam = (yaw: number, pitch: number, dist: number) =>
      page.evaluate(([y, p, d]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
      }, [yaw, pitch, dist] as const);

    if (ONLY !== 'alchemy') {
      await gm(page, 'tp 2048 2088');
      for (const a of ARTS) {
        await gm(page, `art ${a.id} 3`);
        await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '/gm heal' }));
        // Đeo: góc nhìn từ phía trước-trái để thấy pháp bảo bên hông và sau lưng.
        await cam(4.0, 0.12, 3.4);
        await sleep(2500);
        await shot(`${a.file}-deo.png`);
        // Tooltip ô pháp bảo trên thanh chiêu.
        await page.locator('.art-slot').hover();
        await sleep(500);
        await shot(`${a.file}-tooltip.png`);
        await page.mouse.move(10, 10);
        // Kích hoạt: dựng quái giao chiến quanh người (Hồ Lô, Linh cần quái; Ấn không cần).
        if (a.file !== 'an') {
          await gm(page, 'spawn mon_soi_xam 2', 900);
          await page.evaluate(() => (window as unknown as G).__game!.useSkill(0));
          await sleep(500);
        }
        await cam(4.0, 0.2, 4.2);
        await page.evaluate(() => (window as unknown as G).__game!.useArtifact());
        await sleep(a.file === 'an' ? 1500 : 450);
        await shot(`${a.file}-kich-hoat.png`);
        await sleep(a.file === 'an' ? 1200 : 700);
        await shot(`${a.file}-kich-hoat-2.png`);
        await gm(page, 'killall', 900);
        await sleep(1400);
      }
    }

    if (ONLY !== 'art') {
      // Bảng luyện đan: tới Dược sư, mang đủ nguyên liệu, luyện 10 viên để thấy ra nhiều phẩm.
      await gm(page, 'tp 2006 2066');
      await gm(page, 'gold 5000', 1500);
      await gm(page, 'give itm_linh_thao 40', 1500);
      await gm(page, 'give itm_nanh_soi 12', 1500);
      await gm(page, 'give itm_yeu_dan 12', 1500);
      await gm(page, 'give itm_thiet_tinh 6', 1500);
      await gm(page, 'give itm_huyet_linh_chi 6', 1500);
      await cam(0, 0.25, 8);
      await page.keyboard.press('KeyE');
      await sleep(900);
      await page.getByRole('tab', { name: /Luyện đan/ }).first().click({ timeout: 8000 }).catch(() => {});
      await sleep(600);
      await shot('luyen-dan-bang.png');
      const craft = page.getByRole('button', { name: /^Luyện ×5$/ });
      if (await craft.count()) {
        await craft.first().click().catch(() => {});
        await sleep(900);
      }
      await page.getByRole('button', { name: /^Luyện$/ }).first().click({ timeout: 4000 }).catch(() => {});
      await sleep(900);
      await shot('luyen-dan-ket-qua.png');
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.keyboard.press('KeyB');
      await sleep(800);
      await shot('tui-dan-pham-chat.png');
      await page.keyboard.press('KeyB');
      // Dùng đan tăng sức: ô buff trên thanh chiêu.
      await gm(page, 'give itm_kim_cuong_dan 2', 1500);
      await page.keyboard.press('KeyB');
      await sleep(600);
      await page.getByRole('button', { name: /Kim Cương Đan/ }).first().click({ timeout: 6000 }).catch(() => {});
      await sleep(300);
      await page.getByRole('button', { name: /^Dùng/ }).first().click({ timeout: 4000 }).catch(() => {});
      await page.keyboard.press('KeyB');
      await sleep(1500);
      await shot('buff-dan-tang-suc.png');
      // Bảng Thiết lão: luyện bảo.
      await gm(page, 'tp 2090 2066');
      await gm(page, 'give itm_yeu_dan 30', 1500);
      await gm(page, 'give itm_kiem_phach 12', 1500);
      await gm(page, 'give itm_thiet_tinh 12', 1500);
      await page.keyboard.press('KeyE');
      await sleep(900);
      await page.getByRole('tab', { name: /Luyện bảo/ }).first().click({ timeout: 8000 }).catch(() => {});
      await sleep(600);
      await shot('luyen-bao-bang.png');
    }
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-p38] lỗi console:\n' + errors.slice(0, 12).join('\n'));
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
