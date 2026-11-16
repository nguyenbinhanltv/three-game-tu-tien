// pnpm shots:e3m: ảnh Kính Nguyệt Cung (E3-M) trong game thật: vào bằng cổng ở bản đồ trả về (vé một lần), từng đợt, đố ba gương,
// bóng giả/thể thật, thần thức, lặp lại, đĩa gương, nguyệt phản.
//   tsx src/shots-e3m.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2698/5298); luôn ?mute=1 và --mute-audio; đăng nhập thử.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3m'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2698);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5298);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3m', command: 'pnpm shots:e3m' });
type G = { __game?: Record<string, any> };
const PUZZLE = [
  { x: 1490, z: 1270 },
  { x: 1550, z: 1270 },
  { x: 1520, z: 1236 },
];
const COLORS = ['Lam', 'Đỏ', 'Vàng'];

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
    const name = `E3M${String(Date.now() % 10000)}`;
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
        // Còn sót quái ngoài tầm 40 m của killall: tới gần con đầu tiên rồi dọn tiếp.
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

    // Vân Hải Phù Đảo: tới cổng cạnh Kính Hồ Đài rồi bấm E.
    await gm(page, 'level 23');
    await gm(page, 'god on', 1200);
    await gm(page, 'tele all');
    await gm(page, 'tp vh_kinh_ho');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'van_hai', undefined, { timeout: 90_000, polling: 300 });
    await sleep(3000);
    await gm(page, 'tp 1168 1589', 2500);
    await cam(0.16, 11, Math.PI);
    await sleep(800);
    log.gate = await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      return { discs: g.gateDiscs.map((d: any) => ({ n: d.name, x: Math.round(d.position.x), y: Math.round(d.position.y), z: Math.round(d.position.z), v: d.visible, inScene: !!d.parent })), me: [Math.round(g.me().x), Math.round(g.me().z)], yaw: g.camYaw };
    });
    await shot('00-cong');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'kinh_nguyet', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    log.room = await page.evaluate(() => (window as unknown as G).__game!.info().room);
    log.info = await page.evaluate(() => {
      const i = (window as unknown as G).__game!.info();
      return { backend: i.backend, draw: i.drawCalls ?? i.calls, tri: i.triangles ?? i.tris };
    });
    await gm(page, 'god on', 1000);
    await shot('01-vao-cung');
    await cam(0.12, 9, Math.PI);
    await sleep(600);
    await shot('01b-vach-cung');
    await cam(0.62, 46, 0);
    await sleep(700);
    await shot('01c-toan-canh');
    await cam(0.2, 18, 0);
    await gm(page, 'tp 1520 1280', 1200);
    await shot('01d-guong-vach');
    await cam(0.55, 24, 0);
    await gm(page, 'tp 1520 1320', 900);
    await cam(0.5, 24, 0);

    // Đợt 1: Kính Linh.
    if (!(await waitMons('mon_kinh_linh', 30_000))) await shot('02-MISS');
    await skipCut();
    await cam(0.5, 22, 0);
    await sleep(1500);
    await shot('02-dot1-kinh-linh');
    await clear();

    // Đợt 2: Kính Diện Ma Quân.
    await waitMons('elite_kinh_dien_ma_quan', 30_000);
    await skipCut();
    await cam(0.4, 18, 0);
    await sleep(2500);
    await shot('03-dot2-ma-quan');
    await clear();

    // Đợt 3: đố ba gương. Đọc thứ tự từ tin hệ thống rồi chạm lần lượt ba cột.
    await gm(page, 'tp 1520 1290', 900);
    log.puzzleSeen = await waitText(/thứ tự:/, 40_000);
    await cam(0.7, 40, 0);
    await sleep(1200);
    await shot('04-dot3-do-ba-guong');
    const text = await page.evaluate(() => document.body.innerText);
    const m = /thứ tự:\s*([^.\n]+?)\.\s*Chạm/.exec(text);
    log.puzzleText = m?.[1] ?? null;
    const order = (m?.[1] ?? 'Lam → Đỏ → Vàng').split('→').map((s) => COLORS.indexOf(s.trim()));
    for (const i of order) {
      const p = PUZZLE[Math.max(0, i)];
      await gm(page, `tp ${p.x} ${p.z}`, 1600);
      await shot(`04b-cham-${i}`);
    }
    await gm(page, 'tp 1520 1290', 1500);
    await shot('04c-giai-xong');

    // Đợt 4: bầy Kính Linh + hai Thạch Quy hóa gương.
    await waitMons('mon_phu_dao_thach_quy', 40_000);
    await skipCut();
    await cam(0.5, 22, 0);
    await sleep(2500);
    await shot('05-dot4-thach-quy');
    await clear();

    // Đợt 5: boss. Bóng giả + thể thật, thần thức, lặp lại, đĩa gương, nguyệt phản.
    await waitMons('boss_kinh_nguyet_chan_quan', 40_000);
    await skipCut();
    await gm(page, 'tp 1520 1310', 900);
    await cam(0.55, 30, 0);
    await sleep(2500);
    await shot('06-boss-bon-than');
    log.boss0 = (await mons()).map((x: any) => ({ t: x.t, mf: x.mf }));
    await page.keyboard.down('KeyV');
    await sleep(3200);
    await page.keyboard.up('KeyV');
    await sleep(900);
    await shot('06b-than-thuc-soi');
    await page.keyboard.press('Digit1');
    await sleep(500);
    await shot('06c-lap-lai');
    // Phá một bóng giả: tới sát nó, chọn mục tiêu gần nhất rồi đánh; vòng nổ báo trước hiện ở chỗ nó vỡ.
    const dec = (await mons()).find((x: any) => x.t === 'mon_kinh_anh_gia');
    log.decoyFound = !!dec;
    if (dec) {
      await gm(page, `tp ${Math.round(dec.x)} ${Math.round(dec.z + 3)}`, 900);
      await page.keyboard.press('Tab');
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Digit1');
        await sleep(700);
      }
      await shot('06d-bong-gia-no');
    }
    log.boss1 = (await mons()).map((x: any) => ({ t: x.t, mf: x.mf }));
    await gm(page, 'tp 1520 1310', 900);
    await gm(page, 'hurt 60', 900);
    await gm(page, 'heal', 900);
    await cam(0.6, 34, 0);
    for (let i = 0; i < 6; i++) {
      await sleep(900);
      await shot(`07-dia-guong-${i}`);
    }
    await gm(page, 'hurt 30', 900);
    await gm(page, 'heal', 900);
    await cam(0.55, 30, 0);
    for (let i = 0; i < 4; i++) {
      await sleep(1800);
      await shot(`08-nguyet-phan-${i}`);
    }
    await gm(page, 'hurt 1', 900);
    await clear();
    await sleep(3500);
    await shot('09-hoan-thanh');
    fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
    await browser.close();
  } finally {
    dev.stop();
  }
  console.log(errors.length ? '[shots-e3m] lỗi console:\n' + errors.slice(0, 10).join('\n') : '[shots-e3m] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
