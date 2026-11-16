// pnpm shots:e1e: ảnh vạch báo của nguyên tắc quái mở rộng (E1-E): line, charge, leap, burrow (+ quạt trồi), reflect, reveal, summon.
//   tsx src/shots-e1e.ts --out <thư mục tuyệt đối> [--only line,charge,...] [--renderer webgpu|webgl2]
// Quái mới chưa đặt vào bản đồ (E2-B), nên công cụ cần dữ liệu thử: đặt E1E_PATCH=1 để tạm gán bộ chiêu cho vài quái thường trong
// packages/content/data/monsters.json (ghi lại bản gốc khi xong, kể cả khi lỗi); không có cờ này thì dùng dữ liệu hiện có.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175); luôn ?mute=1 và --mute-audio; đăng nhập thử, /gm spawn.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep, ROOT } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e1e'));
const ONLY = opt('--only', 'line,charge,leap,burrow,reflect,reveal,summon').split(',');
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e1e', command: 'pnpm shots:e1e' });
type G = { __game?: Record<string, any> };

/** Quái thường dùng làm giá đỡ → bộ chiêu thử. */
const PATCH: Record<string, { mon: string; ai: Record<string, unknown> }> = {
  line: { mon: 'mon_thiet_boi_tru', ai: { line: { cd: 6, range: 12, r: 12, w: 2, delay: 1.6, mul: 1, kind: 'fire' } } },
  charge: { mon: 'mon_soi_xam', ai: { charge: { cd: 8, min: 3, range: 18, r: 14, w: 2.4, delay: 1.6, mul: 1, speed: 20, kind: 'fire' } } },
  leap: { mon: 'mon_thach_vien', ai: { leap: { cd: 8, min: 3, range: 16, r: 4, delay: 1.6, mul: 1, kind: 'fire' } } },
  burrow: { mon: 'mon_yeu_lang', ai: { burrow: { cd: 14, range: 20, hide: 2.2, n: 3, r: 3, spread: 5, mul: 1, cone: { r: 14, w: 30, delay: 1.5, mul: 1 }, kind: 'fire' } } },
  reflect: { mon: 'mon_hoa_van_ho', ai: { reflect: { cd: 12, warn: 1.5, dur: 6, ratio: 0.5, cap: 0.1, take: 0.25 } } },
  reveal: { mon: 'mon_u_minh_lang', ai: { reveal: { cd: 12, dur: 6, mul: 1.5, guard: 0.7 } } },
  summon: { mon: 'mon_kiem_linh', ai: { summon: { cd: 12, mon: 'mon_soi_xam', n: 2, max: 3, r: 5, delay: 1.8 } } },
};
const FLAG: Record<string, number> = { reflect: 8, reveal: 16 };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(ROOT, 'packages/content/data/monsters.json');
  const orig = fs.readFileSync(file, 'utf8');
  const restore = () => fs.writeFileSync(file, orig);
  if (process.env.E1E_PATCH) {
    const data = JSON.parse(orig) as { id: string; ai?: Record<string, unknown> }[];
    for (const k of ONLY) {
      const p = PATCH[k];
      const m = data.find((x) => x.id === p?.mon);
      if (m) m.ai = p.ai;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    process.on('exit', restore);
  }
  const errors: string[] = [];
  try {
    await dev.start();
    const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','high');" });
    const page = await ctx.newPage();
    const name = `E1E${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&quiet=1${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      },
      undefined,
      { timeout: 120_000, polling: 250 },
    );
    for (let i = 0; i < 60; i++) {
      const hidden = await page.evaluate(() => {
        const h = document.querySelector('.hud');
        return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
      });
      if (!hidden) break;
      await page.keyboard.press('Space');
      await sleep(500);
    }
    await page.addStyleTag({ content: '.chat{visibility:hidden !important}' });
    await gm(page, 'level 12', 1500);
    await gm(page, 'god on', 1200);
    await gm(page, 'tp ' + opt('--at', '2048 2088'), 1500);
    const shot = async (label: string) => fs.writeFileSync(path.join(OUT, `${label}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82 }));
    const cam = (pitch: number, dist: number) =>
      page.evaluate(
        ([p, d]) => {
          const g = (window as unknown as G).__game!;
          g.camPitch = p;
          g.camDist = d;
          g.camDistCur = d;
        },
        [pitch, dist] as const,
      );
    const hazards = () => page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).length);
    const flags = () =>
      page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        let mf = 0;
        for (const m of g.view.monsters.values()) if (m.t && m.st !== 4) mf |= m.mf;
        return mf;
      });
    for (const sc of ONLY) {
      const p = PATCH[sc];
      if (!p) continue;
      await gm(page, 'killall', 800);
      await page.evaluate(() => ((window as unknown as G).__game!.hazardLog = []));
      await cam(0.75, 15);
      await gm(page, `spawn ${p.mon} 1`, 600);
      const until = Date.now() + 40_000;
      let seen = false;
      while (Date.now() < until) {
        const hit = FLAG[sc] ? ((await flags()) & FLAG[sc]) !== 0 : (await hazards()) > 0;
        if (hit) {
          seen = true;
          break;
        }
        await sleep(60);
      }
      if (!seen) {
        console.log(`[shots-e1e] ${sc}: không thấy chiêu trong 40 s`);
        continue;
      }
      const t0 = Date.now();
      for (let i = 0; i < (sc === 'burrow' ? 12 : 6); i++) {
        await shot(`${sc}-${i}-t${Date.now() - t0}`);
        await sleep(250);
      }
      console.log(`[shots-e1e] ${sc}: xong`);
    }
    await browser.close();
  } finally {
    dev.stop();
    if (process.env.E1E_PATCH) restore();
  }
  console.log(errors.length ? '[shots-e1e] lỗi console:\n' + errors.slice(0, 10).join('\n') : '[shots-e1e] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
