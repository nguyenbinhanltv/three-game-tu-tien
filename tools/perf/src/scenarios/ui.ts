// Giao diện Ngọc Giản (UI-2/UI-3): HUD ở vài cảnh tiêu biểu và từng bảng lớn, ở nhiều cỡ màn hình, kèm chi phí CPU của trang.
// `--variants truoc,sau`: chỉ là nhãn tên ảnh (chạy một lần trên bản trước, một lần trên bản sau để so; HUD cũ `?ngj=0` đã gỡ ở R-4c). Dùng sau khi sửa CSS/thành phần HUD, bảng hay `--ui-scale`.
import type { Page } from 'playwright';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, tp, type Cam } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snapSizes, writeJson } from '../lib/shot';

interface HudScene {
  id: string;
  query: Record<string, string | number>;
  gm?: string[];
  /** Nhận nhiệm vụ để khung theo dõi có chữ: đứng cạnh NPC giao (`at`) rồi về điểm chụp (`home`). */
  quest?: { id: string; at: [number, number]; home: [number, number] };
  keys?: string[];
  wait?: number;
  cam?: Cam;
}
const HUD: HudScene[] = [
  { id: 'lac_kiem', query: { realm: 'nk12', at: 'tong_mon' }, quest: { id: 'q_dan_khi', at: [2048, 2034], home: [2048, 2088] } },
  {
    id: 'doan_mach',
    query: { realm: 17, at: 'dm_tram' },
    gm: ['qdone q_truc_co', 'qdone q2_thu_ha_son'],
    quest: { id: 'q2_mach_tinh', at: [1010, 1050], home: [1024, 1036] },
    wait: 4000,
  },
  {
    id: 'van_hai',
    query: { realm: 22 },
    gm: ['qdone q_truc_co', 'qdone chuong2', 'qdone q2_ket_dan', 'qdone q3_len_may', 'tele vh_tp_hub', 'tp vh_hub'],
    wait: 4000,
  },
  {
    id: 'boss',
    query: { realm: 'nk15', at: 'boss' },
    gm: ['tp 1640 2252'],
    quest: { id: 'q_dan_khi', at: [2048, 2034], home: [1640, 2252] },
    keys: ['Tab', 'Tab'],
    wait: 6000,
    cam: { dist: 14, pitch: 0.35 },
  },
  { id: 'dem', query: { realm: 'nk12', at: 'tong_mon', mood: 'night' } },
];

interface Panel {
  id: string;
  /** Phím mở bảng, hoặc `npc`: đứng cạnh NPC rồi tương tác. */
  key?: string;
  npc?: [number, number];
  /** Bấm tab thứ n của bảng trước khi chụp. */
  tab?: number;
}
const PANELS: Panel[] = [
  { id: 'nhan-vat', key: 'c' },
  { id: 'nhan-vat-thuoc-tinh', key: 'c', tab: 1 },
  { id: 'tui-do', key: 'b' },
  { id: 'cong-phap', key: 'k' },
  { id: 'nhiem-vu', key: 'l' },
  { id: 'to-doi', key: 'p' },
  { id: 'cai-dat', key: 'o' },
  { id: 'tro-giup', key: 'h' },
  { id: 'npc-hoi-thoai', npc: [2048, 2034] },
  { id: 'cua-hang', npc: [2004, 2068], tab: 1 },
  { id: 'luyen-dan', npc: [2004, 2068], tab: 2 },
  { id: 'cuong-hoa', npc: [2092, 2068], tab: 3 },
  { id: 'thang-bac', npc: [2092, 2068], tab: 8 },
];
/** Đồ để túi và ô trang bị có nội dung khi chụp bảng. */
const BAG = [
  'kit 2 kiem +5 m',
  'gold 50000',
  'give itm_hoi_xuan_dan 12',
  'give itm_linh_thao 30',
  'give itm_kiem_phach 5',
  'roll weapon 3 20',
  'roll robe 2 12',
  'roll ring 3 16',
];

/** Chi phí CPU của trang mỗi khung trong 5 giây (CDP Performance), để so HUD cũ/mới ở cùng cảnh. */
async function cpuPerFrame(page: Page): Promise<Record<string, number>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => ({
    m: Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])),
    f: await page.evaluate(() => window.__game!.frames),
  });
  const a = await read();
  await sleep(5000);
  const b = await read();
  const frames = Math.max(1, b.f - a.f);
  const per = (k: string) => +(((b.m[k] - a.m[k]) * 1000) / frames).toFixed(3);
  await cdp.detach();
  return {
    framesIn5s: frames,
    taskMs: per('TaskDuration'),
    scriptMs: per('ScriptDuration'),
    layoutMs: per('LayoutDuration'),
    styleMs: per('RecalcStyleDuration'),
  };
}

const open = (r: Run, name: string, _variant: string, query: Record<string, string | number>) =>
  r.open({ name, viewport: [1920, 1080], seenIntro: true, query: { god: 1, ...query, debug: undefined } });

async function hud(r: Run, variants: string[], sizes: string[], only: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const sc of HUD.filter((s) => !only.length || only.includes(s.id))) {
    for (const variant of variants) {
      const { ctx, page } = await open(r, `Hud${sc.id.slice(0, 3)}${variant[0]}`, variant, sc.query);
      await sleep(sc.wait ?? 2500);
      for (const c of sc.gm ?? []) await gm(page, c, 1300);
      if (sc.quest) {
        await tp(page, ...sc.quest.at);
        await sleep(2000);
        await page.evaluate((id) => window.__game!.send('q', { a: 'accept', id }), sc.quest.id);
        await tp(page, ...sc.quest.home);
        await sleep(2500);
      }
      for (const k of sc.keys ?? []) await page.keyboard.press(k, { delay: 80 });
      if (sc.cam) await cam(page, sc.cam);
      await sleep(1500);
      await snapSizes(page, r.out, `hud-${sc.id}-${variant}`, sizes);
      out[`${sc.id}-${variant}`] = {
        ...(await cpuPerFrame(page)),
        bossBar: await page.locator('.boss-bar, .u2h-tc').count(),
        tracker: await page.locator('.tracker, .u2h-quest').count(),
      };
      await ctx.close();
    }
  }
  return out;
}

async function panels(r: Run, variants: string[], sizes: string[], only: string[]): Promise<void> {
  for (const variant of variants) {
    const { ctx, page } = await open(r, `Pan${variant[0]}`, variant, { realm: 'nk12', at: 'tong_mon' });
    await sleep(2500);
    for (const c of BAG) await gm(page, c);
    for (const p of PANELS.filter((x) => !only.length || only.includes(x.id))) {
      if (p.npc) {
        await tp(page, ...p.npc);
        await sleep(2000);
        await page.evaluate(() => window.__game!.interact());
      } else await page.keyboard.press(p.key!);
      await sleep(900);
      if (p.tab !== undefined)
        await page
          .locator('.win-host [role=tab], .npc [role=tab]')
          .nth(p.tab)
          .click()
          .catch(() => undefined);
      await sleep(900);
      await snapSizes(page, r.out, `bang-${p.id}-${variant}`, sizes, 900);
      // Đóng: Escape, nút đóng của hội thoại NPC nếu còn, rồi bấm lại phím nếu bảng vẫn mở (phím là bật/tắt).
      await page.keyboard.press('Escape');
      await page
        .locator('.k-close')
        .first()
        .click({ timeout: 800 })
        .catch(() => undefined);
      if (p.key && (await page.locator('.k-window').count())) await page.keyboard.press(p.key);
      await sleep(400);
    }
    await ctx.close();
  }
}

export default {
  name: 'ui',
  desc: 'HUD ở 5 cảnh + 13 bảng lớn Ngọc Giản ở 1080p/1440p, (nhãn trước/sau) và đo CPU của trang',
  usage: '[--part hud|panels|all] [--only <id cảnh hoặc id bảng>,…] [--variants truoc,sau] [--sizes 720p,1080p,1440p,4k]',
  async run(r) {
    const part = opt('--part', 'all');
    const variants = list('--variants', 'sau');
    const sizes = list('--sizes', '1080p,1440p');
    const only = list('--only', '');
    if (part !== 'panels') writeJson(r.out, 'hud-metrics.json', await hud(r, variants, sizes, only));
    if (part !== 'hud') await panels(r, variants, sizes, only);
  },
} satisfies Scenario;
