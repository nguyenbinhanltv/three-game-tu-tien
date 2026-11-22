// Hào quang riêng của Đao tu / Cổ tu / Cấm chế sư (nợ bàn giao #473): ảnh TRƯỚC (`?pathaura=0`: hào quang cảnh giới mặc định) và SAU
// (lớp hào quang riêng của hướng) cùng góc máy, 1080p + 720p, đứng yên ở sân tông môn (lớp phụ/nền đã mở) và lúc đang chạy (lớp mờ còn 40%).
// Dùng: pnpm shots pathaura --out <thư mục tuyệt đối> [--sizes 1080p,720p] [--genders m,f] [--only dao,co,cam] [--levels 20,32]
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

const HUONG: { tag: string; method: string }[] = [
  { tag: 'dao', method: 'liet_nhan_dao_kinh' },
  { tag: 'co', method: 'duong_co_kinh' },
  { tag: 'cam', method: 'cam_che_kinh' },
];
const ONLY = list('--only', '');

async function run(r: Run, g: string, sizes: string[], levels: number[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const gname = g === 'm' ? 'nam' : 'nu';
  for (const h of HUONG.filter((x) => ONLY.length === 0 || ONLY.includes(x.tag))) {
    for (const lv of levels) {
      for (const mode of ['truoc', 'sau'] as const) {
        const { ctx, page } = await r.open({
          name: `PA${g}${h.tag}${lv}${mode}`,
          viewport: [1920, 1080],
          seenIntro: true,
          look: { g },
          query: { realm: 'nk12', god: 1, chr: 'v3', pathaura: mode === 'truoc' ? 0 : 1 },
        });
        page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
        await sleep(2500);
        const baseYaw = await page.evaluate(() => (window.__game as unknown as { camYaw: number }).camYaw);
        await gm(page, `level ${lv}`, 1500);
        await gm(page, `method ${h.method} 5`, 1300);
        await gm(page, 'tp 2048 2088', 2500);
        await gm(page, 'spawn clear', 1200);
        // Cùng góc máy ở mọi ảnh: lệch 0,9 rad so với góc mặc định để thấy cả chính diện lẫn hông.
        await page.evaluate((yaw) => {
          (window.__game as unknown as { camYaw: number }).camYaw = yaw;
        }, baseYaw + 0.9);
        // Đứng yên đủ SETTLE_SEC + thêm: lớp phụ/nền của hào quang cảnh giới đã mở, lớp hướng ở độ sáng đầy.
        await sleep(6500);
        for (const tag of sizes) {
          const [w, hh] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
          await page.setViewportSize({ width: w, height: hh });
          await snap(page, r.out, `pa-${gname}-${h.tag}-nk${lv}-${mode}-${tag}.jpg`, { wait: 700 });
        }
        log[`${h.tag}-${lv}-${mode}`] = await page.evaluate(() => {
          const gg = window.__game as unknown as { pathAura?: { stats(): object } | null; realmAura?: { stats(): object } | null };
          return { path: gg.pathAura?.stats(), realm: gg.realmAura?.stats() };
        });
        await ctx.close();
        await sleep(28_000); // nhân vật phiên trước còn đứng ở sân vài chục giây: chờ hết để không chồng hào quang lên ảnh
      }
    }
  }
  return log;
}

export default {
  name: 'pathaura',
  desc: 'Hào quang riêng Đao tu/Cổ tu/Cấm chế sư: ảnh trước (?pathaura=0) và sau cùng góc máy, 720p/1080p',
  usage: '--out <dir> [--sizes 1080p,720p] [--genders m,f] [--only dao,co,cam] [--levels 20,32]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const levels = list('--levels', '20,32').map(Number);
    const log: Record<string, unknown> = {};
    for (const g of list('--genders', 'm')) {
      log[g] = await run(r, g, sizes, levels);
      await sleep(20_000);
    }
    writeJson(r.out, 'pathaura.json', log);
  },
} satisfies Scenario;
