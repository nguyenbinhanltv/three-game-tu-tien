// Pháp bảo phụ (Phase 3-8): công thức dùng chung client (hiển thị) và server (tính thật). Hàm thuần.
// Dữ liệu (3 pháp bảo, hệ số kỹ năng) nằm ở packages/content/data/artifacts.json.

export const ARTIFACT_MAX_LEVEL = 5;
/** Số mục tiêu quái tối đa Hồ Lô hút một lần. */
export const DRAIN_MAX_TARGETS = 5;
/** Người chơi chỉ hưởng linh khí từ quái không thấp hơn mình quá chừng này cấp. */
export const ARTIFACT_QI_LEVEL_GAP = 5;

export type ArtifactKind = 'drain' | 'seal' | 'shield' | 'heal';
export type ArtifactPassiveKind = 'mp' | 'posture' | 'def' | 'hp';

export interface ArtifactDef {
  /** id vật phẩm (mẫu trang bị ô `artifact`). */
  id: string;
  /** id asset 3D (assets/source/prop/<asset>). */
  asset: string;
  kind: ArtifactKind;
  /** Khóa hồi chiêu trong bảng `cds` (cùng chỗ với chiêu thường). */
  skill: string;
  cd: number;
  mp: number;
  /** Bán kính tác dụng quanh người dùng (m). */
  radius: number;
  /** Hệ số chính: phần linh lực tối đa mỗi quái (drain), phần phá thế lên boss (seal), phần khí huyết tối đa của khiên (shield). */
  power: number;
  /** Thời lượng hiệu ứng (giây): choáng quái thường (seal) hoặc khiên (shield). */
  duration?: number;
  /** Nội tại: cộng `per` mỗi cấp pháp bảo. */
  passive: { kind: ArtifactPassiveKind; per: number };
  /** Màu hiệu ứng (hex không có `#`). Chỉ là lớp hình. */
  color: string;
  /** Bản mệnh pháp bảo (E2-E): tự có khi lên Kết Đan, không tháo, cấp theo cấp của chủ (`bondedLevel`), phím T. */
  bonded?: boolean;
}

/** Cấp tối thiểu có bản mệnh pháp bảo (Kết Đan sơ kỳ). */
export const BONDED_UNLOCK_LEVEL = 20;
/** id bản mệnh pháp bảo Kết Đan (Ngưng Đan Lô). */
export const BONDED_ARTIFACT_ID = 'itm_ngung_dan_lo';

/** Bản mệnh pháp bảo lên cấp theo chủ: Kết Đan sơ kỳ (20) = cấp 1, mỗi cảnh giới nhỏ thêm 1, tối đa 5. 0 = chưa mở. */
export function bondedLevel(playerLevel: number): number {
  if (playerLevel < BONDED_UNLOCK_LEVEL) return 0;
  return Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, playerLevel - BONDED_UNLOCK_LEVEL + 1));
}

/** Ngưng Đan Lô (kind `heal`): lượng khí huyết hồi cho một người (tỉ lệ khí huyết tối đa của người đó). */
export function furnaceHeal(def: ArtifactDef, level: number, mhp: number): number {
  return Math.round(mhp * def.power * artifactLevelMods(level).powerMul);
}

export interface ArtifactLevelMods {
  powerMul: number;
  cdMul: number;
}

export function clampArtifactLevel(level: unknown): number {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, n));
}

/** Cấp 1–5: mỗi cấp tăng 12% sức mạnh kỹ năng và giảm 4% hồi chiêu. */
export function artifactLevelMods(level: number): ArtifactLevelMods {
  const k = clampArtifactLevel(level) - 1;
  return { powerMul: 1 + 0.12 * k, cdMul: 1 - 0.04 * k };
}

/** Linh khí cần để lên cấp `toLevel` (2..5), tính từ lúc vừa lên cấp trước. Ngoài khoảng: null. */
export function artifactQiNeed(toLevel: number): number | null {
  if (!Number.isInteger(toLevel) || toLevel < 2 || toLevel > ARTIFACT_MAX_LEVEL) return null;
  return [60, 150, 300, 500][toLevel - 2] ?? null;
}

/** Linh khí nạp vào pháp bảo khi hạ một quái (quái quá thấp cấp thì không nạp). */
export function artifactQiGain(o: { boss: boolean; elite: boolean; monLevel: number; playerLevel: number }): number {
  if (o.monLevel < o.playerLevel - ARTIFACT_QI_LEVEL_GAP) return 0;
  return o.boss ? 15 : o.elite ? 3 : 1;
}

/** Giá trị nội tại ở cấp `level` (tỉ lệ cộng thêm). */
export function artifactPassive(def: ArtifactDef, level: number): number {
  return def.passive.per * clampArtifactLevel(level);
}

/** Hồ Lô: linh lực hồi từ một quái (tỉ lệ linh lực tối đa); tinh anh gấp đôi. */
export function drainMp(def: ArtifactDef, level: number, mmp: number, elite: boolean): number {
  return Math.round(mmp * def.power * artifactLevelMods(level).powerMul * (elite ? 2 : 1));
}

/** Linh: phá thế cộng lên boss (0..1 của thanh phá thế). */
export function sealPosture(def: ArtifactDef, level: number): number {
  return def.power * artifactLevelMods(level).powerMul;
}

/** Linh: thời gian choáng quái thường (giây). */
export function sealStun(def: ArtifactDef, level: number): number {
  return (def.duration ?? 2.5) * artifactLevelMods(level).powerMul;
}

/** Ấn: lượng khiên cho một người. */
export function shieldAmount(def: ArtifactDef, level: number, mhp: number): number {
  return Math.round(mhp * def.power * artifactLevelMods(level).powerMul);
}

/** Trạng thái pháp bảo của riêng người chơi trong `characters.meta`: id vật phẩm → cấp và linh khí. */
export interface ArtifactProgress {
  lv: number;
  qi: number;
}

/** Tin gửi client (nằm trong `MethodMsg.art`). */
export interface ArtifactMsg {
  /** id pháp bảo đang đeo ('' = không). */
  id: string;
  lv: number;
  qi: number;
  /** Linh khí cần để lên cấp kế (0 = đã tối đa). */
  need: number;
}
