// pnpm shots:elite: ảnh 12 tinh anh Tripo (elite_*) trong trang xem asset (?show=<id>): bốn góc nhìn và lưới animation
// (idle/run/attack/death × 5 khung) để duyệt hình. Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2611/5211), tắt tiếng
// (?mute=1, --mute-audio), tự tắt server khi xong.
//   tsx src/shots-elite.ts --out <thư mục> [--only id,id] [--renderer webgpu|webgl2] [--clips idle,run,attack,death]
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-elite'));
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const CLIPS = opt('--clips', 'idle,run,attack,death').split(',');
const PORT = Number(process.env.PORT ?? 2611);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5211);
const IDS = [
  'elite_huyet_nha_lang', 'elite_xich_dien_ho', 'elite_cu_nham_vien',
  'elite_xich_sa_ngo_cong', 'elite_ho_mach_khoi_tuong', 'elite_liet_cot_bao',
  'elite_loi_van_su_vuong', 'elite_kinh_dien_ma_quan', 'elite_van_hac_vuong',
  'elite_cot_kiem_thong_linh', 'elite_da_minh_loc_vuong', 'elite_thach_tuong_dai_tuong',
].filter((id) => !ONLY.length || ONLY.includes(id));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-elite', command: 'pnpm shots:elite' });
type V = { __viewer?: Record<string, any> };

async function canvasShot(page: Page): Promise<Buffer> {
  const el = await page.$('canvas');
  return (await el!.screenshot()) as Buffer;
}

async function sheet(page: Page, file: string, rows: { label: string; shots: Buffer[] }[], w: number): Promise<void> {
  const html = `<body style="margin:0;background:#1b1d22;color:#ddd;font:14px sans-serif">${rows
    .map((r) => `<div style="padding:4px 8px">${r.label}</div><div style="display:flex">${r.shots.map((b) => `<img width="${w}" src="data:image/png;base64,${b.toString('base64')}">`).join('')}</div>`)
    .join('')}</body>`;
  await page.setContent(html);
  await sleep(300);
  fs.writeFileSync(file, (await page.screenshot({ fullPage: true })) as Buffer);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const out = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    for (const id of IDS) {
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=${id}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window as unknown as V).__viewer?.model, undefined, { timeout: 60_000, polling: 250 });
      await page.addStyleTag({ content: '.viewer-panel, .panel, aside, header { display: none !important }' });
      const info = (await page.evaluate(() => {
        const v = (window as unknown as V).__viewer!;
        return { clips: v.clips.map((c: { name: string; duration: number }) => ({ name: c.name, d: c.duration })) };
      })) as { clips: { name: string; d: number }[] };
      const dir = path.join(OUT, id);
      fs.mkdirSync(dir, { recursive: true });
      await page.evaluate(() => (window as unknown as V).__viewer!.setHuman(false));
      const frame = (x: string, k = 1.55) =>
        page.evaluate(([view, f]) => {
          const v = (window as unknown as V).__viewer!;
          v.setView(view);
          v.camera.position.sub(v.controls.target).multiplyScalar(f).add(v.controls.target);
          v.controls.update();
        }, [x, k] as [string, number]);
      const view = async (v: string) => {
        await frame(v);
        await sleep(250);
        return canvasShot(page);
      };
      // Bốn góc ở dáng nghỉ (khung 0 của idle).
      const idle = info.clips.findIndex((c) => c.name === 'idle');
      if (idle >= 0) await page.evaluate((i) => { const v = (window as unknown as V).__viewer!; v.playClip(i); v.seek(0); }, idle);
      const stills = [];
      for (const v of ['iso', 'side', 'front', 'back']) stills.push(await view(v));
      await sheet(out, path.join(dir, 'stills.png'), [{ label: `${id} · iso / side / front / back`, shots: stills }], 320);
      const rows = [];
      await frame('side', 1.7);
      for (const name of CLIPS) {
        const i = info.clips.findIndex((c) => c.name === name);
        if (i < 0) continue;
        const d = info.clips[i].d;
        const shots = [];
        for (const f of [0, 0.25, 0.5, 0.75, 0.97]) {
          await page.evaluate(([k, t]) => { const v = (window as unknown as V).__viewer!; v.playClip(k); v.seek(t); }, [i, d * f] as [number, number]);
          await sleep(200);
          shots.push(await canvasShot(page));
        }
        rows.push({ label: `${name} (${d.toFixed(2)} s) · 0 / .25 / .5 / .75 / .97`, shots });
      }
      await sheet(out, path.join(dir, 'anim.png'), rows, 256);
      console.log(`[shots-elite] ${id}: ${info.clips.map((c) => c.name).join(',')}`);
    }
    if (errors.length) fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
    console.log(errors.length ? `[shots-elite] ${errors.length} lỗi console, xem errors.txt` : '[shots-elite] không có lỗi console');
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
