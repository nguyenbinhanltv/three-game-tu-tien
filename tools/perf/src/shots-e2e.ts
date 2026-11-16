// pnpm shots:e2e (E2-E): ảnh thần thức (V), thanh chiêu có ô 9 thần thông + Ngưng Đan Lô + nút thần thức, bản mệnh pháp bảo vận chiêu.
//   tsx src/shots-e2e.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2] [--method lac_kiem_quyet|bat_dong_kim_than|thanh_moc_dan_kinh]
// Vào bằng tài khoản thử (?god=1), `/gm level 20`, `/gm tp dm_tram` (Đoạn Mạch), giữ phím V thật 2,5 s, chụp từng mốc (JPG ≤ 1600 px).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2695/5195); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e2e'));
const RENDERER = opt('--renderer', 'webgpu');
const METHOD = opt('--method', 'lac_kiem_quyet');
const PORT = Number(process.env.PORT ?? 2695);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5195);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2e', command: 'pnpm shots:e2e' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1200) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const shot = async (page: Page, file: string, clip?: { x: number; y: number; width: number; height: number }) => {
  await page.screenshot({ path: path.join(OUT, file + '.jpg'), type: 'jpeg', quality: 85, clip });
  console.log(`[shots-e2e] ${file}`);
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

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const log: Record<string, unknown> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    const name = 'E2E' + (Date.now() % 100000);
    await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&god=1&realm=nk15${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    await gm(page, 'method ' + METHOD + ' 3');
    // Trước Kết Đan: không có ô 9, không có nút thần thức, không có Lô.
    await gm(page, 'level 19');
    await sleep(500);
    await shot(page, '01-thanh-chieu-truoc-ket-dan', { x: 400, y: 740, width: 800, height: 150 });
    await gm(page, 'level 20', 1800);
    await gm(page, 'god on');
    await gm(page, 'tp dm_tram', 3500);
    await clearIntro(page);
    await sleep(5000); // thẻ Chương 2
    // Chỗ có Liệt Cốt Báo tinh anh (1283,1308), Mạch Tinh Trụ (1279,1199), điểm hái và quái trong 60 m, nhưng ngoài tầm đánh hơi của tinh anh.
    await gm(page, 'tp 1283 1250', 3000);
    await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      g.camYaw = 0;
      g.camPitch = 0.35;
      g.camDist = 9;
      g.camDistCur = 9;
    });
    await sleep(1500);
    log.me = await page.evaluate(() => ({ lv: (window as unknown as G).__game!.me?.()?.lv, room: (window as unknown as G).__game!.info?.().room }));
    await shot(page, '02-thanh-chieu-ket-dan-o9-lo-than-thuc', { x: 400, y: 740, width: 800, height: 150 });
    // Mô tả (tooltip) ô 9, Ngưng Đan Lô, thần thức.
    for (const [sel, file] of [
      ['.skill[aria-label*="(0)"]', '03-tooltip-o9-than-thong'],
      ['.skill[aria-label*="(T)"]', '04-tooltip-ngung-dan-lo'],
      ['.skill[aria-label*="(V)"]', '05-tooltip-than-thuc'],
    ] as const) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.hover();
        await sleep(700);
        await shot(page, file, { x: 300, y: 450, width: 1000, height: 440 });
      }
    }
    await page.mouse.move(800, 300);
    // Thần thức: giữ V thật.
    await page.keyboard.down('KeyV');
    await sleep(1300);
    await shot(page, '06-than-thuc-dang-van');
    await sleep(1400);
    await shot(page, '07-than-thuc-song-quet');
    await page.keyboard.up('KeyV');
    await sleep(900);
    await shot(page, '08-than-thuc-cot-sang-minimap');
    // Quay camera về phía tinh anh/thủ lĩnh lộ ra (nếu có) để thấy cột sáng của nó.
    const foe = await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      const h = (g.spiritLog.at(-1)?.hits ?? []).find((x: { k: string }) => x.k === 'elite' || x.k === 'boss');
      if (!h) return false;
      g.camYaw = Math.atan2(h.x - g.cur.x, h.z - g.cur.z);
      g.camPitch = 0.2;
      g.camDist = 12;
      g.camDistCur = 12;
      return true;
    });
    await sleep(900);
    if (foe) await shot(page, '08b-than-thuc-cot-sang-tinh-anh');
    log.beams = await page.evaluate(() => (window as unknown as G).__game!.mapVis?.spirit?.beamCount);
    const rc = await page.evaluate(() => document.querySelector('.minimap')?.getBoundingClientRect().toJSON());
    if (rc) await page.screenshot({ path: path.join(OUT, '09-minimap-co-than-thuc.jpg'), type: 'jpeg', quality: 90, clip: { x: Math.max(0, rc.x - 10), y: Math.max(0, rc.y - 10), width: Math.min(rc.width + 20, 400), height: Math.min(rc.height + 20, 400) } });
    log.scan = await page.evaluate(() => (window as unknown as G).__game!.spiritLog);
    // Hồi chiêu hiển thị ngay sau khi quét.
    await shot(page, '10-than-thuc-hoi-chieu', { x: 400, y: 740, width: 800, height: 150 });
    // Ngưng Đan Lô: bấm T (khí huyết đang đầy thì hồi 0 nhưng vẫn ra hiệu ứng).
    await sleep(6500);
    await page.keyboard.press('KeyT');
    await sleep(350);
    await shot(page, '11-ngung-dan-lo-van-chieu-1');
    await sleep(500);
    await shot(page, '12-ngung-dan-lo-van-chieu-2');
    await sleep(1800);
    await shot(page, '13-ngung-dan-lo-treo-ben-hong');
    // Ô 9 thần thông: bấm phím 0.
    await gm(page, 'cd');
    await page.keyboard.press('Digit0');
    await sleep(700);
    await shot(page, '14-o9-than-thong-phim-0');
    await page.close();
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'e2e-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e2e] lỗi console:\n' + [...new Set(errors)].join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
