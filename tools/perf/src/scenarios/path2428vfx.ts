// Nợ hướng tu phần 2: hình 9 chiêu mốc 24/28 của Đao tu / Cổ tu / Cấm chế sư (mỗi hướng: 2 nhánh mốc 24 + chiêu thần thông mốc 28)
// từ camera mặc định xoay ngang, HUD bật, cùng góc máy ở 1080p + 720p; mỗi chiêu ảnh lúc trúng (0 ms), +30 ms sau trúng rồi vài mốc sau.
// Mọi chiêu bấm thật (server phán định); lệnh GM chỉ để dựng cảnh (cấp, nhánh, tài nguyên, gọi quái).
// Dùng: pnpm shots path2428vfx --out <thư mục tuyệt đối> [--sizes 1080p,720p] [--genders m,f] [--only thuan-dao,phan-co,...]
import { SKILL } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

/** Mục tiêu chụp: một tinh anh máu dày (không chết giữa các mốc chụp). */
const MON = 'elite_liet_cot_bao';

/** Chiêu chụp: công pháp, nhánh `<mốc> <id>`, tài nguyên đặt trước (`res`), mốc chụp tính bằng ms sau lúc trúng. */
const SKILLS: { id: string; tag: string; method: string; branch: string; at: number[]; res?: boolean }[] = [
  { id: 'skl_thuan_dao_tram', tag: 'thuan-dao', method: 'liet_nhan_dao_kinh', branch: '24 thuan_dao', at: [0, 30, 300] },
  { id: 'skl_huyet_chien_the', tag: 'huyet-chien', method: 'liet_nhan_dao_kinh', branch: '24 huyet_chien', at: [0, 30, 700, 2500] },
  { id: 'skl_doan_thien_dao', tag: 'doan-thien', method: 'liet_nhan_dao_kinh', branch: '28 cuong_dao', at: [0, 30, 400, 900], res: true },
  { id: 'skl_phan_co_thuat', tag: 'phan-co', method: 'duong_co_kinh', branch: '24 phan_co', at: [0, 30, 300] },
  { id: 'skl_kim_thien_co', tag: 'kim-thien', method: 'duong_co_kinh', branch: '24 kim_thien', at: [0, 30, 700, 2500] },
  { id: 'skl_van_co_phe_the', tag: 'van-co', method: 'duong_co_kinh', branch: '28 bach_co', at: [0, 30, 400, 900], res: true },
  { id: 'skl_dia_sat_tran', tag: 'dia-sat', method: 'cam_che_kinh', branch: '24 dia_sat', at: [0, 30, 700, 2500] },
  { id: 'skl_thai_hu_ho_tran', tag: 'thai-hu', method: 'cam_che_kinh', branch: '24 thai_hu', at: [0, 30, 700, 2500] },
  { id: 'skl_lac_thu_dai_tran', tag: 'lac-thu', method: 'cam_che_kinh', branch: '28 cuu_cung', at: [0, 30, 700, 2500], res: true },
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
  if (!ok) console.log('[path2428vfx] KHÔNG tìm thấy tinh anh để chọn mục tiêu');
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
    name: `P2${g}`,
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
  let method = '';
  // Sân trống của tông môn (không cây che); quái cách người ~7 m, camera xoay ngang để người và quái đứng cạnh nhau.
  await gm(page, 'tp 2048 2088', 2500);
  for (const tag of tags) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    for (const sk of SKILLS.filter((x) => ONLY.length === 0 || ONLY.includes(x.tag))) {
      if (method !== sk.method) {
        method = sk.method;
        await gm(page, `method ${method} 5`, 1300);
      }
      await gm(page, `branch ${sk.branch}`, 1400);
      await target(page);
      if (sk.res) await gm(page, 'res', 1000);
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
        await snap(page, r.out, `p2-${gname}-${sk.tag}-${i + 1}-${tag}.jpg`, { wait: 0 });
      }
      log[`${sk.tag}-${tag}`] = { real };
      await sleep(1800);
    }
  }
  await ctx.close();
  return log;
}

export default {
  name: 'path2428vfx',
  desc: 'Đao/Cổ/Cấm chế: hình 9 chiêu mốc 24/28 từ camera mặc định, ảnh 0 ms và +30 ms sau trúng đòn ở 720p/1080p',
  usage: '--out <dir> [--sizes 1080p,720p] [--genders m,f] [--only <tag,...>]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const log: Record<string, unknown> = {};
    for (const g of list('--genders', 'm,f')) {
      log[g] = await run(r, g, sizes);
      await sleep(30_000); // nghỉ giữa các bộ (tránh nhân vật ma khi reconnect)
    }
    writeJson(r.out, 'path2428vfx.json', log);
  },
} satisfies Scenario;
