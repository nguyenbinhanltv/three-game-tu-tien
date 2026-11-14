/**
 * Bảng phím của client. Mọi chỗ đọc phím (engine, bảng gỡ lỗi) đi qua đây để sau này
 * cho người chơi đổi phím chỉ cần sửa một nơi. Dùng `KeyboardEvent.code` (vị trí phím,
 * không phụ thuộc bố cục bàn phím hay bộ gõ tiếng Việt).
 */

/** Thao tác bấm một lần (xử lý ở keydown). */
export type Action =
  | 'target'
  | 'fly'
  | 'meditate'
  | 'interact'
  | 'autorun'
  | 'bag'
  | 'char'
  | 'quests'
  | 'map'
  | 'help'
  | 'chat'
  | 'cancel'
  | 'mouseLock'
  | 'debug';

export const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  Tab: 'target',
  KeyF: 'fly',
  KeyZ: 'meditate',
  KeyE: 'interact',
  KeyR: 'autorun',
  KeyB: 'bag',
  KeyI: 'bag',
  KeyC: 'char',
  KeyL: 'quests',
  KeyJ: 'quests',
  KeyM: 'map',
  KeyH: 'help',
  Enter: 'chat',
  Escape: 'cancel',
  AltLeft: 'mouseLock',
  AltRight: 'mouseLock',
  F3: 'debug',
};

/** Thao tác giữ phím (đọc mỗi khung từ tập phím đang giữ). */
export type HeldAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'camLeft'
  | 'camRight'
  | 'camUp'
  | 'camDown'
  | 'zoomIn'
  | 'zoomOut';

export const HELD: Readonly<Record<HeldAction, readonly string[]>> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  /** Nhảy khi đi bộ, bay lên khi ngự kiếm. */
  up: ['Space'],
  down: ['KeyX', 'ShiftLeft'],
  camLeft: ['ArrowLeft'],
  camRight: ['ArrowRight'],
  camUp: ['ArrowUp'],
  camDown: ['ArrowDown'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
};

const HELD_OF = new Map<string, HeldAction[]>();
for (const [a, codes] of Object.entries(HELD) as [HeldAction, readonly string[]][]) {
  for (const c of codes) HELD_OF.set(c, [...(HELD_OF.get(c) ?? []), a]);
}

export function isHeld(keys: ReadonlySet<string>, a: HeldAction): boolean {
  for (const c of HELD[a]) if (keys.has(c)) return true;
  return false;
}

/** Phím `code` thuộc thao tác giữ `a` không. */
export function isKeyFor(code: string, a: HeldAction): boolean {
  return HELD_OF.get(code)?.includes(a) ?? false;
}

/** Ô chiêu theo phím số: Digit1 → 0 … Digit9 → 8; -1 nếu không phải phím chiêu. */
export function skillSlot(code: string): number {
  if (!code.startsWith('Digit')) return -1;
  const n = Number(code.slice(5));
  return Number.isInteger(n) && n >= 1 ? n - 1 : -1;
}

/** Phím mà trình duyệt có hành vi mặc định cần chặn (cuộn trang, tìm kiếm của F3). */
export function preventsDefault(code: string): boolean {
  return code === 'Space' || code === 'F3' || code.startsWith('Arrow');
}

/**
 * Phím bổ trợ hay nuốt sự kiện thả phím khác (Cmd/Ctrl). Cố ý không có Shift (hạ độ cao khi bay)
 * và Alt (phím chơi: thả/khóa con trỏ); Alt xử lý hẹp hơn trong `KeyState`.
 */
export const STICKY_MODS: ReadonlySet<string> = new Set(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'OSLeft', 'OSRight']);

/** Cặp phím hướng ngược chiều. */
export const OPPOSITE_KEY: Readonly<Record<string, string>> = {
  KeyW: 'KeyS',
  KeyS: 'KeyW',
  KeyA: 'KeyD',
  KeyD: 'KeyA',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
};

export function isAlt(code: string): boolean {
  return code === 'AltLeft' || code === 'AltRight';
}
