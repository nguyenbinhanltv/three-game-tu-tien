// V-P2..P8: mô-típ hình riêng cho từng chiêu (thay `impact-kit.mjs` dùng chung một bộ cho mọi chiêu). Mỗi mô-típ sinh sự kiện timeline kiểu mực, cỡ lớn như concept,
// đánh dấu bằng seed >= 100 để chạy lại an toàn (bỏ bộ cũ rồi thêm lại). Dùng: node tools/vfx-forge/motifs.mjs <id>:<mô-típ>:<neo>:<bán kính> ...
// Mô-típ: rings (vòng quét nhiều tầng + cung mảnh), spikes (gai kiếm tỏa nằm ngang quanh tâm + vòng), cross (hai kiếm chéo + vệt), arcs (cung lớn + vệt mảnh), drop (kiếm giáng đứng + vòng),
// line (vệt dài theo hướng đánh), pillar (cột kiếm lõi trắng + vòng trận, không sương).
import fs from 'node:fs';

const DEG = 180 / Math.PI;
const r2 = (x) => Math.round(x * 100) / 100;
let BODY = 'body';
const mesh = (o) => ({
  type: 'mesh',
  t: 0,
  dur: 0.55,
  at: 'target',
  sweep: 0.2,
  erodeFrom: 0.4,
  ragged: 0.6,
  tone: BODY,
  alpha: 0.95,
  tier: 0,
  ...o,
});
let seq = 1000;
const S = () => seq++;

let RING = 'ripple';
const ring = (at, y, R0, R1, t, a, tone = BODY) =>
  mesh({
    shape: RING,
    t,
    dur: 0.6,
    at,
    offset: [0, y, 0],
    scale: R0,
    scaleTo: R1,
    sweep: 0.05,
    erodeFrom: 0.1,
    alpha: a,
    tone,
    ink: true,
    shadow: true,
    seed: S(),
  });
const arc = (at, shape, rotZ, yaw, sc, sc1, t, tone = BODY, a = 0.95, off = [0, 0.3, 0]) =>
  mesh({
    shape,
    t,
    dur: 0.45,
    at,
    offset: off,
    rot: [0, yaw, rotZ],
    scale: sc,
    scaleTo: sc1,
    sweep: 0.45,
    erodeFrom: 0.35,
    ragged: 0.8,
    tone,
    alpha: a,
    ink: true,
    seed: S(),
  });
/** Gai kiếm nằm ngang chỉ ra ngoài từ tâm (đầu nhọn +Z quay theo góc). */
const flatSpike = (at, ang, r0, len, w, t, tone = BODY) =>
  mesh({
    shape: 'kite',
    t,
    dur: 0.6,
    at,
    offset: [r2(Math.cos(ang) * r0), 0.15, r2(Math.sin(ang) * r0)],
    rot: [0, r2(Math.atan2(Math.cos(ang), Math.sin(ang)) * DEG), 0],
    scale: [w, w, len],
    sweep: 0.15,
    erodeFrom: 0.5,
    alpha: 1,
    tone,
    seed: S(),
  });
/** Kiếm nằm ngang chỉ theo tiếp tuyến vòng bán kính r0 quanh tâm. */
const tangentBlade = (at, ang, r0, len, w, t) =>
  mesh({
    shape: 'kite',
    t,
    dur: 0.6,
    at,
    offset: [r2(Math.cos(ang) * r0), 0.2, r2(Math.sin(ang) * r0)],
    rot: [0, r2((ang + Math.PI / 2) * -DEG + 90), 0],
    scale: [w, w, len],
    sweep: 0.15,
    erodeFrom: 0.5,
    alpha: 1,
    tone: 'rim',
    seed: S(),
  });
const upBlade = (at, x, z, h, w, t, tone = BODY, a = 1) =>
  mesh({
    shape: 'kite',
    t,
    dur: 0.7,
    at,
    offset: [x, h, z],
    rot: [90, 0, 0],
    scale: [w, w, h],
    sweep: 0.1,
    erodeFrom: 0.6,
    alpha: a,
    tone,
    seed: S(),
  });

const MOTIFS = {
  rings: (at, R) => [
    ring(at, 0.12, R * 0.4, R * 1.0, 0, 0.85),
    ring(at, 0.14, R * 0.3, R * 1.5, 0.05, 0.7),
    ring(at, 0.16, R * 0.2, R * 2.1, 0.1, 0.5),
    // kiếm nhỏ bay vòng theo tiếp tuyến (đầu nhọn nằm ngang, cách đều trên vòng 1,3R)
    ...Array.from({ length: 6 }, (_, i) => tangentBlade(at, (i / 6) * Math.PI * 2, R * 1.3, R * 0.9, R * 0.2, 0.02 + i * 0.015)),
  ],
  spikes: (at, R) => [
    ring(at, 0.12, R * 0.5, R * 1.2, 0, 0.8),
    ...Array.from({ length: 12 }, (_, i) =>
      flatSpike(at, (i / 12) * Math.PI * 2, R * 0.4, R * (i % 2 ? 2.0 : 3.0), R * 0.34, 0.01 + (i % 3) * 0.015),
    ),
    upBlade(at, 0, 0, R * 1.6, R * 0.35, 0.02, 'rim'),
  ],
  cross: (at, R) => [
    arc(at, 'slash_thin', 0, 35, R * 2.4, R * 3.4, -0.02, BODY, 1),
    arc(at, 'slash_thin', 0, -35, R * 2.4, R * 3.4, 0, 'rim', 1),
    arc(at, 'slash_thick', 0, 0, R * 1.5, R * 2.2, 0.02, BODY, 0.9),
    ring(at, 0.12, R * 0.3, R * 1.1, 0.02, 0.7),
    ...[-0.5, 0.5].map((s, i) => flatSpike(at, Math.PI / 2 + s, R * 0.2, R * 2.2, R * 0.16, 0.03 + i * 0.02, 'rim')),
  ],
  arcs: (at, R) => [
    arc(at, 'slash_thick', 0, 20, R * 2.2, R * 3.2, 0, BODY, 0.95),
    // vệt mảnh song song kéo dài một phía (đuôi tan), không quay quanh một tâm
    ...[0, 1, 2, 3].map((i) =>
      arc(at, 'slash_thin', 0, 20, R * 2.6, R * 4.2, 0.02 + i * 0.025, i % 2 ? 'rim' : BODY, 0.9, [(i - 1.5) * 0.7, 0.3, (i - 1.5) * 0.5]),
    ),
    ring(at, 0.12, R * 0.3, R * 1.0, 0.02, 0.6),
  ],
  drop: (at, R) => [
    upBlade(at, 0, 0, R * 3.2, R * 0.5, -0.04, BODY, 0.95),
    upBlade(at, 0, 0, R * 3.2, R * 0.2, -0.04, 'rim', 1),
    ring(at, 0.12, R * 0.3, R * 1.4, 0.02, 0.8),
    ...Array.from({ length: 8 }, (_, i) => flatSpike(at, (i / 8) * Math.PI * 2, R * 0.3, R * 1.8, R * 0.16, 0.03 + (i % 2) * 0.02)),
    arc(at, 'slash_thick', 0, 60, R * 1.2, R * 1.9, 0.02, BODY, 0.85),
  ],
  line: (at, R) => [
    ...[0, 1, 2].map((i) =>
      arc('ahead', 'slash_thin', 0, 0, R * 3.4, R * 5.0, -0.1 + i * 0.03, i === 1 ? 'rim' : BODY, 0.95, [(i - 1) * 0.5, 0.25, 1 + i * 0.6]),
    ),
    arc('ahead', 'slash_thick', 0, 0, R * 2.6, R * 3.4, -0.08, BODY, 0.9, [0, 0.3, 2]),
    ring(at, 0.12, R * 0.3, R * 1.0, 0, 0.6),
  ],
  // Thủ: chuông/lồng chắn quanh thân: vòng đất + 8 trụ kiếm/đá đứng quanh bán kính R + vòng nhỏ trên cao.
  dome: (at, R) => [
    ring(at, 0.12, R * 0.5, R * 1.2, 0, 0.85),
    ring(at, 0.14, R * 0.4, R * 1.7, 0.06, 0.55),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return upBlade(at, r2(Math.cos(a) * R), r2(Math.sin(a) * R), R * 1.3, R * 0.28, 0.01 + (i % 4) * 0.015, i % 2 ? 'rim' : BODY, 0.95);
    }),
    upBlade(at, 0, 0, R * 1.8, R * 0.5, 0.02, BODY, 0.5),
  ],
  // Buff thân lớn: cột sáng giữa + vòng + 6 trụ nhỏ.
  aura: (at, R) => [
    upBlade(at, 0, 0, R * 2.6, R * 0.6, -0.02, BODY, 0.8),
    upBlade(at, 0, 0, R * 2.6, R * 0.25, -0.02, 'rim', 1),
    ring(at, 0.12, R * 0.5, R * 1.3, 0, 0.85),
    ring(at, 0.14, R * 0.4, R * 1.9, 0.06, 0.55),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return upBlade(at, r2(Math.cos(a) * R * 1.1), r2(Math.sin(a) * R * 1.1), R * 1.0, R * 0.22, 0.03 + (i % 3) * 0.02, 'rim', 0.9);
    }),
  ],
  // Vết cào nhiều vệt song song (dash): vệt mảnh rim/body dài, mờ dần, lệch ngang.
  claw: (at, R) => [
    ...[-1.5, -0.5, 0.5, 1.5].map((k, i) =>
      arc('ahead', 'slash_thin', 0, 0, R * 1.0, R * 1.8, i * 0.02, i % 2 ? 'rim' : BODY, 0.85, [k * R * 0.22, 0.25, 1 + i * 0.3]),
    ),
    ring(at, 0.12, R * 0.3, R * 0.9, 0.02, 0.6),
  ],
  // Mũi xung kích (dash vai): nêm kite nằm ngang dài phía trước + vòng bụi nhỏ.
  pulse: (at, R) => [
    ...[-0.35, 0, 0.35].map((k, i) =>
      mesh({
        shape: 'kite',
        t: 0.01 + i * 0.02,
        dur: 0.5,
        at: 'ahead',
        offset: [k * R, 0.2, R * 0.8],
        rot: [0, 0, 0],
        scale: [R * 0.35, R * 0.35, R * 2.6],
        sweep: 0.15,
        erodeFrom: 0.5,
        alpha: 1,
        tone: i === 1 ? 'rim' : BODY,
        seed: S(),
      }),
    ),
    ring(at, 0.12, R * 0.3, R * 1.0, 0.02, 0.6),
  ],
  // Cung quét mảnh: hai cung mỏng lệch nhau, không đặc.
  sweep: (at, R) => [
    arc(at, 'slash_thin', 0, 15, R * 1.3, R * 2.1, 0, BODY, 0.85),
    arc(at, 'slash_thin', 0, 40, R * 1.1, R * 1.8, 0.03, 'rim', 0.8, [0.3, 0.35, 0.2]),
    arc(at, 'slash_thin', 0, -10, R * 1.0, R * 1.6, 0.05, BODY, 0.75, [-0.3, 0.25, -0.2]),
  ],
  // Vòng ấn nhiều tầng không đĩa đặc: 3 vòng rune đồng tâm.
  seals: (at, R) => [
    ring(at, 0.12, R * 0.3, R * 0.7, 0, 0.8),
    ring(at, 0.14, R * 0.25, R * 1.0, 0.05, 0.6),
    ring(at, 0.16, R * 0.2, R * 1.4, 0.1, 0.4),
  ],
  // Chuông: chuông cao trùm thân (bell_cage) + vòng ấn dưới chân.
  bell: (at, R) => [
    mesh({
      shape: 'bell_cage',
      t: -0.02,
      dur: 0.9,
      at,
      offset: [0, 0, 0],
      scale: [R * 1.1, R * 1.2, R * 1.1],
      sweep: 0.2,
      erodeFrom: 0.7,
      alpha: 0.9,
      tone: BODY,
      seed: S(),
    }),
    ring(at, 0.12, R * 0.3, R * 0.9, 0, 0.9),
    ring(at, 0.14, R * 0.3, R * 1.3, 0.06, 0.6),
  ],
  // Pháp tướng: thẻ pháp tướng khổng lồ đứng sau lưng + vòng ấn.
  titan: (at, R) => [
    mesh({
      shape: 'statue',
      t: -0.1,
      dur: 1.4,
      at,
      offset: [0, 0, -3],
      scale: R * 0.3,
      awayFromCam: true,
      sweep: 0.3,
      erodeFrom: 0.75,
      alpha: 0.6,
      tone: BODY,
      seed: S(),
    }),
    ring(at, 0.12, R * 0.3, R * 0.8, 0, 0.9),
    ring(at, 0.14, R * 0.3, R * 1.2, 0.06, 0.6),
  ],
  pillar: (at, R) => [
    upBlade(at, 0, 0, 16, R * 1.1, -0.04, BODY, 0.9),
    upBlade(at, 0, 0, 16, R * 0.7, -0.04, 'rim', 1),
    upBlade(at, 0, 0, 16, R * 0.3, -0.03, 'rim', 1),
    ring(at, 0.12, R * 0.4, R * 1.2, 0, 0.85),
    ring(at, 0.14, R * 0.3, R * 1.7, 0.06, 0.55),
  ],
};

// Dấu nhận mô-típ: seed >= 1000 (script hiện tại). Bản đầu của script (đã merge ở #548/#561 cho Kiếm tu và còn sót ở vài chiêu Hộ pháp) dùng seed 100-299:
// nhận thêm dải đó CHỈ cho các hình script sinh (ripple/kite/slash_thin/slash_thick/rune_ring2/bell_cage/statue) để chạy lại không nhân đôi hình.
// Timeline viết tay của các chiêu `skl_*` không có sự kiện seed 100-299 ở các hình này (đã quét); thẻ pháp tướng seed ~960 (`card`) KHÔNG bị nhận nhầm.
const LEGACY_SHAPES = new Set(['ripple', 'kite', 'slash_thin', 'slash_thick', 'rune_ring2', 'bell_cage', 'statue']);
const isMotif = (e) =>
  e.type === 'mesh' && typeof e.seed === 'number' && (e.seed >= 1000 || (e.seed >= 100 && e.seed < 300 && LEGACY_SHAPES.has(e.shape)));
// bộ va chạm cũ của impact-kit.mjs (ripple seed 9 ink; kite dur 0.6 rot -90; slash_thick seed 4 rot y 25)
const isOldKit = (e) =>
  e.type === 'mesh' &&
  ((e.shape === 'ripple' && e.seed === 9 && e.ink) ||
    (e.shape === 'kite' && e.dur === 0.6 && e.rot?.[0] === -90) ||
    (e.shape === 'slash_thick' && e.seed === 4 && e.rot?.[1] === 25));

for (const spec of process.argv.slice(2)) {
  const [id, motif, anchor, R, tone] = spec.split(':');
  BODY = tone || 'body';
  RING = process.env.RING || 'ripple';
  if (!MOTIFS[motif]) throw new Error(`mô-típ lạ: ${motif}`);
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  t.events = t.events.filter((e) => !isMotif(e) && !isOldKit(e));
  const evs = MOTIFS[motif](anchor, Number(R));
  // Chiêu kích theo S.FX (lướt/thuấn di): mọi sự kiện neo tại 0, không có mốc âm.
  if (t.trigger === 'fx') for (const e of evs) e.t = Math.max(0, e.t);
  t.events.push(...evs);
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, motif, anchor, R);
}
