// Giao thức mạng giữa client và server. Tên message ngắn để tiết kiệm băng thông.

import type { ArtifactMsg } from './artifacts';
import { INV_SIZE, type CharView, type Equipment, type InvSlot, type QuestView } from './types';

export const PROTOCOL_VERSION = 1;
export const ROOM_WORLD = 'world';
export const ROOM_DUNGEON = 'dungeon';
/** Room độ kiếp riêng (E1-F): mỗi lần độ kiếp Nguyên Anh / Hóa Thần một room, tổ đội vào cùng. */
export const ROOM_TRIBULATION = 'tribulation';
/** Level của sân độ kiếp (địa hình dùng chung bồn Kiếm Trủng). */
export const TRIB_LEVEL = 'do_kiep';
/** Level gốc: room của nó giữ tên `world` (bot, test, script cũ không đổi); đăng nhập thường vào đây. */
export const HOME_LEVEL = 'van_lam';
/** Bí cảnh Kiếm Trủng giữ tên room `dungeon`. */
const LEGACY_DUNGEON_LEVEL = 'kiem_trung';

/** Tên room thế giới của level: `world` cho Vân Lam, `world-<id>` cho level khác (Colyseus chỉ nhận `[A-Za-z0-9_-]` trong tên room, dấu chấm bị cắt). */
export function worldRoomName(levelId: string): string {
  return levelId === HOME_LEVEL ? ROOM_WORLD : `${ROOM_WORLD}-${levelId}`;
}

/** Tên room bí cảnh của level: `dungeon` cho Kiếm Trủng, `dungeon-<id>` cho bí cảnh khác. */
export function dungeonRoomName(levelId: string): string {
  return levelId === LEGACY_DUNGEON_LEVEL ? ROOM_DUNGEON : `${ROOM_DUNGEON}-${levelId}`;
}

// Cờ trạng thái của người chơi (trường `fl` trong state).
export const PF_FLYING = 1;
export const PF_DEAD = 2;
export const PF_MEDITATING = 4;
export const PF_CASTING = 8;
export const PF_TRIBULATION = 16;
export const PF_SHIELD = 32;
/** Đang tỉ thí (chỉ để hiển thị). */
export const PF_DUEL = 64;
/** Nguyên anh đã xuất khiếu (E3-K): đang thám thính hoặc vừa thoát ra khi tử vong; hiển thị bóng anh. */
export const PF_SOUL = 128;

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
/** Quái mở rộng (E1-E): đang phản đòn (`ce` = lúc hết; `warn` đầu chưa phản, xem `reflectActive`). */
export const MF_REFLECT = 8;
/** Đang lộ yếu điểm: nhận thêm sát thương tới `ce`. */
export const MF_WEAK = 16;
/** Đang chui đất: không bị đánh trúng, client ẩn thân (hiện đốm đất), tới `ce` thì trồi. */
export const MF_BURROW = 32;
/** Các cờ do `monskill` quản (sim giữ nguyên khi đổi cờ chú/choáng). */
export const MF_MX_MASK = MF_REFLECT | MF_WEAK | MF_BURROW;

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
  /** Khảm/tháo/ghép ngọc, tẩy luyện, phân giải ở Thiết lão: `{ npc, op, ..., r }` (xem server/game/upgrade.ts). */
  UPGRADE: 'upg',
  QUEST: 'q',
  TALK: 'talk',
  CHAT: 'chat',
  RESPAWN: 'resp',
  BREAKTHROUGH: 'brk',
  /** Xuất khiếu trong Tam Trọng Kiếp (E3-L, móc tạm cho tới khi E3-K nối phím X thật): không tham số. */
  TRIB_SOUL: 'tsoul',
  MOVE_ITEM: 'mv',
  /** Sắp xếp túi: `{ r }` (xem docs/inventory.md). */
  INV_SORT: 'isort',
  /** Khóa/mở khóa một ô: `{ slot, on }`. */
  INV_LOCK: 'ilock',
  /** Tách chồng: `{ slot, n, to?, r }`. */
  INV_SPLIT: 'isplit',
  PORTAL: 'portal',
  /** Chọn/đổi công pháp: `{ method, npc?, r? }`. */
  METHOD: 'mth',
  /** Nâng cấp chiêu: `{ skill, r }`. */
  SKILL_UP: 'sku',
  /** Chọn biến thức: `{ skill, v: 'a' | 'b' }` (đổi miễn phí khi không giao chiến). */
  SKILL_VAR: 'skv',
  /** Vượt bình cảnh: `{ m: 'trial' | 'pill', r? }` (r = khóa chống trùng khi dùng đan). */
  BOTTLENECK: 'bk',
  /** Đổi linh căn ở NPC: `{ npc, root, r? }`. */
  ROOT: 'root',
  /** Tổ đội (P3-9): `PartyCmd`. */
  PARTY: 'pty',
  /** Tỉ thí 1v1 ở võ đài: `DuelCmd`. */
  DUEL: 'duel',
  /** Kích hoạt pháp bảo phụ đang đeo (P3-8): không tham số. */
  ARTIFACT: 'art',
  /** Dùng Truyền Tống Trận đã mở khóa (M-4): `TeleCmd`. */
  TELE: 'tele',
  /** Đặt/xóa điểm đánh dấu (M-4): `MarkCmd`. */
  MARK: 'mark',
  /** Thần thức (E2-E, phím V): `SpiritCmd`. */
  SPIRIT: 'spi',
  /** Kích hoạt bản mệnh pháp bảo Ngưng Đan Lô (E2-E): không tham số. */
  BONDED: 'bm',
  /** Nguyên anh xuất khiếu/nhập lại (E3-K, phím X): `SoulCmd`. */
  SOUL: 'soul',
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
  BOLT: 'bolt',
  BOLT_END: 'boltx',
  KICK: 'kick',
  TRANSFER: 'xfer',
  /** Trạng thái công pháp của mình (cấp chiêu, biến thức, kiếm ý/thế, vòng sạc). */
  METHOD: 'mth',
  /** Trạng thái tổ đội của mình (`PartyMsg | null`). */
  PARTY: 'pty',
  /** Lời mời tổ đội/tỉ thí đang chờ (`InviteMsg`). */
  INVITE: 'inv',
  /** Trạng thái tỉ thí của mình (`DuelMsg`). */
  DUEL: 'duel',
  /** Truyền Tống Trận của mình: đã mở khóa, đang niệm, hồi chiêu (`TeleMsg`). */
  TELE: 'tele',
  /** Điểm đánh dấu mình và đồng đội đang thấy (`MarkMsg`). */
  MARK: 'mark',
  /** Người đồng hành của nhiệm vụ hộ tống (`EscortMsg`); `st: 0` = đã hết (xong/hủy). */
  ESCORT: 'esc',
  /** Giờ hồi sinh tinh anh và boss của bản đồ (`BossTimerMsg`), gửi lúc vào và mỗi khi một con đổi trạng thái (M-2). */
  BOSS_TIMERS: 'btm',
  /** Trạng thái thần thức của mình (`SpiritStateMsg`). */
  SPIRIT_STATE: 'spis',
  /** Kết quả một lần quét thần thức (`SpiritScanMsg`). */
  SPIRIT_SCAN: 'spic',
  /** Trạng thái nguyên anh của mình (`SoulStateMsg`, E3-K). */
  SOUL_STATE: 'souls',
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

/**
 * Cập nhật túi. `inv` = ảnh đầy đủ (INV_SIZE ô); thiếu thì có `d` = danh sách thay đổi `[ô, món|null]` áp lên ảnh cũ.
 * Dùng `applyInvMsg`. `equip` luôn đầy đủ.
 */
export interface InvMsg {
  inv?: InvSlot[];
  d?: [number, InvSlot][];
  equip: Equipment;
}

/** Áp `InvMsg` lên túi hiện có, trả về mảng mới (không sửa mảng cũ). */
export function applyInvMsg(prev: readonly InvSlot[], m: InvMsg): InvSlot[] {
  if (m.inv) return m.inv;
  const out = prev.slice();
  while (out.length < INV_SIZE) out.push(null);
  for (const [i, it] of m.d ?? []) if (Number.isInteger(i) && i >= 0 && i < INV_SIZE) out[i] = it;
  return out;
}

export interface SkillMsg {
  /** id skill. */
  id: string;
  /** id mục tiêu (quái) nếu cần. */
  t?: string;
}

/** Trạng thái công pháp của riêng người chơi (server gửi khi đổi, tối đa vài lần mỗi giây). Chỉ để hiển thị. */
export interface MethodMsg {
  /** id công pháp; '' = chưa chọn. */
  method: string;
  /** id chiêu → cấp (chỉ chiêu đã nâng trên 1). */
  lv: Record<string, number>;
  /** id chiêu → biến thức đã chọn. */
  vr: Record<string, 'a' | 'b'>;
  /** Kiếm ý hoặc thế (0..5). */
  stacks: number;
  /** Vòng sạc chiêu tối thượng 0..100. */
  charge: number;
  /** Giảm sát thương (Kim Cương Bất Hoại) tới giờ server này (ms); 0 = không. */
  guardUntil: number;
  /** Giờ server lúc gửi (để client bù lệch đồng hồ). */
  now: number;
  /** Pháp bảo phụ đang đeo (P3-8): cấp và linh khí. */
  art?: ArtifactMsg;
  /** Buff đan đang chạy: loại → [mức, giờ server hết hạn (ms)]. */
  buffs?: Record<string, [number, number]>;
}

export interface CdMsg {
  /** id skill → thời điểm server (ms) dùng lại được. */
  cds: Record<string, number>;
  gcd: number;
  now: number;
  /** id chiêu đang được cường hóa → lúc hết hạn (ms, giờ server cùng gốc với `cds`): client sáng viền ô chiêu. */
  em?: Record<string, number>;
}

export interface SysMsg {
  /** i18n key. */
  k: string;
  /** Tham số thay vào chuỗi. */
  p?: Record<string, string | number>;
  /** 'info' | 'good' | 'bad' | 'loot'. */
  t?: string;
  /**
   * Chỉ với `t: 'loot'` từ hạ quái/hái linh thảo (M4-6): id vật phẩm vừa vào túi (không có = vàng).
   * Đồ đã vào túi ở server trước khi gửi; client chỉ vẽ đồ nảy ra rồi bay vào túi. Không mang tỉ lệ rơi.
   */
  i?: string;
  /** Id quái/điểm hái mà đồ nảy ra (client lấy vị trí từ trạng thái room; không có thì bỏ phần 3D). */
  src?: string;
  /** Chỉ với trang bị đã roll: phẩm 0..4 (Phàm..Thiên) để client chọn màu/cột sáng. Không phải tỉ lệ rơi. */
  q?: number;
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
  /** Điểm xuất phát (thuấn di `blink`): chỉ là lớp hình. */
  ox?: number;
  oz?: number;
  /** Thời lượng (giây). */
  d?: number;
  /**
   * Seed hình (uint31) do server sinh cho hiệu ứng có hình ngẫu nhiên (tia sét `thunder`, vị trí kiếm
   * của `rain`, mây xoáy `tribstart`) để mọi client vẽ giống nhau. Chỉ là lớp hình, không mang luật.
   */
  sd?: number;
  /** id chiêu (FX `cast` của người chơi): client chọn đúng động tác cho chiêu đang niệm. Chỉ là lớp hình. */
  s?: string;
  /** Biến thức đã chọn của chiêu (`fx` của `SkillVariant`) và cấp chiêu: client đổi hình dạng hiệu ứng. Chỉ là lớp hình. */
  v?: string;
  lv?: number;
  /** Màu công pháp (hex, không có `#`) của chiêu công pháp; chỉ là lớp hình. */
  c?: string;
  /** Đòn thứ mấy (0-based) của chuỗi đánh thường; đòn cuối đẩy lùi. Chỉ là lớp hình. */
  n?: number;
  /** Kiếp nào (`tribstart`): id trong `tribulations.json`; thiếu = Trúc Cơ. HUD và cảnh điện ảnh đọc pha từ dữ liệu theo id này. */
  tb?: string;
  /** Tiến độ ngưng đan 0..100 (`dantran`, của chủ kiếp); -1 = Đan Trận khép lại. Chỉ là lớp hình, luật ở server. */
  pg?: number;
}

export interface DmgMsg {
  dst: string;
  n: number;
  crit?: boolean;
  heal?: boolean;
  src?: string;
  /** Đòn nặng (chiêu hệ số cao, đòn thứ hai của chuỗi, vùng nổ): client khựng/giật lùi mạnh hơn. Chỉ là lớp hình. */
  hv?: boolean;
  /** Khắc chế ngũ hành (server tính): 1 chiêu khắc hệ quái, -1 bị hệ quái khắc. Chỉ hiển thị. */
  ke?: 1 | -1;
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
  /** Chiêu mở rộng sinh ra vạch (E1-E), để client chỉnh động tác/âm: line/charge/leap/burrow/cone (nón trồi lên)/summon (không sát thương). */
  mv?: 'line' | 'charge' | 'leap' | 'burrow' | 'emerge' | 'summon';
  /** Seed hình (uint31) của tia sét khi `kind` là `lightning`: mọi client thấy cùng một tia. */
  sd?: number;
  /** Tia cuối của độ kiếp (khóa mệnh, nổ cực lớn): client rung mạnh hơn. */
  big?: boolean;
  /** Thiên lôi nhuốm lửa (pha lôi hỏa của Đan Hỏa Kiếp): chỉ là lớp màu. */
  hot?: boolean;
}

/**
 * Đạn của quái vừa bắn (D1). Client tự nội suy bằng `boltXZ`/`boltY` trong packages/shared từ (x, z, yaw, v)
 * và thời điểm `t`; server phán định trúng/vỡ và báo bằng `BoltEndMsg`. Hết `life` mà không có tin kết
 * thúc thì client tự tắt đạn. Không mang sát thương.
 */
export interface BoltMsg {
  /** Id đạn trong room (tăng dần). */
  id: number;
  x: number;
  z: number;
  yaw: number;
  /** Tốc độ (m/s). */
  v: number;
  /** Bán kính (m). */
  r: number;
  /** Thời gian sống (giây). */
  life: number;
  /** Giờ server (ms) lúc phát: client bù độ trễ để thấy đạn đúng chỗ server đang tính. */
  t: number;
  kind: HazardKind;
  /** Id quái bắn. */
  src: string;
  /** Seed hình (dao động, hạt đuôi). Chỉ là lớp hình. */
  sd: number;
  /** Độ nâng (m) theo độ cao mục tiêu lúc bắn (`boltLift`); không có = 0. Dùng trong `boltY`. */
  h?: number;
}

/** Đạn kết thúc trước hạn: trúng người (`hit` = sid), chạm vật cản, hay bị hủy (quái chết/bỏ đuổi). */
export interface BoltEndMsg {
  id: number;
  /** Chỗ đạn vỡ. */
  x: number;
  z: number;
  hit?: string;
}

/**
 * Seed hình cho FX/vùng báo trước (uint31, xem `FxMsg.sd`). Server gọi với nguồn ngẫu nhiên riêng
 * (crypto), không dùng chung RNG với luật; client chỉ đọc.
 */
export function fxSeed(rand: () => number = Math.random): number {
  return Math.floor(rand() * 0x7fffffff) >>> 0;
}

export interface TransferMsg {
  /** Tên room cần vào (client `joinOrCreate(room)`); vé một lần đã nằm ở server. */
  room: string;
  /** Level đích (E1-B); thiếu = suy từ `room` như trước. */
  level?: string;
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

/**
 * Giờ hồi sinh của tinh anh và boss (quái đứng lẻ, không thuộc bãi), toàn bản đồ, không phụ thuộc AOI (minimap M-3 đọc).
 * Chỉ có điểm nhà của con quái (nơi nó đứng/ về), không lộ vị trí đang đi của quái nào.
 */
export interface BossTimerMsg {
  /** Giờ server (ms) lúc gửi; client quy đổi `at` sang đồng hồ máy bằng `Date.now() - now`, như `CdMsg`. */
  now: number;
  list: BossTimer[];
}

export interface BossTimer {
  /** id thực thể quái (ổn định qua các lần hồi sinh). */
  id: string;
  /** id định nghĩa quái (`elite_*`, `boss_*`). */
  t: string;
  /** Điểm nhà (m). */
  x: number;
  z: number;
  /** Cấp hiện tại. */
  lv: number;
  /** Giờ server (ms) hồi sinh; 0 = đang sống. */
  at: number;
}
