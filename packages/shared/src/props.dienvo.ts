// Diễn Võ Trường (phòng tập GM, level `dien_vo`): sáu khu và đạo cụ. Dùng chung client (vẽ sàn, biển tên) và server (xếp quái gọi ra, va chạm).
// Sàn vuông 48 × 48 m quanh tâm (1300, 985); +z là phía cửa ra.
import type { HandProp } from './props.types';
import layoutJson from './props.dienvo.layout.json';

export const DIEN_VO_CENTER = { x: 1300, z: 985 };
/** Nửa cạnh sàn đá (m). */
export const DIEN_VO_HALF = 24;

export type DienVoZoneId = 'arena' | 'boss' | 'stage' | 'props' | 'light' | 'fx';

export interface DienVoZone {
  id: DienVoZoneId;
  x: number;
  z: number;
  /** Bán kính (khu tròn) hoặc nửa cạnh theo x và z (khu chữ nhật). */
  r?: number;
  hx?: number;
  hz?: number;
}

export const DIEN_VO_ZONES: readonly DienVoZone[] = [
  // Sàn đấu: hình nộm và quái thường, ngay trước điểm vào.
  { id: 'arena', x: 1300, z: 985, r: 8 },
  // Hố boss: phía bắc, đủ rộng cho boss thân to.
  { id: 'boss', x: 1300, z: 968, r: 6 },
  // Bục nhân vật: góc tây nam, xem nhân vật ở góc 52° và cận.
  { id: 'stage', x: 1283, z: 1001, r: 4 },
  // Hành lang đạo cụ: hàng ngang ở mép bắc phía tây, đứng phía nam nhìn lên là thấy cả hàng trong một khung.
  { id: 'props', x: 1285, z: 964, hx: 7.5, hz: 3 },
  // Buồng ánh sáng: góc đông bắc.
  { id: 'light', x: 1318, z: 968, hx: 5, hz: 6 },
  // Tường hiệu ứng: dọc mép đông.
  { id: 'fx', x: 1319, z: 992, hx: 4, hz: 10 },
];

export function dienVoZone(id: DienVoZoneId): DienVoZone {
  return DIEN_VO_ZONES.find((z) => z.id === id)!;
}

/**
 * Chỗ đứng thứ `i` trong `n` con quái gọi ra ở phòng tập: quái thường xếp vòng trong sàn đấu, boss đứng giữa hố boss (nhiều boss thì xếp vòng nhỏ).
 * Hàm thuần để server đặt quái và test kiểm mọi chỗ đứng nằm trong khu.
 */
export function dienVoSpawnAt(i: number, n: number, boss: boolean): { x: number; z: number } {
  const z = dienVoZone(boss ? 'boss' : 'arena');
  // Điểm gọi quái đặt tay (chế độ chỉnh phòng, `props.dienvo.layout.json`): con thứ i đứng đúng điểm thứ i; hết điểm thì xếp vòng như cũ.
  const slot = DIEN_VO_LAYOUT.spawns[boss ? 'boss' : 'arena'][i];
  if (slot) return { x: slot.x, z: slot.z };
  if (n <= 1) return { x: z.x, z: z.z };
  const ring = Math.min((z.r ?? 6) - 1.5, boss ? 3 : 2.5 + n * 0.25);
  // Lệch nửa bước: không con nào đứng thẳng hướng bắc (mép trên khung hình ở camera 0°), con đầu danh sách (tinh anh) nằm chếch trong khung.
  const a = ((i + 0.5) / n) * Math.PI * 2;
  return { x: z.x + Math.sin(a) * ring, z: z.z - Math.cos(a) * ring };
}

/** Chỗ người chơi đứng khi nạp cảnh mẫu ở khu `id`: mép nam của khu (phía cửa ra), nhìn vào giữa khu; khu nhỏ thì đứng giữa. */
export function dienVoStandAt(id: DienVoZoneId): { x: number; z: number } {
  const z = dienVoZone(id);
  const half = z.r ?? z.hz ?? 0;
  // Khu tròn/lớn: đứng trong, sát mép nam. Khu chữ nhật hẹp (hành lang): đứng ngay ngoài mép nam để không đè lên vật bày.
  if (half > 5) return { x: z.x, z: z.z + half - 2 };
  return { x: z.x, z: z.hz ? z.z + z.hz + 1.5 : z.z };
}

/**
 * Cảnh mẫu của phòng tập (`packages/content/data/lab/scenes.json`): một tình huống dựng lại y hệt bằng `/gm scene <id>`,
 * là gốc của bộ ảnh chuẩn (`pnpm shots dienvo`). `state` ép lên mọi quái của cảnh; `cam` chỉ dùng khi chụp.
 */
export interface LabScene {
  id: string;
  at: DienVoZoneId;
  /** Công pháp và cấp của nhân vật thử. */
  method: string;
  level: number;
  mons: { id: string; n: number }[];
  state?: 'weak' | 'break' | 'stun' | 'chant';
  phase?: number;
  cam?: { pitch?: number; dist?: number };
  /**
   * Cảnh ĐANG ĐÁNH (chỉ dùng khi chụp): nhắm quái gần nhất, bấm ô chiêu `slot` (0 = đòn thường, bật tự đánh) rồi chụp sau `waitMs`.
   * Ảnh loại này không lặp lại y hệt nên không so SSIM; dùng để soi vệt chém, tự áp sát, nhịp đòn.
   */
  act?: { slot: number; waitMs: number };
}

/** Khu có điểm gọi quái đặt tay. */
export type DienVoSpawnZone = 'arena' | 'boss';

/**
 * Bố cục chỉnh tay của phòng (`props.dienvo.layout.json`): đạo cụ (đèn đá `prop_den_da` cũng là nguồn sáng) và điểm gọi quái.
 * Sửa bằng chế độ chỉnh phòng (kéo thả trong phòng, chỉ ở máy phát triển) hoặc sửa tay file JSON; file là nguồn duy nhất, đổi qua commit.
 */
export interface DienVoLayout {
  props: HandProp[];
  /** Điểm gọi quái theo thứ tự: quái thứ i của `/gm spawn` hay cảnh mẫu đứng ở điểm thứ i; rỗng = xếp vòng quanh tâm khu. */
  spawns: Record<DienVoSpawnZone, { x: number; z: number }[]>;
}

const MAX_PROPS = 200;
const MAX_SPAWNS = 40;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inFloor = (x: number, z: number) => Math.abs(x - DIEN_VO_CENTER.x) <= DIEN_VO_HALF && Math.abs(z - DIEN_VO_CENTER.z) <= DIEN_VO_HALF;

/**
 * Kiểm và chuẩn hóa một bố cục đọc từ file hay nhận từ trình chỉnh: sai thì trả `err` (không ném), đúng thì trả bản sao đã làm tròn 3 số lẻ.
 * Luật: đạo cụ nằm trong sàn, id dạng `prop_*`, tỉ lệ 0,05–5, bán kính va chạm 0–5; điểm gọi quái nằm trong khu của nó, cách mép ≥ 1 m.
 */
export function checkDienVoLayout(raw: unknown): { ok: DienVoLayout } | { err: string } {
  const o = raw as { props?: unknown; spawns?: Record<string, unknown> } | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.props)) return { err: 'thiếu props' };
  if (o.props.length > MAX_PROPS) return { err: `quá ${MAX_PROPS} đạo cụ` };
  const props: HandProp[] = [];
  for (const [i, v] of (o.props as Partial<HandProp>[]).entries()) {
    if (!v || typeof v.id !== 'string' || !/^prop_[a-z0-9_]{1,60}$/.test(v.id)) return { err: `props[${i}]: id sai` };
    if (!num(v.x) || !num(v.z) || !inFloor(v.x, v.z)) return { err: `props[${i}] (${v.id}): ngoài sàn` };
    if (!num(v.yaw) || !num(v.s) || v.s < 0.05 || v.s > 5) return { err: `props[${i}] (${v.id}): yaw/s sai` };
    if (v.r !== undefined && (!num(v.r) || v.r < 0 || v.r > 5)) return { err: `props[${i}] (${v.id}): r sai` };
    const p: HandProp = { id: v.id, x: r3(v.x), z: r3(v.z), yaw: r3(v.yaw), s: r3(v.s) };
    if (v.r) p.r = r3(v.r);
    props.push(p);
  }
  const spawns: DienVoLayout['spawns'] = { arena: [], boss: [] };
  for (const id of ['arena', 'boss'] as const) {
    const list = o.spawns?.[id] ?? [];
    if (!Array.isArray(list) || list.length > MAX_SPAWNS) return { err: `spawns.${id} sai` };
    const zone = dienVoZone(id);
    for (const [i, v] of (list as { x?: unknown; z?: unknown }[]).entries()) {
      if (!v || !num(v.x) || !num(v.z)) return { err: `spawns.${id}[${i}] sai` };
      if (Math.hypot(v.x - zone.x, v.z - zone.z) > (zone.r ?? 0) - 1 + 1e-6) return { err: `spawns.${id}[${i}]: ngoài khu` };
      spawns[id].push({ x: r3(v.x), z: r3(v.z) });
    }
  }
  return { ok: { props, spawns } };
}

function loadLayout(): DienVoLayout {
  const c = checkDienVoLayout(layoutJson);
  if ('err' in c) throw new Error(`props.dienvo.layout.json: ${c.err}`);
  return c.ok;
}

/** Bố cục đang dùng. Đối tượng và các mảng bên trong giữ nguyên danh tính suốt đời tiến trình (`setDienVoLayout` thay nội dung tại chỗ). */
export const DIEN_VO_LAYOUT: DienVoLayout = loadLayout();

/** Đạo cụ của phòng (cùng mảng với `DIEN_VO_LAYOUT.props`). */
export const DIEN_VO_PROPS: readonly HandProp[] = DIEN_VO_LAYOUT.props;

/**
 * Thay bố cục TẠI CHỖ (nạp lại tức thì ở máy phát triển: trình chỉnh phòng ở client, bộ theo dõi file ở server dev). Bố cục sai thì giữ
 * nguyên bản cũ và trả lỗi. Không có đường nào từ tin nhắn của client tới hàm này.
 */
export function setDienVoLayout(raw: unknown): string | null {
  const c = checkDienVoLayout(raw);
  if ('err' in c) return c.err;
  DIEN_VO_LAYOUT.props.splice(0, Infinity, ...c.ok.props);
  for (const id of ['arena', 'boss'] as const) DIEN_VO_LAYOUT.spawns[id].splice(0, Infinity, ...c.ok.spawns[id]);
  return null;
}
