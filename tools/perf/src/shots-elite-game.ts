// pnpm shots:elitegame: ảnh trong game thật của 3 tinh anh Vân Lam (model Tripo mới và model khối cũ `?models=legacy`):
// đứng chờ, đang áp sát/đánh, chết. Tài khoản thử bất tử, cảnh qua `/gm spawn`. Tự chạy `pnpm dev` ở PORT/CLIENT_PORT
// (mặc định 2611/5211), tắt tiếng (?mute=1, --mute-audio), tự tắt server khi xong.
//   tsx src/shots-elite-game.ts --out <thư mục> [--only id,id] [--legacy 0|1] [--renderer webgpu|webgl2] [--yaw rad]
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-elite-game'));
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const LEGACY = opt('--legacy', '1') !== '0';
const YAW = Number(opt('--yaw', '2.0'));
const AT = opt('--at', 'ho');
const PORT = Number(process.env.PORT ?? 2611);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5211);
const IDS = ['elite_huyet_nha_lang', 'elite_xich_dien_ho', 'elite_cu_nham_vien'].filter((id) => !ONLY.length || ONLY.includes(id));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-elitegame', command: 'pnpm shots:elitegame' });
type G = { __game?: Record<string, any> };
const gm = async (page: Page, cmd: string, wait = 1000) => {
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

async function run(browser: import('playwright').Browser, legacy: boolean, errors: string[]): Promise<void> {
  const tag = legacy ? 'cu' : 'moi';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', 'high');` });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || /models\]/.test(m.text())) && errors.push(m.text().slice(0, 300)));
  const name = `Elite${tag}${String(Date.now() % 10000)}`;
  await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&realm=nk15&god=1&at=${AT}${legacy ? '&models=legacy' : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const g = (window as unknown as G).__game;
    return !!g && g.frames > 30 && !!g.me?.();
  }, undefined, { timeout: 120_000, polling: 250 });
  await clearIntro(page);
  await gm(page, 'god on');
  await page.addStyleTag({ content: '.hud, .chat, .minimap { visibility: hidden !important; }' });
  for (const id of IDS) {
    await gm(page, 'killall', 700);
    await gm(page, 'heal', 400);
    await gm(page, `spawn ${id} 1`, 600);
    // Quái hiện ở +Z cách 10 m; đứng yên (không ra chiêu) rồi tiến lại.
    await page.evaluate((y) => {
      const g = (window as unknown as G).__game!;
      g.camYaw = y;
      g.camPitch = 0.2;
      g.camDist = 6.5;
      g.camDistCur = 6.5;
    }, YAW);
    await sleep(2500);
    const shot = async (n: string) => {
      await page.screenshot({ path: path.join(OUT, `${id}-${tag}-${n}.png`) });
      console.log(`[shots-elitegame] ${id}-${tag}-${n}`);
    };
    await shot('1-cho');
    await sleep(1800);
    await shot('2-ap-sat');
    await sleep(900);
    await shot('3-danh');
    await gm(page, 'killall', 350);
    await sleep(450);
    await shot('4-chet-a');
    await sleep(700);
    await shot('5-chet-b');
  }
  await ctx.close();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    await run(browser, false, errors);
    if (LEGACY) await run(browser, true, errors);
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-elitegame] log đáng chú ý:\n' + [...new Set(errors)].slice(0, 14).join('\n'));
}

main().catch((e) => {
  console.error('[shots-elitegame] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
