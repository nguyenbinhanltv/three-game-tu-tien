// pnpm shots:s2b (S2-B): ảnh trước/sau cho nhãn tên (T8) và hiệu ứng trúng đòn khi bị quái cắn.
//   tsx src/shots-s2b.ts --out <thư mục> [--renderers webgpu,webgl2] [--presets high] [--size 1280x720]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng, chụp nhãn ở sân tông môn và rừng, rồi
// bơm S.FX bite + S.DMG vào client và dừng vòng lặp sau 1 khung (và sau 4 khung) để chụp đúng đỉnh hiệu ứng.
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
const PRESETS = opt('--presets', 'high').split(',');
const ONLY = opt('--points', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const EXTRA = opt('--query', '');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const POINTS = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z, yaw: 0.0, pitch: 0.3, dist: 9 },
  { name: 'rung', x: FOREST.x - 40, z: FOREST.z, yaw: 1.2, pitch: 0.28, dist: 9 },
];
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-s2b', command: 'pnpm shots:s2b' });
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
      const preset = PRESETS[0];
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(preset)});` });
      const page = await ctx.newPage();
      const name = `S2B_${renderer === 'webgpu' ? 'gpu' : 'gl'}`;
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game;
        return !!g && g.frames > 30 && !!g.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
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
        await sleep(6000);
        await page.screenshot({ path: path.join(OUT, `${renderer}-${p.name}-nhan.png`) });
        console.log(`[shots] ${renderer}-${p.name}-nhan.png`);
        if (p.name !== 'rung') continue;
        // Trúng đòn: bơm tin S.FX bite + S.DMG vào client, dừng vòng lặp sau 1 khung để chụp đúng đỉnh hiệu ứng.
        for (const [tag, extra] of [['0', 0], ['3', 3]] as const) {
          const ok = await page.evaluate(async (extraFrames) => {
            const g = (window as unknown as G).__game!;
            const wolf = [...g.view.monsters.keys()][0];
            if (!wolf) return false;
            const me = g.sid;
            g.onFx({ t: 'bite', src: wolf, dst: me });
            g.onDmg({ src: wolf, dst: me, n: 20, crit: 0 });
            const f0 = g.frames;
            while (g.frames < f0 + 1 + extraFrames) await new Promise((r) => requestAnimationFrame(r));
            g.renderer.setAnimationLoop(null);
            return true;
          }, extra);
          if (!ok) console.warn('[shots] không có quái trong tầm để chụp trúng đòn');
          await sleep(300);
          await page.screenshot({ path: path.join(OUT, `${renderer}-hit-${tag}.png`) });
          console.log(`[shots] ${renderer}-hit-${tag}.png`);
          await page.evaluate(() => {
            const g = (window as unknown as G).__game!;
            g.renderer.setAnimationLoop(() => g.frame());
          });
          await sleep(1500);
        }
      }
      await ctx.close();
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
