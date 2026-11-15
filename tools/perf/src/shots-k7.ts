// pnpm shots:k7: kiểm cảm giác đòn K-7 trong game thật (tắt tiếng): dãy khung cận cảnh, nhật ký hit → âm, FOV cận cảnh chiêu tối thượng, rung.
//   tsx src/shots-k7.ts --out <thư mục> [--only combo,ult,boss] [--renderer webgpu|webgl2] [--method lac_kiem_quyet|...]
// Vào game bằng tài khoản thử (nam/nữ), dựng cảnh bằng lệnh GM, làm từng kịch bản và ghi màn hình bằng CDP screencast (khung dày, có dấu thời gian):
// mỗi tờ ảnh là một kịch bản, mỗi ô ghi số ms thật kể từ lúc bấm; viền đỏ = khung có sự kiện `hit` (đúng khung hitAt). Cùng lúc ghi `skill-events.json`
// (nhật ký sự kiện chiêu của game: kind, mốc, thời điểm).
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2603/5203); luôn ?mute=1 và --mute-audio; GPU thật.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-k7'));
const GENDERS = ['m'];
const ONLY = opt('--only', 'combo,ult,boss').split(',');
const RENDERER = opt('--renderer', 'webgpu');
/** Công pháp của nhân vật chụp (K-5: chọn giọng động tác); khác kiếm tu thì thêm hậu tố vào tên ảnh. */
const METHOD = opt('--method', 'lac_kiem_quyet');
const TAG = METHOD === 'lac_kiem_quyet' ? '' : `-${METHOD}`;
const PORT = Number(process.env.PORT ?? 2603);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5203);
const SC_DIST = Number(opt('--dist', '3.4'));
const TILE = Number(opt('--tile', '130'));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-k7', command: 'pnpm shots:k7' });
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
  const p = await ctx.newPage();
  const rows: (typeof shots)[] = [];
  for (let i = 0; i < shots.length; i += per) rows.push(shots.slice(i, i + per));
  const cell = Math.min(300, Math.floor(1800 / Math.min(per, shots.length)));
  const html = `<body style="margin:0;background:#161b21;color:#e7e3d8;font:12px system-ui"><div style="padding:8px 12px;font-size:15px;color:#d8b36a">${title}</div>${rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:flex-start">${r
          .map((s) => `<figure style="margin:2px;width:${cell}px"><img src="${s.url}" style="display:block;width:${cell}px;${s.mark ? 'outline:3px solid #d85a46' : ''}"><figcaption style="padding:2px 4px">${s.label}</figcaption></figure>`)
          .join('')}</div>`,
    )
    .join('')}</body>`;
  await p.setViewportSize({ width: Math.min(per, shots.length) * (cell + 4) + 8, height: 800 });
  await p.setContent(html);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
  console.log(`[shots-k7] ${path.basename(file)}`);
}

/** Chạy `act` (bắt đầu bằng mốc 0 ms) trong khi ghi màn hình, trả các ô cách nhau TILE ms và nhật ký sự kiện chiêu. */
async function record(ctx: BrowserContext, page: Page, span: number, act: () => Promise<void>): Promise<{ shots: { label: string; url: string; mark?: boolean }[]; events: { ms: number; kind: string; index: number; combo: number; t: number }[] }> {
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
  await act();
  const elapsed = (await page.evaluate(() => performance.now())) - t0p;
  await sleep(Math.max(0, span - elapsed));
  await cdp.send('Page.stopScreencast');
  const evs = (await page.evaluate(() => (window as unknown as G).__game!.skillLog as Ev[])) as Ev[];
  const events = evs.map((x) => ({ ms: Math.round(x.at - t0p), kind: x.e.kind, index: x.e.index, combo: x.e.combo, t: Math.round(x.e.t * 1000) / 1000 }));
  const hitMs = events.filter((e) => e.kind === 'hit').map((e) => e.ms);
  const shots: { label: string; url: string; mark?: boolean }[] = [];
  for (let ms = 0; ms <= span; ms += TILE) {
    const f = frames.reduce<{ at: number; data: string } | null>((b, x) => (!b || Math.abs(x.at - t0 - ms) < Math.abs(b.at - t0 - ms) ? x : b), null);
    if (!f) continue;
    const real = Math.round(f.at - t0);
    if (Math.abs(real - ms) > 90) continue;
    shots.push({ label: `${real} ms${hitMs.filter((h) => Math.abs(h - real) <= TILE / 2 + 10).length ? ' · hit' : ''}`, url: 'data:image/jpeg;base64,' + f.data, mark: hitMs.some((h) => Math.abs(h - real) <= TILE / 2 + 10) });
  }
  return { shots, events };
}


async function scene(page: Page, spawn: string): Promise<void> {
  await gm(page, 'killall', 900);
  await gm(page, 'heal', 600);
  await gm(page, 'cd', 600);
  await gm(page, `spawn ${spawn}`, 1800);
  await page.evaluate(() => (window as unknown as G).__game!.clearTarget());
}

type SoundLog = { skill: string; index: number; lagMs: number; sfx: string; rate: number; layers: string[] };
const soundLog = (page: Page) => page.evaluate(() => ((window as unknown as { __sound?: { hits: () => unknown[] } }).__sound?.hits() ?? []) as SoundLog[]);

async function main(): Promise<void> {
  void GENDERS;
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    for (const sc of ONLY) {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'m',dye:'attire_sect'}));` });
      const page = await ctx.newPage();
      const name = `K7${String(Date.now() % 100000)}`;
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 12', 1600);
      await gm(page, 'god on', 1600);
      await gm(page, `method ${METHOD} 5`, 1200);
      await gm(page, 'tp 2048 2088', 1600);
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game!;
        const m = g.ents?.players.get(g.sid)?.model;
        return !!m && m.dirHits === true;
      }, undefined, { timeout: 60_000, polling: 300 });
      const press = (i: number) => page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);
      const out = (n: string) => path.join(OUT, `${n}.png`);
      const title = (s: string) => `${s} · mỗi ô ${TILE} ms, viền đỏ = khung phát sự kiện hit`;
      // Ghi FOV mỗi khung để kiểm cú đẩy cận cảnh.
      await page.evaluate(`(function(){var g=window.__game;window.__fov=[];function tick(){window.__fov.push({t:performance.now(),fov:g.camera.fov});if(window.__fov.length>900)window.__fov.shift();requestAnimationFrame(tick);}requestAnimationFrame(tick);})()`);

      if (sc === 'combo') {
        await scene(page, 'mon_soi_xam 1');
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 4200, async () => {
          for (let k = 0; k < 3; k++) {
            await press(0);
            await sleep(1050);
          }
        });
        await sheet(ctx, out('combo-3-don'), title('Liên hoàn 3 đòn: đòn 3 khựng 55/30 ms, rung 0,12'), r.shots);
        log.combo = { events: r.events, sound: await soundLog(page) };
      }
      if (sc === 'ult') {
        await scene(page, 'mon_soi_xam 3');
        await closeCam(page, SC_DIST);
        await gm(page, 'cd', 600);
        await sleep(2000);
        await gm(page, 'charge 100', 1500);
        await page.evaluate(() => {
          const g = (window as unknown as G).__game!;
          const m = [...g.view.monsters.entries()].find(([, v]: [string, { st: number }]) => v.st !== 3);
          if (m) g.setTarget(m[0], 'mon');
        });
        const r = await record(ctx, page, 1800, async () => {
          // Thanh chiêu: 6 chiêu chung, chiêu đặc trưng (ô 6), tối thượng (ô 7).
          await press(7);
          await sleep(300);
          log.ultDebug = await page.evaluate(() => {
            const g = (window as unknown as G).__game!;
            return { bar: g.bar().map((x: { id: string }) => x.id), target: g.targetId, toasts: [...document.querySelectorAll('[class*=toast]')].map((e) => e.textContent) };
          });
        });
        await sheet(ctx, out('toi-thuong-can-canh'), title('Chiêu tối thượng: FOV +1,5° trong 80 ms, rung 0,6, khựng 90/50 ms'), r.shots);
        const fov = await page.evaluate(() => (window as unknown as { __fov: { t: number; fov: number }[] }).__fov);
        const lo = Math.min(...fov.map((x) => x.fov));
        const hi = Math.max(...fov.map((x) => x.fov));
        log.ult = { events: r.events, sound: await soundLog(page), fov: { min: lo, max: hi, punch: Math.round((hi - lo) * 100) / 100 } };
      }
      if (sc === 'boss') {
        await scene(page, 'boss_kiem_khoi 1');
        await closeCam(page, 6);
        const r = await record(ctx, page, 4200, async () => {
          for (let k = 0; k < 4; k++) {
            await press(0);
            await sleep(900);
            await press(1);
            await sleep(100);
          }
        });
        await sheet(ctx, out('boss-giao-chien'), title('Đánh boss Kiếm Khôi: hit-stop boss ×0,75'), r.shots);
        log.boss = { events: r.events, sound: await soundLog(page) };
      }
      await ctx.close();
    }
    fs.writeFileSync(path.join(OUT, 'k7-log.json'), JSON.stringify(log, null, 1));
    if (errors.length) console.log('[shots-k7] lỗi console:\n' + [...new Set(errors)].join('\n'));
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
