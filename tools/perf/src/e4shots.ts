// Ảnh trước/sau P2-E4: camera theo khu, nhãn khi camera sát/đông quái, mặt trời sau núi.
//   tsx src/e4shots.ts --out <thư mục> [--tag sau] [--query e4=0] [--renderers webgpu,webgl2] [--presets medium] [--only a,b]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2586/5187), tắt tiếng (--mute-audio), GPU thật nếu có.
import path from 'node:path';
import fs from 'node:fs';
import { LAKE, SPAWN_POINT } from '@dtl/shared';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots'));
const TAG = opt('--tag', 'sau');
const RENDERERS = opt('--renderers', 'webgpu').split(',');
const PRESETS = opt('--presets', 'medium').split(',');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const EXTRA = opt('--query', '');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2586);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5187);

interface Pt {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  dist: number;
  /** Lệnh GM chạy sau khi tới nơi. */
  gm?: string[];
  /** Cho quái gần mình xuất hiện/đứng yên. */
  wait?: number;
}
const POINTS: Pt[] = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.0, pitch: 0.3, dist: 13 },
  { name: 'kiemtrung', x: 900, z: 1052, yaw: 0.4, pitch: 0.3, dist: 13 },
  { name: 'ho', x: LAKE.x + 380, z: LAKE.z, yaw: 1.57, pitch: 0.24, dist: 13 },
  { name: 'nhan_sat', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.3, pitch: 0.25, dist: 3, gm: ['spawn mon_soi_xam 1'], wait: 2500 },
  { name: 'nhan_dong', x: 2048, z: 2455, yaw: 0.3, pitch: 0.35, dist: 12, gm: ['spawn mon_soi_xam 8'], wait: 3500 },
  // Nhìn về phía mặt trời (đông nam, hướng (0.8, 0.6)) từ chân núi và từ sân.
  { name: 'matroi_sau_nui', x: 2048, z: 2455, yaw: -2.214, pitch: 0.12, dist: 14 },
  { name: 'matroi_san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: -2.214, pitch: 0.08, dist: 14 },
  { name: 'matroi_cao', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: -2.214, pitch: -0.44, dist: 7 },
  { name: 'matroi_ho1', x: 1822, z: 2180, yaw: -2.0, pitch: -0.2, dist: 8 },
  { name: 'matroi_ho2', x: 1822, z: 2180, yaw: -2.1, pitch: -0.4, dist: 8 },
  { name: 'kt_sun1', x: 900, z: 1052, yaw: -2.214, pitch: 0.0, dist: 8 },
  { name: 'kt_sun2', x: 900, z: 1052, yaw: -2.214, pitch: -0.2, dist: 8 },
  { name: 'kt_sun3', x: 900, z: 1052, yaw: -2.214, pitch: -0.4, dist: 8 },
  { name: 'sun_a', x: 1620, z: 2100, yaw: -2.214, pitch: -0.45, dist: 5 },
  { name: 'sun_b', x: 1580, z: 2140, yaw: -2.214, pitch: -0.45, dist: 5 },
  { name: 'sun_c', x: 1420, z: 2380, yaw: -2.214, pitch: -0.45, dist: 5 },
  { name: 'matroi_dinh', x: 1860, z: 1680, yaw: -2.214, pitch: 0.1, dist: 16 },
].filter((p) => !ONLY.length || ONLY.includes(p.name));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'e4shots', command: 'pnpm tsx src/e4shots.ts' });
type G = { __game?: Record<string, any> };

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
    for (const renderer of RENDERERS) {
      for (const preset of PRESETS) {
        const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
        await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(preset)});` });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        page.on('console', (m) => { if (process.env.E4_LOG) console.log('[page]', m.text().slice(0, 300)); if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
        const nm = `E4${renderer === 'webgpu' ? 'g' : 'l'}${preset[0]}${TAG[0]}${Date.now() % 1000}`;
        await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${nm}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}${EXTRA ? '&' + EXTRA : ''}`, { waitUntil: 'load' });
        await page.waitForFunction(() => {
          const g = (window as unknown as G).__game;
          return !!g && g.frames > 30 && !!g.me?.();
        }, undefined, { timeout: 120_000, polling: 250 });
        await page.keyboard.press('Shift');
        await sleep(600);
        await gm(page, 'level 15');
        await gm(page, 'god on');
        for (const p of POINTS) {
          await gm(page, `tp ${p.x} ${p.z}`);
          await gm(page, 'heal');
          await gm(page, 'killall');
          for (const c of p.gm ?? []) await gm(page, c);
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
              return { x: g.renderPos.x, z: g.renderPos.z, ground: 'ground' in g ? !!g.ground : true };
            });
            if (Math.hypot(s.x - p.x, s.z - p.z) < 3 && s.ground) break;
            await sleep(300);
          }
          await sleep((p.wait ?? 0) + Number(process.env.SHOT_SETTLE ?? 4000));
          const file = path.join(OUT, `${TAG}-${renderer}-${preset}-${p.name}.png`);
          await page.screenshot({ path: file });
          console.log(`[e4shots] ${path.basename(file)}`);
        }
        if (errors.length) console.warn(`[e4shots] ${renderer}/${preset}: ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 6).join('\n  '));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[e4shots] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
