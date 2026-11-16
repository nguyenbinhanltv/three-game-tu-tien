// pnpm shots:e3a --out <thư mục tuyệt đối>: ảnh Vân Hải Phù Đảo (E3-A/E3-N). Vào Vân Lam bằng đăng nhập thử, `/gm tp vh_hub` (vé liên level),
// chụp hub, từng vùng, điểm đáng chú ý, cầu xích, sàn mây (sau khi rơi khỏi cầu), đảo giả trước/sau khi quét thần thức, bản đồ lớn. Tắt tiếng.
//   tsx src/shots-e3a.ts --out <thư mục> [--renderer webgpu|webgl2] [--preset low|medium|high] [--size 1280x720] [--only a,b]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2697/5297) với DB tạm rồi tắt.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { terrainOf } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-e3a'));
const RENDERER = opt('--renderer', 'webgpu');
const PRESET = opt('--preset', 'medium');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2697);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5297);

type G = { __game?: Record<string, any> };
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-e3a', command: 'pnpm shots:e3a' });

const lv = LEVELS.van_hai;
const tr = terrainOf('van_hai');
const bridges = tr.def.bridges ?? [];
const fakes = tr.def.fakeIslands ?? [];
const centroid = (poly: [number, number][]): [number, number] => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];

interface Shot {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  dist: number;
}
const shots: Shot[] = [{ name: 'hub', x: 1024, z: 1040, yaw: 0, pitch: 0.3, dist: 20 }];
for (const z of lv.zones ?? []) {
  const [x, zz] = centroid(z.poly);
  shots.push({ name: `zone-${z.id}`, x, z: zz, yaw: 0, pitch: 0.3, dist: 16 });
}
for (const p of lv.pois ?? []) shots.push({ name: `poi-${p.id}`, x: p.x, z: p.z + 16, yaw: 0, pitch: 0.25, dist: 22 });

async function gm(page: Page, cmd: string): Promise<void> {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(900);
}
const cam = (page: Page, c: { yaw: number; pitch: number; dist: number }) =>
  page.evaluate((v) => {
    const g = (window as unknown as G).__game!;
    g.camYaw = v.yaw;
    g.camPitch = v.pitch;
    g.camDist = v.dist;
  }, c);
async function gotoXZ(page: Page, x: number, z: number): Promise<void> {
  await gm(page, `tp ${Math.round(x)} ${Math.round(z)}`);
  await gm(page, 'heal');
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    const s = await page.evaluate(() => {
      const g = (window as unknown as G).__game!;
      return { x: g.renderPos.x, z: g.renderPos.z };
    });
    if (Math.hypot(s.x - x, s.z - z) < 3) break;
    await sleep(300);
  }
}
const want = (n: string) => !ONLY.length || ONLY.includes(n);

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality', ${JSON.stringify(PRESET)});` });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 600)));
    await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=E3A_Shots${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const g = (window as unknown as G).__game;
      return !!g && g.frames > 30 && !!g.me?.();
    }, undefined, { timeout: 120_000, polling: 250 });
    await page.keyboard.press('Shift');
    await sleep(600);
    await gm(page, 'level 20');
    await gm(page, 'god on');
    await gm(page, 'tele all');
    await gm(page, 'tp vh_hub');
    await page.waitForFunction(() => (window as unknown as G).__game?.shownLevel === 'van_hai', undefined, { timeout: 90_000, polling: 300 });
    await sleep(4000);
    log.backend = await page.evaluate(() => (window as unknown as G).__game?.rendererName ?? '?');
    console.log('[shots-e3a] đã vào van_hai, renderer', log.backend);
    const snap = async (name: string) => {
      await sleep(Number(process.env.SHOT_SETTLE ?? 2500));
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log(`[shots-e3a] ${name}`);
    };

    for (const s of shots) {
      if (!want(s.name)) continue;
      await gotoXZ(page, s.x, s.z);
      await cam(page, s);
      await snap(s.name);
    }

    // Toàn cảnh từ trên cao (ngự kiếm lên cao rồi nhìn xuống): chỉ đặt camera xa, nhìn chếch.
    if (want('overview')) {
      await gotoXZ(page, 1024, 1040);
      await cam(page, { yaw: 0.6, pitch: 0.95, dist: 520 });
      await snap('overview');
    }

    // Cầu xích: đứng ở đầu cầu Thạch Quy nhìn dọc cầu; rồi đứng giữa cầu nhìn xuống.
    const bThach = bridges.find((b) => b.id.includes('thach_quy') && b.id.startsWith('cau_phu_dao_cac')) ?? bridges[1];
    if (bThach && want('cau-xich')) {
      const dx = bThach.bx - bThach.ax;
      const dz = bThach.bz - bThach.az;
      const L = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz); // camYaw: hướng nhìn dọc cầu (thử; nếu ngược thì ảnh nhìn từ phía kia)
      await gotoXZ(page, bThach.ax + (dx / L) * 6, bThach.az + (dz / L) * 6);
      await cam(page, { yaw: Math.PI + yaw, pitch: 0.2, dist: 14 });
      await snap('cau-xich');
      await gotoXZ(page, bThach.ax + dx / 2, bThach.az + dz / 2);
      await cam(page, { yaw: yaw + 0.8, pitch: 0.35, dist: 18 });
      await snap('cau-giua');
      log.bridgeMid = await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        return { y: g.renderPos.y };
      });

      // Rơi khỏi cầu: đi ngang (A/D) ra mép; kiểm tra rơi xuống sàn mây, còn sống, đi bộ được.
      const y0 = (log.bridgeMid as { y: number }).y;
      await page.evaluate((c) => {
        const g = (window as unknown as G).__game!;
        g.camYaw = c;
      }, yaw);
      await page.keyboard.down('KeyD');
      await sleep(1100);
      await page.keyboard.up('KeyD');
      await sleep(300);
      await cam(page, { yaw: yaw + 0.3, pitch: 0.3, dist: 26 });
      await sleep(500);
      await page.screenshot({ path: path.join(OUT, 'roi-khoi-cau.png') });
      await sleep(3500);
      const after = await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        return { y: g.renderPos.y, hp: g.me?.().hp, mhp: g.me?.().mhp };
      });
      log.fall = { from: y0, after, floor: tr.def.voidFloor };
      console.log('[shots-e3a] rơi:', JSON.stringify(log.fall));
      await snap('san-may');
      await page.keyboard.down('KeyW');
      await sleep(1500);
      await page.keyboard.up('KeyW');
      log.walkedOnFloor = await page.evaluate(() => (window as unknown as G).__game!.renderPos.y);
    }

    // Thang mây: đứng ở chân thang trên sàn mây nhìn lên mép đảo.
    const ramp = bridges.find((b) => b.id === 'thang_phu_dao_cac');
    if (ramp && want('thang-may')) {
      const dx = ramp.bx - ramp.ax;
      const dz = ramp.bz - ramp.az;
      const L = Math.hypot(dx, dz);
      await gotoXZ(page, ramp.ax + (dx / L) * 4, ramp.az + (dz / L) * 4);
      await cam(page, { yaw: Math.PI + Math.atan2(dx, dz), pitch: 0.05, dist: 16 });
      await snap('thang-may');
    }

    // Đảo giả: trước và sau khi quét thần thức (giữ V ~3 s).
    const fk = fakes[0];
    if (fk && want('dao-gia')) {
      const side = 70;
      await gotoXZ(page, fk.x - side, fk.z);
      await gm(page, 'god on');
      // đứng trên cao một chút để thấy đảo giả như đảo thật: tp tới sát đảo thật gần nhất, rồi nhìn sang
      await cam(page, { yaw: -Math.PI / 2, pitch: -0.3, dist: 16 });
      await snap('dao-gia-truoc');
      await page.keyboard.down('KeyV');
      await sleep(3200);
      await page.keyboard.up('KeyV');
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, 'dao-gia-sau-quet.png') });
      console.log('[shots-e3a] dao-gia-sau-quet');
      log.fakeRevealed = await page.evaluate(() => (window as unknown as G).__game?.skyRevealed?.() ?? null);
    }

    // Bản đồ lớn (phím M) ở hub.
    if (want('worldmap')) {
      await gm(page, 'tp vh_hub');
      await sleep(2500);
      await page.keyboard.press('KeyM');
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, 'worldmap.png') });
      await page.keyboard.press('Escape');
      await sleep(500);
    }
    fs.writeFileSync(path.join(OUT, 'shots-e3a.json'), JSON.stringify(log, null, 2));
    if (errors.length) console.warn(`[shots-e3a] ${errors.length} lỗi console:\n  ` + [...new Set(errors)].slice(0, 8).join('\n  '));
    await ctx.close();
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => {
  console.error('[shots-e3a] lỗi:', e instanceof Error ? e.message : e);
  dev.stop();
  process.exit(1);
});
