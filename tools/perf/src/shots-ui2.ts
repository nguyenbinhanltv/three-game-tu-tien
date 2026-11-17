// pnpm shots:ui2: ảnh trước/sau của HUD kiểu Ngọc Giản (UI-2) cùng góc ở 5 cảnh (Lạc Kiếm Tông, Đoạn Mạch, Vân Hải, đánh boss, ban đêm)
// ở 1080p và 1440p, kèm đo chi phí CPU của trang (CDP) giữa HUD cũ (?ngj=0) và mới.
//   tsx src/shots-ui2.ts --out <thư mục tuyệt đối> [--scenes lac_kiem,doan_mach,van_hai,boss,dem]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2688/5288); luôn ?mute=1 và --mute-audio. Ghi ui2-metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ui2'));
const PORT = Number(process.env.PORT ?? 2688);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5288);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-ui2', command: 'pnpm shots:ui2' });
type G = { __game?: Record<string, any> };

interface Scene {
  id: string;
  query: string;
  gm?: string[];
  /** Nhận nhiệm vụ để theo dõi nhiệm vụ có chữ: đứng cạnh NPC giao rồi về điểm chụp. */
  quests?: { ids: string[]; at: [number, number]; home: [number, number] };
  keys?: string[];
  wait?: number;
  cam?: { yaw?: number; pitch?: number; dist?: number };
}
const SCENES: Scene[] = [
  { id: 'lac_kiem', query: 'realm=nk12&at=tong_mon', gm: ['/gm heal'], quests: { ids: ['q_dan_khi'], at: [2048, 2034], home: [2048, 2088] }, wait: 2500 },
  { id: 'doan_mach', query: 'realm=17&at=dm_tram', gm: ['/gm qdone q_truc_co', '/gm qdone q2_thu_ha_son'], quests: { ids: ['q2_mach_tinh'], at: [1010, 1050], home: [1024, 1036] }, wait: 4000 },
  { id: 'van_hai', query: 'realm=22', gm: ['/gm qdone q_truc_co', '/gm qdone chuong2', '/gm qdone q2_ket_dan', '/gm qdone q3_len_may', '/gm tele vh_tp_hub', '/gm tp vh_hub'], quests: { ids: ['s3_do_thuyen'], at: [1048, 1053.5], home: [1024, 1036] }, wait: 4000 },
  { id: 'boss', query: 'realm=nk15&at=boss', gm: ['/gm tp 1640 2252'], keys: ['Tab', 'Tab'], wait: 6000, cam: { dist: 14, pitch: 0.35 } },
  { id: 'dem', query: 'realm=nk12&at=tong_mon&mood=night', quests: { ids: ['q_dan_khi'], at: [2048, 2034], home: [2048, 2088] }, wait: 2500 },
];
const only = opt('--scenes', '').split(',').filter(Boolean);
const SIZES = [
  ['1080p', 1920, 1080],
  ['1440p', 2560, 1440],
] as const;

const gm = async (page: Page, m: string) => {
  await page.evaluate((x) => (window as unknown as G).__game!.send('chat', { m: x }), m);
  await sleep(1300);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const metrics: Record<string, unknown> = {};
  try {
    for (const sc of SCENES.filter((s) => !only.length || only.includes(s.id))) {
      for (const variant of ['truoc', 'sau'] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
        const name = 'Ui2' + sc.id.slice(0, 3) + variant.slice(0, 1) + (Date.now() % 10000);
        await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
        await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=${name}&god=1&${sc.query}&ngj=${variant === 'sau' ? 1 : 0}`, { waitUntil: 'load' });
        await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
        await sleep(sc.wait ?? 2500);
        for (const c of sc.gm ?? []) await gm(page, c);
        if (sc.quests) {
          {
            await gm(page, `/gm tp ${sc.quests.at[0]} ${sc.quests.at[1]}`);
            await sleep(2500);
            for (const id of sc.quests.ids) {
              await page.evaluate((q) => (window as unknown as G).__game!.send('q', { a: 'accept', id: q }), id);
              await sleep(800);
            }
            await gm(page, `/gm tp ${sc.quests.home[0]} ${sc.quests.home[1]}`);
            await sleep(3000);
          }
        }
        for (const k of sc.keys ?? []) {
          await page.keyboard.press(k);
          await sleep(600);
        }
        if (sc.cam) await page.evaluate((c) => { const g = (window as unknown as G).__game!; if (c.yaw !== undefined) g.camYaw = c.yaw; if (c.pitch !== undefined) g.camPitch = c.pitch; if (c.dist !== undefined) { g.camDist = c.dist; g.camDistCur = c.dist; } }, sc.cam);
        await sleep(1500);
        for (const [tag, w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          await sleep(1200);
          await page.screenshot({ path: path.join(OUT, `${sc.id}-${variant}-${tag}.jpg`), type: 'jpeg', quality: 86 });
        }
        // chi phí CPU của trang trong 5 giây ở 1080p (CDP), cùng cảnh, chỉ khác HUD
        await page.setViewportSize({ width: 1920, height: 1080 });
        await sleep(800);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Performance.enable');
        const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        const a = await read();
        const f0 = await page.evaluate(() => (window as unknown as G).__game!.frames as number);
        await sleep(5000);
        const b = await read();
        const f1 = await page.evaluate(() => (window as unknown as G).__game!.frames as number);
        const frames = Math.max(1, f1 - f0);
        const per = (k: string) => +((((b[k] as number) - (a[k] as number)) * 1000) / frames).toFixed(3);
        const info = await page.evaluate(() => { const i = (window as unknown as G).__game!.info?.(); return i ? { draw: i.drawCalls ?? i.calls, tris: i.triangles ?? i.tris } : null; });
        const hud = await page.evaluate(() => ({ bossBar: !!document.querySelector('.boss-bar'), tracker: !!document.querySelector('.tracker'), level: (window as unknown as G).__game!.view?.level }));
        metrics[`${sc.id}-${variant}`] = { framesIn5s: frames, taskMsPerFrame: per('TaskDuration'), scriptMsPerFrame: per('ScriptDuration'), layoutMsPerFrame: per('LayoutDuration'), styleMsPerFrame: per('RecalcStyleDuration'), ...info, hud, errors: errors.slice(0, 5) };
        await ctx.close();
      }
    }
    fs.writeFileSync(path.join(OUT, 'ui2-metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
