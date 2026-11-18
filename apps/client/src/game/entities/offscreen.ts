import * as THREE from 'three/webgpu';
import type { LevelDef, NpcDef, QuestDef, QuestView } from '@dtl/shared';
import { levelSpawns, MS_DEAD } from '@dtl/shared';
import { NPCS, QUEST, t } from '@dtl/content';
import { contentIconStyle } from '../../ui/ContentIcon';

/**
 * Chỉ báo ngoài màn hình (M4-15): khi mục tiêu đang chọn, boss đang giao chiến hay đích của nhiệm vụ
 * đang theo dõi nằm ngoài khung nhìn, một huy hiệu nhỏ bám mép màn hình chỉ hướng tới nó kèm khoảng cách.
 *
 * Lớp DOM riêng (như số sát thương), không thêm draw call 3D. Engine chọn ứng viên ~10 lần/giây
 * (`setCandidates`), còn `update` mỗi khung chỉ chiếu tối đa `MAX_INDICATORS` điểm và ghi transform.
 * Chỉ đọc vị trí đã có ở client; không thêm thông tin mới (không tỉ lệ rơi, không đổi luật).
 */

const MAX_INDICATORS = 3;

export type OffKind = 'target' | 'foe' | 'boss' | 'quest' | 'turnin' | 'gather' | 'loot' | 'mark' | 'mate';

export interface OffCandidate {
  /** Khóa ổn định để giữ đúng phần tử DOM giữa các lần chọn. */
  key: string;
  kind: OffKind;
  /** Tên hiển thị (đã qua i18n) cho title/aria-label. */
  label: string;
  /** Icon trong atlas (itm_*) nếu có. */
  icon?: string;
  /** Ghi vị trí thế giới hiện tại vào `out`; false nếu vật không còn (bỏ qua khung này). */
  pos(out: THREE.Vector3): boolean;
  /** Khoảng (m) từ `pos` xuống chân vật. Thấy chân hoặc thấy `pos` đều coi là vật đang trong khung. */
  span?: number;
}

/** Khoảng lề (px) của khung bám mép, chừa chỗ cho khung nhân vật, thanh boss, bản đồ nhỏ, thanh chiêu. */
interface EdgeInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const DEFAULT_INSET: EdgeInset = { left: 40, right: 40, top: 40, bottom: 165 };

/** Khối HUD (khung chữ nhật px) mà chỉ báo phải tránh. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Vùng chiếm của một chỉ báo quanh tâm huy hiệu (px): số khoảng cách nằm dưới nên phía dưới dài hơn. */
export const INDICATOR_EXTENT = { up: 22, down: 42, side: 30 };

/**
 * Chỉ báo trùng chỗ với chỉ báo đã đặt (ví dụ hai điểm đánh dấu cùng hướng) thì trượt ngang một bề rộng huy hiệu,
 * sang phải; hết chỗ thì sang trái. Chỉ nhìn các chỉ báo đã đặt trước nó trong cùng khung.
 */
export function spreadFrom(
  at: EdgePlace,
  placed: readonly { x: number; y: number }[],
  n: number,
  w: number,
  inset: EdgeInset = DEFAULT_INSET,
): void {
  const GAP = INDICATOR_EXTENT.side * 1.6;
  const near = (x: number) => {
    for (let i = 0; i < n; i++) if (Math.abs(placed[i]!.x - x) < GAP && Math.abs(placed[i]!.y - at.y) < INDICATOR_EXTENT.down) return true;
    return false;
  };
  for (let k = 0; k < n + 1 && near(at.x); k++) {
    const right = at.x + GAP;
    at.x = right <= w - inset.right ? right : Math.max(inset.left, at.x - GAP * (k + 1));
  }
}

/** Các khối HUD bám mép; chỉ báo trượt dọc mép để không nằm dưới chúng. */
const AVOID_SELECTOR = '.player-frame, .target-frame, .boss-bar, .right-col, .chat, .skillbar';

/** Điểm trong NDC coi là "đang thấy" khi |x|,|y| ≤ ngưỡng này (để chỉ báo hiện trước khi vật chạm hẳn mép). */
const VISIBLE_NDC = 0.94;

interface EdgePlace {
  x: number;
  y: number;
  /** Góc (radian) của hướng chỉ trên màn hình, 0 = sang phải, tăng theo chiều kim đồng hồ (trục y màn hình hướng xuống). */
  angle: number;
}

/**
 * Đặt chỉ báo lên mép từ tọa độ view space (`vx, vy, vz`, camera nhìn theo −z) và hai hệ số chiếu
 * `p00 = proj[0]`, `p11 = proj[5]`. Trả `null` nếu điểm đang nằm trong khung nhìn.
 *
 * Hướng lấy từ (vx·p00, vy·p11): với điểm phía trước nó cùng dấu với NDC, với điểm sau lưng nó vẫn
 * đúng trái/phải/trên/dưới (không bị lật như NDC). Điểm ngay sau lưng camera (vx, vy ≈ 0) chỉ xuống dưới.
 */
export function edgePlace(
  vx: number,
  vy: number,
  vz: number,
  p00: number,
  p11: number,
  w: number,
  h: number,
  inset: EdgeInset = DEFAULT_INSET,
): EdgePlace | null {
  let dx = vx * p00;
  let dy = vy * p11;
  if (vz < 0) {
    const nx = dx / -vz;
    const ny = dy / -vz;
    if (Math.abs(nx) <= VISIBLE_NDC && Math.abs(ny) <= VISIBLE_NDC) return null;
  }
  // Đổi sang pixel quanh tâm màn hình, trục y hướng xuống.
  let px = dx * w * 0.5;
  let py = -dy * h * 0.5;
  if (Math.abs(px) + Math.abs(py) < 1e-6) {
    px = 0;
    py = 1;
  }
  dx = px;
  dy = py;
  const cx = w * 0.5;
  const cy = h * 0.5;
  // Khung bám mép (tâm có thể lệch vì lề không đối xứng).
  const x0 = inset.left;
  const x1 = Math.max(x0 + 1, w - inset.right);
  const y0 = inset.top;
  const y1 = Math.max(y0 + 1, h - inset.bottom);
  // Tia từ tâm màn hình, cắt khung chữ nhật.
  let s = Infinity;
  if (dx > 0) s = Math.min(s, (x1 - cx) / dx);
  else if (dx < 0) s = Math.min(s, (x0 - cx) / dx);
  if (dy > 0) s = Math.min(s, (y1 - cy) / dy);
  else if (dy < 0) s = Math.min(s, (y0 - cy) / dy);
  if (!Number.isFinite(s) || s < 0) s = 0;
  const x = Math.min(x1, Math.max(x0, cx + dx * s));
  const y = Math.min(y1, Math.max(y0, cy + dy * s));
  return { x, y, angle: Math.atan2(dy, dx) };
}

/**
 * Đẩy chỉ báo (đã bám mép bằng `edgePlace`) ra khỏi các khối HUD: đang ở mép trái/phải thì trượt
 * lên/xuống, đang ở mép trên/dưới thì trượt ngang, chọn phía gần hơn mà vẫn trong khung lề.
 * Sửa trực tiếp `at`.
 */
export function avoidRects(
  at: EdgePlace,
  rects: readonly Rect[],
  w: number,
  h: number,
  inset: EdgeInset = DEFAULT_INSET,
  ext = INDICATOR_EXTENT,
): void {
  const x0 = inset.left;
  const x1 = Math.max(x0 + 1, w - inset.right);
  const y0 = inset.top;
  const y1 = Math.max(y0 + 1, h - inset.bottom);
  const pick = (v: number, lo: number, hi: number, min: number, max: number): number => {
    const okLo = lo >= min;
    const okHi = hi <= max;
    if (okLo && (!okHi || v - lo <= hi - v)) return lo;
    if (okHi) return hi;
    return v;
  };
  // Hai lượt: trượt ra khỏi khối này có thể rơi vào khối kề bên.
  for (let pass = 0; pass < 2; pass++) {
    for (const b of rects) {
      if (at.x < b.left - ext.side || at.x > b.right + ext.side || at.y < b.top - ext.down || at.y > b.bottom + ext.up) continue;
      const vertical = at.x <= x0 + 0.5 || at.x >= x1 - 0.5;
      if (vertical) at.y = pick(at.y, b.top - ext.down, b.bottom + ext.up, y0, y1);
      else at.x = pick(at.x, b.left - ext.side, b.right + ext.side, x0, x1);
    }
  }
}

/** Đích của nhiệm vụ đang theo dõi, chưa gắn vị trí. */
type QuestGoal = { kind: 'npc'; npc: string; turnin: boolean } | { kind: 'mon'; mon: string } | { kind: 'node'; item: string };

/**
 * Đích của nhiệm vụ: xong hết thì về NPC trả; không thì mục tiêu đầu tiên chưa xong có chỗ để chỉ
 * (nói chuyện → NPC, diệt → quái, hái → điểm hái, luyện → NPC có lò đan). Cảnh giới/ngự kiếm/đột phá
 * không có chỗ cụ thể nên bỏ qua.
 */
export function questGoal(def: QuestDef, prog: number[], npcs: readonly NpcDef[]): QuestGoal | null {
  const done = def.objectives.every((o, i) => (prog[i] ?? 0) >= o.count);
  if (done) return { kind: 'npc', npc: def.turnin, turnin: true };
  for (let i = 0; i < def.objectives.length; i++) {
    const o = def.objectives[i]!;
    if ((prog[i] ?? 0) >= o.count) continue;
    if (o.type === 'talk' && o.target) return { kind: 'npc', npc: o.target, turnin: false };
    if (o.type === 'kill' && o.target) return { kind: 'mon', mon: o.target };
    if (o.type === 'gather' && o.target) return { kind: 'node', item: o.target };
    if (o.type === 'enhance') {
      const n = npcs.find((x) => x.enhance);
      if (n) return { kind: 'npc', npc: n.id, turnin: false };
    }
    if (o.type === 'craft') {
      const n = npcs.find((x) => x.recipes);
      if (n) return { kind: 'npc', npc: n.id, turnin: false };
    }
  }
  return null;
}

/**
 * Nhiệm vụ đang theo dõi — một luật dùng chung cho chấm ở bảng theo dõi (Hud) và chỉ báo ngoài màn hình
 * (engine): nhiệm vụ đang ghim nếu còn nhận; không thì nhiệm vụ đang nhận đầu tiên có đích (`questGoal`
 * khác null). '' nếu không có nhiệm vụ nào như vậy. Không phụ thuộc bản đồ hiện tại: đích nằm ở bản đồ
 * khác thì chỉ báo không hiện, nhưng chấm vẫn đứng đúng nhiệm vụ đó.
 */
export function trackedQuestId(
  quests: QuestView,
  pinned: string,
  npcs: readonly NpcDef[] = NPCS,
  quest: (id: string) => QuestDef | undefined = (id) => QUEST.get(id),
): string {
  if (pinned && quests.active[pinned]) return pinned;
  for (const id of Object.keys(quests.active)) {
    const def = quest(id);
    if (def && questGoal(def, quests.active[id]!, npcs)) return id;
  }
  return '';
}

interface Pt {
  x: number;
  y: number;
  z: number;
}
interface MonLike extends Pt {
  t: string;
  st: number;
}
interface NodeLike extends Pt {
  t: string;
  on: boolean;
}

/**
 * Chỗ gần nhất cho đích quái/điểm hái: con quái/điểm hái đang có gần nhất (theo trạng thái server
 * đã đồng bộ cho client), không có thì tâm vùng xuất hiện của bản đồ (dữ liệu tĩnh trong content).
 * Trả id thực thể (để bám vị trí mượt mỗi khung) hoặc một điểm tĩnh.
 */
export function nearestGoalSpot(
  goal: { kind: 'mon'; mon: string } | { kind: 'node'; item: string },
  px: number,
  pz: number,
  monsters: ReadonlyMap<string, MonLike>,
  nodes: ReadonlyMap<string, NodeLike>,
  level: LevelDef | undefined,
): { id: string } | { x: number; z: number } | null {
  let best = Infinity;
  let id = '';
  if (goal.kind === 'mon') {
    monsters.forEach((m, mid) => {
      if (m.t !== goal.mon || m.st === MS_DEAD) return;
      const d = (m.x - px) ** 2 + (m.z - pz) ** 2;
      if (d < best) {
        best = d;
        id = mid;
      }
    });
  } else {
    nodes.forEach((n, nid) => {
      if (n.t !== goal.item || !n.on) return;
      const d = (n.x - px) ** 2 + (n.z - pz) ** 2;
      if (d < best) {
        best = d;
        id = nid;
      }
    });
  }
  if (id) return { id };
  const zones =
    goal.kind === 'mon'
      ? (level ? levelSpawns(level) : []).filter((s) => s.mon === goal.mon)
      : level?.nodes.filter((s) => s.item === goal.item);
  let spot: { x: number; z: number } | null = null;
  best = Infinity;
  for (const s of zones ?? []) {
    const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
    if (d < best) {
      best = d;
      spot = { x: s.x, z: s.z };
    }
  }
  return spot;
}

// ---------------------------------------------------------------------------------------------

interface Slot {
  key: string;
  el: HTMLDivElement;
  arrow: HTMLDivElement;
  badge: HTMLDivElement;
  dist: HTMLDivElement;
  shownDist: number;
  shown: boolean;
}

const _p = new THREE.Vector3();

export class OffscreenIndicators {
  /** Vị trí các chỉ báo đã đặt trong khung này (để đẩy chỉ báo trùng chỗ ra xa nhau). */
  private spots: { x: number; y: number }[] = [];
  private slots: Slot[] = [];
  private cands: OffCandidate[] = [];
  private avoid: Rect[] = [];
  private avoidAt = 0;
  enabled = true;

  constructor(private layer: HTMLElement) {
    for (let i = 0; i < MAX_INDICATORS; i++) {
      const el = document.createElement('div');
      el.className = 'offs';
      const arrow = document.createElement('div');
      arrow.className = 'offs-arrow';
      const badge = document.createElement('div');
      badge.className = 'offs-badge';
      const dist = document.createElement('div');
      dist.className = 'offs-dist';
      el.append(arrow, badge, dist);
      layer.appendChild(el);
      this.slots.push({ key: '', el, arrow, badge, dist, shownDist: -1, shown: false });
    }
  }

  /** Thay danh sách ứng viên theo thứ tự ưu tiên; quá `MAX_INDICATORS` thì bỏ phần sau. */
  setCandidates(list: OffCandidate[]): void {
    const now = performance.now();
    if (list.length && now - this.avoidAt > 500) {
      // Đo lại khối HUD 2 lần/giây (HUD đổi theo boss, mục tiêu, số nhiệm vụ, cỡ cửa sổ).
      this.avoidAt = now;
      this.avoid.length = 0;
      for (const el of this.layer.ownerDocument.querySelectorAll(AVOID_SELECTOR)) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) this.avoid.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom });
      }
    }
    this.cands = list.length > MAX_INDICATORS ? list.slice(0, MAX_INDICATORS) : list;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      const c = this.cands[i];
      const key = c ? c.kind + ':' + c.key : '';
      if (key === s.key) continue;
      s.key = key;
      s.shownDist = -1;
      if (!c) {
        this.hide(s);
        continue;
      }
      s.el.dataset.k = c.kind;
      s.el.title = c.label;
      s.el.setAttribute('aria-label', c.label);
      s.badge.textContent = '';
      s.badge.removeAttribute('style');
      const st = c.icon ? contentIconStyle(c.icon) : null;
      if (st) {
        s.badge.classList.add('icon');
        Object.assign(s.badge.style, st);
      } else {
        s.badge.classList.remove('icon');
        // Atlas chưa sẵn: lần chọn sau (≈100 ms) thử lại.
        if (c.icon) s.key = '';
        // Dấu giống dấu trên đầu NPC trong thế giới: ! việc cần làm, ? chỗ trả nhiệm vụ.
        if (c.kind === 'quest') s.badge.textContent = '!';
        else if (c.kind === 'turnin') s.badge.textContent = '?';
        else if (c.kind === 'mark' || c.kind === 'mate') s.badge.textContent = '◆';
      }
    }
  }

  /** Mỗi khung: chiếu và đặt chỉ báo. `me` là vị trí người chơi để tính khoảng cách. */
  update(camera: THREE.Camera, w: number, h: number, me: { x: number; y: number; z: number }): void {
    const e = camera.matrixWorldInverse.elements;
    const pe = camera.projectionMatrix.elements;
    let placed = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      const c = this.cands[i];
      if (!c || !this.enabled || !c.pos(_p)) {
        this.hide(s);
        continue;
      }
      const vx = e[0] * _p.x + e[4] * _p.y + e[8] * _p.z + e[12];
      const vy = e[1] * _p.x + e[5] * _p.y + e[9] * _p.z + e[13];
      const vz = e[2] * _p.x + e[6] * _p.y + e[10] * _p.z + e[14];
      let at = edgePlace(vx, vy, vz, pe[0], pe[5], w, h);
      // Vật cao đứng gần: ngực ra khỏi khung nhưng chân vẫn thấy.
      if (at && c.span && !edgePlace(vx - e[4] * c.span, vy - e[5] * c.span, vz - e[6] * c.span, pe[0], pe[5], w, h)) at = null;
      if (!at) {
        this.hide(s);
        continue;
      }
      avoidRects(at, this.avoid, w, h);
      spreadFrom(at, this.spots, placed, w, DEFAULT_INSET);
      this.spots[placed++] = { x: at.x, y: at.y };
      if (!s.shown) {
        s.shown = true;
        s.el.classList.add('on');
      }
      s.el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      s.arrow.style.transform = `rotate(${at.angle.toFixed(3)}rad)`;
      const d = Math.round(Math.hypot(_p.x - me.x, _p.y - me.y, _p.z - me.z));
      if (d !== s.shownDist) {
        s.shownDist = d;
        s.dist.textContent = t('ui.offscreen.dist', { n: d });
      }
    }
  }

  private hide(s: Slot): void {
    if (!s.shown) return;
    s.shown = false;
    s.el.classList.remove('on');
  }

  clear(): void {
    this.setCandidates([]);
  }

  dispose(): void {
    for (const s of this.slots) s.el.remove();
    this.slots.length = 0;
  }
}
