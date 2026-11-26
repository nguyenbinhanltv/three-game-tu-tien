import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PAINTED, type PaintPair } from './palette';
import { LIGHT } from './fieldShared';
import { bladeTone } from './bladeTone';
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
  /**
   * 0..1: ban đêm làm dải chuyển sáng↔tối của đất vẽ gắt lại (mảng sáng và mảng bóng tách bạch như nét cọ, không loang). Đêm đã mất màu (nhuộm trăng), chỉ còn độ chói:
   * mảng chuyển mềm trên nền một tông đọc thành mây; hai tông có biên rõ đọc thành đất. 0 = không (mặc định).
   */
  nightSplit?: number;
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
  /** Đá lát (sân, mặt đường, mặt cầu): [sáng, tối]. Bỏ trống = cặp `paving` chung của bảng Họa Cảnh. */
  paving?: PaintPair;
  /**
   * 0..1: đất vẽ lấy MÀU ĐỈNH của địa hình làm nền (bảng màu từng vùng do level tự tô: đảo, lối mòn, bờ hồ, đá lộ), tô hai tông theo nét cọ: sáng = màu đỉnh
   * nâng sáng ngả ấm, tối = pha lam ít bão hòa (pha tay, không phải sáng nhân cho tối). Phần còn lại (1 − vcMix) là cặp `ground`, để cả level vẫn một bảng.
   * 0 = không (mặc định). Dùng cho level mà bản sắc vùng nằm ở màu đỉnh (Vân Hải: năm đảo năm bảng).
   */
  vcMix?: number;
  /**
   * 0..1: đất vẽ lấy ALBEDO THỦ TỤC của level làm nền (chỉ cho level mà shader đất mặc định dựng nền bằng mã, không ảnh chụp: Vấn Đỉnh hai mặt), bỏ đèn, tô hai
   * tông theo mảng lớn. 1 = thay hẳn đất cỏ painted-valley (level không có cỏ). 0 = không (mặc định).
   */
  albedoMix?: number;
  /** 0..1: mức đổi tông đá/vách/tuyết của địa hình sang cặp `rock` (mặc định 1). Thấp hơn giữ sắc riêng từng vùng của vách (Vấn Đỉnh: vách Âm tím lạnh, vách Dương vàng đồng). */
  rockMix?: number;
  /**
   * Level hai mặt theo trục x (Vấn Đỉnh): vật thể tĩnh (`paintedProp`) và đất `albedoMix` nhân tông `west` ở phía tây `x`, `east` ở phía đông, đổi dần trong ±`w` m quanh `x`
   * (vật thể tĩnh Họa Cảnh không nhận đèn nên mood hai mặt không tự nhuộm chúng). Bỏ trống = không nhuộm.
   */
  face?: { x: number; w: number; west: readonly [number, number, number]; east: readonly [number, number, number] };
  /** Sân lát đá vẽ tay [x, z, bán kính m]: trong đĩa, chỗ màu đỉnh sáng (lối lát đá) vẽ thành phiến đá xếp so le theo cặp `paving`. Bỏ trống = không. */
  slab?: readonly [number, number, number];
  /** 0..1: lá cỏ Họa Cảnh đổi tông theo cặp `ground` (theo độ chói của lá, giữ nét sáng/tối từng lá). 0 = lá xanh painted-valley (mặc định). */
  bladeMix?: number;
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
    // cỏ rêu đậm và bão hòa hơn (follow-up #685: bản đầu pastel nhạt); tối vẫn pha lam, không phải sáng nhân cho tối
    ground: [0x8aa556, 0x355a44],
    rock: [0xbdb5a4, 0x5a5878],
    // đá lát ngà ấm dưới nắng bình minh, khe và mặt khuất tím lam (cùng họ với bóng của `rock`, sáng hơn để đường/cầu tách khỏi vách)
    paving: [0xd6cbb0, 0x66668a],
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
    groundSat: 0.95,
  },
  // Vân Hải Phù Đảo (MAP-3): đảo cỏ trên biển mây lúc bình minh. Đồng cỏ vàng rêu ấm (nắng sớm nằm sẵn trong màu, vì đất vẽ không nhận đèn của mood), bóng lục
  // lam; bản sắc năm đảo (Tùng Đài rêu thẫm, Thạch Quy đá cát, Kính Hồ phù sa lục nhạt, Lôi Vân đá cháy sấm, Kình Ngư trắng xương) đi qua `vcMix`
  van_hai: {
    ground: [0xa9ad50, 0x3d6351],
    rock: [0xc4b9a0, 0x6e645c],
    paving: [0xdcd3ba, 0x6c6c8c],
    mist: 0xf4e6dc,
    // sương chỉ ở chân đảo và sàn mây (sàn 60 m, mặt đảo 122–140 m): mặt đảo trong, không phủ lên chỗ đánh
    mistBand: [64, 104],
    mistK: 0.5,
    // KHÔNG `far`: vòm núi xa nướng một lần thành dải tường xám chắn ngang trời khi ngự kiếm (đã chụp); cảnh xa của Vân Hải là biển mây + đảo giả (đã vẽ một lần)
    propMix: 0.25,
    nightContrast: 1.7,
    nightTint: [0.47, 0.58, 0.68],
    nightLift: 1.7,
    nightSplit: 0.85,
    groundMix: 0.75,
    groundSat: 1,
    vcMix: 0.6,
    bladeMix: 0.8,
    // Phù Đảo Các (đảo trung tâm r 85 + mép 12)
    slab: [1024, 1024, 97],
  },
  // Vấn Đỉnh Âm Dương Giới (TN-3): không cỏ. Tây = mặt Âm Hư (đá phiến tím lam lạnh), đông = mặt Dương Thực (đất nung nứt vàng đồng); nền hai mặt là albedo
  // thủ tục của level (`albedoMix`), vách giữ sắc từng mặt (`rockMix` thấp), vật thể tĩnh nhuộm theo mặt (`face`)
  van_dinh: {
    ground: [0xa89f98, 0x4a4868],
    rock: [0xa8a09c, 0x3c3854],
    mist: 0xcfc8dc,
    mistBand: [60, 76],
    mistK: 0.35,
    propMix: 0.15,
    nightContrast: 1.6,
    nightTint: [0.42, 0.5, 0.78],
    nightLift: 1.6,
    albedoMix: 1,
    rockMix: 0.35,
    face: { x: 1024, w: 30, west: [0.4, 0.46, 0.86], east: [1.2, 1.0, 0.74] },
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
  pLit: uniform(new THREE.Color().setHex(PAINTED.paving[0], THREE.SRGBColorSpace)),
  pShade: uniform(new THREE.Color().setHex(PAINTED.paving[1], THREE.SRGBColorSpace)),
  mist: uniform(new THREE.Color().fromArray(LIGHT.fogColor).multiplyScalar(1.05)),
  mistLo: uniform(DEFAULT_MIST.band[0]),
  mistHi: uniform(DEFAULT_MIST.band[1]),
  mistK: uniform(DEFAULT_MIST.k),
  propMix: uniform(0),
  nightContrast: uniform(1),
  nightSplit: uniform(0),
  nightTint: uniform(new THREE.Vector3(0.3, 0.46, 0.88)),
  groundMix: uniform(1),
  groundSat: uniform(1),
  dryMix: uniform(0),
  vcMix: uniform(0),
  albedoMix: uniform(0),
  rockMix: uniform(1),
  /** x = toạ độ Giới Tuyến, y = nửa bề rộng vùng chuyển (m); `faceW`/`faceE` = tông nhân phía tây/đông (1,1,1 = không nhuộm). */
  face: uniform(new THREE.Vector2(0, 1)),
  faceW: uniform(new THREE.Vector3(1, 1, 1)),
  faceE: uniform(new THREE.Vector3(1, 1, 1)),
  /** xy = tâm, z = bán kính của sân lát đá vẽ tay (0 = không có). */
  slab: uniform(new THREE.Vector3(0, 0, 0)),
};

/** Chọn bảng cho level (gọi trước khi dựng/hiển thị địa hình). */
export function setPaintedTheme(levelId: string): void {
  const t = PAINTED_THEMES[levelId];
  themeU.on.value = t ? 1 : 0;
  themeU.propMix.value = t?.propMix ?? 0;
  themeU.nightContrast.value = t?.nightContrast ?? 1;
  themeU.nightSplit.value = t?.nightSplit ?? 0;
  themeU.nightTint.value.set(...(t?.nightTint ?? [0.3, 0.46, 0.88]));
  themeU.groundMix.value = t?.groundMix ?? 1;
  themeU.groundSat.value = t?.groundSat ?? 1;
  themeU.dryMix.value = t?.dryMix ?? 0;
  themeU.vcMix.value = t?.vcMix ?? 0;
  themeU.slab.value.set(...(t?.slab ?? [0, 0, 0]));
  themeU.albedoMix.value = t?.albedoMix ?? 0;
  themeU.rockMix.value = t?.rockMix ?? 1;
  themeU.face.value.set(t?.face?.x ?? 0, t?.face?.w ?? 1);
  themeU.faceW.value.set(...(t?.face?.west ?? [1, 1, 1]));
  themeU.faceE.value.set(...(t?.face?.east ?? [1, 1, 1]));
  bladeTone.mix.value = t?.bladeMix ?? 0;
  const pv = t?.paving ?? PAINTED.paving;
  themeU.pLit.value.setHex(pv[0], THREE.SRGBColorSpace);
  themeU.pShade.value.setHex(pv[1], THREE.SRGBColorSpace);
  if (t) {
    themeU.gLit.value.setHex(t.ground[0], THREE.SRGBColorSpace);
    themeU.gShade.value.setHex(t.ground[1], THREE.SRGBColorSpace);
    bladeTone.lit.value.copy(themeU.gLit.value);
    bladeTone.shade.value.copy(themeU.gShade.value);
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
