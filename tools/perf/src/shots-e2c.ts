// pnpm shots:e2c: ảnh Phục Mạch Quật (E2-C) trong game thật: vào bằng cổng Khai Mạch Cổng ở Đoạn Mạch (vé một lần), từng đợt, vạch báo và pha boss.
//   tsx src/shots-e2c.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2688/5288); luôn ?mute=1 và --mute-audio; đăng nhập thử.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e2c'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2688);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5288);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2c', command: 'pnpm shots:e2c' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  const log: Record<string, unknown> = {};
  try {
    await dev.start();
    const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','high');" });
    const page = await ctx.newPage();
    const name = `E2C${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&quiet=1${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    const skipCut = async () => {
      for (let i = 0; i < 40; i++) {
        const hidden = await page.evaluate(() => {
          const h = document.querySelector('.hud');
          return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
        });
        if (!hidden) break;
        await page.keyboard.press('Space');
        await sleep(400);
      }
    };
    await skipCut();
    await page.addStyleTag({ content: '.chat{visibility:hidden !important}' });
    const shot = async (label: string) => fs.writeFileSync(path.join(OUT, `${label}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82 }));
    const cam = (pitch: number, dist: number, yaw = Math.PI) =>
      page.evaluate(([p, d, y]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
        g.camDistCur = d;
      }, [pitch, dist, yaw] as const);

    // Đoạn Mạch: tới cổng Khai Mạch Cổng rồi bấm E (vé thật).
    await gm(page, 'level 19');
    await gm(page, 'god on', 1200);
    await gm(page, 'tele all');
    await gm(page, 'tp dm_tram');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'doan_mach', undefined, { timeout: 90_000, polling: 300 });
    await sleep(3000);
    await gm(page, 'tp 584 972', 2500);
    await cam(0.35, 16, Math.PI);
    await sleep(800);
    await shot('00-cong-doan-mach');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'phuc_mach', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    log.room = await page.evaluate(() => (window as unknown as G).__game!.info().room);
    await gm(page, 'god on', 1000);
    await shot('01-vao-hang');
    await gm(page, 'tp 1520 1326', 900);
    await cam(0.5, 22, 0);
    const mons = () => page.evaluate(() => [...(window as unknown as G).__game!.view.monsters.values()].filter((m: any) => m.t && m.st !== 4).map((m: any) => ({ t: m.t, hp: m.hp, mhp: m.mhp })));
    const hazards = () => page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).length);
    const waitMons = async (id: string, ms = 40_000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if ((await mons()).some((m: any) => m.t === id)) return true;
        await sleep(300);
      }
      return false;
    };
    const waves: [string, string, number, string[]][] = [
      ['mon_khai_mach_khoi_loi', 'dot1-khoi-loi', 0.5, []],
      ['elite_ho_mach_khoi_tuong', 'dot2-ho-ve', 0.5, []],
      ['mon_ngo_cong_au', 'dot3-ngo-cong-au', 0.7, []],
      ['boss_thach_tam_khoi_vuong', 'dot4-thach-tam', 0.4, ['hurt 60', 'hurt 30']],
      ['boss_thon_mach_ngo_cong_vuong', 'dot5-thon-mach', 0.35, ['hurt 60', 'hurt 30', 'hurt 8']],
    ];
    for (const [id, tag, pitch, hurts] of waves) {
      const ok = await waitMons(id);
      if (!ok) {
        console.log(`[shots-e2c] ${tag}: không thấy ${id}`);
        await shot(`${tag}-MISS`);
        break;
      }
      await skipCut();
      await cam(pitch, id.startsWith('boss') ? 24 : 20, 0);
      await sleep(1500);
      await shot(`${tag}-0`);
      if (id !== 'mon_khai_mach_khoi_loi') await gm(page, 'tp 1520 1302', 900);
      const boss = id.startsWith('boss');
      const phases = [''].concat(hurts);
      for (let ph = 0; ph < phases.length; ph++) {
        if (phases[ph]) {
          await gm(page, phases[ph], 900);
          await gm(page, 'heal', 900);
        }
        await page.evaluate(() => ((window as unknown as G).__game!.hazardLog = []));
        const until = Date.now() + (boss ? 22_000 : 9_000);
        while (Date.now() < until && (await hazards()) === 0) await sleep(80);
        const got = (await hazards()) > 0;
        const t0 = Date.now();
        for (let i = 0; i < (boss ? 4 : 2); i++) {
          await shot(`${tag}-ph${ph}-${i}-t${Date.now() - t0}`);
          await sleep(300);
        }
        log[`${tag}-ph${ph}`] = { got, hz: await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).map((h: any) => ({ mv: h.mv, sh: h.sh, r: h.r, w: h.w, delay: h.delay }))) };
      }
      // hạ hết để sang đợt kế
      await gm(page, 'tp 1520 1290', 900);
      await gm(page, 'hurt 1', 900);
      for (let round = 0; round < 4 && (await mons()).length; round++) {
        for (const [x, z] of [[1520, 1290], [1474, 1262], [1566, 1262], [1520, 1234]]) {
          await gm(page, `tp ${x} ${z}`, 900);
          await gm(page, 'killall', 900);
        }
        console.log(`[shots-e2c] ${tag}: còn ${(await mons()).length} quái sau vòng dọn ${round}`);
      }
      await gm(page, 'tp 1520 1326', 900);
      await sleep(500);
    }
    await sleep(3000);
    await shot('06-hoan-thanh');
    fs.writeFileSync(path.join(OUT, 'hazards.json'), JSON.stringify(log, null, 2));
    await browser.close();
  } finally {
    dev.stop();
  }
  console.log(errors.length ? '[shots-e2c] lỗi console:\n' + errors.slice(0, 10).join('\n') : '[shots-e2c] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
