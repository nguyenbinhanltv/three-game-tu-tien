// pnpm shots:vfx: video webm + dãy khung từng chiêu (VFX-V0/V1), nam và nữ.
//   tsx src/shots-vfx.ts --out <thư mục tuyệt đối> [--skills skl_kiem_khi_tram,skl_phi_kiem] [--genders m,f] [--fxq high|medium|low]
//                        [--old] [--combo] [--webm-only] [--sheet-only] [--fps 24]
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
const COMBO = args.includes('--combo');
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
  if (args.includes('--debug')) {
    await page.evaluate(`(() => { const g = window.__game; const out = (window.__vfxprobe = []); const V = g.camera.position.constructor; const pr = (x, y, z) => { const v = new V(x, y, z).project(g.camera); return [Math.round((v.x * 0.5 + 0.5) * 1100), Math.round((-v.y * 0.5 + 0.5) * 900)]; }; let n = 0; (function tick(){ const hs = [...g.vfx.pool.batched]; const dc = hs.filter((m) => m.fxKind === 'decal' && m.fxA.w === 0); if (dc.length && n++ % 5 === 0 && out.length < 8) { const m = dc[0]; const mon = [...g.ents.monsters.values()][0]; out.push({ crack: pr(m.position.x, m.position.y, m.position.z), cp: m.position.toArray().map((x) => +x.toFixed(1)), me: pr(g.renderPos.x, g.renderPos.y, g.renderPos.z), wolfEnt: mon ? pr(mon.x, mon.y, mon.z) : null, wolfPos: mon ? [mon.x, mon.z] : null }); } requestAnimationFrame(tick); })(); })()`);
  }
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
        await gm(page, 'level 12', 1600);
        await gm(page, 'god on', 1600);
        await gm(page, 'method lac_kiem_quyet 5', 1200);
        const spot = SPOTS[spotIdx++ % SPOTS.length];
        await gm(page, `tp ${spot[0]} ${spot[1]}`, 1600);
        await page.waitForFunction(() => {
          const w = (window as unknown as G).__game!;
          const m = w.ents?.players.get(w.sid)?.model;
          return !!m && m.dirHits === true;
        }, undefined, { timeout: 60_000, polling: 300 });
        const bar = (id: string) => page.evaluate((i) => (window as unknown as G).__game!.bar().findIndex((s: { id: string }) => s.id === i), id);
        const press = async (id: string) => {
          const i = id === 'skl_phi_kiem' ? 0 : await bar(id);
          if (i < 0) throw new Error('không thấy chiêu ' + id);
          await page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);
        };
        if (args.includes('--lab2')) {
          await scene(page);
          if (args.includes('--nowolf')) await gm(page, 'killall', 1200);
          await closeCam(page, DIST);
          await press(SKILLS[0]);
          for (let n = 0; n < 12; n++) {
            await sleep(n === 0 ? 900 : 250);
            if (n === 2) console.log('[mat]', JSON.stringify(await page.evaluate(`[...window.__game.vfx.pool.batched].filter((m) => m.fxKind === 'crystal').slice(0,2).map((m) => [m.parent && m.parent.type, m.visible, m.layers.mask, m.material && m.material.name, m.frustumCulled, m.matrixAutoUpdate, m.geometry.uuid.slice(0,4), m.geometry.boundingSphere && m.geometry.boundingSphere.radius, m.fxA.toArray()])`)));
            if (n === 1 && args.includes('--dummy')) await page.evaluate(`(() => { const g = window.__game, L = window.__fxlab; const m = g.vfx.fx(L.shapeGeometry('spike'), 0x2cc7dc, 0, 'crystal'); m.position.set(g.cur.x + 3, 150, g.cur.z - 2); m.scale.setScalar(0.01); m.fxA.set(1.2, 0, 1, 0); })()`);
            if (n === 1 && args.includes('--hidefx')) await page.evaluate(`window.__game.vfx.group.visible = false`);
            console.log('[dup]', n, JSON.stringify(await page.evaluate(`(() => { const p = window.__game.vfx.pool; return [p.free.length, new Set(p.free).size, p.created, p.batched.size]; })()`)));
            if (n >= 100) console.log('[ext]', n, JSON.stringify(await page.evaluate(`(() => { const g = window.__game; const V = g.camera.position.constructor; return [...g.vfx.pool.batched].map((m) => { m.updateMatrix(); const pos = m.geometry.getAttribute('position'); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < pos.count; i += 3) { const v = new V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrix).project(g.camera); const sx = (v.x * 0.5 + 0.5) * 1100, sy = (-v.y * 0.5 + 0.5) * 900; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); } return [m.fxKind, pos.count, m.fxColor.toArray().map((x) => +x.toFixed(2)), [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)]]; }); })()`)));
            if (n >= 1 && n <= 2) console.log('[chk]', n, JSON.stringify(await page.evaluate(`window.__game.vfx.batch.root.children.filter((c) => c.visible).map((c) => [c.material.name, c.count, c.renderOrder])`)));
            if (n >= 1 && n <= 3) console.log('[grp]', n, JSON.stringify(await page.evaluate(`window.__game.vfx.group.children.filter((c) => c.visible).map((c) => [c.type, c.material && c.material.name, c.fxKind, c.scale && c.scale.toArray().map((x) => +x.toFixed(1)), c.children.length])`)));
            if (n >= 1 && n <= 3) console.log('[hand]', n, JSON.stringify(await page.evaluate(`[...window.__game.vfx.pool.batched].map((m) => [m.fxKind, m.geometry.getAttribute('position').count, m.scale.toArray().map((x) => +x.toFixed(2)), m.position.toArray().map((x) => +x.toFixed(1)), m.fxColor.toArray().map((x) => +x.toFixed(2)), m.fxA.w])`)));
            if (n === 2) console.log('[full]', JSON.stringify(await page.evaluate(`[...window.__game.vfx.pool.batched].filter((m) => m.fxKind === 'crystal').map((m) => ({ p: m.position.toArray(), s: m.scale.toArray(), q: m.quaternion.toArray(), a: m.fxA.toArray(), b: m.fxB.toArray(), c: m.fxColor.toArray(), o: m.fxOpacity, k: m.fxK, ro: m.renderOrder, v: m.visible }))`)));
            if (n === 2) console.log('[all]', JSON.stringify(await page.evaluate(`[...window.__game.vfx.pool.batched].filter((m) => m.fxKind === 'crystal').map((m) => [...m.position.toArray(), ...m.scale.toArray(), ...m.quaternion.toArray()].map((x) => +x.toFixed(2)))`)));
            console.log('[chunks]', n, JSON.stringify(await page.evaluate(`window.__game.vfx.batch.root.children.filter((c) => c.visible && c.material.name === 'fx-crystal-i').map((c) => ['C', [...c.geometry.getAttribute('aFxC').array.slice(0, 8)].map((x) => +x.toFixed(2)), 'A', [...c.geometry.getAttribute('aFxA').array.slice(0, 8)].map((x) => +x.toFixed(2)), 'B', [...c.geometry.getAttribute('aFxB').array.slice(0, 4)].map((x) => +x.toFixed(2)), 'K', [...c.geometry.getAttribute('aFxK').array.slice(0, 4)].map((x) => +x.toFixed(2)), 'M', [...c.instanceMatrix.array.slice(0, 16)].map((x) => +x.toFixed(2))])`)));
            console.log('[lab2]', n, JSON.stringify(await page.evaluate(`(() => { const g = window.__game; const V = g.camera.position.constructor; const pr = (m) => { const v = new V(m.position.x, m.position.y + 1, m.position.z).project(g.camera); return [Math.round((v.x * 0.5 + 0.5) * 1100), Math.round((-v.y * 0.5 + 0.5) * 900)]; }; return [...g.vfx.pool.batched].filter((m) => m.fxKind === 'crystal').slice(0, 2).map((m) => ({ p: m.position.toArray(), s: m.scale.toArray(), q: m.quaternion.toArray(), a: m.fxA.toArray(), b: m.fxB.toArray(), c: m.fxColor.toArray(), o: m.fxOpacity, k: m.fxK, ro: m.renderOrder, v: m.visible, geo: m.geometry.getAttribute('position').count, mat: m.matrix.elements.slice(0, 16).map((x) => +x.toFixed(2)) })); })()`)));
            await page.screenshot({ path: path.join(OUT, `lab2-${g}-${pass}-${n}.png`) });
          }
          await ctx.close();
          continue;
        }
        if (args.includes('--lab')) {
          // Phòng thử: bày các hình FX cố định trước mặt nhân vật rồi chụp (tìm lỗi shader/vị trí).
          await scene(page);
          await closeCam(page, 6);
          await page.evaluate(`(() => { const g = window.__game, L = window.__fxlab; const me = g.renderPos;
            const mk = (shape, kind, x, z, o) => { const m = g.vfx.fx(L.shapeGeometry(shape), o.c ?? 0x2cc7dc, 1, kind); m.position.set(me.x + x, me.y + (o.y ?? 0.2), me.z + z); if (o.rx) m.rotation.x = o.rx; m.scale.setScalar(o.s ?? 1); m.fxB.set(0.9, 0.99, 1, 0.5); m.fxA.set(o.a0 ?? 1.06, o.a1 ?? 0, 3.3, o.w ?? 0); m.fxK = o.k ?? 0.5; return m; };
            const dk = (shape, x, z, w, a0, r, k) => { const m = mk(shape,'decal',x,z,{s:r,a0,w,k,y:0.14}); m.fxA.y = 0; return m; };
            const cur = g.cur; const actor = { x: cur.x, y: cur.y, z: cur.z, yaw: 1.2, model: {} };
            const c = { sid: g.sid, actor, mine: true, tier: 2, pal: L.paletteOf('lac_kiem_quyet'), seed: 3.1, dist: 5 };
            const tgt = { x: cur.x + Math.sin(1.2) * 3, y: cur.y, z: cur.z + Math.cos(1.2) * 3, chest: 1 };
            const R = g.skillFx.runner;
            R.mesh(c, { type: 'mesh', shape: 'spike', at: 'ground', t: 0, tier: 0, offset: [0.5, 0, 0.3], rot: [-81, 0, -20], scale: 0.7, dur: 8, sweep: 0.18, erodeFrom: 0.95, alpha: 0.97, seed: 1 }, tgt, 0);
            R.mesh(c, { type: 'mesh', shape: 'spike', at: 'ground', t: 0, tier: 0, offset: [-0.5, 0, 0.8], rot: [-90, 0, 0], scale: 0.7, dur: 8, sweep: 0.18, erodeFrom: 0.95, alpha: 0.97, seed: 2 }, tgt, 1);
            const Q = g.camera.quaternion.constructor; const E = g.camera.rotation.constructor;
            const qs = [new Q(-0.7071, 0, 0, 0.7071), new Q().setFromAxisAngle({ x: 0, y: 1, z: 0 }, 1.2).multiply(new Q(-0.7071, 0, 0, 0.7071)), new Q().setFromEuler(new E(-1.4, 0, -0.35, 'XYZ')), new Q().setFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.4).multiply(new Q().setFromEuler(new E(-1.4, 0, -0.35, 'XYZ')))];
            window.__lab = qs.map((q, i) => { const m = mk('spike','crystal', i * 1.6 - 2.4, 1.5, {s:0.5,a0:1.2,y:0}); m.quaternion.copy(q); return m; });
            for (const m of window.__lab) m.fxOpacity = 1; })()`);
          await sleep(1500);
          console.log('[lab]', JSON.stringify(await page.evaluate(`({ st: window.__game.vfx.batch.stats(), n: window.__lab.length, p: [...window.__game.vfx.pool.batched].map((m) => ({ k: m.fxKind, p: m.position.toArray().map((x) => +x.toFixed(2)), s: m.scale.toArray().map((x) => +x.toFixed(2)), q: m.quaternion.toArray().map((x) => +x.toFixed(2)), a: m.fxA.toArray().map((x) => +x.toFixed(2)), b: m.fxB.toArray().map((x) => +x.toFixed(2)), c: m.fxColor.toArray().map((x) => +x.toFixed(2)), o: m.fxOpacity, ro: m.renderOrder, kk: m.fxK, vis: m.visible })), cur: window.__game.cur, rp: window.__game.renderPos.toArray() })`)));
          await page.screenshot({ path: path.join(OUT, `lab-${g}-${pass}.png`) });
          await ctx.close();
          continue;
        }
        for (const sk of SKILLS) {
          await scene(page);
          await closeCam(page, DIST);
          const combo = sk === 'skl_phi_kiem' && (COMBO || true);
          const span = combo ? 3000 : 1700;
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
          if (args.includes('--debug')) console.log('[shots-vfx] probe', JSON.stringify(await page.evaluate(() => (window as unknown as { __vfxprobe: unknown }).__vfxprobe)));
          if (args.includes('--debug')) console.log('[shots-vfx] runner.log', JSON.stringify(await page.evaluate(() => (window as unknown as G).__game!.skillFx.runner.log.map((x: { type: string; at: number; tgt?: number[]; me?: number[] }) => x.type + '@' + x.at.toFixed(2) + (x.tgt ? JSON.stringify(x.tgt.map(Math.round)) + JSON.stringify(x.me.map(Math.round)) : '')))), JSON.stringify(await page.evaluate(() => (window as unknown as G).__game!.vfx.batch.stats())));
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
