// TN-9 PR3 (Lôi tu): hình các chiêu từ camera mặc định (sau lưng), HUD bật, cùng góc máy ở 1080p + 720p,
// mỗi chiêu một ảnh +30 ms sau khung trúng đòn rồi các mốc sau, để soát "không che camera/nhân vật/mục tiêu" và khoảnh khắc wow.
// Mọi chiêu bấm thật (server phán định); lệnh GM chỉ để dựng cảnh (cấp, sao, nhánh, vòng sạc, gọi quái).
// Dùng: pnpm shots loivfx --out <thư mục tuyệt đối> [--sizes 1080p,720p] [--genders m,f] [--query style=painted]
import { SKILL } from '@dtl/content';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

const METHOD = 'cuu_tieu_loi_kinh';
/** Mục tiêu chụp: một tinh anh máu dày (không chết giữa hai mốc chụp). */
const MON = 'elite_liet_cot_bao';

/** Chiêu chụp: id, nhánh cần chọn, có cần vòng sạc đầy không, các mốc chụp tính bằng ms sau lúc trúng (đầu tiên là +30 ms). */
const SKILLS: { id: string; tag: string; at: number[]; branch?: string; charge?: boolean }[] = [
  { id: 'skl_loi_an_kich', tag: 'loi-an-kich', at: [0, 30, 200] },
  { id: 'skl_phich_lich', tag: 'phich-lich', at: [0, 30, 200], branch: '16 phich_lich' },
  { id: 'skl_loi_vong', tag: 'loi-vong', at: [0, 30, 300], branch: '16 loi_vong' },
  { id: 'skl_loi_phat', tag: 'loi-phat', at: [0, 30, 300], branch: '20 loi_phat' },
  { id: 'skl_loi_hai', tag: 'loi-hai', at: [0, 30, 300], branch: '20 loi_hai' },
  { id: 'skl_cuu_tieu_thien_loi', tag: 'cuu-tieu', at: [0, 30, 350, 1100], charge: true },
];

/** `--only loi-an-kich,cuu-tieu` chỉ chụp các mục đó (lặp nhanh khi chỉnh hình); bỏ trống = tất cả. */
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
  if (!ok) console.log('[loivfx] KHÔNG tìm thấy tinh anh để chọn mục tiêu');
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
    name: `LV${g}`,
    viewport: [1920, 1080],
    seenIntro: true,
    look: { g },
    query: { realm: 'nk12', god: 1, chr: 'v3' },
    extra: opt('--query', ''),
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await sleep(2500);
  baseYaw = await page.evaluate(() => (window.__game as unknown as { camYaw: number }).camYaw);
  await gm(page, 'level 32', 1500);
  await gm(page, `method ${METHOD} 3`, 1300);
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
        await sleep(hitMs + ms - waited);
        waited = hitMs + ms;
        await snap(page, r.out, `lv-${gname}-${sk.tag}-${i + 1}-${tag}.jpg`, { wait: 0 });
      }
      log[`${sk.tag}-${tag}`] = { real };
      await sleep(1800);
    }
    await gm(page, 'spawn clear', 1400);
  }
  await ctx.close();
  return log;
}

export default {
  name: 'loivfx',
  desc: 'TN-9 Lôi tu: hình 6 chiêu từ camera mặc định, ảnh 0/+30 ms sau trúng đòn ở 720p/1080p',
  usage: '--out <dir> [--sizes 1080p,720p] [--genders m,f]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const log: Record<string, unknown> = {};
    for (const g of list('--genders', 'm,f')) {
      log[g] = await run(r, g, sizes);
      await sleep(30_000); // nghỉ giữa các bộ (tránh nhân vật ma khi reconnect)
    }
    writeJson(r.out, 'loivfx.json', log);
  },
} satisfies Scenario;
