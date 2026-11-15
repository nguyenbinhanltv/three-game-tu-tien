// Tổ đội và tỉ thí (P3-9): luật thuần, dùng chung server/client/test. Server quyết định mọi thứ.

import type { MethodRole } from './methods';

export const PARTY_MAX = 4;
/** Lời mời tổ đội/tỉ thí hết hạn sau chừng này ms. */
export const INVITE_TTL_MS = 30_000;
/** Mỗi người chỉ được gửi 1 lời mời mỗi chừng này ms; tối đa `INVITE_PER_MIN` lời mời mỗi phút. */
export const INVITE_GAP_MS = 2_000;
export const INVITE_PER_MIN = 8;
/** Một người nhận tối đa chừng này lời mời chờ cùng lúc (chống tràn màn hình). */
export const INVITE_PENDING_MAX = 3;
/** Sau khi bị từ chối/để hết hạn, cùng một cặp phải chờ chừng này ms mới mời lại. */
export const INVITE_PAIR_COOLDOWN_MS = 15_000;
/** Thành viên ngoại tuyến quá chừng này ms thì bị mời khỏi tổ đội. */
export const PARTY_OFFLINE_GRACE_MS = 120_000;

/** Tu vi: trong tầm `XP_NEAR` được hưởng trọn phần, tới `XP_FAR` được nửa phần, xa hơn không được chia. */
export const XP_NEAR = 25;
export const XP_FAR = 45;
/** Người đồng đội ở trong tầm này của người hạ quái thì được tính vào chia tu vi, chia đồ và nhiệm vụ diệt quái. */
export const PARTY_SHARE_RANGE = XP_FAR;
/** Cộng hưởng cần các thành viên đứng trong tầm này của nhau. */
export const RESONANCE_RANGE = 40;
/** Cộng hưởng khi đủ 3 vai trò: tu vi, sát thương gây ra và giảm sát thương nhận. */
export const RESONANCE_XP = 0.05;
export const RESONANCE_DMG = 0.05;
export const RESONANCE_DEF = 0.05;

export type LootMode = 'turn' | 'free';

export const PARTY_ROLES: readonly MethodRole[] = ['dps', 'tank', 'support'];

/** Hệ số tổng phần thưởng tu vi theo số người đang được chia (đông hơn thì tổng nhiều hơn, mỗi người ít hơn). */
export function partyXpPool(n: number): number {
  const k = Math.max(1, Math.min(PARTY_MAX, Math.floor(n)));
  return 1 + 0.2 * (k - 1);
}

/** Trọng số chia tu vi theo khoảng cách tới điểm quái chết (mét). */
export function xpShareWeight(dist: number): number {
  if (!(dist >= 0)) return 0;
  if (dist <= XP_NEAR) return 1;
  if (dist <= XP_FAR) return 0.5;
  return 0;
}

/**
 * Chia `base` tu vi cho các thành viên có trọng số (đã gồm hệ số cảnh giới riêng nếu muốn nhân sau).
 * Người trọng số 0 không được gì. Tổng = base × partyXpPool(số người được chia), mỗi người ít nhất 1 nếu có trọng số.
 * Trả về mảng cùng thứ tự `weights`.
 */
export function splitXp(base: number, weights: number[]): number[] {
  const live = weights.filter((w) => w > 0);
  if (live.length === 0 || !(base > 0)) return weights.map(() => 0);
  const total = live.reduce((a, b) => a + b, 0);
  const pool = base * partyXpPool(live.length);
  return weights.map((w) => (w > 0 ? Math.max(1, Math.round((pool * w) / total)) : 0));
}

/** Cộng hưởng vai trò: đủ cả ba vai trò (Kiếm tu, Hộ pháp, Đan sư). */
export function hasResonance(roles: (MethodRole | '' | undefined)[]): boolean {
  const set = new Set(roles);
  return PARTY_ROLES.every((r) => set.has(r));
}

/**
 * Chia đồ theo lượt: chọn người kế tiếp (vòng tròn) trong `eligible` (chỉ số thành viên được nhận),
 * bắt đầu sau `last`. `eligible` rỗng → -1.
 */
export function nextTurn(size: number, last: number, eligible: (i: number) => boolean): number {
  for (let k = 1; k <= size; k++) {
    const i = (((last + k) % size) + size) % size;
    if (eligible(i)) return i;
  }
  return -1;
}

// ---------- tỉ thí ----------

/** Võ đài: sân tông môn. Cả hai phải đứng trong vòng này khi mời, nhận, và suốt trận. */
export const DUEL_ARENA = { x: 2048, z: 2088, r: 26 } as const;
/** Ra khỏi võ đài quá chừng này mét + quá `DUEL_LEAVE_GRACE_MS` thì xử thua. */
export const DUEL_LEAVE_MARGIN = 6;
export const DUEL_LEAVE_GRACE_MS = 4_000;
export const DUEL_COUNTDOWN_MS = 3_000;
export const DUEL_MAX_MS = 180_000;
/** Cùng một cặp phải nghỉ chừng này giữa hai trận. */
export const DUEL_PAIR_COOLDOWN_MS = 10_000;
/** Chiêu đánh người nhân hệ số này (đấu tập, không cần chết nhanh). */
export const DUEL_DAMAGE_MUL = 0.6;

export function inArena(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - DUEL_ARENA.x, z - DUEL_ARENA.z) <= DUEL_ARENA.r + margin;
}

export type DuelEnd = 'win' | 'yield' | 'leave' | 'timeout' | 'abort';

// ---------- giao thức ----------

/** Client → server (C.PARTY): thao tác tổ đội. `n` = tên đạo hiệu (mời), `id` = id nhân vật (đuổi, nhường trưởng nhóm). */
export type PartyCmd =
  | { a: 'inv'; n: string }
  | { a: 'acc'; id: number }
  | { a: 'dec'; id: number }
  | { a: 'leave' }
  | { a: 'kick'; id: number }
  | { a: 'lead'; id: number }
  | { a: 'loot'; m: LootMode }
  | { a: 'say'; m: string };

/** Client → server (C.DUEL). */
export type DuelCmd = { a: 'inv'; n: string } | { a: 'acc'; id: number } | { a: 'dec'; id: number } | { a: 'yield' };

export interface PartyMember {
  /** id nhân vật (bền qua room). */
  id: number;
  /** sid trong room hiện tại ('' nếu ngoại tuyến), để client nhận ra mình/đồng đội trong state. */
  sid: string;
  name: string;
  lv: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  role: MethodRole | '';
  lead: boolean;
  /** Đang ở room nào ('' = ngoại tuyến). */
  room: string;
  dead: boolean;
}

/** Server → client (S.PARTY): trạng thái tổ đội của mình; `null` khi không có tổ đội. */
export interface PartyMsg {
  members: PartyMember[];
  loot: LootMode;
  /** Cộng hưởng vai trò đang có hiệu lực với mình. */
  res: boolean;
}

/** Server → client (S.INVITE): lời mời đang chờ mình (kind) hoặc đã hết/hủy (gone). */
export interface InviteMsg {
  kind: 'party' | 'duel';
  /** id nhân vật người mời. */
  id: number;
  name: string;
  /** Hết hạn lúc (giờ server, ms). */
  until: number;
  gone?: boolean;
}

/** Server → client (S.DUEL): trạng thái trận tỉ thí của mình. */
export interface DuelMsg {
  phase: 'count' | 'fight' | 'end';
  /** sid đối thủ, tên. */
  foe: string;
  name: string;
  /** Bắt đầu đánh lúc (phase count) hoặc hết hạn trận lúc (phase fight), giờ server ms. */
  at: number;
  /** phase end: mình thắng? và lý do. */
  won?: boolean;
  why?: DuelEnd;
}
