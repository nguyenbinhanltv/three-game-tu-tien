// Phòng thử VFX (V-P0): chụp một chiêu ở 0 / +30 / +150 / +400 ms sau khung trúng đòn, 720p + 1080p cùng góc camera chéo, dừng thời gian
// bằng `window.__vfxlab` để các khung đúng từng mili giây; đo ngân sách (draw call, hạt, phủ màn hình, overdraw), so với thẻ chiêu
// (`packages/content/data/vfx/cards/<id>.json`) và (tùy chọn) đặt ảnh concept cạnh khung +30 ms.
// Dùng: pnpm shots vfxlab --skill <id> --out <thư mục tuyệt đối> [--dummies 1..5] [--mon <id quái>] [--concept <ảnh>] [--sizes 720p,1080p] [--at 0,30,150,400] [--clean] [--nomon] [--reload] [--maskcmp] [--fxcover]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];

const DEFAULT_MON = 'elite_liet_cot_bao';
/** Bước thời gian mỗi khung khi tua (ms): nhỏ để mốc +30 ms rơi đúng. */
const STEP_MS = 10;

/** Mốc 0 (giây sau lúc phát) của các cảnh thử độ kiếp; GIỮ KHỚP `LAB_SCENES` ở client (tools/perf không import mã client). */
const LAB_DELAY: Record<string, number> = {
  lab_loi: 1.25,
  lab_loi_hot: 1.25,
  lab_loi_big: 3,
  lab_kiep_van: 0,
  lab_fly_on_other: 0,
  lab_fly_off_other: 0,
};

interface CardBudget {
  budget: { drawCalls: number; particles: number; screenCover: number; overdraw: number };
  scene?: { impactAt: number };
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

/**
 * Đo trên ảnh (chuẩn Họa Pháp Lô 2): trong các điểm đổi so với nền, `darkShare` = tỉ lệ điểm TỐI hơn nền rõ rệt (lõi tối/ink: đọc được trên nền sáng),
 * `redShare` = tỉ lệ điểm đỏ/cam bão hòa (dành cho cảnh báo của địch). Chỉ tính điểm đổi; ảnh nhân vật/quái đổi tư thế cũng lẫn vào (cận trên).
 */
async function inkMetrics(base: Buffer, shot: Buffer): Promise<{ darkShare: number; redShare: number }> {
  const a = await sharp(base).removeAlpha().resize(480).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(shot).removeAlpha().resize(480).raw().toBuffer();
  const n = a.info.width * a.info.height;
  let diff = 0;
  let dark = 0;
  let red = 0;
  for (let i = 0; i < n; i++) {
    const [r0, g0, b0] = [a.data[i * 3]!, a.data[i * 3 + 1]!, a.data[i * 3 + 2]!];
    const [r1, g1, b1] = [b[i * 3]!, b[i * 3 + 1]!, b[i * 3 + 2]!];
    if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) <= 45) continue;
    diff++;
    if (0.299 * r1 + 0.587 * g1 + 0.114 * b1 < 0.299 * r0 + 0.587 * g0 + 0.114 * b0 - 40) dark++;
    const mx = Math.max(r1, g1, b1);
    const mn = Math.min(r1, g1, b1);
    if (mx > 120 && (mx - mn) / mx > 0.55 && r1 === mx && g1 < r1 * 0.75) red++;
  }
  return { darkShare: diff ? dark / diff : 0, redShare: diff ? red / diff : 0 };
}

async function run(r: Run, skills: string[], sizes: string[], at: number[]): Promise<Record<string, unknown>[]> {
  // Timeline cảnh `fx_*` (đột phá, độ kiếp, ngự kiếm: V-P10) không phải chiêu nhưng phát được qua `__vfxlab.cast`.
  // Cảnh thử `lab_*` (thiên lôi, kiếp vân của độ kiếp): đường vẽ theo tin server, khai ở `LAB_SCENES` (apps/client/src/game/debug/vfxLab.ts).
  for (const sk of skills)
    if (!SKILL.get(sk) && !(sk.startsWith('fx_') && FX_TIMELINE.has(sk)) && !(sk in LAB_DELAY)) throw new Error(`không có chiêu ${sk}`);
  const mon = opt('--mon', DEFAULT_MON);
  const dummies = Math.min(5, Math.max(1, num('--dummies', 1)));
  const { ctx, page } = await r.open({
    name: 'VL',
    viewport: [1920, 1080],
    seenIntro: true,
    look: { g: 'm' },
    extra: opt('--query', ''),
    query: { realm: 'nk12', god: 1, chr: 'v3', vfxlab: 1, quiet: 1, mood: opt('--mood', '') || undefined },
    // `--clean`: đo phủ CHỈ của hình chiêu: tắt chớp/vignette/khung impact (`dtl.fxStatic`), rung/zoom/chậm camera (`dtl.camShakePct`=0) và khựng hình để pixelCover không dính hiệu ứng màn hình.
    ...(process.argv.includes('--clean') ? { store: { 'dtl.fxStatic': '1', 'dtl.camShakePct': '0', 'dtl.hitStop': '0' } } : {}),
    ...(opt('--clip', '') ? { video: path.join(r.out, 'clip') } : {}),
    hide: 'hud',
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  // Chờ vào game xong (tải client chậm thì 2,5 s không đủ): __game và __vfxlab đều đã gắn.
  await page.waitForFunction(() => !!window.__game && !!window.__vfxlab, undefined, { timeout: 120_000 });
  await sleep(2500);
  await gm(page, 'level 32', 1500);
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  // `--nomon`: phòng trống (không quái, không thanh máu/bảng tên quái) để ảnh duyệt cảnh tiến cấp/di chuyển không bị vật chắn.
  const noMon = process.argv.includes('--nomon');
  if (!noMon) await gm(page, `spawn ${mon} ${dummies}`, 1800);
  await gm(page, 'tp 2048 2088', 1800);
  await gm(page, 'cd', 1300);
  await page.evaluate(
    (m) => {
      const g = window.__game as unknown as {
        view: { monsters: Map<string, { t: string; st: number }> };
        setTarget?: (id: string, kind: string) => void;
      };
      const e = [...g.view.monsters.entries()].find(([, v]) => v.t === m && v.st !== 3);
      if (e) g.setTarget?.(e[0], 'mon');
    },
    noMon ? '' : mon,
  );
  // `--clean`: bỏ vạch báo/FX do server gửi (tinh anh hình nộm vẫn đánh: vòng báo ĐỎ của kẻ địch có thể rơi vào khung chụp chiêu người chơi và làm sai số/ảnh).
  if (process.argv.includes('--clean')) await page.evaluate(() => window.__vfxlab!.monLab(true));
  await sleep(600);
  if (opt('--clip', '')) {
    // Clip thời gian thật (không tạm dừng): mỗi chiêu ra hai lần, cách nhau 3 s; video webm nằm ở <out>/clip.
    await page.setViewportSize({ width: 1280, height: 720 });
    await sleep(800);
    for (const skill of skills) {
      for (let i = 0; i < 2; i++) {
        await page.evaluate((sk) => window.__vfxlab!.cast(sk), skill);
        await sleep(3000);
      }
    }
    await ctx.close();
    return skills.map((skill) => ({ skill, clip: true }));
  }
  const results: Record<string, unknown>[] = [];
  for (const skill of skills) {
    const outDir = skills.length > 1 ? path.join(r.out, skill) : r.out;
    const def = SKILL.get(skill);
    const card = (() => {
      const f = path.resolve(import.meta.dirname, '../../../../packages/content/data/vfx/cards', `${skill}.json`);
      return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CardBudget) : null;
    })();
    // Cảnh `fx_*`: mốc "trúng" là mốc nhấn của thẻ cảnh (giây sau lúc kích), chưa có thẻ thì 0.
    const hitMs = Math.round((def ? (def.hitAt?.[0] ?? 0.3) : (LAB_DELAY[skill] ?? card?.scene?.impactAt ?? 0)) * 1000);
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
      const base = await snap(page, outDir, `base-${tag}.jpg`, { wait: 0 });
      // Số đo nền (hạt môi trường, draw call cảnh) trừ khỏi số đo lúc ra chiêu để chỉ còn phần của chiêu.
      const b0 = await page.evaluate(() => window.__vfxlab!.budget());
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
        const buf = await snap(page, outDir, `${skill}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms.jpg`, { wait: 0 });
        files.push(buf);
        if (process.argv.includes('--maskcmp')) {
          // cùng khung tạm dừng, tắt mặt nạ VFX của Họa Cảnh (chỉ còn ngưỡng HDR) rồi chụp lại: so có/không mặt nạ cùng pha
          await page.evaluate(() => (window as unknown as { __vfxMask?: (on: boolean) => void }).__vfxMask?.(false));
          await frame(page);
          await snap(page, outDir, `${skill}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms-nomask.jpg`, { wait: 0 });
          await page.evaluate(() => (window as unknown as { __vfxMask?: (on: boolean) => void }).__vfxMask?.(true));
          await frame(page);
        }
        const raw = await page.evaluate(() => window.__vfxlab!.budget());
        const b = { ...raw, particles: Math.max(0, raw.particles - b0.particles), drawCalls: Math.max(0, raw.drawCalls - b0.drawCalls) };
        let cover = await coverage(base, buf);
        let fxCover: number | undefined;
        if (process.argv.includes('--fxcover')) {
          // Độ phủ CHỈ của hiệu ứng: cùng khung tạm dừng, ẩn nhóm VFX (`eng.vfx.group`) rồi chụp lại; chênh giữa hai ảnh = phần VFX, không lẫn đổi tư thế nhân vật/hình nộm.
          const setVis = (on: boolean) =>
            page.evaluate((v) => ((window.__game as unknown as { vfx: { group: { visible: boolean } } }).vfx.group.visible = v), on);
          await setVis(false);
          await frame(page);
          const bare = await snap(page, outDir, `${skill}-${tag}-${ms >= 0 ? '+' : ''}${ms}ms-novfx.jpg`, { wait: 0 });
          await setVis(true);
          await frame(page);
          fxCover = await coverage(bare, buf);
          cover = fxCover;
        }
        const ink = await inkMetrics(base, buf);
        rows.push({
          ms,
          ...b,
          pixelCover: Number(cover.toFixed(3)),
          ...(fxCover !== undefined ? { fxCover: Number(fxCover.toFixed(3)) } : {}),
          darkShare: Number(ink.darkShare.toFixed(3)),
          redShare: Number(ink.redShare.toFixed(3)),
        });
      }
      shots[tag] = rows;
      // Dải 4 khung cạnh nhau (thu nhỏ) để duyệt nhanh.
      const cellW = 480;
      const cellH = Math.round((cellW * h) / w);
      const tiles = await Promise.all(files.map((f) => sharp(f).resize(cellW, cellH).jpeg({ quality: 85 }).toBuffer()));
      await sharp({ create: { width: cellW * tiles.length, height: cellH, channels: 3, background: '#111' } })
        .composite(tiles.map((input, i) => ({ input, left: i * cellW, top: 0 })))
        .jpeg({ quality: 88 })
        .toFile(path.join(outDir, `${skill}-${tag}-strip.jpg`));
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
          .toFile(path.join(outDir, `${skill}-${tag}-concept-vs-game.jpg`));
      }
      await page.evaluate(() => {
        window.__vfxlab!.pause(false);
      });
      await sleep(2500);
    }
    // `--reload`: xác nhận vòng NẠP LẠI atlas sprite theo hướng tu: giải phóng mọi nhóm, phát lại chiêu, chờ nạp xong rồi chụp +30 ms (`<chiêu>-reload-+30ms.jpg`) để so với ảnh trước khi giải phóng.
    if (process.argv.includes('--reload')) {
      const tag = sizes[0]!;
      const evicted = await page.evaluate(() => window.__vfxlab!.evictSprites());
      await sleep(400);
      await page.evaluate(() => {
        window.__vfxlab!.pause(true);
      });
      await page.evaluate((s) => window.__vfxlab!.cast(s), skill);
      await sleep(2500); // chờ ảnh atlas nạp lại (bất đồng bộ, không phụ thuộc đồng hồ trình diễn)
      await advance(page, hitMs + 30);
      await frame(page);
      await snap(page, outDir, `${skill}-reload-+30ms.jpg`, { wait: 0 });
      const resident = await page.evaluate(() => window.__vfxlab!.residentSprites());
      (out as Record<string, unknown>).reload = { tag, evicted, resident };
      await page.evaluate(() => {
        window.__vfxlab!.pause(false);
      });
      await sleep(2500);
    }
    // Đối chiếu ngân sách thẻ chiêu: lấy số lớn nhất qua các khung.
    const worst = { drawCalls: 0, particles: 0, screenCover: 0, overdraw: 0, pixelCover: 0, redShare: 0, darkShare: 1 };
    for (const rows of Object.values(shots) as Record<string, number>[][]) {
      for (const x of rows) {
        worst.drawCalls = Math.max(worst.drawCalls, x.drawCalls ?? 0);
        worst.particles = Math.max(worst.particles, x.particles ?? 0);
        worst.screenCover = Math.max(worst.screenCover, x.screenCover ?? 0);
        worst.overdraw = Math.max(worst.overdraw, x.overdraw ?? 0);
        worst.pixelCover = Math.max(worst.pixelCover, x.pixelCover ?? 0);
        worst.redShare = Math.max(worst.redShare, x.redShare ?? 0);
        // chỉ khung có hiệu ứng đáng kể mới tính độ tối (khung trống không có lõi tối là bình thường)
        if ((x.pixelCover ?? 0) > 0.02) worst.darkShare = Math.min(worst.darkShare, x.darkShare ?? 0);
      }
    }
    out.worst = worst;
    // Chuẩn 2: nền sáng cần lõi tối (≥ 12% điểm đổi tối hơn nền) — chỉ đo ban ngày (không `--mood`); đỏ/cam ≤ 3% điểm đổi.
    const stdWarn = [
      !opt('--mood', '') && worst.darkShare < 0.12 && `thiếu lõi tối trên nền sáng (darkShare ${worst.darkShare.toFixed(2)} < 0,12)`,
      worst.redShare > 0.03 && `đỏ/cam ${(worst.redShare * 100).toFixed(1)}% > 3%`,
    ].filter(Boolean);
    out.standard2 = stdWarn;
    if (card) {
      const b = card.budget;
      out.overBudget = [
        worst.particles > b.particles && `hạt ${worst.particles} > ${b.particles}`,
        worst.screenCover > b.screenCover && `phủ ước lượng ${worst.screenCover.toFixed(2)} > ${b.screenCover}`,
        worst.overdraw > b.overdraw && `overdraw ${worst.overdraw} > ${b.overdraw}`,
        ...stdWarn,
      ].filter(Boolean);
    }
    results.push(out);
  }
  await ctx.close();
  return results;
}

export default {
  name: 'vfxlab',
  desc: 'V-P0 phòng thử VFX: một chiêu ở 0/+30/+150/+400 ms sau trúng đòn, 720p + 1080p, đồng hồ ngân sách, concept cạnh game',
  usage:
    '--skill <id[,id...]> --out <dir> [--mood night] [--clip 1] [--dummies 1..5] [--mon <id>] [--concept <ảnh>] [--sizes 720p,1080p] [--at 0,30,150,400]',
  dry() {
    if (opt('--skill', '')) return false;
    console.log('thiếu --skill <id chiêu>');
    process.exitCode = 1;
    return true;
  },
  async run(r) {
    const skills = list('--skill', '');
    const sizes = list('--sizes', '720p,1080p');
    const at = list('--at', '0,30,150,400').map(Number);
    const results = await run(r, skills, sizes, at);
    for (const res of results) {
      if (res.clip) continue;
      const sk = res.skill as string;
      writeJson(skills.length > 1 ? path.join(r.out, sk) : r.out, `${sk}-vfxlab.json`, res);
      console.log(
        sk,
        'ngân sách (xấu nhất):',
        JSON.stringify(res.worst),
        res.overBudget ? `vượt: ${(res.overBudget as string[]).join('; ') || 'không'}` : '',
      );
    }
  },
} satisfies Scenario;
