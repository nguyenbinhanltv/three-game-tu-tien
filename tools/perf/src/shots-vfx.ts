// pnpm shots:vfx: video webm + dãy khung từng chiêu (VFX-V0/V1), nam và nữ.
//   tsx src/shots-vfx.ts --out <thư mục tuyệt đối> [--skills skl_kiem_khi_tram,skl_phi_kiem] [--genders m,f] [--fxq high|medium|low]
//                        [--old] [--webm-only] [--sheet-only] [--frames] [--fps 24] [--tile 40] [--tmax 1000] [--dist 7] [--query &a=b]
// Vào game bằng tài khoản thử, dựng cảnh bằng lệnh GM (một con sói trước mặt), ghi màn hình bằng CDP screencast rồi:
//   - ghép mỗi chiêu hai video webm (chậm 0,25× để xem chi tiết, tốc độ thật) bằng ffmpeg-static (VP9);
//   - ghép một tờ ảnh dãy khung (mỗi ô một mốc thời gian game, viền đỏ = khung hit) như docs/e2g-skills.
// `--old` chụp hình cũ (`?fxtl=0`: tắt dòng thời gian hiệu ứng) để làm ảnh trước/sau. Luôn ?mute=1 và --mute-audio.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2697/5197) rồi tự tắt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-vfx'));
const GENDERS = opt('--genders', 'm,f').split(',');
const SKILLS = opt('--skills', 'skl_kiem_khi_tram,skl_phi_kiem').split(',');
const FXQ = opt('--fxq', 'high');
const OLD = args.includes('--old');
const PERF = args.includes('--perf');
/** Công pháp của từng chiêu (V3: Hộ pháp/Đan sư); chiêu không ghi là Kiếm tu. */
const HP = 'bat_dong_kim_than';
const DS = 'thanh_moc_dan_kinh';
const METHOD_OF: Record<string, string> = Object.fromEntries([
  ...['skl_thiet_bich_xung', 'skl_tran_son_an', 'skl_kim_cuong_bat_hoai', 'skl_thiet_quyen_chan_dia', 'skl_kim_chung_tran', 'skl_son_nhac_hoa_than', 'skl_dich_son_xung', 'skl_anh_thiet_than', 'skl_thuan_di_ho_the', 'skl_thien_kim_phap_tuong'].map((k) => [k, HP]),
  ...['skl_luu_huong_bo', 'skl_hoi_xuan_quyet', 'skl_hoi_thien_dan_lo', 'skl_moc_linh_tran', 'skl_duoc_vu', 'skl_ngung_dan_ho_the', 'skl_dan_hoa_phong_tran', 'skl_anh_duoc_hoa_than', 'skl_thuan_di_cuu_vien', 'skl_thien_dan_phap_gioi'].map((k) => [k, DS]),
]);
/** Chiêu diện rộng/từ trên cao: lùi camera, ngẩng cao để thấy cả vùng. */
const WIDE = /thien_kiem_vu|van_kiem_quy_tong|thien_kiem_hoa_hinh|loi_dinh|phap_tuong|hoi_thien|phap_gioi|tran_son|thiet_quyen|moc_linh|duoc_vu/;
/** Số người giả cùng ra chiêu (đo sân đông) và thời gian đo (giây). */
const CROWD = Number(opt('--crowd', '0'));
const CROWD_SECS = Number(opt('--crowd-secs', '15'));
/** Cấp nhân vật khi chụp (chiêu bậc 2–3 cần ≥ 16–28). */
const LEVEL = Number(opt('--level', '12'));
const WEBM_ONLY = args.includes('--webm-only');
const SHEET_ONLY = args.includes('--sheet-only');
const FPS = Number(opt('--fps', '24'));
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2697);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5197);
const DIST = Number(opt('--dist', '7'));
const SLOW = Number(opt('--slow', '0.25'));
const TILE = Number(opt('--tile', '40'));
/** Chỉ lấy ô tới mốc này (ms game): dãy khung gọn hơn. */
/** Thời lượng ghi riêng của chiêu có niệm. */
const SPAN: Record<string, number> = { skl_loi_dinh_nhat_kiem: 3300, skl_kiem_vu_tam_diep: 1900, skl_van_kiem_quy_tong: 2200, skl_thien_kiem_hoa_hinh: 2200 };
const TMAX = Number(opt('--tmax', '1000'));
const SPOTS: [number, number][] = [[2048, 2088], [2088, 2088], [2008, 2088], [2048, 2128], [2048, 2048], [2088, 2128], [2008, 2128], [2088, 2048]];
let spotIdx = 0;

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-vfx', command: 'pnpm shots:vfx' });
type G = { __game?: Record<string, any> };
type Frame = { at: number; data: string };

function ffmpegPath(): string {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const pnpm = path.resolve(process.cwd(), '../../node_modules/.pnpm');
  for (const d of fs.existsSync(pnpm) ? fs.readdirSync(pnpm) : []) {
    if (!d.startsWith('ffmpeg-static@')) continue;
    for (const exe of ['ffmpeg.exe', 'ffmpeg']) {
      const p = path.join(pnpm, d, 'node_modules', 'ffmpeg-static', exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return 'ffmpeg';
}

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

async function closeCam(page: Page, dist: number): Promise<void> {
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
    if (near) yaw = Math.atan2(near.x - g.cur.x, near.z - g.cur.z);
    g.camYaw = yaw + 0.9;
    g.camPitch = 0.2;
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

async function scene(page: Page): Promise<void> {
  await gm(page, 'killall', 900);
  await sleep(8000);
  await gm(page, 'heal', 500);
  await gm(page, 'cd', 500);
  await gm(page, 'spawn mon_soi_xam 1', 1700);
  await page.evaluate(() => (window as unknown as G).__game!.clearTarget());
}

/** Ghi màn hình `spanGame` ms game (đồng hồ thật = spanGame / slow), chạy `act` lúc bắt đầu. */
async function record(ctx: BrowserContext, page: Page, slow: number, spanGame: number, act: () => Promise<void>): Promise<{ frames: Frame[]; t0: number; hits: number[] }> {
  await page.bringToFront();
  await sleep(300);
  await page.evaluate(() => ((window as unknown as G).__game!.skillLog.length = 0));
  if (PERF) await page.evaluate(`(() => { const g = window.__game; const o = (window.__perf = { dc: [], tri: [], ms: [] }); let last = performance.now(); (function t() { const i = g.info(); const n = performance.now(); o.dc.push(i.drawCalls); o.tri.push(i.triangles); o.ms.push(n - last); last = n; requestAnimationFrame(t); })(); })()`);
  const cdp = await ctx.newCDPSession(page);
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    frames.push({ at: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, everyNthFrame: 1 });
  await sleep(250);
  const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
  const t0p = await page.evaluate(() => performance.now());
  await act();
  const elapsed = (await page.evaluate(() => performance.now())) - t0p;
  await sleep(Math.max(0, spanGame / slow - elapsed));
  await cdp.send('Page.stopScreencast');
  await cdp.detach().catch(() => undefined);
  const evs = (await page.evaluate(() => (window as unknown as G).__game!.skillLog)) as { at: number; e: { kind: string } }[];
  const hits = evs.filter((x) => x.e.kind === 'hit').map((x) => Math.round((x.at - t0p) * slow));
  return { frames, t0, hits };
}

/** Ghép khung JPEG (có dấu thời gian) thành webm VP9 tốc độ khung cố định, giữ đúng nhịp thật. */
function encodeWebm(frames: Frame[], t0: number, file: string): boolean {
  if (frames.length < 3) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfxv-'));
  // Chọn khung gần nhất cho từng nhịp 1/FPS để video đều (screencast chỉ gửi khi màn hình đổi).
  const t1 = frames[frames.length - 1].at;
  const n = Math.max(2, Math.floor(((t1 - Math.max(t0, frames[0].at)) / 1000) * FPS));
  let j = 0;
  const start = Math.max(t0, frames[0].at);
  for (let i = 0; i < n; i++) {
    const t = start + (i * 1000) / FPS;
    while (j + 1 < frames.length && Math.abs(frames[j + 1].at - t) <= Math.abs(frames[j].at - t)) j++;
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(frames[j].data, 'base64'));
  }
  const r = spawnSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), '-vf', 'crop=900:760:100:90', '-c:v', 'libvpx-vp9', '-b:v', '1800k', '-crf', '34', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) console.warn('[shots-vfx] ffmpeg lỗi:', r.stderr?.slice(0, 300));
  return r.status === 0;
}

async function sheet(ctx: BrowserContext, file: string, title: string, shots: { label: string; url: string; mark?: boolean }[], per = 8): Promise<void> {
  if (args.includes('--frames')) {
    const dir = path.join(path.dirname(file), 'frames', path.basename(file, '.png'));
    fs.mkdirSync(dir, { recursive: true });
    shots.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}-${s.label.replace(/[^0-9a-z]+/gi, '_')}.jpg`), Buffer.from(s.url.split(',')[1], 'base64')));
  }
  const p = await ctx.newPage();
  const rows: (typeof shots)[] = [];
  for (let i = 0; i < shots.length; i += per) rows.push(shots.slice(i, i + per));
  const CW = 780;
  const CH = 640;
  const cell = Math.min(300, Math.floor(1800 / Math.min(per, shots.length)));
  const z = cell / CW;
  const html = `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui"><div style="padding:8px 12px;font-size:15px;color:#d8b36a">${title}</div>${rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:flex-start">${r
          .map(
            (s) =>
              `<figure style="margin:2px;width:${cell}px"><div style="width:${cell}px;height:${Math.round(CH * z)}px;overflow:hidden;${s.mark ? 'outline:3px solid #d85a46' : ''}"><img src="${s.url}" style="display:block;width:${Math.round(1100 * z)}px;margin-left:${-Math.round(160 * z)}px;margin-top:${-Math.round(130 * z)}px"></div><figcaption style="padding:2px 4px">${s.label}</figcaption></figure>`,
          )
          .join('')}</div>`,
    )
    .join('')}</body>`;
  await p.setViewportSize({ width: Math.min(per, shots.length) * (cell + 4) + 8, height: 800 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
  console.log(`[shots-vfx] ${path.basename(file)}`);
}

function tiles(r: { frames: Frame[]; t0: number; hits: number[] }, spanGame: number, slow: number): { label: string; url: string; mark?: boolean }[] {
  const shots: { label: string; url: string; mark?: boolean }[] = [];
  for (let g = 0; g <= Math.min(spanGame, TMAX); g += TILE) {
    const ms = g / slow;
    const f = r.frames.reduce<Frame | null>((b, x) => (!b || Math.abs(x.at - r.t0 - ms) < Math.abs(b.at - r.t0 - ms) ? x : b), null);
    if (!f || Math.abs(f.at - r.t0 - ms) > 120) continue;
    const game = Math.round((f.at - r.t0) * slow);
    const isHit = r.hits.some((h) => Math.abs(h - game) <= TILE / 2 + 5);
    shots.push({ label: `${game} ms${isHit ? ' · hit' : ''}`, url: 'data:image/jpeg;base64,' + f.data, mark: isHit });
  }
  return shots;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  const sheetCtx = await browser.newContext({ viewport: { width: 1800, height: 800 } });
  const jobs: (() => Promise<void>)[] = [];
  try {
    for (const g of GENDERS) {
      for (const pass of ['slow', 'real'] as const) {
        const slow = pass === 'slow' ? SLOW : 1;
        const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
        await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
        const page = await ctx.newPage();
        const name = `V1${g}${pass[0]}${String(Date.now() % 10000)}`;
        page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
        page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text().slice(0, 300)}`));
        await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}&quiet=1&fxq=${FXQ}${opt('--query', '')}${OLD ? '&fxtl=0' : ''}${pass === 'slow' ? '&slowmo=' + SLOW : ''}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
        await page.waitForFunction(() => {
          const w = (window as unknown as G).__game;
          return !!w && w.frames > 30 && !!w.me?.();
        }, undefined, { timeout: 120_000, polling: 250 });
        await clearIntro(page);
        await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
        await gm(page, 'level ' + LEVEL, 1600);
        await gm(page, 'god on', 1600);
        await gm(page, 'method lac_kiem_quyet 5', 1200);
        if (LEVEL >= 16) await gm(page, 'skills max', 1500);
        const spot = SPOTS[spotIdx++ % SPOTS.length];
        await gm(page, `tp ${spot[0]} ${spot[1]}`, 1600);
        await page.waitForFunction(() => {
          const w = (window as unknown as G).__game!;
          const m = w.ents?.players.get(w.sid)?.model;
          return !!m && m.dirHits === true;
        }, undefined, { timeout: 60_000, polling: 300 });
        const bar = (id: string) => page.evaluate((i) => (window as unknown as G).__game!.bar().findIndex((s: { id: string }) => s.id === i), id);
        const press = async (id: string) => {
          if (/kiem_anh_bo|nghich_kiem|thiet_bich_xung|luu_huong_bo|dich_son_xung/.test(id)) return page.evaluate(() => (window as unknown as G).__game!.useDash());
          const i = id === 'skl_phi_kiem' ? 0 : await bar(id);
          if (i < 0) {
            // Chiêu còn khóa (chưa có cơ chế Nguyên Anh/Hóa Thần) không nằm trên thanh chiêu: phát thẳng sự kiện windup vào SkillFx để xem hiệu ứng (không có động tác).
            await page.evaluate((sk) => { const g = (window as unknown as G).__game!; const w = [...g.view.monsters.values()].find((m: { st: number }) => m.st !== 3); if (w) { g.fxArea.set(g.sid, { x: w.x, z: w.z, r: 12 }); g.fxDst.set(g.sid, [...g.view.monsters.entries()].find(([, m]) => m === w)![0]); g.setTarget?.([...g.view.monsters.entries()].find(([, m]) => m === w)![0], 'mon'); } g.skillFx.handle(g.sid, { kind: 'windup', skill: sk, combo: -1, index: 0, t: 0, kb: false }); }, id);
            return;
          }
          await page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);
        };
        if (CROWD > 0) {
          // Sân đông: N người giả (chỉ phía client) cùng ra chiêu Kiếm tu quanh mình, mỗi người cứ ~0,9 s một chiêu; đo draw call, tam giác, khung ms, số lưới FX sống.
          await scene(page);
          await closeCam(page, 14);
          await page.evaluate(`(() => { const g = window.__game; const SK = ${JSON.stringify(SKILLS)}; const R = g.skillFx.runner; const FXT = window.__fxTimelines; const me = g.cur;
            const fakes = []; for (let i = 0; i < ${CROWD}; i++) { const a = i * 2.399, r = 4 + (i % 7) * 3.3; fakes.push({ sid: 'fake' + i, a: { x: me.x + Math.cos(a) * r, y: me.y, z: me.z + Math.sin(a) * r, yaw: a + Math.PI, model: {} } }); }
            window.__crowd = { stop: false }; let n = 0; const tick = () => { if (window.__crowd.stop) return; const f = fakes[n++ % fakes.length]; const id = SK[Math.floor(Math.random() * SK.length)]; const tl = FXT.get(id); const def = FXT.skill(id); if (tl && def) R.start(f.sid, f.a, def, tl, { kind: 'windup', skill: id, combo: -1, index: 0, t: 0, kb: false }, false, 20, 'lac_kiem_quyet'); setTimeout(tick, ${Math.round(900 / Math.max(1, CROWD))}); }; tick();
            const o = (window.__perf = { dc: [], tri: [], ms: [], live: [] }); let last = performance.now(); (function t() { const i = g.info(); const nw = performance.now(); o.dc.push(i.drawCalls); o.tri.push(i.triangles); o.ms.push(nw - last); o.live.push(g.vfx.pool.live); last = nw; requestAnimationFrame(t); })(); })()`);
          await sleep(CROWD_SECS * 1000);
          const p = (await page.evaluate(() => { (window as unknown as { __crowd: { stop: boolean } }).__crowd.stop = true; return (window as unknown as { __perf: Record<string, number[]> }).__perf; })) as Record<string, number[]>;
          const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)];
          console.log(`[crowd] ${CROWD} người, ${SKILLS.length} chiêu, fxq=${FXQ}: draw p50/p95/max ${q(p.dc, 0.5)}/${q(p.dc, 0.95)}/${Math.max(...p.dc)}, tam giác p50/max ${q(p.tri, 0.5)}/${Math.max(...p.tri)}, khung ms p50/p95/p99 ${q(p.ms, 0.5).toFixed(1)}/${q(p.ms, 0.95).toFixed(1)}/${q(p.ms, 0.99).toFixed(1)}, lưới FX sống p50/max ${q(p.live, 0.5)}/${Math.max(...p.live)}`);
          await ctx.close();
          continue;
        }
        let curMethod = 'lac_kiem_quyet';
        for (const sk of SKILLS) {
          const want = METHOD_OF[sk] ?? 'lac_kiem_quyet';
          if (want !== curMethod) {
            await gm(page, `method ${want} 5`, 1500);
            if (LEVEL >= 16) await gm(page, 'skills max', 1500);
            curMethod = want;
          }
          await scene(page);
          if (/van_kiem_quy_tong|thien_kiem_hoa_hinh|kim_cuong|anh_thiet|thuan_di_ho_the|phap_tuong|hoi_thien|anh_duoc|thuan_di_cuu_vien|phap_gioi/.test(sk)) await gm(page, 'charge', 900);
          await closeCam(page, WIDE.test(sk) ? 9.5 : DIST);
          if (WIDE.test(sk)) await page.evaluate(() => { (window as unknown as G).__game!.camPitch = 0.3; });
          const combo = sk === 'skl_phi_kiem';
          const span = combo ? 3000 : SPAN[sk] ?? Number(opt('--span', '1700'));
          const act = async () => {
            if (!combo) return press(sk);
            // Combo 3 đòn: bấm theo nhịp game (đồng hồ thật = game / slow), 0,55 s game giữa các đòn.
            for (let k = 0; k < 3; k++) {
              await press(sk);
              await sleep((620 / slow) | 0);
            }
          };
          const r = await record(ctx, page, slow, span, act);
          const gerr = (await page.evaluate(() => JSON.stringify((window as unknown as G).__game!.gpuErrors ?? []))) as string;
          if (gerr !== '[]') console.warn('[shots-vfx] gpuErrors:', gerr.slice(0, 1500));
          if (PERF) {
            const p = (await page.evaluate(() => (window as unknown as { __perf: { dc: number[]; tri: number[]; ms: number[] } }).__perf)) as { dc: number[]; tri: number[]; ms: number[] };
            const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)];
            console.log(`[perf] ${sk} ${pass} ${OLD ? 'cu' : 'moi'}: draw p50/max ${q(p.dc, 0.5)}/${Math.max(...p.dc)}, tam giác p50/max ${q(p.tri, 0.5)}/${Math.max(...p.tri)}, khung ms p50/p95 ${q(p.ms, 0.5).toFixed(1)}/${q(p.ms, 0.95).toFixed(1)}`);
          }
          if (args.includes('--debug')) console.log('[dbg]', sk, JSON.stringify(await page.evaluate(() => [(window as unknown as { __fxMsgs: string[] }).__fxMsgs, (window as unknown as G).__game!.skillFx.runner.log.map((x: { type: string }) => x.type)])));
          const tag = `${g === 'm' ? 'nam' : 'nu'}-${sk.replace('skl_', '')}${OLD ? '-cu' : ''}`;
          if (!SHEET_ONLY) {
            const ok = encodeWebm(r.frames, r.t0, path.join(OUT, `${tag}-${pass === 'slow' ? 'cham' : 'that'}.webm`));
            console.log(`[shots-vfx] webm ${tag}-${pass}: ${ok ? 'ok' : 'lỗi'} (${r.frames.length} khung)`);
          }
          if (!WEBM_ONLY && pass === 'slow') {
            const shots = tiles(r, span, slow);
            jobs.push(() => sheet(sheetCtx, path.join(OUT, `${tag}.png`), `${sk} · ${g === 'm' ? 'Thanh Phong (nam)' : 'Lam Chi (nữ)'}${OLD ? ' · hình cũ' : ''} · mỗi ô ${TILE} ms game, viền đỏ = khung hit`, shots, 8));
          }
        }
        await ctx.close();
      }
    }
    for (const j of jobs) await j();
    if (errors.length) console.log('[shots-vfx] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
