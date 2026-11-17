// pnpm shots:chrv2: CHR-PROTO, ảnh nhân vật nền cũ (Tripo) và nền v2 (MakeHuman, `?chr=v2`) cùng góc: cận mặt, bán thân, toàn thân, chạy, chém, đả tọa.
//   tsx src/shots-chrv2.ts --out <thư mục> [--variant old|v2|both] [--genders m,f] [--sets none,set_liet_mach,set_kinh_quang] [--renderer webgpu|webgl2] [--only still]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio). Ra <out>/<variant>/<bộ>-<giới>-<góc>.jpg và stats.json.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-chrv2'));
const VARIANTS = opt('--variant', 'both') === 'both' ? ['old', 'v2'] : [opt('--variant', 'both')];
const GENDERS = opt('--genders', 'm,f').split(',');
const SETS = opt('--sets', 'none,set_liet_mach,set_kinh_quang').split(',');
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', 'all');
const [VW, VH] = opt('--size', '1100x900').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-chrv2', command: 'pnpm shots:chrv2' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const cam = (page: Page, yaw: number, pitch: number, dist: number) =>
  page.evaluate(
    ([y, p, d]) => {
      const g = (window as unknown as G).__game!;
      g.camYaw = y;
      g.camPitch = p;
      g.camDist = d;
      g.camDistCur = d;
    },
    [yaw, pitch, dist] as const,
  );

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

// Nhân vật luôn ở giữa màn hình (camera bám): cắt cùng một ô cho hai biến thể.
const CLIP = { x: VW / 2 - 300, y: VH * 0.5 - 330, width: 600, height: 660 };

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const stats: Record<string, unknown> = {};
  try {
    for (const variant of VARIANTS) {
      const dir = path.join(OUT, variant);
      fs.mkdirSync(dir, { recursive: true });
      for (const g of GENDERS) {
        const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
        await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
        const page = await ctx.newPage();
        const name = `Cv${variant[0]}${g}${String(Date.now() % 10000)}`;
        page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
        page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${name}: ${m.text().slice(0, 300)}`));
        await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${variant === 'v2' ? '&chr=v2' : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
        await page.waitForFunction(
          () => {
            const w = (window as unknown as G).__game;
            return !!w && w.frames > 30 && !!w.me?.();
          },
          undefined,
          { timeout: 120_000, polling: 250 },
        );
        await clearIntro(page);
        await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
        await gm(page, 'level 12', 1600);
        await gm(page, 'god on', 1600);
        await gm(page, `tp ${opt('--at', '2048 2088')}`, 1600);
        const shot = async (file: string) => {
          await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 90, clip: CLIP });
          console.log(`[shots-chrv2] ${variant}/${file}`);
        };
        for (const set of SETS) {
          await gm(page, 'set off', 1700);
          if (set !== 'none') await gm(page, `set ${set}`, 2400);
          await cam(page, 0, 0.12, 3.4);
          await sleep(900);
          const info = await page.evaluate(() => (window as unknown as G).__game!.info());
          stats[`${variant}/${set}-${g}`] = { drawCalls: info.drawCalls, triangles: info.triangles, backend: info.backend };
          console.log(`[shots-chrv2] ${variant} ${set} ${g}: draw ${info.drawCalls}, tam giác ${info.triangles}`);
          const tag = `${set}-${g}`;
          // Quay mặt nhân vật về camera: đi lùi về phía camera (yaw 0) một nhịp ngắn.
          await cam(page, 0, 0.12, 3.4);
          await page.keyboard.down('KeyS');
          await sleep(600);
          await page.keyboard.up('KeyS');
          await sleep(500);
          // yaw 0 = camera đứng trước mặt nhân vật; π = sau lưng (cùng quy ước shots-outfit: 'sau' = π).
          await cam(page, 0, 0.02, 0.9);
          await sleep(1200);
          await shot(`${tag}-matcan.jpg`);
          await cam(page, 0, 0.05, 1.9);
          await sleep(1000);
          await shot(`${tag}-banthan.jpg`);
          await cam(page, 0, 0.1, 3.6);
          await sleep(1000);
          await shot(`${tag}-toanthan.jpg`);
          await cam(page, Math.PI / 2, 0.1, 3.6);
          await sleep(1000);
          await shot(`${tag}-nghieng.jpg`);
          await cam(page, Math.PI, 0.1, 3.6);
          await sleep(1000);
          await shot(`${tag}-sau.jpg`);
          if (ONLY === 'still') continue;
          await cam(page, 0, 0.14, 4.4);
          await page.keyboard.down('KeyD');
          await sleep(1500);
          await shot(`${tag}-chay.jpg`);
          await page.keyboard.up('KeyD');
          await sleep(300);
          await cam(page, 0.5, 0.12, 3.6);
          await page.keyboard.press('KeyZ');
          await sleep(2200);
          await shot(`${tag}-datoa.jpg`);
          await page.keyboard.press('KeyW');
          await sleep(700);
          await gm(page, 'spawn mon_soi_xam 1', 1700);
          await cam(page, Math.PI * 0.8, 0.14, 3.6);
          await page.evaluate(() => (window as unknown as G).__game!.useSkill(1));
          await sleep(260);
          await shot(`${tag}-chem.jpg`);
          await sleep(900);
          await gm(page, 'killall', 1700);
        }
        await gm(page, 'tp 2048 2900', 900);
        await ctx.close();
      }
    }
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
    if (errors.length) console.log('[shots-chrv2] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
