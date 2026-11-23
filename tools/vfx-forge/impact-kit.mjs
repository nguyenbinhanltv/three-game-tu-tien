// V-P2..P8: "bộ va chạm" theo concept cho chiêu yếu: vòng ripple mực + vòng gai kite + một lưỡi cung phẳng quanh điểm trúng (hoặc quanh thân), đặt ở t = 0
// để thấy rõ ở +30/+150 ms. Dùng: node tools/vfx-forge/impact-kit.mjs <id>:<neo>:<bán kính m> ...  (neo = target|self|area; chạy lại sẽ bỏ bộ cũ rồi thêm lại)
import fs from 'node:fs';
const mk = (anchor, R, tone) => {
  const ev = [];
  ev.push({
    type: 'mesh',
    shape: 'ripple',
    t: 0,
    dur: 0.55,
    at: anchor,
    offset: [0, 0.12, 0],
    scale: R * 0.4,
    scaleTo: R * 1.0,
    sweep: 0.05,
    erodeFrom: 0.08,
    ragged: 0.6,
    tone,
    alpha: 0.8,
    ink: true,
    shadow: true,
    seed: 9,
    tier: 0,
  });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ev.push({
      type: 'mesh',
      shape: 'kite',
      t: 0.01 + (i % 3) * 0.015,
      dur: 0.6,
      at: anchor,
      offset: [+(Math.cos(a) * R).toFixed(2), 0, +(Math.sin(a) * R).toFixed(2)],
      rot: [-90, 0, 0],
      scale: +(R * 0.32 * (i % 2 ? 0.7 : 1)).toFixed(2),
      sweep: 0.15,
      erodeFrom: 0.45,
      alpha: 1,
      tone,
      seed: i + 1,
      tier: 1,
    });
  }
  ev.push({
    type: 'mesh',
    shape: 'slash_thick',
    t: -0.02,
    dur: 0.4,
    at: anchor,
    offset: [0, 0.2, 0],
    rot: [0, 25, 0],
    scale: R * 1.3,
    scaleTo: R * 2.1,
    sweep: 0.4,
    erodeFrom: 0.4,
    ragged: 0.7,
    tone,
    alpha: 0.9,
    ink: true,
    seed: 4,
    tier: 0,
  });
  return ev;
};
// Nhận ra bộ cũ qua dấu hiệu cố định (seed/rot/dur) để chạy lại an toàn.
const isKit = (e) =>
  e.type === 'mesh' &&
  ((e.shape === 'ripple' && e.seed === 9 && e.ink) ||
    (e.shape === 'kite' && e.dur === 0.6 && e.rot?.[0] === -90) ||
    (e.shape === 'slash_thick' && e.seed === 4 && e.rot?.[1] === 25));
for (const spec of process.argv.slice(2)) {
  const [id, anchor, R] = spec.split(':');
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  t.events = t.events.filter((e) => !isKit(e));
  t.events.push(...mk(anchor, Number(R), 'body'));
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, anchor, R);
}
