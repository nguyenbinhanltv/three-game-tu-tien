// pnpm shots:props: ảnh turntable (4 hướng: trước +Z, phải, sau, trái) của asset trong trang xem (?show=<id>), ghép thành một ảnh mỗi asset.
//   tsx src/shots-props.ts --out <thư mục> [--ids a,b,c | --group props|artifacts|all] [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2616/5216), tắt tiếng (?mute=1, --mute-audio) và tự tắt khi xong.
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-props'));
const RENDERER = opt('--renderer', 'webgpu');
const IDS = opt('--ids', '').split(',').filter(Boolean);
const PORT = Number(process.env.PORT ?? 2616);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5216);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-props', command: 'pnpm shots:props' });
type V = { __viewer?: { camera: { position: { x: number; y: number; z: number }; lookAt(x: number, y: number, z: number): void }; controls: { target: { x: number; y: number; z: number }; update(): void; autoRotate: boolean } } };

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  if (!IDS.length) throw new Error('--ids a,b,c bắt buộc');
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 }, deviceScaleFactor: 1 });
    for (const id of IDS) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${id}: ${m.text().slice(0, 200)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=${id}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window as unknown as V).__viewer, undefined, { timeout: 60_000 });
      await sleep(2500);
      await page.addStyleTag({ content: '.viewer-panel, .viewer-hud, .panel, aside, header { display: none !important; }' });
      const shots: string[] = [];
      const base = await page.evaluate(() => {
        const v = (window as unknown as V).__viewer!;
        v.controls.autoRotate = false;
        const t = v.controls.target;
        const p = v.camera.position;
        return { dx: p.x - t.x, dy: p.y - t.y, dz: p.z - t.z };
      });
      for (let k = 0; k < 4; k++) {
        await page.evaluate(([b, a]) => {
          const v = (window as unknown as V).__viewer!;
          const r = Math.hypot(b.dx, b.dz);
          const a0 = a; // 0 = camera ở +Z nhìn về -Z (mặt trước)
          const t = v.controls.target;
          v.camera.position.x = t.x + Math.sin(a0) * r;
          v.camera.position.z = t.z + Math.cos(a0) * r;
          v.camera.position.y = t.y + b.dy;
          v.controls.update();
        }, [base, (k * Math.PI) / 2] as const);
        await sleep(500);
        const box = await page.evaluate(() => { const c = document.querySelector("canvas")!.getBoundingClientRect(); return { x: c.x, y: c.y, width: c.width, height: c.height }; });
        shots.push((await page.screenshot({ clip: box })).toString("base64"));
      }
      await page.close();
      const sheet = await ctx.newPage();
      await sheet.setViewportSize({ width: 1280, height: 1040 });
      await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:1fr 1fr">${shots.map((s) => `<img style="width:640px;height:520px;object-fit:contain" src="data:image/png;base64,${s}">`).join('')}</body>`);
      await sheet.screenshot({ path: path.join(OUT, `${id}.png`) });
      await sheet.close();
      console.log('ảnh', id);
    }
  } finally {
    await browser.close();
    dev.stop();
  }
  if (errors.length) console.log('lỗi console:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
}
main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
