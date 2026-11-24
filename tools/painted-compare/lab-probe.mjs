// Đo nhanh cảnh thử `?paintedlab=1`: với mỗi biến thể (parts, paint) mở trang, chờ có draw call, rồi đếm số khung vẽ trong vài giây.
// Không chụp ảnh (chụp treo khi khung quá nặng). Dùng để tìm phần làm khung nặng.
//   node tools/painted-compare/lab-probe.mjs --ref <thư mục ref.json> [--variants ground,blades,flowers,all] [--port 5190] [--secs 8]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../perf/package.json', import.meta.url));
const { chromium } = require('playwright');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const refDir = path.resolve(arg('--ref', 'painted-ref'));
const port = Number(arg('--port', '5190'));
const secs = Number(arg('--secs', '8'));
const variants = arg('--variants', 'ground,blades,flowers,all').split(',');
const dump = JSON.parse(fs.readFileSync(path.join(refDir, 'ref.json'), 'utf8'));
const root = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const T0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s] ${m}`);

const vite = spawn('pnpm', ['--filter', '@dtl/client', 'exec', 'vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
  cwd: root,
  shell: true,
  stdio: 'ignore',
});
const kill = () => {
  try {
    execFileSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* đã tắt */
  }
};
process.on('exit', kill);
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  for (const v of variants) {
    const parts = v === 'all' ? 'ground,blades,flowers' : v.replace(/\+/g, ',');
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`http://127.0.0.1:${port}/?paintedlab=1&mute=1&parts=${parts}${v.includes('nopaint') ? '&paint=0' : ''}`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => window.__paintedLab, null, { timeout: 60000 });
    await page.evaluate((d) => window.__paintedLab.apply(d), dump);
    const t0 = Date.now();
    let info = { drawCalls: 0, frames: 0, triangles: 0 };
    while (Date.now() - t0 < 90000) {
      info = await page.evaluate(() => window.__paintedLab.info());
      if (info.frames > 2) break;
      await page.waitForTimeout(500);
    }
    const warm = Math.round((Date.now() - t0) / 1000);
    const f0 = info.frames;
    await page.waitForTimeout(secs * 1000);
    const f1 = (await page.evaluate(() => window.__paintedLab.info())).frames;
    log(`${v}: ${info.drawCalls} draw, ${info.triangles} tri, biên dịch/khởi động ${warm}s, ${((f1 - f0) / secs).toFixed(2)} khung/s`);
    await page.close();
  }
} finally {
  await browser?.close();
  kill();
}
