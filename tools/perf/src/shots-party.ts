// pnpm shots:party: chụp ảnh tổ đội và tỉ thí (P3-9) bằng 3 tab: khung tổ đội + cộng hưởng, bảng tổ đội, chia đồ, tỉ thí.
//   tsx src/shots-party.ts --out <thư mục> [--renderer webgpu|webgl2]
// Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2675/5175), vào game tắt tiếng (?mute=1, --mute-audio) bằng ba tài khoản thử,
// dùng lệnh GM để dựng cảnh; mời/nhận lời bấm bằng nút thật trên giao diện.
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-party'));
const RENDERER = opt('--renderer', 'webgpu');
const [VW, VH] = opt('--size', '1280x720').split('x').map(Number);
const PORT = Number(process.env.PORT ?? 2675);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5175);

const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-party', command: 'pnpm shots:party' });
type G = { __game?: Record<string, any> };

const gm = async (page: Page, cmd: string, wait = 1100) => {
  await page.evaluate((m) => (window as unknown as G).__game!.send('chat', { m }), '/gm ' + cmd);
  await sleep(wait);
};
const send = (page: Page, type: string, msg: unknown) => page.evaluate(([t, m]) => (window as unknown as G).__game!.send(t as string, m), [type, msg] as const);

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
    const stamp = String(Date.now() % 10000);
    const names = [`DoiA${stamp}`, `DoiB${stamp}`, `DoiC${stamp}`];
    const methods = ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh'];
    const pages: Page[] = [];
    for (const [i, name] of names.entries()) {
      const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: "localStorage.setItem('dtl.quality', 'high');" });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text().slice(0, 300)}`));
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&debug=1&auto=${name}${RENDERER === 'webgl2' ? '&renderer=webgl2' : ''}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const g = (window as unknown as G).__game;
        return !!g && g.frames > 30 && !!g.me?.();
      }, undefined, { timeout: 120_000, polling: 250 });
      await clearIntro(page);
      await gm(page, 'level 12');
      await gm(page, 'god on');
      await gm(page, `method ${methods[i]} 3`);
      await gm(page, 'tp 2048 2088');
      await page.evaluate(() => {
        const g = (window as unknown as G).__game!;
        g.camYaw = 0;
        g.camPitch = 0.3;
        g.camDist = 12;
      });
      pages.push(page);
    }
    const [A, B, C] = pages;
    const shot = async (page: Page, file: string) => {
      await page.screenshot({ path: path.join(OUT, file) });
      console.log(`[shots-party] ${file}`);
    };
    const clickBtn = async (page: Page, name: RegExp) => {
      await page.getByRole('button', { name }).first().click({ timeout: 8000 });
    };

    // 1. Mời và nhận lời bằng nút thật.
    await send(A, 'pty', { a: 'inv', n: names[1] });
    await sleep(800);
    await shot(B, 'party-invite.png');
    await clickBtn(B, /Nhận lời/);
    await sleep(2300);
    await send(A, 'pty', { a: 'inv', n: names[2] });
    await sleep(800);
    await clickBtn(C, /Nhận lời/);
    await sleep(1500);
    await shot(A, 'party-frame-resonance.png');
    await shot(B, 'party-frame-member.png');
    await A.keyboard.press('KeyP');
    await sleep(700);
    await shot(A, 'party-panel.png');
    await A.keyboard.press('KeyP');

    // 2. Chia đồ theo lượt: hạ vài con sói, xem dòng nhận đồ của từng người.
    for (const p of pages) await gm(p, 'tp 2048 2455', 600);
    await sleep(800);
    await gm(A, 'spawn mon_soi_xam 3');
    for (let i = 0; i < 24; i++) {
      await A.evaluate(() => (window as unknown as G).__game!.useSkill(1));
      await sleep(1150);
      const left = await A.evaluate(() => {
        const g = (window as unknown as G).__game!;
        return g.view?.monsters ? [...g.view.monsters.values()].filter((m: any) => m.st !== 4 && Math.hypot(m.x - g.cur.x, m.z - g.cur.z) < 40).length : 0;
      });
      if (!left) break;
    }
    await sleep(1200);
    await A.evaluate(() => document.querySelector('.chat')?.classList.add('open'));
    await B.evaluate(() => document.querySelector('.chat')?.classList.add('open'));
    await shot(A, 'loot-turn-a.png');
    await shot(B, 'loot-turn-b.png');

    // 3. Tỉ thí.
    for (const p of pages) await gm(p, 'tp 2048 2088', 600);
    await gm(A, 'heal');
    await send(A, 'duel', { a: 'inv', n: names[1] });
    await sleep(800);
    await shot(B, 'duel-invite.png');
    await clickBtn(B, /Nhận lời/);
    await sleep(1000);
    await shot(A, 'duel-countdown.png');
    await sleep(3200);
    for (let i = 0; i < 4; i++) {
      await A.evaluate(() => (window as unknown as G).__game!.useSkill(1));
      await sleep(1150);
    }
    await shot(A, 'duel-fight.png');
    await shot(B, 'duel-fight-b.png');
    await clickBtn(B, /Chịu thua/);
    await sleep(900);
    await shot(A, 'duel-result-win.png');
    await shot(B, 'duel-result-lose.png');
  } finally {
    await browser.close().catch(() => {});
    dev.stop();
  }
  if (errors.length) console.log('[shots-party] lỗi console:\n' + errors.slice(0, 12).join('\n'));
}

main().catch((e) => {
  console.error(e);
  dev.stop();
  process.exit(1);
});
