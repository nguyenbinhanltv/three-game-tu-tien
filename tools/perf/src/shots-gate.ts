// pnpm shots:gate: ảnh cổng Kính Nguyệt Cung (moon-gate ở Kính Hồ Đài, bản đồ van_hai) từ 4 hướng (nam, bắc, đông, tây) và xa 80 m.
//   pnpm --filter @dtl/perf exec tsx src/shots-gate.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2699/5299); luôn ?mute=1 và --mute-audio; đăng nhập thử.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-gate'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2699);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5299);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-gate', command: 'pnpm shots:gate' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  try {
    await dev.start();
    const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','high');" });
    const page = await ctx.newPage();
    const name = `GATE${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&quiet=1${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    const skipCut = async () => {
      for (let i = 0; i < 40; i++) {
        const hidden = await page.evaluate(() => {
          const h = document.querySelector('.hud');
          return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
        });
        if (!hidden) break;
        await page.keyboard.press('Space');
        await sleep(400);
      }
    };
    await skipCut();
    await page.addStyleTag({ content: '.chat{visibility:hidden !important}' });
    const shot = async (label: string) => fs.writeFileSync(path.join(OUT, `${label}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82 }));
    const cam = (pitch: number, dist: number, yaw = Math.PI) =>
      page.evaluate(([p, d, y]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
        g.camDistCur = d;
      }, [pitch, dist, yaw] as const);

    await gm(page, 'level 23');
    await gm(page, 'god on', 1200);
    await gm(page, 'tele all');
    await gm(page, 'tp vh_kinh_ho');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'van_hai', undefined, { timeout: 90_000, polling: 300 });
    await sleep(3000);
    const GX = 1168, GZ = 1598;
    const view = async (label: string, yaw: number, away: number, camd: number) => {
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      await gm(page, `tp ${Math.round(GX - away * dx)} ${Math.round(GZ - away * dz)}`, 2500);
      await cam(0.14, camd, yaw);
      await sleep(1500);
      await shot(label);
    };
    await view('a-nam', Math.PI, 14, 7);
    await view('b-bac', 0, 14, 7);
    await view('c-dong', Math.PI / 2, 14, 7);
    await view('d-tay', -Math.PI / 2, 14, 7);
    await view('e-xa80', Math.PI, 80, 8);
    await browser.close();
  } finally {
    if (errors.length) console.log(errors.slice(0, 5));
    await dev.stop();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
