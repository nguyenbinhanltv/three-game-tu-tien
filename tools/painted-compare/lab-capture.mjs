// Chụp cảnh thử `?paintedlab=1` của ta bằng đúng bản dump uniform của tham chiếu (ref.json), cùng cỡ ảnh, rồi so với ref.png.
//   node tools/painted-compare/lab-capture.mjs --ref <thư mục có ref.png + ref.json> --out <thư mục ra> [--paint 3] [--win x,z] [--renderer webgpu|webgl2] [--port 5190]
// Tự bật vite của client (cổng --port), mở MỘT Chromium, tắt cả hai khi xong. Ghi ours.png, diff.png, metrics.json; in SSIM/ΔE.
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
const out = path.resolve(arg('--out', refDir));
const port = Number(arg('--port', '5190'));
const paint = arg('--paint', '3');
const win = arg('--win', '-20,-90');
const renderer = arg('--renderer', 'webgpu');
const parts = arg('--parts', 'ground,blades,flowers');
fs.mkdirSync(out, { recursive: true });
const dump = JSON.parse(fs.readFileSync(path.join(refDir, 'ref.json'), 'utf8'));
const T0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
const [W, H] = arg('--size', '1920x1080').split('x').map(Number);

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
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) break;
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
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const logs = [];
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    const t = `${m.type()}: ${m.text()}`.slice(0, 400);
    logs.push(t);
    if (logs.length <= 12) console.log(t);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`.slice(0, 300)));
  console.log('vite lên, mở trang');
  await page.goto(`http://127.0.0.1:${port}/?paintedlab=1&mute=1&paint=${paint}&win=${win}&renderer=${renderer}&parts=${parts}`, {
    waitUntil: 'load',
  });
  await page
    .waitForFunction(() => window.__paintedLab, null, { timeout: 60000 })
    .catch((e) => {
      console.log('lab không lên:', String(e.message).slice(0, 80));
      throw e;
    });
  console.log('lab lên, áp dump + dựng pipeline');
  await page.evaluate(async (d) => {
    await window.__paintedLab.apply(d);
  }, dump);
  // WebGPU biên dịch pipeline bất đồng bộ; vòng rAF của lab tự vẽ. Chờ tới khi có draw call (tối đa 150 s) rồi thêm vài khung
  const t0 = Date.now();
  let calls = 0;
  while (Date.now() - t0 < 150000) {
    calls = await page.evaluate(() => window.__paintedLab.info().drawCalls);
    if (calls > 0) break;
    await page.waitForTimeout(500);
  }
  log(`có ${calls} draw call sau ${Math.round((Date.now() - t0) / 1000)} s`);
  await page.waitForTimeout(3000);
  log('đã render, chụp');
  await page.waitForTimeout(1500);
  // đọc ảnh bằng readback render target (screenshot treo khi khung quá nặng)
  const rb = await page.evaluate(() => window.__paintedLab.readback());
  log(`readback ${rb.width}x${rb.height} mất ${rb.ms} ms`);
  const sharp = require('sharp');
  await sharp(Buffer.from(rb.b64, 'base64'), { raw: { width: rb.width, height: rb.height, channels: 4 } })
    .removeAlpha()
    .png()
    .toFile(path.join(out, 'ours.png'));
  const info = await page.evaluate(() => window.__paintedLab.info());
  fs.writeFileSync(path.join(out, 'lab-info.json'), JSON.stringify({ info, logs }, null, 2));
  console.log('draw/tri', JSON.stringify(info), logs.length ? `\n${logs.slice(0, 6).join('\n')}` : '');
} finally {
  await browser?.close();
  kill();
}
const metrics = execFileSync('node', [
  path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'compare.mjs'),
  path.join(refDir, 'ref.png'),
  path.join(out, 'ours.png'),
  '--out',
  path.join(out, 'diff.png'),
  '--json',
  path.join(out, 'metrics.json'),
]).toString();
console.log(metrics.trim());
