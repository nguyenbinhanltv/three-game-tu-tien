// pnpm shots:k1: dãy ảnh mốc "trước" của 12 chiêu hiện có (K-1) + bảng thời gian.
//   tsx src/shots-k1.ts --out <thư mục> [--mode viewer|game|table|voices|all] [--model fixture|char|<id asset, ví dụ chr_kiem_tu_nu>] [--only id,id] [--renderer webgpu|webgl2]
// - viewer: mở `?show=skill&id=…` (tắt tiếng), dừng ở từng khung khóa, chụp hai góc (chéo, bên) rồi ghép thành một tờ ảnh mỗi chiêu.
// - game: vào game bằng tài khoản thử, dựng cảnh bằng lệnh GM, bấm chiêu rồi chụp liên tục (mỗi ảnh ghi số ms thật từ lúc bấm).
// - voices (K-5): ba giọng động tác (kiếm tu / hộ pháp / đan sư) cạnh nhau ở khung 3 (tụ lực) và khung 5 (trúng), hai góc, cho đòn thường 1–3 và Kiếm Khí Trảm.
// - table: ghi bảng thời gian (pose, khung khóa, khung vung, lúc server áp, GCD) ra README.md cùng thư mục.
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), luôn ?mute=1 và --mute-audio.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';
import { allSkillTimings, type SkillTiming } from '../../../apps/client/src/viewer/skillTiming';
import { poseOf } from '../../../apps/client/src/game/skillPose';
import { POSE, SKILLS } from '../../../packages/content/src/index';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-k1'));
const MODE = opt('--mode', 'all');
const MODEL = opt('--model', 'fixture');
const RENDERER = opt('--renderer', 'webgpu');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const rq = RENDERER === 'webgl2' ? '&renderer=webgl2' : '';

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-k1', command: 'pnpm shots:k1' });
type G = { __game?: Record<string, any>; __viewer?: Record<string, any> };

const rows = allSkillTimings().filter((r) => !ONLY.length || ONLY.includes(r.skill) || ONLY.includes(r.pose));
const s2 = (n: number) => n.toFixed(2).replace('.', ',');

async function launch(): Promise<Browser> {
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  return chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
}

/** Các mốc dừng trong clip: mọi khung khóa, thêm lúc ra đòn/hết đòn nếu chưa có, trừ khung rất sát nhau. */
function stops(r: SkillTiming): number[] {
  const all = [...r.keys, r.hit[0], r.hit[1], Math.max(0, r.duration - 0.02)].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of all) if (!out.length || t - out[out.length - 1] >= 0.03) out.push(t);
  return out;
}

/** Ghép các ảnh (data URL) thành một tờ có nhãn rồi chụp lại. */
async function sheet(ctx: BrowserContext, file: string, title: string, rowsOfShots: { label: string; url: string; mark?: boolean }[][], crop?: { x: number; y: number; w: number; h: number }): Promise<void> {
  const p = await ctx.newPage();
  const cols = Math.max(...rowsOfShots.map((r) => r.length));
  const cell = Math.min(260, Math.floor(1700 / cols));
  const html = `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui"><div style="padding:8px 12px;font-size:15px;color:#d8b36a">${title}</div>${rowsOfShots
    .map(
      (r) =>
        `<div style="display:flex">${r
          .map(
            (s) =>
              `<figure style="margin:2px;width:${cell}px"><div style="width:${cell}px;${crop ? `height:${Math.round((cell * crop.h) / crop.w)}px;overflow:hidden;position:relative;` : ''}${s.mark ? 'outline:2px solid #d85a46' : ''}"><img src="${s.url}" style="display:block;${crop ? `position:absolute;width:${Math.round((1280 * cell) / crop.w)}px;left:${-Math.round((crop.x * cell) / crop.w)}px;top:${-Math.round((crop.y * cell) / crop.w)}px` : `width:${cell}px`}"></div><figcaption style="padding:2px 4px">${s.label}</figcaption></figure>`,
          )
          .join('')}</div>`,
    )
    .join('')}</body>`;
  await p.setViewportSize({ width: cols * (cell + 4) + 8, height: 800 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
  console.log(`[shots-k1] ${path.basename(file)}`);
}

async function viewerShots(ctx: BrowserContext, errors: string[]): Promise<void> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  const model = MODEL === 'fixture' ? '' : `&model=${MODEL}`;
  for (const r of rows) {
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=skill&id=${r.skill}${model}${rq}`, { waitUntil: 'load' });
    await page.waitForFunction((n) => (window as unknown as G).__viewer?.clipName === n, 'pose_' + r.pose, { timeout: 90_000, polling: 250 });
    await page.evaluate(() => ((window as unknown as G).__viewer!.speed = 1));
    const host = page.locator('.viewer-host');
    const views = ['iso', 'side'] as const;
    const shots: { label: string; url: string; mark?: boolean }[][] = [[], []];
    for (const [vi, v] of views.entries()) {
      await page.evaluate((view) => (window as unknown as G).__viewer!.setView(view), v);
      await sleep(200);
      for (const t of stops(r)) {
        // Dừng ở t rồi ép vẽ hai khung (khung đầu có thể còn dính trạng thái cũ), chờ trình duyệt đưa ảnh lên.
        await page.evaluate((tt) => {
          const vw = (window as unknown as G).__viewer!;
          vw.seek(tt);
          vw.frame();
          vw.frame();
        }, t);
        await sleep(250);
        const buf = await host.screenshot();
        const inHit = t >= r.hit[0] - 1e-6 && t <= r.hit[1] + 1e-6;
        shots[vi].push({ label: `${v} · ${s2(t)} s${inHit ? ' · vung' : ''}`, url: 'data:image/png;base64,' + buf.toString('base64'), mark: inHit });
      }
    }
    await sheet(ctx, path.join(OUT, `viewer-${r.pose}.png`), `${r.skill} · pose ${r.pose} · ${r.keys.length} khung khóa · ${s2(r.duration)} s · vung ${s2(r.hit[0])}–${s2(r.hit[1])} s`, shots);
  }
  await page.close();
}

/** K-5: một tờ ảnh mỗi đòn, cột = ba giọng, hàng = khung 3 / khung 5 theo hai góc nhìn. */
async function voiceShots(ctx: BrowserContext, errors: string[]): Promise<void> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const voices = [
    ['kt', 'Kiếm tu · Lạc Kiếm Quyết', 'lac_kiem_quyet'],
    ['hp', 'Hộ pháp · Bất Động Kim Thân', 'bat_dong_kim_than'],
    ['ds', 'Đan sư · Thanh Mộc Đan Kinh', 'thanh_moc_dan_kinh'],
  ] as const;
  const targets = [
    { skill: 'skl_phi_kiem', hit: 1, name: 'don-thuong-1' },
    { skill: 'skl_phi_kiem', hit: 2, name: 'don-thuong-2' },
    { skill: 'skl_phi_kiem', hit: 3, name: 'don-thuong-3' },
    { skill: 'skl_kiem_khi_tram', hit: 1, name: 'kiem-khi-tram' },
  ];
  const model = MODEL === 'fixture' ? '' : `&model=${MODEL}`;
  for (const tg of targets) {
    const skill = SKILLS.find((x) => x.id === tg.skill)!;
    const grid: { label: string; url: string; mark?: boolean }[][] = [];
    for (const view of ['iso', 'side'] as const) for (const [fi, frame] of [[2, 'khung 3 · tụ lực'], [4, 'khung 5 · trúng']] as const) grid.push([]);
    for (const [vi, [v, vname, method]] of voices.entries()) {
      const id = poseOf(skill, tg.hit - 1, method);
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&show=skill&id=${tg.skill}&voice=${v}&hit=${tg.hit}${model}${rq}`, { waitUntil: 'load' });
      await page.waitForFunction((n) => (window as unknown as G).__viewer?.clipName === n, 'pose_' + id, { timeout: 90_000, polling: 250 });
      const keys = POSE.get(id)!.keys;
      const host = page.locator('.viewer-host');
      let row = 0;
      for (const view of ['iso', 'side'] as const) {
        await page.evaluate((vw) => (window as unknown as G).__viewer!.setView(vw), view);
        await sleep(200);
        for (const [fi, frame] of [[2, 'khung 3 · tụ lực'], [4, 'khung 5 · trúng']] as const) {
          await page.evaluate((tt) => {
            const w = (window as unknown as G).__viewer!;
            w.paused = true;
            w.seek(tt);
            w.frame();
            w.frame();
          }, keys[fi].t);
          await sleep(250);
          const buf = await host.screenshot();
          grid[row++][vi] = { label: `${vname} · ${view} · ${frame} · ${s2(keys[fi].t)} s`, url: 'data:image/png;base64,' + buf.toString('base64'), mark: fi === 4 };
        }
      }
    }
    await sheet(ctx, path.join(OUT, `giong-${tg.name}.png`), `K-5 · ${tg.skill} (đòn ${tg.hit}) · ba giọng cạnh nhau ở khung 3 và khung 5`, grid);
  }
  await page.close();
}

async function gm(page: Page, cmd: string, wait = 1250): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
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

async function enter(ctx: BrowserContext, name: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=${name}${rq}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const g = (window as unknown as G).__game;
    return !!g && g.frames > 30 && !!g.me?.();
  }, undefined, { timeout: 120_000, polling: 250 });
  await clearIntro(page);
  return page;
}

/**
 * Bấm chiêu rồi ghi màn hình bằng CDP screencast (khung dày, có dấu thời gian), lấy khung gần nhất mỗi 100 ms kể từ lúc bấm.
 * Chụp từng ảnh bằng page.screenshot mất 200–400 ms nên không đủ dày để thấy nhịp vung.
 */
async function gameSheet(ctx: BrowserContext, page: Page, slot: number, r: SkillTiming, span: number): Promise<void> {
  await page.evaluate(() => (window as unknown as G).__game!.clearTarget());
  await sleep(1300);
  const cdp = await ctx.newCDPSession(page);
  const frames: { at: number; data: string }[] = [];
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    frames.push({ at: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  await sleep(300);
  const press = await page.evaluate((i) => {
    (window as unknown as G).__game!.useSkill(i);
    return performance.timeOrigin + performance.now();
  }, slot);
  await sleep(span);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const hit0 = r.visualAt * 1000;
  const hit1 = hit0 + (r.hit[1] - r.hit[0]) * 1000;
  const shots: { label: string; url: string; mark?: boolean }[] = [];
  for (let ms = 0; ms <= span; ms += 100) {
    const f = frames.reduce<{ at: number; data: string } | null>((best, x) => (!best || Math.abs(x.at - press - ms) < Math.abs(best.at - press - ms) ? x : best), null);
    if (!f) continue;
    const real = Math.round(f.at - press);
    if (Math.abs(real - ms) > 80) continue;
    shots.push({ label: `${real} ms`, url: 'data:image/jpeg;base64,' + f.data, mark: real >= hit0 && real <= hit1 });
  }
  const rowsOf: typeof shots[] = [];
  for (let i = 0; i < shots.length; i += 6) rowsOf.push(shots.slice(i, i + 6));
  await sheet(ctx, path.join(OUT, `game-${r.pose}.png`), `Trong game: ${r.skill} · bấm ở 0 ms · viền đỏ = khung vung của pose (${s2(r.hit[0])}–${s2(r.hit[1])} s sau lúc vào thế); server áp ở ${s2(r.serverAt)} s`, rowsOf, { x: 170, y: 170, w: 600, h: 450 });
}

async function gameShots(ctx: BrowserContext, errors: string[]): Promise<void> {
  const page = await enter(ctx, 'ShotK1');
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await gm(page, 'level 12');
  await gm(page, 'god on');
  await page.evaluate(() => {
    const g = (window as unknown as G).__game!;
    g.camYaw = 0.6;
    g.camPitch = 0.3;
    g.camDist = 4.5;
  });
  let cur = '';
  for (const r of rows) {
    const m = r.method || 'lac_kiem_quyet';
    if (cur !== m) {
      await gm(page, `method ${m} 5`);
      cur = m;
    }
    await gm(page, 'killall', 900);
    await gm(page, 'spawn mon_soi_xam 3', 1500);
    await gm(page, 'heal', 700);
    await gm(page, 'cd', 700);
    if (r.ult) await gm(page, 'charge 100', 1250);
    let p2: Page | null = null;
    if (r.skill === 'skl_hoi_thien_dan_lo') {
      p2 = await enter(ctx, 'ShotK1b');
      await gm(p2, 'level 12');
      await gm(p2, 'god on');
      await gm(p2, 'die');
      await page.bringToFront();
      await sleep(800);
    }
    let slot = -1;
    for (let tries = 0; tries < 10 && slot < 0; tries++) {
      slot = await page.evaluate((id) => (window as unknown as G).__game!.bar().findIndex((s: { id: string }) => s.id === id), r.skill);
      if (slot < 0) await sleep(500);
    }
    if (slot < 0) throw new Error('không thấy chiêu trên thanh: ' + r.skill);
    await gameSheet(ctx, page, slot, r, Math.max(1200, (r.cast + r.duration + 0.3) * 1000));
    await sleep(1000);
    await p2?.close();
  }
}

function tableMd(): string {
  const all = allSkillTimings();
  const head = '| Chiêu | Pose | Công pháp | Thời lượng | Khung khóa (s) | Vào thế → ra đòn | Khung vung (s) | Thu về | Niệm | Server áp | Hình ra đòn | FX + số | Chênh hình−server | CD |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const line = (r: SkillTiming) =>
    `| \`${r.skill}\` | \`${r.pose}\` | ${r.method || 'gốc'}${r.ult ? ' (ult)' : ''} | ${s2(r.duration)} | ${r.keys.length}: ${r.keys.map((k) => s2(k)).join(' · ')} | ${s2(r.windup)} | ${s2(r.hit[0])}–${s2(r.hit[1])} | ${s2(r.recovery)} | ${s2(r.cast)} | ${s2(r.serverAt)} | ${s2(r.visualAt)} | ${s2(r.fxAt)} | ${r.gap >= 0 ? '+' : ''}${s2(r.gap)} | ${r.cd} |`;
  return `${head}\n${all.map(line).join('\n')}\n`;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  if (MODE === 'table' || MODE === 'all') {
    fs.writeFileSync(path.join(OUT, 'bang-thoi-gian.md'), tableMd());
    console.log('[shots-k1] bang-thoi-gian.md');
    if (MODE === 'table') return;
  }
  await dev.start();
  const browser = await launch();
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
    if (MODE === 'viewer' || MODE === 'all') await viewerShots(ctx, errors);
    if (MODE === 'game' || MODE === 'all') await gameShots(ctx, errors);
    if (MODE === 'voices') await voiceShots(ctx, errors);
    if (errors.length) console.warn(`[shots-k1] ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
    await ctx.close();
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
