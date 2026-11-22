// Thực thể trận (TN-8, Cấm chế sư): hằng số và hàm thuần dùng chung server (tính thật) và client/công cụ (kiểm dữ liệu, vẽ).
// Dữ liệu ở packages/content/data/methods.json (`skills[].formation`).
import type { FormationDef, FormationMode, SkillDef } from './types';

/** Số trận tối đa mỗi người cùng lúc: đặt trận thứ tư thì trận cũ nhất tan. */
export const FORMATION_MAX = 3;
/** Khoảng đặt trận `at: 'ahead'` (mét) trước mặt người đặt. */
export const FORMATION_AHEAD = 4;
export const FORMATION_MODES: readonly FormationMode[] = ['sat', 'khon', 'ho', 'sinhtu'];

/** Kiểu trận có sát thương lên quái / có hồi cho đạo hữu / làm chậm. */
export const formationHurts = (m: FormationMode): boolean => m !== 'ho';
export const formationHeals = (m: FormationMode): boolean => m === 'ho' || m === 'sinhtu';
/** Kiểu trận gieo Cấm ấn mỗi nhịp. */
export const formationMarks = (d: Pick<FormationDef, 'mode' | 'mark'>): boolean => d.mode === 'sat' || d.mode === 'sinhtu' || !!d.mark;

/** Điểm đặt trận (mặt phẳng XZ): dưới chân hoặc `FORMATION_AHEAD` mét trước mặt. `yaw` theo quy ước `atan2(dx, dz)` của game. */
export function formationSpot(def: Pick<FormationDef, 'at'>, x: number, z: number, yaw: number): { x: number; z: number } {
  return def.at === 'ahead' ? { x: x + Math.sin(yaw) * FORMATION_AHEAD, z: z + Math.cos(yaw) * FORMATION_AHEAD } : { x, z };
}

/** Một thực thể trận đang sống (trạng thái server, không lưu DB). */
export interface FormationState {
  id: number;
  sid: string;
  skill: string;
  mode: FormationMode;
  x: number;
  z: number;
  r: number;
  armAt: number;
  until: number;
  nextAt: number;
  every: number;
  power: number;
  slow?: number;
  heal?: number;
  mark: boolean;
}

/**
 * Thêm trận mới vào danh sách của mọi người: nếu `sid` đã có `max` trận thì bỏ trận cũ nhất (id nhỏ nhất) trước. Trả danh sách mới
 * (không sửa mảng vào).
 */
export function formationAdd(list: readonly FormationState[], next: FormationState, max = FORMATION_MAX): FormationState[] {
  const mine = list.filter((f) => f.sid === next.sid).sort((a, b) => a.id - b.id);
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - max + 1)).map((f) => f.id));
  return [...list.filter((f) => !drop.has(f.id)), next];
}

/** Quái hay người ở (px, pz) có nằm trong trận không (bán kính tính theo mặt phẳng XZ). */
export function inFormation(f: Pick<FormationState, 'x' | 'z' | 'r'>, px: number, pz: number): boolean {
  const dx = px - f.x;
  const dz = pz - f.z;
  return dx * dx + dz * dz <= f.r * f.r;
}

/** Kiểm dữ liệu một chiêu trận; trả danh sách lỗi (rỗng = hợp lệ). */
export function formationErrors(s: Pick<SkillDef, 'id' | 'kind' | 'formation' | 'self' | 'stance'>): string[] {
  const at = `chiêu ${s.id}`;
  const f = s.formation;
  const errs: string[] = [];
  if ((s.kind === 'formation') !== !!f) return [`${at}: kind formation và trường formation phải đi cùng nhau`];
  if (!f) return errs;
  if (!FORMATION_MODES.includes(f.mode)) errs.push(`${at}: formation.mode lạ`);
  if (f.at !== 'self' && f.at !== 'ahead') errs.push(`${at}: formation.at phải là self hoặc ahead`);
  if (!(f.r >= 2 && f.r <= 12)) errs.push(`${at}: formation.r trong [2; 12] mét`);
  if (!(f.dur >= 2 && f.dur <= 20)) errs.push(`${at}: formation.dur trong [2; 20] giây`);
  if (!(f.every >= 0.5 && f.every <= 5)) errs.push(`${at}: formation.every trong [0,5; 5] giây`);
  if (!(f.arm >= 0 && f.arm <= 3 && f.arm < f.dur)) errs.push(`${at}: formation.arm trong [0; 3] giây và nhỏ hơn dur`);
  if (formationHurts(f.mode) && !(f.power > 0 && f.power <= 2)) errs.push(`${at}: trận ${f.mode} cần power trong (0; 2]`);
  if (f.mode === 'khon' && !(f.slow !== undefined && f.slow > 0 && f.slow < 1)) errs.push(`${at}: trận khon cần slow trong (0; 1)`);
  if (f.mode !== 'khon' && f.slow !== undefined) errs.push(`${at}: chỉ trận khon có slow`);
  if (formationHeals(f.mode) && !(f.heal !== undefined && f.heal > 0 && f.heal <= 0.1))
    errs.push(`${at}: trận ${f.mode} cần heal trong (0; 0,1]`);
  if (!formationHeals(f.mode) && f.heal !== undefined) errs.push(`${at}: chỉ trận ho/sinhtu có heal`);
  if (s.self) errs.push(`${at}: chiêu trận không dùng self (chỗ đặt theo formation.at)`);
  return errs;
}
