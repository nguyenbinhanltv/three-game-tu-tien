// Thẻ chiêu VFX (V-P0, "Họa Pháp Lô"): một file JSON mỗi chiêu ở `packages/content/data/vfx/cards/<skillId>.json`, mô tả ý đồ hình ảnh
// TRƯỚC khi vẽ concept/texture và dựng timeline. Chỉ là dữ liệu thiết kế + ngân sách; không đụng luật chơi.
// Hàm thuần ở đây để `content:check` và `vfxlab` dùng chung. Chuỗi hiển thị (tên chiêu) vẫn qua i18n; `idea` là ghi chú nội bộ cho họa sĩ/Codex.

export const VFX_ELEMENTS = ['kim', 'moc', 'thuy', 'hoa', 'tho', 'loi', 'am', 'quang', 'vo'] as const;
export type VfxElement = (typeof VFX_ELEMENTS)[number];

/** Ngôn ngữ hình khối chủ đạo (cung, xoắn, gai, vòng...). */
export const VFX_SHAPE_LANGS = ['arc', 'spiral', 'spike', 'ring', 'beam', 'cloud', 'burst', 'line'] as const;
export type VfxShapeLang = (typeof VFX_SHAPE_LANGS)[number];

/** Vai trò màu: `own` dùng bảng hướng tu; `warn` (đỏ/cam) CHỈ cho cảnh báo của địch (luật thị giác). */
export type VfxColorRole = 'own' | 'warn';

export interface VfxCardTiming {
  /** Dồn lực (ms), trước va chạm. */
  anticipationMs: number;
  /** Va chạm (ms): chớp sáng/khung va chạm. */
  impactMs: number;
  /** Đọng lại rồi tan (ms). */
  lingerMs: number;
}

export interface VfxCardBudget {
  /** Draw call tối đa của chiêu. */
  drawCalls: number;
  /** Hạt tối đa đồng thời. */
  particles: number;
  /** Phủ màn hình tối đa (0..1, tỷ lệ diện tích khung hình ở 1080p). */
  screenCover: number;
  /** Overdraw ước lượng tối đa (số lớp trong suốt chồng nhau tại điểm xấu nhất). */
  overdraw: number;
}

export interface VfxCardTextures {
  /** Id texture đã qua `tools/vfx-forge` (file `apps/client/public/assets/vfx/<id>.ktx2`), hoặc `proc:<atlas>` cho atlas thủ tục sẵn có. */
  id: string;
  /** Vai trò: flipbook, vệt chém, decal, noise, ramp. */
  kind: 'flipbook' | 'slash' | 'decal' | 'noise' | 'ramp';
}

export interface VfxCard {
  skillId: string;
  /** Ý tưởng một hai câu (nội bộ, tiếng Việt, đưa vào prompt Codex). */
  idea: string;
  element: VfxElement;
  /** Hướng tu (khóa trong `paths.json`) quyết định bảng màu. */
  path: string;
  shapeLang: VfxShapeLang[];
  timing: VfxCardTiming;
  /** Độ phủ màn hình dự kiến ở camera chéo 52° (mét trên mặt đất: dài × rộng) và chiều cao tối đa. */
  footprint: { lengthM: number; widthM: number; heightM: number };
  colorRole: VfxColorRole;
  /** Có vạch báo trước (telegraph) không; chiêu người chơi thường là false. */
  telegraph: boolean;
  budget: VfxCardBudget;
  textures: VfxCardTextures[];
  /** Có khung va chạm (impact frame) không; mặc định false. */
  impactFrame?: boolean;
  /**
   * Chuẩn "Họa Pháp Lô 2" (24/11): đặt `2` để bật kiểm tự động (`checkStandard2`) cho thẻ này; thẻ cũ (không có) không bị kiểm.
   * Khi bật thì `silhouette` và `materials` là bắt buộc.
   */
  standard?: 2;
  /** Hình nhận diện riêng của chiêu (silhouette test: nhìn bóng đen vẫn phân biệt được với chiêu khác); không trùng với thẻ khác trong cùng hướng. */
  silhouette?: string;
  /** Lớp chất liệu ngoài mặt phẳng trơn: texture vẽ tay (flipbook từ Codex), khói/hạt, vân nứt, biến dạng (distort). */
  materials?: VfxMaterial[];
}

export const VFX_MATERIALS = ['flipbook', 'smoke', 'particles', 'crack', 'distort'] as const;
export type VfxMaterial = (typeof VFX_MATERIALS)[number];

/** Trần ngân sách theo kiểu chiêu: không thẻ nào được xin quá. */
export const VFX_CARD_CAPS: VfxCardBudget = { drawCalls: 12, particles: 1500, screenCover: 0.35, overdraw: 6 };

export function validateVfxCard(c: VfxCard, isSkill: (id: string) => boolean, isPath: (id: string) => boolean): string[] {
  const e: string[] = [];
  const at = `vfxcard ${c.skillId}`;
  if (!isSkill(c.skillId)) e.push(`${at}: chiêu không tồn tại`);
  if (!c.idea || c.idea.trim().length < 10) e.push(`${at}: thiếu idea (>= 10 ký tự)`);
  if (!VFX_ELEMENTS.includes(c.element)) e.push(`${at}: nguyên tố lạ ${c.element}`);
  if (!isPath(c.path)) e.push(`${at}: hướng tu lạ ${c.path}`);
  if (!c.shapeLang?.length) e.push(`${at}: thiếu shapeLang`);
  for (const s of c.shapeLang ?? []) if (!VFX_SHAPE_LANGS.includes(s)) e.push(`${at}: shapeLang lạ ${s}`);
  const t = c.timing;
  for (const k of ['anticipationMs', 'impactMs', 'lingerMs'] as const) {
    if (!(t?.[k] >= 0 && t[k] <= 3000)) e.push(`${at}: timing.${k} ngoài 0..3000`);
  }
  if (t && t.impactMs < 20) e.push(`${at}: impactMs < 20 (khung va chạm không kịp đọc)`);
  const f = c.footprint;
  if (!f || !(f.lengthM > 0 && f.widthM > 0 && f.heightM > 0) || f.lengthM > 40 || f.widthM > 40 || f.heightM > 20) {
    e.push(`${at}: footprint không hợp lệ (mỗi chiều > 0, dài/rộng <= 40 m, cao <= 20 m)`);
  }
  // Đỏ/cam dành riêng cho cảnh báo địch. Thẻ hiện chỉ dành cho chiêu của người chơi (`isSkill`) nên chặn mọi `warn`; mở lại khi có thẻ của quái.
  if (c.colorRole === 'warn') e.push(`${at}: colorRole warn chỉ dành cho cảnh báo của địch, chiêu người chơi phải dùng own`);
  else if (c.colorRole !== 'own') e.push(`${at}: colorRole lạ`);
  const b = c.budget;
  const cap = VFX_CARD_CAPS;
  if (!b) e.push(`${at}: thiếu budget`);
  else {
    if (!(b.drawCalls >= 0 && b.drawCalls <= cap.drawCalls)) e.push(`${at}: budget.drawCalls ngoài 0..${cap.drawCalls}`);
    if (!(b.particles >= 0 && b.particles <= cap.particles)) e.push(`${at}: budget.particles ngoài 0..${cap.particles}`);
    if (!(b.screenCover > 0 && b.screenCover <= cap.screenCover)) e.push(`${at}: budget.screenCover ngoài (0, ${cap.screenCover}]`);
    if (!(b.overdraw >= 1 && b.overdraw <= cap.overdraw)) e.push(`${at}: budget.overdraw ngoài 1..${cap.overdraw}`);
  }
  const seen = new Set<string>();
  for (const x of c.textures ?? []) {
    if (!/^(proc:)?[a-z0-9_]+$/.test(x.id)) e.push(`${at}: id texture không hợp lệ ${x.id}`);
    if (seen.has(x.id)) e.push(`${at}: texture trùng ${x.id}`);
    seen.add(x.id);
  }
  return e;
}

// ---- Thẻ chiêu của QUÁI/BOSS (V-P9): một file mỗi chiêu có vạch báo, `data/vfx/cards/mon/<monId>__<move>.json` ----

/** Hình vùng server (khớp `HazardMsg`): tròn (r), nón (r + nửa góc w độ), chữ nhật (dài r × rộng w). */
export interface MonVfxCardZone {
  shape: 'circle' | 'cone' | 'rect';
  /** Bán kính (tròn/nón) hoặc chiều dài (chữ nhật), mét — PHẢI bằng `ai` của quái (vùng vẽ không được nói dối hitbox). */
  r: number;
  /** Nửa góc (độ, nón) hoặc chiều rộng (mét, chữ nhật). */
  w?: number;
  /** Tâm vùng: dưới chân người chơi (nện), dưới chân boss, hoặc từ boss về phía người chơi. */
  at: 'target' | 'self' | 'forward';
}

export interface MonVfxCard {
  monId: string;
  /** Khóa chiêu trong `ai` (slam, chant, sweep, line, charge, leap, burrow, emerge). */
  move: string;
  idea: string;
  element: VfxElement;
  /** Bảng màu (hex, không dấu #): thân/viền theo hệ quái, `accent` là đỏ cảnh báo của địch. */
  palette: { core: string; body: string; rim: string; accent: string };
  shapeLang: VfxShapeLang[];
  zone: MonVfxCardZone;
  /** Thời gian vạch báo nạp (ms): PHẢI bằng `delay` của chiêu (cộng thời gian niệm với chiêu chant); impact/linger là vùng nổ và dư ba. */
  timing: VfxCardTiming;
  /** Ghi chú duyệt: điều gì phải đọc được ở camera chéo 52° (nhịp nạp, rìa vùng, chỗ an toàn). */
  readability: string;
  budget: VfxCardBudget;
}

export function validateMonVfxCard(
  c: MonVfxCard,
  mon: { move(id: string): { r: number; delay: number; shape: MonVfxCardZone['shape'] } | undefined; exists(id: string): boolean },
): string[] {
  const e: string[] = [];
  const at = `vfxcard mon ${c.monId}:${c.move}`;
  if (!mon.exists(c.monId)) e.push(`${at}: quái không tồn tại`);
  const mv = mon.move(`${c.monId}:${c.move}`);
  if (!mv) e.push(`${at}: quái không có chiêu ${c.move}`);
  else {
    if (c.zone.shape !== mv.shape) e.push(`${at}: zone.shape ${c.zone.shape} ≠ server ${mv.shape}`);
    if (Math.abs(c.zone.r - mv.r) > 0.01) e.push(`${at}: zone.r ${c.zone.r} ≠ server ${mv.r} (vùng vẽ phải bằng vùng server)`);
    if (c.move !== 'chant' && Math.abs(c.timing.anticipationMs - mv.delay * 1000) > 1) {
      e.push(`${at}: timing.anticipationMs ${c.timing.anticipationMs} ≠ delay server ${mv.delay * 1000} ms`);
    }
  }
  if (!c.idea || c.idea.trim().length < 10) e.push(`${at}: thiếu idea`);
  if (!VFX_ELEMENTS.includes(c.element)) e.push(`${at}: nguyên tố lạ ${c.element}`);
  for (const k of ['core', 'body', 'rim', 'accent'] as const)
    if (!/^[0-9a-fA-F]{6}$/.test(c.palette?.[k] ?? '')) e.push(`${at}: palette.${k} không phải hex 6 ký tự`);
  if (!c.readability || c.readability.trim().length < 10) e.push(`${at}: thiếu readability`);
  const t = c.timing;
  if (!(t?.anticipationMs >= 300 && t.anticipationMs <= 6000)) e.push(`${at}: nhịp nạp ngoài 300..6000 ms (dưới 300 ms không né kịp)`);
  if (!(t?.impactMs >= 20 && t.impactMs <= 3000) || !(t?.lingerMs >= 0 && t.lingerMs <= 3000)) e.push(`${at}: impact/linger ngoài khoảng`);
  const b = c.budget;
  const cap = VFX_CARD_CAPS;
  if (!b || !(b.drawCalls >= 0 && b.drawCalls <= cap.drawCalls) || !(b.particles >= 0 && b.particles <= cap.particles))
    e.push(`${at}: budget ngoài trần`);
  else if (!(b.screenCover > 0 && b.screenCover <= cap.screenCover) || !(b.overdraw >= 1 && b.overdraw <= cap.overdraw))
    e.push(`${at}: budget phủ/overdraw ngoài trần`);
  return e;
}

// ---- Chuẩn "Họa Pháp Lô 2" (24/11): kiểm tự động phần đo được trên dữ liệu (thẻ + timeline) ----

/** Hình chỉ là khuôn chung (vòng/lưỡi/tia): không được là hình chính của chiêu theo chuẩn 2. */
const GENERIC_SHAPES: ReadonlySet<string> = new Set([
  'rune_ring2',
  'ripple',
  'slash_thin',
  'slash_thick',
  'slash_cross',
  'slash_fan',
  'crescent',
  'kite',
  'spike',
  'burst',
  'shock_cone',
]);

/** Tông màu (khóa `FxTone`) mà bảng màu hướng tu đang là đỏ/cam: truyền từ nơi gọi (cần `paths.json`). */
export interface Standard2Ctx {
  /** Tông của hướng tu có sắc đỏ/cam (HSL: đỏ-cam 0–45° hoặc 345–360°, bão hòa > 0,45). Chiêu người chơi không được dùng. */
  redTones: ReadonlySet<string>;
}

interface TlEvent {
  type: string;
  /** Giây so với mốc trúng (âm = trước). */
  t?: number;
  shape?: string;
  tone?: string;
  tex?: string;
  flip?: string;
}

/** Đỏ/cam theo HSL (hex 6 ký tự, không #). */
export function isRedOrange(hex: string): boolean {
  const n = parseInt(hex, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d < 1e-6) return false;
  const l = (mx + mn) / 2;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return sat > 0.45 && (h <= 45 || h >= 345);
}

/**
 * Các luật của chuẩn 2 đo được từ dữ liệu: thẻ khai `silhouette` + `materials`; timeline có lớp chất liệu thật khớp `materials`; hình chính không chỉ là khuôn chung
 * (vòng rune/lưỡi liềm/tia); không dùng tông đỏ/cam của bảng hướng tu; có đủ ba nhịp (sự kiện trước hitAt, tại hitAt, sau hitAt); phủ màn hình ≤ 0,2 (trừ chiêu cuối: ≤ 0,35).
 * Phần đo trên ảnh (tương phản nền sáng, % đỏ) ở `pnpm shots vfxlab`.
 */
export function checkStandard2(c: VfxCard, events: readonly TlEvent[], ult: boolean, ctx: Standard2Ctx): string[] {
  if (c.standard !== 2) return [];
  const e: string[] = [];
  const at = `vfxcard ${c.skillId} (chuẩn 2)`;
  if (!c.silhouette || c.silhouette.trim().length < 10) e.push(`${at}: thiếu silhouette (>= 10 ký tự)`);
  if (!c.materials?.length) e.push(`${at}: thiếu materials (>= 1 lớp chất liệu)`);
  const has = (m: VfxMaterial): boolean =>
    m === 'particles'
      ? events.some((x) => x.type === 'particles')
      : m === 'flipbook'
        ? events.some((x) => x.type === 'mesh' && x.shape === 'flip')
        : m === 'smoke'
          ? events.some((x) => x.type === 'mesh' && (x.shape === 'smoke' || (x.shape === 'flip' && /smoke|dust/.test(x.flip ?? ''))))
          : m === 'crack'
            ? events.some((x) => (x.type === 'decal' && x.tex === 'crack') || (x.type === 'mesh' && String(x.shape).startsWith('crack')))
            : events.some((x) => x.type === 'distort');
  for (const m of c.materials ?? []) if (!has(m)) e.push(`${at}: khai materials "${m}" nhưng timeline không có lớp đó`);
  const meshes = events.filter((x) => x.type === 'mesh');
  if (meshes.length && meshes.every((x) => GENERIC_SHAPES.has(String(x.shape)))) {
    e.push(`${at}: mọi hình đều là khuôn chung (vòng/lưỡi/tia); cần ít nhất một hình riêng (khói, sợi, thân vật, thẻ, flipbook...)`);
  }
  if (
    events.some((x) => x.type === 'decal' && x.tex === 'rune') &&
    meshes.filter((x) => String(x.shape) === 'rune_ring2').length > 0 &&
    meshes.length < 6
  ) {
    e.push(`${at}: vòng ấn rune dưới chân làm hình chính (rune + rune_ring2, ít hình khác)`);
  }
  for (const x of events) {
    if (x.tone && ctx.redTones.has(x.tone)) {
      e.push(`${at}: dùng tông ${x.tone} (đỏ/cam theo bảng màu hướng tu) — dành cho cảnh báo của địch`);
      break;
    }
  }
  const vis = events.filter((x) => x.type === 'mesh' || x.type === 'decal' || x.type === 'particles');
  if (!vis.some((x) => (x.t ?? 0) < -0.05) && c.timing.anticipationMs >= 150)
    e.push(`${at}: thiếu nhịp báo trước (không có sự kiện hình trước mốc trúng dù anticipationMs ${c.timing.anticipationMs})`);
  if (!vis.some((x) => Math.abs(x.t ?? 0) <= 0.05))
    e.push(`${at}: thiếu điểm nhấn lúc trúng (không có sự kiện hình ở ±50 ms quanh mốc trúng)`);
  if (!vis.some((x) => (x.t ?? 0) >= 0.15)) e.push(`${at}: thiếu dư ba (không có sự kiện hình từ +150 ms trở đi)`);
  const cap = ult ? 0.35 : 0.2;
  if (c.budget.screenCover > cap)
    e.push(`${at}: budget.screenCover ${c.budget.screenCover} > ${cap}${ult ? '' : ' (chỉ chiêu cuối được tới 0,35)'}`);
  return e;
}
