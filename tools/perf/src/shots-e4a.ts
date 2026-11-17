// pnpm shots:e4a --out <thư mục tuyệt đối>: ảnh Thiên Khuyết Cổ Thành (E4-A). Vào Vân Lam bằng đăng nhập thử, `/gm tp tk_tram` (vé liên level),
// chụp trạm, Đại Lộ Đèn Trời, từng vùng, điểm đáng chú ý, toàn cảnh, bản đồ lớn. Tắt tiếng.
//   tsx src/shots-e4a.ts --out <thư mục> [--renderer webgpu|webgl2] [--preset low|medium|high] [--size 1280x720] [--only a,b]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2699/5299) với DB tạm rồi tắt.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { terrainOf } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e4a'));
const RENDERER = opt('--renderer', 'webgpu');
const PRESET = opt('--preset', 'medium');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2699);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5299);

type G = { __game?: Record<string, any> };
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e4a', command: 'pnpm shots:e4a' });

const lv = LEVELS.thien_khuyet;
const tr = terrainOf('thien_khuyet');
const centroid = (poly: [number, number][]): [number, number] => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];

interface Shot {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  dist: number;
}
const shots: Shot[] = [
  { name: 'tram', x: 1024, z: 1040, yaw: 0, pitch: 0.3, dist: 20 },
  { name: 'dai-lo', x: 1024 + 4, z: 1024 - 130, yaw: 0, pitch: 0.22, dist: 14 },
  { name: 'dai-lo-xa', x: 1024 + 10, z: 1024 - 360, yaw: 0, pitch: 0.18, dist: 12 },
  { name: 'quang-truong', x: 1024 + 10, z: 1024 - 600, yaw: 0, pitch: 0.2, dist: 16 },
];
for (const z of lv.zones ?? []) {
  const [x, zz] = centroid(z.poly);
  shots.push({ name: `zone-${z.id}`, x, z: zz, yaw: 0, pitch: 0.3, dist: 16 });
}
for (const p of lv.pois ?? []) shots.push({ name: `poi-${p.id}`, x: p.x, z: p.z + 18, yaw: 0, pitch: 0.25, dist: 22 });

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(900);
}
const cam = (page: Page, c: { yaw: number; pitch: number; dist: number }) =>
  page.evaluate((v) => {
    const g = (window as unknown as G).__game!;
    g.camYaw = v.yaw;
    g.camPitch = v.pitch;
    g.camDist = v.dist;
  }, c);
async function gotoXZ(page: Page, x: number, z: number): Promise<void> {
  await gm(page, `tp ${Math.round(x)} ${Math.round(z)}`);
  await gm(page, 'heal');
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    const s = await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      return { x: g.renderPos.x, z: g.renderPos.z };
    });
    if (Math.hypot(s.x - x, s.z - z) < 3) break;
    await sleep(300);
  }
}
const want = (n: string) => !ONLY.length || ONLY.includes(n);

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(PRESET)});` });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 600)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=E4A_Shots${process.env.E4A_QUERY ?? ""}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await page.keyboard.press('Shift');
    await sleep(600);
    await gm(page, 'level 24');
    await gm(page, 'god on');
    await gm(page, 'tele all');
    await gm(page, 'tp tk_tram');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'thien_khuyet', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    log.backend = await page.evaluate(() => (window as unknown as G).__game?.rendererName ?? '?');
    console.log('[shots-e4a] đã vào thien_khuyet, renderer', log.backend);
    // E4A_HIDE=tên,tên: ẩn đối tượng theo tên trong cảnh (dò xem lớp nào gây lỗi hình), ví dụ cloud-falls,cloud-banks.
    if (process.env.E4A_HIDE) {
      await page.evaluate((names) => {
        const g = (window as unknown as G).__game!;
        (g.scene as { traverse: (f: (o: { name: string; visible: boolean }) => void) => void }).traverse((o) => {
          if (names.includes(o.name)) o.visible = false;
        });
      }, process.env.E4A_HIDE.split(','));
    }
    const snap = async (name: string) => {
      await sleep(Number(process.env.SHOT_SETTLE ?? 2500));
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      // E3-I: draw call/tam giác/geometry/texture của khung vừa vẽ + thời gian khung (ms) lấy trung bình 30 khung, để so trước/sau khi đổi mỹ thuật.
      const perf = await page.evaluate(async () => {
        const g = (window as unknown as G).__game!;
        const t0 = performance.now();
        const f0 = g.frames as number;
        await new Promise((r) => setTimeout(r, 1500));
        const dt = (performance.now() - t0) / Math.max(1, (g.frames as number) - f0);
        const i = g.info();
        return { drawCalls: i.drawCalls, triangles: i.triangles, geometries: i.geometries, textures: i.textures, frameMs: Math.round(dt * 100) / 100 };
      });
      (log.perf ??= {} as Record<string, unknown>);
      (log.perf as Record<string, unknown>)[name] = perf;
      console.log(`[shots-e4a] ${name} ${JSON.stringify(perf)}`);
    };

    for (const s of shots) {
      if (!want(s.name)) continue;
      await gotoXZ(page, s.x, s.z);
      await cam(page, s);
      await snap(s.name);
    }

    // Toàn cảnh từ trên cao: camera xa, nhìn chếch xuống trạm và đại lộ.
    if (want('overview')) {
      await gotoXZ(page, 1024, 1040);
      await cam(page, { yaw: 0.15, pitch: 0.75, dist: 480 });
      await snap('overview');
    }
    // Cùng cảnh trạm ban ngày để kiểm tra đọc được thân nhân vật (mặc định bản đồ này là đêm).
    if (want('tram-ngay')) {
      await gotoXZ(page, 1024, 1040);
      await cam(page, { yaw: 0.5, pitch: 0.3, dist: 12 });
      await snap('tram-can');
    }

    // Bản đồ lớn (phím M) ở hub.
    if (want('worldmap')) {
      await gm(page, 'tp tk_tram');
      await sleep(2500);
      await page.keyboard.press('KeyM');
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, 'worldmap.png') });
      await page.keyboard.press('Escape');
      await sleep(500);
    }
    fs.writeFileSync(path.join(OUT, 'shots-e4a.json'), JSON.stringify(log, null, 2));
    if (errors.length) console.warn(`[shots-e4a] ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
    await ctx.close();
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[shots-e4a] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
