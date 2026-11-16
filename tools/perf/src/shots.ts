// pnpm shots: chụp ảnh màn hình cố định để so trước/sau khi đổi render (P2-A2/A6).
//   tsx src/shots.ts --out <thư mục> [--renderers webgpu,webgl2] [--presets low,medium,high] [--points a,b] [--size 1280x720] [--level <id>] [--dry]
//   --level: level khác Vân Lam dùng điểm suy từ dữ liệu level (tâm vùng, điểm đáng chú ý, boss, tinh anh, toàn cảnh: `levelpoints.ts`) và thêm `level=<id>` vào URL;
//            tên file ảnh thêm tiền tố level. --dry: chỉ in danh sách điểm rồi thoát (không chạy server/trình duyệt).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175) với DB tạm, mở game `?mute=1&auto=<tên>`, tắt tiếng
// (--mute-audio), dịch chuyển bằng `/gm tp` tới 5 điểm (sân tông môn, sơn đạo, rừng, ven hồ, đỉnh núi nhìn biển mây), đặt camera cố định,
// chờ ô địa hình và (nếu có) texture mặt đất nạp xong rồi chụp `<out>/<renderer>-<preset>-<điểm>.png`.
import path from 'node:path';
import fs from 'node:fs';
import { FOREST, LAKE, LAKE_WATER_R, SPAWN_POINT } from '@dtl/shared';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';
import { levelPoints, levelQuery, requireLevel } from './levelpoints';

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
const LEVEL = opt('--level', 'van_lam');
const DRY = args.includes('--dry');
const EXTRA = [levelQuery(LEVEL), opt('--query', '')].filter(Boolean).join('&');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

/** yaw: hướng camera (rad); pitch/dist: góc nhìn và khoảng cách. */
const VAN_LAM_POINTS = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.0, pitch: 0.3, dist: 16 },
  { name: 'sondao', x: 2048, z: 2330, yaw: 3.14, pitch: 0.3, dist: 14 },
  { name: 'dao', x: 2048, z: 2150, yaw: 3.14, pitch: 0.28, dist: 14 },
  { name: 'rung', x: FOREST.x - 40, z: FOREST.z, yaw: 1.2, pitch: 0.28, dist: 14 },
  { name: 'ho', x: LAKE.x - 185, z: LAKE.z, yaw: -1.57, pitch: 0.24, dist: 14 },
  { name: 'khe', x: 2000, z: 2540, yaw: 3.14, pitch: 0.22, dist: 16 },
  { name: 'khe0', x: 2000, z: 2540, yaw: 0, pitch: 0.22, dist: 16 },
  { name: 'cothu', x: 2500, z: 2100, yaw: 0, pitch: 0.18, dist: 14 },
  { name: 'cothu3', x: 2500, z: 2020, yaw: 3.14, pitch: 0.18, dist: 14 },
  { name: 'cothu2', x: 2490, z: 2095, yaw: 3.14, pitch: 0.22, dist: 14 },
  { name: 'bohd', x: 1490, z: 2230, yaw: -1.57, pitch: 0.2, dist: 14 },
  { name: 'suoi', x: 2390, z: 2400, yaw: 3.14, pitch: 0.3, dist: 14 },
  { name: 'vach', x: 2450, z: 1790, yaw: 3.14, pitch: 0.28, dist: 14 },
  { name: 'ranh', x: 2048 + 1070, z: 2300, yaw: -1.57, pitch: 0.2, dist: 14 },
  { name: 'trencao', x: 2200, z: 2250, yaw: 0, pitch: 1.2, dist: 700 },
  { name: 'dinh', x: 2400, z: 1700, yaw: 3.14, pitch: 0.4, dist: 16 },
];
requireLevel(LEVEL);
const POINTS = (LEVEL === 'van_lam' ? VAN_LAM_POINTS : levelPoints(LEVEL)).filter((p) => !ONLY.length || ONLY.includes(p.name));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots', command: 'pnpm shots' });
type G = { __game?: Record<string, any> };

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(1000);
}

async function main(): Promise<void> {
  if (DRY) {
    for (const p of POINTS) console.log(`${LEVEL}/${p.name}	${Math.round(p.x)}, ${Math.round(p.z)}`);
    return;
  }
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
        // Nhân vật mới có đoạn mở đầu (letterbox + chữ): bấm phím để bỏ qua trước khi chụp.
        await page.keyboard.press('Shift');
        await sleep(600);
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
          await sleep(Number(process.env.SHOT_SETTLE ?? 2500));
          const file = path.join(OUT, `${LEVEL === 'van_lam' ? '' : LEVEL + '-'}${renderer}-${preset}-${p.name}.png`);
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
