import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { PaintPair } from './palette';
import { LIGHT } from './fieldShared';
import { FLAGS } from '../../base/flags';

/**
 * Họa Cảnh P9: bảng màu theo level. Pilot Vân Lam dùng đúng cỏ xanh của painted-valley; bản đồ khác (tuyết, đá đỏ, đảo mây...) đi qua MỘT bước đổi tông: màu
 * đất vẽ (đã có nét cọ và mảng sáng/tối của painted-valley) được đo độ chói rồi ánh xạ vào cặp [sáng, tối] của level, nên nét cọ giữ nguyên, chỉ đổi bảng màu
 * (nguyên tắc 1: mỗi vật hai màu, màu tối pha tay). Level không có trong bảng giữ cỏ xanh (`mix` = 0). Uniform (không dựng lại shader khi đổi level).
 */
export interface PaintedTheme {
  /** Đất/cỏ nền: [sáng, tối]. */
  ground: PaintPair;
  /** Đá, vách, tuyết (phần địa hình không phải đất cỏ): [sáng, tối]. */
  rock: PaintPair;
  /** Màu sương thấp (sRGB hex). */
  mist: number;
  /** Vùng xa nướng một lần (P3): bật mặc định ở level này; [sáng, tối] của dải núi. Bỏ trống = không có (Vân Lam: thung lũng kín). */
  far?: PaintPair;
  /** 0..1: mức đổi tông vật thể tĩnh (cây, đá, tàn tích) sang cặp `rock` theo độ chói của màu gốc; 0 = giữ màu gốc (mặc định). */
  propMix?: number;
  /** Tương phản đêm Họa Cảnh quanh mức tối (1 = như Vân Lam; >1 kéo sáng/tối xa nhau để nhân vật, vách, tàn tích còn khối). */
  nightContrast?: number;
  /** Màu nhuộm trăng (nhân, tuyến tính) của đêm Họa Cảnh; mặc định [0,3, 0,46, 0,88] của Vân Lam. Bớt xanh dương để nhân vật và vòng chọn không chìm. */
  nightTint?: [number, number, number];
  /** Nhân đèn trời/trăng của đêm Họa Cảnh (mặc định 1): nhân vật và quái là phần duy nhất nhận đèn, tăng để đọc rõ. */
  nightLift?: number;
  /** 0..1: mức ánh xạ đất vẽ vào cặp `ground` (mặc định 1). Thấp hơn giữ biến thiên màu gốc (mảng đất nhạt, đổi sắc theo vùng). */
  groundMix?: number;
  /** 0..1.5: bão hòa của đất sau khi đổi tông (mặc định 1). */
  groundSat?: number;
  /**
   * 0..1: mảng đất trần giữa cỏ. Nguồn mảng: màu albedo của đất (texture Codex `terrain-ck` có sẵn mảng đất nâu; màu đỉnh KHÔNG có, đã đo): chỗ đỏ hơn xanh (r − g > ngưỡng) tô đất painted nâu
   * nhạt ấm, viền mềm. Chưa thưa lá cỏ trên mảng đất (cần mặt nạ trên CPU). 0 = không (mặc định, như Vân Lam).
   */
  dryMix?: number;
  /** Sương thấp: dải cao độ (m) mà sương nằm dưới, từ đỉnh dải trở xuống; và cường độ 0..1. */
  mistBand: [number, number];
  mistK: number;
}

export const PAINTED_THEMES: Record<string, PaintedTheme> = {
  // Bắc Hoang Tẫn Nguyên (MAP-5): tuyết trắng lam, bóng tím chàm, đá đen tím, sương lam lạnh
  bac_hoang: {
    ground: [0xe2eaf6, 0x7482b6],
    rock: [0x6a6585, 0x2a2540],
    mist: 0xc4d0ea,
    mistBand: [10, 60],
    mistK: 0.6,
    far: [0xdce6f6, 0x5c6896],
    propMix: 0.85,
    nightContrast: 1.35,
    nightTint: [0.3, 0.42, 0.72],
    nightLift: 1.4,
  },
  // Thiên Lộ Giới / Cửu Kiều (TN-7): cao nguyên đá rêu trên biển mây, bình minh vàng hồng; đất rêu xanh lam, đá xám ấm, sương hồng nhạt ở rìa
  cuu_kieu: {
    ground: [0x8fab6e, 0x445f52],
    rock: [0xbdb5a4, 0x5a5878],
    mist: 0xf2e2da,
    mistBand: [66, 90],
    mistK: 0.55,
    far: [0xe6d8d8, 0x6a6a96],
    propMix: 0.35,
    nightContrast: 1.8,
    nightTint: [0.44, 0.52, 0.76],
    nightLift: 1.8,
    groundMix: 0.5,
    dryMix: 0.9,
    groundSat: 0.8,
  },
};

/** Vân Lam (pilot) và level chưa có bảng: sương cũ của P4. */
export const DEFAULT_MIST = { color: -1, band: [46, 66] as [number, number], k: 0.5 };

export const themeU = {
  /** 0 = cỏ xanh painted-valley; 1 = ánh xạ vào bảng của level. */
  on: uniform(0),
  gLit: uniform(new THREE.Color()),
  gShade: uniform(new THREE.Color()),
  rLit: uniform(new THREE.Color()),
  rShade: uniform(new THREE.Color()),
  mist: uniform(new THREE.Color().fromArray(LIGHT.fogColor).multiplyScalar(1.05)),
  mistLo: uniform(DEFAULT_MIST.band[0]),
  mistHi: uniform(DEFAULT_MIST.band[1]),
  mistK: uniform(DEFAULT_MIST.k),
  propMix: uniform(0),
  nightContrast: uniform(1),
  nightTint: uniform(new THREE.Vector3(0.3, 0.46, 0.88)),
  groundMix: uniform(1),
  groundSat: uniform(1),
  dryMix: uniform(0),
};

/** Chọn bảng cho level (gọi trước khi dựng/hiển thị địa hình). */
export function setPaintedTheme(levelId: string): void {
  const t = PAINTED_THEMES[levelId];
  themeU.on.value = t ? 1 : 0;
  themeU.propMix.value = t?.propMix ?? 0;
  themeU.nightContrast.value = t?.nightContrast ?? 1;
  themeU.nightTint.value.set(...(t?.nightTint ?? [0.3, 0.46, 0.88]));
  themeU.groundMix.value = t?.groundMix ?? 1;
  themeU.groundSat.value = t?.groundSat ?? 1;
  themeU.dryMix.value = t?.dryMix ?? 0;
  if (t) {
    themeU.gLit.value.setHex(t.ground[0], THREE.SRGBColorSpace);
    themeU.gShade.value.setHex(t.ground[1], THREE.SRGBColorSpace);
    themeU.rLit.value.setHex(t.rock[0], THREE.SRGBColorSpace);
    themeU.rShade.value.setHex(t.rock[1], THREE.SRGBColorSpace);
  }
  const m = t ? { color: t.mist, band: t.mistBand, k: t.mistK } : DEFAULT_MIST;
  if (m.color < 0) themeU.mist.value.fromArray(LIGHT.fogColor).multiplyScalar(1.05);
  else themeU.mist.value.setHex(m.color, THREE.SRGBColorSpace);
  themeU.mistLo.value = m.band[0];
  themeU.mistHi.value = m.band[1];
  themeU.mistK.value = m.k;
}

/** Vùng xa Họa Cảnh có bật ở level này không: `?far=1|0` ép, không thì theo bảng level; chỉ với `?style=painted`. */
export function paintedFarOn(levelId: string): boolean {
  if (FLAGS.style !== 'painted') return false;
  return FLAGS.far ?? PAINTED_THEMES[levelId]?.far !== undefined;
}

/** Ngưỡng độ đỏ-hơn-xanh (r − g của màu đỉnh tuyến tính) cho mảng đất trần: dưới `DRY_LO` là cỏ, trên `DRY_HI` là đất hẳn. Dùng chung shader đất và lưới cỏ. */
export const DRY_LO = 0.0;
export const DRY_HI = 0.05;
