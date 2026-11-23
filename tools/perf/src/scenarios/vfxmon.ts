// V-P9 phòng thử VFX của QUÁI/BOSS: một chiêu có vạch báo (slam/chant/sweep/line/...) của quái chụp từ lúc vạch báo hiện tới sau khi nổ, 720p + 1080p
// cùng góc camera chéo, tạm dừng thời gian trình diễn (`__vfxlab.castMon`, đi đúng đường S.HAZARD của game). Mốc âm = trước lúc nổ (vạch báo nạp), 0 = lúc nổ.
// Dùng: pnpm shots vfxmon --mon boss_han_giao --move slam,chant,sweep --out <thư mục tuyệt đối> [--sizes 720p,1080p] [--at -1200,-600,0,30,150,400]
//        [--mood night] [--concept <ảnh>] [--clip 1] [--dark 1: nền tối (mood night) thêm một lượt]
import path from 'node:path';
import sharp from 'sharp';
import { MONSTER } from '@dtl/content';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];
const STEP_MS = 10;
const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function advance(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= STEP_MS) {
    await page.evaluate((x) => window.__vfxlab!.step(x), Math.min(STEP_MS, left));
    await frame(page);
  }
}

/** Delay (giây) của chiêu `mv` trong `ai` hoặc pha đầu có chiêu đó. */
function delayOf(mon: string, mv: string): number {
  const def = MONSTER.get(mon) as
    | { ai?: Record<string, { delay?: number; cone?: { delay: number } }>; phases?: { ai?: Record<string, { delay?: number }> }[] }
    | undefined;
  const c = def?.ai?.[mv] ?? def?.phases?.map((p) => p.ai?.[mv]).find(Boolean);
  return (c?.delay ?? 1.5) * 1000;
}

async function run(r: Run, mon: string, moves: string[], sizes: string[], at: number[], mood: string): Promise<Record<string, unknown>[]> {
  if (!MONSTER.get(mon)) throw new Error(`không có quái ${mon}`);
  const { ctx, page } = await r.open({
    name: 'VM',
    viewport: [1920, 1080],
    seenIntro: true,
    look: { g: 'm' },
    extra: opt('--query', ''),
    query: { realm: 'nk12', god: 1, chr: 'v3', vfxlab: 1, quiet: 1, mood: mood || undefined },
    ...(opt('--clip', '') ? { video: path.join(r.out, 'clip') } : {}),
    hide: 'hud',
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await page.waitForFunction(() => !!window.__game && !!window.__vfxlab, undefined, { timeout: 120_000 });
  await sleep(2500);
  await gm(page, 'level 32', 1500);
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  await gm(page, `spawn ${mon} 1`, 2500);
  await gm(page, 'tp 2048 2078', 1800);
  await gm(page, 'cd', 1300);
  await sleep(600);
  const results: Record<string, unknown>[] = [];
  for (const mv of moves) {
    const hitMs = delayOf(mon, mv);
    const outDir = moves.length > 1 ? path.join(r.out, mv) : r.out;
    const out: Record<string, unknown> = { mon, mv, hitMs, shots: {} as Record<string, unknown> };
    const shots = out.shots as Record<string, unknown>;
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.__vfxlab!.pause(true));
      await sleep(500);
      await frame(page);
      await snap(page, outDir, `base-${tag}.jpg`, { wait: 0 });
      const b0 = await page.evaluate(() => window.__vfxlab!.budget());
      const ok = await page.evaluate((a) => window.__vfxlab!.castMon(a[0]!, a[1]!), [mon, mv]);
      if (!ok) throw new Error(`castMon(${mon}, ${mv}) thất bại (quái không có chiêu này hoặc chưa spawn)`);
      const files: Buffer[] = [];
      const rows: Record<string, unknown>[] = [];
      let clock = 0;
      for (const ms of at) {
        const want = hitMs + ms;
        if (want > clock) {
          await advance(page, want - clock);
          clock = want;
        }
        await frame(page);
        const buf = await snap(page, outDir, `${mv}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms.jpg`, { wait: 0 });
        files.push(buf);
        const raw = await page.evaluate(() => window.__vfxlab!.budget());
        rows.push({
          ms,
          drawCalls: Math.max(0, raw.drawCalls - b0.drawCalls),
          particles: Math.max(0, raw.particles - b0.particles),
          screenCover: raw.screenCover,
          overdraw: raw.overdraw,
        });
      }
      shots[tag] = rows;
      const cellW = 400;
      const cellH = Math.round((cellW * h) / w);
      const tiles = await Promise.all(files.map((f) => sharp(f).resize(cellW, cellH).jpeg({ quality: 85 }).toBuffer()));
      await sharp({ create: { width: cellW * tiles.length, height: cellH, channels: 3, background: '#111' } })
        .composite(tiles.map((input, i) => ({ input, left: i * cellW, top: 0 })))
        .jpeg({ quality: 88 })
        .toFile(path.join(outDir, `${mv}-${tag}-strip.jpg`));
      await page.evaluate(() => window.__vfxlab!.pause(false));
      await sleep(3500);
    }
    results.push(out);
  }
  await ctx.close();
  return results;
}

export default {
  name: 'vfxmon',
  desc: 'V-P9 phòng thử VFX quái/boss: chiêu có vạch báo (slam/chant/sweep...) từ lúc báo tới sau khi nổ, 720p + 1080p, nền sáng/tối',
  usage:
    '--mon <id quái> --move <slam,chant,sweep,...> --out <dir> [--sizes 720p,1080p] [--at -1200,-600,0,30,150,400] [--mood night] [--clip 1]',
  dry() {
    if (opt('--mon', '') && opt('--move', '')) return false;
    console.log('thiếu --mon <id quái> --move <chiêu>');
    process.exitCode = 1;
    return true;
  },
  async run(r) {
    const mon = opt('--mon', '');
    const moves = list('--move', '');
    const sizes = list('--sizes', '720p,1080p');
    const at = list('--at', '-1200,-600,0,30,150,400').map(Number);
    const runs = [{ mood: opt('--mood', ''), tag: '' }];
    for (const x of runs) {
      const res = await run(r, mon, moves, sizes, at, x.mood);
      for (const o of res) writeJson(moves.length > 1 ? path.join(r.out, o.mv as string) : r.out, `${o.mv}-vfxmon.json`, o);
    }
  },
} satisfies Scenario;
