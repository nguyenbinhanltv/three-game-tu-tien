// Minimap (M-3): phần logic thuần, không đụng DOM/canvas để test được.
import type { NpcDef, QuestDef, QuestView, SpiritKind, ZoneDef } from '@dtl/shared';
import { zoneAt } from '@dtl/shared';

/** Ba mức phóng: số mét hiển thị theo mỗi chiều. */
export const ZOOM_SPANS = [120, 250, 500] as const;
export const DEFAULT_ZOOM = 1;

export function clampZoom(i: number): number {
  return Math.max(0, Math.min(ZOOM_SPANS.length - 1, Math.round(i)));
}

export type MarkKind = 'npc' | 'mon' | 'elite' | 'boss' | 'mate' | 'player' | 'node' | 'portal' | 'tele' | 'goal' | 'flag' | 'scan';
export type QuestMark = '' | 'give' | 'turn' | 'wait';
export type Tone = 'gray' | 'white' | 'yellow' | 'red';

/** Một biểu tượng trên minimap, toạ độ thế giới. `label` đã qua i18n. */
export interface Mark {
  kind: MarkKind;
  id: string;
  x: number;
  z: number;
  label: string;
  /** Dòng phụ trong tooltip (cấp, chức năng, trạng thái). */
  sub?: string;
  /** Mô tả thêm trong tooltip (danh hiệu NPC). */
  desc?: string;
  tone?: Tone;
  /** Đồng đội: số thứ tự (1–4). */
  num?: number;
  /** NPC: dấu nhiệm vụ. */
  quest?: QuestMark;
  /** Quái chết/boss đang hồi sinh. */
  dead?: boolean;
  /** Thời điểm (Date.now) boss hồi sinh, nếu server có báo. */
  respawnAt?: number;
  /** Bán kính vùng tô (m), cho `goal`. */
  radius?: number;
  /** Điểm đánh dấu: của mình (vàng) hay của đồng đội (lam). */
  own?: boolean;
  /** Dấu thần thức (E2-E): loại điểm lộ ra. */
  scanKind?: SpiritKind;
  /** Nhấp nháy tới thời điểm này (performance.now, ms). */
  hurtUntil?: number;
}

/**
 * Móc nối cho M-2: server chưa gửi giờ hồi sinh boss. Khi có, ghi `bossRespawnAt.set(<id quái>, Date.now() + ms)`
 * (hoặc xoá khi boss sống lại); minimap tự hiện đồng hồ ở biểu tượng và tooltip. Đừng đổi tên khoá.
 */
export const minimapHooks = {
  bossRespawnAt: new Map<string, number>(),
  /** Truyền tống trận đã mở (M-4): { id, x, z, label }. */
  teleports: [] as { id: string; x: number; z: number; label: string }[],
};

/** Màu độ khó của quái so với cấp mình: xám (dễ) → trắng → vàng → đỏ (khó). */
export function difficultyTone(monLevel: number, myLevel: number): Tone {
  const d = monLevel - myLevel;
  if (d <= -4) return 'gray';
  if (d <= 0) return 'white';
  if (d <= 2) return 'yellow';
  return 'red';
}

export type NpcFn = 'root' | 'alchemy' | 'smith' | 'trade' | 'quest';

/** Chức năng chính của NPC (nhãn trên tooltip), suy từ dữ liệu NPC. */
export function npcFunction(n: NpcDef): NpcFn {
  if (n.enhance) return 'smith';
  if (n.recipes) return 'alchemy';
  if (n.sells?.length) return 'trade';
  if (n.rootChange) return 'root';
  return 'quest';
}

/**
 * Dấu nhiệm vụ trên đầu NPC — cùng luật với dấu ! / ? ở EntityManager.updateQuestMarkers:
 * trả nhiệm vụ xong > nhận nhiệm vụ mới > nhiệm vụ đang làm dở.
 */
export function npcQuestMark(npcId: string, quests: readonly QuestDef[], q: QuestView, level: number): QuestMark {
  let state: QuestMark = '';
  const rank = { '': 0, wait: 1, give: 2, turn: 3 } as const;
  const bump = (s: QuestMark) => {
    if (rank[s] > rank[state]) state = s;
  };
  for (const def of quests) {
    if (q.done.includes(def.id)) continue;
    const prog = q.active[def.id];
    if (prog) {
      if (def.turnin === npcId) {
        const complete = def.objectives.every((o, i) => (prog[i] ?? 0) >= o.count || (o.type === 'talk' && o.target === npcId));
        bump(complete ? 'turn' : 'wait');
      }
    } else if (def.giver === npcId && (!def.requires || q.done.includes(def.requires)) && (def.minLevel ?? 1) <= level) bump('give');
  }
  return state;
}

export type ZoneStatus = 'ok' | 'low' | 'high' | 'none';

/** Vùng đang đứng và mình có hợp cấp không (`low` = cấp thấp hơn khoảng hợp, `high` = cao hơn). */
export function zoneStatus(zones: readonly ZoneDef[] | undefined, x: number, z: number, level: number): { zone: ZoneDef | undefined; status: ZoneStatus } {
  const zone = zoneAt(zones, x, z);
  if (!zone) return { zone, status: 'none' };
  return { zone, status: level < zone.lvMin ? 'low' : level > zone.lvMax ? 'high' : 'ok' };
}

export interface View {
  /** Tâm là vị trí người chơi (thế giới). */
  cx: number;
  cz: number;
  /** Mét hiển thị theo mỗi chiều. */
  span: number;
  /** Cạnh canvas (px CSS). */
  size: number;
  /** Góc xoay của bản đồ (rad, chiều kim đồng hồ). 0 = Bắc lên trên. Chế độ xoay theo camera: truyền `yaw`. */
  rot: number;
}

/** Thế giới → toạ độ trên canvas (trục z thế giới hướng xuống, x sang phải: Bắc = −z là phía trên). */
export function project(v: View, x: number, z: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const s = v.size / v.span;
  const dx = (x - v.cx) * s;
  const dz = (z - v.cz) * s;
  const c = Math.cos(v.rot);
  const si = Math.sin(v.rot);
  out.x = v.size / 2 + dx * c - dz * si;
  out.y = v.size / 2 + dx * si + dz * c;
  return out;
}

/** Điểm ngoài khung → vị trí trên mép (cách mép `margin` px) cùng góc mũi tên hướng ra ngoài. `inside` nếu điểm nằm trong. */
export function edgeClamp(x: number, y: number, size: number, margin: number): { x: number; y: number; angle: number; inside: boolean } {
  const h = size / 2;
  const dx = x - h;
  const dy = y - h;
  const lim = h - margin;
  if (Math.abs(dx) <= lim && Math.abs(dy) <= lim) return { x, y, angle: Math.atan2(dy, dx), inside: true };
  const k = lim / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: h + dx * k, y: h + dy * k, angle: Math.atan2(dy, dx), inside: false };
}

/** Biểu tượng gần con trỏ nhất trong bán kính `maxD` (px); `pts` là toạ độ màn hình đã chiếu. */
export function nearestIndex(pts: readonly { x: number; y: number; r: number }[], mx: number, my: number, maxD = 9): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d = Math.hypot(p.x - mx, p.y - my) - p.r;
    if (d < maxD && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Số giây còn lại → "m:ss" (hoặc "ss s"). Âm → "0:00". */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Hướng la bàn tới điểm đích (rad theo canvas, 0 = sang phải), dùng cho mũi tên mục tiêu ngoài tầm. */
export function arrowAngle(v: View, x: number, z: number): number {
  const p = project(v, x, z);
  return Math.atan2(p.y - v.size / 2, p.x - v.size / 2);
}

/** Ngược của `project`: toạ độ trên canvas → thế giới. */
export function screenToWorld(v: View, sx: number, sy: number): { x: number; z: number } {
  const s = v.size / v.span;
  const dx = sx - v.size / 2;
  const dy = sy - v.size / 2;
  const c = Math.cos(v.rot);
  const si = Math.sin(v.rot);
  return { x: v.cx + (dx * c + dy * si) / s, z: v.cz + (-dx * si + dy * c) / s };
}

/** Tỉ lệ điểm ảnh thật của canvas: DPR × hệ số phóng HUD (`--ui-scale`), làm tròn lên 0,25 để bộ nhớ đệm biểu tượng không phình, trần 4. */
export function backingScale(dpr: number, ui: number): number {
  return Math.min(4, Math.max(1, Math.ceil((dpr || 1) * (ui || 1) * 4 - 1e-9) / 4));
}
