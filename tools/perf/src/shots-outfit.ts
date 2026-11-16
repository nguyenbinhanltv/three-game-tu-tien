// pnpm shots:outfit: chụp áo bộ trang bị mặc thật (retarget, docs/sets-retarget): đứng (trước/sau/nghiêng), chạy, ngự kiếm, chém, đả tọa; kiểm xuyên lưới.
//   tsx src/shots-outfit.ts --out <thư mục> [--renderer webgpu|webgl2] [--sets set_liet_mach,...] [--genders m,f] [--only still|motion] [--query outfit=0]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), vào game tắt tiếng (?mute=1, --mute-audio) bằng tài khoản thử, mặc bộ bằng lệnh GM `set`.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-sets'));
const RENDERER = opt('--renderer', 'webgpu');
const SETS = opt('--sets', 'set_liet_mach').split(',');
const GENDERS = opt('--genders', 'm,f').split(',');
const ONLY = opt('--only', 'all');
const QUERY = opt('--query', '');
const DIST = Number(opt('--dist', '3.4'));
const [VW, VH] = opt('--size', '1100x900').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-outfit', command: 'pnpm shots:outfit' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const cam = (page: Page, yaw: number, pitch: number, dist: number) =>
  page.evaluate(([y, p, d]) => {
    const g = (window as unknown as G).__game!;
    g.camYaw = y;
    g.camPitch = p;
    g.camDist = d;
    g.camDistCur = d;
  }, [yaw, pitch, dist] as const);

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
  try {
    for (const g of GENDERS) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'${opt('--dye', 'attire_sect')}'}));` });
      const page = await ctx.newPage();
      const name = `Out${g}${String(Date.now() % 10000)}`;
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${QUERY ? '&' + QUERY : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 12', 1600);
      await gm(page, 'god on', 1600);
      await gm(page, 'tp 2048 2088', 1600);
      const shot = async (file: string) => {
        // Nhân vật luôn ở giữa màn hình (camera bám theo): cắt sát để thấy rõ phụ kiện.
        await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 88, clip: { x: VW / 2 - 280, y: VH * 0.22, width: 560, height: 560 } });
        console.log(`[shots-outfit] ${file}`);
      };
      for (const set of SETS) {
        await gm(page, 'set off', 1700);
        await cam(page, 0, 0.12, DIST);
        await sleep(800);
        const base = await page.evaluate(() => (window as unknown as G).__game!.info());
        await gm(page, `set ${set}`, 2200);
        const worn = await page.evaluate(() => (window as unknown as G).__game!.me?.()?.sa ?? '');
        await cam(page, 0, 0.12, DIST);
        await sleep(800);
        const dressed = await page.evaluate(() => (window as unknown as G).__game!.info());
        console.log(`[shots-outfit] ${set} ${g}: mã phụ kiện '${worn}'; draw ${base.drawCalls}→${dressed.drawCalls}, tam giác ${base.triangles}→${dressed.triangles}`);
        if (opt('--panel', '') === '1') {
          // Bảng nhân vật (phím C): xem trước 3D phải mặc đúng áo của bộ.
          await page.addStyleTag({ content: '.hud{visibility:visible !important}' });
          await page.keyboard.press('KeyC');
          await sleep(3500);
          await page.screenshot({ path: path.join(OUT, `${set}-${g}-bang.jpg`), type: 'jpeg', quality: 85 });
          console.log(`[shots-outfit] ${set}-${g}-bang.jpg`);
          await page.keyboard.press('KeyC');
          await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
          await sleep(500);
        }
        if (ONLY !== 'motion') {
          // 0 = nhìn từ sau lưng; π = nhìn từ phía trước. Mặc nhân vật đứng yên (idle).
          for (const [view, yaw] of [['sau', Math.PI], ['truoc', 0], ['nghieng', Math.PI / 2]] as const) {
            await cam(page, yaw, 0.12, DIST);
            await sleep(1100);
            await shot(`${set}-${g}-${view}.jpg`);
          }
        }
        if (ONLY !== 'still') {
          // Chạy ngang màn hình: thấy nghiêng khi dải lụa lắc, tay vung.
          await cam(page, 0, 0.14, DIST + 1);
          await page.keyboard.down('KeyD');
          await sleep(1500);
          await shot(`${set}-${g}-chay.jpg`);
          await page.keyboard.up('KeyD');
          await sleep(300);
          // Ngự kiếm (tư thế cúi, dải lụa bị gió thổi) rồi đả tọa: hai tư thế khó nhất cho vai giáp và đai.
          await page.evaluate(() => (window as unknown as G).__game!.toggleFly());
          await sleep(900);
          await cam(page, 0.6, 0.1, DIST + 0.5);
          await page.keyboard.down('KeyW');
          await sleep(1300);
          await shot(`${set}-${g}-bay.jpg`);
          await page.keyboard.up('KeyW');
          await page.evaluate(() => (window as unknown as G).__game!.toggleFly());
          await sleep(1500);
          // Đả tọa (Z): ngồi xếp chân, tay đặt gối.
          await cam(page, 0.5, 0.12, DIST);
          await page.keyboard.press('KeyZ');
          await sleep(2200);
          await shot(`${set}-${g}-datoa.jpg`);
          await page.keyboard.press('KeyW');
          await sleep(700);
          // Chém: vài quái sói quanh, ra chiêu 1, chụp giữa động tác.
          await gm(page, 'spawn mon_soi_xam 1', 1700);
          await cam(page, Math.PI * 0.8, 0.14, DIST);
          await page.evaluate(() => (window as unknown as G).__game!.useSkill(1));
          await sleep(260);
          await shot(`${set}-${g}-chem.jpg`);
          await sleep(900);
          await gm(page, 'killall', 1700);
        }
      }
      await ctx.close();
    }
    if (errors.length) console.log('[shots-outfit] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
