/**
 * Bố cục HUD bốn góc (U2-2): hàm thuần, không đụng DOM. Mọi con số tính theo "đơn vị thiết kế" = px màn hình / `ui-scale`,
 * nên 4K (scale 2) vẫn là vùng 1920×1080 và 1280×720 (scale 0,85) là vùng 1506×847. CSS đọc cùng các hằng số này
 * (xem `hud.css`), `layout.test.ts` khẳng định các hộp vùng không giao nhau ở mọi độ phân giải.
 *
 * Thứ tự ưu tiên khi chật (bỏ/thu từ dưới lên): cụm kỹ năng + hub không bao giờ ẩn → thanh máu, boss → minimap thu nhỏ →
 * nhiệm vụ thu thanh → chat thu một dòng → tên chiêu vệt mực.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `standard` PC ≥ 1920 vùng thiết kế; `compact` khi scale < 0,95 (1280×720); `touch` chỉ chuẩn bị bố cục (U2-6 chưa làm). */
export type HudMode = 'standard' | 'compact' | 'touch';
export type SkillLayout = 'arc' | 'bar';

export const SAFE = 24; // lề an toàn PC
export const SAFE_TOUCH = 8; // lề cảm ứng (+ env(safe-area-inset-*))

export interface HudBoxes {
  mode: HudMode;
  W: number;
  H: number;
  tl: Box;
  tc: Box;
  hub: Box;
  map: Box;
  quest: Box;
  chat: Box;
  skills: Box;
  /** Ô tiện ích (pháp bảo, đan lô, thần thức, nguyên anh), hàng chiêu bậc cao, buff: bên trái cụm kỹ năng (bar: nằm trong hộp skills). */
  utility: Box;
}

export interface HudOpts {
  /** Nhiệm vụ thu thành thanh 34 px. */
  questCollapsed?: boolean;
  /** Chat thu thành một dòng 32 px. */
  chatCollapsed?: boolean;
  /** `bar` = thanh ngang giữa dưới (tùy chọn trong Cài đặt). */
  skillLayout?: SkillLayout;
}

/** Ngưỡng chế độ: compact khi hệ số < 0,95. */
export function modeOf(scale: number, touch = false): HudMode {
  if (touch) return 'touch';
  return scale < 0.95 ? 'compact' : 'standard';
}

/** Vùng thiết kế (đơn vị thiết kế) cho khung nhìn px màn hình và hệ số UI. */
export function designArea(w: number, h: number, scale: number): { W: number; H: number } {
  const s = scale > 0 ? scale : 1;
  return { W: Math.round(w / s), H: Math.round(h / s) };
}

/** Kích thước từng khối theo chế độ (đơn vị thiết kế). */
export const SIZES = {
  standard: { tl: { w: 420, h: 120 }, hubH: 48, hubW: 372, mapW: 190, mapH: 224, questW: 372, questH: 128, chatW: 400, chatH: 180 },
  compact: { tl: { w: 380, h: 118 }, hubH: 44, hubW: 340, mapW: 160, mapH: 194, questW: 340, questH: 118, chatW: 340, chatH: 120 },
} as const;
export const QUEST_COLLAPSED_H = 34;
export const CHAT_COLLAPSED_H = 32;
export const BOSS_MAX_W = 760;
export const BOSS_H = 84;

/** Hình học cụm kỹ năng PC (mục 9.1 kế hoạch): tâm đòn chính cách mép phải 90, mép dưới 100. */
export const CLUSTER = {
  mainCx: 90,
  mainCy: 116,
  mainD: 112,
  innerR: 188,
  innerN: 5,
  innerStep: 22.5,
  innerD: 64,
  outerR: 282,
  outerN: 4,
  outerStep: 30,
  outerD: 60,
  qerD: 56,
  qerGap: 66,
  /** Khoảng từ tâm đòn chính tới tâm ô Q gần nhất (ngang), và độ hạ của hàng Q/F/Z so với tâm đòn chính. */
  qerDx: 90,
  qerDy: 64,
} as const;

/** Hộp cụm kỹ năng (kể cả cung ngoài và hàng Q/E/R) theo kiểu bố cục. */
export function skillBox(W: number, H: number, layout: SkillLayout = 'arc'): Box {
  if (layout === 'bar') {
    const w = 640;
    const h = 150; // hàng 10 ô + hàng tiện ích
    return { x: Math.round((W - w) / 2), y: H - SAFE - h, w, h };
  }
  const reach = CLUSTER.outerR + CLUSTER.outerD / 2;
  const w = Math.round(reach + CLUSTER.mainCx - SAFE);
  const h = Math.round(reach + CLUSTER.mainCy - SAFE);
  return { x: W - SAFE - w, y: H - SAFE - h, w, h };
}

export const UTILITY = { w: 268, h: 112 } as const;

/** Hộp ô tiện ích: ngay bên trái cụm cung, sát mép dưới (kiểu bar: chiếm dải trên của hộp skills nên không có hộp riêng). */
export function utilityBox(skills: Box, layout: SkillLayout): Box {
  if (layout === 'bar') return { x: skills.x, y: skills.y, w: 0, h: 0 };
  return { x: skills.x - 8 - UTILITY.w, y: skills.y + skills.h - UTILITY.h, w: UTILITY.w, h: UTILITY.h };
}

/**
 * Chiều cao vùng thiết kế tối thiểu để cụm kỹ năng (neo đáy, kiểu cung) không đè khối nhiệm vụ mở của cột phải
 * (hub → minimap → nhiệm vụ, xếp từ trên xuống). `uiScaleFor` kẹp hệ số để vùng thiết kế không thấp hơn mức này.
 */
export function minDesignHeight(mode: Exclude<HudMode, 'touch'>): number {
  const z = SIZES[mode];
  const questBottom = SAFE + z.hubH + 12 + z.mapH + 10 + z.questH;
  return Math.ceil(questBottom + skillBox(0, 0, 'arc').h + SAFE);
}

/** Tất cả hộp vùng PC (standard/compact). Chế độ `touch` trả hộp tối thiểu để U2-6 mở rộng. */
export function hudBoxes(W: number, H: number, mode: HudMode = 'standard', o: HudOpts = {}): HudBoxes {
  if (mode === 'touch') return touchBoxes(W, H, o);
  const z = SIZES[mode];
  const tl: Box = { x: SAFE, y: SAFE, w: z.tl.w, h: z.tl.h };
  const trX = W - SAFE - z.hubW;
  const hub: Box = { x: trX, y: SAFE, w: z.hubW, h: z.hubH };
  const map: Box = { x: W - SAFE - z.mapW, y: hub.y + hub.h + 12, w: z.mapW, h: z.mapH };
  const quest: Box = {
    x: W - SAFE - z.questW,
    y: map.y + map.h + 10,
    w: z.questW,
    h: o.questCollapsed ? QUEST_COLLAPSED_H : z.questH,
  };
  const chatH = o.chatCollapsed ? CHAT_COLLAPSED_H : z.chatH;
  const chat: Box = { x: SAFE, y: H - SAFE - chatH, w: z.chatW, h: chatH };
  const side = Math.max(tl.w, z.hubW);
  const bossW = Math.max(0, Math.min(BOSS_MAX_W, W - 2 * (SAFE + side) - SAFE));
  const tc: Box = { x: Math.round((W - bossW) / 2), y: SAFE, w: bossW, h: BOSS_H };
  const skills = skillBox(W, H, o.skillLayout ?? 'arc');
  return { mode, W, H, tl, tc, hub, map, quest, chat, skills, utility: utilityBox(skills, o.skillLayout ?? 'arc') };
}

/** Bố cục cảm ứng ngang/dọc/tablet (chỉ chuẩn bị): lề 8, cụm kỹ năng dưới phải, hub gom lại thành một nút. */
function touchBoxes(W: number, H: number, o: HudOpts): HudBoxes {
  const m = SAFE_TOUCH;
  const portrait = H > W;
  const tl: Box = { x: m, y: m, w: portrait ? 190 : 230, h: 64 };
  const hub: Box = { x: W - m - 44, y: m, w: 44, h: 44 };
  const map: Box = { x: hub.x - 8 - 96, y: m, w: 96, h: 96 };
  const sw = portrait ? 220 : 250;
  const sh = portrait ? 210 : 190;
  const bossW = Math.max(0, portrait ? W - 2 * m : Math.min(520, map.x - (tl.x + tl.w) - 2 * m));
  const tc: Box = { x: portrait ? m : tl.x + tl.w + m, y: portrait ? Math.max(tl.y + tl.h, map.y + map.h) + 6 : m, w: bossW, h: 44 };
  const questY = portrait ? tc.y + tc.h + 6 : tl.y + tl.h + 6;
  const quest: Box = { x: m, y: questY, w: portrait ? 190 : 230, h: o.questCollapsed ? 28 : 56 };
  const chatH = o.chatCollapsed ? 28 : 64;
  const chat: Box = { x: m, y: H - m - 120 - 8 - chatH, w: portrait ? W - 3 * m - sw : 220, h: chatH };
  const skills: Box = { x: W - m - sw, y: H - m - sh, w: sw, h: sh };
  return { mode: 'touch', W, H, tl, tc, hub, map, quest, chat, skills, utility: { x: skills.x, y: skills.y, w: 0, h: 0 } };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Tên các cặp hộp đang giao nhau (rỗng = hợp lệ). `tc` (boss) chỉ có mặt khi đánh boss nhưng vẫn phải chừa chỗ. */
export function overlaps(b: HudBoxes): string[] {
  const keys = ['tl', 'tc', 'hub', 'map', 'quest', 'chat', 'skills', 'utility'] as const;
  const out: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (intersects(b[keys[i]!], b[keys[j]!])) out.push(`${keys[i]}×${keys[j]}`);
    }
  }
  return out;
}

export interface SlotPos {
  /** Tâm ô, tính từ góc trên-trái của hộp `skills` (arc) hoặc từ tâm hàng (bar). */
  cx: number;
  cy: number;
  d: number;
}

export interface ClusterGeom {
  main: SlotPos;
  inner: SlotPos[];
  outer: SlotPos[];
  /** Hàng ngắn Q / F / Z nằm ngang bên trái dưới đòn chính. */
  qer: SlotPos[];
}

/**
 * Tâm các ô của cụm cung, tính trong hệ tọa độ góc trên-trái của `skillBox` (px thiết kế).
 * Hai cung đồng tâm quanh đòn chính, cùng trải từ 180° (hướng trái) tới 270° (hướng lên), chia đều theo góc.
 */
export function clusterGeom(box: Box): ClusterGeom {
  const C = CLUSTER;
  const cx = box.w + 24 - C.mainCx; // tâm đòn chính cách mép phải của vùng thiết kế 90 (hộp cách mép 24)
  const cy = box.h + 24 - C.mainCy;
  const at = (r: number, deg: number, d: number): SlotPos => {
    const a = (deg * Math.PI) / 180;
    return { cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), d };
  };
  const inner = Array.from({ length: C.innerN }, (_, i) => at(C.innerR, 180 + i * C.innerStep, C.innerD));
  const outer = Array.from({ length: C.outerN }, (_, i) => at(C.outerR, 180 + i * C.outerStep, C.outerD));
  const qer = [0, 1, 2].map((i) => ({ cx: cx - C.qerDx - (2 - i) * C.qerGap, cy: cy + C.qerDy, d: C.qerD }));
  return { main: { cx, cy, d: C.mainD }, inner, outer, qer };
}

/** Các ô tròn (ô vuông ngoại tiếp) có chạm nhau không: dùng cho test hình học cụm. */
export function slotsTouch(a: SlotPos, b: SlotPos, gap = 0): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.d + b.d) / 2 + gap;
}
