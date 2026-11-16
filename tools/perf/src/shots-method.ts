// pnpm shots:method: chụp ảnh công pháp (P3-5): thanh chiêu 8 ô (vòng sạc), bảng Công pháp, chiêu mới đang ra đòn.
//   tsx src/shots-method.ts --out <thư mục> [--renderer webgpu|webgl2] [--only a,b]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), vào game tắt tiếng (?mute=1, --mute-audio) bằng tài khoản thử,
// dùng lệnh GM (`/gm method`, `/gm charge`, `/gm spawn`) để dựng cảnh rồi bấm chiêu bằng `__game.useSkill`.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-method'));
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-method', command: 'pnpm shots:method' });
type G = { __game?: Record<string, any> };

async function gm(page: Page, cmd: string, wait = 1250): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
}

/** Bỏ qua cảnh mở đầu (phím bất kỳ) và thẻ chương rồi chờ HUD hiện đủ, để ảnh thấy thanh chiêu. */
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

/** Bấm chiêu ở ô `slot` (0-based) rồi chụp sau từng mốc `at` (ms) kể từ lúc bấm. */
async function castShots(page: Page, slot: number, name: string, at: number[]): Promise<void> {
  // Tắt tự đánh và chờ hết GCD: chiêu bấm lúc còn chờ lâu bị server bỏ (GCD 1 giây), ảnh sẽ không có chiêu.
  if (slot > 0) {
    await page.evaluate(() => (window as unknown as G).__game!.clearTarget());
    await sleep(1300);
  }
  const t0 = Date.now();
  await page.evaluate((i) => (window as unknown as G).__game!.useSkill(i), slot);
  for (const t of at) {
    const wait = t0 + t - Date.now();
    if (wait > 0) await sleep(wait);
    const file = path.join(OUT, `${name}-${t}ms.png`);
    await page.screenshot({ path: file });
    console.log(`[shots-method] ${path.basename(file)}`);
  }
}

const want = (n: string) => !ONLY.length || ONLY.includes(n);

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 400)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=ShotMethod${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    await gm(page, 'level 12');
    await gm(page, 'god on');
    await gm(page, 'gold 5000');
    await gm(page, 'give itm_bi_tich_tan_quyen 40');
    await gm(page, 'give itm_hoi_xuan_dan 5');
    await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      g.camYaw = 0;
      g.camPitch = 0.32;
      g.camDist = 11;
    });
    const bar = async (file: string) => {
      await page.screenshot({ path: path.join(OUT, file), clip: { x: VW / 2 - 330, y: VH - 150, width: 660, height: 140 } });
      console.log(`[shots-method] ${file}`);
    };
    const methods = [
      { id: 'lac_kiem_quyet', sig: 6, ult: 7, tag: 'kiem' },
      { id: 'bat_dong_kim_than', sig: 6, ult: 7, tag: 'kim' },
      { id: 'thanh_moc_dan_kinh', sig: 6, ult: 7, tag: 'moc' },
    ];
    if (want('bar') || want('panel')) {
      await gm(page, 'method lac_kiem_quyet 3');
      await gm(page, 'charge 62');
      await sleep(600);
      if (want('bar')) {
        await bar('bar-kiem-sac-62.png');
        await gm(page, 'charge 100');
        await sleep(900);
        await bar('bar-kiem-day.png');
      }
      if (want('panel')) {
        await page.evaluate(() => (window as unknown as G).__game!.send('chat', { m: '' }));
        await page.keyboard.press('KeyK');
        await sleep(900);
        await page.screenshot({ path: path.join(OUT, 'panel-cong-phap-kiem.png') });
        console.log('[shots-method] panel-cong-phap-kiem.png');
        // Bảng khi chọn công pháp khác (xem trước).
        await page.getByRole('tab', { name: /Bất Động Kim Thân/ }).click();
        await sleep(500);
        await page.screenshot({ path: path.join(OUT, 'panel-cong-phap-xem-kim.png') });
        await page.keyboard.press('KeyK');
        await sleep(300);
      }
    }
    for (const m of methods) {
      if (!want(m.tag)) continue;
      await gm(page, `method ${m.id} 5`);
      await gm(page, 'spawn mon_soi_xam 3', 1500);
      await gm(page, 'heal');
      await bar(`bar-${m.tag}-cap5.png`);
      if (m.tag === 'kiem') {
        await castShots(page, 0, 'kiem-phi-kiem-bien-thuc-cap5', [350]);
        await sleep(1100);
        await castShots(page, m.sig, 'kiem-kiem-anh-phan-quang', [260, 520]);
        await sleep(1200);
        await gm(page, 'charge 100', 1250);
        await castShots(page, m.ult, 'kiem-van-kiem-quy-tong', [300, 700, 1100]);
      } else if (m.tag === 'kim') {
        await castShots(page, m.sig, 'kim-tran-son-an', [300, 650]);
        await sleep(1200);
        await gm(page, 'charge 100', 1250);
        await castShots(page, m.ult, 'kim-kim-cuong-bat-hoai', [250, 700]);
      } else {
        // Hồi sinh cần một đạo hữu: mở trang thứ hai (cùng sân tông môn), cho ngã rồi mới tung Hồi Thiên Đan Lộ.
        const p2 = await ctx.newPage();
        await p2.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=ShotMethod2${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
        await p2.waitForFunction(() => {
          const g = (window as unknown as G).__game;
          return !!g && g.frames > 30 && !!g.me?.();
        }, undefined, { timeout: 120_000, polling: 250 });
        await clearIntro(p2);
        await gm(p2, 'level 12');
        await gm(p2, 'god on');
        await page.bringToFront();
        await sleep(800);
        await castShots(page, m.sig, 'moc-xuan-phong-hoa-vu', [350, 800]);
        await sleep(1200);
        await gm(p2, 'die');
        await sleep(600);
        await gm(page, 'charge 100', 1250);
        await castShots(page, m.ult, 'moc-hoi-thien-dan-lo', [300, 800]);
        await p2.close();
      }
      await gm(page, 'killall', 1200);
    }
    if (want('var')) {
      // Mỗi biến thức A/B (P3-6) đang ra đòn: dùng /gm variant, bấm đúng ô chiêu, chụp vài mốc. Chiêu niệm chú chụp muộn hơn.
      const targets: { method: string; skill: string; at: number[]; atB?: number[] }[] = [
        { method: 'lac_kiem_quyet', skill: 'skl_phi_kiem', at: [300, 520] },
        { method: 'lac_kiem_quyet', skill: 'skl_kiem_khi_tram', at: [300, 650] },
        { method: 'lac_kiem_quyet', skill: 'skl_linh_khi_ho_the', at: [350, 900] },
        { method: 'lac_kiem_quyet', skill: 'skl_thien_kiem_vu', at: [450, 900] },
        { method: 'lac_kiem_quyet', skill: 'skl_hoi_nguyen_thuat', at: [250, 1500] },
        { method: 'lac_kiem_quyet', skill: 'skl_loi_dinh_nhat_kiem', at: [350, 700], atB: [1900, 2300] },
        { method: 'lac_kiem_quyet', skill: 'skl_phi_kiem_truy_hon', at: [280, 520] },
        { method: 'bat_dong_kim_than', skill: 'skl_tran_son_an', at: [300, 650] },
        { method: 'thanh_moc_dan_kinh', skill: 'skl_hoi_xuan_quyet', at: [350, 1300] },
      ];
      const only = ONLY.filter((x) => x.startsWith('var:')).map((x) => x.slice(4));
      let cur = '';
      for (const tg of targets) {
        if (only.length && !only.includes(tg.skill)) continue;
        if (cur !== tg.method) {
          await gm(page, `method ${tg.method} 5`);
          cur = tg.method;
        }
        for (const v of ['a', 'b'] as const) {
          await gm(page, `variant ${tg.skill} ${v}`, 900);
          await gm(page, `variant ${tg.skill} ${v}`, 900);
          await gm(page, 'spawn mon_soi_xam 3', 1500);
          await gm(page, 'heal', 900);
          await gm(page, 'cd', 900);
          // Khiên Đồng Hành cần một đạo hữu đứng gần: mở trang thứ hai.
          let p2: Page | null = null;
          if (tg.skill === 'skl_linh_khi_ho_the' && v === 'b') {
            p2 = await page.context().newPage();
            await p2.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=ShotMethod2${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
            await p2.waitForFunction(() => {
              const g = (window as unknown as G).__game;
              return !!g && g.frames > 30 && !!g.me?.();
            }, undefined, { timeout: 120_000, polling: 250 });
            await clearIntro(p2);
            await gm(p2, 'god on');
            await page.bringToFront();
            await sleep(800);
            await gm(page, 'cd', 900);
          }
          await page.evaluate(() => (window as unknown as G).__game!.camYaw = 0);
          let slot = -1;
          for (let tries = 0; tries < 10 && slot < 0; tries++) {
            slot = await page.evaluate((id) => (window as unknown as G).__game!.bar().findIndex((s: { id: string }) => s.id === id), tg.skill);
            if (slot < 0) await sleep(500);
          }
          if (slot < 0) throw new Error('không thấy chiêu trên thanh: ' + tg.skill);
          await castShots(page, slot, `var-${tg.skill.replace('skl_', '')}-${v}`, v === 'b' && tg.atB ? tg.atB : tg.at);
          await sleep(1500);
          await p2?.close();
          await gm(page, 'killall', 1000);
        }
      }
    }
    if (errors.length) console.warn(`[shots-method] ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
    await ctx.close();
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[shots-method] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
