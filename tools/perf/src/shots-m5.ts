// pnpm shots:m5: ảnh năm điểm đáng chú ý của M-5 (miếu đổ, linh tuyền, đình nghỉ, bia đá, đài canh hồ): gần + từ xa, ngày + đêm.
//   tsx src/shots-m5.ts --out <thư mục> [--renderer webgpu|webgl2] [--moods day,night] [--only mieu_do,...]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2600/5200), tắt tiếng (?mute=1, --mute-audio), tài khoản thử bất tử.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-m5'));
const RENDERER = opt('--renderer', 'webgpu');
const MOODS = opt('--moods', 'day,night').split(',');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2600);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5200);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-m5', command: 'pnpm shots:m5' });
type G = { __game?: Record<string, any> };

// Điểm (khớp levels/van_lam.json pois), npc đứng cạnh nếu có, vị trí đứng xa (180–320 m, chọn bằng quét tầm nhìn: thấy từ chân tới giữa cột, mắt cao 6 m).
const POIS = [
  { id: 'mieu_do', x: 2010, z: 2376, far: [2010, 2601], npc: 'npc_mieu_cong' },
  { id: 'linh_tuyen', x: 2414, z: 2443, far: [2414, 2293], npc: 'npc_tieu_khe' },
  { id: 'dinh_nghi', x: 2451, z: 2010, far: [2359, 2216], npc: 'npc_hai_duoc' },
  { id: 'bia_da', x: 2419, z: 1795, far: [2502, 1652], npc: '' },
  { id: 'dai_ho', x: 1490, z: 2288, far: [1582, 2082], npc: '' },
];

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};

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

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const errors: string[] = [];
  try {
    for (const mood of MOODS) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
      const name = `Co${mood}${String(Date.now() % 10000)}`;
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&mood=${mood}&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game;
        return !!g && g.frames > 30 && !!g.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await gm(page, 'level 12');
      await gm(page, 'god on');
      const cam = (yaw: number, pitch: number, dist: number) =>
        page.evaluate(([y, p, d]) => {
          const g = (window as unknown as G).__game!;
          g.camYaw = y;
          g.camPitch = p;
          g.camDist = d;
        }, [yaw, pitch, dist] as const);
      const shot = async (file: string) => {
        await page.screenshot({ path: path.join(OUT, file) });
        console.log(`[shots-m5] ${file}`);
      };
      for (const p of POIS) {
        if (ONLY.length && !ONLY.includes(p.id)) continue;
        // Gần: đứng 12 m phía nam điểm, nhìn về bắc.
        await gm(page, `tp ${p.x} ${p.z + 12}`, 900);
        await cam(0, 0.22, 8);
        await sleep(6000);
        await shot(`${p.id}-${mood}-gan.png`);
        // Cận cảnh góc chéo, thấp.
        await cam(0.9, 0.12, 6);
        await sleep(900);
        await shot(`${p.id}-${mood}-can.png`);
        // Xa: đứng ~260 m, nhìn thẳng về điểm.
        const [fx, fz] = p.far;
        await gm(page, `tp ${fx} ${fz}`, 900);
        const yaw = Math.atan2(-(p.x - fx), -(p.z - fz));
        await cam(yaw, 0.1, 5);
        await sleep(5000);
        await shot(`${p.id}-${mood}-xa.png`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-m5] lỗi console:\n' + errors.slice(0, 12).join('\n'));
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
