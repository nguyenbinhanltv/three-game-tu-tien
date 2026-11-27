// Hào quang cảnh giới trên nhân vật (RFX-1): mỗi cảnh giới (Kết Đan, Nguyên Anh, Hóa Thần, Ảnh Biến) × ba đạo (Kiếm tu, Hộ pháp, Đan sư)
// chụp 1080p + 720p, dãy khung pháp tướng khi ra chiêu tối thượng (Hóa Thần+), video ngắn (đứng yên, chạy, ra chiêu lớn), và
// đo draw call/khung hình trước-sau (`--perf`: tắt/bật hào quang, thêm `--others N` người khác cùng sân).
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { flag, list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, info, perfSample } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';
import { at } from '@dtl/shared';

const DAO: Record<string, { method: string; ult: string; cap: string; label: string }> = {
  kiem: { method: 'lac_kiem_quyet', ult: 'skl_van_kiem_quy_tong', cap: 'skl_thien_kiem_hoa_hinh', label: 'kiemtu' },
  ho: { method: 'bat_dong_kim_than', ult: 'skl_kim_cuong_bat_hoai', cap: 'skl_thien_kim_phap_tuong', label: 'hophap' },
  dan: { method: 'thanh_moc_dan_kinh', ult: 'skl_hoi_thien_dan_lo', cap: 'skl_thien_dan_phap_gioi', label: 'dansu' },
};
const REALMS: Record<string, { lv: number; label: string }> = {
  nk: { lv: 15, label: 'ngungkhi' },
  kd: { lv: 20, label: 'ketdan' },
  na: { lv: 24, label: 'nguyenanh' },
  hn: { lv: 28, label: 'hoathan' },
  ab: { lv: 32, label: 'anhbien' },
};

/** `--iso`: ảnh ở camera chéo mặc định (Chân Cảnh C5); `--party5`: cảnh 5 người cùng đứng ở sân tông môn. */
const ISO = flag('--iso');
const ISO_VIEWS: [string, number, number][] = [['iso', 0, 0]];
const VIEWS: [string, number, number][] = [
  ['sau', Math.PI + 0.5, 0.16], // camera sau lưng nhân vật
  ['truoc', 0.5, 0.16], // nhìn thẳng mặt
];

async function shotBoth(page: Page, out: string, stem: string, vw: number, vh: number): Promise<void> {
  await snap(page, out, `${stem}-1080p.jpg`, { wait: 250 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(700);
  await snap(page, out, `${stem}-720p.jpg`, { wait: 250 });
  await page.setViewportSize({ width: vw, height: vh });
  await sleep(700);
}

async function useSlot(page: Page, id: string): Promise<boolean> {
  // Công pháp mới chọn bằng GM chỉ vào thanh kỹ năng khi server gửi lại trạng thái công pháp: chờ tới khi có.
  await page
    .waitForFunction((i) => window.__game!.bar().some((s) => s.id === i), id, { timeout: 12_000, polling: 300 })
    .catch(() => undefined);
  return page.evaluate((i) => {
    const g = window.__game!;
    const slot = g.bar().findIndex((s) => s.id === i);
    if (slot < 0) return false;
    g.useSkill(slot);
    return true;
  }, id);
}

/** Ra chiêu `id`; chiêu tối thượng cần sạc đầy và trạng thái công pháp tới client, nên thử lại tới khi thấy sự kiện windup. */
async function cast(page: Page, id: string, ult: boolean): Promise<boolean> {
  for (let k = 0; k < 5; k++) {
    await gm(page, 'cd', 300);
    if (ult) await gm(page, 'charge', 1800);
    const n0 = (await page.evaluate('window.__game.skillLog.length')) as number;
    if (!(await useSlot(page, id))) return false;
    await sleep(350);
    const hit = (await page.evaluate(
      `window.__game.skillLog.slice(${n0}).some((x) => x.e.skill === ${JSON.stringify(id)} && x.e.kind === 'windup')`,
    )) as boolean;
    if (hit) return true;
  }
  // Server từ chối (ví dụ chưa đủ sạc ở máy thử): phát sự kiện windup giả ở client để vẫn chụp được phần hình.
  if (ult) {
    console.warn(`[shots:realmaura] ${id}: server không nhận chiêu tối thượng, phát sự kiện windup giả ở client`);
    await page.evaluate(
      `window.__game.emitSkillEvent(window.__game.sid, { kind: 'windup', skill: ${JSON.stringify(id)}, index: 0, combo: -1, t: 0, kb: false })`,
    );
    return true;
  }
  return false;
}

/** Dựng trạng thái: đạo + cảnh giới, bất tử, đứng ở sân tông môn, có một quái làm mục tiêu cho chiêu sát thương. */
async function setup(page: Page, dao: string, lv: number): Promise<void> {
  // Trạng thái công pháp tới client chậm/đôi khi trượt: gửi lại tới khi thanh kỹ năng có chiêu tối thượng của đạo.
  for (let k = 0; k < 4; k++) {
    await gm(page, `method ${at(DAO, dao, 'DAO').method} 15`, 800);
    const ok = await page
      .waitForFunction((i) => window.__game!.bar().some((s) => s.id === i), at(DAO, dao, 'DAO').ult, { timeout: 4000, polling: 250 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  for (let k = 0; k < 4; k++) {
    await gm(page, `level ${lv}`, 1200);
    const ok = await page
      .waitForFunction((n) => (window.__game!.me()?.lv as number) >= n, lv, { timeout: 4000, polling: 250 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await gm(page, 'god on', 900);
  await gm(page, 'tp 2048 2088', 1600);
}

async function stat(page: Page): Promise<string> {
  const s = (await page.evaluate('JSON.stringify(window.__game.realmAura?.stats?.() ?? null)')) as string;
  return s;
}

export default {
  name: 'realmaura',
  desc: 'Hào quang cảnh giới trên nhân vật: 4 cảnh giới × 3 đạo (1080p + 720p), dãy khung pháp tướng, video, đo hiệu năng trước/sau',
  usage:
    '[--daos kiem,ho,dan] [--realms kd,na,hn,ab] [--fxq high] [--mood day|night] [--mode off|min|std|full] [--run] [--video] [--perf] [--budget] [--cmp] [--settings] [--others N] [--only stills|phantom]',
  async run(r) {
    const daos = list('--daos', 'kiem,ho,dan');
    const realms = list('--realms', 'kd,na,hn,ab');
    const only = opt('--only', 'all');
    const vw = 1920;
    const vh = 1080;
    const quality = opt('--quality', 'high');
    const fxq = opt('--fxq', 'high');
    const mood = opt('--mood', '');
    /** Chế độ Hào quang khi chụp (mặc định Chuẩn, như người chơi); `--mode full` để so bản cũ. */
    const mode = opt('--mode', 'std');
    const query = { fxq, ...(mood ? { mood } : {}), ...(flag('--off') ? { aura: 0 } : {}) };

    if (flag('--party5')) {
      await party5(r, realms, quality, fxq, mode);
      return;
    }
    if (flag('--perf')) {
      await perf(r, daos, num('--others', 4), quality, fxq, mode);
      return;
    }
    if (flag('--settings')) {
      // Bảng Cài đặt mới (Hào quang cảnh giới / người khác / khi chiến đấu).
      const { ctx, page } = await r.open({ name: 'Aset', viewport: [vw, vh], dpr: 1, quality, query: { fxq }, warnings: /models/ });
      await sleep(2500);
      await page.locator('[data-testid="hub-settings"]').click();
      await sleep(1200);
      const found = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].find((e) =>
          [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').includes('Hào quang cảnh giới')),
        );
        el?.scrollIntoView({ block: 'start' });
        return !!el;
      });
      if (!found) console.warn('[shots:realmaura] không tìm thấy mục Hào quang cảnh giới trong Cài đặt');
      await sleep(500);
      await snap(page, r.out, 'cai-dat-hao-quang.jpg', { wait: 600 });
      await ctx.close();
      return;
    }
    if (flag('--cmp')) {
      await cmp(r, quality, fxq, mode);
      return;
    }
    if (flag('--budget')) {
      await budget(r, daos, quality, fxq);
      return;
    }

    for (const dao of daos) {
      const d = at(DAO, dao, 'DAO');
      const { ctx, page } = await r.open({ name: `Au${dao}`, viewport: [vw, vh], dpr: 1, quality, query, hide: 'hud', warnings: /models/ });
      await gm(page, 'god on', 800);
      await page.evaluate(`window.__game.setAuraMode(${JSON.stringify(mode)})`);
      for (const rk of realms) {
        const re = at(REALMS, rk, 'REALMS');
        await setup(page, dao, re.lv);
        if (only !== 'phantom') {
          for (const [vn, yaw, pitch] of ISO ? ISO_VIEWS : VIEWS) {
            // `--iso`: giữ camera chéo khóa góc mặc định của game (không đặt lại camera), để duyệt hào quang đúng góc người chơi thấy.
            if (!ISO) await cam(page, { yaw, pitch, dist: 4.4 });
            await sleep(4600); // đứng yên > 3 s: lớp phụ/nền đã mở (Chuẩn)
            await shotBoth(page, r.out, `${d.label}-${re.label}-${vn}`, vw, vh);
          }
          if (flag('--run')) {
            // Đang chạy: chỉ còn lớp chính mờ bớt. `--iso` giữ camera chéo khóa góc (chụp cả 1080p và 720p, mỗi cỡ một lượt chạy).
            for (const [w, h, tag] of [
              [vw, vh, '1080p'],
              [1280, 720, '720p'],
            ] as const) {
              if (!ISO) await cam(page, { yaw: Math.PI + 0.5, pitch: 0.16, dist: 4.4 });
              if (tag === '720p') {
                await page.setViewportSize({ width: w, height: h });
                await sleep(700);
              }
              await page.keyboard.down('KeyW');
              await sleep(900);
              await snap(page, r.out, `${d.label}-${re.label}-chay-${tag}.jpg`, { wait: 0 });
              await page.keyboard.up('KeyW');
              await gm(page, 'tp 2048 2088', 1400);
            }
            await page.setViewportSize({ width: vw, height: vh });
            await sleep(500);
          }
          // Đang ngự kiếm: hào quang quanh người phải tắt (soát ở Nguyên Anh+).
          if (re.lv >= 24 && rk === 'na') {
            await page.evaluate(() => window.__game!.toggleFly());
            await sleep(2200);
            await cam(page, { yaw: Math.PI + 0.5, pitch: 0.16, dist: 4.4 });
            await snap(page, r.out, `${d.label}-${re.label}-nguykiem-1080p.jpg`, { wait: 300 });
            await page.evaluate(() => window.__game!.toggleFly());
            await sleep(1800);
          }
        }
        if (only !== 'stills' && re.lv >= 28) {
          await gm(page, 'spawn mon_soi_xam 1', 1500);
          await gm(page, 'cd', 600);
          await gm(page, 'charge', 900);
          await cam(page, { yaw: Math.PI + 0.7, pitch: 0.12, dist: 11 });
          await sleep(900);
          for (const id of [d.ult, d.cap]) {
            const ok = await cast(page, id, id === d.ult);
            if (!ok) {
              console.warn(
                `[shots:realmaura] không thấy chiêu ${id}; thanh: ${(await page.evaluate(() => window.__game!.bar().map((s) => s.id))).join(',')}`,
              );
              continue;
            }
            // Dãy khung quanh lúc ra chiêu: mỗi ~140 ms một ảnh, chọn lại sau khi mở.
            for (let k = 0; k < 9; k++) {
              await snap(page, r.out, `${d.label}-${re.label}-${id.replace('skl_', '')}-f${k}-1080p.jpg`, { wait: 0 });
              await sleep(90);
            }
            const evs = (await page.evaluate(
              'JSON.stringify(window.__game.skillLog.slice(-5).map((x) => x.e.skill + ":" + x.e.kind))',
            )) as string;
            console.log(`[shots:realmaura] ${dao} ${re.label} ${id}: ${await stat(page)} sự kiện ${evs}`);
            await sleep(2500);
          }
          await gm(page, 'killall', 1200);
        }
        const i = await info(page);
        console.log(`[shots:realmaura] ${dao} ${re.label}: draw ${i.drawCalls}, tam giác ${i.triangles}, aura ${await stat(page)}`);
      }
      await gm(page, 'tp 2048 2900', 900);
      await ctx.close();
    }

    if (flag('--video')) await videos(r, daos, quality, fxq);
  },
} satisfies Scenario;

/** Video ngắn mỗi đạo ở Hóa Thần (`--vlevel`): đứng yên, chạy, ra chiêu lớn (tối thượng rồi chiêu số 6). */
async function videos(r: Parameters<Scenario['run']>[0], daos: string[], quality: string, fxq: string): Promise<void> {
  const dir = path.join(r.out, '_video');
  fs.mkdirSync(dir, { recursive: true });
  for (const dao of daos) {
    const d = at(DAO, dao, 'DAO');
    const { ctx, page } = await r.open({
      name: `Av${dao}`,
      viewport: [1280, 720],
      dpr: 1,
      quality,
      query: { fxq },
      video: dir,
      hide: 'hud',
      warnings: /models/,
    });
    await setup(page, dao, num('--vlevel', 28));
    await gm(page, 'spawn mon_soi_xam 1', 1500);
    await cam(page, { yaw: Math.PI + 0.5, pitch: 0.14, dist: 7 });
    await sleep(3500); // đứng yên
    await page.keyboard.down('KeyW');
    await sleep(3200); // chạy
    await page.keyboard.up('KeyW');
    await sleep(900);
    await cam(page, { yaw: Math.PI + 0.7, pitch: 0.12, dist: 11 });
    await cast(page, d.ult, true);
    await sleep(2200);
    await cast(page, d.cap, false);
    await sleep(2600);
    await ctx.close();
    const vids = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.webm') && !f.startsWith('video-'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (vids[0]) fs.renameSync(path.join(dir, vids[0].f), path.join(r.out, `video-${d.label}-hoathan.webm`));
  }
}

/** Cảnh 5 người (C5): mình + 4 phiên khác đứng quanh nhau ở sân tông môn, cùng cảnh giới `re`; ảnh ở camera chéo mặc định, 1080p + 720p. */
async function party5(r: Parameters<Scenario['run']>[0], realms: string[], quality: string, fxq: string, mode: string): Promise<void> {
  const keys = Object.keys(DAO);
  for (const rk of realms) {
    const re = at(REALMS, rk, 'REALMS');
    const { ctx, page } = await r.open({
      name: 'Ap5',
      viewport: [1920, 1080],
      dpr: 1,
      quality,
      query: { fxq, ...(opt('--mood', '') ? { mood: opt('--mood', '') } : {}) },
      hide: 'hud',
      warnings: /models/,
    });
    await page.evaluate(`window.__game.setAuraMode(${JSON.stringify(mode)})`);
    await setup(page, keys[0]!, re.lv);
    const extra: { close(): Promise<void> }[] = [];
    // `--others N` (mặc định 4): số người khác cùng cảnh, xếp hai hàng sau/trước người chơi để kiểm cảnh đông.
    const nOthers = num('--others', 4);
    for (let i = 0; i < nOthers; i++) {
      const o = await r.open({ name: `Ap5o${i}`, viewport: [640, 360], dpr: 1, quality: 'low', hide: 'hud', warnings: /models/ });
      await setup(o.page, keys[(i + 1) % keys.length]!, re.lv);
      await gm(o.page, `tp ${2044 + (i % 4) * 2.6} ${2094 + (i % 2) * 2.4 + Math.floor(i / 4) * 4.8}`, 800);
      extra.push(o.ctx);
    }
    await gm(page, 'tp 2048 2090', 1500);
    await sleep(6000); // đứng yên > 3 s: lớp phụ/nền mở
    await shotBoth(page, r.out, `party5-${re.label}`, 1920, 1080);
    for (const c of extra) await c.close();
    await ctx.close();
  }
}

/** Đo trước/sau: tắt/bật hào quang trong cùng phiên, mình ở Ảnh Biến + N người khác (mỗi người một phiên) đứng quanh. */
async function perf(
  r: Parameters<Scenario['run']>[0],
  daos: string[],
  others: number,
  quality: string,
  fxq: string,
  mode: string,
): Promise<void> {
  const { ctx, page } = await r.open({
    name: 'Aperf',
    viewport: [1280, 720],
    dpr: 1,
    quality,
    query: { fxq },
    hide: 'hud',
    warnings: /models/,
  });
  await setup(page, at(daos, 0, 'daos'), 32);
  const extra: { close(): Promise<void> }[] = [];
  const keys = Object.keys(DAO);
  for (let i = 0; i < others; i++) {
    const dao = at(keys, i % keys.length, 'keys');
    const o = await r.open({ name: `Ao${i}`, viewport: [640, 360], dpr: 1, quality: 'low', hide: 'hud', warnings: /models/ });
    await setup(o.page, dao, [20, 24, 28, 32][i % 4] ?? 20);
    await gm(o.page, `tp ${2046 + (i % 3) * 2.2} ${2092 + Math.floor(i / 3) * 2.4}`, 800);
    extra.push(o.ctx);
  }
  await gm(page, 'tp 2048 2090', 1500);
  await cam(page, { yaw: Math.PI + 0.5, pitch: 0.2, dist: 9 });
  await sleep(2500);
  const rows: Record<string, unknown>[] = [];
  for (const on of [false, true, false, true]) {
    await page.evaluate(`window.__game.setAuraMode(${JSON.stringify(on ? mode : 'off')})`);
    await sleep(4500);
    const p = await perfSample(page);
    rows.push({ aura: on, ...p, stats: await stat(page) });
  }
  console.log('[shots:realmaura] perf', JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(r.out, 'perf.json'), JSON.stringify({ others, quality, fxq, mode, rows }, null, 2));
  for (const c of extra) await c.close();
  await ctx.close();
}

/**
 * Ngân sách draw call MỖI NGƯỜI: một nhân vật đứng yên (đã "đã yên" để lớp phụ/nền mở) ở từng cảnh giới × đạo, hiệu số draw call
 * giữa Tắt và từng chế độ. Mục tiêu: Chuẩn ≤ 25, Đầy đủ ≤ 60. Ghi `budget.json`.
 */
async function budget(r: Parameters<Scenario['run']>[0], daos: string[], quality: string, fxq: string): Promise<void> {
  const rows: { dao: string; realm: string; off: number; std: number; full: number; dStd: number; dFull: number }[] = [];
  for (const dao of daos) {
    const { ctx, page } = await r.open({
      name: `Ab${dao}`,
      viewport: [1280, 720],
      dpr: 1,
      quality,
      query: { fxq },
      hide: 'hud',
      warnings: /models/,
    });
    for (const rk of Object.keys(REALMS)) {
      await setup(page, dao, at(REALMS, rk, 'REALMS').lv);
      await cam(page, { yaw: Math.PI + 0.5, pitch: 0.2, dist: 6 });
      const m: Record<string, number> = {};
      for (const mode of ['off', 'std', 'full']) {
        await page.evaluate(`window.__game.setAuraMode(${JSON.stringify(mode)})`);
        await sleep(5200);
        m[mode] = (await perfSample(page)).drawCalls;
      }
      const row = {
        dao,
        realm: at(REALMS, rk, 'REALMS').label,
        off: at(m, 'off', 'm'),
        std: at(m, 'std', 'm'),
        full: at(m, 'full', 'm'),
        dStd: at(m, 'std', 'm') - at(m, 'off', 'm'),
        dFull: at(m, 'full', 'm') - at(m, 'off', 'm'),
      };
      console.log('[shots:realmaura] budget', JSON.stringify(row));
      rows.push(row);
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(r.out, 'budget.json'), JSON.stringify(rows, null, 2));
}

/** Đặt chế độ hào quang; bản cũ (trước VS-0) chỉ có bật/tắt nên bỏ qua `setAuraMode`. */
const setMode = (page: Page, m: string) =>
  page.evaluate(`window.__game.setAuraMode ? window.__game.setAuraMode(${JSON.stringify(m)}) : window.__game.setRealmAura(${m !== 'off'})`);

/**
 * Bộ ảnh so sánh TRƯỚC/SAU cùng camera, cùng vị trí, cùng tư thế (chạy trên cả nhánh cũ lẫn mới, `--out` khác nhau):
 * Kiếm tu × Nguyên Anh/Hóa Thần/Ảnh Biến: đứng yên, đang chạy, vừa ra chiêu (giao chiến); thẻ Nguyên Anh cận cảnh;
 * pháp tướng khi ra chiêu tối thượng (Hóa Thần, dãy khung); số draw call từng cảnh giới (Tắt / mặc định / Đầy đủ).
 */
async function cmp(r: Parameters<Scenario['run']>[0], quality: string, fxq: string, mode: string): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  const { ctx, page } = await r.open({
    name: 'Acmp',
    viewport: [1920, 1080],
    dpr: 1,
    quality,
    query: { fxq },
    hide: 'hud',
    warnings: /models/,
  });
  await gm(page, 'god on', 800);
  await setMode(page, mode);
  const FRONT = { yaw: 0.5, pitch: 0.16, dist: 4.4 };
  for (const rk of list('--realms', 'na,hn,ab')) {
    const re = at(REALMS, rk, 'REALMS');
    await setup(page, 'kiem', re.lv);
    await setMode(page, mode);
    await gm(page, 'killall', 400);
    // 1) đứng yên > 3 s
    await cam(page, FRONT);
    await sleep(4800);
    await snap(page, r.out, `${re.label}-1-yen.jpg`);
    if (rk === 'na') {
      await cam(page, { yaw: 0.5, pitch: 0.28, dist: 2.6 });
      await sleep(900);
      await snap(page, r.out, 'nguyenanh-the-nguyen-anh-can-canh.jpg');
      await cam(page, FRONT);
    }
    // 2) đang chạy
    await page.keyboard.down('KeyW');
    await sleep(1000);
    await snap(page, r.out, `${re.label}-2-chay.jpg`);
    await page.keyboard.up('KeyW');
    await gm(page, 'tp 2048 2088', 1400);
    // 3) giao chiến: ra chiêu vào quái gần
    await gm(page, 'spawn mon_soi_xam 1', 1500);
    await cam(page, FRONT);
    await gm(page, 'cd', 300);
    const cast1 = await cast(page, 'skl_kiem_khi_tram', false);
    await sleep(500);
    await snap(page, r.out, `${re.label}-3-chien.jpg`);
    if (!cast1) console.warn(`[shots:realmaura] ${re.label}: không ra được chiêu giao chiến`);
    // 4a) pháp tướng tách riêng (chỉ sự kiện windup chiêu tối thượng, không kèm hình chiêu): trước = ảnh mờ treo + bùng, sau = bùng ≤ 1,3 s lệch trục
    if (rk === 'hn') {
      await gm(page, 'killall', 600);
      await cam(page, { yaw: Math.PI + 0.5, pitch: 0.16, dist: 7 });
      await sleep(4800);
      await snap(page, r.out, 'phap-tuong-0-yen.jpg');
      await page.evaluate(
        `window.__game.emitSkillEvent(window.__game.sid, { kind: 'windup', skill: ${JSON.stringify(at(DAO, 'kiem', 'DAO').ult)}, index: 0, combo: -1, t: 0, kb: false })`,
      );
      let t0 = 0;
      for (const ms of [150, 450, 800, 1200, 1500]) {
        await sleep(ms - t0);
        t0 = ms;
        await snap(page, r.out, `phap-tuong-1-t${ms}.jpg`, { wait: 0 });
      }
      await sleep(1500);
    }
    // 4b) pháp tướng khi ra chiêu tối thượng thật (Hóa Thần)
    if (rk === 'hn') {
      await gm(page, 'killall', 600);
      await gm(page, 'spawn mon_soi_xam 1', 1500);
      await cam(page, { yaw: Math.PI + 0.7, pitch: 0.12, dist: 11 });
      await sleep(900);
      await cast(page, at(DAO, 'kiem', 'DAO').ult, true);
      for (let k = 0; k < 10; k++) {
        await snap(page, r.out, `hoathan-4-phap-tuong-f${k}.jpg`, { wait: 0 });
        await sleep(100);
      }
      await sleep(2500);
    }
    await gm(page, 'killall', 800);
    await gm(page, 'tp 2048 2088', 1400);
    await cam(page, { yaw: Math.PI + 0.5, pitch: 0.2, dist: 6 });
    // 5) draw call: Tắt / mặc định / Đầy đủ (bản cũ: Tắt / Bật)
    const m: Record<string, number> = {};
    for (const mm of ['off', mode, 'full']) {
      await setMode(page, mm);
      await sleep(5200);
      m[mm] = (await perfSample(page)).drawCalls;
    }
    rows.push({ realm: re.label, ...m });
    console.log('[shots:realmaura] cmp draw', JSON.stringify(rows[rows.length - 1]));
  }
  fs.writeFileSync(path.join(r.out, 'draw.json'), JSON.stringify(rows, null, 2));
  await ctx.close();
}
