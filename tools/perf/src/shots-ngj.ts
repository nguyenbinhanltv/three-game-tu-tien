// pnpm shots:ngj: ảnh trang bộ giao diện Ngọc Giản Kim Văn (?ui=kit, UI-1) ở 1080p và 1440p + đo chi phí khung của UI (CDP Performance).
//   tsx src/shots-ngj.ts --out <thư mục tuyệt đối> [--url http://localhost:5258]
// Không --url thì tự chạy vite client ở CLIENT_PORT (mặc định 5258) rồi tự tắt. Luôn ?mute=1 và --mute-audio. Ghi ngj-metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ngj'));
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5258);
const URL_ARG = opt('--url', '');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let vite: ChildProcess | undefined;
const base = URL_ARG || `http://localhost:${CLIENT_PORT}`;
if (!URL_ARG) {
  vite = spawn('pnpm', ['--filter', '@dtl/client', 'exec', 'vite', '--port', String(CLIENT_PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* chưa sẵn */
    }
    await sleep(500);
  }
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
const metrics: Record<string, unknown> = {};
try {
  for (const [name, w, h] of [['1080p', 1920, 1080], ['1440p', 2560, 1440]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/?ui=kit&mute=1`);
    await page.waitForSelector('.ngj-kit-grid');
    await sleep(900);
    // #root là vùng cuộn (như ?viewer=ui): chụp từng trang theo chiều cao khung nhìn
    const total = (await page.evaluate(`document.getElementById('root').scrollHeight`)) as number;
    for (let i = 0, y = 0; y < total; i++, y += h - 80) {
      await page.evaluate(`document.getElementById('root').scrollTo(0, ${y})`);
      await sleep(250);
      await page.screenshot({ path: path.join(OUT, `kit-${name}-${i + 1}.jpg`), type: 'jpeg', quality: 86 });
    }
    // chú giải: rê vào ô mẫu ở mục Chú giải rồi chụp trang đó
    const tip = page.locator('.ngj-sec', { hasText: /Chú giải/ }).locator('.ngj-slot').first();
    await tip.scrollIntoViewIfNeeded();
    await tip.hover();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, `kit-${name}-tooltip.jpg`), type: 'jpeg', quality: 86 });
    await page.evaluate(`document.getElementById('root').scrollTo(0, 0)`);
    // chi phí khung khi để yên 3 s (CDP)
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const a = await read();
    await sleep(3000);
    const b = await read();
    const d = (k: string) => ((b[k] as number) - (a[k] as number)) * 1000;
    const frames = await page.evaluate(
      `new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => (performance.now() - t0 > 1000 ? r(n) : (n++, requestAnimationFrame(f))); requestAnimationFrame(f); })`,
    ) as number;
    metrics[name] = { idleTaskMsPer3s: +d('TaskDuration').toFixed(2), layoutMs: +d('LayoutDuration').toFixed(2), styleMs: +d('RecalcStyleDuration').toFixed(2), scriptMs: +d('ScriptDuration').toFixed(2), fps: frames, errors };
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'ngj-metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await browser.close();
  if (vite?.pid) spawnSync('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' });
}
