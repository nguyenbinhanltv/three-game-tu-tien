// Chụp cảnh thử bản đồ độ cao vùng xa `?paintedlab=far` (P3a) + đọc số min/max/mean.
//   node tools/painted-compare/far-capture.mjs --out <thư mục ra> [--size 1024] [--port 5191] [--renderer webgpu|webgl2]
// Tự bật vite của client, mở MỘT Chromium (tắt tiếng), tắt cả hai khi xong. Ghi far.png và far.json.
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
const out = path.resolve(arg('--out', 'far-out'));
const port = Number(arg('--port', '5191'));
const size = Number(arg('--size', '1024'));
const renderer = arg('--renderer', 'webgpu');
const query = arg('--query', '');
const [vw, vh] = arg('--viewport', `${size}x${size}`).split('x').map(Number);
const waitFlag = arg('--wait', '__farLab');
fs.mkdirSync(out, { recursive: true });

const root = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
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
  browser = await chromium
    .launch({
      channel: 'chrome',
      headless: true,
      args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'],
    })
    .catch(() => chromium.launch({ headless: true, args: ['--mute-audio'] }));
  const page = await (await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })).newPage();
  const logs = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`.slice(0, 500));
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`.slice(0, 400)));
  await page.goto(`http://127.0.0.1:${port}/?paintedlab=far&mute=1&size=${size}&renderer=${renderer}${query ? `&${query}` : ''}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction((k) => window[k], waitFlag, { timeout: 120000 }).catch(() => logs.push('lab không lên'));
  await new Promise((r) => setTimeout(r, 1500));
  const stats =
    waitFlag === '__farLab'
      ? await page.evaluate(() => window.__farLab?.stats()).catch((e) => ({ error: String(e) }))
      : ((await page.evaluate(() => window.__domeBake)) ?? { ok: true });
  await page.screenshot({ path: path.join(out, 'far.png') });
  fs.writeFileSync(path.join(out, 'far.json'), JSON.stringify({ stats, logs: logs.slice(0, 20) }, null, 2));
  console.log(JSON.stringify({ stats, logs: logs.slice(0, 6) }));
} finally {
  await browser?.close().catch(() => {});
  kill();
}
