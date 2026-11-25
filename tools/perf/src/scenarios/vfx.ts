// VFX theo dòng thời gian (VFX-V0…V5): mỗi chiêu hai video webm (chậm 0,25× và tốc độ thật) + một tờ dãy khung
// (mỗi ô một mốc thời gian game, viền đỏ = khung hit), nam và nữ. Dựng cảnh bằng lệnh GM, ghi màn hình bằng CDP screencast.
//   --skills skl_a,skl_b            chiêu người chơi (tự đổi công pháp theo chiêu)
//   --skills mon:<loại>[:<id quái>]  FX quái V5: hit|strike|cast|chant|boom_circle|boom_line|boom_cone|bolt|death
//   --skills scene_<tên>            cảnh lớn bơm thẳng tin S.FX (đột phá, độ kiếp, xuất khiếu, thuấn di)
//   --perf: draw call/tam giác/ms từng chiêu.
//   --crowd N: N người giả cùng ra chiêu trong --crowd-secs giây, chỉ in số đo (ngân sách sân đông).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { BrowserContext, Page } from 'playwright';
import { ROOT, sleep } from '../lib/devserver';
import { env, flag, list, num, opt } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { sheet } from '../lib/shot';
import { SKILL } from '@dtl/content';
import { at as checkedAt } from '@dtl/shared';

declare global {
  interface Window {
    __vfxPerf?: Record<string, number[]>;
  }
}

const HP = 'bat_dong_kim_than';
const DS = 'thanh_moc_dan_kinh';
const DAO = 'liet_nhan_dao_kinh';
const CO = 'duong_co_kinh';
/** Công pháp của từng chiêu (V3: Hộ pháp/Đan sư); chiêu không ghi là Kiếm tu. */
const METHOD_OF: Record<string, string> = Object.fromEntries([
  ...[
    'skl_thiet_bich_xung',
    'skl_tran_son_an',
    'skl_kim_cuong_bat_hoai',
    'skl_thiet_quyen_chan_dia',
    'skl_kim_chung_tran',
    'skl_son_nhac_hoa_than',
    'skl_dich_son_xung',
    'skl_anh_thiet_than',
    'skl_thuan_di_ho_the',
    'skl_thien_kim_phap_tuong',
  ].map((k) => [k, HP]),
  ...['skl_tha_co', 'skl_co_trieu', 'skl_hut_mau_co', 'skl_co_bao', 'skl_thu_co', 'skl_hoa_co_vuong'].map((k) => [k, CO]),
  ...['skl_bao_nhan', 'skl_tram_son_dao', 'skl_hoanh_dao', 'skl_tam_dao', 'skl_doan_luu', 'skl_liet_dia_tram'].map((k) => [k, DAO]),
  ...[
    'skl_luu_huong_bo',
    'skl_hoi_xuan_quyet',
    'skl_hoi_thien_dan_lo',
    'skl_moc_linh_tran',
    'skl_duoc_vu',
    'skl_ngung_dan_ho_the',
    'skl_dan_hoa_phong_tran',
    'skl_anh_duoc_hoa_than',
    'skl_thuan_di_cuu_vien',
    'skl_thien_dan_phap_gioi',
  ].map((k) => [k, DS]),
]);
/** Cảnh lớn: `scene_<tên>` → tin S.FX bơm vào `Game.onFx`. */
const SCENES: Record<string, Record<string, unknown>> = {
  scene_dotpha_tc: { t: 'ascend', d: 2.6 },
  scene_dotpha_kd: { t: 'ascend', tb: 'ket_dan', d: 2.6 },
  scene_dotpha_na: { t: 'ascend', tb: 'nguyen_anh', d: 2.6 },
  scene_dotpha_hn: { t: 'ascend', tb: 'hoa_than', d: 2.6 },
  scene_kiep_tc: { t: 'tribstart', tb: 'truc_co', d: 6 },
  scene_kiep_kd: { t: 'tribstart', tb: 'ket_dan', d: 6 },
  scene_kiep_na: { t: 'tribstart', tb: 'nguyen_anh', d: 6 },
  scene_kiep_hn: { t: 'tribstart', tb: 'hoa_than', d: 6 },
  scene_soul_out: { t: 'soul_out', d: 0.8 },
  scene_soul_in: { t: 'soul_in', d: 0.6 },
  scene_blink: { t: 'blink', d: 0.3 },
};
/** Pháp tướng/cảnh lớn: camera xa phía sau, đứng chỗ trống giữa sân. */
const PHAP = /scene_|van_kiem_quy_tong|kim_cuong|hoi_thien/;
const PHAP_SOLO = /kim_cuong|hoi_thien|scene_/;
/** Chiêu diện rộng/từ trên cao: lùi camera, ngẩng cao để thấy cả vùng. */
const WIDE =
  /scene_|kim_cuong|thien_kiem_vu|van_kiem_quy_tong|tram_son_dao|co_trieu|thien_kiem_hoa_hinh|loi_dinh|phap_tuong|hoi_thien|phap_gioi|tran_son|thiet_quyen|moc_linh|duoc_vu/;
/** Chiêu lướt của công pháp (phím Q, `useDash`). Chiêu lướt bậc cao (Nghịch Kiếm, Dịch Sơn Xung) nằm trên thanh chiêu: bấm ô như chiêu thường. */
const DASH = /kiem_anh_bo|thiet_bich_xung|luu_huong_bo/;
/** Chiêu tối thượng của Đao tu: không qua thanh chiêu (cần vòng sạc thật), chỉ phát dòng thời gian FX để duyệt hình. */
const INJECT_ONLY = /tram_son_dao|co_trieu|co_than_nhat_kich|cuu_tieu_thien_loi|mau_don_cam/;
const ULT =
  /van_kiem_quy_tong|thien_kiem_hoa_hinh|kim_cuong|anh_thiet|thuan_di_ho_the|phap_tuong|hoi_thien|anh_duoc|thuan_di_cuu_vien|phap_gioi/;
/** Thời lượng ghi riêng (ms game) của chiêu có niệm. */
const SPAN: Record<string, number> = {
  skl_phi_kiem: 3000,
  skl_loi_dinh_nhat_kiem: 3300,
  skl_kiem_vu_tam_diep: 1900,
  skl_van_kiem_quy_tong: 2200,
  skl_thien_kiem_hoa_hinh: 2200,
};
const MON_SPAN: Record<string, number> = { boom_circle: 2600, boom_line: 2600, boom_cone: 2600, death: 2400, chant: 2400 };
const MON_DIST: Record<string, number> = { boom_circle: 13, cast: 15, bolt: 15 };
const MON_DEFAULT: Record<string, string> = {
  hit: 'mon_hoa_van_ho',
  strike: 'mon_yeu_lang',
  cast: 'mon_hoa_van_ho',
  boom_circle: 'elite_cu_nham_vien',
  boom_line: 'mon_mach_thuong_ho_ve',
  boom_cone: 'boss_han_giao',
  bolt: 'mon_hoa_van_ho',
  death: 'mon_thach_vien',
  chant: 'boss_han_giao',
};
const SPOTS: [number, number][] = [
  [2048, 2088],
  [2088, 2088],
  [2008, 2088],
  [2048, 2128],
  [2048, 2048],
  [2088, 2128],
  [2008, 2128],
  [2088, 2048],
];

const ALLY_ONLY = /thuan_di_ho_the|thuan_di_cuu_vien/;
const SKILLS = list('--skills', 'skl_kiem_khi_tram,skl_phi_kiem');
const FXQ = opt('--fxq', 'high');
const PERF = flag('--perf');
// Chiêu Hộ pháp/Đan sư mở ở cấp 16+: mặc định cấp 28 + `skills max` để chiêu ra được (cấp 12 thì chiêu bị khóa, khung chỉ có nền).
const LEVEL = num('--level', SKILLS.some((s) => METHOD_OF[s] || (SKILL.get(s)?.unlock ?? 0) > 12) ? 28 : 12);
const FPS = num('--fps', 24);
const SLOW = num('--slow', 0.25);
const TILE = num('--tile', 40);
const TMAX = num('--tmax', 1000);
type Frame = { at: number; data: string };
type Rec = { frames: Frame[]; t0: number; hits: number[] };

/** Chuỗi thuần chạy trong trang (tsx chèn `__name` vào hàm lồng nhau): ghi draw call/tam giác/ms/lưới FX sống mỗi khung vào `__vfxPerf`. */
const SAMPLER = `(() => { const g = window.__game; const o = (window.__vfxPerf = { dc: [], tri: [], ms: [], live: [] }); let last = performance.now(); (function t() { const i = g.info(); const n = performance.now(); o.dc.push(i.drawCalls); o.tri.push(i.triangles); o.ms.push(n - last); o.live.push(g.vfx.pool.live); last = n; requestAnimationFrame(t); })(); })()`;
const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)] ?? 0;
const perfLine = (p: Record<string, number[]>) =>
  `draw p50/p95/max ${q(checkedAt(p, 'dc', 'p'), 0.5)}/${q(checkedAt(p, 'dc', 'p'), 0.95)}/${Math.max(...checkedAt(p, 'dc', 'p'))}, tam giác p50/max ${q(checkedAt(p, 'tri', 'p'), 0.5)}/${Math.max(...checkedAt(p, 'tri', 'p'))}, khung ms p50/p95/p99 ${q(checkedAt(p, 'ms', 'p'), 0.5).toFixed(1)}/${q(checkedAt(p, 'ms', 'p'), 0.95).toFixed(1)}/${q(checkedAt(p, 'ms', 'p'), 0.99).toFixed(1)}, lưới FX sống p50/max ${q(checkedAt(p, 'live', 'p'), 0.5)}/${Math.max(...checkedAt(p, 'live', 'p'))}`;

function ffmpegPath(): string {
  if (env('FFMPEG')) return env('FFMPEG');
  const pnpm = path.join(ROOT, 'node_modules/.pnpm');
  for (const d of fs.existsSync(pnpm) ? fs.readdirSync(pnpm) : []) {
    const exe = ['ffmpeg.exe', 'ffmpeg']
      .map((e) => path.join(pnpm, d, 'node_modules/ffmpeg-static', e))
      .find((p) => d.startsWith('ffmpeg-static@') && fs.existsSync(p));
    if (exe) return exe;
  }
  return 'ffmpeg';
}

/** Camera gần, lệch `yawOff` so với hướng nhìn về con quái gần nhất. */
async function closeCam(page: Page, dist: number, yawOff: number, pitch = 0.2): Promise<void> {
  const yaw = await page.evaluate(() => {
    const g = window.__game!;
    const near = [...g.view.monsters.values()]
      .filter((m) => m.st !== 3)
      .sort((a, b) => Math.hypot(a.x - g.cur.x, a.z - g.cur.z) - Math.hypot(b.x - g.cur.x, b.z - g.cur.z))[0];
    return near ? Math.atan2(near.x - g.cur.x, near.z - g.cur.z) : g.cur.yaw;
  });
  await cam(page, { yaw: yaw + yawOff, pitch, dist });
  await sleep(700);
}

/** Dọn sân, hồi chiêu, gọi một con quái làm mục tiêu (bỏ chọn mục tiêu để chiêu tự chọn). */
async function scene(page: Page, mon: string | null, lab = false): Promise<void> {
  if (lab) await page.evaluate(() => void (window.__game!.monFx.lab = true));
  await gm(page, 'killall', 900);
  await sleep(8000);
  await gm(page, 'heal', 500);
  await gm(page, 'cd', 500);
  await gm(page, 'god on', 1200);
  if (mon) await gm(page, `spawn ${mon} 1`, 1900);
  await page.evaluate(() => window.__game!.clearTarget());
}

/** Phát FX quái `kind` lên con quái gần nhất qua `__game.monFx` (đúng đường client dùng khi nhận tin server); `slow` để canh nhịp báo trước/nổ. */
const monAct = (page: Page, kind: string, slow: number) =>
  page.evaluate(`(() => {
    const k = ${JSON.stringify(kind)}, sl = ${slow};
    const g = window.__game;
    const mon = [...g.ents.monsters.values()].filter((m) => m.s.hp > 0).sort((a, b) => Math.hypot(a.x - g.cur.x, a.z - g.cur.z) - Math.hypot(b.x - g.cur.x, b.z - g.cur.z))[0];
    if (!mon) return;
    const me = g.ents.players.get(g.sid);
    const F = g.monFx;
    F.bypass = true;
    const yaw = Math.atan2(g.cur.x - mon.x, g.cur.z - mon.z);
    const kindOf = /thuy|han|yeu_lang|hac/.test(mon.s.t) ? 'frost' : 'fire';
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    // Vùng thử đặt quanh NGƯỜI chơi (quái đánh xa đứng ngoài khung): d > 0 = trước người (phía quái).
    const hz = (sh, r, d, extra) => Object.assign({ x: g.cur.x + dx * d, z: g.cur.z + dz * d, r, delay: 1.2, kind: kindOf, src: mon.id, sh, yaw: Math.atan2(-dx, -dz), w: sh === 'rect' ? 3 : 0.6 }, extra || {});
    const boom = (h) => { F.warn(h, mon); setTimeout(() => F.boom(h, mon), (h.delay * 1000) / sl); };
    if (k === 'hit') { for (let i = 0; i < 4; i++) setTimeout(() => F.hit(mon), (i * 260) / sl); }
    else if (k === 'strike') { for (let i = 0; i < 2; i++) setTimeout(() => F.strike(mon, me || g.cur), (i * 700) / sl); }
    else if (k === 'cast' || k === 'chant') F.cast(mon);
    else if (k === 'bolt') { g.vfx.bolts.spawn({ id: 9001, x: mon.x, z: mon.z, yaw, v: 9, r: 0.55, life: 1.4, kind: 'fire', sd: 3, h: 0 }, 0, 0xffa060); F.bolt(kindOf, mon.x, mon.y + 1, mon.z, yaw, false); setTimeout(() => { g.vfx.bolts.end(9001, g.cur.x, g.cur.z, true); F.bolt(kindOf, g.cur.x, g.cur.y + 0.8, g.cur.z, 0, true); }, 1000 / sl); }
    else if (k === 'boom_circle') boom(hz(undefined, 4.5, 0));
    else if (k === 'boom_line') boom(hz('rect', 10, 3, { mv: 'line' }));
    else if (k === 'boom_cone') boom(hz('cone', 12, 3));
  })()`);

/** Ra một chiêu: cảnh lớn bơm tin FX, chiêu lướt gọi `useDash`, chiêu trên thanh bấm ô; chiêu còn khóa phát thẳng sự kiện windup vào SkillFx. */
async function press(page: Page, id: string): Promise<void> {
  if (id === 'scene_fly_on') return page.evaluate(() => window.__game!.toggleFly());
  if (SCENES[id])
    return page.evaluate(
      (msg) =>
        void window.__game!.onFx({
          ...msg,
          src: window.__game!.sid,
          x: window.__game!.cur.x + 6,
          z: window.__game!.cur.z,
          ox: window.__game!.cur.x - 2,
          oz: window.__game!.cur.z,
        }),
      SCENES[id],
    );
  if (DASH.test(id)) return page.evaluate(() => window.__game!.useDash());
  // Thuấn Di Hộ Thế/Cứu Viện cần đồng đội (server từ chối khi đứng một mình): chỉ phát dòng thời gian FX.
  const slot =
    id === 'skl_phi_kiem'
      ? 0
      : ALLY_ONLY.test(id) || INJECT_ONLY.test(id)
        ? -1
        : await page.evaluate((i) => window.__game!.bar().findIndex((s) => s.id === i), id);
  if (slot >= 0) {
    // Chọn con quái sống gần nhất làm mục tiêu trước khi bấm: chiêu vùng neo vào mục tiêu, không chọn thì rơi về chỗ người ra chiêu
    // và con quái đứng ngoài tầm (ảnh Liệt Địa Trảm bản nữ không trúng sói).
    await page.evaluate(() => {
      const g = window.__game!;
      const near = [...g.view.monsters.entries()]
        .filter(([, m]) => m.st !== 3)
        .sort((a, b) => Math.hypot(a[1].x - g.cur.x, a[1].z - g.cur.z) - Math.hypot(b[1].x - g.cur.x, b[1].z - g.cur.z))[0];
      if (near) g.setTarget?.(near[0], 'mon');
    });
    return page.evaluate((s) => window.__game!.useSkill(s), slot);
  }
  await page.evaluate((sk) => {
    const g = window.__game!;
    const hit = [...g.view.monsters.entries()].find(([, m]) => m.st !== 3);
    if (hit) {
      g.fxArea.set(g.sid, { x: hit[1].x, z: hit[1].z, r: 12 });
      g.fxDst.set(g.sid, hit[0]);
      g.setTarget?.(hit[0], 'mon');
    }
    g.skillFx.handle(g.sid, { kind: 'windup', skill: sk, combo: -1, index: 0, t: 0, kb: false });
    // Cổ tu: server gửi thêm S.FX lúc ra chiêu triệu hồi (bầy cổ / Cổ Vương đứng quanh người gọi); kịch bản giả lập đúng tin đó.
    const stand: Record<string, [string, number]> = { skl_co_trieu: ['cotrieu', 10], skl_hoa_co_vuong: ['covuong', 12] };
    const st = stand[sk];
    if (st) void g.onFx({ t: st[0], src: g.sid, d: st[1] });
  }, id);
}

/** Ghi màn hình `span` ms game (đồng hồ thật = span / slow), chạy `act` lúc bắt đầu; trả khung + mốc hit theo ms game. */
async function record(ctx: BrowserContext, page: Page, slow: number, span: number, act: () => Promise<unknown>, skill = ''): Promise<Rec> {
  await page.bringToFront();
  await sleep(300);
  await page.evaluate(() => {
    window.__game!.skillLog.length = 0;
    window.__game!.skillFx.runner.log.length = 0;
  });
  if (PERF) await page.evaluate(SAMPLER);
  const cdp = await ctx.newCDPSession(page);
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ at: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, everyNthFrame: 1 });
  await sleep(250);
  const [t0, t0p] = await page.evaluate(() => [performance.timeOrigin + performance.now(), performance.now()]);
  await act();
  await sleep(Math.max(0, span / slow - ((await page.evaluate(() => performance.now())) - t0p)));
  await cdp.send('Page.stopScreencast');
  await cdp.detach().catch(() => undefined);
  const hits = await page.evaluate(
    ([p, s]) => window.__game!.skillLog.filter((x) => x.e.kind === 'hit').map((x) => Math.round((x.at - p) * s)),
    [t0p, slow] as const,
  );
  // Chiêu kích theo S.FX (lướt): mốc 0 = lúc sự kiện timeline đầu tiên của chiêu phát (nhật ký chiêu chỉ có mốc bấm, lệch ~0,25 s).
  // Lưu ý: từ cấp Nguyên Anh lướt cơ bản bị thay bằng thuấn di (`blinkReplaces`) nên timeline lướt không phát: chụp bằng `--level 20`.
  if (skill) {
    const at = await page.evaluate(
      (id) => window.__game!.skillFx.runner.log.find((x: { skill: string; real: number }) => x.skill === id)?.real,
      skill,
    );
    if (typeof at === 'number') hits.splice(0, hits.length, Math.round((at - t0p) * slow));
    else console.warn(`[shots:vfx] ${skill}: không thấy timeline phát (lướt bị thay bằng thuấn di ở cấp cao? thử --level 20)`);
  }
  return { frames, t0, hits };
}

/** Ghép khung JPEG (có dấu thời gian) thành webm VP9 tốc độ khung cố định, giữ đúng nhịp thật. */
function encodeWebm(r: Rec, file: string): boolean {
  if (r.frames.length < 3) return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfxv-'));
  // Chọn khung gần nhất cho từng nhịp 1/FPS để video đều (screencast chỉ gửi khi màn hình đổi).
  const start = Math.max(r.t0, checkedAt(r.frames, 0, 'r.frames').at);
  const n = Math.max(2, Math.floor(((checkedAt(r.frames, r.frames.length - 1, 'r.frames').at - start) / 1000) * FPS));
  for (let i = 0, j = 0; i < n; i++) {
    const t = start + (i * 1000) / FPS;
    while (
      j + 1 < r.frames.length &&
      Math.abs(checkedAt(r.frames, j + 1, 'r.frames').at - t) <= Math.abs(checkedAt(r.frames, j, 'r.frames').at - t)
    )
      j++;
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(checkedAt(r.frames, j, 'r.frames').data, 'base64'));
  }
  const ff = spawnSync(
    ffmpegPath(),
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(FPS),
      '-i',
      path.join(dir, 'f%05d.jpg'),
      '-vf',
      'crop=900:760:100:90',
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '1800k',
      '-crf',
      '34',
      '-pix_fmt',
      'yuv420p',
      file,
    ],
    { encoding: 'utf8' },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  if (ff.status !== 0) console.warn('[shots:vfx] ffmpeg lỗi:', ff.stderr?.slice(0, 300));
  return ff.status === 0;
}

/** Tờ dãy khung: mỗi ô một mốc `TILE` ms game (tới `TMAX`), 8 ô một hàng, viền đỏ ở khung hit. */
async function tileSheet(ctx: BrowserContext, file: string, title: string, r: Rec, span: number, slow: number): Promise<void> {
  const cells: { img: string; caption: string; mark: boolean }[] = [];
  for (let g = 0; g <= Math.min(span, TMAX); g += TILE) {
    const ms = g / slow;
    const f = r.frames.reduce<Frame | null>((b, x) => (!b || Math.abs(x.at - r.t0 - ms) < Math.abs(b.at - r.t0 - ms) ? x : b), null);
    if (!f || Math.abs(f.at - r.t0 - ms) > 120) continue;
    const game = Math.round((f.at - r.t0) * slow);
    const mark = r.hits.some((h) => Math.abs(h - game) <= TILE / 2 + 5);
    cells.push({ img: 'data:image/jpeg;base64,' + f.data, caption: `${game} ms${mark ? ' · hit' : ''}`, mark });
  }
  if (!cells.length) return;
  const rows = Array.from({ length: Math.ceil(cells.length / 8) }, (_, i) => ({ label: '', cells: cells.slice(i * 8, i * 8 + 8) }));
  const cell = Math.min(300, Math.floor(1800 / Math.min(8, cells.length)));
  const z = cell / 780;
  // Cắt vùng 780×640 quanh nhân vật trong khung 1100×900.
  await sheet(ctx, file, rows, {
    cell,
    ratio: 640 / 780,
    title,
    crop: `width:${Math.round(1100 * z)}px;margin-left:${-Math.round(160 * z)}px;margin-top:${-Math.round(130 * z)}px`,
  });
}

/** Sân đông: N người giả (chỉ phía client) cùng ra chiêu quanh mình, mỗi người ~0,9 s một chiêu; in số đo. */
async function crowd(page: Page, n: number): Promise<void> {
  await scene(page, 'mon_soi_xam');
  await closeCam(page, 14, 0.9);
  await page.evaluate(`(() => { const g = window.__game; const SK = ${JSON.stringify(SKILLS)}; const R = g.skillFx.runner; const FXT = window.__fxTimelines; const me = g.cur;
    const fakes = []; for (let i = 0; i < ${n}; i++) { const a = i * 2.399, r = 4 + (i % 7) * 3.3; fakes.push({ sid: 'fake' + i, a: { x: me.x + Math.cos(a) * r, y: me.y, z: me.z + Math.sin(a) * r, yaw: a + Math.PI, model: {} } }); }
    let k = 0; const tick = () => { if (window.__vfxStop) return; const f = fakes[k++ % fakes.length]; const id = SK[Math.floor(Math.random() * SK.length)]; const tl = FXT.get(id); const def = FXT.skill(id); if (tl && def) R.start(f.sid, f.a, def, tl, { kind: 'windup', skill: id, combo: -1, index: 0, t: 0, kb: false }, false, 20, 'lac_kiem_quyet'); setTimeout(tick, ${Math.round(900 / Math.max(1, n))}); }; tick(); })()`);
  await page.evaluate(SAMPLER);
  await sleep(num('--crowd-secs', 15) * 1000);
  const p = await page.evaluate(`(window.__vfxStop = true, window.__vfxPerf)`);
  console.log(`[crowd] ${n} người, ${SKILLS.length} chiêu, fxq=${FXQ}: ${perfLine(p as Record<string, number[]>)}`);
}

export default {
  name: 'vfx',
  desc: 'VFX từng chiêu/FX quái/cảnh lớn: webm chậm + thật và tờ dãy khung có mốc hit, nam/nữ; --crowd N đo sân đông',
  usage:
    '[--skills skl_a,mon:hit,scene_kiep_kd] [--genders m,f] [--fxq high|medium|low] [--level 12] [--perf] [--crowd N] [--webm-only|--sheet-only] [--fps 24] [--vw 1100 --vh 900] [--stills -70,0,200] [--tile 40] [--tmax 1000] [--dist 7] [--span 1700] [--query a=b]',
  async run(r) {
    const sheetCtx = await r.browser.newContext({ viewport: { width: 1800, height: 800 } });
    const sheets: (() => Promise<void>)[] = [];
    const sheeted = new Set<string>();
    let spot = 0;
    for (const g of list('--genders', 'm,f')) {
      for (const pass of ['slow', 'real'] as const) {
        const slow = pass === 'slow' ? SLOW : 1;
        const { ctx, page } = await r.open({
          name: `V${g}${pass[0]}`,
          viewport: [num('--vw', 1100), num('--vh', 900)],
          quality: opt('--quality', 'high'),
          look: { g },
          hide: 'hud',
          query: { quiet: 1, fxq: FXQ, slowmo: pass === 'slow' ? SLOW : undefined },
          extra: opt('--query', ''),
        });
        const method = async (id: string) => {
          await gm(page, `method ${id} 5`, 1400);
          if (LEVEL >= 16) await gm(page, 'skills max', 1500);
        };
        await gm(page, 'level ' + LEVEL, 1600);
        await gm(page, 'god on', 1600);
        await method('lac_kiem_quyet');
        await gm(page, `tp ${checkedAt(SPOTS, spot++ % SPOTS.length, 'SPOTS').join(' ')}`, 1600);
        // Chờ model người chơi v3 (mặc định từ N-7) nạp xong để động tác đủ.
        await page.waitForFunction(() => window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3 === true, undefined, {
          timeout: 60_000,
          polling: 300,
        });
        const crowdN = num('--crowd', 0);
        if (crowdN > 0) {
          await crowd(page, crowdN);
          await ctx.close();
          return;
        }
        let cur = 'lac_kiem_quyet';
        for (const sk of SKILLS) {
          const want = METHOD_OF[sk] ?? SKILL.get(sk)?.method ?? 'lac_kiem_quyet';
          if (want !== cur) await method((cur = want));
          const [, kind, monId] = sk.startsWith('mon:') ? sk.split(':') : [];
          const mon = kind ? { kind, id: monId ?? MON_DEFAULT[kind] ?? 'mon_soi_xam' } : null;
          await scene(page, mon ? mon.id : PHAP.test(sk) ? null : 'mon_soi_xam', !!mon);
          if (PHAP.test(sk)) {
            // Đứng ở chỗ trống giữa sân (không cột/cổng chắn camera); chiêu tự thân thì dọn hẳn quái quanh đó trước.
            if (PHAP_SOLO.test(sk)) {
              await gm(page, 'tp 2048 2400', 800);
              await sleep(9500);
            }
            await gm(page, 'tp 2048 2150', 1500);
            if (!PHAP_SOLO.test(sk)) await gm(page, 'spawn mon_soi_xam 1', 1500);
          }
          if (ULT.test(sk)) await gm(page, 'charge', 1800);
          const wide = WIDE.test(sk);
          const dist = mon ? num('--mon-dist', MON_DIST[mon.kind] ?? 10) : wide ? num('--wide', 9.5) : num('--dist', 7);
          await closeCam(
            page,
            dist,
            PHAP.test(sk) ? Math.PI + 0.15 : mon ? num('--mon-yaw', 1.1) : 0.9,
            mon ? 0.4 : wide && !PHAP.test(sk) ? 0.3 : 0.2,
          );
          const span = SPAN[sk] ?? (mon ? (MON_SPAN[mon.kind] ?? 1600) : num('--span', 1700));
          const rec = await record(
            ctx,
            page,
            slow,
            span,
            async () => {
              if (mon) return mon.kind === 'death' ? gm(page, 'killall', 0) : monAct(page, mon.kind, slow);
              // Đánh thường: liên hoàn 3 đòn, bấm theo nhịp game (đồng hồ thật = game / slow).
              for (let k = 0; k < (sk === 'skl_phi_kiem' ? 3 : 1); k++) {
                await press(page, sk);
                if (sk === 'skl_phi_kiem') await sleep((620 / slow) | 0);
              }
            },
            SKILL.get(sk)?.kind === 'dash' ? sk : '',
          );
          const gpuErr = await page.evaluate(() => window.__game!.gpuErrors ?? []);
          if (gpuErr.length) console.warn('[shots:vfx] gpuErrors:', JSON.stringify(gpuErr).slice(0, 1500));
          if (PERF) console.log(`[perf] ${sk} ${pass}: ${perfLine((await page.evaluate(() => window.__vfxPerf))!)}`);
          const tag = `${g === 'm' ? 'nam' : 'nu'}-${sk.replace('skl_', '').replace(/:/g, '_')}`;
          if (!flag('--sheet-only'))
            console.log(
              `[shots:vfx] webm ${tag}-${pass}: ${encodeWebm(rec, path.join(r.out, `${tag}-${pass === 'slow' ? 'cham' : 'that'}.webm`)) ? 'ok' : 'lỗi'} (${rec.frames.length} khung)`,
            );
          // Tờ ảnh lấy từ lượt chậm; lượt chậm không ghi được khung (hiếm, GPU bận) thì lấy từ lượt thật.
          const slowOk = pass === 'slow' && rec.frames.length >= 3;
          if (slowOk) sheeted.add(tag);
          // `--stills -70,0,200`: ảnh đủ cỡ viewport tại các mốc (ms game) so với khung hit đầu tiên (lượt chậm cho nhiều khung).
          // Chiêu không có sự kiện `hit` trong nhật ký (tối thượng bơm giả ở client): ước tính từ hitAt của chiêu + 70 ms trễ khởi động.
          if (slowOk && !rec.hits.length && opt('--stills', '')) {
            const h0 = SKILL.get(sk)?.hitAt?.[0];
            if (h0 !== undefined) rec.hits = [Math.round(h0 * 1000) + 70];
          }
          if (slowOk && rec.hits.length && opt('--stills', '')) {
            for (const off of opt('--stills', '').split(',').map(Number)) {
              const want = rec.hits[0]! + off;
              const f = rec.frames.reduce<Frame | null>(
                (b, x) => (!b || Math.abs((x.at - rec.t0) * slow - want) < Math.abs((b.at - rec.t0) * slow - want) ? x : b),
                null,
              );
              if (f) fs.writeFileSync(path.join(r.out, `${tag}-still${off >= 0 ? '+' : ''}${off}.jpg`), Buffer.from(f.data, 'base64'));
            }
          }
          if (!flag('--webm-only') && (slowOk || (pass === 'real' && !sheeted.has(tag)))) {
            const title = `${sk} · ${g === 'm' ? 'Thanh Phong (nam)' : 'Lam Chi (nữ)'} · mỗi ô ${TILE} ms game, viền đỏ = khung hit`;
            sheets.push(() => tileSheet(sheetCtx, path.join(r.out, `${tag}.png`), title, rec, span, slow));
          }
        }
        await ctx.close();
      }
    }
    for (const job of sheets) await job();
  },
} satisfies Scenario;
