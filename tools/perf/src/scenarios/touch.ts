// Điều khiển cảm ứng (U2-6): giả lập thiết bị (iPhone 14 Pro ngang, iPad ngang, Android 1080×2400 ngang + dọc), chạm thật qua CDP
// (`Input.dispatchTouchEvent`): cần ảo, ra chiêu, giữ ngón xem mô tả, vuốt xoay camera, chụm zoom, mở túi. Chụp ảnh từng máy + quay webm.
import type { Page } from 'playwright';
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

interface Dev {
  id: string;
  w: number;
  h: number;
  dpr: number;
}

const DEVICES: Dev[] = [
  { id: 'iphone14pro', w: 852, h: 393, dpr: 3 },
  { id: 'ipad', w: 1180, h: 820, dpr: 2 },
  { id: 'android', w: 915, h: 412, dpr: 2.625 },
  { id: 'android-doc', w: 412, h: 915, dpr: 2.625 },
];

type Pt = { x: number; y: number; id: number };

/** Gửi chạm thật tới trang (Playwright chỉ có `tap`, không kéo/đa điểm). */
async function touchDriver(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
  return {
    down: (...pts: Pt[]) => send('touchStart', pts),
    move: (...pts: Pt[]) => send('touchMove', pts),
    up: () => send('touchEnd', []),
    /** Kéo một ngón từ a tới b trong `steps` bước. */
    async drag(a: Pt, b: Pt, steps = 12, ms = 25) {
      await send('touchStart', [a]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [{ id: a.id, x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }]);
        await sleep(ms);
      }
    },
  };
}

export default {
  name: 'touch',
  desc: 'Cảm ứng (U2-6): iPhone 14 Pro ngang, iPad, Android 1080×2400; cần ảo, ra chiêu, xoay/zoom camera, túi; ảnh + webm',
  usage: '[--only <id,id>] [--video 1: quay webm vào --out]',
  async run(r) {
    const only = opt('--only', '').split(',').filter(Boolean);
    const log: Record<string, unknown> = {};
    for (const d of DEVICES.filter((x) => !only.length || only.includes(x.id))) {
      const { page } = await r.open({
        name: 'Tc',
        quality: 'medium',
        viewport: [d.w, d.h],
        dpr: d.dpr > 2 ? 2 : d.dpr,
        touch: true,
        seenIntro: true,
        query: { realm: 'nk12', at: 'tong_mon', god: 1, quiet: 1 },
        video: opt('--video', '') && d.id === 'iphone14pro' ? r.out : undefined,
      });
      const shot = (name: string, wait = 400) => snap(page, r.out, `${d.id}-${name}.jpg`, { wait });
      const touch = await touchDriver(page);
      const res: Record<string, unknown> = {};
      await gm(page, 'level 15');
      await gm(page, 'method kiem_tu').catch(() => undefined);
      await sleep(1500);
      res.touchMode = await page.evaluate(() => document.documentElement.dataset.touch ?? '');
      res.hudMode = await page.evaluate(() => document.querySelector('.hud')?.getAttribute('data-mode') ?? '');
      await shot('01-hud', 1200);

      // Cần ảo: kéo lên (tiến) từ nửa trái màn hình; vị trí đổi.
      const p0 = await page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
      const jx = Math.round(d.w * 0.18);
      const jy = Math.round(d.h * 0.7);
      await touch.drag({ id: 1, x: jx, y: jy }, { id: 1, x: jx, y: jy - 70 });
      await sleep(1200);
      await shot('02-joystick-keo', 100);
      await touch.up();
      await sleep(400);
      const p1 = await page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
      res.joystickMoved = Math.round(Math.hypot(p1.x - p0.x, p1.z - p0.z) * 100) / 100;

      // Ra chiêu: chạm đòn chính và ô 2.
      res.skillButtons = await page.locator('[data-testid^="touch-skill-"]').count();
      await page.locator('[data-testid="touch-skill-0"]').tap();
      await sleep(300);
      await page.locator('[data-testid="touch-skill-1"]').tap();
      await sleep(200);
      await shot('03-ra-chieu-hoi-chieu', 100);
      // Giữ ngón: hiện mô tả, không ra chiêu.
      const box = await page.locator('[data-testid="touch-skill-2"]').boundingBox();
      if (box) {
        const c = { id: 2, x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await touch.down(c);
        await sleep(700);
        res.tipShown = (await page.locator('[data-testid="touch-tip"]').count()) > 0;
        await shot('04-giu-xem-mo-ta', 100);
        await touch.up();
        await sleep(200);
      }

      // Xoay camera: vuốt ngang ở nửa phải, vùng trống phía trên cụm nút.
      const y0 = await page.evaluate(() => window.__game!.camYaw);
      const sy = Math.round(d.h * (d.h > d.w ? 0.35 : 0.3));
      await touch.drag({ id: 3, x: Math.round(d.w * 0.6), y: sy }, { id: 3, x: Math.round(d.w * 0.6) - 120, y: sy });
      await touch.up();
      res.camYawDelta = Math.round(((await page.evaluate(() => window.__game!.camYaw)) - y0) * 1000) / 1000;
      // Chụm hai ngón (tách ra = lại gần).
      const dist0 = await page.evaluate(() => window.__game!.camDist);
      const cx = Math.round(d.w * 0.6);
      await touch.down({ id: 4, x: cx - 20, y: sy }, { id: 5, x: cx + 20, y: sy });
      for (let i = 1; i <= 8; i++) {
        await touch.move({ id: 4, x: cx - 20 - i * 8, y: sy }, { id: 5, x: cx + 20 + i * 8, y: sy });
        await sleep(25);
      }
      await touch.up();
      res.camDist = [dist0, await page.evaluate(() => window.__game!.camDist)].map((v) => Math.round(v * 100) / 100);
      await sleep(300);

      // Đổi mục tiêu.
      await page.locator('[data-testid="touch-target"]').tap();
      await sleep(300);

      // Ngọc Đái + túi + cài đặt bằng chạm.
      await gm(page, 'give itm_yeu_dan 5');
      await page.locator('[data-testid="hub-bag"]').tap();
      await sleep(900);
      await shot('05-tui', 400);
      // Kéo-thả trong túi bằng ngón: giữ ô có đồ rồi kéo sang ô trống đầu tiên.
      const from = page.locator('.bag-cell[data-item]').first();
      const fb = await from.boundingBox();
      const slotFrom = await from.getAttribute('data-slot');
      const to = page.locator('.bag-cell:not([data-item])').first();
      const tb = await to.boundingBox();
      const slotTo = await to.getAttribute('data-slot');
      if (fb && tb) {
        const a0 = { id: 6, x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 };
        const b0 = { id: 6, x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
        await touch.down(a0);
        await sleep(600);
        for (let i = 1; i <= 6; i++) {
          await touch.move({ id: 6, x: a0.x + ((b0.x - a0.x) * i) / 6, y: a0.y + ((b0.y - a0.y) * i) / 6 });
          await sleep(40);
        }
        res.bagGhost = (await page.locator('.bag-ghost').count()) > 0;
        await shot('05b-tui-keo', 100);
        await touch.up();
        await sleep(700);
        res.winAfterDrop = await page.locator('.win-host').count();
        await shot('05c-tui-sau-tha', 100);
        res.bagDrag = {
          from: slotFrom,
          fromNow: await page.locator(`.bag-cell[data-slot="${slotFrom}"]`).getAttribute('data-item'),
          toNow: await page.locator(`.bag-cell[data-slot="${slotTo}"]`).getAttribute('data-item'),
        };
      }
      res.smallInWindow = await page.evaluate(() =>
        [...document.querySelectorAll('.win-host button, .win-host select, .win-host [role="tab"]')]
          .map((el) => ({ el, b: el.getBoundingClientRect() }))
          .filter((x) => x.b.width > 0 && (x.b.width < 43.5 || x.b.height < 43.5))
          .map((x) => `${(x.el.className || x.el.tagName).toString().slice(0, 24)} ${Math.round(x.b.width)}x${Math.round(x.b.height)}`),
      );
      await page.locator('.win-host .u2-close, .win-host .k-close').first().tap();
      await sleep(300);
      await page.locator('[data-testid="hub-settings"]').tap();
      await sleep(900);
      await shot('06-cai-dat', 400);
      await page.locator('.win-host .u2-close, .win-host .k-close').first().tap();
      await sleep(300);
      // Nút nhỏ hơn 44 px trong lớp cảm ứng + Ngọc Đái?
      res.smallTargets = await page.evaluate(() =>
        [...document.querySelectorAll('.u2t-btn, .u2h-hubbtn')]
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.width < 43.5 || b.height < 43.5))
          .map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`),
      );
      res.docScroll = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
      log[d.id] = res;
      await sleep(d.id === 'iphone14pro' ? 800 : 100);
      await page.context().close();
    }
    writeJson(r.out, 'touch.json', log);
    console.log(JSON.stringify(log, null, 1));
  },
} satisfies Scenario;
