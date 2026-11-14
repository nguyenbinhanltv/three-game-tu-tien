import { create } from 'zustand';
import type { CharView, Equipment, InvSlot, QuestView } from '@dtl/shared';

export interface TargetInfo {
  id: string;
  kind: 'mon' | 'npc' | 'player';
  name: string;
  level: number;
  hp: number;
  mhp: number;
  boss: boolean;
  /** Boss đang niệm chú hoặc đang choáng: `end` theo đồng hồ client (ms), `open` = tỉ lệ đoạn hộ chú. */
  cast?: TargetCast;
}

export interface TargetCast {
  kind: 'chant' | 'stun';
  end: number;
  total: number;
  open: number;
}

export interface LogLine {
  id: number;
  text: string;
  type: string;
  from?: string;
}

export interface Toast {
  id: number;
  text: string;
  type: string;
}

/** Số liệu cho bảng gỡ lỗi F3; engine chỉ điền khi bảng đang mở. */
export interface DebugInfo {
  /** Mã phím đang giữ theo engine (KeyboardEvent.code). */
  keys: string[];
  /** Khóa i18n của các trạng thái đang bật (ui.debug.st.*). */
  states: string[];
  /** Tốc độ ngang, m/giây. */
  speed: number;
  /** Cửa sổ có focus (document.hasFocus()). */
  focus: boolean;
  visible: boolean;
  /** Thẻ phần tử đang focus, ví dụ 'CANVAS', 'INPUT', 'BODY'. */
  active: string;
  pointerLock: boolean;
  controls: string;
  /** 8 sự kiện phím gần nhất, cũ trước mới sau; `ago` tính bằng ms. */
  events: { id: number; kind: 'down' | 'up' | 'clear'; code: string; ago: number }[];
  /** Ping ước tính (ms), 0 nếu chưa đo được. */
  ping: number;
  room: string;
  roomId: string;
  sid: string;
}

export type Panel = null | 'bag' | 'char' | 'quests' | 'help' | 'settings' | 'map';
export type Phase = 'login' | 'connecting' | 'loading' | 'game' | 'error';

export interface UIState {
  phase: Phase;
  error: string;
  needName: boolean;
  nameError: string;
  room: string;
  dev: boolean;
  char: CharView | null;
  inv: InvSlot[];
  equip: Equipment;
  quests: QuestView;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  flags: number;
  target: TargetInfo | null;
  log: LogLine[];
  toasts: Toast[];
  /** id skill → thời điểm (đồng hồ client, ms) dùng lại được. */
  cds: Record<string, number>;
  gcdAt: number;
  castEnd: number;
  castTotal: number;
  tribEnd: number;
  panel: Panel;
  npc: string | null;
  hint: string;
  x: number;
  y: number;
  z: number;
  zone: string;
  fps: number;
  perf: string;
  autoAttack: boolean;
  wantFly: boolean;
  chatOpen: boolean;
  quality: string;
  /** Kiểu điều khiển: 'mouse' (nhìn bằng chuột kiểu FPS), 'turn' (A/D xoay) hoặc 'strafe' (kéo chuột). */
  controls: string;
  /** Con trỏ đang bị khóa để nhìn bằng chuột. */
  mouseLook: boolean;
  /** Ô chiêu đang chờ hết GCD để gửi (M1-11), -1 nếu không có. */
  queuedSkill: number;
  /** Bảng gỡ lỗi F3 đang mở. */
  debugOpen: boolean;
  debug: DebugInfo | null;
}

export const useUI = create<UIState>(() => ({
  phase: 'login',
  error: '',
  needName: false,
  nameError: '',
  room: '',
  dev: false,
  char: null,
  inv: [],
  equip: {},
  quests: { active: {}, done: [] },
  hp: 1,
  mhp: 1,
  mp: 0,
  mmp: 0,
  flags: 0,
  target: null,
  log: [],
  toasts: [],
  cds: {},
  gcdAt: 0,
  castEnd: 0,
  castTotal: 0,
  tribEnd: 0,
  panel: null,
  npc: null,
  hint: '',
  x: 0,
  y: 0,
  z: 0,
  zone: '',
  fps: 0,
  perf: '',
  autoAttack: false,
  wantFly: false,
  chatOpen: false,
  quality: localStorage.getItem('dtl.quality') ?? 'medium',
  controls: ['turn', 'strafe'].includes(localStorage.getItem('dtl.controls') ?? '') ? (localStorage.getItem('dtl.controls') as string) : 'mouse',
  mouseLook: false,
  queuedSkill: -1,
  debugOpen: false,
  debug: null,
}));

let nextId = 1;

export function pushLog(text: string, type = 'info', from?: string): void {
  useUI.setState((s) => {
    const log = s.log.length > 120 ? s.log.slice(-90) : s.log.slice();
    log.push({ id: nextId++, text, type, from });
    return { log };
  });
}

let lastToast = '';
let lastToastAt = 0;

export function pushToast(text: string, type = 'info'): void {
  // Không lặp lại cùng một thông báo liên tiếp.
  const now = Date.now();
  if (text === lastToast && now - lastToastAt < 2000) return;
  lastToast = text;
  lastToastAt = now;
  const id = nextId++;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, type }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3200);
}

export function togglePanel(p: Panel): void {
  useUI.setState((s) => ({ panel: s.panel === p ? null : p, npc: null }));
}

export const set = useUI.setState;
export const get = useUI.getState;
