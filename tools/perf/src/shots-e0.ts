// pnpm shots:e0: ảnh duyệt 12 quái thường E-0 (docs/e0-mon/README.md) bằng trang xem asset `?show=<id>` trên GPU thật.
//   tsx src/shots-e0.ts --out <thư mục> [--only id,id] [--renderer webgpu|webgl2] [--size 1280x720]
// Mỗi quái: lưới 4 góc nhìn (trước/bên/sau/chéo, dáng idle) + dải khung từng clip (idle, run, attack, hit_light, death, guard, revive).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2614/5214), tắt tiếng (?mute=1, --mute-audio), tự tắt khi xong.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e0'));
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2614);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5214);

const IDS = [
  'mon_mach_thuong_ho_ve', 'mon_khai_mach_khoi_loi', 'mon_thach_giap_te', 'mon_ngo_cong_au',
  'mon_van_hac', 'mon_kinh_linh', 'mon_phu_dao_thach_quy', 'mon_bich_ngoc_kim_thien',
  'mon_thach_tuong_vo_si', 'mon_da_minh_loc', 'mon_cot_ve_kiem_thu', 'mon_co_thanh_chien_ma',
];
const CLIPS = ['idle', 'run', 'attack', 'hit_light', 'death', 'guard', 'revive'];
const FRACTIONS = [0, 0.25, 0.5, 0.75, 0.97];

type V = {
  clips: { name: string; duration: number }[];
  playClip(i: number): void;
  seek(t: number): void;
  setView(v: 'front' | 'side' | 'back' | 'iso'): void;
  setAutoRotate(on: boolean): void;
  setHuman(on: boolean): void;
  paused: boolean;
};
type W = { __viewer?: V };

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e0', command: 'pnpm shots:e0' });

async function shoot(page: Page, file: string): Promise<void> {
  await sleep(250);
  await page.locator('canvas').first().screenshot({ path: file });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const report: Record<string, unknown> = {};
  try {
    for (const id of IDS.filter((x) => !ONLY.length || ONLY.includes(x))) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${id} pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${id}: ${m.text().slice(0, 240)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=${id}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const v = (window as unknown as W).__viewer;
        return !!v && v.clips.length > 0;
      }, undefined, { timeout: 90_000, polling: 250 });
      await sleep(800);
      const clips = await page.evaluate(() => (window as unknown as W).__viewer!.clips.map((c) => ({ name: c.name, duration: c.duration })));
      report[id] = clips;
      const dir = path.join(OUT, id);
      fs.mkdirSync(dir, { recursive: true });
      // Lưới góc nhìn ở dáng idle, dừng khung 0.
      await page.evaluate(() => {
        const v = (window as unknown as W).__viewer!;
        v.setAutoRotate(false);
        v.playClip(Math.max(0, v.clips.findIndex((c) => c.name === 'idle')));
        v.seek(0);
      });
      for (const view of ['front', 'side', 'back', 'iso'] as const) {
        // Người mẫu (cỡ chuẩn ~1,75 m) chỉ ở góc trước/chéo để so cỡ; góc bên/sau bị nó che nên tắt.
        await page.evaluate(([vw, human]) => {
          const v = (window as unknown as W).__viewer!;
          v.setHuman(human as boolean);
          v.setView(vw as 'front');
        }, [view, view === 'front' || view === 'iso']);
        await shoot(page, path.join(dir, `view-${view}.png`));
      }
      // Từng clip: góc bên (đọc chuyển động), 5 khung.
      await page.evaluate(() => {
        const v = (window as unknown as W).__viewer!;
        v.setHuman(false);
        v.setView('side');
      });
      for (const c of clips) {
        if (!CLIPS.includes(c.name)) continue;
        const idx = clips.findIndex((x) => x.name === c.name);
        await page.evaluate((i) => (window as unknown as W).__viewer!.playClip(i), idx);
        await sleep(350);
        let k = 0;
        for (const f of FRACTIONS) {
          await page.evaluate(([t]) => (window as unknown as W).__viewer!.seek(t), [c.duration * f]);
          await shoot(page, path.join(dir, `clip-${c.name}-${k++}.png`));
        }
      }
      await ctx.close();
      console.log(`[shots-e0] ${id}: ${clips.map((c) => `${c.name}(${c.duration.toFixed(2)}s)`).join(' ')}`);
    }
  } finally {
    await browser.close();
    dev.stop();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ renderer: RENDERER, report, errors }, null, 2));
  if (errors.length) console.warn('[shots-e0] lỗi console:\n' + errors.slice(0, 20).join('\n'));
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
