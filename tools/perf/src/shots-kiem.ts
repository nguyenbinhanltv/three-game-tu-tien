// pnpm shots:kiem: ảnh 5 kiếm riêng theo trang bị (prop_kiem_*): đeo lưng, cầm tay, đang chém, trên model nam/nữ.
//   tsx src/shots-kiem.ts --out <thư mục> [--hand-only] [--gender m|f] [--renderer webgpu|webgl2] [--only id,id] [--glow 0|1|2]
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
const OUT = path.resolve(opt('--out', 'shots-kiem'));
const RENDERER = opt('--renderer', 'webgpu');
const GENDER = opt('--gender', 'm');
const HAND_ONLY = args.includes('--hand-only');
const GLOW = Number(opt('--glow', '0'));
// --model prop_kiem_x: kiếm bậc mới chưa có vật phẩm; client nhận ?sword=<model> (chỉ hình), bỏ bước give/mặc.
const MODEL = opt('--model', '');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-kiem', command: 'pnpm shots:kiem' });
type G = { __game?: Record<string, any> };

const SWORDS = MODEL ? [{ id: '', file: MODEL.replace('prop_kiem_', ''), name: '' }] : [
  { id: 'itm_thanh_phong_kiem', file: 'thanh-phong', name: 'Thanh Phong Kiếm' },
  { id: 'itm_thiet_kiem', file: 'thiet', name: 'Thiết Kiếm' },
  { id: 'itm_han_quang_kiem', file: 'han-quang', name: 'Hàn Quang Kiếm' },
  { id: 'itm_hgl_kiem', file: 'han-giao-lan', name: 'Hàn Giao Lân Kiếm' },
  { id: 'itm_tram_ta_kiem', file: 'tram-ta', name: 'Trảm Tà Kiếm' },
  { id: 'itm_liet_mach_kiem', file: 'liet-mach', name: 'Liệt Mạch Kiếm' },
];

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
    const name = `Kiem${GENDER}${String(Date.now() % 10000)}`;
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
    await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', 'high'); localStorage.setItem('dtl.look', JSON.stringify({ g: '${GENDER}', dye: 'attire_sect' }));` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => (m.type() === 'error' || /models\]|kiếm/i.test(m.text())) && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}${MODEL ? `&sword=${MODEL}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    await gm(page, 'level 15');
    await gm(page, 'god on');
    await gm(page, 'tp 2048 2088');
    await page.addStyleTag({ content: 'body.nohud .hud, body.nohud .chat, body.nohud .minimap { visibility: hidden !important; }' });
    const cam = (yaw: number, pitch: number, dist: number) =>
      page.evaluate(([y, p, d]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
        g.camDistCur = d;
        g.controls = 'turn'; // tâm camera ở ngực (không phải trên đầu) để nhân vật nằm giữa khung
      }, [yaw, pitch, dist] as const);
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file), clip: { x: 240, y: 120, width: 800, height: 600 } });
      console.log(`[shots-kiem] ${file}`);
    };
    for (const sw of SWORDS) {
      if (ONLY.length && !ONLY.includes(sw.file)) continue;
      await page.evaluate(() => document.body.classList.remove('nohud'));
      if (!MODEL) {
        await gm(page, `give ${sw.id} 1`, 1300);
        await page.keyboard.press('KeyB');
        await sleep(500);
        await page.getByRole('button', { name: sw.name }).first().click({ timeout: 8000 });
        await sleep(300);
        await page.getByRole('button', { name: /^Trang bị$/ }).first().click({ timeout: 4000 });
        await sleep(500);
        await page.keyboard.press('KeyB');
      }
      if (GLOW) await gm(page, `plus ${GLOW === 2 ? 10 : 7}`, 900);
      await gm(page, 'heal', 600);
      await page.evaluate(() => document.body.classList.add('nohud'));
      // Đeo lưng: nhìn từ sau-trái, gần, cho thấy chuôi và bao.
      await cam(Number(opt('--back-yaw', '3.6')), Number(opt('--pitch', '0.12')), Number(opt('--dist', '2.0')));
      await sleep(2800);
      if (!HAND_ONLY) await shot(`${sw.file}-deo-lung.png`);
      // Cầm tay: dựng quái, ra chiêu (kiếm vào tay), chụp ở tư thế đứng chờ ngay sau.
      await gm(page, 'spawn mon_soi_xam 1', 900);
      await cam(Number(opt('--hand-yaw', '4.4')), Number(opt('--pitch', '0.12')), Number(opt('--dist', '2.0')) + 0.4);
      await page.evaluate(() => (window as unknown as G).__game!.useSkill(0));
      await sleep(1500);
      await shot(`${sw.file}-cam-tay.png`);
      // Đang chém.
      if (HAND_ONLY) {
        await gm(page, 'killall', 900);
        continue;
      }
      for (let k = 0; k < 8; k++) {
        await page.evaluate(() => (window as unknown as G).__game!.useSkill(Math.random() < 0.5 ? 0 : 1));
        await sleep(160);
        if (k === 3) await shot(`${sw.file}-chem.png`);
      }
      await gm(page, 'killall', 900);
      await sleep(1200);
    }
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-kiem] log đáng chú ý:\n' + [...new Set(errors)].slice(0, 14).join('\n'));
}

main().catch((e) => {
  console.error('[shots-kiem] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
