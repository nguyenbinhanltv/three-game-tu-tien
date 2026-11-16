// pnpm shots:e2h: playtest chuỗi nhiệm vụ chương 2 (E2-H) bằng /gm + ảnh hộp thoại, NPC, thẻ chương, hộ tống, thần thức. GPU thật, tắt tiếng.
//   tsx src/shots-e2h.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Đi: Lạc Vân nhận thư → Truyền Tống Trận dm_tp_tram thật (niệm 5 s, đổi room) → thẻ chương 2 → Tô Vãn Ngư, Hứa lão, Khưu Hàn Sơn →
// chạm Mạch Tinh Trụ (touch) → hộ tống thương nhân (escort) → thần thức giữ phím V (scan). Ghi log tiến độ nhiệm vụ ra e2h-log.json.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2628/5228); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e2h'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2628);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5228);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2h', command: 'pnpm shots:e2h' });
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
    const name = 'Ch2' + (Date.now() % 100000);
    await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&realm=tc1&god=1${renderQ}`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
    await sleep(2000);

    // 1) Lạc Vân chân nhân: nhận "Thư Từ Chưởng Môn", trận Hạ Khuyết Trạm mở.
    await gm(page, '/gm qdone q_truc_co');
    await gm(page, '/gm tp 2048 2033');
    await sleep(1500);
    await page.evaluate(() => (window as unknown as G).__game!.interact());
    await sleep(800);
    await shot(page, '01-lac-van-thu-chuong-2');
    await send(page, 'q', { a: 'accept', id: 'q2_thu_ha_son' });
    await sleep(900);
    await shot(page, '02-da-nhan-thu-mo-tran');
    await page.keyboard.press('Escape');
    log.afterAccept = { tracker: await text(page, '.tracker') };

    // 2) Truyền Tống Trận thật tới Hạ Khuyết Trạm.
    await gm(page, '/gm tele cd');
    await send(page, 'tele', { id: 'dm_tp_tram' });
    await page.waitForFunction(() => (window as unknown as G).__game!.view?.level === 'doan_mach', undefined, { timeout: 60_000, polling: 300 });
    log.arrive = await where(page);
    await sleep(900);
    await page.waitForSelector('.chapter-card', { timeout: 15_000 }).catch(() => undefined);
    await sleep(1300);
    await shot(page, '03-the-chuong-2-doan-mach');
    await sleep(4000);

    // 3) Tô Vãn Ngư: gặp, trả thư.
    await gm(page, '/gm tp 1011 1044');
    await faceSouth(page);
    await sleep(2500);
    await shot(page, '04-ha-khuyet-tram-npc');
    if (opt('--stop', '') === '04') return;
    await page.evaluate(() => (window as unknown as G).__game!.interact());
    await sleep(700);
    await shot(page, '05-to-van-ngu-tra-thu');
    await send(page, 'q', { a: 'turnin', id: 'q2_thu_ha_son' });
    await sleep(900);
    await shot(page, '06-to-van-ngu-nhiem-vu-tiep');
    log.afterTurnin = { tracker: await text(page, '.tracker'), npcText: await text(page, '.npc-quests') };
    await send(page, 'q', { a: 'accept', id: 'q2_mach_tinh' });
    await sleep(500);
    await page.keyboard.press('Escape');

    // 4) touch: Mạch Tinh Trụ (xong phần giết bằng sự kiện GM).
    await gm(page, '/gm tp 1277 1197');
    await sleep(2500);
    log.touch = { tracker: await text(page, '.tracker') };
    await shot(page, '07-mach-tinh-tru-touch');

    // 5) Hứa lão: hộp thoại có tab Chế tạo / Thăng Bậc (đồ bậc 2 của E2-F).
    await gm(page, '/gm tp 1038 1043');
    await faceSouth(page);
    await sleep(2000);
    await page.evaluate(() => (window as unknown as G).__game!.interact());
    await sleep(700);
    await shot(page, '08-hua-lao-hop-thoai');
    for (const label of ['Chế tạo', 'Thăng Bậc']) {
      const tab = page.getByRole('tab', { name: label });
      if (await tab.count()) {
        await tab.first().click();
        await sleep(600);
        await shot(page, label === 'Chế tạo' ? '09-hua-lao-che-tao' : '10-hua-lao-thang-bac');
      }
    }
    await page.keyboard.press('Escape');

    // 6) Hộ tống thương nhân: nhận ở Hứa lão rồi đi cùng tới Cầu Đá Gãy (người chơi trượt theo vị trí người đồng hành mỗi giây).
    await gm(page, '/gm level 17');
    await send(page, 'q', { a: 'accept', id: 's2_ho_tong' });
    await sleep(1500);
    await gm(page, '/gm tp 1042 1046');
    await sleep(1500);
    await shot(page, '11-ho-tong-bat-dau');
    const escortPos = () => page.evaluate(() => { const e = [...((window as unknown as G).__game!.ents.escorts?.values?.() ?? [])][0] as { x: number; z: number } | undefined; return e ? { x: e.x, z: e.z } : null; });
    let shots = 0;
    for (let i = 0; i < 200; i++) {
      const e = await escortPos();
      if (!e) {
        if (i > 4) break;
        await sleep(500);
        continue;
      }
      await gm(page, `/gm tp ${Math.round(e.x)} ${Math.round(e.z - 4)}`);
      if (i === 0) await faceSouth(page);
      if (i % 15 === 8 && shots < 3) await shot(page, `12-ho-tong-giua-duong-${++shots}`);
      await sleep(1000);
    }
    await sleep(1500);
    await shot(page, '13-ho-tong-xong');
    log.escort = { tracker: await text(page, '.tracker'), still: await escortPos() };

    // 7) Khưu Hàn Sơn ở Cựu Mỏ Khu.
    await gm(page, '/gm tp 752 957');
    await faceSouth(page);
    await sleep(2500);
    await shot(page, '14-khuu-han-son-npc');
    await page.evaluate(() => (window as unknown as G).__game!.interact());
    await sleep(700);
    await shot(page, '15-khuu-han-son-hop-thoai');
    await page.keyboard.press('Escape');

    // 8) Thần thức (giữ V 2,5 s, hồi 20 s; `/gm cd` xóa hồi giữa các điểm) từ Kết Đan: s2_thu_nghiem.
    await gm(page, '/gm level 20');
    await gm(page, '/gm qdone q2_thu_ha_son');
    await gm(page, '/gm tp 1011 1044');
    await sleep(1500);
    await send(page, 'q', { a: 'accept', id: 's2_thu_nghiem' });
    await sleep(500);
    for (const [x, z, n] of [[1279, 1190, 'mach-tinh-tru'], [954, 1514, 'ho-sa-lun'], [586, 940, 'cong-mo']] as const) {
      await gm(page, `/gm tp ${x} ${z}`);
      await sleep(2200);
      await gm(page, '/gm cd');
      await page.keyboard.down('KeyV');
      await sleep(3000);
      await page.keyboard.up('KeyV');
      await sleep(900);
      await shot(page, `16-than-thuc-${n}`);
      await sleep(3200);
    }
    log.scan = { tracker: await text(page, '.tracker') };
    log.errors = [...new Set(errors)];
    fs.writeFileSync(path.join(OUT, 'e2h-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e2h] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
