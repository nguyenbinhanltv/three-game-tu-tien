// Dạ Cảnh (`?style=da`): mood theo LOẠI TRẬN. Nền đêm của level lùi lại (ít tương phản, bớt bão hòa) để nhân vật và chiêu nổi lên;
// có tinh anh gần thì cảnh ngả đỏ sẫm nhẹ, có boss thì đỏ sẫm rõ và sương dày hơn. Chỉ là lớp hình (loại quái lấy từ state server),
// chỉ chỉnh uniform (không biên dịch lại shader), theo mẫu `updateFaceMood`.
import { MONSTER } from '@dtl/content';
import { MS_DEAD } from '@dtl/shared';
import { tuneAtmosphere } from '../../render/atmosphere';
import { GRADING, mixHex, mixPreset, type GradingPreset } from '../../render/grading';
import { applyGrading } from '../../render/post';
import { skyTopOf } from '../../render/sky';
import type { Game } from '../engine';

/** Bán kính (m) quanh người chơi để một tinh anh/boss còn sống đổi mood. */
export const DA_ELITE_R = 28;
export const DA_BOSS_R = 45;
/** Màu "lửa lạnh" của đèn đá ở Dạ Cảnh và hệ số cường độ đèn thật so với đêm gốc. */
export const DA_FLAME = 0x8fc4ff;
export const DA_LAMP_K = 0.45;
/** Hệ số nắng trăng và ánh trời của nền Dạ Cảnh so với đêm gốc của level. */
export const DA_SUN = 0.62;
export const DA_SKY = 0.7;
/** Màu sương/trời của trận tinh anh và boss (đỏ sẫm, không phải đỏ vạch báo: rất tối, chỉ nhuộm nền). */
const ELITE_FOG = 0x2a1420;
const BOSS_FOG = 0x30080f;
const BOSS_SKY = 0x3a0e16;

/**
 * Preset Dạ Cảnh từ preset đêm gốc của level. `wElite`, `wBoss` ∈ [0, 1].
 * Nền: hạ tương phản và bão hòa, nâng nhẹ đáy đen để máy không có đèn lồng thật (preset Vừa, WebGL2) không "đen đặc".
 */
export function daPreset(base: GradingPreset, wElite: number, wBoss: number): GradingPreset {
  const p = mixPreset(base, base, 0);
  p.contrast *= 0.92;
  p.saturation *= 0.82;
  // Nền lùi lại: bớt nắng trăng và ánh trời (nhân vật tô chia bậc theo MÀU GỐC nên không tối theo, tự nổi lên trên nền).
  p.sunIntensity *= DA_SUN;
  p.skyIntensity *= DA_SKY;
  p.exposure *= 1.02;
  p.blackLift = mixHex(p.blackLift, 0x1a2436, 0.35);
  const e = Math.min(1, Math.max(0, wElite)) * (1 - Math.min(1, Math.max(0, wBoss)));
  const b = Math.min(1, Math.max(0, wBoss));
  if (e > 0) {
    p.fogColor = mixHex(p.fogColor, ELITE_FOG, 0.55 * e);
    p.shadowTint = mixHex(p.shadowTint, 0x1c0a14, 0.5 * e);
    p.fogDensity *= 1 + 0.25 * e;
  }
  if (b > 0) {
    p.fogColor = mixHex(p.fogColor, BOSS_FOG, 0.75 * b);
    p.skyColor = mixHex(p.skyColor, BOSS_SKY, 0.6 * b);
    p.shadowTint = mixHex(p.shadowTint, 0x240610, 0.7 * b);
    p.blackLift = mixHex(p.blackLift, 0x1c080c, 0.6 * b);
    p.fogDensity *= 1 + 0.5 * b;
    p.exposure *= 1 - 0.06 * b;
    p.saturation *= 1 - 0.08 * b;
  }
  return p;
}

const st = { level: '', elite: 0, boss: 0, applied: -1 };

/** Gọi mỗi khung khi `?style=da`: tìm tinh anh/boss còn sống gần người chơi, trộn mượt (~0,4 s) rồi áp nếu đổi đáng kể. */
export function updateDaMood(eng: Game, dt: number, x: number, z: number): void {
  if (st.level !== eng.levelMood) {
    st.level = eng.levelMood;
    st.elite = st.boss = 0;
    st.applied = -1;
  }
  let tE = 0;
  let tB = 0;
  eng.view.monsters.forEach((m) => {
    if (m.st === MS_DEAD) return;
    const def = MONSTER.get(m.t);
    if (!def || (!def.boss && !def.elite)) return;
    const d = Math.hypot(m.x - x, m.z - z);
    if (def.boss && d < DA_BOSS_R) tB = 1;
    else if (def.elite && d < DA_ELITE_R) tE = 1;
  });
  const k = Math.min(1, dt * 2.5);
  st.elite += (tE - st.elite) * k;
  st.boss += (tB - st.boss) * k;
  const wE = st.elite < 0.004 ? 0 : st.elite;
  const wB = st.boss < 0.004 ? 0 : st.boss;
  const sig = wE * 3 + wB * 7;
  if (Math.abs(sig - st.applied) < 0.01) return;
  st.applied = sig;
  const p = daPreset(GRADING[eng.levelMood], wE, wB);
  const top = mixHex(mixHex(skyTopOf(eng.levelMood), 0x14080e, 0.4 * wE * (1 - wB)), 0x1a0409, 0.7 * wB);
  tuneAtmosphere(eng.scene, eng.env, p, eng.levelMood, top);
  applyGrading(p);
}
