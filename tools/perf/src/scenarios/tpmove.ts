// Thân Pháp T2 (hoàn thiện TP-1): đo và chụp ĐẢO CHIỀU GẤP (pivot) và IK chân khi CHẠY trên bậc thang/dốc, bằng đầu dò `window.__animlab.probe()`.
// Nhân vật đi bằng đích chuột phải (`__game.iso.dest`) nên hướng chạy theo trục thế giới, không phụ thuộc hướng camera chéo của bản đồ.
//   pnpm shots tpmove --out <thư mục tuyệt đối> [--tests pivot,stand,flat,stairs,slope] [--thanphap 0|1] [--fx pivot=0,...] [--gender m|f] [--set <gm outfit>]
//                     [--stills 1 [--sizes 720p,1080p]] [--runs 3]
// Số đo (`tpmove.json`); độ cao cổ chân tính so với mặt đứng thật ngay dưới nó, trừ mốc tiếp đất khi chạy đều trên bãi phẳng (`runContactCm`):
//  - pivot: `dipCm` = hông hạ thêm so với điểm thấp của nhịp chạy đều, `uprightDeg` = thân dựng lên bao nhiêu so với độ chúi lúc chạy đều (phanh),
//    `turn50Ms`/`turn90Ms` = thời gian thân (đang hiển thị) quay được 50%/90% góc, `sinkCm` = chân lún sâu nhất trong 0,6 s sau khi đảo chiều (dương = lún).
//  - stand: cổ chân lúc đứng trước và sau một lượt chạy–dừng (phải về cùng độ cao) + ảnh ngang tầm chân.
//  - flat (đối chứng) / stairs / slope (lên rồi xuống, chỉ lúc chạy đều): `sinkP95Cm`/`sinkMaxCm` = chân trụ lún, `contactCm` = p10
//    độ cao chân trụ (≈ lúc tiếp đất), `vyP95`/`vyP99` = tốc độ dọc của cổ chân (m/s): chân nhảy cả bậc trong một khung thì vọt lên hàng chục m/s.
// `--stills 1`: dải khung quanh lúc đảo chiều và lúc chạy trên bậc, camera chéo, mỗi cỡ một lượt cùng góc; tên file có mốc ms.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { collisionOf, terrainOf } from '@dtl/shared';
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Run, Scenario } from '../lib/scenario';
import { centerClip, snap, UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];
interface Row {
  t: number;
  root: [number, number, number];
  yaw: number;
  innerY: number;
  pelvis: [number, number, number];
  head: [number, number, number];
  feet: { x: number; y: number; z: number; g: number }[];
  ground: number;
}

/**
 * Bãi cỏ phẳng phía đông bắc tông môn: đoạn x 2117–2143 tại z = 2044 chênh cao 0 cm, không có vật thể nào trong 10 m (dò từ địa hình + hình va chạm,
 * xem trước bằng `--tests look`), nên ảnh không bị cây/cờ che và số đo không dính mép lát đá. Đoạn phẳng hơn ở (1988, 2110) là ao sen: chân chìm trong nước.
 */
const FLAT = { x: 2130, z: 2044 };
/**
 * Cầu thang chính của tông môn (nhịp trái, x 2042–2047): 11 bậc 0,2–0,3 m, lên 2,4 m về phía −z từ z ≈ 2023 tới 2017. Tìm bằng cách mô phỏng
 * `stepMove` thật: x = 2042 sát lan can (khối rắn) và x = 2048 (khe giữa hai nhịp) đều bị chặn sau 2 bậc.
 */
const STAIRS = { x: 2046, zLow: 2030, zHigh: 2017 };

/** Điểm dốc đất 20–27° không có vật rắn gần và hướng lên dốc (đơn vị). */
function slopeSpot(): { x: number; z: number; ux: number; uz: number } {
  const t = terrainOf('van_lam');
  const shapes = collisionOf('van_lam').shapes;
  let best: { x: number; z: number; s: number; gx: number; gz: number } | null = null;
  for (let x = 1900; x < 2200; x += 4)
    for (let z = 2150; z < 2500; z += 4) {
      const gx = (t.groundAt(x + 1, z) - t.groundAt(x - 1, z)) / 2;
      const gz = (t.groundAt(x, z + 1) - t.groundAt(x, z - 1)) / 2;
      const s = Math.hypot(gx, gz);
      if (s < 0.36 || s > 0.5 || shapes.some((h) => Math.hypot(h.x - x, h.z - z) < 10)) continue;
      if (!best || s > best.s) best = { x, z, s, gx, gz };
    }
  const b = best ?? { x: 2048, z: 2200, s: 1, gx: 0, gz: 1 };
  return { x: b.x, z: b.z, ux: b.gx / b.s, uz: b.gz / b.s };
}

/** `--raw 1`: lưu hàng thô từng khung (`raw-<tên>.json`) để phân tích ngoài. */
const dump = (out: string, name: string, rows: Row[]): Row[] => {
  if (opt('--raw', '') === '1') fs.writeFileSync(path.join(out, `raw-${name}.json`), JSON.stringify(rows));
  return rows;
};

const q = (a: number[], p: number): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

const startRec = (page: Page) =>
  page.evaluate(`(() => {
    const w = (window.__tp = { rows: [], on: true });
    const tick = () => {
      if (!w.on) return;
      const p = window.__animlab.probe();
      if (p) w.rows.push({ t: performance.now() / 1000, ...p });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
const stopRec = (page: Page) => page.evaluate('(() => { window.__tp.on = false; return window.__tp.rows; })()') as Promise<Row[]>;
const goTo = (page: Page, x: number, z: number) =>
  page.evaluate(`(() => { const i = window.__game.iso; i.dest = { x: ${x}, z: ${z} }; i.destMark.material.visible = false; })()`);
const halt = (page: Page) => page.evaluate('(() => { window.__game.iso.dest = null; })()');

/** Cổ chân so với mặt đứng THẬT ngay dưới nó (m). Kịch bản giữ cảnh giới thấp nên gốc không bị hào quang nhấc lên. */
const rel = (r: Row, k: number): number => r.feet[k]!.y - r.feet[k]!.g;

/** Chạy tới `a` rồi (sau `ms1`) quay sang `b`, ghi suốt. */
async function leg(page: Page, a: { x: number; z: number }, b: { x: number; z: number }, ms1: number, ms2: number): Promise<Row[]> {
  await startRec(page);
  await goTo(page, a.x, a.z);
  await sleep(ms1);
  await goTo(page, b.x, b.z);
  await sleep(ms2);
  await halt(page);
  await sleep(500);
  return stopRec(page);
}

/** Vận tốc ngang của gốc giữa hai hàng liền nhau. */
const vel = (rows: Row[], i: number): [number, number] => {
  const a = rows[Math.max(0, i - 1)]!;
  const b = rows[i]!;
  const dt = Math.max(1e-3, b.t - a.t);
  return [(b.root[0] - a.root[0]) / dt, (b.root[2] - a.root[2]) / dt];
};

function pivotStats(rows: Row[], rest: number, dir: [number, number]) {
  // Mốc đảo chiều: khung đầu tiên vận tốc dọc hướng cũ đổi dấu sau khi đã chạy ≥ 4 m/s.
  let i0 = -1;
  let ran = false;
  for (let i = 2; i < rows.length; i++) {
    const [vx, vz] = vel(rows, i);
    const along = vx * dir[0] + vz * dir[1];
    if (along > 4) ran = true;
    if (ran && along < -0.5) {
      i0 = i;
      break;
    }
  }
  if (i0 < 0) return { error: 'không thấy đảo chiều' };
  const t0 = rows[i0]!.t;
  const hipOf = (r: Row) => r.pelvis[1] - r.root[1];
  // Thân ngả về hướng `d` (độ): góc của vector hông→đầu so với phương đứng, chiếu lên `d`.
  const leanTo = (r: Row, sx: number, sz: number) =>
    (Math.atan2((r.head[0] - r.pelvis[0]) * sx + (r.head[2] - r.pelvis[2]) * sz, r.head[1] - r.pelvis[1]) * 180) / Math.PI;
  // Chạy đều ngay trước đó: hông thấp nhất của nhịp bước (p10) và độ chúi về trước (trung vị) làm mốc.
  const steady = rows.filter((r) => r.t > t0 - 0.7 && r.t < t0 - 0.05);
  const hipLow = q(steady.map(hipOf), 0.1);
  const leanRun = q(
    steady.map((r) => leanTo(r, dir[0], dir[1])),
    0.5,
  );
  const win = rows.filter((r) => r.t >= t0 - 0.06 && r.t <= t0 + 0.6);
  // Hướng nhìn vài khung trước mốc (mốc vận tốc có thể trễ một hai khung so với lúc thân bắt đầu quay).
  const yaw0 = rows[Math.max(0, i0 - 6)]!.yaw;
  // Độ nghiêng toàn phần của thân so với phương đứng (độ).
  const tilt = (r: Row) =>
    (Math.atan2(Math.hypot(r.head[0] - r.pelvis[0], r.head[2] - r.pelvis[2]), r.head[1] - r.pelvis[1]) * 180) / Math.PI;
  let acc = 0;
  let turn50 = -1;
  let turn90 = -1;
  let minTilt = 99;
  let dip = 0;
  let sink = 0;
  let prev = yaw0;
  for (const r of win) {
    dip = Math.max(dip, hipLow - hipOf(r));
    minTilt = Math.min(minTilt, tilt(r));
    for (let k = 0; k < 2; k++) sink = Math.max(sink, rest - rel(r, k));
    acc += wrap(r.yaw - prev);
    prev = r.yaw;
    if (turn50 < 0 && Math.abs(acc) > Math.PI * 0.5) turn50 = Math.round((r.t - t0) * 1000);
    if (turn90 < 0 && Math.abs(acc) > Math.PI * 0.9) turn90 = Math.round((r.t - t0) * 1000);
  }
  return {
    frames: win.length,
    dipCm: r1(dip * 100),
    leanRunDeg: r1(leanRun),
    uprightDeg: r1(leanRun - minTilt),
    turn50Ms: turn50,
    turn90Ms: turn90,
    sinkCm: r1(sink * 100),
  };
}

/** Các khung chạy đều của một lượt: độ cao chân trụ (m trên mặt đứng) và tốc độ dọc của từng cổ chân (m/s). */
function steady(rows: Row[]): { stance: number[]; vy: number[] } {
  // Bỏ 0,9 s đầu của mỗi lần xuất phát (clip bắt đầu chạy có bước bật nhảy riêng), chỉ lấy lúc chạy ≥ 3 m/s; bỏ khung khựng (> 20 ms) và khung ngay sau nó.
  const stance: number[] = [];
  const vy: number[] = [];
  let moveT = -1;
  for (let i = 2; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    const [vx, vz] = vel(rows, i);
    const sp = Math.hypot(vx, vz);
    if (sp < 1) moveT = -1;
    else if (moveT < 0) moveT = b.t;
    const dt = b.t - a.t;
    if (sp < 3 || dt > 0.02 || a.t - rows[i - 2]!.t > 0.02 || moveT < 0 || b.t - moveT < 0.9) continue;
    // Chân trụ = chân thấp hơn so với mặt đứng của chính nó.
    stance.push(Math.min(rel(b, 0), rel(b, 1)));
    // Chân nhảy cả bậc trong một khung thì tốc độ dọc vọt lên hàng chục m/s.
    for (let k = 0; k < 2; k++) vy.push(Math.abs(b.feet[k]!.y - a.feet[k]!.y) / dt);
  }
  return { stance, vy };
}

function feetStats(rows: Row[], rest: number) {
  const { stance, vy } = steady(rows);
  const h = stance.map((x) => x - rest);
  return {
    frames: h.length,
    sinkP95Cm: r1(
      q(
        h.map((x) => Math.max(0, -x)),
        0.95,
      ) * 100,
    ),
    sinkMaxCm: r1(Math.max(0, ...h.map((x) => -x)) * 100),
    contactCm: r1(q(h, 0.1) * 100),
    vyP95: r1(q(vy, 0.95)),
    vyP99: r1(q(vy, 0.99)),
  };
}

/**
 * Mốc 0 của mọi số đo lún/hở: độ cao cổ chân của chân trụ lúc tiếp đất (p10) khi CHẠY ĐỀU trên bãi phẳng. Không lấy lúc đứng yên: cổ chân lúc đứng
 * đổi theo tư thế idle (đo được 12–24 cm), còn lúc chạy nhân vật tiếp đất bằng mũi chân nên cổ chân cao hơn lúc đứng.
 */
async function runRest(page: Page): Promise<number> {
  await tp(page, FLAT.x - 11, FLAT.z);
  await sleep(1500);
  const rows = await leg(page, { x: FLAT.x + 11, z: FLAT.z }, { x: FLAT.x - 11, z: FLAT.z }, 2300, 2300);
  const st = steady(rows).stance;
  return st.length ? q(st, 0.1) : 0.2;
}

/**
 * Dải khung: mỗi mốc `pick` (ms sau sự kiện) là MỘT lượt chạy riêng, chụp đúng một ảnh ở mốc đó (chụp liên tục chỉ được ~10 ảnh/giây, quá thưa cho
 * một nhịp 0,4 s). `act(d)` dựng lại tình huống rồi trả về khi đã tới mốc `d`. Ô cắt quanh nhân vật (giữa khung), giữ nguyên điểm ảnh gốc: đúng cỡ
 * người chơi thấy ở cỡ màn hình đó; `--dpr 2|3` cho bản cận soi tư thế.
 */
async function strip(
  page: Page,
  out: string,
  name: string,
  vw: number,
  vh: number,
  act: (d: number) => Promise<void>,
  pick: number[],
): Promise<void> {
  const clip = { x: Math.round(vw * 0.4), y: Math.round(vh * 0.28), width: Math.round(vw * 0.2), height: Math.round(vh * 0.4) };
  const tiles: Buffer[] = [];
  for (const d of pick) {
    await act(d);
    tiles.push(await page.screenshot({ clip, type: 'jpeg', quality: 92 }));
    await halt(page);
    await sleep(700);
  }
  const meta = await sharp(tiles[0]!).metadata();
  const cw = meta.width!;
  const ch = meta.height!;
  await sharp({ create: { width: cw * tiles.length, height: ch, channels: 3, background: '#111' } })
    .composite(tiles.map((input, i) => ({ input, left: i * cw, top: 0 })))
    .jpeg({ quality: 92 })
    .toFile(path.join(out, `${name}.jpg`));
  console.log(`  ảnh ${name}.jpg (mốc ${pick.join(', ')} ms)`);
}

export default {
  name: 'tpmove',
  desc: 'Thân Pháp T2: đo + dải khung đảo chiều gấp (pivot) và IK chân khi chạy trên bậc/dốc (trước/sau bằng --thanphap, --fx)',
  usage:
    '[--tests pivot,stand,flat,stairs,slope] [--thanphap 0|1] [--fx pivot=0,...] [--gender m|f] [--set <gm outfit>] [--stills 1 [--sizes 720p,1080p] [--dpr 2]] [--runs 3] [--raw 1]',
  async run(r) {
    requireLevel('van_lam');
    const tests = new Set(list('--tests', 'pivot,stand,flat,stairs,slope'));
    const runs = num('--runs', 3);
    const stills = opt('--stills', '') === '1';
    const sizes = stills ? list('--sizes', '720p,1080p') : ['720p'];
    const res: Record<string, unknown> = { thanphap: opt('--thanphap', '1') === '1', fx: opt('--fx', '') };
    const sl = slopeSpot();
    for (const [si, sz] of sizes.entries()) {
      const [vw, vh] = UI_SIZES[sz] ?? UI_SIZES['720p']!;
      const { ctx, page } = await r.open({
        name: 'TM',
        viewport: [vw, vh],
        dpr: num('--dpr', 1),
        quality: 'high',
        seenIntro: true,
        look: { g: opt('--gender', 'm') },
        extra: opt('--query', ''),
        query: { realm: 'nk12', god: 1, chr: 'v3', animlab: 1, quiet: 1, thanphap: opt('--thanphap', '1') === '1' ? 1 : undefined },
        hide: 'hud',
      });
      await page.waitForFunction(() => !!window.__game && !!window.__animlab, undefined, { timeout: 120_000 });
      await sleep(2500);
      const fxSet = Object.fromEntries(list('--fx', '').map((kv) => [kv.split('=')[0], kv.split('=')[1] !== '0']));
      if (Object.keys(fxSet).length) await page.evaluate((f) => window.__animlab!.fx(f), fxSet);
      // Giữ cảnh giới Ngưng Khí (`realm=nk12`): từ Nguyên Anh hào quang nhấc người 0,2 m trên mây sen, làm lệch mọi số đo chân.
      await gm(page, 'spawn clear', 1400);
      const set = opt('--set', 'none');
      if (set !== 'none') await gm(page, `outfit ${set} ${opt('--gender', 'm')}`, 3500);
      await page.waitForFunction(() => !!window.__animlab!.probe(), undefined, { timeout: 60_000, polling: 300 });
      const rest = await runRest(page);
      if (si === 0) res.runContactCm = r1(rest * 100);

      if (tests.has('look')) {
        // Xem trước điểm chụp (`--at "x,z;x,z"`): ảnh camera chéo cả khung, để chọn chỗ trống không vật che.
        for (const at of opt('--at', '').split(';').filter(Boolean)) {
          const [x, z] = at.split(',').map(Number) as [number, number];
          await tp(page, x, z);
          await sleep(2500);
          await snap(page, r.out, `look-${x}-${z}-${sz}.jpg`);
        }
      }
      if (tests.has('pivot')) {
        const A = { x: FLAT.x + 40, z: FLAT.z };
        const B = { x: FLAT.x - 40, z: FLAT.z };
        const S = { x: FLAT.x - 9, z: FLAT.z };
        if (si === 0) {
          const all = [];
          for (let k = 0; k < runs; k++) {
            await tp(page, S.x, S.z);
            await sleep(1200);
            all.push(pivotStats(dump(r.out, `pivot-${k}`, await leg(page, A, B, 1500, 1300)), rest, [1, 0]));
          }
          res.pivot = all;
          console.log('[tpmove] pivot', JSON.stringify(all));
        }
        if (stills) {
          await strip(
            page,
            r.out,
            `pivot-iso-${sz}${opt('--dpr', '') ? '-x' + opt('--dpr', '') : ''}`,
            vw,
            vh,
            async (d) => {
              await tp(page, S.x, S.z);
              await sleep(1000);
              await goTo(page, A.x, A.z);
              await sleep(1500);
              // Mốc âm = khung chạy đều ngay trước khi đảo chiều.
              if (d >= 0) {
                await goTo(page, B.x, B.z);
                await sleep(d);
              }
            },
            [-1, 40, 100, 160, 230, 310, 420],
          );
        }
      }
      if (tests.has('stand')) {
        // Đứng yên trước và sau một lượt chạy–dừng: cổ chân phải về đúng độ cao đứng (không kẹt ở thế nhón của clip dừng). Ảnh cận nhìn ngang.
        const relNow = async () => {
          await startRec(page);
          await sleep(300);
          const rows = await stopRec(page);
          return [0, 1].map((k) =>
            r1(
              q(
                rows.map((x) => rel(x, k)),
                0.5,
              ) * 100,
            ),
          );
        };
        // Camera ngang tầm chân, cách 2,6 m về phía +z, nhìn vào cổ chân: thấy bàn chân so với mặt lát.
        const shot = async (tag: string) => {
          await page.evaluate(`(() => {
            const g = window.__game;
            const p = g.ents.players.get(g.sid).model.root.position;
            g.freeCam = { x: p.x, y: p.y + 0.35, z: p.z + 2.6, tx: p.x, ty: p.y + 0.3, tz: p.z, fov: 26 };
          })()`);
          await sleep(500);
          await snap(page, r.out, `stand-${tag}-${sz}.jpg`, { clip: centerClip(vw, vh, Math.round(vw * 0.5), Math.round(vh * 0.8)) });
          await page.evaluate(() => window.__animlab!.cam('iso'));
        };
        await tp(page, FLAT.x - 6, FLAT.z);
        await sleep(2500);
        const before = await relNow();
        await shot('0-truoc-khi-chay');
        await goTo(page, FLAT.x + 10, FLAT.z);
        await sleep(1500);
        await halt(page);
        await sleep(2500);
        const after = await relNow();
        await shot('1-sau-khi-dung-2s');
        if (si === 0) {
          res.stand = { beforeCm: before, after2sCm: after };
          console.log('[tpmove] stand', JSON.stringify(res.stand));
        }
      }
      if (tests.has('flat') && si === 0) {
        // Đối chứng: cùng cách chạy trên sân phẳng (pha bay của bước chạy cũng "hở đất": so số bậc/dốc với số này).
        const all = [];
        for (let k = 0; k < runs; k++) {
          await tp(page, FLAT.x - 9, FLAT.z);
          await sleep(1200);
          all.push(
            feetStats(
              dump(r.out, `flat-${k}`, await leg(page, { x: FLAT.x + 11, z: FLAT.z }, { x: FLAT.x - 11, z: FLAT.z }, 2300, 2300)),
              rest,
            ),
          );
        }
        res.flat = all;
        console.log('[tpmove] flat', JSON.stringify(all));
      }
      if (tests.has('stairs')) {
        const up = { x: STAIRS.x, z: STAIRS.zHigh };
        const down = { x: STAIRS.x, z: STAIRS.zLow };
        if (si === 0) {
          const all = [];
          for (let k = 0; k < runs; k++) {
            await tp(page, down.x, down.z);
            await sleep(1500);
            all.push(feetStats(dump(r.out, `stairs-${k}`, await leg(page, up, down, 2600, 2600)), rest));
          }
          res.stairs = all;
          console.log('[tpmove] stairs', JSON.stringify(all));
        }
        if (stills) {
          await strip(
            page,
            r.out,
            `stairs-iso-${sz}${opt('--dpr', '') ? '-x' + opt('--dpr', '') : ''}`,
            vw,
            vh,
            async (d) => {
              await tp(page, down.x, down.z);
              await sleep(1200);
              await goTo(page, up.x, up.z);
              await sleep(d);
            },
            [950, 1050, 1150, 1250, 1350, 1450, 1550],
          );
        }
      }
      if (tests.has('slope') && si === 0) {
        const up = { x: sl.x + sl.ux * 9, z: sl.z + sl.uz * 9 };
        const down = { x: sl.x - sl.ux * 9, z: sl.z - sl.uz * 9 };
        const all = [];
        for (let k = 0; k < runs; k++) {
          await tp(page, down.x, down.z);
          await sleep(1500);
          all.push(feetStats(dump(r.out, `slope-${k}`, await leg(page, up, down, 2400, 2400)), rest));
        }
        res.slope = all;
        console.log('[tpmove] slope', JSON.stringify(all));
      }
      await ctx.close();
    }
    writeJson(r.out, 'tpmove.json', res);
  },
} satisfies Scenario;
