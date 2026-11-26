#!/usr/bin/env node
// Họa Pháp Lô 2 — V-P10 đợt 3: NGỰ KIẾM (cất cánh `fx_fly_on`, hạ cánh `fx_fly_off`) bằng sprite vẽ tay nhóm `ngu_*` (tranh đơn sắc, kiểu tô 12 = theo bảng
// màu `ngu_kiem` của timeline). Cất cánh: phi kiếm phóng to trượt vào dưới chân → vành bụi gió rách bung ra tại mốc `I` (+30 ms vệt kiếm sáng) → hai vệt gió xoắn.
// Hạ cánh: vành gió ép xuống, bụi thấp rách, kiếm thu thành vệt ngắn về lưng. `I` phải bằng `scene.impactAt` của thẻ cảnh. Ghi đè toàn bộ file.
// Dùng: node tools/vfx-forge/ngu-kiem.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fxDir = path.join(root, 'packages/content/data/fx');
const cardDir = path.join(root, 'packages/content/data/vfx/cards');
const r2 = (x) => Math.round(x * 100) / 100;
/** Chân nhân vật so với neo `self` (ngực). */
const FEET = -1.15;

/**
 * Tấm sprite là quad 2×2 nên K = 0,5 cho `size` = cạnh ô theo MÉT (tranh `dp_*` chiếm ~88% ô). Tấm quay mặt về camera chéo 52°: mép dưới thấp hơn tâm
 * `GROUND × size`, nên tâm phải cao hơn chân ít nhất chừng đó, không thì nền cắt ngang hình (phiến đá dùng chính điều này để "trồi lên").
 */
const GROUND = 0.31;
const K = 0.5;
let seq = 1000;
/** Sprite vẽ tay (billboard). `size`/`sizeTo` mét của ô vuông; `off` so với ngực; `up` = trôi lên bao nhiêu mét trong vòng đời. */
const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], up, ...rest } = o;
  return {
    type: 'mesh',
    shape: 'sprite',
    sprite: name,
    billboard: true,
    at: 'self',
    t: 0,
    dur: 0.6,
    offset: off,
    scale: r2(size * K),
    scaleTo: r2((sizeTo ?? size) * K),
    sweep: 0,
    erodeFrom: 0.4,
    ragged: 0.5,
    tone: 'body',
    alpha: 0.95,
    tier: 0,
    seed: seq++,
    ...(up ? { move: { to: 'self', offset: [off[0], r2(off[1] + up), off[2]], ease: 'out' } } : {}),
    ...rest,
  };
};
const parts = (kind, t, n, o = {}) => ({
  type: 'particles',
  kind,
  t,
  n,
  speed: 2.4,
  spread: 1,
  life: 1.2,
  size: 0.07,
  at: 'self',
  offset: [0, -0.4, 0],
  tone: 'rim',
  tier: 1,
  ...o,
});

/** Tâm tấm sprite phải cao hơn chân ít nhất `GROUND × size` thì nền không cắt hình; tranh nằm bẹt (vành bụi) chấp nhận cắt một ít đáy trống. */
const flatY = (size) => r2(FEET + GROUND * size * 0.55);
const impactAt = (id) => JSON.parse(fs.readFileSync(path.join(cardDir, `${id}.json`), 'utf8')).scene.impactAt;

const T = {
  fx_fly_on(I) {
    const S = 3.4;
    return {
      fxKind: 'flyon',
      palette: 'ngu_kiem',
      events: [
        // Tụ: hạt gió hút vào chân, kiếm trượt vào từ phía sau-phải rồi dừng dưới chân.
        parts('spark', 0, 22, { speed: 2.4, life: r2(I), inward: true, offset: [0, FEET + 0.2, 0], tone: 'body', tier: 0 }),
        sprite('ngu_blade', {
          t: 0,
          dur: r2(I + 0.9),
          off: [2.6, r2(flatY(S) + 0.5), -1.6],
          size: S,
          sizeTo: S,
          alpha: 0.95,
          tone: 'body',
          erodeFrom: 0.8,
          follow: true,
          move: { to: 'self', offset: [0, flatY(S) + 0.05, 0.1], ease: 'out' },
        }),
        // Vỡ: vành bụi gió bị ép bẹp rồi bung, kèm vệt kiếm sáng ở +30 ms.
        sprite('ngu_ring', { t: I, dur: 0.7, off: [0, flatY(4.4), 0], size: 2.4, sizeTo: 4.4, tone: 'body', alpha: 0.85, erodeFrom: 0.35 }),
        sprite('ngu_streak', { t: r2(I + 0.03), dur: 0.18, off: [0, flatY(2.4) + 0.2, 0], size: 2.4, sizeTo: 3, tone: 'rim', erodeFrom: 0.35 }),
        sprite('ngu_puffs', { t: I, dur: 0.9, off: [-1.6, flatY(2.2), 0.6], up: 0.4, size: 1.6, sizeTo: 2.1, tone: 'core', alpha: 0.7, erodeFrom: 0.35, tier: 1 }),
        // Tan: hai vệt gió xoắn quấn lên theo thân.
        sprite('ngu_gust', { t: r2(I + 0.08), dur: 0.9, off: [0, 0.2, 0], up: 0.9, size: 3.2, sizeTo: 3.8, tone: 'body', alpha: 0.85, erodeFrom: 0.4 }),
        sprite('ngu_wisp', { t: r2(I + 0.25), dur: 0.8, off: [0.6, 0.6, 0], up: 0.8, size: 2.2, sizeTo: 2.6, tone: 'rim', alpha: 0.6, erodeFrom: 0.3, tier: 1 }),
        parts('dust', I, 14, { speed: 2.6, life: 0.7, size: 0.25, offset: [0, FEET + 0.1, 0], tone: 'core', tier: 1 }),
      ],
    };
  },
  fx_fly_off(I) {
    return {
      fxKind: 'flyoff',
      palette: 'ngu_kiem',
      events: [
        // Kiếm thu về lưng thành vệt ngắn (trong nhịp tụ ngắn), rồi vành gió ép xuống bung ra.
        sprite('ngu_streak', {
          t: 0,
          dur: I,
          off: [0.2, flatY(2.6) + 0.1, 0.3],
          size: 2.6,
          sizeTo: 1.6,
          tone: 'rim',
          alpha: 0.9,
          erodeFrom: 0.5,
          follow: true,
          move: { to: 'self', offset: [-0.4, 0.2, -0.5], ease: 'in' },
        }),
        sprite('ngu_ring', { t: I, dur: 0.6, off: [0, flatY(4), 0], size: 4, sizeTo: 3, tone: 'body', alpha: 0.8, erodeFrom: 0.35 }),
        sprite('ngu_dust', { t: r2(I + 0.03), dur: 0.6, off: [0, flatY(4.4), 0], size: 2.2, sizeTo: 3.8, tone: 'core', alpha: 0.8, erodeFrom: 0.35 }),
        sprite('ngu_puffs', { t: r2(I + 0.06), dur: 0.7, off: [-1.5, flatY(2.2), 0.4], up: 0.3, size: 1.6, sizeTo: 2.2, tone: 'core', alpha: 0.75, erodeFrom: 0.3, tier: 1 }),
        sprite('ngu_wisp', { t: r2(I + 0.2), dur: 0.6, off: [0.9, 0.3, 0.2], up: 0.4, size: 2, sizeTo: 2.4, tone: 'rim', alpha: 0.55, erodeFrom: 0.3, tier: 1 }),
        parts('dust', I, 16, { speed: 2.4, life: 0.6, size: 0.25, offset: [0, FEET + 0.1, 0], tone: 'core', tier: 1 }),
      ],
    };
  },
};

for (const [id, make] of Object.entries(T)) {
  seq = 1000;
  const { events, ...head } = make(impactAt(id));
  const tl = { skill: id, trigger: 'fx', ...head, events };
  fs.writeFileSync(path.join(fxDir, `${id}.json`), JSON.stringify(tl, null, 2) + '\n');
  const sprites = events.filter((e) => e.shape === 'sprite').length;
  const hat = events.filter((e) => e.type === 'particles').reduce((a, e) => a + e.n, 0);
  console.log(`${id}: ${sprites} sprite, ${hat} hạt`);
}
