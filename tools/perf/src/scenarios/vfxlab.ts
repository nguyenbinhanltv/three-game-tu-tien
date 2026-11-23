// Phòng thử VFX (V-P0): chụp một chiêu ở 0 / +30 / +150 / +400 ms sau khung trúng đòn, 720p + 1080p cùng góc camera chéo, dừng thời gian
// bằng `window.__vfxlab` để các khung đúng từng mili giây; đo ngân sách (draw call, hạt, phủ màn hình, overdraw), so với thẻ chiêu
// (`packages/content/data/vfx/cards/<id>.json`) và (tùy chọn) đặt ảnh concept cạnh khung +30 ms.
// Dùng: pnpm shots vfxlab --skill <id> --out <thư mục tuyệt đối> [--dummies 1..5] [--mon <id quái>] [--concept <ảnh>] [--sizes 720p,1080p] [--at 0,30,150,400]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { SKILL } from '@dtl/content';
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];

const DEFAULT_MON = 'elite_liet_cot_bao';
/** Bước thời gian mỗi khung khi tua (ms): nhỏ để mốc +30 ms rơi đúng. */
const STEP_MS = 10;

interface CardBudget {
  budget: { drawCalls: number; particles: number; screenCover: number; overdraw: number };
}

const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Tua thời gian trình diễn thêm `ms` (từng bước nhỏ, mỗi bước chờ một khung hình thật). */
async function advance(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= STEP_MS) {
    const s = Math.min(STEP_MS, left);
    await page.evaluate((x) => window.__vfxlab!.step(x), s);
    await frame(page);
  }
}

/** Tỉ lệ điểm ảnh khác nền (đã chụp trước khi ra chiêu); gồm cả thay đổi tư thế nhân vật, nên là cận trên của phần FX. */
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

async function run(r: Run, skill: string, sizes: string[], at: number[]): Promise<Record<string, unknown>> {
  const def = SKILL.get(skill);
  if (!def) throw new Error(`không có chiêu ${skill}`);
  const hitMs = Math.round((def.hitAt?.[0] ?? 0.3) * 1000);
  const card = (() => {
    const f = path.resolve(import.meta.dirname, '../../../../packages/content/data/vfx/cards', `${skill}.json`);
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CardBudget) : null;
  })();
  const mon = opt('--mon', DEFAULT_MON);
  const dummies = Math.min(5, Math.max(1, num('--dummies', 1)));
  const { ctx, page } = await r.open({
    name: 'VL',
    viewport: [1920, 1080],
    seenIntro: true,
    look: { g: 'm' },
    query: { realm: 'nk12', god: 1, chr: 'v3', vfxlab: 1, quiet: 1, mood: opt('--mood', '') || undefined },
    ...(opt('--clip', '') ? { video: path.join(r.out, 'clip') } : {}),
    hide: 'hud',
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await sleep(2500);
  await gm(page, 'level 32', 1500);
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  await gm(page, `spawn ${mon} ${dummies}`, 1800);
  await gm(page, 'tp 2048 2088', 1800);
  await gm(page, 'cd', 1300);
  await page.evaluate((m) => {
    const g = window.__game as unknown as {
      view: { monsters: Map<string, { t: string; st: number }> };
      setTarget?: (id: string, kind: string) => void;
    };
    const e = [...g.view.monsters.entries()].find(([, v]) => v.t === m && v.st !== 3);
    if (e) g.setTarget?.(e[0], 'mon');
  }, mon);
  await sleep(600);
  if (opt('--clip', '')) {
    // Clip thời gian thật (không tạm dừng): ra chiêu hai lần, cách nhau 3 s; video webm nằm ở <out>/clip.
    await page.setViewportSize({ width: 1280, height: 720 });
    await sleep(800);
    for (let i = 0; i < 2; i++) {
      await page.evaluate((s) => window.__vfxlab!.cast(s), skill);
      await sleep(3000);
    }
    await ctx.close();
    return { skill, clip: true };
  }
  const out: Record<string, unknown> = { skill, hitMs, card: card?.budget ?? null, shots: {} as Record<string, unknown> };
  const shots = out.shots as Record<string, unknown>;
  for (const tag of sizes) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => {
      window.__vfxlab!.pause(true);
    });
    await sleep(500);
    await frame(page);
    const base = await snap(page, r.out, `base-${tag}.jpg`, { wait: 0 });
    const files: Buffer[] = [];
    let clock = 0; // ms trình diễn đã trôi từ lúc ra chiêu
    await page.evaluate((s) => window.__vfxlab!.cast(s), skill);
    const rows: Record<string, unknown>[] = [];
    for (const ms of at) {
      const want = hitMs + ms;
      if (want > clock) {
        await advance(page, want - clock);
        clock = want;
      }
      await frame(page);
      const buf = await snap(page, r.out, `${skill}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms.jpg`, { wait: 0 });
      files.push(buf);
      const b = await page.evaluate(() => window.__vfxlab!.budget());
      const cover = await coverage(base, buf);
      rows.push({ ms, ...b, pixelCover: Number(cover.toFixed(3)) });
    }
    shots[tag] = rows;
    // Dải 4 khung cạnh nhau (thu nhỏ) để duyệt nhanh.
    const cellW = 480;
    const cellH = Math.round((cellW * h) / w);
    const tiles = await Promise.all(files.map((f) => sharp(f).resize(cellW, cellH).jpeg({ quality: 85 }).toBuffer()));
    await sharp({ create: { width: cellW * tiles.length, height: cellH, channels: 3, background: '#111' } })
      .composite(tiles.map((input, i) => ({ input, left: i * cellW, top: 0 })))
      .jpeg({ quality: 88 })
      .toFile(path.join(r.out, `${skill}-${tag}-strip.jpg`));
    // Concept cạnh khung +30 ms (nếu có).
    const concept = opt('--concept', '');
    if (concept) {
      const i30 = Math.max(0, at.indexOf(30));
      const left = await sharp(concept)
        .resize(960, Math.round((960 * h) / w), { fit: 'cover' })
        .jpeg()
        .toBuffer();
      const right = await sharp(files[i30]!)
        .resize(960, Math.round((960 * h) / w))
        .jpeg()
        .toBuffer();
      const ch = Math.round((960 * h) / w);
      await sharp({ create: { width: 1920, height: ch, channels: 3, background: '#111' } })
        .composite([
          { input: left, left: 0, top: 0 },
          { input: right, left: 960, top: 0 },
        ])
        .jpeg({ quality: 88 })
        .toFile(path.join(r.out, `${skill}-${tag}-concept-vs-game.jpg`));
    }
    await page.evaluate(() => {
      window.__vfxlab!.pause(false);
    });
    await sleep(2500);
  }
  // Đối chiếu ngân sách thẻ chiêu: lấy số lớn nhất qua các khung.
  const worst = { drawCalls: 0, particles: 0, screenCover: 0, overdraw: 0, pixelCover: 0 };
  for (const rows of Object.values(shots) as Record<string, number>[][]) {
    for (const x of rows) {
      worst.drawCalls = Math.max(worst.drawCalls, x.drawCalls ?? 0);
      worst.particles = Math.max(worst.particles, x.particles ?? 0);
      worst.screenCover = Math.max(worst.screenCover, x.screenCover ?? 0);
      worst.overdraw = Math.max(worst.overdraw, x.overdraw ?? 0);
      worst.pixelCover = Math.max(worst.pixelCover, x.pixelCover ?? 0);
    }
  }
  out.worst = worst;
  if (card) {
    const b = card.budget;
    out.overBudget = [
      worst.particles > b.particles && `hạt ${worst.particles} > ${b.particles}`,
      worst.screenCover > b.screenCover && `phủ ước lượng ${worst.screenCover.toFixed(2)} > ${b.screenCover}`,
      worst.overdraw > b.overdraw && `overdraw ${worst.overdraw} > ${b.overdraw}`,
    ].filter(Boolean);
  }
  await ctx.close();
  return out;
}

export default {
  name: 'vfxlab',
  desc: 'V-P0 phòng thử VFX: một chiêu ở 0/+30/+150/+400 ms sau trúng đòn, 720p + 1080p, đồng hồ ngân sách, concept cạnh game',
  usage:
    '--skill <id> --out <dir> [--mood night] [--clip 1] [--dummies 1..5] [--mon <id>] [--concept <ảnh>] [--sizes 720p,1080p] [--at 0,30,150,400]',
  dry() {
    if (opt('--skill', '')) return false;
    console.log('thiếu --skill <id chiêu>');
    process.exitCode = 1;
    return true;
  },
  async run(r) {
    const skill = opt('--skill', '');
    const sizes = list('--sizes', '720p,1080p');
    const at = list('--at', '0,30,150,400').map(Number);
    const res = await run(r, skill, sizes, at);
    writeJson(r.out, `${skill}-vfxlab.json`, res);
    console.log(
      'đồng hồ ngân sách (xấu nhất):',
      JSON.stringify(res.worst),
      res.overBudget ? `vượt: ${(res.overBudget as string[]).join('; ') || 'không'}` : '',
    );
  },
} satisfies Scenario;
