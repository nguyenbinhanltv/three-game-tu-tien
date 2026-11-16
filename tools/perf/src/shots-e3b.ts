// pnpm shots:e3b: ảnh quái, tinh anh, boss Vân Hải Phù Đảo (E3-B) trong game thật: vạch báo (chiêu đặc trưng) và cảnh chết.
//   tsx src/shots-e3b.ts --out <thư mục tuyệt đối> [--only id,id] [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2687/5187); luôn ?mute=1 và --mute-audio; đăng nhập thử, vào bằng `/gm tele all` + `/gm tp vh_hub`, rồi `/gm tp <trận đảo>`, /gm spawn.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3b'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2687);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5187);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3b', command: 'pnpm shots:e3b' });
type G = { __game?: Record<string, any> };

interface Spec {
  mon: string;
  lv: number;
  dist: number;
  pitch: number;
  /** Chờ tới khi có vạch báo (mặc định) hoặc cờ mf (số) trước khi chụp. */
  flag?: number;
  /** Đứng yên (chiêu dùng được ở sát). */
  stand?: boolean;
  /** Góc camera (rad), mặc định π: nhìn từ phía người chơi về quái. */
  yaw?: number;
  /** Lệnh /gm chạy sau khi gọi quái (ví dụ hạ máu để vào pha). */
  after?: string[];
  shots?: number;
  /** Quái chỉ bắn đạn (không có vạch báo): chờ ngần này ms rồi chụp. */
  wait?: number;
  /** Điểm đặt tên (places.json) để đứng trước khi gọi quái. */
  at: string;
}
const SPECS: Spec[] = [
  { mon: 'mon_van_hac', at: 'vh_tung_dai', lv: 20, dist: 12, pitch: 0.3, yaw: Math.PI / 2, stand: true, wait: 3000 },
  { mon: 'mon_bich_ngoc_kim_thien', at: 'vh_tung_dai', lv: 20, dist: 8, pitch: 0.4, stand: true },
  { mon: 'mon_phu_dao_thach_quy', at: 'vh_thach_quy', lv: 21, dist: 7, pitch: 0.45, stand: true },
  { mon: 'mon_kinh_linh', at: 'vh_kinh_ho', lv: 21, dist: 6, pitch: 0.4, stand: true, flag: 8 },
  { mon: 'elite_van_hac_vuong', at: 'vh_kinh_ngu', lv: 23, dist: 14, pitch: 0.3, yaw: Math.PI / 2, stand: true, wait: 3000 },
  { mon: 'elite_kinh_dien_ma_quan', at: 'vh_kinh_ho', lv: 22, dist: 8, pitch: 0.4, stand: true },
  { mon: 'elite_loi_van_su_vuong', at: 'vh_loi_van', lv: 23, dist: 9, pitch: 0.4, stand: true },
  { mon: 'boss_van_hai_kinh_vuong', at: 'vh_kinh_ngu', lv: 23, dist: 20, pitch: 0.28, yaw: Math.PI / 2, stand: true, shots: 6 },
  { mon: 'boss_van_hai_kinh_vuong', at: 'vh_kinh_ngu', lv: 23, dist: 20, pitch: 0.28, yaw: Math.PI / 2, stand: true, after: ['hurt 99'], shots: 6, flag: 16 },
  { mon: 'boss_van_hai_kinh_vuong', at: 'vh_kinh_ngu', lv: 23, dist: 22, pitch: 0.28, yaw: Math.PI / 2, stand: true, after: ['hurt 45'], shots: 6 },
  { mon: 'boss_van_hai_kinh_vuong', at: 'vh_kinh_ngu', lv: 23, dist: 22, pitch: 0.28, yaw: Math.PI / 2, stand: true, after: ['hurt 25'], shots: 8 },
];

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
    const name = `E3B${String(Date.now() % 10000)}`;
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
    let idx = 0;
    for (const sp of SPECS) {
      const tag = `${sp.mon}${sp.after ? '-' + sp.after[0].replace(/\s+/g, '') : ''}`;
      idx++;
      if (only.length && !only.includes(sp.mon)) continue;
      let seen = false;
      // Chập chờn (quái áp sát trước khi ra chiêu, người chơi chết...): thử lại tối đa 3 lần.
      for (let attempt = 0; attempt < 3 && !seen; attempt++) {
      await gm(page, `level ${sp.lv}`, 1200);
      await gm(page, 'killall', 800);
      await gm(page, `tp ${sp.at}`, 1800);
      await gm(page, 'heal', 400);
      await gm(page, 'god on', 400);
      await page.evaluate(() => ((window as unknown as G).__game!.hazardLog = []));
      await cam(sp.pitch, sp.dist, sp.yaw);
      await gm(page, `spawn ${sp.mon} 1`, 3500);
      for (const c of sp.after ?? []) await gm(page, c, 700);
      const until = Date.now() + (sp.wait ? 0 : 25_000);
      if (sp.wait) {
        await sleep(sp.wait);
        seen = true;
      }
      // Chạy thẳng về phía bắc cho quái ở xa (chiêu lao/vồ cần khoảng cách), thả phím khi thấy chiêu.
      let tick = 0;
      while (Date.now() < until) {
        // Chạy dài hơn tốc độ quái để giữ khoảng cách (chiêu lao/vồ cần 3 m trở lên); 6 s về lại trạm một lần.
        if (!sp.stand && tick % 100 === 0) {
          await page.keyboard.up('KeyW');
          if (tick) await gm(page, `tp ${sp.at}`, 1200);
          await page.keyboard.down('KeyW');
        }
        tick++;
        const hit = sp.flag ? ((await flags()) & sp.flag) !== 0 : (await hazards()) > 0;
        if (hit) {
          seen = true;
          break;
        }
        await sleep(60);
      }
      await page.keyboard.up('KeyW');
      }
      if (!seen) {
        console.log(`[shots-e3b] ${tag}: không thấy chiêu sau 3 lần thử`);
        await shot(`${tag}-MISS`);
        continue;
      }
      // Cảnh boss xuất hiện (B2) chiếm khung hình: bỏ qua trước khi chụp.
      for (let i = 0; i < 20; i++) {
        const cut = await page.evaluate(() => {
          const h = document.querySelector('.hud');
          return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
        });
        if (!cut) break;
        await page.keyboard.press('Space');
        await sleep(400);
      }
      const t0 = Date.now();
      for (let i = 0; i < (sp.shots ?? 6); i++) {
        await shot(`${tag}-skill-${i}-t${Date.now() - t0}`);
        await sleep(250);
      }
      log[tag] = await page.evaluate(() => ((window as unknown as G).__game!.hazardLog ?? []).map((h: any) => ({ mv: h.mv, sh: h.sh, r: h.r, w: h.w, delay: h.delay })));
      if (!sp.after) {
        // Boss chặn sát thương ở ngưỡng pha: hạ nhiều lần cho tới khi chết, rồi chụp ngay từ lúc ngã.
        const isBoss = sp.mon.startsWith('boss_');
        for (let k = 0; k < (isBoss ? 10 : 1); k++) {
          await gm(page, 'killall', isBoss ? 1150 : 300);
          if (!isBoss) break;
          const dead = await page.evaluate((id) => [...(window as unknown as G).__game!.view.monsters.values()].some((m: any) => m.t === id && m.st === 4), sp.mon);
          if (dead) break;
        }
        for (let i = 0; i < 5; i++) {
          await shot(`${tag}-death-${i}`);
          await sleep(sp.mon.startsWith('boss_') ? 450 : 350);
        }
      }
      console.log(`[shots-e3b] ${tag}: xong`);
    }
    fs.writeFileSync(path.join(OUT, 'hazards.json'), JSON.stringify(log, null, 2));
    await browser.close();
  } finally {
    dev.stop();
  }
  console.log(errors.length ? '[shots-e3b] lỗi console:\n' + errors.slice(0, 10).join('\n') : '[shots-e3b] 0 lỗi console');
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
