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

const DAO: Record<string, { method: string; ult: string; cap: string; label: string }> = {
  kiem: { method: 'lac_kiem_quyet', ult: 'skl_van_kiem_quy_tong', cap: 'skl_thien_kiem_hoa_hinh', label: 'kiemtu' },
  ho: { method: 'bat_dong_kim_than', ult: 'skl_kim_cuong_bat_hoai', cap: 'skl_thien_kim_phap_tuong', label: 'hophap' },
  dan: { method: 'thanh_moc_dan_kinh', ult: 'skl_hoi_thien_dan_lo', cap: 'skl_thien_dan_phap_gioi', label: 'dansu' },
};
const REALMS: Record<string, { lv: number; label: string }> = {
  kd: { lv: 20, label: 'ketdan' },
  na: { lv: 24, label: 'nguyenanh' },
  hn: { lv: 28, label: 'hoathan' },
  ab: { lv: 32, label: 'anhbien' },
};

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
    await gm(page, `method ${DAO[dao].method} 15`, 800);
    const ok = await page
      .waitForFunction((i) => window.__game!.bar().some((s) => s.id === i), DAO[dao].ult, { timeout: 4000, polling: 250 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await gm(page, `level ${lv}`, 1800);
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
  usage: '[--daos kiem,ho,dan] [--realms kd,na,hn,ab] [--fxq high] [--video] [--perf] [--others N] [--only stills|phantom]',
  async run(r) {
    const daos = list('--daos', 'kiem,ho,dan');
    const realms = list('--realms', 'kd,na,hn,ab');
    const only = opt('--only', 'all');
    const vw = 1920;
    const vh = 1080;
    const quality = opt('--quality', 'high');
    const fxq = opt('--fxq', 'high');
    const query = { fxq, ...(flag('--off') ? { aura: 0 } : {}) };

    if (flag('--perf')) {
      await perf(r, daos, num('--others', 4), quality, fxq);
      return;
    }

    for (const dao of daos) {
      const d = DAO[dao];
      const { ctx, page } = await r.open({ name: `Au${dao}`, viewport: [vw, vh], dpr: 1, quality, query, hide: 'hud', warnings: /models/ });
      await gm(page, 'god on', 800);
      for (const rk of realms) {
        const re = REALMS[rk];
        await setup(page, dao, re.lv);
        if (only !== 'phantom') {
          for (const [vn, yaw, pitch] of VIEWS) {
            await cam(page, { yaw, pitch, dist: 4.4 });
            await sleep(2600);
            await shotBoth(page, r.out, `${d.label}-${re.label}-${vn}`, vw, vh);
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

/** Video ngắn mỗi đạo ở Ảnh Biến (đủ mọi lớp): đứng yên, chạy, ra chiêu lớn. */
async function videos(r: Parameters<Scenario['run']>[0], daos: string[], quality: string, fxq: string): Promise<void> {
  const dir = path.join(r.out, '_video');
  fs.mkdirSync(dir, { recursive: true });
  for (const dao of daos) {
    const d = DAO[dao];
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
    await setup(page, dao, 32);
    await gm(page, 'spawn mon_soi_xam 1', 1500);
    await cam(page, { yaw: Math.PI + 0.5, pitch: 0.14, dist: 6.4 });
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
    if (vids[0]) fs.renameSync(path.join(dir, vids[0].f), path.join(r.out, `video-${d.label}-anhbien.webm`));
  }
}

/** Đo trước/sau: tắt/bật hào quang trong cùng phiên, mình ở Ảnh Biến + N người khác (mỗi người một phiên) đứng quanh. */
async function perf(r: Parameters<Scenario['run']>[0], daos: string[], others: number, quality: string, fxq: string): Promise<void> {
  const { ctx, page } = await r.open({
    name: 'Aperf',
    viewport: [1280, 720],
    dpr: 1,
    quality,
    query: { fxq },
    hide: 'hud',
    warnings: /models/,
  });
  await setup(page, daos[0], 32);
  const extra: { close(): Promise<void> }[] = [];
  const keys = Object.keys(DAO);
  for (let i = 0; i < others; i++) {
    const dao = keys[i % keys.length];
    const o = await r.open({ name: `Ao${i}`, viewport: [640, 360], dpr: 1, quality: 'low', hide: 'hud', warnings: /models/ });
    await setup(o.page, dao, [20, 24, 28, 32][i % 4]);
    await gm(o.page, `tp ${2046 + (i % 3) * 2.2} ${2092 + Math.floor(i / 3) * 2.4}`, 800);
    extra.push(o.ctx);
  }
  await gm(page, 'tp 2048 2090', 1500);
  await cam(page, { yaw: Math.PI + 0.5, pitch: 0.2, dist: 9 });
  await sleep(2500);
  const rows: Record<string, unknown>[] = [];
  for (const on of [false, true, false, true]) {
    await page.evaluate(`window.__game.setRealmAura(${on})`);
    await sleep(1500);
    const p = await perfSample(page);
    rows.push({ aura: on, ...p, stats: await stat(page) });
  }
  console.log('[shots:realmaura] perf', JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(r.out, 'perf.json'), JSON.stringify({ others, quality, fxq, rows }, null, 2));
  for (const c of extra) await c.close();
  await ctx.close();
}
