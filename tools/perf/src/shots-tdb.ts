// pnpm shots:tdb: ảnh + kiểm hành vi túi đồ nhiều cửa sổ (TD-B): B+C cạnh nhau, tab, tìm, sắp xếp trước/sau, kéo thả (ô, trang, ô trang bị), tách chồng, khóa.
//   tsx src/shots-tdb.ts --out <thư mục> [--size 1280x720] [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), tắt tiếng (?mute=1, --mute-audio), một tài khoản thử, dựng cảnh bằng lệnh GM.
// Sắp xếp/khóa/tách cần server TD-A (INV_SORT/INV_LOCK/INV_SPLIT).
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-tdb'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-tdb', command: 'pnpm shots:tdb' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 700) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
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

const fails: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`[shots-tdb] ${ok ? 'OK ' : 'LỖI'} ${what}`);
  if (!ok) fails.push(what);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality','medium');" });
    const page = await ctx.newPage();
    const name = `Tdb${String(Date.now() % 10000)}`;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const w = (window as unknown as G).__game;
      return !!w && w.frames > 30 && !!w.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await clearIntro(page);
    const tag = `${VW}x${VH}`;
    const shot = async (file: string) => {
      await page.mouse.move(2, 2);
      await sleep(250);
      await page.screenshot({ path: path.join(OUT, `${file}-${tag}.png`) });
      console.log(`[shots-tdb] ${file}-${tag}`);
    };
    const cell = (slot: number) => page.locator(`.bag-cell[data-slot="${slot}"]`);
    const itemAt = (slot: number) => cell(slot).getAttribute('data-item');
    const bagIds = () => page.evaluate(() => [...document.querySelectorAll('.bag-cell')].map((e) => (e as HTMLElement).dataset.item ?? ''));
    const rect = async (sel: string) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error('không thấy ' + sel);
      return b;
    };
    const drag = async (from: string, to: string, shift = false) => {
      const a = await rect(from);
      const b = await rect(to);
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
      // Chromium headless không bắt đầu kéo khi Shift đã giữ từ lúc nhấn chuột; giữ Shift lúc thả (client đọc cả hai).
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
      await sleep(700);
    };

    await gm(page, 'level 16', 1200);
    await gm(page, 'god on', 600);
    // Túi lộn xộn: trang bị, đan, nguyên liệu xen kẽ, vài món trùng loại để sắp xếp gộp chồng.
    const gives: [string, number][] = [
      ['itm_linh_thao', 30], ['itm_thanh_phong_kiem', 1], ['itm_hoi_khi_dan', 20], ['itm_han_quang_kiem', 1], ['itm_nanh_soi', 12],
      ['itm_bo_y', 1], ['itm_linh_thao', 40], ['itm_pha_canh_dan', 3], ['itm_ngoc_boi', 1], ['itm_hoi_xuan_dan', 15],
      ['itm_huyet_linh_chi', 8], ['itm_huyen_thiet_gioi', 1], ['itm_hoi_khi_dan', 10], ['itm_yeu_dan', 6], ['itm_tram_ta_kiem', 1],
    ];
    for (const [id, n] of gives) await gm(page, `give ${id} ${n}`, 450);

    // ---- (1) B rồi C: hai bảng cạnh nhau
    await page.keyboard.press('KeyB');
    await sleep(500);
    await shot('01-bag');
    await page.keyboard.press('KeyC');
    await sleep(600);
    const bb = await rect('.win-host[data-id="bag"] .k-window');
    const cb = await rect('.win-host[data-id="char"] .k-window');
    check(cb.x + cb.width <= bb.x + 1, `B+C không chồng: nhân vật [${Math.round(cb.x)}..${Math.round(cb.x + cb.width)}] túi [${Math.round(bb.x)}..${Math.round(bb.x + bb.width)}]`);
    check(bb.x + bb.width <= VW && cb.x >= 0, 'cả hai nằm trong màn hình');
    await shot('02-bag-char');

    // Kéo thanh tiêu đề, tải lại giữ vị trí
    const head = await rect('.win-host[data-id="bag"] .k-head-title');
    await page.mouse.move(head.x + 10, head.y + 8);
    await page.mouse.down();
    await page.mouse.move(head.x + 10, head.y + 38, { steps: 6 });
    await page.mouse.up();
    await sleep(300);
    const bb2 = await rect('.win-host[data-id="bag"] .k-window');
    check(Math.abs(bb2.y - bb.y - 30) <= 4, `kéo tiêu đề dời ${Math.round(bb2.y - bb.y)} px`);
    const saved = await page.evaluate(() => localStorage.getItem('dtl.win.bag'));
    check(!!saved, 'vị trí lưu localStorage: ' + saved);
    // đưa trở lại và đóng/mở bằng Esc
    await page.mouse.move(head.x + 10, head.y + 38);
    await page.mouse.down();
    await page.mouse.move(head.x + 10, head.y + 8, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('KeyC');
    await sleep(300);
    check((await page.locator('.win-host[data-id="char"]').count()) === 0 && (await page.locator('.win-host[data-id="bag"]').count()) === 1, 'C tắt riêng, B còn');
    await page.keyboard.press('KeyC');
    await sleep(400);
    await page.locator('.win-host[data-id="bag"] .k-window').click({ position: { x: 20, y: 60 } });
    await sleep(200);
    const topId = await page.evaluate(() => document.querySelector('.win-host[data-top="1"]')?.getAttribute('data-id'));
    check(topId === 'bag', 'bấm vào túi thì túi lên trên cùng');
    await page.keyboard.press('Escape');
    await sleep(300);
    check((await page.locator('.win-host[data-id="bag"]').count()) === 0 && (await page.locator('.win-host[data-id="char"]').count()) === 1, 'Esc đóng cửa sổ trên cùng (túi), nhân vật còn');
    await page.keyboard.press('KeyB');
    await sleep(500);

    // ---- (3) tab, tìm, lọc
    const tabs: [string, string][] = [['Trang bị', '03-tab-trang-bi'], ['Đan dược', '04-tab-dan'], ['Nguyên liệu', '05-tab-nguyen-lieu']];
    for (const [label, file] of tabs) {
      await page.getByRole('tab', { name: label }).first().click();
      await sleep(350);
      const dimmed = await page.locator('.bag-cell[data-dim="1"]').count();
      const lit = await page.locator('.bag-cell:not([data-dim="1"])[data-item]').count();
      check(lit > 0 && dimmed > 0, `tab ${label}: ${lit} ô sáng, ${dimmed} ô mờ`);
      await shot(file);
    }
    const before = await bagIds();
    await page.getByRole('tab', { name: 'Tất cả' }).first().click();
    await page.locator('.bag-search').fill('kiem');
    await sleep(350);
    const lit = await page.locator('.bag-cell:not([data-dim="1"])[data-item]').count();
    check(lit >= 2 && JSON.stringify(await bagIds()) === JSON.stringify(before), `tìm "kiem" (không dấu): ${lit} ô sáng, vị trí không đổi`);
    await shot('06-tim-kiem');
    await page.locator('.bag-search').fill('');
    await sleep(200);

    // ---- sắp xếp trước/sau: rải đồ lộn xộn qua các ô và trang bằng kéo thả, thêm một chồng nhỏ trùng loại
    await gm(page, 'give itm_linh_thao 5', 500);
    for (const [from, to] of [[0, 9], [1, 14], [2, 22], [3, 27], [4, 3]]) await drag(`.bag-cell[data-slot="${from}"]`, `.bag-cell[data-slot="${to}"]`);
    await shot('07-truoc-sap-xep');
    await page.getByRole('button', { name: /Sắp xếp/ }).click();
    await sleep(1200);
    const after = await bagIds();
    const firstEmpty = after.indexOf('');
    check(after.slice(firstEmpty).every((x) => x === ''), `sau sắp xếp ô trống dồn cuối (${firstEmpty} ô có đồ, trước ${before.filter(Boolean).length})`);
    check(after[0] === 'itm_tram_ta_kiem' || after[0] === 'itm_han_quang_kiem', 'trang bị phẩm cao đứng đầu: ' + after[0]);
    await shot('08-sau-sap-xep');

    // ---- kéo thả giữa ô
    const a0 = await itemAt(0);
    const a5 = await itemAt(5);
    await drag('.bag-cell[data-slot="0"]', '.bag-cell[data-slot="5"]');
    check((await itemAt(0)) === a5 && (await itemAt(5)) === a0, `kéo ô 0 → ô 5 đổi chỗ (${a0} ↔ ${a5})`);
    await shot('09-keo-tha-o');
    // sang trang khác: thả lên số trang 2
    const mover = await itemAt(5);
    await drag('.bag-cell[data-slot="5"]', '.bag-page >> nth=1');
    await page.locator('.bag-page').nth(1).click();
    await sleep(400);
    check((await page.locator('.bag-cell[data-slot="30"]').getAttribute('data-item')) === mover, `thả lên số trang 2 → ô 30 có ${mover}`);
    await shot('10-trang-2');
    await page.locator('.bag-page').first().click();
    await sleep(300);

    // ---- mặc bằng kéo vào ô trang bị (mở lại C)
    if ((await page.locator('.win-host[data-id="char"]').count()) === 0) await page.keyboard.press('KeyC');
    await sleep(600);
    const swordSlot = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.bag-cell')].find((e) => ['itm_thanh_phong_kiem', 'itm_han_quang_kiem', 'itm_tram_ta_kiem'].includes((e as HTMLElement).dataset.item ?? ''));
      return c ? Number((c as HTMLElement).dataset.slot) : -1;
    });
    const sword = await itemAt(swordSlot);
    const eq = page.locator('.win-host[data-id="char"] .equip-cell').first();
    const eb = (await eq.boundingBox())!;
    const sb = (await cell(swordSlot).boundingBox())!;
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 - 10, sb.y + sb.height / 2 + 6, { steps: 4 });
    await shot('11-keo-len-o-trang-bi');
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 3, { steps: 12 });
    await page.mouse.up();
    await sleep(900);
    const worn = await page.evaluate(() => document.querySelector('.win-host[data-id="char"] .equip-cell .k-slot')?.getAttribute('aria-label') ?? '');
    check(worn !== '' && !/trống/i.test(worn), `thả lên ô trang bị → đã mặc (${worn}; ${sword})`);
    await shot('12-sau-khi-mac');

    // ---- tách chồng (Shift+kéo): chồng ≥ 2 vào ô trống
    const stack = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.bag-cell[data-n]')].find((e) => Number((e as HTMLElement).dataset.n) >= 4);
      return c ? { slot: Number((c as HTMLElement).dataset.slot), n: Number((c as HTMLElement).dataset.n), id: (c as HTMLElement).dataset.item! } : null;
    });
    if (stack) {
      const empty = await page.evaluate(() => Number([...document.querySelectorAll('.bag-cell:not([data-item])')][0].getAttribute('data-slot')));
      await drag(`.bag-cell[data-slot="${stack.slot}"]`, `.bag-cell[data-slot="${empty}"]`, true);
      check((await page.locator('.k-modal').count()) === 1, 'Shift+kéo mở hộp hỏi số lượng');
      await shot('13-tach-chong-hoi');
      await page.locator('.k-modal input[type="number"]').fill('3');
      await page.locator('.k-modal').getByRole('button', { name: 'Tách' }).click();
      await sleep(900);
      check((await cell(empty).getAttribute('data-n')) === '3' && (await cell(stack.slot).getAttribute('data-n')) === String(stack.n - 3), `tách 3 từ ${stack.id}: ô ${empty}=3, ô ${stack.slot}=${stack.n - 3}`);
      await shot('14-sau-tach');
      // ---- khóa bằng Ctrl+click
      await page.keyboard.down('Control');
      await cell(empty).click();
      await page.keyboard.up('Control');
      await sleep(700);
      check((await cell(empty).getAttribute('data-locked')) === '1', 'Ctrl+click khóa ô');
      await shot('15-khoa');
    } else check(false, 'không có chồng ≥ 4 để thử tách');

    // ---- chuột phải dùng đan
    const pill = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.bag-cell[data-item="itm_hoi_khi_dan"]')][0] as HTMLElement | undefined;
      return c ? { slot: Number(c.dataset.slot), n: Number(c.dataset.n) } : null;
    });
    if (pill) {
      await cell(pill.slot).click({ button: 'right' });
      await sleep(900);
      const n2 = await cell(pill.slot).getAttribute('data-n');
      check(Number(n2) === pill.n - 1, `chuột phải dùng đan: ${pill.n} → ${n2}`);
    }

    if (errors.length) console.log('[shots-tdb] lỗi console:', [...new Set(errors)]);
    check(errors.filter((e) => !/WebGPU|GPU stall|favicon/i.test(e)).length === 0, 'không có lỗi console');
  } finally {
    await browser.close();
    dev.stop();
  }
  if (fails.length) {
    console.error('[shots-tdb] THẤT BẠI:\n - ' + fails.join('\n - '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
