// Luật thời gian và liên hoàn của chiêu (K-2): hàm thuần dùng chung server (phán định) và client/check (hiển thị, kiểm dữ liệu).
// Dữ liệu nằm ở packages/content/data/skills.json + methods.json; kiểu ở types.ts.

import { GCD } from './formulas';
import { cloneMoveState, stepMove, type MoveCtx, type MoveInput, type MoveState } from './movement';
import type { PoseDef } from './pose';
import { groundAt } from './terrain';
import type { ComboDef, DashDef, EmpowerDef, SkillDef } from './types';

/** Đòn thường liên hoàn đứt nếu ngừng đánh quá chừng này (giây). */
export const COMBO_WINDOW = 2;
/** Cửa sổ cường hóa mặc định (giây). */
export const EMPOWER_WINDOW = 3;
/** Tốc độ lướt (m/s) và bước mô phỏng nhỏ để không xuyên vật cản mỏng. */
export const DASH_SPEED = 28;
export const DASH_STEP = 0.0125;
/** Độ dốc tối đa (độ cao đổi / quãng ngang) mà lướt còn đi tiếp; dốc hơn coi như vách. */
export const DASH_MAX_SLOPE = 1.2;
/** Khe tối thiểu giữa hai lần lướt bất kể hồi chiêu (ms): chặn dội lệnh. */
export const DASH_MIN_GAP_MS = 400;

/** Kiểu thi triển: mặc định suy từ `cast`. */
export function castTypeOf(s: SkillDef): NonNullable<SkillDef['castType']> {
  return s.castType ?? (s.cast > 0 ? 'cast' : 'instant');
}

/**
 * Thời gian từ lúc bấm tới lúc áp hiệu quả (giây) khi chiêu KHÔNG niệm. Chiêu niệm áp lúc hết niệm
 * (động tác xếp lịch để ra đòn trùng lúc đó), nên nơi gọi chỉ dùng hàm này khi `cast` đã tính bằng 0.
 */
export function strikeDelay(s: SkillDef, comboIdx?: number): number {
  const ch = comboIdx !== undefined ? s.combo?.hits[comboIdx]?.hitAt : undefined;
  return Math.max(0, ch ?? s.hitAt?.[0] ?? 0);
}

/**
 * Thời điểm (giây, tính từ lúc áp đòn đầu) của từng đòn trong `n` đòn của một lần dùng chiêu.
 * Có `hitAt` nhiều mốc thì đòn i ở mốc i (thừa thì dồn vào mốc cuối); chỉ một mốc: mọi đòn cùng lúc.
 */
export function hitOffsets(s: SkillDef, n: number): number[] {
  const at = s.hitAt && s.hitAt.length ? s.hitAt : [0];
  const base = at[0];
  return Array.from({ length: n }, (_, i) => Math.max(0, (at[Math.min(i, at.length - 1)] ?? base) - base));
}

/** Đòn thường liên hoàn: chỉ số đòn kế tiếp. Còn trong cửa sổ thì sang đòn sau (quay vòng), hết cửa sổ thì về đòn đầu. */
export function comboNext(def: ComboDef, lastIdx: number, lastAtMs: number, nowMs: number): number {
  if (lastIdx < 0 || nowMs - lastAtMs > def.window * 1000) return 0;
  return (lastIdx + 1) % def.hits.length;
}

/** Cửa sổ cường hóa còn mở không: chiêu mở (`by`) áp lúc `openedAtMs`. */
export function empowerOpen(def: EmpowerDef, openedAtMs: number | undefined, nowMs: number): boolean {
  return openedAtMs !== undefined && nowMs >= openedAtMs && nowMs - openedAtMs <= def.window * 1000;
}

/** Hướng lướt (vector đơn vị trên mặt phẳng XZ) theo kiểu `dir`; null nếu không xác định được. */
export function dashDir(def: DashDef, yaw: number, toTarget: { dx: number; dz: number } | null): { x: number; z: number } | null {
  let x = Math.sin(yaw);
  let z = Math.cos(yaw);
  if (def.dir === 'target') {
    if (!toTarget) return { x, z };
    const l = Math.hypot(toTarget.dx, toTarget.dz);
    if (l < 1e-6) return { x, z };
    x = toTarget.dx / l;
    z = toTarget.dz / l;
  } else if (def.dir === 'back') {
    x = -x;
    z = -z;
  }
  return { x, z };
}

export interface DashPlan {
  /** Điểm đến (đã dừng trước vật cản, vách, hay mục tiêu). */
  x: number;
  z: number;
  /** Quãng đã đi (m). */
  dist: number;
  /** true nếu dừng sớm hơn dự định (vật cản, dốc đứng, mép bản đồ, mục tiêu). */
  blocked: boolean;
}

/**
 * Lập đường lướt bằng chính `stepMove` (cùng va chạm kiến trúc, mép bản đồ, mặt đất như đi bộ) với bước nhỏ.
 * Không xuyên vách: bước nào bị đẩy lùi quá nửa quãng dự định thì dừng ở bước trước; đất dốc hơn `DASH_MAX_SLOPE` coi là vách.
 * `stopAt`: dừng trước mục tiêu (khoảng `r` m tính từ tâm).
 */
export function planDash(start: MoveState, dir: { x: number; z: number }, dist: number, stopAt?: { x: number; z: number; r: number }): DashPlan {
  const s = cloneMoveState(start);
  s.grounded = true;
  s.flying = false;
  s.vy = 0;
  const yaw = Math.atan2(-dir.x, -dir.z);
  const inp: MoveInput = { s: 0, mx: 0, mz: 1, yaw, f: 0 };
  const ctx: MoveCtx = { canFly: false, frozen: false, speedMul: DASH_SPEED / 7 };
  const want = DASH_SPEED * DASH_STEP;
  let moved = 0;
  let blocked = false;
  while (moved < dist - 1e-6) {
    const px = s.x;
    const pz = s.z;
    const py = s.y;
    // Bước cuối ngắn lại để không vượt quãng.
    const dt = Math.min(DASH_STEP, (dist - moved) / DASH_SPEED);
    stepMove(s, inp, ctx, dt);
    const adv = (s.x - px) * dir.x + (s.z - pz) * dir.z;
    const run = Math.hypot(s.x - px, s.z - pz);
    if (adv < want * (dt / DASH_STEP) * 0.5 || run < want * (dt / DASH_STEP) * 0.5) {
      s.x = px;
      s.z = pz;
      s.y = py;
      blocked = true;
      break;
    }
    // Dốc theo mặt đất (không theo s.y: bước hụt khỏi vách thì s.y rơi chậm): lên hay xuống vách đứng đều dừng.
    if (Math.abs(groundAt(s.x, s.z) - groundAt(px, pz)) > DASH_MAX_SLOPE * run) {
      s.x = px;
      s.z = pz;
      s.y = py;
      blocked = true;
      break;
    }
    if (stopAt && Math.hypot(stopAt.x - s.x, stopAt.z - s.z) <= stopAt.r) {
      blocked = true;
      moved += run;
      break;
    }
    moved += run;
  }
  return { x: s.x, z: s.z, dist: Math.min(moved, dist), blocked };
}

/**
 * Kiểm quy tắc thời gian của một chiêu so với pose của nó. Trả về danh sách lỗi (rỗng = hợp lệ).
 * - `hitAt`: có, tăng dần, mốc đầu trùng `hit[0]` của pose (±0,03 s) để hình và sát thương cùng nhịp.
 * - `windup` ≤ `hitAt[0]`; `hitAt` cuối + `recovery` ≈ độ dài pose (±0,06 s) và không quá GCD (chiêu ngay).
 * - `castType` khớp `cast`; `channel`/`charge` chưa có chiêu nào dùng (server chưa hỗ trợ).
 */
export function validateSkillRules(s: SkillDef, pose: PoseDef | undefined, ids: ReadonlySet<string>): string[] {
  const at = `skill ${s.id}`;
  const errs: string[] = [];
  const ct = castTypeOf(s);
  if (ct === 'channel' || ct === 'charge') errs.push(`${at}: castType ${ct} chưa được server hỗ trợ`);
  if (ct === 'cast' && !(s.cast > 0)) errs.push(`${at}: castType cast cần cast > 0`);
  if (ct === 'instant' && s.cast > 0) errs.push(`${at}: castType instant nhưng cast = ${s.cast}`);
  if (s.moveWhileCast && ct !== 'cast') errs.push(`${at}: moveWhileCast chỉ dùng với castType cast`);
  if (s.moveWhileCast) errs.push(`${at}: moveWhileCast chưa được server hỗ trợ`);
  if (s.hitAt && s.hitAt.some((h) => !(h >= 0 && h <= GCD))) errs.push(`${at}: hitAt phải trong 0–GCD (${GCD}s)`);
  if (ct === 'cast' && (s.combo || s.empower)) errs.push(`${at}: chiêu niệm chưa hỗ trợ combo/empower`);
  if (s.combo && !(s.power > 0)) errs.push(`${at}: combo cần power > 0`);
  if (s.pose) {
    const hit = s.hitAt;
    if (!hit || !hit.length) errs.push(`${at}: thiếu hitAt`);
    else {
      for (let i = 0; i < hit.length; i++) {
        if (!(hit[i] >= 0) || (i > 0 && hit[i] < hit[i - 1])) errs.push(`${at}: hitAt phải không âm và tăng dần`);
      }
      if (pose?.hit && Math.abs(hit[0] - pose.hit[0]) > 0.03) errs.push(`${at}: hitAt[0] = ${hit[0]} lệch hit[0] = ${pose.hit[0]} của pose ${pose.id} (hình và sát thương phải cùng nhịp)`);
      if (s.windup !== undefined && s.windup > hit[0] + 1e-6) errs.push(`${at}: windup ${s.windup} lớn hơn hitAt[0] ${hit[0]}`);
      if (s.recovery !== undefined && pose) {
        const end = hit[hit.length - 1] + s.recovery;
        if (Math.abs(end - pose.duration) > 0.06) errs.push(`${at}: hitAt cuối + recovery = ${end.toFixed(2)} lệch độ dài pose ${pose.duration}`);
        if (ct === 'instant' && end > GCD + 1e-6) errs.push(`${at}: hitAt cuối + recovery = ${end.toFixed(2)} quá GCD ${GCD}`);
      }
    }
  }
  if (s.cancel && !(s.cancel.move >= 0 && s.cancel.dash >= 0)) errs.push(`${at}: cancel.move/dash phải không âm`);
  if (s.combo) {
    if (!s.combo.hits.length || s.combo.hits.length > 5) errs.push(`${at}: combo cần 1–5 đòn`);
    if (!(s.combo.window > 0 && s.combo.window <= 5)) errs.push(`${at}: combo.window 0–5 giây`);
    for (const [i, h] of s.combo.hits.entries()) {
      if (!(h.power > 0)) errs.push(`${at}: combo.hits[${i}].power phải > 0`);
      if (!(h.hitAt >= 0 && h.hitAt <= GCD)) errs.push(`${at}: combo.hits[${i}].hitAt ngoài 0–GCD`);
    }
  }
  if (s.empower) {
    if (!ids.has(s.empower.by)) errs.push(`${at}: empower.by "${s.empower.by}" không phải chiêu`);
    if (s.empower.by === s.id) errs.push(`${at}: empower.by không được là chính nó`);
    if (!(s.empower.window > 0 && s.empower.window <= 10)) errs.push(`${at}: empower.window 0–10 giây`);
    if (!(s.empower.powerMul >= 1 && s.empower.powerMul <= 3)) errs.push(`${at}: empower.powerMul 1–3`);
  }
  if (s.dash) {
    if (!(s.dash.dist > 0 && s.dash.dist <= 12)) errs.push(`${at}: dash.dist 0–12 m`);
    if (!(s.cd >= 8)) errs.push(`${at}: chiêu lướt cần hồi chiêu ≥ 8 giây`);
    if (s.kind !== 'dash') errs.push(`${at}: dash chỉ dùng với kind 'dash'`);
  } else if (s.kind === 'dash') errs.push(`${at}: kind dash cần trường dash`);
  return errs;
}

// ---------- hình học chiêu bậc 2–3 (E2-G) ----------

/** Điểm (x, z) có nằm trong vệt chữ nhật dài `len`, rộng `width` xuất phát từ (ox, oz) theo hướng đơn vị (dx, dz) không? Tính cả `pad` (bán kính thân quái). */
export function inLine(ox: number, oz: number, dx: number, dz: number, len: number, width: number, x: number, z: number, pad = 0): boolean {
  const rx = x - ox;
  const rz = z - oz;
  const along = rx * dx + rz * dz;
  const side = Math.abs(rx * dz - rz * dx);
  return along >= -pad && along <= len + pad && side <= width / 2 + pad;
}

/** Khoảng cách từ điểm (x, z) tới đoạn thẳng (ax, az)–(bx, bz). */
export function distToSegment(ax: number, az: number, bx: number, bz: number, x: number, z: number): number {
  const sx = bx - ax;
  const sz = bz - az;
  const l2 = sx * sx + sz * sz;
  const u = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / l2));
  return Math.hypot(x - (ax + sx * u), z - (az + sz * u));
}

/** Chiêu cần chọn mục tiêu (tab-target): đánh đơn, vòng quanh mục tiêu, vệt chém. Vòng quanh mình (`self`) thì không. */
export function needsTarget(s: Pick<SkillDef, 'kind' | 'self'>): boolean {
  return s.kind === 'damage' || s.kind === 'line' || (s.kind === 'aoe' && !s.self);
}

/** Chiêu gây sát thương lên quái: tiêu thụ thế (hộ pháp), tính dấu ấn. */
export function dealsDamage(s: Pick<SkillDef, 'kind'>): boolean {
  return s.kind === 'damage' || s.kind === 'aoe' || s.kind === 'line';
}

/** Quãng lướt tối đa của một chiêu (kiểm tra dữ liệu và biến thức `lenMul`). */
export const DASH_MAX_DIST = 12;
