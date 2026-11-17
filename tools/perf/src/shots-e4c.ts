// pnpm shots:e4c: ảnh Thần Tàng Điện (E4-C) trong game thật: vào bằng cổng ở Thiên Khuyết (vé một lần), từng đợt, đợt phong ấn
// (vùng chặn, xuất khiếu mở cửa, Phá Ấn Phù), Vô Diện Thần Quân (sáu tay, ngũ hành, phân thân, vòng đá).
//   tsx src/shots-e4c.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2699/5299); luôn ?mute=1 và --mute-audio; đăng nhập thử.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e4c'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2699);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5299);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e4c', command: 'pnpm shots:e4c' });
type G = { __game?: Record<string, any> };
// Cùng số với levels/than_tang.json (cửa, trận môn).
const DOORS = [
  { x: 1477, z: 1284, gx: 1458, gz: 1277 },
  { x: 1520, z: 1254, gx: 1520, gz: 1234 },
  { x: 1563, z: 1284, gx: 1582, gz: 1277 },
];

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
    const name = `E4C${String(Date.now() % 10000)}`;
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
    await page.addStyleTag({ content: '.chat{opacity:0 !important}' });
    const shot = async (label: string) => fs.writeFileSync(path.join(OUT, `${label}.jpg`), await page.screenshot({ type: 'jpeg', quality: 82 }));
    const cam = (pitch: number, dist: number, yaw = Math.PI) =>
      page.evaluate(([p, d, y]) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = y;
        g.camPitch = p;
        g.camDist = d;
        g.camDistCur = d;
      }, [pitch, dist, yaw] as const);
    const mons = () => page.evaluate(() => [...(window as unknown as G).__game!.view.monsters.values()].filter((m: any) => m.t && m.st !== 4).map((m: any) => ({ t: m.t, hp: m.hp, mhp: m.mhp, mf: m.mf, x: m.x, z: m.z })));
    const waitMons = async (id: string, ms = 40_000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if ((await mons()).some((m: any) => m.t === id)) return true;
        await sleep(300);
      }
      return false;
    };
    const clear = async () => {
      for (let round = 0; round < 10; round++) {
        await gm(page, 'killall', 900);
        const left = await mons();
        if (!left.length) return;
        await gm(page, `tp ${Math.round(left[0].x)} ${Math.round(left[0].z + 6)}`, 900);
      }
    };
    const waitText = async (re: RegExp, ms = 40_000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (re.test(await page.evaluate(() => document.body.innerText))) return true;
        await sleep(400);
      }
      return false;
    };

    // Thiên Khuyết: tới Cổng Thần Tàng Điện rồi bấm E ở cổng.
    await gm(page, 'level 27');
    await gm(page, 'god on', 1200);
    await gm(page, 'tele all');
    await gm(page, 'tp tk_tram');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'thien_khuyet', undefined, { timeout: 90_000, polling: 300 });
    await sleep(3000);
    await gm(page, 'tp 1044 268', 2500);
    await cam(0.2, 14, Math.PI);
    await sleep(800);
    await shot('00-cong');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'than_tang', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    log.room = await page.evaluate(() => (window as unknown as G).__game!.info().room);
    log.info = await page.evaluate(() => {
      const i = (window as unknown as G).__game!.info();
      return { backend: i.backend, draw: i.drawCalls ?? i.calls, tri: i.triangles ?? i.tris };
    });
    await gm(page, 'god on', 1000);
    await shot('01-vao-dien');
    await cam(0.62, 50, 0);
    await sleep(700);
    await shot('01b-toan-canh');
    await cam(0.45, 24, 0);
    await gm(page, 'tp 1520 1320', 900);

    // Đợt 1, 2, 3.
    await waitMons('mon_tt_cot_ve', 30_000);
    await skipCut();
    await cam(0.5, 22, 0);
    await sleep(1500);
    await shot('02-dot1-cot-ve');
    await clear();
    await waitMons('mon_tt_thach_tuong', 30_000);
    await cam(0.5, 22, 0);
    await sleep(2000);
    await shot('03-dot2-thach-tuong-chien-ma');
    await clear();
    await waitMons('elite_tt_cot_kiem', 30_000);
    await skipCut();
    await cam(0.4, 16, 0);
    await sleep(2500);
    await shot('04-dot3-cot-kiem');
    await clear();

    // Đợt 4: phong ấn.
    await waitText(/phong ấn/, 30_000);
    await skipCut();
    await gm(page, 'tp 1520 1300', 900);
    await cam(0.7, 46, 0);
    await sleep(2500);
    await shot('05-dot4-ba-cua');
    // Thân xác đi vào hốc bị đẩy ra.
    await gm(page, `tp ${DOORS[1].gx} ${DOORS[1].gz}`, 1200);
    log.barrierMsg = await waitText(/Phong ấn chặn lại/, 6000);
    await shot('05b-chan-than-xac');
    log.posAfterBarrier = await page.evaluate(() => {
      const m = (window as unknown as G).__game!.me();
      return [Math.round(m.x), Math.round(m.z)];
    });
    // Cửa 1 bằng nguyên anh xuất khiếu: X rồi tới trận môn.
    await gm(page, `tp ${DOORS[0].x} ${DOORS[0].z + 4}`, 900);
    await page.keyboard.press('KeyX');
    await sleep(1500);
    await cam(0.5, 16, 0);
    await shot('05c-xuat-khieu');
    await gm(page, `tp ${DOORS[0].gx} ${DOORS[0].gz}`, 1500);
    log.door1 = await waitText(/cửa phong ấn thứ 1 đã mở/i, 8000);
    await shot('05d-cua-1-mo');
    await page.keyboard.press('KeyX');
    await sleep(1200);
    // Hai cửa còn lại bằng Phá Ấn Phù.
    await gm(page, 'bag clear', 800);
    await gm(page, 'give itm_pha_an_phu 3', 900);
    for (let i = 1; i < 3; i++) {
      await gm(page, `tp ${DOORS[i].x} ${DOORS[i].z + 4}`, 1200);
      // Túi đã dọn: bùa nằm ở một trong vài ô đầu; ô trống bị server bỏ qua nên thử lần lượt.
      for (let slot = 0; slot < 6; slot++) {
        await page.evaluate(([sl, r]) => (window as unknown as G).__game!.send('use', { slot: sl, r }), [slot, `pap-${i}-${slot}-${Date.now()}`] as const);
        await sleep(250);
      }
      await sleep(1500);
      await shot(`05e-cua-${i + 1}-pha-an-phu`);
    }
    log.allOpen = await waitText(/Ba cửa phong ấn đã mở/, 8000);
    await gm(page, 'tp 1520 1300', 900);
    await cam(0.6, 40, 0);
    await sleep(2500);
    await shot('05f-ba-cua-mo-quai-keo-toi');
    await clear();

    // Đợt 5: Hóa Hình.
    await waitMons('mon_tt_thach_tuong', 30_000);
    await skipCut();
    await cam(0.5, 24, 0);
    await sleep(2500);
    await shot('06-dot5-hoa-hinh');
    await clear();

    // Đợt 6: boss.
    await waitMons('boss_vo_dien_than_quan', 40_000);
    await skipCut();
    await gm(page, 'tp 1520 1325', 900);
    await cam(0.5, 30, 0);
    await sleep(2500);
    await shot('07-boss-xuat-hien');
    for (let i = 0; i < 5; i++) {
      await sleep(1100);
      await shot(`07b-sau-tay-${i}`);
    }
    for (let i = 0; i < 4; i++) {
      await sleep(2200);
      await shot(`08-ngu-hanh-${i}`);
    }
    log.bossMsgs = await waitText(/Hành .* giáng xuống/, 5000);
    await gm(page, 'hurt 60', 900);
    await gm(page, 'heal', 900);
    await cam(0.6, 34, 0);
    for (let i = 0; i < 4; i++) {
      await sleep(1500);
      await shot(`09-phan-than-${i}`);
    }
    await gm(page, 'hurt 30', 900);
    await gm(page, 'heal', 900);
    await cam(0.65, 40, 0);
    for (let i = 0; i < 6; i++) {
      await sleep(1800);
      await shot(`10-vong-da-${i}`);
    }
    await gm(page, 'hurt 1', 900);
    await clear();
    await sleep(3500);
    await shot('11-hoan-thanh');
    fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
    await browser.close();
  } finally {
    dev.stop();
  }
  console.log(errors.length ? '[shots-e4c] lỗi console:\n' + errors.slice(0, 10).join('\n') : '[shots-e4c] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
