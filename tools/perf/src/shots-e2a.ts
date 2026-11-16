// pnpm shots:e2a --out <thư mục>: ảnh Đoạn Mạch Cổ Cốc (E2-A). Vào Vân Lam bằng đăng nhập thử, `/gm tp dm_tram` (vé liên level),
// rồi tới từng điểm suy từ dữ liệu level (`levelPoints`), chụp thêm bản đồ lớn (phím M) và minimap. Tắt tiếng (--mute-audio, ?mute=1).
//   tsx src/shots-e2a.ts --out <thư mục> [--renderer webgpu|webgl2] [--preset low|medium|high] [--points a,b] [--size 1280x720]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175) với DB tạm rồi tắt.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';
import { levelPoints } from './levelpoints';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e2a'));
const RENDERER = opt('--renderer', 'webgpu');
const PRESET = opt('--preset', 'medium');
const ONLY = opt('--points', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const POINTS = levelPoints('doan_mach').filter((p) => !ONLY.length || ONLY.includes(p.name));

type G = { __game?: Record<string, any> };
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2a', command: 'pnpm shots:e2a' });

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(900);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(PRESET)});` });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 600)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=E2A_Shots${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await page.keyboard.press('Shift');
    await sleep(600);
    await gm(page, 'level 19');
    await gm(page, 'god on');
    await gm(page, 'tele all');
    await gm(page, 'tp dm_tram');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'doan_mach', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    console.log('[shots-e2a] đã vào doan_mach, renderer', await page.evaluate(() => (window as unknown as G).__game?.rendererName ?? '?'));
    for (const p of POINTS) {
      await gm(page, `tp ${Math.round(p.x)} ${Math.round(p.z)}`);
      await gm(page, 'heal');
      await page.evaluate((c) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = c.yaw;
        g.camPitch = c.pitch;
        g.camDist = c.dist;
      }, p);
      const until = Date.now() + 40_000;
      while (Date.now() < until) {
        const s = await page.evaluate(() => {
          const g = (window as unknown as G).__game!;
          return { x: g.renderPos.x, z: g.renderPos.z };
        });
        if (Math.hypot(s.x - p.x, s.z - p.z) < 3) break;
        await sleep(300);
      }
      await sleep(Number(process.env.SHOT_SETTLE ?? 2500));
      const file = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: file });
      console.log(`[shots-e2a] ${p.name}`);
    }
    // Bản đồ lớn (phím M) ở trạm.
    await gm(page, 'tp dm_tram');
    await sleep(2500);
    await page.keyboard.press('KeyM');
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'worldmap.png') });
    await page.keyboard.press('Escape');
    await sleep(500);
    if (errors.length) console.warn(`[shots-e2a] ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
    await ctx.close();
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[shots-e2a] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
