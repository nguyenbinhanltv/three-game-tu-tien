// pnpm shots:e3h2: playtest hai nhiệm vụ phụ chương 3 (E3-H2): s3_do_thuyen (hộ tống Lâm Chiếu Dung qua ba đảo) và s3_guong_nuoc (bốn mảnh gương ở Kính Hồ Đài).
//   tsx src/shots-e3h2.ts --out <thư mục tuyệt đối> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2698/5298); luôn ?mute=1 và --mute-audio. Ghi log ra e3h2-log.json.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3h2'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2698);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5298);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3h2', command: 'pnpm shots:e3h' });
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
/** Phù Đảo Các: NPC quay mặt về −z, nên camera đứng phía bắc nhìn về +z để thấy mặt NPC (người chơi đứng lệch sang bên, không che). */
const faceNpc = (page: Page) => page.evaluate(() => { (window as unknown as G).__game!.camYaw = Math.PI; (window as unknown as G).__game!.camDist = 2.4; (window as unknown as G).__game!.camDistCur = 2.4; });
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
    const name = 'Ch3b' + (Date.now() % 100000);
    await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&realm=tc1&god=1${renderQ}`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
    await sleep(2000);
    const done = async (...ids: string[]) => {
      for (const id of ids) await gm(page, `/gm qdone ${id}`);
    };
    const talk = async (label: string, shotName: string) => {
      await page.evaluate(() => (window as unknown as G).__game!.interact());
      await sleep(800);
      await shot(page, shotName);
      log[label] = { npcText: await text(page, '.npc-quests') };
    };
    const escortPos = () => page.evaluate(() => { const e = (window as any).__game.ents.escorts.get('esc_do_thuyen'); return e ? { x: e.x as number, z: e.z as number } : null; });

    // Vào thẳng Vân Hải với các nhiệm vụ trước đã xong (q3_len_may, q3_than_thuc).
    await gm(page, '/gm level 22');
    await done('q_truc_co', 'chuong2', 'q2_ket_dan');
    await gm(page, '/gm tele vh_tp_hub');
    await gm(page, '/gm tp vh_hub');
    await sleep(5000);
    await done('q3_len_may', 'q3_van_hac', 'q3_than_thuc');

    // 1) Lâm Chiếu Dung giao hai nhiệm vụ phụ.
    await gm(page, '/gm tp 1048 1053.5');
    await faceNpc(page);
    await sleep(3000);
    await talk('lamChieuDung', '01-lam-chieu-dung-hai-nhiem-vu-phu');
    await send(page, 'q', { a: 'accept', id: 's3_do_thuyen' });
    await sleep(700);
    await send(page, 'q', { a: 'accept', id: 's3_guong_nuoc' });
    await sleep(700);
    await page.keyboard.press('Escape');
    await sleep(500);
    log.tracker = await text(page, '.tracker');
    await shot(page, '02-theo-doi-nhiem-vu');

    /** Quay camera nhìn về phía người đồng hành (hướng nhìn của camera = (−sin yaw, −cos yaw)). */
    const aim = async (dist = 6) => {
      const e = await escortPos();
      await page.evaluate(([ex, ez, d]) => { const g = (window as any).__game; const dx = ex - g.cur.x, dz = ez - g.cur.z; g.camYaw = Math.atan2(-dx, -dz); g.camDist = d; g.camDistCur = d; }, [e?.x ?? 0, e?.z ?? 0, dist] as const);
      await sleep(700);
    };
    // 2) Hộ tống: Lâm Chiếu Dung đi từ cạnh Phù Đảo Các, người chơi theo sát.
    await gm(page, '/gm tp 1066 1066');
    await page.evaluate(() => { const g = (window as any).__game; g.camYaw = Math.PI * 1.25; g.camDist = 7; g.camDistCur = 7; });
    await sleep(2500);
    log.escortStart = await escortPos();
    await aim(5);
    await shot(page, '03-ho-tong-xuat-phat');
    const follow = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const e = await escortPos();
        if (e) await gm(page, `/gm tp ${Math.round(e.x - 4)} ${Math.round(e.z)}`);
        else await sleep(1300);
      }
    };
    await follow(14);
    log.escortMid = await escortPos();
    await aim(7);
    await shot(page, '04-ho-tong-tren-cau-xich');
    await follow(10);
    await aim(7);
    await shot(page, '05-ho-tong-sang-dao');
    log.afterEscortTracker = await text(page, '.tracker');

    // 3) Gương nước: bốn mảnh quanh Kính Hồ Đài.
    const spots: [number, number][] = [[1128, 1548], [1208, 1536], [1214, 1606], [1132, 1600]];
    await gm(page, '/gm tp 1110 1525');
    await page.evaluate(() => { const g = (window as any).__game; g.camYaw = Math.PI; g.camDist = 9; g.camDistCur = 9; });
    await sleep(2500);
    await shot(page, '06-kinh-ho-dai-truoc-khi-cham');
    for (let i = 0; i < spots.length; i++) {
      await gm(page, `/gm tp ${spots[i][0]} ${spots[i][1]}`);
      await sleep(1500);
      if (i === 1) await shot(page, '07-cham-manh-guong');
    }
    await shot(page, '08-du-bon-manh-guong');
    log.afterMirror = await text(page, '.tracker');
    log.errors = [...new Set(errors)];
    fs.writeFileSync(path.join(OUT, 'e3h2-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e3h2] lỗi console:', [...new Set(errors)]);
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
