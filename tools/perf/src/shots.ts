// pnpm shots: chụp ảnh màn hình cố định để so trước/sau khi đổi render (P2-A2/A6).
//   tsx src/shots.ts --out <thư mục> [--renderers webgpu,webgl2] [--presets low,medium,high] [--points a,b] [--size 1280x720]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175) với DB tạm, mở game `?mute=1&auto=<tên>`, tắt tiếng
// (--mute-audio), dịch chuyển bằng `/gm tp` tới 5 điểm (sân tông môn, sơn đạo, rừng, ven hồ, đỉnh núi nhìn biển mây), đặt camera cố định,
// chờ ô địa hình và (nếu có) texture mặt đất nạp xong rồi chụp `<out>/<renderer>-<preset>-<điểm>.png`.
import path from 'node:path';
import fs from 'node:fs';
import { FOREST, LAKE, LAKE_WATER_R, SPAWN_POINT } from '@dtl/shared';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots'));
const RENDERERS = opt('--renderers', 'webgpu,webgl2').split(',');
const PRESETS = opt('--presets', 'low,medium,high').split(',');
const ONLY = opt('--points', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const EXTRA = opt('--query', '');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

/** yaw: hướng camera (rad); pitch/dist: góc nhìn và khoảng cách. */
const POINTS = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.0, pitch: 0.3, dist: 16 },
  { name: 'sondao', x: 2048, z: 2330, yaw: 3.14, pitch: 0.3, dist: 14 },
  { name: 'rung', x: FOREST.x - 40, z: FOREST.z, yaw: 1.2, pitch: 0.28, dist: 14 },
  { name: 'ho', x: LAKE.x + LAKE_WATER_R + 6, z: LAKE.z, yaw: 1.57, pitch: 0.24, dist: 14 },
  { name: 'dinh', x: 1860, z: 1680, yaw: 3.14, pitch: 0.0, dist: 8 },
].filter((p) => !ONLY.length || ONLY.includes(p.name));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots', command: 'pnpm shots' });
type G = { __game?: Record<string, any> };

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(1000);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  try {
    for (const renderer of RENDERERS) {
      for (const preset of PRESETS) {
        const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
        await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(preset)});` });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 600)));
        const name = `Shot_${renderer === 'webgpu' ? 'gpu' : 'gl'}_${preset}`.slice(0, 14);
        await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}${EXTRA ? '&' + EXTRA : ''}`, { waitUntil: 'load' });
        await page.waitForFunction(() => {
          const g = (window as unknown as G).__game;
          return !!g && g.frames > 30 && !!g.me?.();
        }, undefined, { timeout: 120_000, polling: 250 });
        await gm(page, 'level 15');
        for (const p of POINTS) {
          await gm(page, `tp ${p.x} ${p.z}`);
          await gm(page, 'heal');
          await page.evaluate((c) => {
            const g = (window as unknown as G).__game!;
            g.camYaw = c.yaw;
            g.camPitch = c.pitch;
            g.camDist = c.dist;
          }, p);
          // Chờ tới nơi, ô địa hình ổn định và texture mặt đất (nếu bản này có) đã nạp.
          const until = Date.now() + 40_000;
          while (Date.now() < until) {
            const s = await page.evaluate(() => {
              const g = (window as unknown as G).__game!;
              return { d: Math.hypot(g.renderPos.x - 0, g.renderPos.z - 0), x: g.renderPos.x, z: g.renderPos.z, ground: 'ground' in g ? !!g.ground : true };
            });
            if (Math.hypot(s.x - p.x, s.z - p.z) < 3 && s.ground) break;
            await sleep(300);
          }
          await sleep(2500);
          const file = path.join(OUT, `${renderer}-${preset}-${p.name}.png`);
          await page.screenshot({ path: file });
          console.log(`[shots] ${path.basename(file)}`);
        }
        if (errors.length) console.warn(`[shots] ${renderer}/${preset}: ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 6).join('\n  '));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[shots] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
