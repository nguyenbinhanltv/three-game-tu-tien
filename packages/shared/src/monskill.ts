// Nguyên tắc quái mở rộng (E1-E): hàm thuần dùng chung server (phán định) và client (vẽ cho khớp).
// Kiểu dữ liệu ở types.ts (`MonsterLine`, `MonsterCharge`, `MonsterLeap`, `MonsterBurrow`, `MonsterReflect`,
// `MonsterSummon`, `MonsterReveal`); trạng thái chạy ở apps/server/src/game/monskill.ts.

import type { HazardGeom } from './combat';
import type { MonsterAi, MonsterBurrow, MonsterReflect, MonsterReveal } from './types';

/** Thời gian bay của nhảy đập (giây, cuối khoảng báo trước): quái rời chỗ cũ và đáp đúng lúc vạch nổ. */
export const LEAP_AIR = 0.35;
/** Đệ tử gọi tối đa cùng lúc trên một room cho mọi quái (chặn tràn). */
export const SUMMON_ROOM_MAX = 24;
/** Tên các kiểu mở rộng, theo thứ tự ưu tiên khi nhiều chiêu cùng sẵn sàng. */
export const MON_SKILLS = ['burrow', 'leap', 'charge', 'line', 'summon', 'reflect', 'reveal'] as const;
export type MonSkillName = (typeof MON_SKILLS)[number];

/** Danh sách kiểu mở rộng mà bộ chiêu `ai` đang có. */
export function monSkillsOf(ai: MonsterAi): MonSkillName[] {
  return MON_SKILLS.filter((k) => !!ai[k]);
}

const DEG = Math.PI / 180;

/** Hướng theo quy ước atan2(dx, dz). */
export function yawTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, tz - fz);
}

/** Vạch chữ nhật từ (x, z) theo `yaw`, dài `r` rộng `w`. */
export function lineGeom(x: number, z: number, yaw: number, r: number, w: number): HazardGeom {
  return { x, z, r, sh: 'rect', yaw, w };
}

/** Vạch quạt, `halfDeg` là nửa góc tính bằng độ. */
export function coneGeom(x: number, z: number, yaw: number, r: number, halfDeg: number): HazardGeom {
  return { x, z, r, sh: 'cone', yaw, w: halfDeg * DEG };
}

/** Đáp điểm của lao tới: đi từ (x, z) theo `yaw` tối đa `len`, `ok(x, z)` false thì dừng ở bước trước (bước 0,5 m). */
export function chargeEnd(
  x: number,
  z: number,
  yaw: number,
  len: number,
  ok: (x: number, z: number) => boolean,
): { x: number; z: number; len: number } {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let d = 0;
  while (d < len) {
    const nd = Math.min(len, d + 0.5);
    if (!ok(x + fx * nd, z + fz * nd)) break;
    d = nd;
  }
  return { x: x + fx * d, z: z + fz * d, len: d };
}

/**
 * Vị trí quái đang nhảy đập: đứng yên ở chỗ cũ tới `at - LEAP_AIR`, rồi bay thẳng tới đích, tới đúng `at`.
 */
export function leapPos(fx: number, fz: number, tx: number, tz: number, at: number, nowMs: number): { x: number; z: number; k: number } {
  const t0 = at - LEAP_AIR * 1000;
  const k = Math.max(0, Math.min(1, (nowMs - t0) / (LEAP_AIR * 1000)));
  return { x: fx + (tx - fx) * k, z: fz + (tz - fz) * k, k };
}

/**
 * `n` điểm quanh (tx, tz), cách `spread` mét, đều góc, bắt đầu từ góc `a0`. Điểm đầu tiên là chỗ quái trồi lên.
 * `ok(x, z)` loại chỗ không đứng được (nước, vách): thử xoay thêm vài lần, hết cách thì dồn về chỗ mục tiêu.
 */
export function burrowSpots(
  tx: number,
  tz: number,
  n: number,
  spread: number,
  a0: number,
  ok: (x: number, z: number) => boolean,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    let spot = { x: tx, z: tz };
    for (let t = 0; t < 8; t++) {
      const a = a0 + (i / Math.max(1, n)) * Math.PI * 2 + t * 0.4;
      const x = tx + Math.sin(a) * spread;
      const z = tz + Math.cos(a) * spread;
      if (ok(x, z)) {
        spot = { x, z };
        break;
      }
    }
    out.push(spot);
  }
  return out;
}

/** Cửa sổ phản đòn của một lần dùng: bắt đầu `start`, tụ thế `warn` giây, phản `dur` giây. */
export interface ReflectWin {
  start: number;
  until: number;
}

export function reflectWindow(cfg: MonsterReflect, nowMs: number): ReflectWin {
  return { start: nowMs, until: nowMs + (cfg.warn + cfg.dur) * 1000 };
}

/** 'warn' = đã hiện cờ nhưng chưa phản; 'on' = đang phản; 'off' = hết/không có. */
export function reflectPhase(cfg: MonsterReflect, win: ReflectWin | null, nowMs: number): 'off' | 'warn' | 'on' {
  if (!win || nowMs >= win.until) return 'off';
  return nowMs < win.start + cfg.warn * 1000 ? 'warn' : 'on';
}

/** Sát thương quái nhận (`take`) và sát thương phản về người đánh (tối đa `cap` × máu tối đa của họ). */
export function reflectSplit(cfg: MonsterReflect, dmg: number, attackerMaxHp: number): { taken: number; back: number } {
  const back = Math.min(dmg * cfg.ratio, attackerMaxHp * cfg.cap);
  return { taken: Math.max(0, Math.round(dmg * cfg.take)), back: Math.max(0, Math.round(back)) };
}

/** Hệ số sát thương quái nhận: lộ yếu điểm (`mul`) hoặc ngoài lúc lộ (`guard`). */
export function revealMul(cfg: MonsterReveal | undefined, weak: boolean): number {
  if (!cfg) return 1;
  return weak ? cfg.mul : (cfg.guard ?? 1);
}

/** Đã đủ chỗ cho đệ tử mới: còn `alive` con sống, cần thêm `n`, trần `max` của chiêu và trần cả room. */
export function summonRoom(alive: number, n: number, max: number, roomAlive: number): number {
  return Math.max(0, Math.min(n, max - alive, SUMMON_ROOM_MAX - roomAlive));
}

/** Điểm đứng cho đệ tử: vòng quanh (cx, cz) cách `r` mét, đều góc từ `a0`. */
export function summonSpots(cx: number, cz: number, n: number, r: number, a0: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / Math.max(1, n)) * Math.PI * 2;
    out.push({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
  }
  return out;
}

/** Ngày giờ nổ của vạch quạt trồi lên sau chui đất: hết `hide` giây, mất `cone.delay` giây báo. */
export function burrowTimeline(cfg: MonsterBurrow): { emergeAt: number; coneAt: number } {
  return { emergeAt: cfg.hide, coneAt: cfg.hide + cfg.cone.delay };
}

/**
 * Một bước kéo (Nuốt, E3-G): người cách tâm boss `dist` m ban đầu `d0`, cần tới cách `stop` m sau `dur` giây; trả quãng kéo
 * trong `dt` giây, không vượt chỗ còn lại (`dist - stop`).
 */
export function pullStep(d0: number, dist: number, stop: number, dur: number, dt: number): number {
  const left = dist - stop;
  if (left <= 0 || !(dur > 0)) return 0;
  return Math.min(left, (Math.max(0, d0 - stop) * dt) / dur);
}

/** Người ở (px, pz) có nằm trong vũng độc tâm (x, z) bán kính r không. */
export function inPool(x: number, z: number, r: number, px: number, pz: number): boolean {
  return (px - x) ** 2 + (pz - z) ** 2 <= r * r;
}

/** Tâm các vũng của một vệt dọc vạch từ (x, z) theo `yaw` dài `len`: cách nhau 1,5 r (phủ kín, chồng nhẹ), tối đa 8 vũng. */
export function trailSpots(x: number, z: number, yaw: number, len: number, r: number): { x: number; z: number }[] {
  const step = Math.max(0.5, r * 1.5);
  const n = Math.min(8, Math.max(1, Math.ceil(len / step)));
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = n === 1 ? len / 2 : (len * (i + 0.5)) / n;
    out.push({ x: x + Math.sin(yaw) * d, z: z + Math.cos(yaw) * d });
  }
  return out;
}
