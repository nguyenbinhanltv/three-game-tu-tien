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
}

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
  // Đỏ/cam dành riêng cho cảnh báo địch: chiêu của người chơi không được xin `warn`.
  if (c.colorRole === 'warn' && c.telegraph === false) e.push(`${at}: colorRole warn mà không có telegraph`);
  if (c.colorRole !== 'own' && c.colorRole !== 'warn') e.push(`${at}: colorRole lạ`);
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
