// Phòng thử animation "Thân Pháp" (TP-0): với mỗi pose chiêu chụp bốn khung khóa (dồn lực, đỉnh đòn, +30 ms, thu đòn) ở camera chéo và camera cận,
// 720p + 1080p, dừng thời gian bằng `window.__animlab` để khung đúng từng mili giây; đo CPU xương (mục `anim` của FrameBudget) lúc đứng yên và lúc chạy;
// tùy chọn đặt ảnh tham chiếu cạnh khung đỉnh đòn, và quay clip thời gian thật (đứng, chạy, từng chiêu) để so trước/sau (`--thanphap 0|1`).
// Dùng: pnpm shots animlab --out <thư mục tuyệt đối> [--pose kiem_khi_tram,phi_kiem,thien_kiem_vu] [--cams iso,close] [--sizes 720p,1080p] [--thanphap 1]
//        [--ref <ảnh>] [--clip 1] [--cpu 1] [--gender m|f] [--method <id công pháp>] [--times 0.1,0.2,...] [--clip-size 720p|1080p] [--fx impulse=0,loco=0,...] [--stills tp1b|tp2|tp2mon|b3|ref] [--set <bộ>] [--stills-size 720p|1080p] [--cutin <id chiêu> [--cutin-at 0.12,0.3,...]]
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
    query: { realm: 'nk12', god: 1, chr: 'v3', animlab: 1, quiet: 1, thanphap: opt('--thanphap', '1') === '1' ? 1 : 0 },
    ...(clip ? { video: path.join(r.out, 'clip') } : {}),
    hide: opt('--cutin', '') ? undefined : 'hud',
  });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await page.waitForFunction(() => !!window.__game && !!window.__animlab, undefined, { timeout: 120_000 });
  await sleep(2500);
  // `--fx impulse=0,smear=0`: tắt/bật riêng từng lớp Thân Pháp để so sánh A/B từng PR.
  const fxSet = Object.fromEntries(list('--fx', '').map((kv) => [kv.split('=')[0], kv.split('=')[1] !== '0']));
  if (Object.keys(fxSet).length) await page.evaluate((f) => window.__animlab!.fx(f), fxSet);
  await gm(page, 'level 32', 1500);
  await gm(page, 'tp 2048 2095', 1800);
  await gm(page, 'spawn clear', 1400);
  // `--method <id công pháp>`: chọn hướng tu (vd. bat_dong_kim_than = Thể tu) để chụp pose của hướng khác.
  if (opt('--method', '')) await gm(page, `method ${opt('--method', '')}`, 1500);
  await gm(page, 'cd', 1300);
  const out: Record<string, unknown> = { thanphap: opt('--thanphap', '1') === '1', poses: {} };
  const stillsMode = opt('--stills', '');
  if (stillsMode) {
    // Ảnh tĩnh PNG (không quay video: video Playwright của game WebGPU ra khung trắng). Cắt quanh nhân vật ở tâm khung, phóng ×2.
    const [svw, svh] = UI_SIZES[opt('--stills-size', '720p')] ?? [1280, 720];
    const sk = svw / 1280; // hệ số cắt ảnh theo cỡ màn hình (720p = 1)
    await page.setViewportSize({ width: svw, height: svh });
    await sleep(800);
    const shot = async (name: string, wide = false) => {
      const clip = wide ? { x: 240, y: 60, width: 800, height: 600 } : { x: 520, y: 250, width: 240, height: 220 };
      const buf = await page.screenshot({ clip, type: 'png' });
      const f = path.join(r.out, `${stillsMode}-${name}.png`);
      await sharp(buf)
        .resize(wide ? 400 : 480, wide ? 300 : 440)
        .png()
        .toFile(f);
      console.log('  ảnh', path.basename(f));
    };
    const tap = async (k: string, ms: number) => {
      await page.keyboard.down(k);
      await sleep(ms);
      await page.keyboard.up(k);
    };
    if (stillsMode === 'ref') {
      // Ảnh tham chiếu cho Codex (tranh cut-in theo bộ): nhân vật thật, cận chính diện, 1080p, nền cảnh. `--set <khóa gm outfit|none>` `--gender m|f`.
      const set = opt('--set', 'none');
      if (set !== 'none') await gm(page, `outfit ${set} ${opt('--gender', 'm')}`, 3500);
      await page.evaluate(() => window.__animlab!.cam('front'));
      await sleep(900);
      const buf = await page.screenshot({ clip: { x: 320 * sk, y: 20 * sk, width: 640 * sk, height: 690 * sk }, type: 'png' });
      await sharp(buf)
        .resize(880, 960)
        .png()
        .toFile(path.join(r.out, `ref-${opt('--set', 'none')}-${opt('--gender', 'm')}.png`));
      console.log('  ảnh ref');
      await ctx.close();
      return { ...out, stills: stillsMode };
    }
    if (stillsMode === 'b3') {
      // So model Lạc Kiếm b2 / b3 (tua + dải đai lò xo): (1) cận trước/sườn đứng yên; (2) tạm dừng rồi xoay thẳng xương `dtl_o_tassel_*` để thấy vùng lưới bám theo;
      // (3) đo biên độ xương tassel/hair khi chạy rồi dừng (lò xo có thật sự đung đưa).
      // Mặc bộ Lạc Kiếm (mặc định mới tạo là Đồ Đệ Tử `chr_v3_de_tu_*`, không dùng model Lạc Kiếm).
      await gm(page, `outfit set_lac_kiem ${opt('--gender', 'm')}`, 3500);
      const cam = async (k: string, wait = 700) => {
        await page.evaluate((x) => window.__animlab!.cam(x as never), k);
        await sleep(wait);
      };
      const snapC = async (name: string) => {
        const buf = await page.screenshot({ clip: { x: 340 * sk, y: 40 * sk, width: 600 * sk, height: 640 * sk }, type: 'png' });
        await sharp(buf)
          .resize(420, 448)
          .png()
          .toFile(path.join(r.out, `${stillsMode}-${name}.png`));
        console.log('  ảnh', `${stillsMode}-${name}.png`);
      };
      await cam('front');
      await snapC('1-truoc-dung');
      await cam('side');
      await snapC('2-suon-dung');
      const probe = () =>
        page.evaluate(() => {
          const g = window.__game as any;
          const rig = g.ents.players.get(g.sid).model.rig as any;
          const w = window as any;
          w.__rest ??= {};
          const out: Record<string, number | null> = {};
          for (const n of ['dtl_o_tassel_0_0', 'dtl_o_tassel_0_1', 'dtl_o_tassel_0_2', 'dtl_o_hair_0_0', 'dtl_o_skirt_0_0']) {
            const b = rig.getObjectByName(n);
            if (!b) {
              out[n] = null;
              continue;
            }
            w.__rest[n] ??= b.quaternion.clone();
            out[n] = Number(b.quaternion.angleTo(w.__rest[n]).toFixed(3));
          }
          return out;
        });
      await cam('iso');
      console.log(
        '  model:',
        await page.evaluate(() => {
          const g = window.__game as any;
          const m = g.ents.players.get(g.sid).model;
          return m.tpl?.handle?.id ?? '?';
        }),
        'url:',
        page.url().slice(-60),
      );
      const rest = await probe();
      await page.keyboard.down('w');
      await sleep(1500);
      await page.keyboard.up('w');
      const series: Record<string, number | null>[] = [];
      for (let k = 0; k < 8; k++) {
        series.push(await probe());
        await sleep(100);
      }
      const peak: Record<string, number> = {};
      for (const row of series) for (const [n, v] of Object.entries(row)) if (v !== null) peak[n] = Math.max(peak[n] ?? 0, v);
      console.log('  biên độ xương (rad), đỉnh sau dừng:', JSON.stringify(peak), 'nghỉ:', JSON.stringify(rest));
      // Khung thật: chạy → dừng, đặt camera cận theo người ngay khi dừng rồi chụp (lò xo còn đung đưa).
      for (const k of ['side', 'front'] as const) {
        await sleep(900);
        await page.keyboard.down('w');
        await sleep(1400);
        await page.keyboard.up('w');
        await cam(k, 0);
        await snapC(k === 'side' ? '5-dung-suon' : '6-dung-truoc');
      }
      // (2) xoay thẳng xương tassel khi tạm dừng, camera cận trước + sườn.
      await sleep(1200);
      for (const k of ['front', 'side'] as const) {
        await cam(k);
        await page.evaluate(() => window.__animlab!.pause(true));
        await sleep(300);
        await page.evaluate(() => {
          const g = window.__game as any;
          const rig = g.ents.players.get(g.sid).model.rig as any;
          for (const n of ['dtl_o_tassel_0_0', 'dtl_o_tassel_0_1']) {
            const b = rig.getObjectByName(n);
            if (b) {
              b.quaternion.premultiply(new b.quaternion.constructor().setFromEuler(new (b.rotation.constructor as any)(0.7, 0, 0.5)));
              b.updateMatrixWorld(true);
            }
          }
        });
        await frame(page);
        await snapC(k === 'front' ? '3-xoay-truoc' : '4-xoay-suon');
        await page.evaluate(() => window.__animlab!.pause(false));
      }
      await ctx.close();
      return { ...out, stills: stillsMode, peak, rest };
    }
    if (stillsMode === 'tp2mon') {
      // Quái hình người Mannequin (Bắc Hoang): chụp quanh quái, cùng bốn phía + ngã + chết như người chơi.
      await gm(page, 'tp bh_tram', 6000);
      await gm(page, 'spawn clear', 1000);
      await gm(page, 'spawn mon_tan_chung 1', 6000);
      await page.evaluate(() => window.__animlab!.pause(false));
      await sleep(2500);
      const monShot = async (name: string, p: { x: number; y: number } | null) => {
        const c = p ?? { x: 640, y: 360 };
        const clip = { x: Math.max(0, Math.round(c.x - 120)), y: Math.max(0, Math.round(c.y - 140)), width: 240, height: 220 };
        const buf = await page.screenshot({ clip, type: 'png' });
        await sharp(buf)
          .resize(480, 440)
          .png()
          .toFile(path.join(r.out, `${stillsMode}-${name}.png`));
        console.log('  ảnh', `${stillsMode}-${name}.png`);
      };
      const mcases: [string, 'front' | 'back' | 'left' | 'right', number, boolean][] = [
        ['1-truoc', 'front', 2, false],
        ['2-sau', 'back', 2, false],
        ['3-trai', 'left', 2, false],
        ['4-phai', 'right', 2, false],
        ['5-nga', 'front', 3, true],
      ];
      // TP-2: đòn thật (cấp 3 qua `ents.hitReact`, như S.DMG) lên quái nhỏ/vừa: phải tự ngã rồi đứng dậy; dải khung theo thời gian.
      await page.evaluate(() => window.__animlab!.pause(false));
      await sleep(1800);
      await page.evaluate(() => window.__animlab!.pause(true));
      await frame(page);
      let tHit = 0;
      for (const ms of [0, 200, 450, 800, 1300]) {
        if (ms > tHit) await advance(page, ms - tHit);
        tHit = ms;
        if (ms === 0) await page.evaluate(() => window.__animlab!.hitReal(3));
        for (let k = 0; k < SETTLE_FRAMES; k++) await frame(page);
        const p = await page.evaluate(() => window.__animlab!.probeMon());
        await monShot(`7-that-${ms}ms`, p);
      }
      for (const [name, from, tier, knock] of mcases) {
        await page.evaluate(() => window.__animlab!.pause(false));
        await sleep(1800);
        await page.evaluate(() => window.__animlab!.pause(true));
        await frame(page);
        const p = await page.evaluate((a) => window.__animlab!.hitMon(a[0] as never, a[1] as number, a[2] as boolean), [
          from,
          tier,
          knock,
        ] as const);
        await advance(page, knock ? 450 : 140);
        for (let k = 0; k < SETTLE_FRAMES; k++) await frame(page);
        await monShot(name, p);
      }
      await page.evaluate(() => window.__animlab!.pause(false));
      await gm(page, 'killall', 700);
      await monShot('6-chet', await page.evaluate(() => window.__animlab!.hitMon('front', 0, false)));
      await ctx.close();
      return { ...out, stills: stillsMode };
    }
    if (stillsMode === 'tp1b') {
      await page.evaluate(() => window.__animlab!.cam('iso'));
      await sleep(1200);
      await page.keyboard.down('w'); // bắt đầu chạy
      await sleep(160);
      await shot('1-batdau');
      await sleep(1600);
      await page.keyboard.up('w'); // dừng
      await sleep(110);
      await shot('2-dung');
      await sleep(1400);
      await tap('a', 70); // xoay tại chỗ (chạm nhẹ, đổi hướng nhìn)
      await sleep(140);
      await shot('3-xoay');
      await sleep(1200);
      await page.keyboard.down('w'); // pivot: đổi hướng gấp khi đang chạy
      await sleep(1400);
      await page.keyboard.up('w');
      await page.keyboard.down('a');
      await sleep(130);
      await shot('4-pivot');
      await page.keyboard.up('a');
    } else {
      const cases: [string, 'front' | 'back' | 'left' | 'right', number, boolean][] = [
        ['1-truoc', 'front', 2, false],
        ['2-sau', 'back', 2, false],
        ['3-trai', 'left', 2, false],
        ['4-phai', 'right', 2, false],
        ['5-nga', 'front', 3, true],
      ];
      for (const [name, from, tier, knock] of cases) {
        await page.evaluate(() => window.__animlab!.pause(false));
        await sleep(2000);
        await page.evaluate(() => window.__animlab!.pause(true));
        await frame(page);
        await page.evaluate((a) => window.__animlab!.hitSelf(a[0] as never, a[1] as number, a[2] as boolean), [from, tier, knock] as const);
        await advance(page, knock ? 450 : 140);
        for (let k = 0; k < SETTLE_FRAMES; k++) await frame(page);
        await shot(name);
      }
      // Cận (camera cận) cho một đòn từ bên trái, rồi chết (lệnh GM, thời gian thật).
      await page.evaluate(() => window.__animlab!.pause(false));
      await sleep(2000);
      await page.evaluate(() => window.__animlab!.cam('close'));
      await page.evaluate(() => window.__animlab!.pause(true));
      await frame(page);
      await page.evaluate(() => window.__animlab!.hitSelf('left', 2, false));
      await advance(page, 140);
      for (let k = 0; k < SETTLE_FRAMES; k++) await frame(page);
      await shot('7-can', true);
      await page.evaluate(() => window.__animlab!.cam('iso'));
      await page.evaluate(() => window.__animlab!.pause(false));
      await sleep(1500);
      await gm(page, 'die', 900);
      await shot('6-chet');
      // TP-2: hồi sinh (C.RESPAWN) — đứng dậy từ tư thế nằm; dải khung theo thời gian thật.
      await page.evaluate(() => window.__animlab!.respawn());
      for (const ms of [120, 350, 700]) {
        await sleep(ms === 120 ? 120 : ms === 350 ? 230 : 350);
        await shot(`8-hoisinh-${ms}ms`, true);
      }
    }
    await ctx.close();
    return { ...out, stills: stillsMode };
  }
  const cut = opt('--cutin', '');
  if (cut) {
    // Cut-in chiêu cuối theo bộ đang mặc (T7/TP-3): thời gian thật (có khựng), ghim animation CSS ở các mốc; `--set <khóa gm outfit>` mặc bộ trước,
    // `--sizes 720p,1080p` chụp lần lượt từng cỡ màn hình cùng một góc. Ảnh: cutin-<bộ>-<cỡ>-<ms>.jpg.
    const marks = list('--cutin-at', '0.3,0.5').map(Number);
    const setId = opt('--set', 'none');
    if (setId !== 'none') await gm(page, `outfit ${setId} ${opt('--gender', 'm')}`, 3500);
    await page.evaluate(() => window.__animlab!.cam('iso'));
    for (const tag of list('--sizes', '720p,1080p')) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await sleep(1200);
      const ok = await page.evaluate((s) => window.__animlab!.cutin(s), cut);
      if (!ok) throw new Error(`bộ ${setId} chưa có tranh cut-in (thiếu trong CUTIN_SETS?)`);
      let t = 0;
      for (const m of marks) {
        await sleep(Math.max(0, (m - t) * 1000));
        t = m;
        // Ghim mọi animation CSS (thẻ cut-in) đúng mốc `m`: chụp ảnh chậm hơn 0,3 s nên không thể dựa vào đồng hồ thật.
        await page.evaluate((ms) => document.getAnimations().forEach((a) => ((a.currentTime = ms), a.pause())), m * 1000);
        await snap(
          page,
          r.out,
          `cutin-${setId === 'none' ? 'de_tu' : setId}-${opt('--gender', 'm')}-${tag}-${Math.round(m * 1000)}ms.jpg`,
          { wait: 0 },
        );
      }
      // Thẻ cut-in tự hết hạn (0,9 s thời gian thật); ghim animation chỉ ảnh hưởng ảnh chụp: trả chạy tiếp rồi chờ.
      await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
      await sleep(2500);
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
      // Pivot: đổi hướng gấp khi đang chạy (w → a không nhả), rồi dừng.
      await page.keyboard.down('w');
      await sleep(1300);
      await page.keyboard.up('w');
      await page.keyboard.down('a');
      await sleep(1000);
      await page.keyboard.up('a');
      await sleep(900);
      // T5: trúng đòn nhẹ/nặng từ bốn phía rồi ngã (đòn nặng + knockdown).
      for (const [from, tier, knock] of [
        ['front', 0, false],
        ['left', 1, false],
        ['back', 2, false],
        ['right', 2, false],
        ['front', 3, true],
      ] as const) {
        await page.evaluate((a) => window.__animlab!.hitSelf(a[0], a[1], a[2]), [from, tier, knock] as const);
        await sleep(from === 'front' && knock ? 2200 : 1300);
      }
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
          rows.push({
            cam,
            size: tag,
            moment: m.name,
            ms: want,
            poseT: ck ? Number(ck.t.toFixed(3)) : null,
            dbg: await page.evaluate(() => {
              const m = (window.__game as any).ents.players.get((window.__game as any).sid).model;
              const u = m.perf?.upper;
              const hb = m.rig?.getObjectByName('hand_r');
              const w = hb ? hb.getWorldPosition(new (hb.position.constructor as any)()) : null;
              return {
                upT: u ? +u.time.toFixed(3) : null,
                upW: u ? +u.getEffectiveWeight().toFixed(2) : null,
                hand: w ? [w.x, w.y, w.z].map((v: number) => +v.toFixed(2)) : null,
                root: m.root.position.y,
              };
            }),
          });
        }
        const cw = 480;
        const ch = Math.round((cw * h) / w);
        // Camera chéo: nhân vật nhỏ nên dải duyệt cắt 30% giữa khung (nhân vật luôn ở tâm) rồi phóng lên; ảnh gốc đầy đủ vẫn ở từng khung riêng.
        const crop =
          cam === 'iso'
            ? { left: Math.round(w * 0.35), top: Math.round(h * 0.3), width: Math.round(w * 0.3), height: Math.round(h * 0.4) }
            : null;
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
    '--out <dir> [--pose kiem_khi_tram,phi_kiem,thien_kiem_vu] [--cams iso,close] [--sizes 720p,1080p] [--thanphap 1] [--ref <ảnh>] [--clip 1] [--cpu 1] [--gender m|f] [--times 0.1,0.2,...] [--clip-size 720p|1080p] [--fx impulse=0,loco=0,...] [--cutin <id chiêu> [--cutin-at 0.12,0.3,...]]',
  async run(r) {
    const poses = list('--pose', 'kiem_khi_tram,phi_kiem,thien_kiem_vu');
    const cams = list('--cams', 'iso,close');
    const sizes = list('--sizes', '720p,1080p');
    const res = await run(r, poses, cams, sizes);
    writeJson(r.out, 'animlab.json', res);
    console.log('animlab:', JSON.stringify(res.cpu ?? {}), `${poses.length} pose`);
  },
} satisfies Scenario;
