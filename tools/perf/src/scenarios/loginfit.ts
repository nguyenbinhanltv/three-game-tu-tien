// Màn đăng nhập / tạo nhân vật ở nhiều cỡ khung nhìn: nút "vào game" phải luôn nằm trong màn hình (lỗi tràn đáy ở 1920×912).
// Hai lượt: tài khoản mới (trình duyệt sạch) và tài khoản cũ (đã lưu đạo hiệu, ngoại hình, bản nguyên). Ghi hộp của nút vào `loginfit.json`.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import type { Run, Scenario } from '../lib/scenario';
import { gameUrl } from '../lib/browser';
import { snap, writeJson } from '../lib/shot';

const SIZES: [number, number][] = [
  [1920, 912],
  [1920, 1080],
  [1366, 768],
  [1280, 720],
  [1280, 600],
];

export default {
  name: 'loginfit',
  desc: 'Màn đăng nhập ở 1920×912, 1920×1080, 1366×768, 1280×720, 1280×600 (tài khoản mới + cũ): nút vào game phải hiện trọn',
  usage: '[--tag truoc|sau]',
  async run(r: Run) {
    const tag = list('--tag', 'sau')[0]!;
    const out: Record<string, unknown> = {};
    for (const returning of [false, true]) {
      for (const [w, h] of SIZES) {
        const ctx = await r.browser.newContext({ viewport: { width: w, height: h } });
        if (returning) {
          await ctx.addInitScript(() => {
            localStorage.setItem('dtl.devName', 'DaoHuuCu');
            localStorage.setItem('dtl.root', 'loi');
            localStorage.setItem('dtl.look', JSON.stringify({ g: 'f', dye: 'huyen_mac' }));
          });
        }
        const page = await ctx.newPage();
        await page.goto(gameUrl(r.clientPort, {}), { waitUntil: 'load' });
        await page.waitForSelector('.ts-card .btn.primary', { timeout: 20000 });
        await sleep(2500);
        if (!returning) await page.locator('.login-form input').first().fill('DaoHuuMoi');
        await sleep(400);
        const btn = page.locator('.ts-card .btn.primary').first();
        const box = await btn.boundingBox();
        const visible = !!box && box.y >= 0 && box.y + box.height <= h + 0.5;
        out[`${returning ? 'cu' : 'moi'}-${w}x${h}`] = { box, visible };
        await snap(page, r.out, `login-${returning ? 'cu' : 'moi'}-${w}x${h}-${tag}.jpg`, { wait: 200 });
        await ctx.close();
      }
    }
    writeJson(r.out, `loginfit-${tag}.json`, out);
    const bad = Object.entries(out).filter(([, v]) => !(v as { visible: boolean }).visible);
    if (bad.length) console.log('[loginfit] NÚT KHÔNG TRỌN:', bad.map(([k]) => k).join(', '));
  },
} satisfies Scenario;
