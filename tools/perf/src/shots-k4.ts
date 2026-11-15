// pnpm shots:k4: ảnh trong game của hệ animation K-4 (máy trạng thái chiêu, lớp thân trên/dưới, hủy thu về, lao người, trúng đòn có hướng, ngã/đứng dậy).
//   tsx src/shots-k4.ts --out <thư mục> [--genders m,f] [--only combo,skill,dashcancel,movecancel,locomotion,hit,knockdown] [--renderer webgpu|webgl2]
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
const OUT = path.resolve(opt('--out', 'shots-k4'));
const GENDERS = opt('--genders', 'm,f').split(',');
const ONLY = opt('--only', 'combo,skill,dashcancel,movecancel,locomotion,hit,knockdown').split(',');
const RENDERER = opt('--renderer', 'webgpu');
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);
const SC_DIST = Number(opt('--dist', '3.4'));
const TILE = Number(opt('--tile', '130'));

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-k4', command: 'pnpm shots:k4' });
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
  console.log(`[shots-k4] ${path.basename(file)}`);
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

const hasWolf = (page: Page) => page.evaluate(() => [...(window as unknown as G).__game!.view.monsters.values()].some((m: { st: number }) => m.st !== 3));

async function scene(page: Page, wolves = 1): Promise<void> {
  await gm(page, 'killall', 900);
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
  try {
    for (const g of GENDERS) for (const sc of ONLY) {
      // Mỗi kịch bản một phiên game mới: tab dùng lại cho khung screencast co nhỏ sau lần ghi đầu.
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
      const page = await ctx.newPage();
      const name = `K4${g}${String(Date.now() % 10000)}`;
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const w = (window as unknown as G).__game;
        return !!w && w.frames > 30 && !!w.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 12', 1600);
      await gm(page, 'god on', 1600);
      await gm(page, 'method lac_kiem_quyet 5', 1200);
      await gm(page, 'tp 2048 2088', 1600);
      // Chờ thư viện K-3 nạp lười xong (đi lùi/ngang, thủ thế, trúng đòn có hướng, ngã/đứng dậy).
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game!;
        const m = g.ents?.players.get(g.sid)?.model;
        return !!m && m.dirHits === true;
      }, undefined, { timeout: 60_000, polling: 300 });
      const title = (s: string) => `${s} · ${g === 'm' ? 'Thanh Phong (nam)' : 'Lam Chi (nữ)'} · mỗi ô ${TILE} ms, viền đỏ = khung phát sự kiện hit`;
      const out = (n: string) => path.join(OUT, `${g === 'm' ? 'nam' : 'nu'}-${n}.png`);
      const press = (i: number) => page.evaluate((s) => (window as unknown as G).__game!.useSkill(s), i);

      if (sc === 'combo') {
        await scene(page);
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 4200, async () => {
          for (let k = 0; k < 3; k++) {
            await press(0);
            await sleep(1050);
          }
        });
        await sheet(ctx, out('combo-3-don'), title('Đánh thường liên hoàn 3 đòn (bấm lúc 0, 1050, 2100 ms)'), r.shots);
        log[`${g}-combo`] = r.events;
      }
      if (sc === 'skill') {
        await scene(page);
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 1700, async () => {
          await press(1);
        });
        await sheet(ctx, out('chieu-kiem-khi-tram'), title('Dãy khung một chiêu (Kiếm Khí Trảm): vào thế → hitAt → thu về → thủ thế'), r.shots);
        log[`${g}-skill`] = r.events;
      }
      if (sc === 'dashcancel') {
        // Chiêu Hộ Thể (ô 3, không cần mục tiêu): lướt (Q) ở 480 ms, sau mốc cancel.dash (380 ms), cắt phần thu về; không sói nên lướt đủ 8 m.
        await scene(page, 0);
        await closeCam(page, SC_DIST);
        await gm(page, 'cd', 600);
        const r = await record(ctx, page, 1800, async () => {
          await press(2);
          await sleep(480);
          await page.evaluate(() => (window as unknown as G).__game!.useDash());
        });
        jobs.push(() => sheet(sheetCtx, out('luot-huy-thu-ve'), title('Lướt (Q) ở 480 ms hủy thu về của chiêu Hộ Thể: hình trượt từ chỗ cũ tới chỗ server đặt (8 m)'), r.shots));
        log[`${g}-dashcancel`] = r.events;
      }
      if (sc === 'movecancel') {
        await scene(page);
        await closeCam(page, SC_DIST);
        await gm(page, 'cd', 600);
        const r = await record(ctx, page, 1500, async () => {
          await press(1);
          await page.keyboard.down('KeyW');
          await sleep(1000);
          await page.keyboard.up('KeyW');
        });
        await sheet(ctx, out('di-chuyen-huy-thu-ve'), title('Giữ W ngay khi ra chiêu: chân chạy, thân trên vung, hết đòn thì cắt thu về (cancel.move)'), r.shots);
        log[`${g}-movecancel`] = r.events;
      }
      if (sc === 'locomotion') {
        await scene(page);
        await closeCam(page, SC_DIST);
          const r = await record(ctx, page, 4200, async () => {
          for (const k of ['KeyS', 'KeyA', 'KeyD']) {
            await page.keyboard.down(k);
            await sleep(1100);
            await page.keyboard.up(k);
            await sleep(150);
          }
        });
        await sheet(ctx, out('di-lui-di-ngang'), title('Đi lùi (S) → ngang trái (A) → ngang phải (D) bằng clip K-3'), r.shots, 10);
      }
      if (sc === 'hit') {
        // Gọi phản ứng trúng đòn của model từ 4 phía rồi một đòn nặng (chỉ hình, giống lúc S.DMG tới): trước, phải, sau, trái, nặng.
        await scene(page, 0);
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 5600, async () => {
          for (const k of ['front', 'right', 'back', 'left', 'heavy']) {
            await page.evaluate((kind) => {
              const gm2 = (window as unknown as G).__game!;
              const m = gm2.ents.players.get(gm2.sid).model;
              const yaw = m.root.rotation.y;
              const f = [Math.sin(yaw), Math.cos(yaw)];
              const l = [Math.cos(yaw), -Math.sin(yaw)];
              // Hướng giật = từ kẻ đánh tới nạn nhân (kẻ đánh đứng ở phía `kind`).
              const from = kind === 'front' ? f : kind === 'back' ? [-f[0], -f[1]] : kind === 'left' ? l : [-l[0], -l[1]];
              m.hitReact({ dirX: -from[0], dirZ: -from[1], noStop: true, heavy: kind === 'heavy', crit: kind === 'heavy' });
            }, k);
            await sleep(1100);
          }
        });
        jobs.push(() => sheet(sheetCtx, out('trung-don-co-huong'), title('Trúng đòn theo hướng: trước (0 ms), phải (1100), sau (2200), trái (3300), đòn nặng (4400)'), r.shots));
      }
      if (sc === 'knockdown') {
        await scene(page, 0);
        await closeCam(page, SC_DIST);
        const r = await record(ctx, page, 5400, async () => {
          await page.evaluate(() => {
            const gm2 = (window as unknown as G).__game!;
            gm2.ents.players.get(gm2.sid).model.knockdown();
          });
          await sleep(5200);
        });
        await sheet(ctx, out('nga-dung-day'), title('Bị hất ngã (knockdown) rồi tự đứng dậy (getup) về thủ thế'), r.shots, 10);
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
