// Thao tác trong game cho kịch bản Playwright: đăng nhập thử, lệnh GM, camera, dịch chuyển, đổi level, quái, vạch báo.
// Lưu ý: hàm truyền vào `page.evaluate` không được khai báo hàm có tên bên trong (tsx chèn `__name`, trình duyệt không có).
import type { Browser, BrowserContext, Page } from 'playwright';
import { PLACES } from '@dtl/content/places';
import { gameUrl, watchErrors } from './browser';
import { sleep } from './devserver';
import type { GameInfo, HazardLog, MonView } from './window';

export interface OpenOpts {
  clientPort: number;
  /** Đạo hiệu thử (`?auto=`); thêm hậu tố thời gian để mỗi lần chạy là nhân vật mới. */
  name: string;
  renderer?: string;
  /** Tham số URL thêm (`at`, `realm`, `god`, `ngj`, `chr`…). `debug=1` có sẵn. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Chuỗi query thô của người dùng (`--query a=b`). */
  extra?: string;
  viewport?: [number, number];
  dpr?: number;
  quality?: string;
  /** Giới tính + màu áo lúc tạo nhân vật (`dtl.look`); kèm điều khiển `strafe` để phím A/D chạy ngang. */
  look?: { g: string; dye?: string };
  /** Bỏ đoạn mở đầu lần đầu vào tông môn (đánh dấu đã xem), khỏi phải bấm phím bỏ qua. */
  seenIntro?: boolean;
  /** Ẩn lớp UI trước khi chụp: `hud` (cả HUD lẫn chat) hoặc `chat`. */
  hide?: 'hud' | 'chat';
  /** Quay webm của trang vào thư mục này (đóng context mới ghi xong file). */
  video?: string;
  warnings?: boolean | RegExp;
  errors?: string[];
}

export interface GamePage {
  ctx: BrowserContext;
  page: Page;
  name: string;
  errors: string[];
}

/** Mở context mới, vào game bằng tài khoản thử (tắt tiếng), chờ có nhân vật và bỏ qua cảnh mở đầu. */
export async function openGame(browser: Browser, o: OpenOpts): Promise<GamePage> {
  const [width, height] = o.viewport ?? [1280, 720];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: o.dpr ?? 1, ...(o.video ? { recordVideo: { dir: o.video, size: { width, height } } } : {}) });
  const name = `${o.name}${Date.now() % 10000}`.slice(0, 14);
  const store: Record<string, string> = {};
  if (o.quality) store['dtl.quality'] = o.quality;
  if (o.look) Object.assign(store, { 'dtl.controls': 'strafe', 'dtl.look': JSON.stringify({ g: o.look.g, dye: o.look.dye ?? 'attire_sect' }) });
  if (o.seenIntro) store['dtl.seen.sect.' + name] = '1';
  await ctx.addInitScript((kv) => Object.entries(kv).forEach(([k, v]) => localStorage.setItem(k, v)), store);
  const page = await ctx.newPage();
  const errors = watchErrors(page, { tag: name, warnings: o.warnings, into: o.errors });
  await page.goto(gameUrl(o.clientPort, { debug: 1, auto: name, ...o.query }, { renderer: o.renderer, extra: o.extra }), { waitUntil: 'load' });
  await waitInGame(page);
  await skipCutscene(page);
  if (o.hide) await hideUi(page, o.hide);
  return { ctx, page, name, errors };
}

export async function waitInGame(page: Page, minFrames = 30, timeout = 120_000): Promise<void> {
  await page.waitForFunction((n) => !!window.__game && window.__game.frames > n && !!window.__game.me?.(), minFrames, { timeout, polling: 250 });
}

/** Cảnh điện ảnh (mở đầu, boss xuất hiện) che HUD: bấm Space tới khi HUD hiện lại. */
export async function skipCutscene(page: Page, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const cut = await page.evaluate(() => {
      const h = document.querySelector('.hud');
      return !h || h.classList.contains('cining') || !!h.getAttribute('data-cut');
    });
    if (!cut) return;
    await page.keyboard.press('Space');
    await sleep(450);
  }
}

export const hideUi = (page: Page, what: 'hud' | 'chat' | 'none') =>
  page.addStyleTag({ content: what === 'none' ? '.hud{visibility:visible !important}' : `${what === 'hud' ? '.hud,.chat' : '.chat'}{visibility:hidden !important}` });

/** Gửi `/gm <lệnh>` qua chat (chỉ tài khoản thử) rồi chờ. Server bỏ tin chat cách tin trước dưới 800 ms (`Sim.onChat`, `sys.chat_rate`) nên `wait` phải ≥ 800 khi còn lệnh kế tiếp. */
export async function gm(page: Page, cmd: string, wait = 1100): Promise<void> {
  await page.evaluate((m) => window.__game!.send('chat', { m }), '/gm ' + cmd.replace(/^\/gm\s+/, ''));
  await sleep(wait);
}

export interface Cam {
  yaw?: number;
  pitch?: number;
  dist?: number;
}
/** Đặt camera cố định (`dist` đặt luôn khoảng cách hiện tại để không phải chờ nội suy). */
export const cam = (page: Page, c: Cam) =>
  page.evaluate((v) => {
    const g = window.__game!;
    if (v.yaw !== undefined) g.camYaw = v.yaw;
    if (v.pitch !== undefined) g.camPitch = v.pitch;
    if (v.dist !== undefined) g.camDist = g.camDistCur = v.dist;
  }, c);

/** `/gm tp x z` + hồi máu, chờ nhân vật tới nơi (≤ 3 m). */
export async function tp(page: Page, x: number, z: number, timeout = 40_000): Promise<void> {
  await gm(page, `tp ${Math.round(x)} ${Math.round(z)}`, 900);
  await gm(page, 'heal', 400);
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const p = await page.evaluate(() => ({ x: window.__game!.renderPos.x, z: window.__game!.renderPos.z }));
    if (Math.hypot(p.x - x, p.z - z) < 3) return;
    await sleep(300);
  }
}

/** Sang level khác như người chơi: mở mọi trận rồi `/gm tp <địa điểm đầu tiên của level>` (vé liên level), chờ client dựng xong. */
export async function enterLevel(page: Page, level: string, place?: string): Promise<void> {
  const id = place ?? PLACES.find((p) => p.level === level)?.id;
  if (!id) throw new Error(`không có địa điểm nào của level ${level} trong places.json`);
  if ((await shownLevel(page)) !== level) {
    await gm(page, 'tele all');
    await gm(page, `tp ${id}`);
    await waitLevel(page, level);
  } else if (place) await gm(page, `tp ${id}`, 2500);
  await gm(page, 'god on', 900);
}

export const shownLevel = (page: Page) => page.evaluate(() => window.__game?.shownLevel ?? '');

export async function waitLevel(page: Page, level: string, settle = 4000): Promise<void> {
  await page.waitForFunction((lv) => window.__game?.shownLevel === lv, level, { timeout: 90_000, polling: 300 });
  await sleep(settle);
}

export const info = (page: Page): Promise<GameInfo> => page.evaluate(() => window.__game!.info());

/** Draw call/tam giác của khung vừa vẽ + thời gian khung trung bình trong 1,5 s. */
export const perfSample = (page: Page) =>
  page.evaluate(async () => {
    const g = window.__game!;
    const t0 = performance.now();
    const f0 = g.frames;
    await new Promise((r) => setTimeout(r, 1500));
    const i = g.info();
    return { drawCalls: i.drawCalls, triangles: i.triangles, geometries: i.geometries, textures: i.textures, frameMs: Math.round(((performance.now() - t0) / Math.max(1, g.frames - f0)) * 100) / 100 };
  });

/** Quái còn sống trong tầm nhìn. */
export const monsters = (page: Page): Promise<MonView[]> =>
  page.evaluate(() => [...window.__game!.view.monsters.values()].filter((m) => m.t && m.st !== 4).map((m) => ({ t: m.t, st: m.st, mf: m.mf, hp: m.hp, mhp: m.mhp, x: m.x, z: m.z })));

export async function waitMonster(page: Page, id: string, ms = 40_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await monsters(page)).some((m) => m.t === id)) return true;
    await sleep(300);
  }
  return false;
}

/** `/gm killall` tới khi sạch quái; con sót ngoài tầm 40 m của lệnh thì tới gần rồi dọn tiếp. Boss chặn sát thương ở ngưỡng pha nên cần nhiều lượt. */
export async function clearMonsters(page: Page, rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await gm(page, 'killall', 1000);
    const left = await monsters(page);
    if (!left.length) return;
    if (i >= 2) await gm(page, `tp ${Math.round(left[0].x)} ${Math.round(left[0].z + 6)}`, 900);
  }
}

/** Nhật ký vạch báo của quái (`__game.hazardLog`, bản dev). */
export const hazards = (page: Page): Promise<HazardLog[]> => page.evaluate(() => (window.__game!.hazardLog ?? []).map((h) => ({ mv: h.mv, sh: h.sh, r: h.r, w: h.w, delay: h.delay })));
export const resetHazards = (page: Page) => page.evaluate(() => void (window.__game!.hazardLog = []));

/** Chờ tới khi có vạch báo mới (true) hoặc hết giờ (false). */
export async function waitHazard(page: Page, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await page.evaluate(() => window.__game!.hazardLog?.length ?? 0)) > 0) return true;
    await sleep(80);
  }
  return false;
}

/** Quay camera từ sau lưng người chơi nhìn về con quái `id` gần nhất; trả false nếu không thấy con nào. */
export async function faceMonster(page: Page, id: string, c: Cam): Promise<boolean> {
  const yaw = await page.evaluate((t) => {
    const g = window.__game!;
    const near = [...g.view.monsters.values()].filter((m) => m.t === t && m.st !== 4).sort((a, b) => Math.hypot(a.x - g.cur.x, a.z - g.cur.z) - Math.hypot(b.x - g.cur.x, b.z - g.cur.z))[0];
    return near ? Math.atan2(g.cur.x - near.x, g.cur.z - near.z) : null;
  }, id);
  if (yaw !== null) await cam(page, { ...c, yaw });
  return yaw !== null;
}
