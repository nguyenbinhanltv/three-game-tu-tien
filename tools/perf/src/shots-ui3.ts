// pnpm shots:ui3: ảnh trước/sau của các bảng lớn kiểu giấy ngà tường vân (UI-3), 1080p và 1440p.
//   tsx src/shots-ui3.ts --out <thư mục tuyệt đối> [--panels char,bag,...] [--variants truoc,sau]
// Trước = `?ngj=0` (bảng cũ), sau = mặc định. Tự chạy `pnpm dev` ở PORT/CLIENT_PORT (mặc định 2689/5289); luôn ?mute=1 và --mute-audio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { createDevServer, sleep } from './devserver';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = path.resolve(opt('--out', 'shots-ui3'));
const PORT = Number(process.env.PORT ?? 2689);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5289);
const dev = createDevServer({ port: PORT, clientPort: CLIENT_PORT, tag: 'shots-ui3', command: 'pnpm shots:ui3' });
type G = { __game?: Record<string, any> };

interface Panel {
  id: string;
  /** Phím mở bảng (hoặc NPC: đứng cạnh rồi tương tác). */
  key?: string;
  npc?: { x: number; z: number };
  /** Bấm tab thứ n (0 = đầu) của dải tab trong bảng trước khi chụp. */
  tab?: number;
  /** Bấm tab con của bảng trong bảng (ví dụ tab Thuộc tính trong Nhân vật). */
  inner?: number;
}
const PANELS: Panel[] = [
  { id: 'nhan-vat', key: 'c' },
  { id: 'nhan-vat-thuoc-tinh', key: 'c', inner: 1 },
  { id: 'tui-do', key: 'b' },
  { id: 'cong-phap', key: 'k' },
  { id: 'nhiem-vu', key: 'l' },
  { id: 'to-doi', key: 'p' },
  { id: 'cai-dat', key: 'o' },
  { id: 'tro-giup', key: 'h' },
  { id: 'npc-hoi-thoai', npc: { x: 2048, z: 2034 } },
  { id: 'cua-hang', npc: { x: 2004, z: 2068 }, tab: 1 },
  { id: 'luyen-dan', npc: { x: 2004, z: 2068 }, tab: 2 },
  { id: 'cuong-hoa', npc: { x: 2092, z: 2068 }, tab: 3 },
  { id: 'thang-bac', npc: { x: 2092, z: 2068 }, tab: 8 },
];
const only = opt('--panels', '').split(',').filter(Boolean);
const variants = opt('--variants', 'truoc,sau').split(',') as ('truoc' | 'sau')[];
const SIZES = [
  ['1080p', 1920, 1080],
  ['1440p', 2560, 1440],
] as const;

const gm = async (page: Page, m: string) => {
  await page.evaluate((x) => (window as unknown as G).__game!.send('chat', { m: x }), m);
  await sleep(1200);
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await dev.start();
  const launchArgs = ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs }).catch(() => chromium.launch({ headless: true, args: launchArgs }));
  const log: Record<string, unknown> = {};
  try {
    for (const variant of variants) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      const name = 'Ui3' + variant.slice(0, 1) + (Date.now() % 100000);
      await page.addInitScript((n) => localStorage.setItem('dtl.seen.sect.' + n, '1'), name);
      await page.goto(`http://localhost:${CLIENT_PORT}/?mute=1&auto=${name}&god=1&realm=nk12&at=tong_mon&ngj=${variant === 'sau' ? 1 : 0}`, { waitUntil: 'load' });
      await page.waitForFunction(() => { const w = (window as unknown as G).__game; return !!w && w.frames > 30 && !!w.me?.(); }, undefined, { timeout: 120_000, polling: 250 });
      await sleep(2500);
      // Đồ để túi và ô trang bị có nội dung: bộ bậc 2 kiếm, thêm vài món tiêu hao, vàng.
      for (const c of ['/gm kit 2 kiem +5 m', '/gm gold 50000', '/gm give itm_hoi_xuan_dan 12', '/gm give itm_linh_thao 30', '/gm give itm_kiem_phach 5', '/gm give itm_huyet_linh_chi 8', '/gm roll weapon 3 20', '/gm roll robe 2 12', '/gm roll boots 1 8', '/gm roll ring 3 16']) await gm(page, c);
      for (const p of PANELS.filter((x) => !only.length || only.includes(x.id))) {
        if (p.npc) {
          await gm(page, `/gm tp ${p.npc.x} ${p.npc.z}`);
          await sleep(2500);
          await page.evaluate(() => (window as unknown as G).__game!.interact());
          await sleep(900);
          if (p.tab !== undefined) {
            await page.locator('.win-host [role=tab], .npc [role=tab]').nth(p.tab).click().catch(() => undefined);
            await sleep(500);
          }
        } else {
          await page.keyboard.press(p.key!);
          await sleep(500);
          if (p.inner !== undefined) {
            await page.locator('.win-host [role=tab]').nth(p.inner).click().catch(() => undefined);
          }
        }
        await sleep(900);
        for (const [tag, w, h] of SIZES) {
          await page.setViewportSize({ width: w, height: h });
          await sleep(900);
          await page.screenshot({ path: path.join(OUT, `${p.id}-${variant}-${tag}.jpg`), type: 'jpeg', quality: 82 });
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.keyboard.press('Escape');
        await sleep(400);
        // NPC: đóng hội thoại bằng nút đóng nếu còn
        await page.locator('.k-close').first().click({ timeout: 800 }).catch(() => undefined);
        await sleep(300);
        // đóng nốt bảng phím (toggle)
        const left = await page.locator('.k-window').count();
        if (left && p.key) await page.keyboard.press(p.key);
        await sleep(300);
      }
      log[variant] = { errors: errors.slice(0, 8) };
      await ctx.close();
    }
    fs.writeFileSync(path.join(OUT, 'ui3-log.json'), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  } finally {
    await browser.close();
    dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
