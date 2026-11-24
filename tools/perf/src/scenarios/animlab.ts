// Phòng thử animation "Thân Pháp" (TP-0): với mỗi pose chiêu chụp bốn khung khóa (dồn lực, đỉnh đòn, +30 ms, thu đòn) ở camera chéo và camera cận,
// 720p + 1080p, dừng thời gian bằng `window.__animlab` để khung đúng từng mili giây; đo CPU xương (mục `anim` của FrameBudget) lúc đứng yên và lúc chạy;
// tùy chọn đặt ảnh tham chiếu cạnh khung đỉnh đòn, và quay clip thời gian thật (đứng, chạy, từng chiêu) để so trước/sau (`--thanphap 0|1`).
// Dùng: pnpm shots animlab --out <thư mục tuyệt đối> [--pose kiem_khi_tram,phi_kiem,thien_kiem_vu] [--cams iso,close] [--sizes 720p,1080p] [--thanphap 1]
//        [--ref <ảnh>] [--clip 1] [--cpu 1] [--gender m|f] [--times 0.1,0.2,...] [--clip-size 720p|1080p] [--cutin <id chiêu> [--cutin-at 0.12,0.3,...]]
import path from 'node:path';
import sharp from 'sharp';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];
const STEP_MS = 10;
/** Số khung chờ (không tiến thời gian) trước khi chụp: ảnh trình duyệt trễ vài khung so với trạng thái xương. */
const SETTLE_FRAMES = Number(process.env.ANIMLAB_SETTLE ?? 4);
const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function advance(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= STEP_MS) {
    await page.evaluate((x) => window.__animlab!.step(x), Math.min(STEP_MS, left));
    await frame(page);
  }
}

/** CPU mỗi hệ (ms) qua `secs` giây thời gian thật; `hold` là phím giữ trong lúc đo (chạy). */
async function cpuRun(page: Page, secs: number, hold?: string): Promise<Record<string, { avg: number; max: number }>> {
  await page.evaluate(() => window.__animlab!.cpu());
  if (hold) await page.keyboard.down(hold);
  await sleep(secs * 1000);
  if (hold) await page.keyboard.up(hold);
  const rows = await page.evaluate(() => window.__animlab!.cpu());
  return Object.fromEntries(rows.map((x) => [x.section, { avg: Number(x.avg.toFixed(3)), max: Number(x.max.toFixed(3)) }]));
}

async function run(r: Run, poses: string[], cams: string[], sizes: string[]): Promise<Record<string, unknown>> {
  const clip = opt('--clip', '');
  const { ctx, page } = await r.open({
    name: 'AL',
    viewport: clip ? (UI_SIZES[opt('--clip-size', '720p')] ?? [1280, 720]) : [1920, 1080],
    seenIntro: true,
    look: { g: opt('--gender', 'm') },
    extra: opt('--query', ''),
    query: { realm: 'nk12', god: 1, chr: 'v3', animlab: 1, quiet: 1, thanphap: opt('--thanphap', '0') === '1' ? 1 : undefined },
    ...(clip ? { video: path.join(r.out, 'clip') } : {}),
    hide: opt('--cutin', '') ? undefined : 'hud',
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await page.waitForFunction(() => !!window.__game && !!window.__animlab, undefined, { timeout: 120_000 });
  await sleep(2500);
  await gm(page, 'level 32', 1500);
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  await gm(page, 'cd', 1300);
  const out: Record<string, unknown> = { thanphap: opt('--thanphap', '0') === '1', poses: {} };
  const cut = opt('--cutin', '');
  if (cut) {
    // Cut-in chiêu cuối (T7): thời gian thật (có khựng), chụp ở các mốc sau khi phát.
    const marks = list('--cutin-at', '0.1,0.25,0.45,0.7').map(Number);
    await page.evaluate(() => window.__animlab!.cam('iso'));
    await sleep(500);
    const ok = await page.evaluate((s) => window.__animlab!.cutin(s), cut);
    if (!ok) throw new Error(`chiêu ${cut} chưa có tranh cut-in`);
    let t = 0;
    for (const m of marks) {
      await sleep(Math.max(0, (m - t) * 1000));
      t = m;
      // Ghim mọi animation CSS (thẻ cut-in) đúng mốc `m`: chụp ảnh chậm hơn 0,3 s nên không thể dựa vào đồng hồ thật.
      await page.evaluate((ms) => document.getAnimations().forEach((a) => ((a.currentTime = ms), a.pause())), m * 1000);
      await snap(page, r.out, `cutin-${cut}-${Math.round(m * 1000)}ms.jpg`, { wait: 0 });
    }
    await ctx.close();
    return { ...out, cutin: cut };
  }
  if (opt('--cpu', '') || clip) {
    out.cpu = {
      idle: await cpuRun(page, 5),
      run: await cpuRun(page, 5, 'w'),
    };
  }
  if (clip) {
    await sleep(800);
    for (const cam of cams) {
      await page.evaluate((c) => window.__animlab!.cam(c as never), cam);
      await sleep(1500);
      await page.keyboard.down('d');
      await sleep(1800);
      await page.keyboard.up('d');
      await page.keyboard.down('w');
      await sleep(2500);
      await page.keyboard.up('w');
      await sleep(1200);
      for (const p of poses) {
        for (let i = 0; i < 2; i++) {
          await page.evaluate((x) => window.__animlab!.perform(x), p);
          await sleep(1800);
        }
      }
    }
    await ctx.close();
    return out;
  }
  const shots = out.poses as Record<string, unknown>;
  for (const pose of poses) {
    const info = await page.evaluate((p) => window.__animlab!.poseInfo(p), pose);
    if (!info) throw new Error(`không có pose ${pose}`);
    const custom = list('--times', '').map(Number);
    const moments = custom.length
      ? custom.map((at, i) => ({ name: `t${String(i).padStart(2, '0')}_${Math.round(at * 1000)}`, at }))
      : await page.evaluate((p) => window.__animlab!.moments(p), pose);
    const rows: Record<string, unknown>[] = [];
    for (const cam of cams) {
      for (const tag of sizes) {
        const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate((c) => window.__animlab!.cam(c as never), cam);
        await page.evaluate(() => window.__animlab!.pause(true));
        await sleep(600);
        await frame(page);
        await page.evaluate((p) => window.__animlab!.perform(p), pose);
        let clock = 0;
        const files: Buffer[] = [];
        for (const m of moments) {
          const want = Math.round(m.at * 1000);
          if (want > clock) {
            await advance(page, want - clock);
            clock = want;
          }
          for (let k = 0; k < SETTLE_FRAMES; k++) await frame(page);
          files.push(await snap(page, r.out, `${pose}-${cam}-${tag}-${m.name}.jpg`, { wait: 0 }));
          const ck = await page.evaluate(() => window.__animlab!.clock());
          rows.push({ cam, size: tag, moment: m.name, ms: want, poseT: ck ? Number(ck.t.toFixed(3)) : null, dbg: await page.evaluate(() => { const m = (window.__game as any).ents.players.get((window.__game as any).sid).model; const u = m.perf?.upper; const hb = m.rig?.getObjectByName('hand_r'); const w = hb ? hb.getWorldPosition(new (hb.position.constructor as any)()) : null; return { upT: u ? +u.time.toFixed(3) : null, upW: u ? +u.getEffectiveWeight().toFixed(2) : null, hand: w ? [w.x, w.y, w.z].map((v: number) => +v.toFixed(2)) : null, root: m.root.position.y }; }) });
        }
        const cw = 480;
        const ch = Math.round((cw * h) / w);
        // Camera chéo: nhân vật nhỏ nên dải duyệt cắt 30% giữa khung (nhân vật luôn ở tâm) rồi phóng lên; ảnh gốc đầy đủ vẫn ở từng khung riêng.
        const crop = cam === 'iso' ? { left: Math.round(w * 0.35), top: Math.round(h * 0.3), width: Math.round(w * 0.3), height: Math.round(h * 0.4) } : null;
        const tiles = await Promise.all(
          files.map((f) => (crop ? sharp(f).extract(crop) : sharp(f)).resize(cw, ch, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()),
        );
        await sharp({ create: { width: cw * tiles.length, height: ch, channels: 3, background: '#111' } })
          .composite(tiles.map((input, i) => ({ input, left: i * cw, top: 0 })))
          .jpeg({ quality: 88 })
          .toFile(path.join(r.out, `${pose}-${cam}-${tag}-strip.jpg`));
        const ref = opt('--ref', '');
        if (ref) {
          const i = Math.max(
            0,
            moments.findIndex((m) => m.name === 'dinh'),
          );
          const rh = Math.round((960 * h) / w);
          const left = await sharp(ref).resize(960, rh, { fit: 'cover' }).jpeg().toBuffer();
          const right = await sharp(files[i]!).resize(960, rh).jpeg().toBuffer();
          await sharp({ create: { width: 1920, height: rh, channels: 3, background: '#111' } })
            .composite([
              { input: left, left: 0, top: 0 },
              { input: right, left: 960, top: 0 },
            ])
            .jpeg({ quality: 88 })
            .toFile(path.join(r.out, `${pose}-${cam}-${tag}-ref-vs-game.jpg`));
        }
        await page.evaluate(() => window.__animlab!.pause(false));
        await sleep(2200);
      }
    }
    shots[pose] = { info, moments, frames: rows };
  }
  await page.evaluate(() => window.__animlab!.cam('iso'));
  await ctx.close();
  return out;
}

export default {
  name: 'animlab',
  desc: 'TP-0 phòng thử animation: 4 khung khóa (dồn lực/đỉnh/+30ms/thu) ở camera chéo + cận, 720p + 1080p, CPU xương, clip trước/sau',
  usage:
    '--out <dir> [--pose kiem_khi_tram,phi_kiem,thien_kiem_vu] [--cams iso,close] [--sizes 720p,1080p] [--thanphap 1] [--ref <ảnh>] [--clip 1] [--cpu 1] [--gender m|f] [--times 0.1,0.2,...] [--clip-size 720p|1080p] [--cutin <id chiêu> [--cutin-at 0.12,0.3,...]]',
  async run(r) {
    const poses = list('--pose', 'kiem_khi_tram,phi_kiem,thien_kiem_vu');
    const cams = list('--cams', 'iso,close');
    const sizes = list('--sizes', '720p,1080p');
    const res = await run(r, poses, cams, sizes);
    writeJson(r.out, 'animlab.json', res);
    console.log('animlab:', JSON.stringify(res.cpu ?? {}), `${poses.length} pose`);
  },
} satisfies Scenario;
