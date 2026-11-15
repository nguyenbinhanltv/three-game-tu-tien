// Hiệu ứng chiêu công pháp (Phase 3-5) và hình dạng theo biến thức / cấp chiêu. Chỉ là lớp hình:
// server đã quyết định chiêu ra hay không, trúng ai; client chỉ vẽ theo FX (`v` biến thức, `lv` cấp, `c` màu).
// Dựng từ các nét có sẵn của `Vfx` (kiếm bắn, mưa kiếm, trụ sáng, khiên, pháp trận) nên không thêm loại draw call mới.

import * as THREE from 'three/webgpu';
import { groundAt, type FxMsg } from '@dtl/shared';
import { SIGIL_CIRCLE } from '../render/vfx/sigil';
import type { Vfx } from './vfx';

export type FxPos = (out: THREE.Vector3) => boolean;

/** Màu mặc định của chiêu công pháp khi không có màu trong FX. */
export const METHOD_COLORS: Record<string, number> = {
  kanh: 0x9fd8ff,
  vankiem: 0xbfe6ff,
  transon: 0xffc95a,
  kimcuong: 0xffd27a,
  xuanphong: 0x7dffa0,
  hoithien: 0xa8ffc4,
};

/** Các loại FX công pháp mới (chiêu đặc trưng, tối thượng). */
export const METHOD_FX = new Set(['kanh', 'vankiem', 'transon', 'kimcuong', 'xuanphong', 'hoithien']);

/** Màu hex của FX (chuỗi 6 ký tự từ server), thiếu hoặc hỏng thì dùng `fallback`. */
export function fxColor(m: FxMsg, fallback: number): number {
  if (typeof m.c === 'string' && /^[0-9a-f]{6}$/i.test(m.c)) return parseInt(m.c, 16);
  return fallback;
}

/** Hệ số cỡ theo cấp chiêu: mỗi cấp thêm 6%, cấp 5 sáng hơn một chút. */
export function levelScale(lv: number | undefined): number {
  return 1 + 0.06 * (Math.max(1, Math.min(5, lv ?? 1)) - 1);
}

const _a = new THREE.Vector3();

/** Pháp trận tròn nằm trên đất, hiện ra rồi tan dần. */
export function groundRing(v: Vfx, x: number, z: number, r: number, color: number, dur: number): void {
  const m = v.sigil(SIGIL_CIRCLE, x, z, 0, r, 0, color, groundAt(x, z) + 0.14);
  v.track(
    dur,
    (k) => {
      m.fxA.x = Math.min(1, k * 4);
      m.fxOpacity = k < 0.65 ? 0.28 : 0.28 * (1 - (k - 0.65) / 0.35);
    },
    () => v.drop(m),
  );
}

export interface MethodFxCtx {
  v: Vfx;
  m: FxMsg;
  src: FxPos;
  dst: FxPos;
  mine: boolean;
  /** Chớp toàn cảnh (chỉ của mình). */
  flash: (amount: number) => void;
}

const fixed = (p: THREE.Vector3): FxPos => (out) => (out.copy(p), true);

/** FX công pháp mới. Trả về true nếu đã xử lý. */
export function playMethodFx(c: MethodFxCtx): boolean {
  const { v, m } = c;
  const color = fxColor(m, METHOD_COLORS[m.t] ?? 0xffffff);
  const sc = levelScale(m.lv);
  switch (m.t) {
    case 'kanh': {
      // Kiếm Ảnh Phân Quang: một bóng kiếm lướt trước, bản thể theo sau; trúng thì để lại dấu ấn (trụ sáng nhỏ trên đầu).
      if (!c.src(_a)) return true;
      const from = _a.clone();
      v.swordShot(from.clone().add(new THREE.Vector3(0, 0.45, 0)), c.dst, color, 0.8 * sc, 0.22);
      v.swordShot(from, c.dst, color, 1.25 * sc, 0.16, (at) => {
        v.slashMark(c.dst, 0xffffff, 0.7 * sc, -0.6, 0.24, false, at.clone());
        v.pillar(c.dst, color, m.v === 'deep' ? 0.9 : 0.6, 0.3, m.v === 'deep' ? 3.4 : 2.4, 0.22);
        if (m.v === 'spread') v.burst(at, color, 1.8, 0.45);
      });
      return true;
    }
    case 'vankiem': {
      // Vạn Kiếm Quy Tông (tối thượng): mưa kiếm to, nhát chém dọc khổng lồ, trụ sáng xuyên trời.
      v.swordRain(m.x ?? 0, m.y ?? 0, m.z ?? 0, m.r ?? 10, color, m.sd, c.mine);
      v.slashVertical(c.dst, color, 1.6);
      v.pillar(c.dst, color, 1.1, 0.3, 9, 0.1);
      if (m.x !== undefined && m.z !== undefined) groundRing(v, m.x, m.z, m.r ?? 10, color, 1.2);
      if (c.mine) c.flash(0.1);
      return true;
    }
    case 'transon': {
      // Trấn Sơn Ấn: ấn vàng đóng xuống đất, một vòng chấn động tỏa ra tới mép bán kính khiêu khích.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 12;
      groundRing(v, x, z, r, color, 1.0);
      v.pillar(c.src, color, 0.8, 0.3, 3 * sc, 0.12);
      if (m.v === 'guard') v.shield(c.src, 3, () => true, color, 0.8, 0.14);
      return true;
    }
    case 'kimcuong': {
      // Kim Cương Bất Hoại (tối thượng): thân bọc vàng trong suốt thời gian giảm sát thương.
      const end = performance.now() + (m.d ?? 6) * 1000;
      v.shield(c.src, m.d ?? 6, () => performance.now() < end, color, 0.8, 0.12);
      v.pillar(c.src, color, 1.0, 0.3, 5, 0.1);
      return true;
    }
    case 'xuanphong': {
      // Xuân Phong Hóa Vũ: vòng lục ngọc tỏa ra, mưa sáng rơi trong thời gian hồi.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 10;
      groundRing(v, x, z, r, color, Math.min(m.d ?? 6, 3));
      v.pillar(c.src, color, 1.0, 0.3 * (m.v === 'self' ? 1.3 : 1), 5, 0.1);
      return true;
    }
    case 'hoithien': {
      // Hồi Thiên Đan Lộ (tối thượng): một cột lục ngọc từ trời, vòng trận tới mép bán kính hồi.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      groundRing(v, x, z, m.r ?? 14, color, 1.4);
      v.pillar(c.src, color, 1.6, 0.3, 9, 0.1);
      if (c.src(_a)) v.burst(_a, color, 1.4, 0.6);
      return true;
    }
  }
  return false;
}

/**
 * Phần thêm theo biến thức cho 6 chiêu chung (sau khi hiệu ứng gốc đã phát): thêm thanh kiếm, vệt đất, vòng lan…
 * Biến thức đổi hình dạng, không chỉ đổi con số.
 */
export function playVariantExtras(c: MethodFxCtx, color: number): void {
  const { v, m } = c;
  if (!m.v) return;
  switch (m.t + ':' + m.v) {
    case 'sword:twin': {
      if (!c.src(_a)) break;
      v.swordShot(_a.clone().add(new THREE.Vector3(0.5, 0.35, 0)), c.dst, color, 0.9, 0.25);
      break;
    }
    case 'sword:pierce': {
      // Kiếm xuyên qua mục tiêu, lao tiếp tới quái phía sau (toạ độ do server gửi).
      if (m.x === undefined || m.z === undefined || !c.dst(_a)) break;
      const behind = new THREE.Vector3(m.x, _a.y, m.z);
      v.swordShot(_a.clone(), fixed(behind), color, 1, 0.18, (at) => v.slashMark(fixed(at.clone()), 0xcff3ff, 0.5, -0.55, 0.2, false, at.clone()));
      break;
    }
    case 'slash:stun': {
      if (c.dst(_a)) v.burst(_a, 0xfff2b8, 1.8, 0.35);
      break;
    }
    case 'slash:trail': {
      // Vệt kiếm khí nằm lại trên đất 3 giây.
      if (!c.dst(_a)) break;
      groundRing(v, _a.x, _a.z, 3.5, color, 3);
      break;
    }
    case 'thunder:chain': {
      if (!c.dst(_a)) break;
      v.lightning(_a.x + 3.2, _a.y - 1, _a.z - 2.4, color, 0.9, m.sd ? m.sd + 7 : undefined);
      v.lightning(_a.x - 3.0, _a.y - 1, _a.z + 2.8, color, 0.8, m.sd ? m.sd + 13 : undefined);
      break;
    }
    case 'rain:focus': {
      v.pillar(c.dst, color, 0.9, 0.5, 6, 0.16);
      break;
    }
    case 'rain:wide': {
      if (m.x !== undefined && m.z !== undefined) groundRing(v, m.x, m.z, m.r ?? 9, color, 1.1);
      break;
    }
    case 'heal:hot': {
      v.pillar(c.src, 0x7dffa0, 2.2, 0.4, 3.5, 0.18);
      break;
    }
    case 'shield:ally':
    case 'shield:big':
      break;
  }
}
