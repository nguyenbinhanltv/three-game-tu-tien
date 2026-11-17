// pnpm bench:levels (E1-D): kiểm `Game.enterLevel` không rò bộ nhớ. Vào game ở Vân Lam, rồi đổi Vân Lam → level thử `thu_nghiem`
// → Vân Lam nhiều vòng; sau mỗi vòng ghi geometry/texture của renderer, số đối tượng trong cảnh, heap JS và CPU khung. Hai số đầu
// (geometries, textures) và số đối tượng cảnh phải phẳng sau vòng 1 (vòng 1 còn tính các cache dựng một lần).
//   tsx src/levelswitch.ts [--cycles 5] [--renderers webgpu,webgl2] [--out <thư mục ảnh>] [--size 1280x720]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2618/5218), tắt tiếng, tự tắt khi xong. Kết quả JSON: bench/results/levels-<ngày>.json.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { createDevServer, ROOT, sleep } from './lib/devserver';
import { opt, ports } from './lib/env';
import { launchChrome } from './lib/browser';

const CYCLES = Number(opt('--cycles', '5'));
const RENDERERS = opt('--renderers', 'webgpu,webgl2').split(',');
const OUT = opt('--out', '');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const { port: PORT, clientPort: CLIENT_PORT } = ports(2618, 5218);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'levels', command: 'pnpm bench:levels' });


interface Snap {
  step: string;
  level: string;
  geometries: number;
  textures: number;
  sceneObjects: number;
  heapMB: number;
  cpuMs: number;
  drawCalls: number;
  triangles: number;
  swapMs?: number;
}

async function snap(page: Page, step: string): Promise<Snap> {
  // Cho GC và vài khung ổn định trước khi đo.
  await sleep(6000);
  return page.evaluate(async (step) => {
    const g = window.__game!;
    let n = 0;
    g.scene.traverse(() => n++);
    const gc = window.gc;
    gc?.();
    const t0 = performance.now();
    const f0 = g.frames;
    while (g.frames < f0 + 40) await new Promise((r) => requestAnimationFrame(r));
    const info = g.info();
    const mem = g.renderer.info.memory;
    return {
      step,
      level: g.shownLevel,
      geometries: mem.geometries,
      textures: mem.textures,
      sceneObjects: n,
      heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
      cpuMs: Math.round(((performance.now() - t0) / 40) * 100) / 100,
      drawCalls: info.drawCalls,
      triangles: info.triangles,
    };
  }, step);
}

async function swap(page: Page, id: string): Promise<number> {
  return page.evaluate(async (id) => {
    const g = window.__game!;
    const t0 = performance.now();
    const ok = await g.enterLevel(id);
    if (!ok) throw new Error('enterLevel không đổi: ' + id);
    return Math.round(performance.now() - t0);
  }, id);
}

async function main(): Promise<void> {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const browser = await launchChrome({ args: ['--js-flags=--expose-gc'] });
  const results: Record<string, Snap[]> = {};
  try {
    for (const renderer of RENDERERS) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', 'medium');` });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=LV_${renderer}${renderer === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const g = window.__game;
        return !!g && g.frames > 30 && !!g.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await sleep(8000); // texture mặt đất, model nạp lười xong
      const snaps: Snap[] = [await snap(page, 'khởi đầu Vân Lam')];
      const shot = async (name: string) => OUT && (await page.screenshot({ path: path.join(OUT, `${renderer}-${name}.png`) }));
      await shot('van_lam-truoc');
      for (let c = 1; c <= CYCLES; c++) {
        if (c === 1 && OUT) {
          // Màn tải: giữ lệnh nạp nhạc 1,5 s để chụp được màn tải trong lúc đổi.
          await page.evaluate(() => {
            const g = window.__game!;
            const orig = g.music.preloadLevel.bind(g.music);
            g.music.preloadLevel = async (...a: unknown[]) => {
              await new Promise((r) => setTimeout(r, 1500));
              return orig(...a);
            };
          });
          const p = swap(page, 'thu_nghiem');
          await sleep(600);
          await shot('man-tai');
          const ms = await p;
          await page.evaluate(() => {
            const g = window.__game!;
            delete g.music.preloadLevel;
          });
          const s = await snap(page, `vòng ${c}: thu_nghiem`);
          s.swapMs = ms;
          snaps.push(s);
          await page.evaluate(() => {
            const g = window.__game!;
            g.camPitch = 1.05;
            g.camDist = 160;
          });
          await sleep(800);
          await shot('thu_nghiem');
          await page.evaluate(() => {
            const g = window.__game!;
            g.camPitch = 0.38;
            g.camDist = 13;
          });
        } else {
          const ms = await swap(page, 'thu_nghiem');
          const s = await snap(page, `vòng ${c}: thu_nghiem`);
          s.swapMs = ms;
          snaps.push(s);
        }
        const ms2 = await swap(page, 'van_lam');
        const s2 = await snap(page, `vòng ${c}: van_lam`);
        s2.swapMs = ms2;
        snaps.push(s2);
        if (c === 1) await shot('van_lam-sau');
      }
      results[renderer] = snaps;
      console.log(`\n[${renderer}]`);
      console.table(snaps);
      const vl = snaps.filter((s) => s.level === 'van_lam');
      const grow = (k: 'geometries' | 'textures' | 'sceneObjects' | 'heapMB') => vl[vl.length - 1][k] - vl[1 < vl.length ? 1 : 0][k];
      console.log(`[${renderer}] Vân Lam từ vòng 1 → vòng ${CYCLES}: geometry ${grow('geometries') >= 0 ? '+' : ''}${grow('geometries')}, texture ${grow('textures') >= 0 ? '+' : ''}${grow('textures')}, đối tượng cảnh ${grow('sceneObjects') >= 0 ? '+' : ''}${grow('sceneObjects')}, heap ${grow('heapMB') >= 0 ? '+' : ''}${grow('heapMB')} MB`);
      if (errors.length) console.warn(`[${renderer}] lỗi console (${errors.length}):`, [...new Set(errors)].slice(0, 5));
      await ctx.close();
    }
  } finally {
    await browser.close();
    dev.stop();
  }
  const dir = path.join(ROOT, 'bench/results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `levels-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ cycles: CYCLES, results }, null, 1) + '\n');
  console.log('lưu', file);
}

main().catch((e) => {
  console.error('[levels] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
