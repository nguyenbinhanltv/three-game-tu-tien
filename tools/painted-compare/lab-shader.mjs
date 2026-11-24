// Lấy mã shader TSL sinh ra cho ô lá `mid` của cảnh thử (soi offline): ghi vertex.wgsl và fragment.wgsl vào --out.
//   node tools/painted-compare/lab-shader.mjs --ref <thư mục ref.json> --out <thư mục> [--dbg nostalk]
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
const dbg = arg('--dbg', '');
const port = Number(arg('--port', '5190'));
fs.mkdirSync(out, { recursive: true });
const dump = JSON.parse(fs.readFileSync(path.join(refDir, 'ref.json'), 'utf8'));
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
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(m.type(), m.text().slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/?paintedlab=1&mute=1&parts=blades&paint=0&size=960x540${dbg ? `&dbg=${dbg}` : ''}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => window.__paintedLab, null, { timeout: 90000 });
  await page.evaluate((d) => window.__paintedLab.apply(d), dump);
  await page.waitForTimeout(3000);
  const sh = await page.evaluate(() => window.__paintedLab.shader());
  fs.writeFileSync(path.join(out, 'vertex.wgsl'), sh.vertex);
  fs.writeFileSync(path.join(out, 'fragment.wgsl'), sh.fragment);
  console.log('ok', sh.vertex.length, sh.fragment.length);
} finally {
  await browser?.close();
  kill();
}
