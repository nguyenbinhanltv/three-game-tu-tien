// pnpm shots:ual: video trước/sau khi dùng clip UAL (Quaternius CC0) trong game.
//   tsx src/shots-ual.ts --out <thư mục tuyệt đối> [--genders m,f] [--chr v1,v2] [--variants old,new]
// Mỗi (giới × đời nhân vật × bản) một video webm: đứng nghỉ → nhảy → lướt (Q) → trúng đòn trước/nặng → ngã/đứng dậy → thủ thế → chết → hồi sinh.
// `old` = `?ual=0` (clip K-3 cũ), `new` = có UAL. Luôn ?mute=1 và --mute-audio. Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2685/5185).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './lib/devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ual'));
const GENDERS = opt('--genders', 'm,f').split(',');
const CHRS = opt('--chr', 'v1,v2').split(',');
const VARIANTS = opt('--variants', 'old,new').split(',');
const PORT = Number(process.env.PORT ?? 2685);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5185);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-ual', command: 'pnpm shots:ual' });
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 900) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const model = (page: Page, fn: string) => page.evaluate((f) => { const g = (window as unknown as G).__game!; return new Function('g', 'm', f)(g, g.ents.players.get(g.sid).model); }, fn);

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
    for (const g of GENDERS) for (const chr of CHRS) for (const v of VARIANTS) {
      const tag = `${g === 'm' ? 'nam' : 'nu'}-${chr}-${v}`;
      const dir = path.join(OUT, `_rec-${tag}`);
      const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, recordVideo: { dir, size: { width: 960, height: 600 } } });
      await ctx.addInitScript({ content: `localStorage.setItem('dtl.quality','high');localStorage.setItem('dtl.controls','strafe');localStorage.setItem('dtl.look',JSON.stringify({g:'${g}',dye:'attire_sect'}));` });
      const page = await ctx.newPage();
      const tPage = Date.now();
      const name = `U${g}${chr}${v[0]}${String(Date.now() % 10000)}`;
      page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /models/.test(m.text()))) && errors.push(`${tag}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${chr === 'v2' ? '&chr=v2' : ''}${v === 'old' ? '&ual=0' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await page.addStyleTag({ content: '.hud,.chat{visibility:hidden !important}' });
      await gm(page, 'level 12', 1500);
      await gm(page, 'god on', 1200);
      await gm(page, 'method lac_kiem_quyet 5', 1200);
      await gm(page, 'killall', 800);
      await gm(page, 'tp 2048 2088', 1500);
      await page.waitForFunction(() => { const w = (window as unknown as G).__game!; const m = w.ents?.players.get(w.sid)?.model; return !!m && m.dirHits === true; }, undefined, { timeout: 60_000, polling: 300 });
      if (v === 'new') await page.waitForFunction(() => { const w = (window as unknown as G).__game!; return w.ents.players.get(w.sid).model.clipLength('ual_death') > 0; }, undefined, { timeout: 30_000, polling: 300 });
      // Giữ camera cận cảnh góc 3/4 (zone camera kéo xa lại nếu chỉ đặt một lần); nhắm theo hướng nhìn cố định lúc bắt đầu.
      await page.evaluate(() => {
        const g2 = (window as unknown as G).__game!;
        const yaw0 = g2.cur.yaw as number;
        console.log('yaw0', yaw0, g2.camYaw);
        setInterval(() => { if (Number.isFinite(yaw0)) g2.camYaw = yaw0 + 0.9; g2.camPitch = 0.08; g2.camDist = 3.4; g2.camDistCur = 3.4; }, 50);
      });
      const tScene = Date.now();
      await sleep(1500); // đứng nghỉ
      await page.keyboard.down('Space'); await sleep(150); await page.keyboard.up('Space'); await sleep(1800); // nhảy
      await page.evaluate(() => (window as unknown as G).__game!.useDash()); await sleep(1500); // lướt
      for (const k of ['front', 'heavy']) {
        await model(page, `const y=m.root.rotation.y;const f=[Math.sin(y),Math.cos(y)];m.hitReact({dirX:-f[0],dirZ:-f[1],noStop:true,heavy:${k === 'heavy'},crit:${k === 'heavy'}});`);
        await sleep(1300);
      }
      await model(page, 'm.knockdown()'); await sleep(3800); // ngã + dậy
      await gm(page, 'die', 4200); // chết
      await page.evaluate(() => (window as unknown as G).__game!.send('resp', {}));
      await sleep(2500);
      const vid = page.video();
      await ctx.close();
      if (vid) {
        // Cắt phần tải/vào game: giữ từ lúc cảnh sẵn sàng.
        const raw = await vid.path();
        const ss = Math.max(0, (tScene - tPage) / 1000 - 0.3);
        const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', raw, '-c:v', 'libvpx', '-b:v', '1.5M', '-an', path.join(OUT, `${tag}.webm`)]);
        if (r.status !== 0) fs.copyFileSync(raw, path.join(OUT, `${tag}.webm`));
      }
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[shots-ual] ${tag}.webm`);
    }
    if (errors.length) console.log('[shots-ual] lỗi console:\n' + [...new Set(errors)].join('\n'));
  } finally {
    await browser.close();
    dev.stop();
  }
}

main().catch((e) => { console.error(e); dev.stop(); process.exit(1); });
