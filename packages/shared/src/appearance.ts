// Ngoại hình người chơi (quyết định 6.4b): giới tính + màu áo chọn khi tạo nhân vật.
// Dữ liệu (danh sách màu, giới tính đang mở) nằm ở packages/content/data/appearance.json; ở đây chỉ có kiểu và luật
// kiểm hợp lệ dùng chung cho server (quyết định, lưu DB) và client (màn tạo nhân vật, dựng model).

export type Gender = 'm' | 'f';

/** Lựa chọn ngoại hình đã kiểm (lưu trong cột `characters.appearance` dạng JSON). */
export interface Appearance {
  g: Gender;
  /** id màu áo trong `appearance.json` (trùng id màu trong assets/palette.json). */
  dye: string;
}

export interface DyeDef {
  /** id màu trong bảng tâm trạng (assets/palette.json, `playerDyes.options`). */
  id: string;
  /** Màu áo chính (sRGB). Model có xương: nhân vào độ sáng vùng vải; model khối: màu thân áo. */
  hex: string;
  /** Màu viền/đai cho model khối (dự phòng). */
  trim: string;
}

export interface GenderDef {
  id: Gender;
  /** id asset model (null = chưa có). */
  model: string | null;
  /** Cho chọn khi tạo nhân vật. */
  enabled: boolean;
}

export interface AppearanceData {
  defaultGender: Gender;
  defaultDye: string;
  genders: GenderDef[];
  dyes: DyeDef[];
  /**
   * Nhân vật tạo trước khi có cột appearance: màu áo cũ chọn theo băm tên trong 8 phối màu (`ROBES` cũ);
   * phần tử i là màu mới gần nhất với phối màu cũ thứ i, để người chơi cũ giữ tông áo quen.
   */
  legacyByNameHash: string[];
}

/** Băm FNV-1a 32 bit (cùng hàm client cũ dùng để chọn màu áo theo tên). */
export function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Ngoại hình mặc định cho nhân vật chưa lưu lựa chọn: màu theo tên như trước (map sang bảng mới). */
export function legacyAppearance(data: AppearanceData, name: string): Appearance {
  const list = data.legacyByNameHash;
  const dye = list.length ? list[hashName(name) % list.length] : data.defaultDye;
  return { g: data.defaultGender, dye: data.dyes.some((d) => d.id === dye) ? dye : data.defaultDye };
}

/** Giới tính có cho chọn không. */
export function genderEnabled(data: AppearanceData, g: unknown): g is Gender {
  return data.genders.some((x) => x.id === g && x.enabled);
}

/**
 * Kiểm lựa chọn ngoại hình gửi từ client (hoặc đọc từ DB). Trả về null nếu không hợp lệ: id màu lạ,
 * giới tính chưa mở, sai kiểu. Không bao giờ tin chuỗi màu tự do từ client — chỉ nhận id có trong bảng.
 */
export function parseAppearance(data: AppearanceData, raw: unknown): Appearance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as { g?: unknown; dye?: unknown };
  if (!genderEnabled(data, o.g)) return null;
  if (typeof o.dye !== 'string' || !data.dyes.some((d) => d.id === o.dye)) return null;
  return { g: o.g, dye: o.dye };
}

/** Đọc cột DB: hỏng hoặc trống thì dùng màu theo tên. */
export function appearanceFromDb(data: AppearanceData, json: string, name: string): Appearance {
  if (json) {
    try {
      const a = parseAppearance(data, JSON.parse(json));
      if (a) return a;
    } catch {
      /* hỏng: dùng mặc định */
    }
  }
  return legacyAppearance(data, name);
}
