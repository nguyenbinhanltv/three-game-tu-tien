// pnpm shots:k3: ảnh từng clip của thư viện chung anim_human_base (K-3) trên Thanh Phong (nam) và Lam Chi (nữ), qua trang xem.
//   tsx src/shots-k3.ts --out <thư mục> [--models nam,nu] [--clips a,b] [--mode sheets|slip|all] [--per 6]
// - sheets: mỗi clip một hàng ảnh chụp đều theo thời gian (góc chéo), ghép thành tờ có nhãn.
// - slip: clip đi lại (walk, strafe, back, run) chạy với model tịnh tiến đúng tốc độ nền đã đo; đĩa đỏ đánh dấu chỗ chân trụ
//   chạm đất lần đầu, chân còn đứng đúng đĩa suốt pha trụ. Ghi cả số đo độ trượt (m) ra slip.json.
// Cần client Vite đang chạy ở CLIENT_PORT (mặc định 5195); luôn ?mute=1 và --mute-audio, GPU thật (không SwiftShader).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-k3'));
const MODELS = opt('--models', 'nam,nu').split(',');
const ONLY = opt('--clips', '').split(',').filter(Boolean);
const MODE = opt('--mode', 'all');
const PER = Number(opt('--per', '6'));
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5195);
const ASSET: Record<string, string> = { nam: 'chr_kiem_tu_nam', nu: 'chr_kiem_tu_nu' };
type V = {
  clips: { name: string; duration: number }[];
  playClip(i: number): void;
  seek(t: number): void;
  frame(): void;
  setView(v: string): void;
  setHuman(on: boolean): void;
  travel: number;
  travelDir: { set(x: number, y: number, z: number): void };
  footsWorld(): number[][];
  markGround(x: number, z: number, c?: number): void;
  clearMarks(): void;
  clipName: string;
};
type G = { __viewer?: V };
fs.mkdirSync(OUT, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const clipsJson = JSON.parse(fs.readFileSync(path.resolve(here, '../../../docs/k3-anim/clips.json'), 'utf8')) as Record<string, { refSpeed?: number; refDir?: number; seconds: number }>;

async function open(ctx: BrowserContext, model: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 200)));
  await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=${ASSET[model]}&lib=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => (((window as unknown as { __viewer?: { clips: unknown[] } }).__viewer?.clips.length) ?? 0) > 3, undefined, { timeout: 90_000, polling: 250 });
  await page.evaluate(() => (window as unknown as G).__viewer!.setHuman(false));
  return page;
}

async function snap(page: Page, clip: number, t: number, view: string): Promise<string> {
  await page.evaluate(
    ([i, tt, vw]) => {
      const v = (window as unknown as G).__viewer!;
      v.playClip(i as number);
      v.seek(tt as number);
      v.setView(vw as string);
      v.frame();
      v.frame();
    },
    [clip, t, view],
  );
  await sleep(220);
  return 'data:image/png;base64,' + (await page.locator('.viewer-host').screenshot()).toString('base64');
}

async function sheet(ctx: BrowserContext, file: string, title: string, rows: { label: string; url: string }[][]): Promise<void> {
  const p = await ctx.newPage();
  const cols = Math.max(...rows.map((r) => r.length));
  const cell = Math.min(230, Math.floor(1700 / cols));
  const html = `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui"><div style="padding:8px 12px;font-size:15px;color:#d8b36a">${title}</div>${rows
    .map((r) => `<div style="display:flex">${r.map((s) => `<figure style="margin:2px;width:${cell}px"><img src="${s.url}" style="display:block;width:${cell}px"><figcaption style="padding:2px 4px">${s.label}</figcaption></figure>`).join('')}</div>`)
    .join('')}</body>`;
  await p.setViewportSize({ width: cols * (cell + 4) + 8, height: 800 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 82 });
  await p.close();
  console.log('[shots-k3]', path.basename(file));
}

async function sheets(ctx: BrowserContext, model: string): Promise<void> {
  const page = await open(ctx, model);
  const clips = await page.evaluate(() => (window as unknown as G).__viewer!.clips.map((c) => ({ name: c.name, duration: c.duration })));
  const list = clips.map((c, i) => ({ ...c, i })).filter((c) => !ONLY.length || ONLY.includes(c.name));
  const per = 6;
  for (let g = 0; g * per < list.length; g++) {
    const rows: { label: string; url: string }[][] = [];
    for (const c of list.slice(g * per, g * per + per)) {
      const row: { label: string; url: string }[] = [];
      for (let k = 0; k < PER; k++) {
        const t = (c.duration * k) / PER;
        row.push({ label: `${c.name} · ${t.toFixed(2)} s / ${c.duration.toFixed(2)}`, url: await snap(page, c.i, t, 'iso') });
      }
      rows.push(row);
    }
    await sheet(ctx, path.join(OUT, `${model}-clips-${String(g + 1).padStart(2, '0')}.jpg`), `anim_human_base · ${ASSET[model]} · ${list[g * per].name}…`, rows);
  }
  await page.close();
}

/** Chân trụ có thật sự đứng yên trên đất: đo vị trí ngang của bàn chân trong từng pha trụ khi model chạy đúng tốc độ nền. */
async function slip(ctx: BrowserContext, model: string, out: Record<string, unknown>): Promise<void> {
  const page = await open(ctx, model);
  const clips = await page.evaluate(() => (window as unknown as G).__viewer!.clips.map((c) => c.name));
  for (const name of ['walk', 'run', 'back', 'strafe_l', 'strafe_r']) {
    const i = clips.indexOf(name);
    if (i < 0 || (ONLY.length && !ONLY.includes(name))) continue;
    const c = clipsJson[name];
    // Hướng thân đi (độ, hệ Blender: 0 = trái +X, -90 = tới trước) → hệ glTF: x = cos, z = -sin.
    const dir = [Math.cos(((c.refDir ?? -90) * Math.PI) / 180), 0, -Math.sin(((c.refDir ?? -90) * Math.PI) / 180)];
    const gs = c.refSpeed ?? 1;
    const dur = c.seconds;
    const trace = (speed: number) =>
      page.evaluate(
        ([idx, sp, d, seconds]) => {
          const v = (window as unknown as G).__viewer!;
          v.travel = sp as number;
          const dd = d as number[];
          v.travelDir.set(dd[0], dd[1], dd[2]);
          v.playClip(idx as number);
          const N = 90;
          const pts: number[][][] = [];
          for (let f = 0; f <= N; f++) {
            v.seek(((seconds as number) * f) / N);
            pts.push(v.footsWorld());
          }
          return pts;
        },
        [i, speed, dir, dur] as const,
      );
    // Trượt = trong mỗi đoạn liên tiếp chân thấp (trong 2,5 cm trên điểm thấp nhất của clip, xương cổ chân) dịch ngang so với điểm đầu đoạn.
    const measure = (res: number[][][]) => {
      const floor = Math.min(...res.flatMap((fr) => fr.map((p) => p[1])));
      const planted = floor + 0.025;
      let worst = 0;
      let segs = 0;
      const marks: [number, number][] = [];
      for (let foot = 0; foot < 2; foot++) {
        let start: number[] | null = null;
        for (const fr of res) {
          const p = fr[foot];
          if (p[1] < planted) {
            if (!start) marks.push([p[0], p[2]]);
            start ??= p;
            worst = Math.max(worst, Math.hypot(p[0] - start[0], p[2] - start[2]));
          } else if (start) {
            start = null;
            segs++;
          }
        }
      }
      return { worst, segs, marks, floor };
    };
    // Dò tốc độ nền khớp nhất (trượt nhỏ nhất) quanh số đo từ Blender: đó là tốc độ nên đặt cho clip khi chạy ở 1×.
    let best = { speed: gs, ...measure(await trace(gs)) };
    for (let sp = gs * 0.5; sp <= gs * 2; sp += gs * 0.02) {
      const r = measure(await trace(sp));
      if (r.worst < best.worst) best = { speed: sp, ...r };
    }
    const res = await trace(best.speed);
    const { worst, segs, marks, floor } = measure(res);
    out[`${model}:${name}`] = { refSpeed: gs, bestSpeed: Number(best.speed.toFixed(3)), plantedSegments: segs, worstSlipM: Number(worst.toFixed(3)), ankleFloorM: Number(floor.toFixed(3)) };
    await page.evaluate(() => (window as unknown as G).__viewer!.clearMarks());
    await page.evaluate((m) => m.forEach(([x, z]) => (window as unknown as G).__viewer!.markGround(x, z)), marks);
    const row: { label: string; url: string }[] = [];
    for (let k = 0; k < 6; k++) row.push({ label: `${name} · ${((dur * (k + 0.5)) / 6).toFixed(2)} s`, url: await snap(page, i, (dur * (k + 0.5)) / 6, 'side') });
    await sheet(ctx, path.join(OUT, `${model}-slip-${name}.jpg`), `${name} · ${ASSET[model]} · tịnh tiến ${best.speed.toFixed(2)} m/s · đĩa đỏ = chỗ chân trụ chạm đất, trượt tối đa ${worst.toFixed(3)} m`, [row]);
    await page.evaluate(() => ((window as unknown as G).__viewer!.travel = 0));
  }
  await page.close();
}

const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const slipOut: Record<string, unknown> = {};
for (const m of MODELS) {
  if (MODE !== 'slip') await sheets(ctx, m);
  if (MODE !== 'sheets') await slip(ctx, m, slipOut);
}
if (Object.keys(slipOut).length) fs.writeFileSync(path.join(OUT, 'slip.json'), JSON.stringify(slipOut, null, 1));
await browser.close();
