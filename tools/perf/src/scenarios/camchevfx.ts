// TN-8 PR3 (Cấm chế sư): hình 6 chiêu (Phong Cấm, Mẫu Đơn Thập Bát Cấm, Phá Diệt Cấm, Tuế Nguyệt Cấm, Sinh Tử Cấm, Phiên Thiên Ấn) từ camera
// mặc định xoay ngang, HUD bật, cùng góc máy ở 1080p + 720p; mỗi chiêu ảnh lúc trúng (0 ms), +30 ms sau trúng rồi một mốc sau (trận đứng).
// Mọi chiêu bấm thật (server phán định); lệnh GM chỉ để dựng cảnh (cấp, nhánh, vòng sạc, gọi quái).
// Dùng: pnpm shots camchevfx --out <thư mục tuyệt đối> [--sizes 1080p,720p] [--genders m,f] [--only phong-cam,mau-don]
import { SKILL } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

const METHOD = 'cam_che_kinh';
/** Mục tiêu chụp: một tinh anh máu dày (không chết giữa các mốc chụp). */
const MON = 'elite_liet_cot_bao';

/** Chiêu chụp: id, nhánh cần chọn, có cần vòng sạc đầy không, các mốc chụp tính bằng ms sau lúc trúng (0 = đúng khung trúng, rồi +30 ms). */
const SKILLS: { id: string; tag: string; at: number[]; branch?: string; charge?: boolean }[] = [
  { id: 'skl_phong_cam', tag: 'phong-cam', at: [0, 30, 300] },
  { id: 'skl_mau_don_cam', tag: 'mau-don', at: [0, 30, 700, 2500], charge: true },
  { id: 'skl_pha_diet_cam', tag: 'pha-diet', at: [0, 30, 300], branch: '16 pha_diet' },
  { id: 'skl_tue_nguyet_cam', tag: 'tue-nguyet', at: [0, 30, 700, 2500], branch: '16 tue_nguyet' },
  { id: 'skl_sinh_tu_cam', tag: 'sinh-tu', at: [0, 30, 700, 2500], branch: '20 sinh_tu' },
  { id: 'skl_phien_thien_an', tag: 'phien-thien', at: [0, 30, 400], branch: '20 phien_thien' },
];

/** `--only phong-cam,mau-don` chỉ chụp các mục đó (lặp nhanh khi chỉnh hình); bỏ trống = tất cả. */
const ONLY = list('--only', '');

type Page = Awaited<ReturnType<Run['open']>>['page'];

/** Góc camera mặc định lúc vào game (đọc một lần ở `run`). */
let baseYaw = 0;

async function target(page: Page): Promise<void> {
  // Tọa độ cố định cho mọi chiêu (sân lát đá phía nam bệ kiếm): quái gọi ở chỗ người chơi, người chơi lùi ra 7 m về phía bắc.
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  await gm(page, `spawn ${MON} 1`, 1800);
  await gm(page, 'tp 2048 2088', 1800);
  await gm(page, 'cd', 1300);
  const ok = await page.evaluate((mon) => {
    const g = window.__game as unknown as {
      view: { monsters: Map<string, { t: string; st: number }> };
      setTarget?: (id: string, kind: string) => void;
    };
    const e = [...g.view.monsters.entries()].find(([, m]) => m.t === mon && m.st !== 3);
    if (e) g.setTarget?.(e[0], 'mon');
    return !!e;
  }, MON);
  if (!ok) console.log('[camchevfx] KHÔNG tìm thấy tinh anh để chọn mục tiêu');
  // Góc camera tuyệt đối (cùng góc ở 720p và 1080p, mọi chiêu): xoay ngang so với góc mặc định lúc vào game.
  await page.evaluate((yaw) => {
    (window.__game as unknown as { camYaw: number }).camYaw = yaw;
  }, baseYaw + 1.25);
  await sleep(400);
}

async function run(r: Run, g: string, tags: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const gname = g === 'm' ? 'nam' : 'nu';
  const { ctx, page } = await r.open({
    name: `KV${g}`,
    viewport: [1920, 1080],
    seenIntro: true,
    look: { g },
    query: { realm: 'nk12', god: 1, chr: 'v3' },
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await sleep(2500);
  baseYaw = await page.evaluate(() => (window.__game as unknown as { camYaw: number }).camYaw);
  await gm(page, 'level 32', 1500);
  await gm(page, `method ${METHOD} 5`, 1300);
  // Sân trống của tông môn (không cây che); quái cách người ~7 m, camera xoay ngang để người và quái đứng cạnh nhau.
  await gm(page, 'tp 2048 2088', 2500);
  for (const tag of tags) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    for (const sk of SKILLS.filter((x) => ONLY.length === 0 || ONLY.includes(x.tag))) {
      if (sk.branch) await gm(page, `branch ${sk.branch}`, 1400);
      await target(page);
      if (sk.charge) await gm(page, 'charge', 1300);
      const hitMs = Math.round((SKILL.get(sk.id)?.hitAt?.[0] ?? 0.3) * 1000);
      const real = await page.evaluate((id) => {
        const gg = window.__game as unknown as {
          bar(): { id: string }[];
          useSkill(i: number): void;
          sid: string;
          view: { monsters: Map<string, { x: number; z: number; st: number }> };
          fxArea: Map<string, { x: number; z: number; r: number }>;
          fxDst: Map<string, string>;
          skillFx: { handle(sid: string, e: object): void };
        };
        const slot = gg.bar().findIndex((s) => s.id === id);
        if (slot >= 0) {
          gg.useSkill(slot);
          return true;
        }
        const hit = [...gg.view.monsters.entries()].find(([, m]) => m.st !== 3);
        if (hit) {
          gg.fxArea.set(gg.sid, { x: hit[1].x, z: hit[1].z, r: 9 });
          gg.fxDst.set(gg.sid, hit[0]);
        }
        gg.skillFx.handle(gg.sid, { kind: 'windup', skill: id, combo: -1, index: 0, t: 0, kb: false });
        return false;
      }, sk.id);
      let waited = 0;
      for (const [i, ms] of sk.at.entries()) {
        await sleep(Math.max(0, hitMs + ms - waited));
        waited = hitMs + ms;
        await snap(page, r.out, `cv-${gname}-${sk.tag}-${i + 1}-${tag}.jpg`, { wait: 0 });
      }
      log[`${sk.tag}-${tag}`] = { real };
      await sleep(1800);
    }
  }
  await ctx.close();
  return log;
}

export default {
  name: 'camchevfx',
  desc: 'TN-8 Cấm chế sư: hình 6 chiêu từ camera mặc định, ảnh 0 ms và +30 ms sau trúng đòn ở 720p/1080p',
  usage: '--out <dir> [--sizes 1080p,720p] [--genders m,f] [--only <tag,...>]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const log: Record<string, unknown> = {};
    for (const g of list('--genders', 'm,f')) {
      log[g] = await run(r, g, sizes);
      await sleep(30_000); // nghỉ giữa các bộ (tránh nhân vật ma khi reconnect)
    }
    writeJson(r.out, 'camchevfx.json', log);
  },
} satisfies Scenario;
