/**
 * Hành trình theo chương (U2-4): kiểu dữ liệu và hàm thuần cho màn "Bản đồ chương". Dữ liệu ở `content/data/chapters.json`;
 * chỉ ĐỌC dữ liệu có sẵn, không gửi gì lên server (server vẫn quyết định cấp, vé phó bản, truyền tống).
 */
import { TELE_FREE } from './teleport';

export type ChapterNodeKind = 'world' | 'dungeon' | 'boss' | 'trib';

export interface ChapterNodeDef {
  id: string;
  kind: ChapterNodeKind;
  /** world/dungeon: id level; boss: id quái; trib: id kiếp (`tribulations.json`). */
  ref: string;
  /** Vị trí trên khung bản đồ, phần trăm 0–100. */
  x: number;
  y: number;
  /** Cấp tối thiểu để dự. */
  minLevel: number;
  /** Id trận truyền tống đến nút này (chỉ nút thế giới). */
  tele?: string;
}

export interface ChapterDef {
  id: string;
  /** Level thế giới của chương. */
  level: string;
  /** Id tranh nền (`art/loading`). */
  art: string;
  /** Khoảng cấp [thấp, cao] của chương. */
  levels: [number, number];
  /** Nhiệm vụ chốt chương: xong thì chương "đã qua". */
  closeQuest: string;
  nodes: ChapterNodeDef[];
  /** Vật phẩm nổi bật (chọn tay, không phải bảng rơi). */
  featured: string[];
}

/** Trạng thái hiển thị: here = bạn ở đây, open = mở, hint = gợi ý kế tiếp, done = đã qua, lock = khóa. */
export type ChapterState = 'here' | 'open' | 'hint' | 'done' | 'lock';

export interface ChapterCtx {
  level: number;
  /** Level thế giới người chơi đang đứng (room hiện tại), hoặc ''. */
  currentLevel: string;
  questsDone: readonly string[];
  /** Trận truyền tống đã mở (không gồm trận mở sẵn). */
  teleOpen: readonly string[];
}

/** Chương: đã qua khi xong nhiệm vụ chốt hoặc cấp vượt khoảng cấp; khóa khi cấp thấp hơn mốc thấp nhất; "ở đây" khi đang đứng trong level của nó. */
export function chapterState(def: ChapterDef, ctx: ChapterCtx): ChapterState {
  if (ctx.questsDone.includes(def.closeQuest) || ctx.level > def.levels[1]) return 'done';
  if (def.level === ctx.currentLevel) return 'here';
  if (ctx.level < def.levels[0]) return 'lock';
  return 'open';
}

/** Nút kế tiếp nên làm: nút không phải nút thế giới, đủ cấp, chưa qua, thấp nhất theo `minLevel` rồi theo thứ tự khai báo. */
export function hintNode(def: ChapterDef, ctx: ChapterCtx): string | null {
  if (chapterState(def, ctx) === 'done') return null;
  let best: ChapterNodeDef | null = null;
  for (const n of def.nodes) if (n.kind !== 'world' && n.minLevel <= ctx.level && (!best || n.minLevel < best.minLevel)) best = n;
  return best ? best.id : null;
}

export function nodeState(def: ChapterDef, node: ChapterNodeDef, ctx: ChapterCtx): ChapterState {
  const ch = chapterState(def, ctx);
  if (ch === 'done') return 'done';
  if (ctx.level < node.minLevel) return 'lock';
  if (node.kind === 'world' && node.ref === ctx.currentLevel) return 'here';
  return hintNode(def, ctx) === node.id ? 'hint' : 'open';
}

/** Truyền tống được đến nút (nút thế giới có trận đã mở hoặc mở sẵn). Lệnh vẫn do server kiểm. */
export function canTeleTo(node: ChapterNodeDef, ctx: ChapterCtx): boolean {
  return !!node.tele && (TELE_FREE.includes(node.tele) || ctx.teleOpen.includes(node.tele)) && ctx.level >= node.minLevel;
}

/** Tiến độ chương: số nút đã qua trên tổng số nút. */
export function chapterProgress(def: ChapterDef, ctx: ChapterCtx): { done: number; total: number } {
  return { done: def.nodes.filter((n) => nodeState(def, n, ctx) === 'done').length, total: def.nodes.length };
}
