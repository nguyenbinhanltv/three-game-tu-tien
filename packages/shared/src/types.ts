// Kiểu dữ liệu nội dung game và trạng thái nhân vật, dùng chung client/server.

import type { ItemInst } from './items';

/**
 * Tám ô trang bị (Phase 3-1): pháp kiếm, đạo bào, hộ uyển, vân ngoa, đai lưng, ngọc bội, giới chỉ, pháp bảo phụ.
 * Loại vật phẩm trang bị trùng tên ô (`ItemKind` ⊃ `EquipSlot`).
 */
export type EquipSlot = 'weapon' | 'robe' | 'bracer' | 'boots' | 'belt' | 'jade' | 'ring' | 'artifact';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'robe', 'bracer', 'boots', 'belt', 'jade', 'ring', 'artifact'];
export type ItemKind = 'material' | 'consumable' | EquipSlot;

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
  /** id bộ trang bị (P3-4): món này thuộc bộ nào. Món có `set` không rơi theo bảng chung, chỉ chế tạo hoặc rơi theo `EquipRollDef.set`. */
  set?: string;
  use?: { hpPct?: number; mpPct?: number; xp?: number; cd: number; /** Đan tăng sức (P3-8): buff tạm thời. */ buff?: { kind: 'atk' | 'def' | 'crit'; pct: number; sec: number } };
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
  /** Nguồn rơi trang bị (Phase 3-2): `common` quái thường, `elite` tinh anh, `dungeon` bí cảnh, `boss`. */
  src?: 'common' | 'elite' | 'dungeon' | 'boss';
  /** Các lần roll trang bị đã roll dòng chính/phụ khi quái chết (chỉ server đọc, xem `rollEquipDrops`). */
  equip?: EquipRollDef[];
}

/** Một lần roll trang bị: xác suất, trọng số 5 phẩm (Phàm..Thiên), trọng số ô (bỏ trống = đều các ô có chỉ số). */
export interface EquipRollDef {
  chance: number;
  q: number[];
  slots?: Partial<Record<EquipSlot, number>>;
  /** Cộng vào cấp quái để ra ilvl (Địa/Thiên của bí cảnh, boss). */
  ilvlBonus?: number;
  /** Rơi một món của bộ này (chọn đều trong các món của bộ; bỏ qua `slots`). */
  set?: string;
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
  /** Tinh anh: có tên riêng, máu gấp bốn quái thường cùng loài, một kỹ năng riêng, rơi Huyền phẩm. */
  elite?: boolean;
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

/**
 * Quái đánh xa: đọc chú `cast` giây, rồi thả vùng báo trước nổ sau `delay` giây, hoặc với `shape: 'bolt'`
 * bắn `n` viên đạn bay chậm (`speed` m/s, bán kính `r`) nhắm vào chỗ mục tiêu đang đứng lúc bắn; đạn bay
 * tối đa `range` × 1,6 mét. Né bằng cách bước ngang ra khỏi đường bay (`delay` bỏ qua với đạn).
 */
export interface MonsterCaster {
  /** Tầm bắt đầu niệm (mét). */
  range: number;
  cast: number;
  delay: number;
  /** Hồi chiêu (giây), tính từ lúc niệm xong. */
  cd: number;
  mul: number;
  shape: 'circle' | 'rect' | 'cone' | 'bolt';
  /** Bán kính (tròn, quạt, đạn) hoặc chiều dài (chữ nhật). */
  r: number;
  /** Chiều rộng (chữ nhật) hoặc nửa góc tính bằng độ (quạt). */
  w?: number;
  /** Đạn: tốc độ bay (m/s). */
  speed?: number;
  /** Đạn: số viên mỗi loạt (mặc định 1). */
  n?: number;
  /** Đạn: tổng góc tỏa của loạt (độ). */
  spread?: number;
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

/**
 * damage/aoe/heal/shield: 6 chiêu chung. Chiêu công pháp (Phase 3-5) thêm: `taunt` (khiêu khích quanh mình),
 * `guard` (giảm sát thương nhận), `hot` (hồi vùng theo thời gian), `revive` (hồi sinh đồng đội gần).
 */
export type SkillKind = 'damage' | 'aoe' | 'heal' | 'shield' | 'taunt' | 'guard' | 'hot' | 'revive' | 'dash';

/** Kiểu thi triển (K-2). `channel`/`charge` đã khai báo nhưng server chưa hỗ trợ (check chặn). */
export type CastType = 'instant' | 'cast' | 'channel' | 'charge';

/** Lướt (K-2): quãng, hướng (tới mục tiêu / theo hướng nhìn / ra sau). Server lập đường bằng stepMove, không xuyên vách. */
export interface DashDef {
  dist: number;
  dir: 'target' | 'forward' | 'back';
  /** Dừng cách tâm mục tiêu chừng này mét (chỉ dir 'target'). */
  stop?: number;
}

/** Một đòn của chuỗi đánh thường: hệ số, lúc áp (giây từ lúc bấm), đòn đẩy lùi (chỉ hiển thị). */
export interface ComboHit {
  power: number;
  hitAt: number;
  kb?: boolean;
}

/** Chuỗi đòn thường liên hoàn: bấm tiếp trong `window` giây thì sang đòn sau, hết chuỗi thì về đòn đầu. */
export interface ComboDef {
  window: number;
  hits: ComboHit[];
}

/** Cường hóa: sau khi chiêu `by` áp trúng, trong `window` giây chiêu này mạnh `powerMul` lần (một lần dùng, rồi tắt). */
export interface EmpowerDef {
  by: string;
  window: number;
  powerMul: number;
}

/** Cửa sổ hủy (giây từ lúc bấm): từ mốc đó, di chuyển / lướt được phép hủy phần thu về. Client dùng để cắt hình; server chỉ nhận lướt sau `dash`. */
export interface CancelDef {
  move: number;
  dash: number;
}

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
  /**
   * Động tác của người ra chiêu (id trong `packages/content/data/poses`, client nướng thành clip). Một lần,
   * dài không quá GCD; `hit[0]` của pose là lúc ra đòn, khớp với lúc hiệu ứng `fx` phóng đi.
   */
  pose?: string;
  /** Ngắt được chú boss đang niệm (chỉ với kind 'damage'). */
  interrupt?: boolean;
  /** Chỉ người theo công pháp này mới dùng được (chiêu đặc trưng/tối thượng). Chiêu chung không có trường này. */
  method?: string;
  /** Chiêu tối thượng: cần vòng sạc đầy (không dùng linh lực/hồi chiêu để giới hạn). */
  ult?: boolean;
  /** Đánh dấu mục tiêu: trong `dur` giây, sát thương của người đánh dấu lên nó nhân thêm `mul`. */
  mark?: { dur: number; mul: number };
  /** `guard`: tỉ lệ sát thương được giảm. `taunt`: bán kính nằm ở `radius`, thời gian ở `duration`. */
  reduce?: number;
  /** `hot`: tổng lượng hồi (theo % máu tối đa) chia đều trong `duration`; `healAllies` bán kính hồi cho đồng đội. */
  allyRadius?: number;
  /** Tên hiệu ứng nâng cấp riêng (client). */
  tint?: string;
  /** Hệ ngũ hành của chiêu (kim/moc/thuy/hoa/tho): linh căn và dòng phụ `elem_dmg` cộng sát thương theo hệ này. */
  elem?: string;
  /** Kiểu thi triển; mặc định suy từ `cast` (xem `castTypeOf`). */
  castType?: CastType;
  /** Thời gian vào thế trước nhát vung (giây), ≤ `hitAt[0]`. */
  windup?: number;
  /**
   * Các mốc áp sát thương/hiệu quả, giây từ lúc bấm (chiêu không niệm; chiêu niệm áp lúc hết niệm, động tác xếp lịch
   * trùng lúc đó). Mốc đầu trùng `hit[0]` của pose. Server áp tại mốc, hủy nếu mục tiêu chết/ra tầm.
   */
  hitAt?: number[];
  /** Thu về sau mốc cuối (giây): `hitAt` cuối + `recovery` ≈ độ dài pose. */
  recovery?: number;
  /** Cho đi lại trong lúc niệm (chưa hỗ trợ). */
  moveWhileCast?: boolean;
  cancel?: CancelDef;
  /** Chuỗi đánh thường liên hoàn (chiêu ô 1). */
  combo?: ComboDef;
  /** Cửa sổ cường hóa sau khi chiêu khác áp trúng. */
  empower?: EmpowerDef;
  /** Chiêu lướt (kind 'dash'). */
  dash?: DashDef;
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
  /** Đan có phẩm chất (P3-8): server roll Hạ/Trung/Thượng khi luyện. */
  quality?: boolean;
  /** Cảnh giới tối thiểu để luyện/chế (pháp bảo). */
  reqLevel?: number;
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
  /** Đổi linh căn ở NPC này (tốn linh thạch, `rootChangeCost`). */
  rootChange?: boolean;
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

/** Điểm đặt tên cho kiểm thử (`?at=`, `/gm tp <id>`). Chỉ server đọc (`@dtl/content/places`). */
export interface PlaceDef {
  id: string;
  /** Level của room có điểm này (`van_lam` thế giới, `kiem_trung` bí cảnh). */
  level: string;
  x: number;
  z: number;
  note?: string;
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
  /** Chỉ có ở trang bị đã roll (xem `items.ts`). Thiếu = đồ cũ chỉ số cố định theo mẫu. */
  inst?: ItemInst;
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
  /** Linh căn ngũ hành (`RootId`); '' = chưa có (không xảy ra sau khi nạp). */
  root: string;
  /** Bình cảnh đã vượt cao nhất (0, 5, 10, 15). */
  bk: number;
  /** Giây còn lại của thử thách tâm ma đang chạy (0 = không có). */
  trial: number;
  /** Giây còn phải đợi mới thử lại thử thách (0 = thử được). */
  retry: number;
}

export interface QuestView {
  /** id nhiệm vụ đang làm → tiến độ từng mục tiêu. */
  active: Record<string, number[]>;
  done: string[];
}
