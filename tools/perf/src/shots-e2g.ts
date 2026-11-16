// pnpm shots:e2g (E2-G): ảnh trong game của 12 chiêu bậc 2–3 chơi được (Trúc Cơ/Kết Đan): dãy khung có VFX K-6, nam và nữ.
//   tsx src/shots-e2g.ts --out <thư mục> [--genders m,f] [--only kiem,hophap,dansu] [--renderer webgpu|webgl2]
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
const OUT = path.resolve(opt('--out', 'shots-e2g'));
const GENDERS = opt('--genders', 'm,f').split(',');
const ONLY = opt('--only', 'kiem,hophap,dansu').split(',');
/** Chiêu bậc 2–3 chơi được (E2-G) theo công pháp: kiem = Lạc Kiếm Quyết, hophap = Bất Động Kim Thân, dansu = Thanh Mộc Đan Kinh. */
const LIST: Record<string, string[]> = {
  kiem: ['skl_hoanh_kiem_pha_mach', 'skl_kiem_vu_tam_diep', 'skl_kiem_dan_ban_menh', 'skl_nghich_kiem_chuyen_phong'],
  hophap: ['skl_thiet_quyen_chan_dia', 'skl_kim_chung_tran', 'skl_son_nhac_hoa_than', 'skl_dich_son_xung'],
  dansu: ['skl_moc_linh_tran', 'skl_duoc_vu', 'skl_ngung_dan_ho_the', 'skl_dan_hoa_phong_tran'],
};
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
const SPOTS: [number, number][] = [[2048, 2088], [2088, 2088], [2008, 2088], [2048, 2128], [2048, 2048], [2088, 2128], [2008, 2128], [2088, 2048]];
let spotIdx = 0;

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e2g', command: 'pnpm shots:e2g' });
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
  console.log(`[shots-e2g] ${path.basename(file)}`);
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
      SLOW = SLOW0;
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
      const page = await ctx.newPage();
      const name = `K6${g}${String(Date.now() % 10000)}`;
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${opt('--query', '')}&quiet=1${SLOW < 1 ? '&slowmo=' + SLOW : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 22', 1600);
      await gm(page, 'god on', 1600);
      const METHOD = sc === 'hophap' ? 'bat_dong_kim_than' : sc === 'dansu' ? 'thanh_moc_dan_kinh' : 'lac_kiem_quyet';
      await gm(page, `method ${METHOD} 5`, 1200);
      // Phiên trước còn ở lại thế giới 60 s (allowReconnection): mỗi phiên đứng một chỗ khác (cách 40 m) để không đè lên nhau thành hai nhân vật chồng hình.
      const spot = SPOTS[spotIdx++ % SPOTS.length];
      await gm(page, `tp ${spot[0]} ${spot[1]}`, 1600);
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

      // Ảnh chụp dùng `?quiet=1`: sói vẫn cắn nhưng không nháy trắng model (hitReact) và không nổ cầu hồng (`bite`), vốn che nhân vật và lẫn vào VFX K-6.
      // E2-G: mỗi chiêu bậc 2–3 chơi được một tờ ảnh (cảnh: ba con sói trước mặt, cận cảnh góc 3/4).
      for (const id of LIST[sc] ?? []) {
        await scene(page, 3);
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 1500, async () => pressId(id));
        await sheet(ctx, out(id.replace(/^skl_/, '')), title(`${id} (${sc})`), r.shots, 10);
        log[`${g}-${id}`] = r.events;
      }
      void hasWolf;
      await ctx.close();
    }
    for (const j of jobs) await j();
    fs.writeFileSync(path.join(OUT, 'skill-events.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-e2g] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
