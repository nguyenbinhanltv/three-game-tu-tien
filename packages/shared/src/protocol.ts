// Giao thức mạng giữa client và server. Tên message ngắn để tiết kiệm băng thông.

import type { CharView, Equipment, InvSlot, QuestView } from './types';

export const PROTOCOL_VERSION = 1;
export const ROOM_WORLD = 'world';
export const ROOM_DUNGEON = 'dungeon';

// Cờ trạng thái của người chơi (trường `fl` trong state).
export const PF_FLYING = 1;
export const PF_DEAD = 2;
export const PF_MEDITATING = 4;
export const PF_CASTING = 8;
export const PF_TRIBULATION = 16;
export const PF_SHIELD = 32;

// Trạng thái quái (trường `st`).
export const MS_IDLE = 0;
export const MS_CHASE = 1;
export const MS_ATTACK = 2;
export const MS_RETURN = 3;
export const MS_DEAD = 4;

// Cờ quái (trường `mf`). `ce` là thời điểm server (ms) kết thúc trạng thái đang bật.
/** Boss đang niệm chú (thanh niệm chú hiện cho mọi người). */
export const MF_CHANT = 1;
/** Bị ngắt chú: choáng, nhận thêm sát thương. */
export const MF_STUN = 2;
/** Đi cùng MF_STUN khi boss quỵ vì đầy thanh phá thế (thời lượng theo `posture.brk` thay vì `chant.stun`). */
export const MF_BROKEN = 4;

/** Client → server. */
export const C = {
  INPUT: 'in',
  SKILL: 'sk',
  MEDITATE: 'med',
  GATHER: 'gat',
  USE: 'use',
  EQUIP: 'eq',
  UNEQUIP: 'uneq',
  BUY: 'buy',
  SELL: 'sell',
  CRAFT: 'craft',
  ENHANCE: 'enh',
  QUEST: 'q',
  TALK: 'talk',
  CHAT: 'chat',
  RESPAWN: 'resp',
  BREAKTHROUGH: 'brk',
  MOVE_ITEM: 'mv',
  PORTAL: 'portal',
} as const;

/** Server → client. */
export const S = {
  INIT: 'init',
  CHAR: 'char',
  INV: 'inv',
  QUESTS: 'quests',
  CD: 'cd',
  SYS: 'sys',
  FX: 'fx',
  DMG: 'dmg',
  CHAT: 'chat',
  HAZARD: 'haz',
  KICK: 'kick',
  TRANSFER: 'xfer',
} as const;

export interface InitMsg {
  sid: string;
  protocol: number;
  room: string;
  char: CharView;
  inv: InvSlot[];
  equip: Equipment;
  quests: QuestView;
  serverTime: number;
  dev: boolean;
  /** Mã phiên do server cấp, dùng để vào room khác hoặc vào lại mà không cần đăng nhập lại. */
  session: string;
}

export interface InvMsg {
  inv: InvSlot[];
  equip: Equipment;
}

export interface SkillMsg {
  /** id skill. */
  id: string;
  /** id mục tiêu (quái) nếu cần. */
  t?: string;
}

export interface CdMsg {
  /** id skill → thời điểm server (ms) dùng lại được. */
  cds: Record<string, number>;
  gcd: number;
  now: number;
}

export interface SysMsg {
  /** i18n key. */
  k: string;
  /** Tham số thay vào chuỗi. */
  p?: Record<string, string | number>;
  /** 'info' | 'good' | 'bad' | 'loot'. */
  t?: string;
}

export interface FxMsg {
  /** Loại hiệu ứng. */
  t: string;
  /** id nguồn (sid người chơi hoặc id quái). */
  src?: string;
  dst?: string;
  x?: number;
  y?: number;
  z?: number;
  r?: number;
  /** Thời lượng (giây). */
  d?: number;
}

export interface DmgMsg {
  dst: string;
  n: number;
  crit?: boolean;
  heal?: boolean;
  src?: string;
  /** Đòn nặng (chiêu hệ số cao, đòn thứ hai của chuỗi, vùng nổ): client khựng/giật lùi mạnh hơn. Chỉ là lớp hình. */
  hv?: boolean;
}

export interface ChatMsg {
  from: string;
  c: string;
  m: string;
}

export type HazardKind = 'lightning' | 'frost' | 'fire' | 'spirit';

/**
 * Vùng báo trước. Không có `sh` = hình tròn tâm (x, z) bán kính r (client cũ vẫn vẽ được).
 * `rect`: gốc (x, z), hướng `yaw`, dài r, rộng w. `cone`: gốc (x, z), hướng `yaw`, bán kính r, nửa góc w (radian).
 */
export interface HazardMsg {
  x: number;
  z: number;
  r: number;
  /** Bao lâu nữa thì đánh xuống (giây). */
  delay: number;
  kind: HazardKind;
  /** Ai thả vùng (sid người độ kiếp hoặc id quái); client chỉ dùng để chọn hiệu ứng như rung camera. */
  src?: string;
  sh?: 'rect' | 'cone';
  yaw?: number;
  w?: number;
}

export interface TransferMsg {
  room: string;
  options: Record<string, string>;
}

export const CHAT_MAX_LEN = 160;
export const NAME_MIN = 2;
export const NAME_MAX = 14;

export function validName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
  return /^[\p{L}\p{N} _-]+$/u.test(n);
}
