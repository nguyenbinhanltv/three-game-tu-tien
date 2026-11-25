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
    | {
        ai?: Record<string, { delay?: number; cast?: number; cone?: { delay: number } }>;
        phases?: { ai?: Record<string, { delay?: number; cast?: number }> }[];
      }
    | undefined;
  // Chui đất: `burrow` báo `hide` giây, `emerge` báo `cone.delay` giây (cùng quy ước `content:check`).
  if (mv === 'burrow' || mv === 'emerge') {
    const bu = [def?.ai, ...(def?.phases?.map((p) => p.ai) ?? [])]
      .map((x) => (x as { burrow?: { hide: number; cone: { delay: number } } } | undefined)?.burrow)
      .find(Boolean);
    if (bu) return (mv === 'burrow' ? bu.hide : bu.cone.delay) * 1000;
  }
  const c = def?.ai?.[mv] ?? def?.phases?.map((p) => p.ai?.[mv]).find(Boolean);
  return ((c?.delay ?? 1.5) + (mv === 'chant' ? (c?.cast ?? 0) : 0)) * 1000;
}

/** Tỉ lệ điểm ảnh khác nền (cùng hàm với `vfxlab`; gồm cả đổi tư thế quái/người nên là cận trên của phần FX). */
async function coverage(base: Buffer, shot: Buffer): Promise<number> {
  const a = await sharp(base).removeAlpha().resize(480).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(shot).removeAlpha().resize(480).raw().toBuffer();
  const n = a.info.width * a.info.height;
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const d =
      Math.abs(a.data[i * 3]! - b[i * 3]!) + Math.abs(a.data[i * 3 + 1]! - b[i * 3 + 1]!) + Math.abs(a.data[i * 3 + 2]! - b[i * 3 + 2]!);
    if (d > 45) diff++;
  }
  return diff / n;
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
    // `--clean`: đo phủ CHỈ của hình chiêu (tắt chớp/vignette/khung impact, rung/zoom camera, khựng hình) như `vfxlab --clean`.
    ...(process.argv.includes('--clean') ? { store: { 'dtl.fxStatic': '1', 'dtl.camShakePct': '0', 'dtl.hitStop': '0' } } : {}),
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
  await page.evaluate(() => window.__vfxlab!.monLab(true));
  await sleep(9000); // model boss nạp xong + vạch báo/FX server đang chạy dở tan hết
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
      // Tạm dừng, bỏ vòng chọn mục tiêu (đỏ, dễ lẫn với vạch báo), chụp ảnh nền và lấy ngân sách nền của CẢNH HIỆN TẠI.
      const settle = async () => {
        await page.evaluate(() => window.__vfxlab!.pause(true));
        await sleep(500);
        await page.evaluate('window.__game.clearTarget()');
        await frame(page);
        return {
          baseBuf: await snap(page, outDir, `base-${tag}.jpg`, { wait: 0 }),
          b0: await page.evaluate(() => window.__vfxlab!.budget()),
        };
      };
      let { baseBuf, b0 } = await settle();
      // `--control`: KHÔNG ra chiêu, chỉ trôi thời gian như khi đo: `pixelCover` lúc này là độ LỆCH NỀN thuần (ánh sáng/hậu kỳ/động vật nền), trừ nó khỏi số đo thật.
      const cast = () => page.evaluate((a) => window.__vfxlab!.castMon(a[0]!, a[1]!), [mon, mv]);
      let ok = process.argv.includes('--control') || (await cast());
      if (!ok) {
        // Chạy nối nhiều chiêu: boss thật có thể đã chết/dời sau chiêu trước nên `castMon` không thấy quái. Bỏ tạm dừng để cảnh dựng lại như lúc đầu (gọi quái, nạp model,
        // FX/AI ổn định), rồi tạm dừng và CHỤP LẠI nền + ngân sách nền (nền cũ không có boss/đã lệch camera làm phồng số phủ) trước khi ra chiêu lần hai.
        await page.evaluate(() => window.__vfxlab!.pause(false));
        await gm(page, 'spawn clear', 1400);
        await gm(page, `spawn ${mon} 1`, 2500);
        await gm(page, 'tp 2048 2078', 1800);
        await sleep(9000);
        await gm(page, 'cd', 1300);
        ({ baseBuf, b0 } = await settle());
        ok = await cast();
      }
      if (!ok) throw new Error(`castMon(${mon}, ${mv}) thất bại (quái không có chiêu này hoặc chưa spawn)`);
      const files: Buffer[] = [];
      const rows: Record<string, unknown>[] = [];
      let clock = 0;
      for (const ms of at) {
        // Mốc nổ được xử lý ở tick đầu sau khi tới hạn: khung "+0" lấy sau đúng một tick (16 ms) để thấy khung nổ đầu tiên.
        const want = hitMs + ms + (ms >= 0 ? 16 : 0);
        if (want > clock) {
          await advance(page, want - clock);
          clock = want;
        }
        await page.evaluate('window.__game.clearTarget()'); // cast làm hiện vòng chọn mục tiêu thù địch (đỏ), dễ lẫn với vạch báo
        await frame(page);
        const buf = await snap(page, outDir, `${mv}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms.jpg`, { wait: 0 });
        files.push(buf);
        const raw = await page.evaluate(() => window.__vfxlab!.budget());
        rows.push({
          ms,
          drawCalls: Math.max(0, raw.drawCalls - b0.drawCalls),
          particles: Math.max(0, raw.particles - b0.particles),
          screenCover: raw.screenCover,
          pixelCover: Number((await coverage(baseBuf, buf)).toFixed(3)),
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
