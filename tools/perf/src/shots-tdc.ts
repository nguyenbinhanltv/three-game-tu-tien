// pnpm --filter @dtl/perf shots:tdc: ảnh và số đo bảng nhân vật TD-C (3 tab, xem trước 3D, tooltip so sánh, cảnh báo túi, B+C cạnh nhau).
//   tsx src/shots-tdc.ts --out <thư mục> [--renderer webgpu|webgl2] [--size 1280x720] [--perf]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio), một tài khoản thử, dựng cảnh bằng lệnh GM.
// `--perf` chỉ đo: CPU khung, draw call, tam giác, texture/geometry khi bảng đóng / Tổng quan mở / B+C mở / đóng lại (kiểm giải phóng).
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-tdc'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PERF = args.includes('--perf');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-tdc', command: 'pnpm --filter @dtl/perf shots:tdc' });
type G = { __game?: Record<string, any>; __rec?: { on: boolean; f: [number, number, number][] } };

const gm = async (page: Page, cmd: string, wait = 1000) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function clearIntro(page: Page): Promise<void> {
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    const hidden = await page.evaluate(() => {
      const h = document.querySelector('.hud');
      return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
    });
    if (!hidden) return;
    await page.keyboard.press('Space');
    await sleep(500);
  }
}

/** Bọc `frame()` để ghi CPU mỗi khung (đã gồm cả xem trước nhân vật) và draw call/tam giác của khung. */
function recInit(): void {
  const w = window as unknown as G;
  const rec = { on: false, f: [] as [number, number, number][] };
  w.__rec = rec;
  let game: Record<string, any> | undefined;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set: (g) => {
      game = g;
      queueMicrotask(() => {
        const frame = g.frame;
        g.frame = function recFrame(this: unknown) {
          const t0 = performance.now();
          frame.call(g);
          const dt = performance.now() - t0;
          const r = g.renderer;
          if (rec.on && r) rec.f.push([dt, r.info.render.drawCalls ?? r.info.render.calls, r.info.render.triangles]);
        };
      });
    },
  });
}

const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function sample(page: Page, label: string, ms = 5000): Promise<Record<string, unknown>> {
  await page.evaluate(() => {
    const w = window as unknown as G;
    w.__rec!.f.length = 0;
    w.__rec!.on = true;
  });
  await sleep(ms);
  const { f, mem, backend, pv } = await page.evaluate(() => {
    const w = window as unknown as G;
    w.__rec!.on = false;
    const r = w.__game!.renderer;
    return { f: w.__rec!.f.slice(), mem: { geometries: r.info.memory.geometries, textures: r.info.memory.textures }, backend: r.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2', pv: w.__game!.charPreview?.active ? w.__game!.charPreview.snapshot() : null };
  });
  const cpu = f.map((x) => x[0]);
  const row = {
    label,
    backend,
    frames: f.length,
    cpuP50: r2(q(cpu, 0.5)),
    cpuP95: r2(q(cpu, 0.95)),
    drawCalls: q(f.map((x) => x[1]), 0.5),
    triangles: q(f.map((x) => x[2]), 0.5),
    geometries: mem.geometries,
    textures: mem.textures,
    preview: pv,
  };
  console.log('[shots-tdc]', JSON.stringify(row));
  return row;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const perf: Record<string, unknown>[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','medium');" });
    if (PERF) {
      await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
      await ctx.addInitScript(recInit);
    }
    const page = await ctx.newPage();
    const name = `Tdc${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('[preview]')) && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&god=1${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    const shot = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, `${VW}x${VH}-${file}`), type: 'jpeg', quality: 88 });
      console.log(`[shots-tdc] ${VW}x${VH}-${file}`);
    };
    await gm(page, 'level 19', 1500);
    await gm(page, 'tp 2048 2088', 1800);
    await gm(page, 'gold 20000', 1000);
    await gm(page, 'set set_lac_kiem 2', 2200);
    await gm(page, 'plus 7 weapon', 900);
    await gm(page, 'roll itm_thiet_kiem 3 20', 900);
    await gm(page, 'give itm_ket_dan_dich 1', 900);
    await page.mouse.move(VW / 2, VH * 0.3);

    if (PERF) {
      perf.push(await sample(page, 'bảng đóng'));
      await page.keyboard.press('c');
      await sleep(2500);
      perf.push(await sample(page, 'Nhân vật · Tổng quan (xem trước 3D)'));
      await page.keyboard.press('b');
      await sleep(1500);
      perf.push(await sample(page, 'Nhân vật + Túi'));
      await page.keyboard.press('b');
      await page.keyboard.press('c');
      await sleep(2500);
      perf.push(await sample(page, 'đóng lại'));
      fs.writeFileSync(path.join(OUT, `perf-${RENDERER}-${VW}x${VH}.json`), JSON.stringify(perf, null, 2));
      if (errors.length) console.log('[shots-tdc] lỗi console:', [...new Set(errors)]);
      return;
    }

    // Đổ đầy túi bằng nhiều loại khác nhau để thấy cảnh báo "Túi còn N ô".
    const fill = ['gem_kim_1', 'gem_moc_1', 'gem_thuy_1', 'gem_hoa_1', 'gem_tho_1', 'gem_kim_2', 'gem_moc_2', 'gem_thuy_2', 'gem_hoa_2', 'gem_tho_2', 'itm_nanh_soi', 'itm_linh_thao', 'itm_yeu_dan', 'itm_thiet_tinh', 'itm_tay_luyen_thach', 'itm_hoi_xuan_dan', 'itm_hoi_khi_dan', 'itm_mach_tinh_phien', 'itm_hoang_sa_thao'];
    for (const id of fill) await gm(page, `give ${id} 3`, 650);
    await sleep(800);

    await page.keyboard.press('c');
    await sleep(2500);
    await shot('char-tong-quan.jpg');
    await page.keyboard.press('b');
    await sleep(1200);
    await page.mouse.move(5, 5);
    await shot('char-va-tui.jpg');
    // Kéo xoay xem trước.
    const cv = page.locator('[data-testid="char-preview"]');
    if (await cv.count()) {
      const b = (await cv.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 90, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
      await sleep(600);
      await shot('xem-truoc-xoay.jpg');
    }
    // Tooltip so sánh: đưa túi lên trên rồi rê vào thanh kiếm cực hiếm.
    await page.getByRole('heading', { name: /Túi/ }).click({ timeout: 5000 }).catch(() => {});
    await sleep(300);
    await page.getByRole('button', { name: /Thiết Kiếm.*phẩm/ }).last().hover({ timeout: 5000 }).catch(() => {});
    await sleep(700);
    await shot('tooltip-so-sanh.jpg');
    await page.mouse.move(5, 5);
    await page.keyboard.press('b');
    await sleep(400);
    // Khối độ kiếp: cuộn tới cuối tab Tổng quan.
    await page.evaluate(() => document.querySelectorAll('.k-window *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 30 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; }));
    await sleep(500);
    await shot('char-do-kiep.jpg');
    await page.getByRole('tab', { name: /Thuộc tính/ }).click();
    await sleep(500);
    await shot('char-thuoc-tinh.jpg');
    await page.locator('[data-stat="atk"]').hover();
    await sleep(700);
    await shot('char-thuoc-tinh-tooltip.jpg');
    await page.mouse.move(5, 5);
    await page.getByRole('tab', { name: /Tu luyện/ }).click();
    await sleep(500);
    await shot('char-bo-tu-luyen.jpg');
    await page.keyboard.press('c');
    await sleep(500);
    await shot('hud-canh-bao-tui.jpg');
    if (errors.length) console.log('[shots-tdc] lỗi console:', [...new Set(errors)]);
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
