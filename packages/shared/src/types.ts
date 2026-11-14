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
  gold: [number, number];
  drops: DropDef[];
  boss?: boolean;
  /** Hành vi chiến đấu thêm (bỏ trống = cận chiến thường). */
  ai?: MonsterAi;
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

export interface MonsterAi {
  combo?: MonsterCombo;
  caster?: MonsterCaster;
  chant?: MonsterChant;
  slam?: MonsterSlam;
}

export type SkillKind = 'damage' | 'aoe' | 'heal' | 'shield';

export interface SkillDef {
  id: string;
  kind: SkillKind;
  icon: string;
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
