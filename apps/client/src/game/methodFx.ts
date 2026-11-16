// Hiệu ứng chiêu công pháp (Phase 3-5) và hình dạng theo biến thức / cấp chiêu. Chỉ là lớp hình:
// server đã quyết định chiêu ra hay không, trúng ai; client chỉ vẽ theo FX (`v` biến thức, `lv` cấp, `c` màu).
// Dựng từ các nét có sẵn của `Vfx` (kiếm bắn, mưa kiếm, trụ sáng, khiên, pháp trận) nên không thêm loại draw call mới.

import * as THREE from 'three/webgpu';
import { type FxMsg } from '@dtl/shared';
import { groundAt } from './levelCtx';
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
        if (m.v === 'deep') {
          // Ấn sâu: dấu chém dọc thứ hai và trụ cao, dấu ấn nặng.
          v.slashVertical(c.dst, color, 1.0);
          v.pillar(c.dst, 0xffffff, 1.1, 0.14, 5.5, 0.28);
        }
        if (m.v === 'spread') {
          // Ấn lan: ba tia nhỏ tỏa ra hai bên mục tiêu, như dấu ấn bắn sang quái gần.
          groundRing(v, at.x, at.z, 2.2, color, 0.6);
          for (const [dx, dz] of [[2.6, 1.2], [-2.4, 1.8], [0.4, -2.8]]) {
            const p = at.clone().add(new THREE.Vector3(dx, -0.5, dz));
            v.swordShot(at.clone(), fixed(p), color, 0.6, 0.22, (h) => v.pillar(fixed(h.clone()), color, 0.6, 0.2, 2.2, 0.2));
          }
        }
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
      if (m.v === 'wide') after(v, 0.3, () => groundRing(v, x, z, r * 0.55, color, 0.8));
      if (m.v === 'guard') {
        const end = performance.now() + 3000;
        v.shield(c.src, 3, () => performance.now() < end, color, 0.9, 0.16);
      }
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
      if (m.v === 'wide') after(v, 0.3, () => groundRing(v, x, z, r * 0.6, color, 1.5));
      if (m.v === 'self') {
        // Dồn vào thân: trụ dày hơn quanh người, nhịp sáng lặp mỗi giây.
        v.pillar(c.src, 0xd8ffe4, 1.2, 0.55, 3.2, 0.2);
        for (let k = 1; k <= 3; k++) {
          after(v, k, () => {
            if (c.src(_a)) groundRing(v, _a.x, _a.z, 2.0, color, 0.8);
          });
        }
      }
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

/** Chạy `fn` sau `sec` giây theo đồng hồ của Vfx (dừng cùng Vfx, không để hẹn giờ sót khi đổi room). */
function after(v: Vfx, sec: number, fn: () => void): void {
  v.track(sec, () => {}, fn);
}

/**
 * Phần thêm theo biến thức cho 6 chiêu chung (sau khi hiệu ứng gốc đã phát). Mỗi biến thức có một dấu hiệu hình riêng,
 * đọc được từ xa: màu, số thanh, vòng đất, nhịp lặp. Chỉ cộng sáng thấp (alpha ≤ 0,3), không phủ người/quái.
 * Biến thức đổi hình dạng, không chỉ đổi con số.
 */
export function playVariantExtras(c: MethodFxCtx, color: number): void {
  const { v, m } = c;
  if (!m.v) return;
  const sc = levelScale(m.lv);
  switch (m.t + ':' + m.v) {
    case 'sword:twin': {
      // Hai thanh song song, thanh thứ hai chậm một nhịp: thấy rõ "bắn đôi".
      if (!c.src(_a)) break;
      const from = _a.clone();
      v.swordShot(from.clone().add(new THREE.Vector3(-0.55, 0.3, 0)), c.dst, color, 0.9 * sc, 0.2);
      after(v, 0.07, () => v.swordShot(from.clone().add(new THREE.Vector3(0.55, 0.3, 0)), c.dst, color, 0.9 * sc, 0.2));
      break;
    }
    case 'sword:pierce': {
      // Kiếm xuyên qua mục tiêu, lao tiếp tới quái phía sau (toạ độ do server gửi); chỗ xuyên có tia chớp trắng.
      if (m.x === undefined || m.z === undefined || !c.dst(_a)) break;
      const behind = new THREE.Vector3(m.x, _a.y, m.z);
      v.swordShot(_a.clone(), fixed(behind), color, 1.1 * sc, 0.2, (at) => v.slashMark(fixed(at.clone()), 0xcff3ff, 0.6, -0.55, 0.22, false, at.clone()));
      break;
    }
    case 'slash:stun': {
      // Sao choáng vàng nổ ra trên đầu mục tiêu rồi một vòng nhỏ treo lơ lửng.
      if (!c.dst(_a)) break;
      v.pillar(c.dst, 0xffe9a0, 0.6, 0.12, 1.8, 0.14);
      break;
    }
    case 'slash:trail': {
      // Vệt kiếm khí nằm lại trên đất 3 giây, mỗi giây một nhịp sáng báo đang gây sát thương.
      if (!c.dst(_a)) break;
      const x = _a.x;
      const z = _a.z;
      groundRing(v, x, z, 3.5, color, 3);
      for (let k = 1; k <= 3; k++) after(v, k, () => groundRing(v, x, z, 3.0, color, 0.7));
      break;
    }
    case 'shield:big': {
      // Màn chắn lớn: thêm một lớp vỏ ngoài rộng và vòng nền to; gọn hơn về thời gian nên vỏ tắt sớm.
      const end = performance.now() + (m.d ?? 5) * 1000;
      v.shield(c.src, m.d ?? 5, () => performance.now() < end, color, 1.7, 0.07);
      if (c.src(_a)) groundRing(v, _a.x, _a.z, 3.2, color, 1.0);
      break;
    }
    case 'shield:ally': {
      // Truyền khiên: một luồng sáng từ người ra tay sang đồng đội, đồng đội dựng trụ mảnh.
      if (m.dst && c.dst(_a)) {
        const from = _a.clone();
        v.swordShot(from, c.src, 0xcff3ff, 0.7, 0.3);
      }
      v.pillar(c.src, 0xcff3ff, 0.9, 0.25, 3.2, 0.1);
      break;
    }
    case 'rain:wide': {
      // Mưa rộng: hai vòng đất nối nhau lan ra mép.
      if (m.x === undefined || m.z === undefined) break;
      const x = m.x;
      const z = m.z;
      const r = m.r ?? 9;
      groundRing(v, x, z, r * 0.6, color, 0.9);
      after(v, 0.25, () => groundRing(v, x, z, r, color, 1.1));
      break;
    }
    case 'rain:focus': {
      // Mưa dồn: một trụ sáng cao mảnh ngay mục tiêu và vòng nhỏ sắc.
      v.pillar(c.dst, color, 0.9, 0.45, 8, 0.2);
      if (m.x !== undefined && m.z !== undefined) groundRing(v, m.x, m.z, m.r ?? 6, 0xfff0a8, 0.9);
      break;
    }
    case 'heal:instant': {
      // Hồi tức thì: chớp lục ngọc gắt, trụ rất ngắn.
      if (c.src(_a)) {
        groundRing(v, _a.x, _a.z, 2.6, 0xb8ffd0, 0.6);
      }
      v.pillar(c.src, 0xb8ffd0, 0.45, 0.32, 3.6, 0.24);
      break;
    }
    case 'heal:hot': {
      // Hồi dần: ba nhịp trụ lục nhỏ lặp mỗi 1,2 giây, như dòng nước chảy vào người.
      v.pillar(c.src, 0x7dffa0, 1.0, 0.5, 2.6, 0.28);
      for (let k = 1; k <= 3; k++) {
        after(v, k * 1.2, () => {
          v.pillar(c.src, 0x7dffa0, 0.8, 0.45, 2.4, 0.3);
          if (c.src(_a)) groundRing(v, _a.x, _a.z, 2.2, 0x7dffa0, 0.9);
        });
      }
      break;
    }
    case 'thunder:quick': {
      // Sét tức thời: vòng xung kích dưới chân mục tiêu, không có nhát chém dọc (không niệm).
      if (c.dst(_a)) {
        groundRing(v, _a.x, _a.z, 2.8, 0xfff0a8, 0.5);
      }
      break;
    }
    case 'thunder:chain': {
      // Sét lan: hai tia phụ rẽ sang hai bên, mỗi đầu tia một chớp nhỏ.
      if (!c.dst(_a)) break;
      v.lightning(_a.x + 3.2, _a.y - 1, _a.z - 2.4, color, 0.9, m.sd ? m.sd + 7 : undefined);
      v.lightning(_a.x - 3.0, _a.y - 1, _a.z + 2.8, color, 0.8, m.sd ? m.sd + 13 : undefined);
      groundRing(v, _a.x, _a.z, 6, color, 0.8);
      break;
    }
  }
}
