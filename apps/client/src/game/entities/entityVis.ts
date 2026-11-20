import { currentSearch } from '../../base/flags';
import { decodeDye3, TRUC_CO_LEVEL } from '@dtl/shared';
import { swordOverride } from '../core/testParams';
import { APPEARANCE, DYE, ITEM, SET, MONSTER, monsterName, realmName, SWORD_MODELS, swordModelOf, t } from '@dtl/content';
import { bodyRadiusOf } from '@dtl/shared';
import { legacyAppearance } from '@dtl/shared';
import { type Label } from './labelBatch';
import { disposeLabel, Humanoid, makeLabel } from '../core/models';
import { type CharacterView, type MonsterView, type SkillEvent } from '../character/view';
import { MonsterSkins } from '../character/monsterSkins';
import { type PlayerLook, PlayerSkins } from '../character/playerSkins';
import { BAR_ALLY, BAR_BOSS, BAR_ENEMY } from './headBars';
import { HpTrail } from './hpTrail';
import { markLabelSpec } from './markLabel';
import { ArtifactVis } from '../fx/artifactVis';

export interface PState {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vy: number;
  gr: boolean;
  fl: number;
  lv: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  seq: number;
  wp: string;
  /** Bậc phát sáng của vũ khí (0/1/2); server cũ chưa gửi thì undefined. */
  wg?: number;
  /** Ngoại hình: giới tính, id màu áo (appearance.json). Server cũ chưa gửi thì undefined. */
  g?: string;
  dye?: string;
  /** Kiểu tóc nhân vật nền v2. */
  hr?: string;
  /** id vật phẩm skin đang mặc (ô ngoại hình); server cũ chưa gửi thì undefined. */
  sn?: string;
  /** Bộ trang bị đang nhuộm áo/ánh kiếm (id bộ); '' hoặc thiếu = không. */
  sk?: string;
  /** Mã phụ kiện hình dáng của đồ bộ (`accessoryCode`); '' hoặc thiếu = không. */
  sa?: string;
  /** Nhuộm 3 kênh của tủ ngoại trang (`encodeDye3`: "a,b,c"); '' hoặc thiếu = không. */
  dye3?: string;
  /** id pháp bảo phụ đang đeo (P3-8); '' hoặc thiếu = không. */
  art?: string;
  /** id công pháp đang tu (chọn giọng động tác, K-5); '' hoặc thiếu = chưa chọn. */
  mt?: string;
  /** Ấn đang mang (VS-2c): gói bit `packMarks`; 0 hoặc thiếu = không có. */
  mk?: number;
}

export interface MState {
  t: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  mhp: number;
  lv: number;
  st: number;
  /** Cờ MF_* và thời điểm server (ms) hết trạng thái đó. */
  mf?: number;
  ce?: number;
  /** Boss: pha hiện tại (0 = pha đầu) và thanh phá thế 0–100. */
  ph?: number;
  pz?: number;
  /** Ấn đang mang (VS-2c): gói bit `packMarks`; 0 hoặc thiếu = không có. */
  mk?: number;
}

/** Nhãn ấn nằm trên nhãn tên chừng này (theo đơn vị của nhãn tên) và nhỏ hơn một chút. */
const MARK_LABEL_UP = 0.46;
const MARK_LABEL_SCALE = 0.82;

/** Dựng lại nhãn ấn cho gói bit `mk`: trả nhãn mới (đã gắn vào `root`, đặt trên `nameLabel`) hoặc null khi không có ấn. */
function swapMarkLabel(root: { add(o: Label): unknown; remove(o: Label): unknown }, old: Label | null, mk: number, nameLabel: Label | null): Label | null {
  if (old) {
    root.remove(old);
    disposeLabel(old);
  }
  const spec = markLabelSpec(mk);
  if (!spec || !nameLabel) return null;
  const l = makeLabel(spec.text, spec.color);
  l.scale.copy(nameLabel.scale).multiplyScalar(MARK_LABEL_SCALE);
  l.position.y = nameLabel.position.y + MARK_LABEL_UP * nameLabel.scale.y * 2;
  root.add(l);
  return l;
}

export class PlayerVis {
  model: CharacterView;
  /** Ngoại hình model đang dựng (đổi thì dựng lại). */
  look: PlayerLook;
  /** Đang dùng model khối tạm trong lúc asset model mới còn nạp. */
  skinPending: boolean;
  label: Label;
  bar = new BarState(1.3, BAR_ALLY);
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  speed = 0;
  fl = 0;
  lv = 0;
  /** Pháp bảo phụ đang đeo (nạp lười khi có `s.art`). */
  art: ArtifactVis | null = null;
  /** Bản mệnh pháp bảo Ngưng Đan Lô (từ Kết Đan, cấp 20; E2-E). */
  lo: ArtifactVis | null = null;
  /** Công pháp đang tu (từ `s.mt`): chọn giọng động tác của chiêu. */
  mt = '';
  /** Vận tốc hiển thị đã làm mượt (m/s) để suy ra đi lùi/ngang so với hướng nhìn (K-4). */
  mvx = 0;
  mvz = 0;
  /** Vị trí vài chục khung gần nhất (để lướt hiển thị biết xuất phát từ đâu, K-4). */
  hist: { t: number; x: number; z: number }[] = [];
  /** Chuyển sự kiện chiêu của model ra ngoài (engine/VFX/âm thanh/camera đăng ký). */
  onSkillEvent: ((sid: string, e: SkillEvent) => void) | null = null;
  bindEvents(): void {
    this.model.onSkillEvent = (e) => this.onSkillEvent?.(this.sid, e);
  }
  constructor(
    public sid: string,
    public s: PState,
    public local: boolean,
    skins: PlayerSkins,
  ) {
    this.look = lookOf(s);
    this.model = skins.create(this.look);
    this.skinPending = skins.pending(this.look);
    this.label = makeLabel(s.name, local ? '#bfe8ff' : '#ffffff', realmTag(s.lv), realmTagColor(s.lv));
    this.lv = s.lv;
    this.label.position.y = labelY(this.model);
    this.model.root.add(this.label);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
    this.bindEvents();
  }
  refreshLabel() {
    this.model.root.remove(this.label);
    disposeLabel(this.label);
    this.label = makeLabel(this.s.name, this.local ? '#bfe8ff' : '#ffffff', realmTag(this.s.lv), realmTagColor(this.s.lv));
    this.label.position.y = labelY(this.model);
    this.model.root.add(this.label);
    this.lv = this.s.lv;
    this.refreshMarks();
  }
  /** Ấn đang mang (VS-2c, Mộc ấn): nhãn nhỏ trên tên; dựng lại khi `mk` đổi. */
  markLabel: Label | null = null;
  mk = 0;
  refreshMarks() {
    this.mk = this.s.mk ?? 0;
    this.markLabel = swapMarkLabel(this.model.root, this.markLabel, this.mk, this.label);
  }
  /** Thay model (asset nạp xong, đổi màu áo): giữ nhãn, chỗ trong cảnh; hit-stop/giật lùi dở dang bỏ đi. */
  swapModel(next: CharacterView, look: PlayerLook): void {
    const parent = this.model.root.parent;
    this.model.root.remove(this.label);
    if (this.markLabel) this.model.root.remove(this.markLabel);
    this.model.root.removeFromParent();
    this.model.dispose();
    this.model = next;
    this.bindEvents();
    this.look = look;
    this.label.position.y = labelY(next);
    next.root.add(this.label);
    parent?.add(next.root);
    this.refreshMarks();
  }
  dispose() {
    disposeLabel(this.label);
    if (this.markLabel) disposeLabel(this.markLabel);
    this.art?.dispose();
    this.lo?.dispose();
    this.model.dispose();
  }
}

export class MonVis {
  model: MonsterView;
  /** Đang dùng model khối tạm trong lúc asset model mới còn nạp. */
  skinPending: boolean;
  label: Label | null = null;
  bar: BarState;
  /** Độ cao tâm thanh trên đầu so với chân (m, đã tính scale). */
  barY: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed = 0;
  lv = -1;
  wasAttack = false;
  /** Cờ `mf` ở khung trước (E1-E: phát hiện bật/tắt phản đòn, yếu điểm, chui đất). */
  mf0 = 0;
  /** Độ cao bay lơ lửng đang hiển thị (m, `MonsterDef.hover`, xem `hover.ts`). */
  hover = 0;
  /** Độ lệch tách thân đang hiển thị (P2-E2, chỉ trình bày) và bán kính thân. */
  sepX = 0;
  sepZ = 0;
  readonly radius: number;
  constructor(
    public id: string,
    public s: MState,
    skins: MonsterSkins,
  ) {
    const def = MONSTER.get(s.t)!;
    this.model = skins.create(def);
    this.skinPending = skins.pending(def);
    this.bar = new BarState(def.boss ? 3 : 1.5, def.boss ? BAR_BOSS : BAR_ENEMY);
    this.barY = this.model.height + 0.35 * def.scale;
    this.radius = bodyRadiusOf(def);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
  }
  /** Asset model mới nạp xong: thay model khối tạm bằng model mới (giữ nhãn, vị trí). */
  /** Ấn đang mang (VS-2c): nhãn nhỏ trên tên quái; dựng lại khi `mk` đổi. */
  markLabel: Label | null = null;
  mk = 0;
  refreshMarks() {
    this.mk = this.s.mk ?? 0;
    this.markLabel = swapMarkLabel(this.model.root, this.markLabel, this.mk, this.label);
  }
  swapModel(next: MonsterView, myLevel: number): void {
    const parent = this.model.root.parent;
    if (this.label) this.model.root.remove(this.label);
    if (this.markLabel) this.model.root.remove(this.markLabel);
    this.model.root.removeFromParent();
    this.model.dispose();
    this.model = next;
    this.barY = next.height + 0.35 * next.def.scale;
    parent?.add(next.root);
    this.refreshLabel(myLevel);
  }
  refreshLabel(myLevel: number) {
    if (this.label) {
      this.model.root.remove(this.label);
      disposeLabel(this.label);
    }
    const def = this.model.def;
    const d = this.s.lv - myLevel;
    const color = def.boss ? '#ffb347' : def.elite ? '#7fd4ff' : d >= 3 ? '#ff6b5e' : d >= 1 ? '#ffd166' : d <= -5 ? '#9aa3ad' : '#f2f2f2';
    this.label = makeLabel(
      def.elite ? `${monsterName(def.id)} · ${t('ui.monster.elite')}` : monsterName(def.id),
      color,
      t('ui.level_short', { n: this.s.lv }),
      '#c9d4de',
    );
    this.label.position.y = this.model.height / def.scale + 0.95;
    this.label.scale.multiplyScalar(1 / def.scale);
    if (def.boss) this.label.scale.multiplyScalar(1.8);
    else if (def.elite) this.label.scale.multiplyScalar(1.25);
    this.model.root.add(this.label);
    this.lv = this.s.lv;
    this.refreshMarks();
  }
  dispose() {
    if (this.label) disposeLabel(this.label);
    if (this.markLabel) disposeLabel(this.markLabel);
    this.model.dispose();
  }
}

/**
 * Trạng thái hiển thị thanh trên đầu của một thực thể: đoạn trễ, lúc hết giao chiến, độ mờ.
 * Chỉ hiện khi đang giao chiến (máu vừa đổi, quái đang đuổi/đánh) hoặc đang là mục tiêu.
 */
class BarState {
  trail = new HpTrail(1);
  alpha = 0;
  private lastHp = -1;
  private combatUntil = 0;
  constructor(
    public width: number,
    public kind: number,
  ) {}
  /** Trả về độ mờ (0 thì không vẽ). */
  tick(hp: number, mhp: number, engaged: boolean, dead: boolean, dt: number, time: number): number {
    const frac = mhp > 0 ? hp / mhp : 0;
    if (this.lastHp >= 0 && hp !== this.lastHp) this.combatUntil = time + COMBAT_LINGER;
    this.lastHp = hp;
    const show = !dead && (engaged || time < this.combatUntil);
    if (show && this.alpha <= 0) this.trail.reset(frac);
    this.alpha = Math.max(0, Math.min(1, this.alpha + (show ? BAR_FADE : -BAR_FADE) * dt));
    if (dead) this.alpha = 0;
    this.trail.update(frac, dt);
    return this.alpha;
  }
}

/** Nhãn tên trên đầu: model khối cao 1,95 m giữ chỗ cũ (2,55); model có xương theo chiều cao thật. */
function labelY(m: CharacterView): number {
  return m instanceof Humanoid ? 2.55 : m.height + 0.75;
}

const DYE_IDS: ReadonlySet<string> = new Set(APPEARANCE.dyes.map((d) => d.id));

/** Nhuộm 3 kênh → màu v1 (kênh 1 = vải chính `hex`, kênh 2 = viền `trim`; kênh 3 dành cho nhân vật v3). Sai định dạng thì bỏ. */
export function tintOf(dye3: string | undefined): PlayerLook['tint'] {
  return tintOfTriple(dye3 ? decodeDye3(DYE_IDS, dye3) : undefined);
}

/** Như `tintOf` nhưng từ bộ ba id màu đã giải mã (bản nháp của Tủ ngoại trang). */
export function tintOfTriple(d: readonly string[] | null | undefined): PlayerLook['tint'] {
  const a = d ? DYE.get(d[0] ?? '') : undefined;
  const b = d ? DYE.get(d[1] ?? '') : undefined;
  return a && b ? { hex: a.hex, trim: b.hex } : undefined;
}

/** Ngoại hình hiển thị: theo server; server cũ chưa gửi thì màu theo tên như trước. */
export function lookOf(s: PState): PlayerLook {
  const base = {
    ...(s.dye ? { g: s.g || APPEARANCE.defaultGender, dye: s.dye, ...(s.hr ? { hair: s.hr } : {}) } : legacyAppearance(APPEARANCE, s.name)),
    w: SWORD_FORCED ?? swordModelOf(s.wp, s.wg ?? 0),
  };
  const look: PlayerLook = s.sk && SET.has(s.sk) ? { ...base, set: s.sk } : base;
  const skin = s.sn ? ITEM.get(s.sn)?.skin : undefined;
  const tint = tintOf(s.dye3);
  const tinted = tint ? { ...look, tint } : look;
  const full = s.sa ? { ...tinted, acc: s.sa } : tinted;
  return skin ? { ...full, skin } : full;
}

/** Dòng cảnh giới trên bảng tên người chơi: `[Ngưng Khí tầng 9]`. */
function realmTag(level: number): string {
  return t('ui.nameplate.realm', { realm: realmName(level) });
}

/** Màu dòng cảnh giới theo đại cảnh giới: Ngưng Khí vải ngà, Trúc Cơ kim quang (art bible mục 4: attire_ivory, spirit_gold). */
function realmTagColor(level: number): string {
  return level >= TRUC_CO_LEVEL ? '#ffde96' : '#e6ddcb';
}

/** Tốc độ hiện/ẩn thanh (độ mờ mỗi giây). */
const BAR_FADE = 6;

/** Thanh trên đầu còn hiện bao lâu (giây) sau lần cuối máu đổi. */
const COMBAT_LINGER = 6;

const SWORD_FORCED = swordOverride(currentSearch(), SWORD_MODELS);
