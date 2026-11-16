// pnpm shots:boss: ảnh boss mở rộng (E-2/E-3/E-4) trên GPU thật qua trang xem `?show=boss`: tấm xoay bốn hướng và tấm clip
// (idle, run, attack, slam, sweep, chant, stun, hit_light, death × 5 khung) cho từng boss. Tắt tiếng (?mute=1, --mute-audio).
//   tsx src/shots-boss.ts --out <thư mục> [--only id,id] [--renderer webgpu|webgl2] [--frames 5]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2612/5212) rồi tự tắt.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-boss'));
const RENDERER = opt('--renderer', 'webgpu');
const FRAMES = Number(opt('--frames', '5'));
const ONLY = opt('--only', '').split(',').filter(Boolean);
const PORT = Number(process.env.PORT ?? 2612);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5212);
const BOSSES = [
  'boss_dia_mach_long',
  'boss_thon_mach_ngo_cong_vuong',
  'boss_thach_tam_khoi_vuong',
  'boss_van_hai_kinh_vuong',
  'boss_kinh_nguyet_chan_quan',
  'boss_thien_khuyet_thu_linh',
  'boss_vo_dien_than_quan',
];
const CLIPS = ['idle', 'run', 'attack', 'slam', 'sweep', 'chant', 'stun', 'hit_light', 'death'];
type V = {
  __viewer?: {
    clips: { name: string; duration: number }[];
    playClip(i: number): void;
    seek(t: number): void;
    setView(v: string): void;
    setHuman(on: boolean): void;
    camera: { position: { x: number; y: number; z: number; sub(v: unknown): { multiplyScalar(k: number): { add(v: unknown): void } } } };
    controls: { target: unknown; update(): void };
    paused: boolean;
  };
};

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-boss', command: 'pnpm shots:boss' });

/** Ghép ảnh (data URL) thành một tấm lưới bằng trang HTML phụ rồi chụp. */
async function sheet(page: Page, rows: { label: string; imgs: Buffer[] }[], cell: number, file: string): Promise<void> {
  const html = `<body style="margin:0;background:#20242a;font:12px sans-serif;color:#ddd">${rows
    .map((r) => `<div style="display:flex;align-items:center"><div style="flex:none;width:84px;text-align:right;padding-right:6px">${r.label}</div>${r.imgs.map((b) => `<img style="flex:none" width=${cell} height=${cell} src="data:image/jpeg;base64,${b.toString('base64')}">`).join('')}</div>`)
    .join('')}</body>`;
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 90 + cell * Math.max(...rows.map((r) => r.imgs.length)), height: cell * rows.length });
  await p.setContent(html);
  await p.screenshot({ path: file, type: 'jpeg', quality: 84 });
  await p.close();
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    for (const id of BOSSES.filter((b) => !ONLY.length || ONLY.includes(b))) {
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=boss&id=${id}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window as unknown as V).__viewer?.clips?.length, undefined, { timeout: 60_000 });
      await page.addStyleTag({ content: '.viewer-panel{display:none!important}.viewer-host{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
      await page.evaluate(() => { (window as unknown as V).__viewer!.setHuman(false); window.dispatchEvent(new Event('resize')); });
      await sleep(800);
      const shot = async () => (await page.screenshot({ type: 'jpeg', quality: 86 })) as Buffer;
      // tấm xoay: bốn hướng ở clip idle khung 0
      await page.evaluate(() => {
        const v = (window as unknown as V).__viewer!;
        v.playClip(Math.max(0, v.clips.findIndex((c) => c.name === 'idle')));
        v.seek(0);
      });
      const turn: Buffer[] = [];
      for (const view of ['front', 'side', 'back', 'iso']) {
        await page.evaluate((vw) => { const v = (window as unknown as V).__viewer!; v.setView(vw); const t = v.controls.target; v.camera.position.sub(t).multiplyScalar(1.35).add(t); v.controls.update(); }, view);
        await sleep(350);
        turn.push(await shot());
      }
      await sheet(page, [{ label: 'xoay', imgs: turn }], 320, path.join(OUT, `${id}_turntable.jpg`));
      // tấm clip: nhìn chéo, các khung chia đều theo thời lượng
      await page.evaluate(() => { const v = (window as unknown as V).__viewer!; v.setView('iso'); const t = v.controls.target; v.camera.position.sub(t).multiplyScalar(1.35).add(t); v.controls.update(); });
      const rows: { label: string; imgs: Buffer[] }[] = [];
      for (const clip of CLIPS) {
        const dur = await page.evaluate((c) => {
          const v = (window as unknown as V).__viewer!;
          const i = v.clips.findIndex((x) => x.name === c);
          if (i < 0) return 0;
          v.playClip(i);
          return v.clips[i].duration;
        }, clip);
        if (!dur) continue;
        const imgs: Buffer[] = [];
        for (let k = 0; k < FRAMES; k++) {
          await page.evaluate((t) => (window as unknown as V).__viewer!.seek(t), (dur * k) / (FRAMES - 1) - (k === FRAMES - 1 ? 1e-3 : 0));
          await sleep(220);
          imgs.push(await shot());
        }
        rows.push({ label: `${clip} ${dur.toFixed(1)}s`, imgs });
      }
      await sheet(page, rows, 200, path.join(OUT, `${id}_clips.jpg`));
      console.log(`[shots-boss] ${id}: ${rows.length} clip`);
    }
    fs.writeFileSync(path.join(OUT, 'errors.log'), errors.join('\n'));
    if (errors.length) console.warn(`[shots-boss] ${errors.length} lỗi console, xem errors.log`);
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
