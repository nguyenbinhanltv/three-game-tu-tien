// Kiểu dữ liệu nội dung game và trạng thái nhân vật, dùng chung client/server.

import type { ItemInst } from './itemtypes';
import type { SkillRes } from './resource';

/**
 * Tám ô trang bị (Phase 3-1): pháp kiếm, đạo bào, hộ uyển, vân ngoa, đai lưng, ngọc bội, giới chỉ, pháp bảo phụ.
 * Loại vật phẩm trang bị trùng tên ô (`ItemKind` ⊃ `EquipSlot`).
 */
export type EquipSlot = 'weapon' | 'robe' | 'bracer' | 'boots' | 'belt' | 'jade' | 'ring' | 'artifact' | 'head';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'robe', 'bracer', 'boots', 'belt', 'jade', 'ring', 'artifact', 'head'];
/**
 * Ô ngoại hình (ô thứ 10): chỉ đổi hình toàn thân, KHÔNG cộng chỉ số, không cường hóa/khảm/tẩy luyện/phân giải, không tính bộ.
 * Cố ý không nằm trong `EQUIP_SLOTS`: mọi chỗ tính chỉ số và nâng cấp duyệt `EQUIP_SLOTS` nên tự bỏ qua ô này.
 */
export type CosmeticSlot = 'skin';
export const COSMETIC_SLOTS: CosmeticSlot[] = ['skin'];
/** Mọi ô mặc được lên người (có chỉ số + ngoại hình): dùng ở chỗ lưu, đếm vật phẩm, mặc/tháo. */
export type WearSlot = EquipSlot | CosmeticSlot;
export const WEAR_SLOTS: WearSlot[] = [...EQUIP_SLOTS, ...COSMETIC_SLOTS];
export type ItemKind = 'material' | 'consumable' | EquipSlot | CosmeticSlot;

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
  /** id asset model 3D của vũ khí (kind weapon); thiếu thì theo phẩm (`swordModelOf`). */
  model?: string;
  /** Skin (kind skin): mảnh áo phủ toàn thân, client nạp `<skin>_nam|nu` như áo bộ (`OUTFITS`), che hết thân nền. */
  skin?: string;
  /** Giới hạn giới tính nhân vật được mặc ('m' | 'f'); thiếu = ai cũng mặc được. Server kiểm khi mặc (`wearableBy`). */
  gender?: 'm' | 'f';
  reqLevel?: number;
  stats?: StatBlock;
  /** id bộ trang bị (P3-4): món này thuộc bộ nào. Món có `set` không rơi theo bảng chung, chỉ chế tạo hoặc rơi theo `EquipRollDef.set`. */
  set?: string;
  /** Bậc trang bị 1–4 (E2-F); thiếu = bậc 1. Quyết định hệ số dòng chính (`TIER_MUL`) khi roll và khi Thăng Bậc. */
  tier?: number;
  /** Vật phẩm nhiệm vụ (TD-A): `itemCategory` trả 'quest'. */
  quest?: boolean;
  /** Đích Thăng Bậc của món này (cùng ô, bậc kế); thiếu = món thường cùng ô ở bậc kế. */
  promoteTo?: string;
  use?: {
    /** Phá Ấn Phù (E4-C): mở một cửa phong ấn ở Thần Tàng Điện. */ seal?: boolean;
    hpPct?: number;
    mpPct?: number;
    xp?: number;
    cd: number;
    /** Đan tăng sức (P3-8): buff tạm thời. */ buff?: { kind: 'atk' | 'def' | 'crit' | 'ward'; pct: number; sec: number };
  };
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
  /**
   * Bay lơ lửng (E3-B, chỉ hình): độ cao thân so với mặt đất (m). Server vẫn coi quái đứng trên đất (vị trí, tầm đánh,
   * vạch báo đều theo mặt đất); client nâng model lên, hạ xuống khi lộ yếu điểm (`MF_WEAK`) và khi chết.
   */
  hover?: number;
  /** Vũng độc khi chết (E3-G). */
  deathPool?: MonsterDeathPool;
  color: string;
  accent: string;
  hpMul: number;
  atkMul: number;
  speed: number;
  aggro: number;
  attackRange: number;
  attackCd: number;
  xpMul: number;
  /** Hệ ngũ hành của quái (kim/moc/thuy/hoa/tho): chiêu cùng hệ khắc chế được tính ở server (`elemCounter`). */
  elem?: string;
  boss?: boolean;
  /** Tinh anh: có tên riêng, máu gấp bốn quái thường cùng loài, một kỹ năng riêng, rơi Huyền phẩm. */
  elite?: boolean;
  /** Sát thương của quái này là "gương" (E3-M): Định Thần Phù giảm. */
  glass?: boolean;
  /** Cơ chế cung gương của boss (E3-M), xem `MonsterMirror`. */
  mirror?: MonsterMirror;
  /** Cơ chế Thần Tàng Điện của boss (E4-C), xem `MonsterThan`. */
  than?: MonsterThan;
  /** Cơ chế khe mạch của boss Xích Tẫn Khích (DV-3D), xem `MonsterRift`. */
  rift?: MonsterRift;
  /** Cơ chế Kim Dạ Cung (DV-3E), xem `MonsterKimDa`. */
  kd?: MonsterKimDa;
  /** Hành vi chiến đấu thêm (bỏ trống = cận chiến thường). */
  ai?: MonsterAi;
  /** Chỉ boss: các pha sau pha đầu, `hp` giảm dần. */
  phases?: MonsterPhase[];
  /** Chỉ boss: thanh phá thế. */
  posture?: MonsterPosture;
}

/**
 * Cơ chế cung gương (E3-M, Kính Nguyệt Chân Quân). `phase` là số pha (như `say.<n>`: 0 = từ đầu) từ đó cơ chế bật.
 * - `decoys`: `n` bóng giả (`mon`, một đòn là chết) đứng quanh `r` mét; chết thì nổ vòng `boom.r` sau `boom.delay` giây. Mỗi lần vào pha mới dựng lại.
 * - `echo`: sau chiêu của người chơi, bóng thật phản lại đúng chỗ người đó (vòng `r`, báo `delay` giây, `mul` × công); mỗi người `cd` giây một lần.
 * - `disc`: đĩa gương, `beams` tia dài `len` rộng `w` xoay `spin` độ/giây trong `dur` giây (báo `warn` giây đầu, chưa trúng); trúng mỗi 0,5 giây `mul` × công.
 * - `veil`: màn gương vùng `r` mét quanh boss trong `dur` giây: người trong vùng lúc dựng bị Tâm Ma Ảnh của chính mình đuổi; hồi `cd` giây.
 */
export interface MonsterMirror {
  decoys?: { phase: number; mon: string; n: number; r: number; boom: { r: number; delay: number; mul: number } };
  echo?: { phase: number; r: number; delay: number; mul: number; cd: number };
  disc?: { phase: number; beams: number; len: number; w: number; dur: number; warn: number; spin: number; mul: number; cd: number };
  veil?: { phase: number; r: number; dur: number; cd: number; hpMul: number; atkMul: number };
}

/**
 * Cơ chế Thần Tàng Điện (E4-C, Vô Diện Thần Quân). `phase` như `MonsterMirror`.
 * - `hands`: `n` vạch nón (dài `r`, rộng `w` độ) chia đều quanh boss, báo `delay` giây rồi nổ `mul` × công; mỗi lần xoay thêm `turn` độ; hồi `cd` giây.
 * - `elem`: mỗi `cd` giây chọn một hành, đánh vòng `r` m báo `delay` giây; 5 ấn ngũ hành (mỗi ấn bán kính `sealR`, đặt trên vòng bán kính `ring` quanh boss);
 *   đứng trên ấn hành khắc chế hành đánh thì giảm `cut` (cờ `ke`).
 * - `clone`: `n` phân thân (`mon`) quanh `r` m; hạ hết trước `life` giây thì boss mất thế `weak` giây, để sống quá hạn thì hợp lại, boss hồi `heal` × máu tối đa.
 * - `rings`: `n` vòng đá bán kính `r` xoay quanh sàn (quỹ đạo `orbit`, `spin` độ/giây) trong `dur` giây, chạm trúng `mul` × công; sau đó tia **Phản hồi**
 *   (rộng `w`, dài `r`, báo `delay`): nếu cả đội đứng trong `gather` m thì sát thương gấp đôi.
 */
export interface MonsterThan {
  hands?: { phase: number; n: number; r: number; w: number; delay: number; turn: number; cd: number; mul: number };
  elem?: { phase: number; cd: number; r: number; delay: number; mul: number; cut: number; sealR: number; ring: number };
  clone?: { phase: number; mon: string; n: number; r: number; life: number; heal: number; weak: number; cd: number };
  rings?: {
    phase: number;
    n: number;
    r: number;
    orbit: number;
    dur: number;
    spin: number;
    mul: number;
    cd: number;
    final: { delay: number; r: number; w: number; mul: number; gather: number };
  };
}

/**
 * Khe mạch (DV-3D, Tử Quang Dực Chủ). Từ pha `phase` (như `MonsterThan`) trên sàn có các khe mạch ngọc lam `veins` (tâm `x, z`, bán kính `r`).
 * Boss đang niệm chú (`ai.chant`) mà đứng trên một khe thì chú bị phản lại: boss mất thế `weak` giây và mất một tầng "cháy" (tổng `burn` tầng).
 * Hết tầng cháy: boss không chết vì sát thương (sàn 1 máu); chỉ gột hết tầng thì hạ qua đường giết chung (cùng tu vi, rơi đồ, nhiệm vụ).
 */
export interface MonsterRift {
  phase: number;
  veins: { x: number; z: number; r: number }[];
  burn: number;
  weak: number;
}

/**
 * Cơ chế Kim Dạ Cung (DV-3E); các khối độc lập, quái chỉ khai khối mình dùng.
 *  - `mend`: Triền Bố Châm Bà, mỗi `cd` giây hồi `pct` khí huyết tối đa cho đồng loại trong `r` mét (hạ nó hoặc làm nó mất thế để cắt).
 *  - `twin`: tinh anh đôi, một con chết thì con còn lại nổi giận (sát thương ×`mul`, đi nhanh hơn).
 *  - `bargain` (Ma Hậu, từ pha `phase`): mỗi lần niệm chú có thêm một bóng niệm chú ở phía đối diện sảnh (`mon`, cách tâm `sep` mét); chú xong mà bóng còn sống thì cả đội chịu `pen` × khí huyết tối đa (thay Tẫn ấn 5 tầng).
 *  - `night` (Ma Hậu, từ pha `phase`): sàn tối, chỉ vòng quanh các bia `steles` là sáng; ngoài vòng mất `press` × khí huyết tối đa mỗi giây. Boss dập luân phiên từng bia (báo `warn` s, mul, bia tắt `dur` s); bia trống quá `grace` s cũng tắt.
 */
export interface MonsterKimDa {
  mend?: { cd: number; r: number; pct: number };
  twin?: { mul: number };
  bargain?: { phase: number; mon: string; sep: number; pen: number };
  night?: {
    phase: number;
    steles: { x: number; z: number; r: number }[];
    press: number;
    cd: number;
    warn: number;
    mul: number;
    dur: number;
    grace: number;
  };
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
  /** Hút mạch (E2-C, Thôn Mạch): trong lúc niệm boss hồi `drain` (tỉ lệ máu tối đa) mỗi giây; ngắt chú thì ngừng. */
  drain?: number;
  /** Nuốt (E3-G): niệm xong, người đứng trong `pull.range` m (không ngự kiếm) bị kéo về phía boss. */
  pull?: MonsterPull;
}

/**
 * Kéo người chơi (E3-G, Nuốt của Vân Hải Kình Vương): sau khi chú thả, vòng báo bán kính `range` hiện `delay` giây,
 * rồi mọi người đứng trong vòng (trừ người đang ngự kiếm/lơ lửng: kháng) bị server kéo về phía boss trong `dur` giây
 * tới cách tâm boss `stop` m. Kéo theo `planDash` nên không qua vách, không rơi khỏi đảo; vùng nổ của chú nổ sau khi kéo xong.
 */
export interface MonsterPull {
  range: number;
  delay: number;
  dur: number;
  stop: number;
}

/**
 * Vũng độc khi chết (E3-G, Bích Ngọc Kim Thiền): chỗ quái chết hiện vạch báo bán kính `r` trong `delay` giây,
 * rồi vũng độc tồn tại `dur` giây; ai đứng trong vũng chịu `mul` × tấn công quái mỗi `tick` giây, ra khỏi vũng là hết.
 */
/**
 * Vệt để lại trên mặt đất dọc vạch của một đường chém/lao (DV-2 đợt 4: vệt lửa Tẫn Hỏa Kiếm Cơ). Vạch nổ lúc nào thì vệt bắt đầu
 * lúc đó, kéo dài `dur` giây; mỗi `tick` giây ai đứng trong vệt chịu `mul` × sát thương của quái. Vệt là chuỗi vũng tròn bán kính
 * `r` đặt đều dọc vạch (server phán định, client chỉ vẽ).
 */
export interface MonsterTrail {
  dur: number;
  tick: number;
  mul: number;
  r: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
}

export interface MonsterDeathPool {
  r: number;
  delay: number;
  dur: number;
  tick: number;
  mul: number;
  kind: 'lightning' | 'frost' | 'fire' | 'spirit';
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
  /** Nguyên tắc quái mở rộng (E1-E): xem `packages/shared/src/monskill.ts`. Quái thường, tinh anh và boss đều dùng được. */
  line?: MonsterLine;
  charge?: MonsterCharge;
  leap?: MonsterLeap;
  burrow?: MonsterBurrow;
  reflect?: MonsterReflect;
  summon?: MonsterSummon;
  reveal?: MonsterReveal;
  /** Neo (DV-2 đợt 4: gốc khe của Thủ Khích Dực Chủ): đứng trong `r` mét quanh chỗ sinh ra thì hồi `pct` khí huyết tối đa mỗi giây; kéo ra xa thì hết. */
  anchor?: MonsterAnchor;
}

export interface MonsterAnchor {
  r: number;
  pct: number;
}

export type MonsterKind = 'lightning' | 'frost' | 'fire' | 'spirit';

/**
 * Đường thẳng: khi mục tiêu trong `range` mét, quái đứng yên khóa hướng, vạch chữ nhật dài `r` rộng `w` từ chỗ
 * quái hiện ngay và nổ sau `delay` giây (mọi người đứng trong vạch lúc nổ đều trúng). Hồi `cd` giây.
 */
export interface MonsterLine {
  /** Vệt lửa để lại trên đường chém sau khi vạch nổ (DV-2 đợt 4): ai đứng trong vệt chịu sát thương dần. */
  trail?: MonsterTrail;
  cd: number;
  range: number;
  r: number;
  w: number;
  delay: number;
  mul: number;
  kind: MonsterKind;
}

/**
 * Lao tới: mục tiêu cách trong [`min`, `range`] mét thì quái khóa hướng, vạch chữ nhật dài `r` rộng `w` hiện ngay,
 * nổ sau `delay` giây (ai đứng trong vạch lúc đó trúng), rồi quái lao hết đường vạch với tốc độ `speed` m/s
 * (dừng sớm khi gặp vách/nước). Né bằng cách bước ngang ra khỏi vạch.
 */
export interface MonsterCharge {
  /** Vệt để lại dọc đường lao (xem `MonsterTrail`). */
  trail?: MonsterTrail;
  cd: number;
  min: number;
  range: number;
  r: number;
  w: number;
  delay: number;
  mul: number;
  speed: number;
  kind: MonsterKind;
}

/**
 * Nhảy đập: mục tiêu cách trong [`min`, `range`] mét; quái khóa chỗ mục tiêu đang đứng, vạch tròn bán kính `r`
 * hiện tại chỗ đó, sau `delay` giây quái bay tới (0,35 giây cuối) và đập xuống: ai trong vòng lúc đó trúng.
 */
export interface MonsterLeap {
  cd: number;
  min: number;
  range: number;
  r: number;
  delay: number;
  mul: number;
  kind: MonsterKind;
}

/**
 * Chui đất: mục tiêu trong `range` mét thì quái chui xuống `hide` giây (miễn mọi sát thương, không bị chọn trúng),
 * để lại `n` vạch tròn bán kính `r` quanh mục tiêu (cách `spread` mét), nổ cùng lúc quái trồi ở vạch đầu tiên
 * rồi đánh vạch quạt `cone` (dài `cone.r`, nửa góc `cone.w` độ) về phía mục tiêu, báo `cone.delay` giây.
 */
export interface MonsterBurrow {
  cd: number;
  range: number;
  hide: number;
  n: number;
  r: number;
  spread: number;
  mul: number;
  cone: { r: number; w: number; delay: number; mul: number };
  kind: MonsterKind;
}

/**
 * Phản đòn: sau `warn` giây tụ thế (cờ hiện sẵn, chưa phản), trong `dur` giây tiếp theo mỗi đòn người chơi trúng quái
 * bị phản lại `ratio` sát thương (tối đa `cap` × máu tối đa của người đánh mỗi đòn); quái chỉ nhận `take` sát thương.
 * Chất độc/dot không bị phản. Hồi `cd` giây tính từ lúc hết phản.
 */
export interface MonsterReflect {
  cd: number;
  warn: number;
  dur: number;
  ratio: number;
  cap: number;
  take: number;
}

/**
 * Gọi đệ tử: mỗi `cd` giây (đang giao chiến) quái gọi `n` con `mon` ở chỗ cách mình `r` mét, vạch tròn báo trước
 * `delay` giây (không gây sát thương); không vượt `max` con còn sống cùng lúc. Đệ tử cấp bằng quái gọi,
 * không rơi đồ, không cho tu vi, mất khi quái chủ chết hoặc bỏ trận.
 */
export interface MonsterSummon {
  cd: number;
  mon: string;
  n: number;
  max: number;
  r: number;
  delay: number;
}

/**
 * Lộ yếu điểm: mỗi `cd` giây, hoặc ngay sau khi kết thúc chiêu `after` (`charge`/`leap`/`burrow`), quái lộ yếu điểm
 * `dur` giây: sát thương nhận nhân `mul` (> 1) và lấp thêm phá thế `posture` (0–1) nếu có thanh phá thế.
 * Ngoài lúc lộ, sát thương nhận nhân `guard` (mặc định 1, < 1 là có giáp).
 */
export interface MonsterReveal {
  cd: number;
  dur: number;
  mul: number;
  guard?: number;
  after?: 'charge' | 'leap' | 'burrow';
  posture?: number;
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
export type SkillKind = 'damage' | 'aoe' | 'heal' | 'shield' | 'taunt' | 'guard' | 'hot' | 'revive' | 'dash' | 'line' | 'summon' | 'buff';

/** Kiểu thi triển (K-2). `channel`/`charge` đã khai báo nhưng server chưa hỗ trợ (check chặn). */
export type CastType = 'instant' | 'cast' | 'channel' | 'charge';

/** Lướt (K-2): quãng, hướng (tới mục tiêu / theo hướng nhìn / ra sau). Server lập đường bằng stepMove, không xuyên vách. */
export interface DashDef {
  dist: number;
  dir: 'target' | 'forward' | 'back';
  /** Dừng cách tâm mục tiêu chừng này mét (chỉ dir 'target'). */
  stop?: number;
  /** Lướt xuyên: trúng mọi quái trong `r` mét hai bên đường lướt (hệ số `power` mỗi con). */
  pierce?: { r: number };
  /** Lướt rồi đẩy mục tiêu (dương) ra xa hoặc kéo (âm) vào, tính bằng mét. */
  push?: number;
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

/**
 * Chuỗi chiêu (VS-2b, thay `empower` của K-2): dùng chiêu này trong `window` giây sau khi một chiêu trong `after` áp xong
 * thì được thưởng (một lần, rồi cửa sổ đóng). Luật và kiểm dữ liệu ở `chain.ts`.
 */
export interface ChainDef {
  /** id các chiêu mở chuỗi: một trong số này vừa áp xong thì cửa sổ mở. */
  after: string[];
  /** Cửa sổ (giây) tính từ lúc chiêu mở áp xong. */
  window: number;
  /** Thưởng: nhân sức mạnh (sát thương, lượng hồi), nhân linh lực tốn, nhân hồi chiêu. */
  powerMul?: number;
  mpMul?: number;
  cdMul?: number;
  /** Nhãn hình cho client (không mang luật). */
  fx?: string;
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
  /** Chuỗi chiêu: thưởng khi dùng ngay sau một chiêu khác (xem `ChainDef`). */
  chain?: ChainDef;
  /** Chiêu lướt (kind 'dash'). */
  dash?: DashDef;
  /** Lướt húc: choáng quái thường (giây); tinh anh chỉ nửa, boss miễn. */
  stun?: number;
  /** Hồi Xuân Quyết: gieo độc lên quái trong bán kính `r`, mỗi giây `mul` × công kích, kéo dài `dur` giây. */
  poison?: { r: number; mul: number; dur: number };
  /**
   * E2-G: chiêu bậc 2–3 chưa chơi được (cơ chế server chưa làm hoặc chờ Nguyên Anh/Hóa Thần): có dữ liệu để duyệt
   * nhưng server từ chối ra chiêu và client không xếp lên thanh chiêu bậc cao.
   */
  locked?: boolean;
  /** `line`: vệt chém thẳng từ người ra chiêu về phía mục tiêu, dài `len` rộng `width` (mét), trúng mọi quái trong vệt. */
  line?: { len: number; width: number };
  /** `aoe`: tâm vòng là chính người ra chiêu (không cần mục tiêu để chọn tâm; vẫn cần mục tiêu trong tầm để ra đòn). */
  self?: boolean;
  /** `guard`: phản lại tỉ lệ sát thương quái đánh vào mình (sau khi giảm) trong thời gian giữ thế. */
  reflect?: number;
  /** `shield`: cả đồng đội trong bán kính này cùng nhận khiên (khiên tổ đội). */
  party?: number;
  /** `aoe`: thiêu đốt quái trúng: mỗi giây `mul` × công, kéo dài `dur` giây. */
  burn?: { mul: number; dur: number };
  /** `summon`: `count` kiếm đan, mỗi `every` giây đánh quái gần nhất trong `range` mét; `power` là hệ số mỗi nhịp. */
  summon?: { count: number; every: number; range: number };
  /** `buff`: giảm sát thương nhận `reduce` trong `duration` giây; `stomp` giậm quanh mình mỗi `every` giây; `regen` hồi %/giây. */
  buff?: {
    reduce?: number;
    regen?: number;
    stomp?: { every: number; r: number; mul: number };
    /** E4-G: kiếm ảnh lặp lại chiêu gây sát thương ngươi vừa tung (hệ số = `power` × `hits`). */ echo?: boolean;
  };
  /** E4-G (Thuấn Di Trảm): thuấn di tới sát mục tiêu (cách `stop` mét) rồi mới đánh. */
  blink?: { stop: number };
  /** E4-G (Thuấn Di Hộ Thế/Cứu Viện): thuấn di tới đồng đội (hoặc đồng đội ngã) trong `range` mét; không có thì không ra chiêu. */
  blinkAlly?: { range: number };
  /** E4-G (Anh Dược Hóa Thân): `hot` chỉ chữa bản thân và tối đa chừng này đồng đội mất nhiều máu nhất. */
  allyCount?: number;
  /** Hệ số từng nhát khi chiêu đánh nhiều lần trong một lần bấm (nhân `power`); `hitAt[i]` là mốc nhát i. */
  hitsMul?: number[];
  /** VS-2a: tích/xả tài nguyên riêng của công pháp (Kiếm ý, Huyết khí, Đan hỏa). Luật ở `resource.ts`. */
  res?: SkillRes;
}

/**
 * E2-H: `touch` (đứng trong `TOUCH_R` của điểm đáng chú ý `target` = id `pois` của level), `scan` (quét bằng thần thức E2-E, phím V: điểm `target`
 * nằm trong bán kính quét; cần Kết Đan), `escort` (đưa người đồng hành `target` = id `escorts` của level tới nơi). Cả ba do server quyết định.
 * `enhance` (M-5): món trang bị đạt +count (lấy mức cao nhất, như `level`); `dungeon`: vào Kiếm Trủng; `duel`: hoàn tất một trận tỉ thí.
 */
export type ObjectiveType =
  | 'kill'
  | 'gather'
  | 'craft'
  | 'level'
  | 'talk'
  | 'fly'
  | 'breakthrough'
  | 'enhance'
  | 'dungeon'
  | 'duel'
  | 'meditate'
  | 'scan'
  | 'escort'
  | 'touch'
  | 'clone';

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
  /** Id Truyền Tống Trận mở khóa ngay khi nhận nhiệm vụ (E2-H: `dm_tp_tram` ở nhiệm vụ đầu chương 2). */
  unlockTele?: string[];
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
  /** Level đứng của NPC; thiếu = Vân Lam. */
  level?: string;
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

/** Vùng chơi có tên (M-1): đa giác ranh, khoảng cấp, màu bản đồ, nhạc. Tên hiển thị ở i18n `zone.<id>`. */
export interface ZoneDef {
  id: string;
  /** Khoảng cấp hợp với vùng (cấp nhân vật). */
  lvMin: number;
  lvMax: number;
  /** Màu vùng trên bản đồ (#rrggbb). */
  color: string;
  /** Nhạc nền của vùng (khóa nhạc ở client, ví dụ `wild`, `sect`). */
  music: string;
  /** Đa giác ranh [x, z][] theo chiều bất kỳ, tối thiểu 3 đỉnh. */
  poly: [number, number][];
}

/** Bãi quái (M-1): một cụm 3–4 con quanh tâm, hồi sinh riêng. `ranged` là một con đánh xa thêm vào cụm. */
export interface CampDef {
  id: string;
  zone: string;
  mon: string;
  x: number;
  z: number;
  /** Số con thường trong cụm (3–4). */
  count: number;
  /** Bán kính rải 18–30 m. */
  radius: number;
  levelMin: number;
  levelMax: number;
  /** Giây hồi sinh một con. */
  respawn: number;
  /** Có thêm một quái đánh xa (id quái có `ai.caster`) đứng trong cụm. */
  ranged?: string;
}

export interface LevelDef {
  id: string;
  /** Id địa hình trong `terrainOf` (E1-A); thiếu thì dùng `id`. */
  terrain?: string;
  /** Quái đứng lẻ: tinh anh, boss (quái thường nằm ở `camps`). */
  spawns: SpawnDef[];
  nodes: NodeSpawnDef[];
  zones?: ZoneDef[];
  camps?: CampDef[];
  /** Điểm đáng chú ý (M-5): bày prop sẵn có + cột linh quang nhìn từ xa. Tên ở i18n `poi.<id>.name`. */
  pois?: PoiDef[];
  /** Điểm chạm/quét phụ cho nhiệm vụ `touch`/`scan` (E2-H): khác `pois` ở chỗ không bị luật "mỗi vùng một điểm" và không dựng cột. */
  spots?: SpotDef[];
  /** Người đồng hành cho nhiệm vụ `escort` (E2-H). */
  escorts?: EscortDef[];
  /** Điểm xuất hiện và hồi sinh của room thế giới (E1-B); thiếu thì dùng `SPAWN_POINT` (chỉ Vân Lam). */
  spawn?: { x: number; z: number };
  /** Cổng vào bí cảnh đặt trong level này (E1-B). */
  portals?: PortalDef[];
  /** Có mặt = level là bí cảnh (room riêng, vào bằng vé); thiếu = bản đồ thế giới. */
  dungeon?: DungeonDef;
  /** Cấp tối thiểu để vào bản đồ thế giới này; server kiểm khi cấp vé liên level (`requestLevel`), không chỉ dựa vào mở khóa trận. */
  minLevel?: number;
  /** Room độ kiếp riêng (E1-F): có `dungeon` (điểm vào, nơi về) nhưng không có đợt quái; room tên `tribulation`, mỗi lần độ kiếp một room. */
  tribulation?: boolean;
}

/** Cổng dẫn từ bản đồ thế giới vào bí cảnh. */
export interface PortalDef {
  x: number;
  z: number;
  /** Đứng trong bán kính này (m) mới dùng được. */
  r: number;
  /** Level bí cảnh đích. */
  to: string;
}

export interface WaveDef {
  /** `at`: chỉ số điểm trong `points` của đợt (E2-C); bỏ trống = vòng tròn quanh `center` như Kiếm Trủng. */
  mons: { id: string; level: number; n: number; at?: number }[];
  /** Điểm sinh riêng của đợt (hang, khe tường); quái cùng điểm tỏa quanh điểm đó trong 4 m. */
  points?: { x: number; z: number }[];
  /** Nghỉ trước đợt này (giây); mặc định 6 (đợt đầu 8). */
  delay?: number;
  /** Tên đợt (i18n `dungeon.<level>.wave.<n>`); bỏ trống thì thông báo theo con đầu đợt. */
  title?: boolean;
  /**
   * Đợt giải đố ba gương (E3-M): không quái. Ba cột gương ở `points` mỗi cột một màu; server bốc thứ tự màu, người chơi chạm
   * cột theo đúng thứ tự trong `secs` giây. Sai hoặc hết giờ thì `wrong` quái xuất hiện thêm (đố làm lại); đúng thì
   * sát thương boss giảm `bossCut` suốt phó bản.
   */
  /**
   * Đợt phong ấn (E4-C, Thần Tàng Điện): mỗi cửa `doors[i]` có chỗ đứng mở bằng Phá Ấn Phù (`x, z`, trong `phuR` m) và trận môn bên trong tường (`gx, gz`);
   * nguyên anh xuất khiếu chạm trận môn (trong `touch` m) cũng mở cửa. Người bằng xương thịt không vào được vùng trong `bar` m quanh trận môn khi cửa đóng.
   * Mỗi cửa mở thì `reinforce` quái kéo đến. Mở đủ mọi cửa và hạ hết quái thì sang đợt sau.
   */
  seals?: {
    doors: { x: number; z: number; gx: number; gz: number }[];
    touch: number;
    phuR: number;
    bar: number;
    reinforce: { mon: string; level: number; n: number };
  };
  /**
   * Đợt giữ bia (DV-3D, Xích Tẫn Khích): Trấn Giới Bia ở (`x`, `z`), bán kính `r`. Cần có người còn sống đứng trong vòng đủ `secs` giây (cộng dồn).
   * Trong lúc trống người quá `grace` giây thì bia tắt: mỗi giây mọi người mất `press` × khí huyết tối đa (giới áp) và tiến độ không tăng.
   * Quái tiếp viện `reinforce[i].mon` kéo tới khi tiến độ đạt `reinforce[i].at` giây (quanh bia, `n` con).
   */
  steles?: {
    x: number;
    z: number;
    r: number;
    secs: number;
    grace: number;
    press: number;
    reinforce: { at: number; mon: string; level: number; n: number }[];
  };
  puzzle?: {
    points: { x: number; z: number }[];
    msg?: string;
    secs: number;
    wrong: { mon: string; level: number; n: number };
    bossCut: number;
  };
}

/** Thưởng khi dẹp xong phó bản, nhận một lần mỗi ngày và mỗi nhân vật (khóa idem `dungeon:<level>:<ngày>`). */
export interface DungeonReward {
  /** Phần trăm tu vi cần để lên tầng kế tiếp (15% theo thiết kế). */
  xpPct: number;
  /** [thấp, cao] linh thạch. */
  gold: number[];
  items: { item: string; chance: number; min: number; max: number }[];
  /** Cùng khuôn `loot.json` `equip`: phẩm + (tuỳ chọn) bộ. */
  equip?: { chance: number; q: number[]; set?: string; ilvlBonus?: number }[];
  /** Cấp để tính ilvl trang bị rơi. */
  level: number;
}

/** Bí cảnh theo dữ liệu (E1-B): điểm vào/ra, tâm trận, đợt quái, nơi về. */
export interface DungeonDef {
  spawn: { x: number; z: number };
  /** Điểm đứng dùng cổng ra (`portal`). */
  exit: { x: number; z: number };
  /** Tâm vòng sinh quái của mỗi đợt. */
  center: { x: number; z: number };
  minLevel: number;
  /** Level thế giới nhận người khi ra, và điểm xuất hiện ở đó. */
  returnLevel: string;
  returnSpawn: { x: number; z: number };
  /** Bán kính (m) quanh `center` mà người chơi không ra khỏi được (vách hang); bỏ trống = không giới hạn. */
  bound?: number;
  waves: WaveDef[];
  /** Mỗi lượt vào là một room riêng cho nhóm cùng đi (khóa `dgKey` trong vé); bỏ trống = ghép chung room còn chỗ như Kiếm Trủng. */
  private?: boolean;
  /** Khóa room (không cho người mới vào) sau khi đợt này bắt đầu; mặc định 2. */
  lockAt?: number;
  /** Số lần hồi sinh tối đa của mỗi người trong phó bản; hết thì bị đưa ra ngoài. Bỏ trống = không giới hạn (Kiếm Trủng). */
  maxRevives?: number;
  /** Thưởng hoàn thành (nhận một lần mỗi ngày); bỏ trống = chỉ có rơi đồ của quái. */
  reward?: DungeonReward;
}

/**
 * Asset client cần cho một level (`levels/<id>.assets.json`, E1-D). Client nạp khi vào level và giải phóng khi rời;
 * không nằm trong tải đầu (chỉ level đầu tiên được `prefetch` cùng lúc kết nối).
 */
export interface LevelAssets {
  /** Tên preset grading (`GRADING` ở client); `default` là mặc định của palette. */
  mood: string;
  /** Id GLB nạp theo level (đếm tham chiếu ở AssetCache). */
  glb: string[];
  /** Bộ texture mặt đất (thư mục `public/<set>/`) + mặt nạ: `manifest` = mặt nạ vẽ riêng cho level trong manifest, `neutral` = phẳng mặc định; false = màu đỉnh. */
  ground: false | { set: string; mask: 'manifest' | 'neutral' };
  /** Bài nhạc nạp trước khi tắt bài cũ. */
  music: string[];
  /** Các lớp dựng riêng của Vân Lam; level mới tắt hoặc bật theo nhu cầu. */
  features: {
    sect: boolean;
    portals: boolean;
    lanterns: boolean;
    lake: boolean;
    clouds: boolean;
    grass: boolean;
    trees: 'scatter' | 'none';
    beacons: boolean;
    vegetation: boolean;
  };
  /** Vỏ hang (E2-C): vách đá + trần tối che chân trời và bầu trời; đèn đá và tinh thể mạch của level được thêm quầng sáng. */
  cave?: { x: number; z: number; r: number; h: number };
  /** Phó bản cung điện (E3-M): `true`/`'moon'` cung gương lam bạc, `'gilt'` cung dát vàng Kim Dạ (DV-3E). */
  palace?: boolean | 'moon' | 'gilt';
  /** Tia sáng xuyên mây (MAP-1, render/godRays.ts): vùng rải tâm (x, z) bán kính `r`, `count` dải. Bỏ trống = không có. */
  godRays?: { x: number; z: number; r: number; count: number };
  /** Cảnh Đoạn Mạch (MAP-2, client `game/world/doanMachArt.ts`): rừng phong, cổ trận khắc vách, cầu treo. Chỉ để nhìn. */
  doanMachArt?: boolean;
  /** Cảnh Kiếm Trủng (DUN-1, client `game/world/kiemTrungArt.ts`): ngàn kiếm gãy cắm đất, cự kiếm, kiếm trận khắc sàn. Chỉ để nhìn. */
  kiemTrungArt?: boolean;
  /** Cảnh Phục Mạch Quật (DUN-1 PR2, client `game/world/phucMachArt.ts` + GLB `arch_phuc_mach`): hầm mỏ cũ, mạch tinh, cột sa thạch. Chỉ để nhìn. */
  phucMachArt?: boolean;
  /** Cảnh Kính Nguyệt Cung (DUN-1 PR3, client `game/world/kinhNguyetArt.ts` + GLB `arch_kinh_nguyet`): điện gương trăng bạc. Chỉ để nhìn. */
  kinhNguyetArt?: boolean;
  /** Cảnh Thần Tàng Điện (DUN-1 PR4, client `game/world/thanTangArt.ts` + GLB `arch_than_tang`): điện tàng đen tím nạm vàng. Chỉ để nhìn. */
  thanTangArt?: boolean;
  /** Cảnh Xích Tẫn Khích (DUN-1 PR6, client `game/world/xichTanArt.ts` + GLB `arch_xich_tan`): hẻm núi lửa tàn đỏ-đen. Chỉ để nhìn. */
  xichTanArt?: boolean;
  /** Lớp núi xa Bắc Hoang (POLISH-1, client `game/world/bhFar.ts`): đỉnh tuyết nhiều lớp + sương chân núi ngoài vùng chơi. Chỉ để nhìn. */
  bhFar?: boolean;
  /** Lớp cảnh xa Lạc Kiếm Tông (POLISH-1, client `game/world/lacKiemFar.ts`): cụm tùng, gờ đá, sương dải trên đồi xa. Chỉ để nhìn. */
  lacKiemFar?: boolean;
  /** Cảnh Độ Kiếp (DUN-1 PR7, client `game/world/doKiepArt.ts` + GLB `arch_do_kiep`): Thiên Lôi Đài dưới mây bão. Chỉ để nhìn. */
  doKiepArt?: boolean;
  /** Cảnh Kim Dạ Cung (DUN-1 PR5, client `game/world/kimDaArt.ts` + GLB `arch_kim_da`): cung dát vàng đêm lồng đèn. Chỉ để nhìn. */
  kimDaArt?: boolean;
  /**
   * Cảnh Lạc Kiếm trên không (MAP-1, chỉ để nhìn, không có va chạm): đảo nổi quanh tông môn, cầu mây, thác, Kiếm Đài.
   * Toạ độ tương đối tâm tông môn (`SECT`): `x`, `z` mét; `y` là cao độ MẶT TRÊN đảo tính từ `SECT.y` (m).
   * Client dựng thân đảo, cầu, thác, kiếm (game/world/lacKiemSky.ts); script Blender đặt công trình trên đảo từ cùng dữ liệu.
   */
  lacKiemSky?: LacKiemSky;
  /** Cảnh Thiên Khuyết trên trời và quảng trường (MAP-4, chỉ để nhìn, không va chạm): xem `ThienKhuyetSky`. */
  thienKhuyetSky?: ThienKhuyetSky;
  /** Tên ảnh minimap trong `public/map/` (không đuôi). */
  minimap: string;
  /** Thư mục atlas thẻ cỏ alpha trong `public/` (Đoạn Mạch: `grass-ochre`); bỏ trống = bụi lá thủ tục của Vân Lam. */
  grassCards?: string;
}

/** Đảo tiên cung nổi của Thiên Khuyết (toạ độ thế giới tuyệt đối; `y` là cao độ mặt trên). */
export interface TkIsland {
  id: string;
  x: number;
  z: number;
  y: number;
  r: number;
  depth: number;
  /** `cong`: bệ Cổng Tiên Vỡ cuối bậc thang; `cung`: tiên cung đổ nát (cột, mái, vòm). */
  kind: 'cong' | 'cung';
}

/**
 * Cảnh Thiên Khuyết (MAP-4, game/world/thienKhuyetSky.ts): đảo tiên cung đổ nát, bậc thang xoắn lên trời tới Cổng Tiên Vỡ,
 * tượng thần khổng lồ gãy đổ, cột ngọc vỡ, mảnh đá trời, trận pháp cổ trên quảng trường. Toạ độ thế giới tuyệt đối. Không va chạm.
 */
export interface ThienKhuyetSky {
  islands: TkIsland[];
  /** Bậc thang xoắn quanh quảng trường: tâm (cx, cz), bán kính đầu/cuối, số vòng, cao độ đầu/cuối, góc đầu (rad), bề ngang. */
  stair: { cx: number; cz: number; r0: number; r1: number; turns: number; y0: number; y1: number; a0: number; width: number };
  /** Tượng thần đổ: vị trí chân, hướng (rad), cỡ (m, chiều dài thân). */
  statue: { x: number; z: number; yaw: number; size: number };
  /** Trận pháp cổ trên mặt quảng trường. */
  array: { x: number; z: number; r: number };
  /** Số mảnh đá trời lơ lửng. */
  shards: number;
  /** Cột son dọc đại lộ: vị trí và độ cao đất thật `y` (sinh bằng `tools/perf/src/tk-pillars.ts`; GLB nướng cột nên cần `y` có sẵn). */
  pillars: { x: number; z: number; y: number; kind: 'gay' | 'dung' | 'do' }[];
}

/** Loại công trình trên đảo nổi (script Blender chọn mảnh kit theo loại). */
export type SkyIslandKind = 'kiem_dai' | 'dinh' | 'dinh_luc' | 'thap' | 'dien';

export interface SkyIsland {
  id: string;
  x: number;
  z: number;
  /** Cao độ mặt trên so với `SECT.y` (m). */
  y: number;
  /** Bán kính mặt trên (m). */
  r: number;
  /** Chiều sâu từ mặt trên tới mũi đá đáy (m). */
  depth: number;
  kind: SkyIslandKind;
  /** Có thác đổ từ mép đảo xuống biển mây. */
  fall?: boolean;
}

/** Cầu mây nối hai đảo, hoặc nối sân tông môn (`sect`) với một đảo. */
export interface SkyBridge {
  from: string;
  to: string;
}

export interface LacKiemSky {
  islands: SkyIsland[];
  bridges: SkyBridge[];
  /** Cao độ tuyệt đối (m) nơi thác tan vào biển mây. */
  fallEndY: number;
  /** Số thanh kiếm cắm quanh Kiếm Đài (InstancedMesh, một draw call). */
  swords: number;
}

/** Điểm phụ của nhiệm vụ (E2-H). Tên ở i18n `spot.<id>.name`. */
export interface SpotDef {
  id: string;
  zone: string;
  x: number;
  z: number;
}

/** Người đồng hành của nhiệm vụ hộ tống: đi dọc `path` (x, z) với tốc độ `speed` m/s khi người nhận ở gần. */
export interface EscortDef {
  id: string;
  /** Id NPC mượn model và tên (`npc.<npc>.name`); đứng ở đầu đường, không phải NPC thật. */
  npc: string;
  path: [number, number][];
  speed: number;
}

/** Điểm đáng chú ý trong một vùng săn (M-5). */
export interface PoiDef {
  id: string;
  zone: string;
  x: number;
  z: number;
  /** Cao cột linh quang (m); 0 hoặc không có thì không dựng cột. */
  beamH?: number;
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
  /** Ô đang khóa (TD-A): không bán, không phân giải, không làm nguyên liệu, không bị gộp khi sắp xếp. Chỉ có ở túi. */
  lk?: true;
}
export type InvSlot = InvItem | null;
/** Số ô mỗi trang túi (client chia trang). */
export const INV_PAGE = 30;
/** Số trang túi; mở sẵn hết, không có lệnh mở trang. */
export const INV_PAGES = 4;
export const INV_SIZE = INV_PAGE * INV_PAGES;

export type Equipment = Partial<Record<WearSlot, InvItem>>;

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
