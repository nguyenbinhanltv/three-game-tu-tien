/**
 * Bố cục cửa sổ (TD-B): hàm thuần, tọa độ theo "đơn vị thiết kế" (px CSS bên trong `zoom: var(--ui-scale)`).
 * `vw`/`vh` truyền vào đã chia cho hệ số phóng.
 */

export type WinId = 'bag' | 'char' | 'quests' | 'help' | 'settings' | 'map' | 'method' | 'party';

export interface WinState {
  id: WinId;
  x: number;
  y: number;
  z: number;
}

export interface Viewport {
  vw: number;
  vh: number;
}

/** Chừa đáy cho thanh chiêu (khớp `.k-window` trong kit.css). */
export const BOTTOM_RESERVE = 136;
export const WIN_GAP = 12;
export const WIN_MARGIN = 12;

/** Chiều rộng thiết kế từng cửa sổ (khớp `width` truyền cho PanelWindow). */
export const WIN_WIDTH: Record<WinId, number> = { bag: 520, char: 560, quests: 460, help: 520, settings: 430, map: 980, method: 600, party: 460 };
/** Chiều cao ước lượng để canh giữa (cửa sổ cuộn nên không biết trước). */
export const WIN_HEIGHT: Record<WinId, number> = { bag: 600, char: 680, quests: 520, help: 460, settings: 600, map: 640, method: 600, party: 520 };

/** Cửa sổ ghép đôi: nhân vật bên trái, túi bên phải. */
export const PAIR_LEFT: WinId = 'char';
export const PAIR_RIGHT: WinId = 'bag';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function winWidth(id: WinId, vp: Viewport): number {
  return Math.min(WIN_WIDTH[id], vp.vw - 2 * WIN_MARGIN);
}

export function maxHeight(vp: Viewport): number {
  return vp.vh - BOTTOM_RESERVE - 16;
}

export function winRect(w: WinState, vp: Viewport): Rect {
  return { x: w.x, y: w.y, w: winWidth(w.id, vp), h: Math.min(WIN_HEIGHT[w.id], maxHeight(vp)) };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Giữ thanh tiêu đề trong màn hình: luôn còn ≥ 120 px chiều ngang và cả thanh tiêu đề nằm trong khung. */
export function clampPos(id: WinId, x: number, y: number, vp: Viewport): { x: number; y: number } {
  const w = winWidth(id, vp);
  const keep = Math.min(120, w);
  return {
    x: Math.round(Math.min(Math.max(x, keep - w), vp.vw - keep)),
    y: Math.round(Math.min(Math.max(y, 0), Math.max(0, vp.vh - 48))),
  };
}

/** Vị trí mặc định: giữa phần màn hình trên thanh chiêu. */
export function defaultPos(id: WinId, vp: Viewport): { x: number; y: number } {
  const w = winWidth(id, vp);
  const h = Math.min(WIN_HEIGHT[id], maxHeight(vp));
  return clampPos(id, (vp.vw - w) / 2, Math.max(WIN_MARGIN, (vp.vh - BOTTOM_RESERVE - h) / 2), vp);
}

/** Hai cửa sổ cạnh nhau, cả cặp nằm giữa màn hình. Màn quá hẹp thì chồng một phần (vẫn thấy cả hai thanh tiêu đề). */
export function pairLayout(vp: Viewport): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const wl = winWidth(PAIR_LEFT, vp);
  const wr = winWidth(PAIR_RIGHT, vp);
  const total = wl + wr + WIN_GAP;
  const x0 = Math.max(WIN_MARGIN / 2, (vp.vw - total) / 2);
  const hl = Math.min(WIN_HEIGHT[PAIR_LEFT], maxHeight(vp));
  const hr = Math.min(WIN_HEIGHT[PAIR_RIGHT], maxHeight(vp));
  // Cùng một mép trên cho cả hai bảng (canh theo bảng cao hơn).
  const y = Math.round(Math.max(WIN_MARGIN, (vp.vh - BOTTOM_RESERVE - Math.max(hl, hr)) / 2));
  return { left: { x: Math.round(x0), y }, right: { x: Math.round(x0 + wl + WIN_GAP), y } };
}

export interface OpenResult {
  list: WinState[];
  /** Cửa sổ vừa mở hoặc vừa đưa lên trên. */
  opened: WinState;
}

/** Xếp lại z về 1..N theo thứ tự hiện tại: z không bao giờ vượt số cửa sổ (tối đa 8), nên không vượt các lớp toast/modal/tooltip. */
export function normalizeZ(list: readonly WinState[]): WinState[] {
  const order = [...list].sort((a, b) => a.z - b.z);
  return list.map((w) => ({ ...w, z: order.findIndex((o) => o.id === w.id) + 1 }));
}

export function topZ(list: readonly WinState[]): number {
  return list.reduce((m, w) => Math.max(m, w.z), 0);
}

/**
 * Mở cửa sổ `id`. `saved` là vị trí người chơi đã kéo lần trước (nếu có). Nếu chồng lên cửa sổ khác:
 * - bag + char: xếp cạnh nhau (nhân vật trái, túi phải);
 * - còn lại: xếp bậc thang 28 px từ cửa sổ bị đè.
 */
export function openWindow(list: readonly WinState[], id: WinId, vp: Viewport, saved?: { x: number; y: number } | null): OpenResult {
  if (list.some((w) => w.id === id)) return focusWindow(list, id);
  const z = topZ(list) + 1;
  const base = saved ? clampPos(id, saved.x, saved.y, vp) : defaultPos(id, vp);
  let opened: WinState = { id, x: base.x, y: base.y, z };
  let next = [...list];
  const hit = next.find((o) => overlaps(winRect(opened, vp), winRect(o, vp)));
  if (hit) {
    const pair = (id === PAIR_LEFT && hit.id === PAIR_RIGHT) || (id === PAIR_RIGHT && hit.id === PAIR_LEFT);
    if (pair) {
      const p = pairLayout(vp);
      const mine = id === PAIR_LEFT ? p.left : p.right;
      const other = id === PAIR_LEFT ? p.right : p.left;
      opened = { ...opened, x: mine.x, y: mine.y };
      next = next.map((o) => (o.id === hit.id ? { ...o, x: other.x, y: other.y } : o));
    } else {
      const c = clampPos(id, hit.x + 28, hit.y + 28, vp);
      opened = { ...opened, x: c.x, y: c.y };
    }
  }
  next.push(opened);
  next = normalizeZ(next);
  return { list: next, opened: next.find((o) => o.id === id)! };
}

export function focusWindow(list: readonly WinState[], id: WinId): OpenResult {
  const w = list.find((o) => o.id === id);
  if (!w) throw new Error('window not open: ' + id);
  const next = w.z === topZ(list) ? [...list] : normalizeZ(list.map((o) => (o.id === id ? { ...o, z: topZ(list) + 1 } : o)));
  return { list: next, opened: next.find((o) => o.id === id)! };
}

export function closeWindow(list: readonly WinState[], id: WinId): WinState[] {
  return list.filter((w) => w.id !== id);
}

/** Cửa sổ trên cùng (Esc đóng cái này) hoặc null. */
export function topWindow(list: readonly WinState[]): WinState | null {
  let best: WinState | null = null;
  for (const w of list) if (!best || w.z > best.z) best = w;
  return best;
}

export function moveWindow(list: readonly WinState[], id: WinId, x: number, y: number, vp: Viewport): WinState[] {
  const c = clampPos(id, x, y, vp);
  return list.map((w) => (w.id === id ? { ...w, x: c.x, y: c.y } : w));
}

const KEY = 'dtl.win.';

export function loadSavedPos(id: WinId): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + id) ?? 'null') as { x?: unknown; y?: unknown } | null;
    return v && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}

export function savePos(id: WinId, x: number, y: number): void {
  try {
    localStorage.setItem(KEY + id, JSON.stringify({ x, y }));
  } catch {
    /* localStorage đầy hoặc bị chặn: bỏ qua */
  }
}
