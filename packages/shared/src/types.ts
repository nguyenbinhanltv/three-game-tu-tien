// Kiểu dữ liệu nội dung game và trạng thái nhân vật, dùng chung client/server.

export type ItemKind = 'material' | 'consumable' | 'weapon' | 'robe' | 'accessory';
export type EquipSlot = 'weapon' | 'robe' | 'accessory';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'robe', 'accessory'];

export interface StatBlock {
  atk?: number;
  def?: number;
  hp?: number;
  mp?: number;
}

export interface ItemDef {
  id: string;
  kind: ItemKind;
  /** Số lượng tối đa mỗi ô. Trang bị = 1. */
  stack: number;
  /** Giá mua ở NPC (linh thạch). 0 = không bán. */
  price: number;
  /** Giá bán cho NPC. */
  sell: number;
  /** 0 phàm, 1 lương, 2 thượng, 3 cực phẩm. */
  rarity: number;
  icon: string;
  iconFallback?: string;
  reqLevel?: number;
  stats?: StatBlock;
  use?: { hpPct?: number; mpPct?: number; xp?: number; cd: number };
}

export type MonsterModel = 'wolf' | 'boar' | 'fox' | 'ape' | 'serpent';

export interface DropDef {
  item: string;
  chance: number;
  min: number;
  max: number;
}

/**
 * Bảng rơi của một loài quái. Chỉ server đọc (`@dtl/content/loot`), không bao giờ vào bundle client;
 * người chơi chỉ thấy món đã rơi qua tin nhắn server.
 */
export interface LootDef {
  /** Linh thạch [min, max]. */
  gold: [number, number];
  drops: DropDef[];
}

export interface MonsterDef {
  id: string;
  model: MonsterModel;
  scale: number;
  color: string;
  accent: string;
  hpMul: number;
  atkMul: number;
  speed: number;
  aggro: number;
  attackRange: number;
  attackCd: number;
  xpMul: number;
  boss?: boolean;
  /** Hành vi chiến đấu thêm (bỏ trống = cận chiến thường). */
  ai?: MonsterAi;
  /** Chỉ boss: các pha sau pha đầu, `hp` giảm dần. */
  phases?: MonsterPhase[];
  /** Chỉ boss: thanh phá thế. */
  posture?: MonsterPosture;
}

/** Đòn đôi: sau một đòn cận chiến, có xác suất đánh thêm một đòn nặng sau `delay` giây (né được nếu ra khỏi tầm). */
export interface MonsterCombo {
  chance: number;
  delay: number;
  /** Hệ số sát thương của đòn thứ hai. */
  mul: number;
}

/** Quái đánh xa: đọc chú `cast` giây, rồi thả vùng báo trước nổ sau `delay` giây. */
export interface MonsterCaster {
  /** Tầm bắt đầu niệm (mét). */
  range: number;
  cast: number;
  delay: number;
  /** Hồi chiêu (giây), tính từ lúc niệm xong. */
  cd: number;
  mul: number;
  shape: 'circle' | 'rect' | 'cone';
  /** Bán kính (tròn, quạt) hoặc chiều dài (chữ nhật). */
  r: number;
  /** Chiều rộng (chữ nhật) hoặc nửa góc tính bằng độ (quạt). */
  w?: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
}

/**
 * Boss niệm chú: mỗi `cd` giây đứng yên niệm `cast` giây (mọi người thấy thanh niệm chú), xong thì thả vùng tròn
 * bán kính `r` quanh mình, nổ sau `delay` giây. Đoạn đầu (tỉ lệ `open`) có hộ chú; sau đó trúng chiêu ngắt
 * (`SkillDef.interrupt`) thì chú bị phá, boss choáng `stun` giây và nhận thêm sát thương (`INTERRUPT_VULN_MUL`).
 */
export interface MonsterChant {
  cd: number;
  cast: number;
  open: number;
  r: number;
  delay: number;
  mul: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
  stun: number;
}

/**
 * Boss đập vùng: mỗi `cd` giây thả một vùng tròn bán kính `r` dưới chân tối đa `max` người chơi trong 45 m,
 * nổ sau `delay` giây với hệ số `mul` theo `atk` của boss.
 */
export interface MonsterSlam {
  cd: number;
  r: number;
  delay: number;
  mul: number;
  max: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
}

/**
 * Boss chém một vùng quạt/chữ nhật từ chỗ mình về phía mục tiêu: mỗi `cd` giây (khi mục tiêu trong tầm `r`),
 * boss đứng yên khóa hướng, vùng báo trước hiện ngay và nổ sau `delay` giây. Né bằng cách ra khỏi vùng.
 */
export interface MonsterSweep {
  cd: number;
  shape: 'rect' | 'cone';
  /** Chiều dài (chữ nhật) hoặc bán kính (quạt). */
  r: number;
  /** Chiều rộng (chữ nhật, mét) hoặc nửa góc (quạt, độ). */
  w: number;
  delay: number;
  mul: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
}

export interface MonsterAi {
  combo?: MonsterCombo;
  caster?: MonsterCaster;
  chant?: MonsterChant;
  slam?: MonsterSlam;
  sweep?: MonsterSweep;
}

/**
 * Pha của boss: vào pha khi máu còn ≤ `hp` (tỉ lệ 0–1), không lùi pha trong một trận.
 * `ai` ghi đè từng chiêu của pha trước (chiêu nào không nhắc thì giữ); `null` bỏ chiêu đó.
 * Câu thoại khi vào pha: i18n `mon.<id>.say.<số pha>` (pha đầu là 0, nên pha trong mảng này bắt đầu từ 1).
 */
export interface MonsterPhase {
  hp: number;
  ai?: { [K in keyof MonsterAi]?: MonsterAi[K] | null };
  /** Nhân thời gian giữa hai đòn thường (< 1 = đánh dồn hơn). */
  cdMul?: number;
  /** Nhân tốc độ chạy. */
  speedMul?: number;
}

/**
 * Thanh phá thế của boss (0–1): lấp bằng sát thương (`k` × sát thương / máu tối đa), thêm `heavy` mỗi đòn nặng,
 * thêm `interrupt` khi ngắt chú thành công. Không bị đánh `wait` giây thì giảm `decay` mỗi giây.
 * Đầy thì boss quỵ `brk` giây (như bị ngắt chú: đứng yên, nhận thêm sát thương), thanh về 0.
 */
export interface MonsterPosture {
  k: number;
  heavy: number;
  interrupt: number;
  wait: number;
  decay: number;
  brk: number;
}

export type SkillKind = 'damage' | 'aoe' | 'heal' | 'shield';

export interface SkillDef {
  id: string;
  kind: SkillKind;
  icon: string;
  iconFallback?: string;
  /** Cảnh giới (level) mở khóa. */
  unlock: number;
  range: number;
  /** Thời gian niệm (giây). 0 = tức thì. */
  cast: number;
  cd: number;
  mp: number;
  /** Hệ số sát thương theo công, hoặc % máu hồi/khiên. */
  power: number;
  radius?: number;
  duration?: number;
  fx: string;
  /** Ngắt được chú boss đang niệm (chỉ với kind 'damage'). */
  interrupt?: boolean;
}

export type ObjectiveType = 'kill' | 'gather' | 'craft' | 'level' | 'talk' | 'fly' | 'breakthrough';

export interface ObjectiveDef {
  type: ObjectiveType;
  /** id quái / vật phẩm / npc; với 'level' là số cảnh giới. */
  target?: string;
  count: number;
}

export interface QuestDef {
  id: string;
  giver: string;
  turnin: string;
  requires?: string;
  minLevel?: number;
  objectives: ObjectiveDef[];
  rewards: { xp: number; gold: number; items?: { id: string; n: number }[] };
}

export interface RecipeDef {
  id: string;
  npc: string;
  output: { id: string; n: number };
  inputs: { id: string; n: number }[];
  gold: number;
}

export interface NpcDef {
  id: string;
  x: number;
  z: number;
  yaw: number;
  color: string;
  sells?: string[];
  recipes?: boolean;
  enhance?: boolean;
}

export interface SpawnDef {
  mon: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  levelMin: number;
  levelMax: number;
  respawn: number;
}

export interface NodeSpawnDef {
  item: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  respawn: number;
}

export interface LevelDef {
  id: string;
  spawns: SpawnDef[];
  nodes: NodeSpawnDef[];
}

export interface RealmDef {
  level: number;
  key: string;
}

// ---- Trạng thái nhân vật gửi riêng cho chủ nhân ----

export interface InvItem {
  id: string;
  n: number;
  plus?: number;
}
export type InvSlot = InvItem | null;
export const INV_SIZE = 30;

export type Equipment = Partial<Record<EquipSlot, InvItem>>;

export interface CharView {
  name: string;
  level: number;
  xp: number;
  xpNeed: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  atk: number;
  def: number;
  gold: number;
}

export interface QuestView {
  /** id nhiệm vụ đang làm → tiến độ từng mục tiêu. */
  active: Record<string, number[]>;
  done: string[];
}
