// Tư thế (VS-2e): một chiêu chuyển người chơi sang tư thế 8–12 giây, đổi vài ô chiêu thành chiêu tư thế. Hàm thuần dùng chung
// server (phán định), client (đổi ô trên thanh chiêu) và content:check. Dữ liệu: `skills[].stance` và `skills[].stanceOf`.

import type { ResourceMods } from './resource';

export interface StanceDef {
  /** Thời gian giữ tư thế (giây). */
  dur: number;
  /** id chiêu nền → id chiêu tư thế thay vào ô đó trong lúc giữ tư thế. */
  swap: Record<string, string>;
  /** Giảm sát thương nhận trong tư thế (0–0,5). */
  reduce?: number;
  /** Luật tài nguyên riêng trong tư thế: không rụng, nhân tích. */
  res?: Pick<ResourceMods, 'noDecay' | 'gainMul'>;
}

export const STANCE_DUR_MIN = 8;
export const STANCE_DUR_MAX = 12;
export const STANCE_SWAP_MIN = 3;
export const STANCE_SWAP_MAX = 4;

/** Tư thế đang giữ: id chiêu tư thế và giờ server (ms) hết hạn. */
export interface StanceState {
  id: string;
  until: number;
}

export function stanceActive(st: StanceState | null | undefined, nowMs: number): st is StanceState {
  return !!st && !!st.id && nowMs < st.until;
}

/** Thanh chiêu sau khi áp tư thế: ô nào có trong `swap` thì thay bằng chiêu tư thế (tra bằng `byId`), ô khác giữ nguyên. */
export function stanceBar<T extends { id: string }>(
  bar: readonly T[],
  def: StanceDef | undefined,
  byId: (id: string) => T | undefined,
): T[] {
  if (!def) return [...bar];
  return bar.map((s) => {
    const to = def.swap[s.id];
    return (to ? byId(to) : undefined) ?? s;
  });
}

/** Gộp luật tài nguyên của nhánh công pháp với luật của tư thế đang giữ. */
export function withStanceRes(base: ResourceMods | undefined, st: StanceDef['res'] | undefined): ResourceMods | undefined {
  if (!st) return base;
  const out: ResourceMods = { ...(base ?? {}) };
  if (st.noDecay) out.noDecay = true;
  if (st.gainMul) out.gainMul = (out.gainMul ?? 1) * st.gainMul;
  return out;
}

interface StanceSkill {
  id: string;
  kind: string;
  method?: string;
  unlock: number;
  cd: number;
  cast: number;
  ult?: boolean;
  stance?: StanceDef;
  stanceOf?: string;
}

/** Kiểm dữ liệu tư thế của toàn bộ chiêu; trả danh sách lỗi (rỗng = hợp lệ). `commonIds`: id các chiêu chung (ô 1–6). */
export function stanceErrors(skills: readonly StanceSkill[], commonIds: ReadonlySet<string>): string[] {
  const errs: string[] = [];
  const byId = new Map(skills.map((s) => [s.id, s]));
  for (const s of skills) {
    const at = `skill ${s.id}`;
    if ((s.kind === 'stance') !== !!s.stance) errs.push(`${at}: kind stance và trường stance phải đi cùng nhau`);
    const st = s.stance;
    if (st) {
      if (!s.method) errs.push(`${at}: chiêu tư thế phải thuộc một công pháp`);
      if (!(st.dur >= STANCE_DUR_MIN && st.dur <= STANCE_DUR_MAX)) errs.push(`${at}: stance.dur ${STANCE_DUR_MIN}–${STANCE_DUR_MAX} giây`);
      if (!(s.cd >= st.dur * 2)) errs.push(`${at}: hồi chiêu phải ít nhất gấp đôi thời gian tư thế`);
      if (s.cast > 0) errs.push(`${at}: chiêu tư thế không niệm`);
      const pairs = Object.entries(st.swap ?? {});
      if (pairs.length < STANCE_SWAP_MIN || pairs.length > STANCE_SWAP_MAX)
        errs.push(`${at}: stance.swap cần ${STANCE_SWAP_MIN}–${STANCE_SWAP_MAX} ô`);
      const targets = new Set<string>();
      for (const [from, to] of pairs) {
        if (!commonIds.has(from)) errs.push(`${at}: stance.swap "${from}" phải là chiêu chung trên thanh chiêu`);
        const tsk = byId.get(to);
        if (!tsk) errs.push(`${at}: stance.swap → "${to}" không phải chiêu`);
        else {
          if (tsk.stanceOf !== s.id) errs.push(`${at}: chiêu ${to} phải khai stanceOf = ${s.id}`);
          if (tsk.method !== s.method) errs.push(`${at}: chiêu ${to} phải cùng công pháp`);
          if (tsk.unlock > s.unlock) errs.push(`${at}: chiêu ${to} mở muộn hơn chiêu tư thế`);
          if (tsk.cast > 0 || tsk.ult || tsk.kind === 'dash' || tsk.kind === 'stance')
            errs.push(`${at}: chiêu ${to} không được là chiêu niệm/tối thượng/lướt/tư thế`);
          if (tsk.cd > st.dur) errs.push(`${at}: chiêu ${to} hồi ${tsk.cd}s dài hơn tư thế`);
        }
        if (targets.has(to)) errs.push(`${at}: chiêu ${to} bị dùng cho hai ô`);
        targets.add(to);
      }
      if (st.reduce !== undefined && !(st.reduce > 0 && st.reduce <= 0.5)) errs.push(`${at}: stance.reduce trong (0; 0,5]`);
      if (st.res?.gainMul !== undefined && !(st.res.gainMul > 1 && st.res.gainMul <= 2))
        errs.push(`${at}: stance.res.gainMul trong (1, 2]`);
    }
    if (s.stanceOf) {
      const owner = byId.get(s.stanceOf);
      if (!owner?.stance) errs.push(`${at}: stanceOf "${s.stanceOf}" không phải chiêu tư thế`);
      else if (!Object.values(owner.stance.swap).includes(s.id)) errs.push(`${at}: không nằm trong stance.swap của ${s.stanceOf}`);
    }
  }
  return errs;
}
