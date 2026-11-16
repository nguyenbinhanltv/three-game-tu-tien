// pnpm shots:e3h: playtest chuỗi nhiệm vụ chương 3 (E3-H) bằng /gm + ảnh hộp thoại, NPC, thẻ chương, thần thức. GPU thật, tắt tiếng.
//   tsx src/shots-e3h.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Đi: Tô Vãn Ngư (Hạ Khuyết Trạm) giao q3_len_may, nhận là mở trận → Truyền Tống Trận vh_tp_hub thật → thẻ chương 3 →
// Lâm Chiếu Dung, Tô Vãn Ngư ở Phù Đảo Các → chuỗi nhiệm vụ (sự kiện /gm qev cho kill/dungeon) → thần thức giữ V (scan) → q3_nguyen_anh.
// Cần level van_hai (PR #148 E3-A). Ghi log ra e3h-log.json. Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2638/5238); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3h'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2638);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5238);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3h', command: 'pnpm shots:e3h' });
type G = { __game?: Record<string, any> };
const renderQ = RENDERER === 'webgl2' ? '&renderer=webgl2' : '';

/** Chat bị giãn (≥ ~1 s giữa hai tin) nên mỗi lệnh /gm chờ 1,3 s sau khi gửi. */
const gm = async (page: Page, m: string) => {
  await page.evaluate((x) => (window as unknown as G).__game!.send('chat', { m: x }), m);
  await sleep(1300);
};
const send = (page: Page, type: string, msg?: unknown) => page.evaluate(([t, m]) => (window as unknown as G).__game!.send(t as string, m), [type, msg] as const);
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 85 });
const text = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => (e as HTMLElement).innerText).join(' | '), sel);
/** Quay camera về phía +z (NPC đứng phía nam người chơi), để NPC nằm trước mặt. */
const faceSouth = (page: Page) => page.evaluate(() => { (window as unknown as G).__game!.camYaw = Math.PI; (window as unknown as G).__game!.camDist = 7; (window as unknown as G).__game!.camDistCur = 7; });
const where = (page: Page) => page.evaluate(() => { const g = (window as unknown as G).__game!; return { level: g.view?.level, x: Math.round(g.cur?.x), z: Math.round(g.cur?.z) }; });

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
    const name = 'Ch3' + (Date.now() % 100000);
    await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&realm=tc1&god=1${renderQ}`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
    await sleep(2000);
    const talk = async (label: string, shotName: string) => {
      await page.evaluate(() => (window as unknown as G).__game!.interact());
      await sleep(800);
      await shot(page, shotName);
      log[label] = { npcText: await text(page, '.npc-quests') };
    };
    const done = async (...ids: string[]) => {
      for (const id of ids) await gm(page, `/gm qdone ${id}`);
    };

    // 1) Hạ Khuyết Trạm: Tô Vãn Ngư giao q3_len_may (cần Kết Đan xong), nhận là mở trận Phù Đảo Các.
    await gm(page, '/gm tele dm_tp_tram');
    await gm(page, '/gm tp dm_tram');
    await sleep(6000);
    await gm(page, '/gm level 20');
    await done('q_truc_co', 'chuong2', 'q2_ket_dan', 's2_thu_nghiem');
    await gm(page, '/gm tp 1010 1044');
    await faceSouth(page);
    await sleep(2500);
    await talk('toVanNguDoanMach', '01-to-van-ngu-giao-q3-len-may');
    await send(page, 'q', { a: 'accept', id: 'q3_len_may' });
    await sleep(900);
    await shot(page, '02-da-nhan-mo-tran-phu-dao-cac');
    log.afterAccept = { tracker: await text(page, '.tracker') };
    await page.keyboard.press('Escape');

    // 2) Truyền Tống Trận thật tới Phù Đảo Các.
    await gm(page, '/gm tele cd');
    await send(page, 'tele', { id: 'vh_tp_hub' });
    await page.waitForFunction(() => (window as unknown as G).__game!.view?.level === 'van_hai', undefined, { timeout: 60_000, polling: 300 });
    log.arrive = await where(page);
    await sleep(900);
    await page.waitForSelector('.chapter-card', { timeout: 15_000 }).catch(() => undefined);
    await sleep(1300);
    await shot(page, '03-the-chuong-3-van-hai');
    await sleep(4000);

    // 3) Lâm Chiếu Dung, Tô Vãn Ngư ở Phù Đảo Các.
    await gm(page, '/gm tp 1050 1051');
    await faceSouth(page);
    await sleep(9000);
    await shot(page, '04-phu-dao-cac-npc');
    await talk('lamChieuDung', '05-lam-chieu-dung-hop-thoai');
    await send(page, 'q', { a: 'turnin', id: 'q3_len_may' });
    await sleep(900);
    await shot(page, '06-lam-chieu-dung-tra-q3-len-may');
    await send(page, 'q', { a: 'accept', id: 'q3_van_hac' });
    await sleep(600);
    await send(page, 'q', { a: 'accept', id: 's3_bich_ngoc' });
    await sleep(600);
    log.afterTurnin = { tracker: await text(page, '.tracker') };
    await shot(page, '07-lam-chieu-dung-nhiem-vu-tiep');
    await page.keyboard.press('Escape');
    await gm(page, '/gm tp 1002 1051');
    await faceSouth(page);
    await sleep(2000);
    await shot(page, '08-to-van-ngu-phu-dao-cac');

    // 4) kill bằng sự kiện GM, trả, rồi nhiệm vụ thần thức.
    await gm(page, '/gm tp 1050 1051');
    await sleep(1200);
    await gm(page, '/gm qev kill mon_van_hac 14');
    await send(page, 'q', { a: 'turnin', id: 'q3_van_hac' });
    await sleep(900);
    await gm(page, '/gm tp 1002 1051');
    await sleep(1000);
    await send(page, 'q', { a: 'accept', id: 'q3_than_thuc' });
    await sleep(800);
    await shot(page, '09-q3-than-thuc-muc-tieu');
    await page.keyboard.press('Escape');

    // 5) Thần thức (giữ V, `/gm cd` xóa hồi): quét ba điểm đảo thật.
    for (const [x, z, n] of [[655, 1285, 'phu-dao-dinh'], [1428, 1225, 'cau-xich-may'], [1168, 1565, 'kinh-ho-dai']] as const) {
      await gm(page, `/gm tp ${x} ${z}`);
      await sleep(2500);
      await gm(page, '/gm cd');
      await page.keyboard.down('KeyV');
      await sleep(3000);
      await page.keyboard.up('KeyV');
      await sleep(900);
      await shot(page, `10-than-thuc-${n}`);
      await sleep(3200);
    }
    log.scan = { tracker: await text(page, '.tracker') };

    // 6) Kính Nguyệt Cung (sự kiện dungeon, chờ E3-M), Kình Vương, Nguyên Anh.
    await gm(page, '/gm tp 1050 1051');
    await sleep(1200);
    await done('q3_than_thuc', 'q3_kinh_linh', 'q3_thach_quy', 'q3_loi_van');
    await gm(page, '/gm level 23');
    await send(page, 'q', { a: 'accept', id: 'q3_kinh_nguyet' });
    await sleep(600);
    await gm(page, '/gm qev dungeon kinh_nguyet_cung 1');
    await sleep(600);
    await shot(page, '11-q3-kinh-nguyet-xong-muc-tieu');
    await send(page, 'q', { a: 'turnin', id: 'q3_kinh_nguyet' });
    await sleep(600);
    await send(page, 'q', { a: 'accept', id: 'q3_kinh_vuong' });
    await sleep(600);
    await gm(page, '/gm qev kill boss_van_hai_kinh_vuong 1');
    await send(page, 'q', { a: 'turnin', id: 'q3_kinh_vuong' });
    await sleep(800);
    await send(page, 'q', { a: 'accept', id: 'q3_nguyen_anh' });
    await sleep(800);
    await shot(page, '12-q3-nguyen-anh-muc-tieu');
    log.nguyenAnh = { tracker: await text(page, '.tracker') };
    await page.keyboard.press('Escape');
    log.errors = [...new Set(errors)];
    fs.writeFileSync(path.join(OUT, 'e3h-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e3h] lỗi console:\n' + [...new Set(errors)].join('\n'));
    await ctx.close();
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
