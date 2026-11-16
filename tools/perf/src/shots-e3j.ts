// pnpm shots:e3j: ảnh vạch báo hai chiêu quái E3-G trong game thật: Nuốt kéo người (Vân Hải Kình Vương) và vũng độc khi chết (Bích Ngọc Kim Thiền).
//   tsx src/shots-e3j.ts --out <thư mục tuyệt đối> [--only id,id] [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2761/5361); luôn ?mute=1 và --mute-audio; đăng nhập thử, vào bằng `/gm tele all` + `/gm tp vh_hub`, rồi `/gm tp <trận đảo>`, /gm spawn.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3j'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2761);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5361);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3j', command: 'pnpm shots:e3j' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const only = opt('--only', '').split(',').filter(Boolean);
  const errors: string[] = [];
  const log: Record<string, unknown> = {};
  try {
    await dev.start();
    const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','high');" });
    const page = await ctx.newPage();
    const name = `E3J${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&quiet=1${process.env.EXTRA_QUERY ?? ""}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
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
    await gm(page, 'level 23');
    await gm(page, 'god on', 1200);
    await gm(page, 'tele all');
    await gm(page, 'tp vh_hub');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'van_hai', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    await gm(page, 'god on', 1000);
    const shot = async (label: string) => fs.writeFileSync(path.join(OUT, `${label}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82 }));
    const cam = (pitch: number, dist: number, yaw = Math.PI) =>
      page.evaluate(
        ([p, d, y]) => {
          const g = (window as unknown as G).__game!;
          g.camYaw = y;
          g.camPitch = p;
          g.camDist = d;
          g.camDistCur = d;
        },
        [pitch, dist, yaw] as const,
      );
    const hazards = () => page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).length);
    const flags = () =>
      page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        let mf = 0;
        for (const m of g.view.monsters.values()) if (m.t && m.st !== 4) mf |= m.mf;
        return mf;
      });
    const frames = async (tag: string, n: number, gap: number) => {
      const t0 = Date.now();
      for (let i = 0; i < n; i++) {
        await shot(`${tag}-${i}-t${Date.now() - t0}`);
        await sleep(gap);
      }
    };
    const hz = () => page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).map((h: any) => ({ sh: h.sh, r: h.r, k: h.k, src: h.src })));

    const only = opt('--only', '');
    // 1) Bích Ngọc Kim Thiền chết: vạch báo vũng độc (đứng ngay chỗ quái), rồi vũng ngọc lục.
    if (only !== 'vuong') {
    await gm(page, 'level 20', 1200);
    await gm(page, 'killall', 1150);
    await gm(page, 'tp vh_tung_dai', 1800);
    await gm(page, 'heal', 1150);
    await cam(0.5, 9, Math.PI);
    await page.evaluate(() => ((window as unknown as G).__game!.hazardLog = []));
    await gm(page, 'god on', 1150);
    await gm(page, 'spawn mon_bich_ngoc_kim_thien 1', 1800);
    log.kimThienSeen = await page.evaluate(() => [...(window as unknown as G).__game!.view.monsters.values()].map((m: any) => ({ t: m.t, st: m.st, x: Math.round(m.x), z: Math.round(m.z) })));
    await shot('kim_thien-truoc-khi-chet');
    await gm(page, 'killall', 250);
    await frames('kim_thien-pool-bao', 3, 300);
    await sleep(900);
    await frames('kim_thien-pool-vung', 4, 900);
    log.kimThien = await hz();
    }

    // 2) Kình Vương pha 30%: Nuốt. Đứng cách boss ~15 m (trong vòng kéo 20 m), chụp vòng báo, lúc kéo, lúc nổ.
    await gm(page, 'level 23', 1200);
    await gm(page, 'killall', 1150);
    await gm(page, 'tp vh_kinh_ngu', 1800);
    await gm(page, 'heal', 1150);
    await gm(page, 'god on', 1150);
    await cam(0.55, 26, Math.PI / 2);
    await page.evaluate(() => ((window as unknown as G).__game!.hazardLog = []));
    await gm(page, 'spawn boss_van_hai_kinh_vuong 1', 3500);
    await gm(page, 'hurt 25', 1150);
    const until = Date.now() + 30_000;
    let pull = false;
    while (Date.now() < until && !pull) {
      for (let i = 0; i < 8 && !pull; i++) {
        pull = await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).some((h: any) => h.mv === 'pull'));
        if (!pull) await sleep(120);
      }
      if (!pull) await gm(page, 'hurt 25', 1150);
    }
    // Cảnh boss xuất hiện (B2) chiếm khung hình: bỏ qua.
    for (let i = 0; i < 20; i++) {
      const cut = await page.evaluate(() => {
        const h = document.querySelector('.hud');
        return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
      });
      if (!cut) break;
      await page.keyboard.press('Space');
      await sleep(400);
    }
    console.log('[shots-e3j] thấy vòng kéo:', pull);
    await frames('kinh_vuong-nuot', 10, 350);
    log.kinhVuong = await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).map((h: any) => ({ k: h.k, sh: h.sh, r: h.r, big: h.big })));
    await gm(page, 'killall', 1150);
    await browser.close();
  } catch (e) {
    errors.push(String((e as Error).stack ?? e));
    console.error(e);
  } finally {
    dev.stop();
  }
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ errors: errors.slice(0, 20), log }, null, 2));
  console.log(`[shots-e3j] lỗi console: ${errors.length}`);
}

main();
