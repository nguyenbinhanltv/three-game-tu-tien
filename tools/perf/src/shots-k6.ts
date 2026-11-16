// pnpm shots:k6: ảnh trong game của hệ animation K-4 (máy trạng thái chiêu, lớp thân trên/dưới, hủy thu về, lao người, trúng đòn có hướng, ngã/đứng dậy).
//   tsx src/shots-k6.ts --out <thư mục> [--genders m,f] [--only combo,skill,dashcancel,movecancel,locomotion,hit,knockdown] [--renderer webgpu|webgl2]
// Vào game bằng tài khoản thử (nam/nữ), dựng cảnh bằng lệnh GM, làm từng kịch bản và ghi màn hình bằng CDP screencast (khung dày, có dấu thời gian):
// mỗi tờ ảnh là một kịch bản, mỗi ô ghi số ms thật kể từ lúc bấm; viền đỏ = khung có sự kiện `hit` (đúng khung hitAt). Cùng lúc ghi `skill-events.json`
// (nhật ký sự kiện chiêu của game: kind, mốc, thời điểm).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175); luôn ?mute=1 và --mute-audio; GPU thật.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-k6'));
const GENDERS = opt('--genders', 'm,f').split(',');
const ONLY = opt('--only', 'kiem,hophap,dansu,vetkiem,combo,vachbao,hotheb').split(',');
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const SC_DIST = Number(opt('--dist', '3.2'));
/** Thời gian game / thời gian thật (bản dev `?slowmo=`): chụp chậm để khung screencast (~12/s) khớp mốc game. */
const SLOW0 = Number(opt('--slow', '0.25'));
let SLOW = SLOW0;
/** Mỗi ô cách nhau bấy nhiêu ms thời gian game. */
const TILE = Number(opt('--tile', '50'));
const TILE_REAL = 80;
const gs = (ms: number) => ms / SLOW;
let SHEET: BrowserContext | null = null;

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-k6', command: 'pnpm shots:k6' });
type G = { __game?: Record<string, any> };
type Ev = { sid: string; e: { kind: string; index: number; combo: number; t: number; skill: string; kb: boolean }; at: number };
const log: Record<string, unknown> = {};
/** Ghép tờ ảnh hoãn tới sau khi ghi xong (mở tab mới trong lúc ghi làm tab game đổi cỡ khung). */
const jobs: (() => Promise<void>)[] = [];
const cdps = new Map<Page, Awaited<ReturnType<BrowserContext['newCDPSession']>>>();

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const cam = (page: Page, yaw: number, pitch: number, dist: number) =>
  page.evaluate(([y, p, d]) => {
    const g = (window as unknown as G).__game!;
    g.camYaw = y;
    g.camPitch = p;
    g.camDist = d;
    g.camDistCur = d;
  }, [yaw, pitch, dist] as const);

/**
 * Camera cận cảnh góc 3/4 ngang hông: cách nhân vật `dist` m, pitch thấp, nhìn lệch ~50° so với hướng nhìn của người chơi (hoặc vuông góc với
 * đường tới con sói gần nhất nếu có, để thấy cả người lẫn đối thủ). Gọi sau khi nhân vật đã quay mặt vào việc sắp làm.
 */
async function closeCam(page: Page, dist = 3.4): Promise<void> {
  await page.evaluate((d) => {
    const g = (window as unknown as G).__game!;
    let yaw = g.cur.yaw as number;
    let near: { x: number; z: number } | null = null;
    let best = 1e9;
    for (const m of g.view.monsters.values()) {
      const dd = Math.hypot(m.x - g.cur.x, m.z - g.cur.z);
      if (m.st !== 3 && dd < best) {
        best = dd;
        near = m;
      }
    }
    // Hướng nhìn dự kiến: về phía sói nếu có (người chơi sẽ quay mặt vào nó khi ra chiêu).
    if (near) yaw = Math.atan2(near.x - g.cur.x, near.z - g.cur.z);
    g.camYaw = yaw + 0.9;
    g.camPitch = 0.08;
    g.camDist = d;
    g.camDistCur = d;
  }, dist);
  await sleep(700);
}

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

async function sheet(ctx: BrowserContext, file: string, title: string, shots: { label: string; url: string; mark?: boolean }[], per = 6): Promise<void> {
  // Ghép ảnh ở context riêng, sau khi mọi kịch bản xong: mở tab trong context game làm khung game co lại (ảnh nửa đen).
  if (SHEET && ctx !== SHEET) {
    jobs.push(() => sheet(SHEET!, file, title, shots, per));
    return;
  }
  // Ảnh khung đầy đủ từng ô (xem cận, kiểm lóa/che): frames/<tên tờ>/<nhãn>.jpg
  const dir = path.join(path.dirname(file), 'frames', path.basename(file, '.png'));
  fs.mkdirSync(dir, { recursive: true });
  shots.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}-${s.label.replace(/[^0-9a-z]+/gi, '_')}.jpg`), Buffer.from(s.url.split(',')[1], 'base64')));
  const p = await ctx.newPage();
  const rows: (typeof shots)[] = [];
  for (let i = 0; i < shots.length; i += per) rows.push(shots.slice(i, i + per));
  // Cắt cận quanh nhân vật (khung game 1100×900, nhân vật ở giữa hơi thấp): vùng 500×440 từ (300, 330).
  const CW = 500;
  const CH = 440;
  const cell = Math.min(360, Math.floor(1800 / Math.min(per, shots.length)));
  const z = cell / CW;
  const html = `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui"><div style="padding:8px 12px;font-size:15px;color:#d8b36a">${title}</div>${rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:flex-start">${r
          .map(
            (s) =>
              `<figure style="margin:2px;width:${cell}px"><div style="width:${cell}px;height:${Math.round(CH * z)}px;overflow:hidden;${s.mark ? 'outline:3px solid #d85a46' : ''}"><img src="${s.url}" style="display:block;width:${Math.round(1100 * z)}px;margin-left:${-Math.round(300 * z)}px;margin-top:${-Math.round(330 * z)}px"></div><figcaption style="padding:2px 4px">${s.label}</figcaption></figure>`,
          )
          .join('')}</div>`,
    )
    .join('')}</body>`;
  await p.setViewportSize({ width: Math.min(per, shots.length) * (cell + 4) + 8, height: 800 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
  console.log(`[shots-k6] ${path.basename(file)}`);
}

/** Chạy `act` (bắt đầu bằng mốc 0 ms) trong khi ghi màn hình, trả các ô cách nhau TILE ms và nhật ký sự kiện chiêu. */
async function record(ctx: BrowserContext, page: Page, spanGame: number, act: () => Promise<void>): Promise<{ shots: { label: string; url: string; mark?: boolean }[]; events: { ms: number; kind: string; index: number; combo: number; t: number }[] }> {
  // Ghép tờ ảnh mở tab khác: đưa tab game ra trước, tab nền bị hãm khung và screencast ra ảnh sai cỡ.
  await page.bringToFront();
  await sleep(400);
  await page.evaluate(() => ((window as unknown as G).__game!.skillLog.length = 0));
  // Mỗi phiên game chỉ ghi một lần (ghi lại trên cùng tab làm khung screencast co nhỏ), nên không cần gỡ listener.
  const cdp = (cdps.get(page) ?? (await ctx.newCDPSession(page)));
  cdps.set(page, cdp);
  const frames: { at: number; data: string }[] = [];
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    frames.push({ at: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1 });
  await sleep(300);
  const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
  const t0p = await page.evaluate(() => performance.now());
  const span = gs(spanGame);
  await act();
  const elapsed = (await page.evaluate(() => performance.now())) - t0p;
  await sleep(Math.max(0, span - elapsed));
  await cdp.send('Page.stopScreencast');
  log[`burst-${Date.now()}`] = ((await page.evaluate(`window.__game.skillFx.log.filter((x) => x.kind === 'burst').slice(-6)`)) as { skill: string; t: number }[]).map((x) => `${x.skill}: lõi nổ lệch hitAt ${Math.round(x.t * 1000)} ms`);
  const evs = (await page.evaluate(() => (window as unknown as G).__game!.skillLog as Ev[])) as Ev[];
  const events = evs.map((x) => ({ ms: Math.round((x.at - t0p) * SLOW), kind: x.e.kind, index: x.e.index, combo: x.e.combo, t: Math.round(x.e.t * 1000) / 1000 }));
  const hitMs = events.filter((e) => e.kind === 'hit').map((e) => e.ms);
  const shots: { label: string; url: string; mark?: boolean }[] = [];
  const step = SLOW < 1 ? TILE : TILE_REAL;
  for (let g = 0; g <= spanGame; g += step) {
    const ms = gs(g);
    const f = frames.reduce<{ at: number; data: string } | null>((b, x) => (!b || Math.abs(x.at - t0 - ms) < Math.abs(b.at - t0 - ms) ? x : b), null);
    if (!f) continue;
    const real = Math.round(f.at - t0);
    if (Math.abs(real - ms) > 90) continue;
    const game = Math.round(real * SLOW);
    const isHit = hitMs.some((h) => Math.abs(h - game) <= (SLOW < 1 ? TILE : TILE_REAL) / 2 + 5);
    shots.push({ label: `${game} ms${isHit ? ' · hit' : ''}`, url: 'data:image/jpeg;base64,' + f.data, mark: isHit });
  }
  return { shots, events };
}

const hasWolf = (page: Page) => page.evaluate(() => [...(window as unknown as G).__game!.view.monsters.values()].some((m: { st: number }) => m.st !== 3));

async function scene(page: Page, wolves = 1): Promise<void> {
  await gm(page, 'killall', 900);
  // Đồ rơi từ xác sói nằm lại vài giây (viên bát diện trắng gần camera làm ảnh khó đọc): chờ tan.
  if (wolves > 0) await sleep(9000);
  await gm(page, 'heal', 600);
  await gm(page, 'cd', 600);
  if (wolves > 0) await gm(page, `spawn mon_soi_xam ${wolves}`, 1700);
  await page.evaluate(() => {
    const g = (window as unknown as G).__game!;
    g.clearTarget();
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const sheetCtx = await browser.newContext({ viewport: { width: 1800, height: 800 } });
  SHEET = sheetCtx;
  try {
    for (const g of GENDERS) for (const sc of ONLY) {
      // Mỗi kịch bản một phiên game mới: tab dùng lại cho khung screencast co nhỏ sau lần ghi đầu.
      // Chỉ cảnh chiêu/vệt kiếm chụp chậm; vạch báo và linh quang chạy thời gian thật.
      SLOW = ['kiem', 'hophap', 'dansu'].includes(sc) ? SLOW0 : 1;
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
      const page = await ctx.newPage();
      const name = `K6${g}${String(Date.now() % 10000)}`;
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${opt('--query', '')}${SLOW < 1 ? '&slowmo=' + SLOW : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 12', 1600);
      await gm(page, 'god on', 1600);
      const METHOD = sc === 'hophap' ? 'bat_dong_kim_than' : sc === 'dansu' ? 'thanh_moc_dan_kinh' : 'lac_kiem_quyet';
      await gm(page, `method ${METHOD} 5`, 1200);
      await gm(page, 'tp 2048 2088', 1600);
      // Chờ thư viện K-3 nạp lười xong (đi lùi/ngang, thủ thế, trúng đòn có hướng, ngã/đứng dậy).
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game!;
        const m = g.ents?.players.get(g.sid)?.model;
        return !!m && m.dirHits === true;
      }, undefined, { timeout: 60_000, polling: 300 });
      const title = (s: string) => `${s} · ${g === 'm' ? 'Thanh Phong (nam)' : 'Lam Chi (nữ)'} · mỗi ô ${TILE} ms, viền đỏ = khung hit`;
      const out = (n: string) => path.join(OUT, `${g === 'm' ? 'nam' : 'nu'}-${n}.png`);
      const bar = (id: string) => page.evaluate((i) => (window as unknown as G).__game!.bar().findIndex((s: { id: string }) => s.id === i), id);
      const pressId = async (id: string) => {
        const i = await bar(id);
        if (i < 0) throw new Error('không thấy chiêu ' + id + ' trên thanh chiêu');
        await page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);
      };
      const press = (i: number) => page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);
      const ult = process.argv.includes('--ult');
      const chargeUlt = async () => {
        if (!ult) return;
        await gm(page, 'cd', 600);
        await page.evaluate(() => (window as unknown as G).__game!.useSkill(7));
      };
      void chargeUlt;

      if (sc === 'kiem') {
        // Kiếm tu: đòn thường, Kiếm Khí Trảm (slot 1), Phi Kiếm Truy Hồn (chiêu công pháp).
        await scene(page);
        await closeCam(page, SC_DIST);
        let r = await record(ctx, page, 1600, async () => press(0));
        await sheet(ctx, out('kiem-don-thuong'), title('Kiếm tu · đòn thường: tụ lực → bùng nổ → tan, vệt kiếm bám mũi'), r.shots, 10);
        log[`${g}-kiem-thuong`] = r.events;
        await scene(page);
        await closeCam(page, SC_DIST);
        r = await record(ctx, page, 1800, async () => press(1));
        await sheet(ctx, out('kiem-kiem-khi-tram'), title('Kiếm tu · Kiếm Khí Trảm'), r.shots, 10);
        log[`${g}-kiem-khi-tram`] = r.events;
        await scene(page);
        await closeCam(page, SC_DIST);
        r = await record(ctx, page, 1800, async () => pressId('skl_phi_kiem_truy_hon'));
        await sheet(ctx, out('kiem-phi-kiem-truy-hon'), title('Kiếm tu · Phi Kiếm Truy Hồn (spirit_sword #CFF3FF)'), r.shots, 10);
        log[`${g}-phi-kiem`] = r.events;
      }
      if (sc === 'hophap') {
        await scene(page);
        await closeCam(page, SC_DIST);
        let r = await record(ctx, page, 1800, async () => pressId('skl_tran_son_an'));
        await sheet(ctx, out('hophap-tran-son-an'), title('Hộ pháp · Trấn Sơn Ấn (spirit_gold #FFDE96)'), r.shots, 10);
        log[`${g}-tran-son`] = r.events;
        await scene(page);
        await closeCam(page, SC_DIST);
        r = await record(ctx, page, 1600, async () => press(0));
        await sheet(ctx, out('hophap-don-thuong'), title('Hộ pháp · đòn thường'), r.shots, 10);
      }
      if (sc === 'dansu') {
        await scene(page);
        await closeCam(page, SC_DIST);
        let r = await record(ctx, page, 1800, async () => pressId('skl_hoi_xuan_quyet'));
        await sheet(ctx, out('dansu-hoi-xuan-quyet'), title('Đan sư · Hồi Xuân Quyết (spirit_jade #7FE3D0)'), r.shots, 10);
        log[`${g}-hoi-xuan`] = r.events;
        await scene(page);
        await closeCam(page, SC_DIST);
        r = await record(ctx, page, 1600, async () => press(0));
        await sheet(ctx, out('dansu-don-thuong'), title('Đan sư · đòn thường'), r.shots, 10);
      }
      if (sc === 'vetkiem') {
        // Cận cảnh vệt kiếm, tốc độ thật: 3 đòn thường cách nhau 1 s; mỗi đòn chờ sự kiện hit rồi chụp dồn 4 ảnh (~60 ms một ảnh):
        // vệt sống 0,22 s sau mẫu cuối (hit + 0,08 s) nên còn thấy ở các ảnh này. Ghi thêm vị trí gốc/mũi kiếm trên màn hình mỗi khung.
        await scene(page);
        await page.evaluate(`(() => {
          const g = window.__game; const out = (window.__k6probe = []);
          function tick() {
            const bl = g.vfx.trails.blades.filter((x) => x.mesh);
            const rec = { t: Math.round(performance.now()), blades: bl.length, st: g.vfx.batch.stats() };
            if (bl[0]) {
              const P = bl[0].r.pos.array, n = bl[0].r.n; rec.n = n;
              const cam = g.camera; const V = g.ents.players.get(g.sid).model.root.position.constructor;
              const proj = (i) => { const v = new V(P[i], P[i + 1], P[i + 2]).project(cam); return [Math.round((v.x * 0.5 + 0.5) * 1100), Math.round((-v.y * 0.5 + 0.5) * 900)]; };
              rec.a = proj(0); rec.b = proj(3); rec.last = proj(Math.max(0, n - 1) * 6);
            }
            out.push(rec); requestAnimationFrame(tick);
          }
          tick();
        })()`);
        await closeCam(page, 3.5);
        await page.bringToFront();
        const shots: { label: string; url: string; mark?: boolean }[] = [];
        for (let k = 0; k < 3; k++) {
          await page.evaluate(`window.__game.skillLog.length = 0`);
          await press(0);
          const until = Date.now() + 3000;
          while (Date.now() < until && !(await page.evaluate(`window.__game.skillLog.some((x) => x.e.kind === 'hit')`))) await sleep(5);
          const t0 = Date.now();
          for (let i = 0; i < 4; i++) {
            const buf = await page.screenshot({ type: 'jpeg', quality: 88 });
            shots.push({ label: `đòn ${k + 1} · hit +${Date.now() - t0} ms`, url: 'data:image/jpeg;base64,' + buf.toString('base64'), mark: i === 0 });
          }
          await sleep(900);
        }
        await sheet(ctx, out('vet-kiem'), title('Vệt kiếm bám mũi kiếm: 3 đòn thường, 4 ảnh dồn ngay sau khung hit (tốc độ thật)'), shots, 6);
        log[`${g}-vet-kiem-probe`] = (await page.evaluate(`window.__k6probe.filter((x) => x.blades > 0)`)) as unknown[];
      }
      if (sc === 'combo') {
        // Chuỗi liên hoàn 3 đòn ở tốc độ thật (chụp chậm làm lệch dự đoán so với server khi bấm liên tiếp).
        await scene(page);
        await closeCam(page, 3.5);
        const r = await record(ctx, page, 3400, async () => {
          for (let k = 0; k < 3; k++) {
            await press(0);
            await sleep(1000);
          }
        });
        await sheet(ctx, out('lien-hoan-3-don'), title('Đòn thường liên hoàn 3 đòn, tốc độ thật (tụ lực, bùng nổ, vệt kiếm)'), r.shots, 12);
        log[`${g}-combo`] = r.events;
      }
      if (sc === 'vachbao') {
        // Vạch báo của quái: gọi trực tiếp `vfx.hazard` hai vòng cạnh nhau, 3 s báo: trái = quái thường (son đỏ),
        // phải = boss (ma khí). Camera cao nghiêng; chụp ở 0,3 / 1,2 / 2,2 / 2,8 / 2,94 s (80 ms cuối nháy sáng).
        await scene(page, 0);
        await cam(page, 0.0, 0.7, 11);
        await page.bringToFront();
        await page.evaluate(`(() => { const g = window.__game; const x = g.cur.x, z = g.cur.z;
          const fwd = [Math.sin(g.camYaw + Math.PI) * 5, Math.cos(g.camYaw + Math.PI) * 5];
          const side = [Math.cos(g.camYaw) * 3.4, -Math.sin(g.camYaw) * 3.4];
          g.vfx.hazard(x + fwd[0] - side[0], z + fwd[1] - side[1], 3, 3, 'fire', undefined, 0, false);
          g.vfx.hazard(x + fwd[0] + side[0], z + fwd[1] + side[1], 3, 3, 'fire', undefined, 0, true); })()`);
        const shots: { label: string; url: string }[] = [];
        const t0 = Date.now();
        for (const at of [300, 1200, 2200, 2800, 2930]) {
          while (Date.now() - t0 < at) await sleep(5);
          const buf = await page.screenshot({ type: 'jpeg', quality: 88 });
          shots.push({ label: `+${Date.now() - t0} ms / 3000 ms`, url: 'data:image/jpeg;base64,' + buf.toString('base64') });
        }
        await sheet(ctx, out('vach-bao-quai'), title('Vạch báo: trái quái thường (son đỏ), phải boss (ma khí); 80 ms cuối nháy'), shots, 5);
        log[`${g}-vach-bao-hazards`] = (await page.evaluate(`window.__game.hazardLog ?? []`)) as unknown[];
      }
      if (sc === 'dinh') {
        // Đỉnh núi, biển mây phía sau (kiểm thứ tự vẽ trong suốt của mảnh gộp): vòng báo + vòng chấn động + hạt đứng trước mây.
        await gm(page, 'tp 2400 1700', 2500);
        await cam(page, 3.14, 0.18, 7);
        await page.bringToFront();
        await page.evaluate(`(() => { const g = window.__game; const x = g.cur.x, z = g.cur.z;
          const f = [Math.sin(g.camYaw + Math.PI) * 4, Math.cos(g.camYaw + Math.PI) * 4];
          const P = g.vfx.group.position.constructor;
          g.vfx.hazard(x + f[0], z + f[1], 2.5, 6, 'fire', undefined, 0, false);
          g.vfx.pillar((out) => { out.set(x + f[0] + 3, g.cur.y + 1, z + f[1]); return true; }, 0x9fe8ff, 6, 0.8, 6);
          g.vfx.burst(new P(x + f[0] - 2, g.cur.y + 1.2, z + f[1]), 0xcff3ff, 1.2, 6); })()`);
        await sleep(2500);
        const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
        await sheet(ctx, out('dinh-nui'), title('Đỉnh núi, biển mây phía sau: vòng báo, trụ sáng, vòng nổ vẽ trước mây'), [{ label: 'đỉnh núi (2400, 1700)', url: 'data:image/jpeg;base64,' + buf.toString('base64') }], 1);
      }
      if (sc === 'hotheb') {
        // Linh quang hộ thể Trúc Cơ: đứng yên ngoài giao chiến ở cấp 16, rồi bước đi thì tắt.
        await scene(page, 0);
        await gm(page, 'level 18', 1500);
        await sleep(9000);
        await closeCam(page, 3.5);
        await sleep(6000);
        const shot = async (label: string) => ({ label, url: 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64') });
        const a1 = await shot('đứng yên ngoài giao chiến (có linh quang)');
        await page.keyboard.down('KeyW');
        await sleep(350);
        const a2 = await shot('đang đi (tắt)');
        await page.keyboard.up('KeyW');
        await sheet(ctx, out('linh-quang-ho-the'), title('Linh quang hộ thể Trúc Cơ'), [a1, a2], 2);
      }
      void hasWolf;
      await ctx.close();
    }
    for (const j of jobs) await j();
    fs.writeFileSync(path.join(OUT, 'skill-events.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-k4] lỗi console:\n' + [...new Set(errors)].join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
