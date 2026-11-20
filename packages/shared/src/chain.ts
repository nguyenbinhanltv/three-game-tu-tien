// Chuỗi chiêu (VS-2b): đồ thị khai báo trong JSON. Chiêu có `chain.after` được thưởng nếu dùng trong `window` giây
// sau khi một chiêu trong `after` áp xong. Hàm thuần dùng chung server (phán định), client (tooltip) và content:check.
// Thay cơ chế `empower` của K-2 (một chiêu mở, chỉ nhân sức mạnh).

import type { ChainDef, SkillDef } from './types';

/** Thưởng của một lần dùng chiêu trong chuỗi (mọi hệ số 1 = không có chuỗi). */
export interface ChainBonus {
  powerMul: number;
  mpMul: number;
  cdMul: number;
}

export const NO_CHAIN: ChainBonus = Object.freeze({ powerMul: 1, mpMul: 1, cdMul: 1 });

/** Giới hạn dữ liệu. */
export const CHAIN_WINDOW_MAX = 10;
export const CHAIN_AFTER_MAX = 4;
export const CHAIN_DEPTH_MAX = 4;

/**
 * Hạn cửa sổ chuỗi (ms, cùng gốc với `nowMs`), 0 nếu đang đóng. `openedAt(id)`: lúc chiêu `id` áp xong gần nhất
 * (undefined = chưa dùng hoặc đã bị một chiêu chuỗi tiêu).
 */
export function chainDeadline(def: ChainDef, openedAt: (id: string) => number | undefined, nowMs: number): number {
  let best = 0;
  for (const id of def.after) {
    const t = openedAt(id);
    if (t === undefined || nowMs < t) continue;
    const end = t + def.window * 1000;
    if (nowMs <= end && end > best) best = end;
  }
  return best;
}

export function chainBonus(def: ChainDef): ChainBonus {
  return { powerMul: def.powerMul ?? 1, mpMul: def.mpMul ?? 1, cdMul: def.cdMul ?? 1 };
}

/** Linh lực phải trả cho chiêu khi áp thưởng chuỗi (làm tròn lên, không âm). */
export function chainMp(mp: number, bonus: ChainBonus): number {
  return Math.max(0, Math.ceil(mp * bonus.mpMul));
}

/** Số bậc dài nhất của một đường chuỗi kết thúc ở `id` (chiêu không có `chain` = 0). Đồ thị có vòng trả Infinity. */
export function chainDepth(id: string, byId: ReadonlyMap<string, Pick<SkillDef, 'chain'>>, seen: ReadonlySet<string> = new Set()): number {
  const ch = byId.get(id)?.chain;
  if (!ch) return 0;
  if (seen.has(id)) return Infinity;
  const next = new Set(seen).add(id);
  let best = 0;
  for (const a of ch.after) best = Math.max(best, chainDepth(a, byId, next));
  return best + 1;
}

/**
 * Kiểm đồ thị chuỗi của toàn bộ chiêu; trả danh sách lỗi (rỗng = hợp lệ).
 * - `after`: 1–4 id chiêu có thật, không trùng, không trỏ chính nó; chiêu công pháp chỉ nối sau chiêu cùng công pháp hoặc chiêu chung.
 * - `window` trong (0, 10]; `powerMul` 1–3; `mpMul` và `cdMul` trong [0,3; 1]; phải có ít nhất một thưởng.
 * - Chiêu niệm không vào chuỗi; chiêu lướt chỉ nhận `powerMul` (lướt không đi qua bước trừ linh lực/hồi chiêu của chiêu thường).
 * - Không có vòng, đường dài nhất không quá `CHAIN_DEPTH_MAX` bậc.
 */
export function chainErrors(skills: readonly SkillDef[]): string[] {
  const errs: string[] = [];
  const byId = new Map(skills.map((s) => [s.id, s]));
  for (const s of skills) {
    const ch = s.chain;
    if (!ch) continue;
    const at = `skill ${s.id}`;
    if (!Array.isArray(ch.after) || ch.after.length < 1 || ch.after.length > CHAIN_AFTER_MAX) {
      errs.push(`${at}: chain.after cần 1–${CHAIN_AFTER_MAX} chiêu`);
      continue;
    }
    if (new Set(ch.after).size !== ch.after.length) errs.push(`${at}: chain.after có id trùng`);
    for (const a of ch.after) {
      const o = byId.get(a);
      if (!o) errs.push(`${at}: chain.after "${a}" không phải chiêu`);
      else if (a === s.id) errs.push(`${at}: chain.after không được là chính nó`);
      else if (s.method && o.method && o.method !== s.method) errs.push(`${at}: chain.after "${a}" thuộc công pháp khác`);
    }
    if (!(ch.window > 0 && ch.window <= CHAIN_WINDOW_MAX)) errs.push(`${at}: chain.window 0–${CHAIN_WINDOW_MAX} giây`);
    if (ch.powerMul !== undefined && !(ch.powerMul > 1 && ch.powerMul <= 3)) errs.push(`${at}: chain.powerMul trong (1, 3]`);
    if (ch.mpMul !== undefined && !(ch.mpMul >= 0.3 && ch.mpMul < 1)) errs.push(`${at}: chain.mpMul trong [0,3; 1)`);
    if (ch.cdMul !== undefined && !(ch.cdMul >= 0.3 && ch.cdMul < 1)) errs.push(`${at}: chain.cdMul trong [0,3; 1)`);
    if (ch.powerMul === undefined && ch.mpMul === undefined && ch.cdMul === undefined) errs.push(`${at}: chain không có thưởng nào`);
    if (s.cast > 0) errs.push(`${at}: chiêu niệm chưa hỗ trợ chain`);
    if (s.ult) errs.push(`${at}: chiêu tối thượng không vào chuỗi`);
    if (s.kind === 'dash' && (ch.mpMul !== undefined || ch.cdMul !== undefined)) errs.push(`${at}: chiêu lướt chỉ nhận chain.powerMul`);
    if (ch.powerMul !== undefined && !(s.power > 0)) errs.push(`${at}: chain.powerMul cần power > 0`);
    if (ch.mpMul !== undefined && !(s.mp > 0)) errs.push(`${at}: chain.mpMul cần mp > 0`);
    if (ch.cdMul !== undefined && !(s.cd > 0)) errs.push(`${at}: chain.cdMul cần cd > 0`);
    const depth = chainDepth(s.id, byId);
    if (depth === Infinity) errs.push(`${at}: chuỗi có vòng`);
    else if (depth > CHAIN_DEPTH_MAX) errs.push(`${at}: chuỗi dài ${depth} bậc, tối đa ${CHAIN_DEPTH_MAX}`);
  }
  return errs;
}
