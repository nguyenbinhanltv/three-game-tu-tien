// "Khoảnh khắc mở tầm nhìn": khi NGỰ KIẾM hoặc đứng ở một điểm ngắm cảnh, camera chéo hạ thấp, nới góc và đẩy xa để thấy trời và núi.
// Chỉ là lớp trình diễn phía client (server không biết): không đổi hướng, không đổi luật chơi, camera chiến đấu khóa góc không bị đụng
// (đáp xuống/ra khỏi điểm thì mượt về 52°). Tắt bằng `?vista=0`.

import { FLAGS } from '../../base/flags';
import { ISO_FOV, ISO_PITCH, ISO_FAR } from './iso';

/** Một điểm ngắm cảnh: đứng trong `r` mét (mặt phẳng) thì camera mở tầm nhìn, trừ khi người chơi đã bấm thoát. */
export interface VistaSpot {
  id: string;
  level: string;
  x: number;
  z: number;
  r: number;
}

/** 3 điểm trên Vân Lam (tọa độ theo bảng địa điểm của level): cổng bắc tông môn, Vách Đá Ngọc, bãi ven hồ. */
export const VISTA_SPOTS: readonly VistaSpot[] = [
  { id: 'cong', level: 'van_lam', x: 2048, z: 1730, r: 10 },
  { id: 'thach_vien', level: 'van_lam', x: 2450, z: 1760, r: 12 },
  { id: 'ho', level: 'van_lam', x: 1490, z: 2230, r: 12 },
];

/** Giá trị đích khi mở hết cỡ (amount = 1). */
export const VISTA = {
  pitch: (14 * Math.PI) / 180,
  distMul: 1.3,
  fovAdd: 8,
  far: 700,
  /** Nâng điểm nhìn lên (m) để đường chân trời nằm vừa phải trong khung. */
  liftY: 3.5,
  /** Thời gian vào/ra (giây) cho độ mượt: ~ 1/rate. */
  rate: 1.6,
} as const;

/**
 * Họa Cảnh + vùng xa (`?style=painted&far=1`): camera gần ngang tầm mắt và cao hơn để chân trời và dải núi nướng (8–18° ngẩng) vào khung; mép trên
 * khung ngẩng 20° − pitch. Mặc định (không cờ) giữ `VISTA`.
 */
export const VISTA_FAR = { pitch: (5 * Math.PI) / 180, liftY: 9 } as const;
/** Ngự kiếm với vùng xa: mức trung gian (pitch ~9,5°, nâng 6 m) để vẫn nhìn được phía trước khi điều hướng; `?vistafly=<độ>` ghi đè pitch để so mức. */
export const VISTA_FAR_FLY = { pitch: (9.5 * Math.PI) / 180, liftY: 6 } as const;

/** Điểm ngắm cảnh chứa (x, z) ở level này, hoặc null. */
export function spotAt(level: string, x: number, z: number, spots: readonly VistaSpot[] = VISTA_SPOTS): VistaSpot | null {
  for (const s of spots) if (s.level === level && Math.hypot(x - s.x, z - s.z) <= s.r) return s;
  return null;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export class VistaRig {
  /** 0 = camera chéo gốc, 1 = mở hết. Đã làm mượt. */
  amount = 0;
  private raw = 0;
  /** Điểm đã bị người chơi bấm thoát: không tự mở lại cho tới khi rời khỏi điểm đó. */
  private dismissed: string | null = null;

  private hinted: string | null = null;

  /** True đúng một lần mỗi lần bước vào điểm ngắm cảnh (để hiện gợi ý phím thoát). */
  hint(spot: VistaSpot | null): boolean {
    if (!spot) {
      this.hinted = null;
      return false;
    }
    if (this.hinted === spot.id) return false;
    this.hinted = spot.id;
    return spot.id !== this.dismissed;
  }

  private far = false;

  /** Cần cảnh xa (địa hình tầm xa, trời, biển mây, núi nền)? Bật khi mở > 5%, tắt khi đóng < 1% (có trễ, không chớp). */
  farOn(): boolean {
    if (this.far ? this.amount < 0.01 : this.amount > 0.05) this.far = !this.far;
    return this.far;
  }

  /** Bấm phím thoát: bỏ mở tầm nhìn ở điểm hiện tại (ngự kiếm thì thôi, không ép). */
  dismiss(spot: VistaSpot | null): void {
    if (spot) this.dismissed = spot.id;
  }

  /** `want` do vòng khung quyết: đang ngự kiếm, hoặc đứng trong điểm ngắm cảnh chưa thoát. */
  update(dt: number, flying: boolean, spot: VistaSpot | null, enabled: boolean, combat = false): number {
    if (!spot && !combat) this.dismissed = null;
    const inSpot = !!spot && spot.id !== this.dismissed;
    const want = enabled && !combat && (flying || inSpot) ? 1 : 0;
    const step = Math.min(dt, 0.1) * VISTA.rate;
    this.raw = want > this.raw ? Math.min(want, this.raw + step) : Math.max(want, this.raw - step);
    this.amount = ease(this.raw);
    return this.amount;
  }
}

export interface VistaView {
  pitch: number;
  distMul: number;
  fov: number;
  far: number;
  lift: number;
}

/** Nội suy các thông số camera theo `amount` (0..1). `amount = 0` trả đúng giá trị camera chéo gốc. */
export function vistaView(amount: number, mode: 'spot' | 'fly' = 'spot'): VistaView {
  const a = Math.max(0, Math.min(1, amount));
  const far = FLAGS.style === 'painted' && FLAGS.far;
  const tune =
    mode === 'fly'
      ? { ...VISTA_FAR_FLY, pitch: FLAGS.vistaFlyPitch !== null ? (FLAGS.vistaFlyPitch * Math.PI) / 180 : VISTA_FAR_FLY.pitch }
      : VISTA_FAR;
  return {
    pitch: ISO_PITCH + (far ? tune.pitch - ISO_PITCH : VISTA.pitch - ISO_PITCH) * a,
    distMul: 1 + (VISTA.distMul - 1) * a,
    fov: ISO_FOV + VISTA.fovAdd * a,
    far: ISO_FAR + (VISTA.far - ISO_FAR) * a,
    lift: (far ? tune.liftY : VISTA.liftY) * a,
  };
}
