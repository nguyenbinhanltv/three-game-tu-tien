// Hiệu ứng chiêu công pháp (Phase 3-5) và hình dạng theo biến thức / cấp chiêu. Chỉ là lớp hình:
// server đã quyết định chiêu ra hay không, trúng ai; client chỉ vẽ theo FX (`v` biến thức, `lv` cấp, `c` màu).
// Dựng từ các nét có sẵn của `Vfx` (kiếm bắn, mưa kiếm, trụ sáng, khiên, pháp trận) nên không thêm loại draw call mới.

import * as THREE from 'three/webgpu';
import { type FxMsg } from '@dtl/shared';
import { groundAt } from '../core/levelCtx';
import { G } from '../core/geo';
import { SIGIL_CIRCLE } from '../../render/vfx/sigil';
import type { Vfx } from './vfx';

type FxPos = (out: THREE.Vector3) => boolean;

/** Màu mặc định của chiêu công pháp khi không có màu trong FX. */
const METHOD_COLORS: Record<string, number> = {
  kanh: 0x9fd8ff,
  vankiem: 0xbfe6ff,
  transon: 0xffc95a,
  kimcuong: 0xffd27a,
  xuanphong: 0x7dffa0,
  hoithien: 0xa8ffc4,
  // E2-G: chiêu bậc 2–3 theo màu công pháp (kiếm ngọc lam trắng, hộ pháp vàng, đan sư lục ngọc).
  hoanhkiem: 0xcff3ff,
  kiemvu: 0x9fd8ff,
  kiemdan: 0x7fd8ff,
  kiemdan_hit: 0x7fd8ff,
  kiemanh: 0xd8e8ff,
  sonnhac_stomp: 0xffc95a,
  nghichkiem: 0x9fd8ff,
  thietquyen: 0xffc95a,
  kimchung: 0xffd27a,
  sonnhac: 0xffc95a,
  dichson: 0xffc95a,
  moclinh: 0x7dffa0,
  duocvu: 0xa8ffc4,
  ngungdan: 0x7fe3d0,
  danhoa: 0x6fd8ff,
};

/** Các loại FX công pháp mới (chiêu đặc trưng, tối thượng). */
export const METHOD_FX = new Set(['kanh', 'vankiem', 'transon', 'kimcuong', 'xuanphong', 'hoithien', 'hoanhkiem', 'kiemvu', 'kiemdan', 'kiemdan_hit', 'kiemanh', 'sonnhac_stomp', 'nghichkiem', 'thietquyen', 'kimchung', 'sonnhac', 'dichson', 'moclinh', 'duocvu', 'ngungdan', 'danhoa']);

/** Màu hex của FX (chuỗi 6 ký tự từ server), thiếu hoặc hỏng thì dùng `fallback`. */
export function fxColor(m: FxMsg, fallback: number): number {
  if (typeof m.c === 'string' && /^[0-9a-f]{6}$/i.test(m.c)) return parseInt(m.c, 16);
  return fallback;
}

/** Hệ số cỡ theo cấp chiêu: mỗi cấp thêm 6%, cấp 5 sáng hơn một chút. */
function levelScale(lv: number | undefined): number {
  return 1 + 0.06 * (Math.max(1, Math.min(5, lv ?? 1)) - 1);
}

const _a = new THREE.Vector3();

/** Pháp trận tròn nằm trên đất, hiện ra rồi tan dần. */
function groundRing(v: Vfx, x: number, z: number, r: number, color: number, dur: number): void {
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

interface MethodFxCtx {
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
    case 'hoanhkiem': {
      // Hoành Kiếm Phá Mạch: một đường kiếm khí trắng ngà quét dọc vệt chém, nền đất nứt sáng mờ chạy theo.
      if (!c.src(_a)) return true;
      const x0 = _a.x;
      const z0 = _a.z;
      const y0 = _a.y;
      const len = m.r ?? 12;
      const dx = (m.x ?? x0) - x0;
      const dz = (m.z ?? z0) - z0;
      const dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl;
      const uz = dz / dl;
      const waves = m.v === 'twin' ? 2 : 1;
      const marks = Math.max(3, Math.min(7, Math.round(len / 2.2)));
      for (let w = 0; w < waves; w++) {
        for (let i = 0; i < marks; i++) {
          const f = (i + 0.5) / marks;
          const p = new THREE.Vector3(x0 + ux * len * f, y0 - 0.15, z0 + uz * len * f);
          after(v, w * 0.15 + f * 0.1, () => v.slashMark(fixed(p), m.v === 'long' ? 0xffffff : color, (m.v === 'long' ? 0.55 : 0.45) * sc, -0.05, 0.2, i === 0 && w === 0, p));
        }
      }
      groundRing(v, x0 + ux * len * 0.5, z0 + uz * len * 0.5, 1.6, color, 0.5);
      return true;
    }
    case 'kiemvu': {
      // Kiếm Vũ Tam Điệp: ba nhịp nháy nhỏ ở ngực người ra chiêu (ba vệt kiếm chồng đã vẽ bởi K-6); nhát cuối có tia dài.
      if (!c.dst(_a)) return true;
      const at = _a.clone();
      v.burst(at, color, 0.7 * sc, 0.2);
      if (m.v === 'knock') after(v, 0.6, () => groundRing(v, at.x, at.z, 2.4, color, 0.5));
      return true;
    }
    case 'kiemdan_hit': {
      // Mỗi nhịp kiếm đan đâm: tia nhỏ từ thân tới mục tiêu. (Id riêng để không kích lại động tác niệm của chiêu.)
      if (c.src(_a)) v.swordShot(_a.clone().add(new THREE.Vector3(0, 0.3, 0)), c.dst, color, 0.6, 0.16, (at) => v.burst(at.clone(), color, 0.5, 0.16));
      return true;
    }
    case 'kiemanh': {
      // Phân Anh Kiếm Ảnh (E4-G): mỗi nhịp lặp lại, một tia bạc từ sau lưng người ra chiêu tới mục tiêu.
      if (c.src(_a)) v.swordShot(_a.clone().add(new THREE.Vector3(0, 0.9, 0)), c.dst, color, 0.8, 0.2, (at) => v.burst(at.clone(), color, 0.6, 0.18));
      return true;
    }
    case 'sonnhac_stomp': {
      // Mỗi nhịp giậm của Sơn Nhạc Hóa Thân (biến thức B).
      groundRing(v, m.x ?? 0, m.z ?? 0, m.r ?? 6, color, 0.6);
      return true;
    }
    case 'kiemdan': {
      // Kiếm Đan Bản Mệnh: kiếm nhỏ ngọc lam quay quanh thân suốt thời gian chiêu; mỗi nhịp đâm có một tia tới mục tiêu.
      const n = Math.min(2, Math.max(1, Math.round(m.n ?? 1)));
      const dur = m.d ?? 10;
      for (let k = 0; k < n; k++) {
        const blade = v.fx(G.octa, color, 0.9, 'glow');
        let t = 0;
        v.track(
          dur,
          (_k, dt) => {
            t += dt;
            if (!c.src(_a)) return;
            const a = t * 3.4 + (k * Math.PI * 2) / n;
            blade.position.set(_a.x + Math.cos(a) * 1.15, _a.y + 0.4 + Math.sin(t * 2 + k) * 0.18, _a.z + Math.sin(a) * 1.15);
            blade.rotation.y = -a;
            blade.scale.set(0.09, 0.09, 0.4);
            blade.fxOpacity = Math.min(1, t * 4, (dur - t) * 3);
          },
          () => v.drop(blade),
        );
      }
      return true;
    }
    case 'nghichkiem': {
      // Nghịch Kiếm Chuyển Phong: vệt kiếm quang kéo từ chỗ đứng cũ; tới đích nổ một vòng nhỏ.
      if (c.src(_a)) {
        v.slashMark(c.src, color, 0.9 * sc, -0.05, 0.22, false);
        v.burst(_a, color, 0.9, 0.2);
      }
      return true;
    }
    case 'thietquyen': {
      // Thiết Quyền Chấn Địa: vòng chấn động vàng tỏa ra tới mép, bụi đá bắn lên.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 6;
      groundRing(v, x, z, r, color, 0.9);
      after(v, 0.12, () => groundRing(v, x, z, r * 0.6, color, 0.7));
      if (m.v === 'slow') after(v, 0.3, () => groundRing(v, x, z, r * 0.9, 0xb89a5a, 3.5));
      const n = c.mine ? 18 : 8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        v.particles.emit('dust', x + Math.cos(ang) * 1.2, (m.y ?? 0) + 0.2, z + Math.sin(ang) * 1.2, Math.cos(ang) * 3, 1.6 + Math.random(), Math.sin(ang) * 3, 0.45, 0.15, 0.35, 0xcdb27a, 0.7, 6, 1);
      }
      return true;
    }
    case 'kimchung': {
      // Kim Chung Trấn: chuông vàng úp quanh thân suốt thời gian giữ thế.
      softDome(c, color, m.d ?? 6, m.v === 'thorn' ? 0.7 : 0.6, 0.06);
      return true;
    }
    case 'sonnhac': {
      // Sơn Nhạc Hóa Thân: thân ngọc đá phình ra (vòng đất vàng + trụ đá), mỗi lần giậm có vòng chấn động.
      softDome(c, 0xc9b27a, m.d ?? 10, 0.8, 0.05);
      groundRing(v, m.x ?? 0, m.z ?? 0, 2.4, color, 1.2);
      return true;
    }
    case 'dichson': {
      // Dịch Sơn Xung: bụi đá cuộn sau lưng, vòng vàng ở chỗ húc.
      if (c.src(_a)) {
        v.burst(_a, color, 1.0, 0.22);
        for (let i = 0; i < (c.mine ? 14 : 6); i++) v.particles.emit('dust', _a.x, _a.y - 0.9, _a.z, (Math.random() - 0.5) * 3, 0.8 + Math.random(), (Math.random() - 0.5) * 3, 0.5, 0.15, 0.4, 0xcdb27a, 0.7, 4, 1);
      }
      return true;
    }
    case 'moclinh': {
      // Mộc Linh Trận: vòng lá ngọc dưới đất (hiện suốt thời gian trận), cột sáng nhỏ ở tâm.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 8;
      groundRing(v, x, z, r, color, Math.min(m.d ?? 8, 4));
      after(v, 4, () => groundRing(v, x, z, r * 0.9, color, 3.5));
      if (m.v === 'venom') after(v, 0.2, () => groundRing(v, x, z, r * 0.6, 0x9fe05a, 2));
      return true;
    }
    case 'duocvu': {
      // Dược Vũ: mưa lá ngọc rơi trên vùng hồi.
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 10;
      groundRing(v, x, z, r, color, 1.6);
      const n = c.mine ? 28 : 10;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * r;
        v.particles.emit('glow', x + Math.cos(ang) * rr, (m.y ?? 0) + 4 + Math.random() * 2, z + Math.sin(ang) * rr, 0, -2.2, 0, 1.6, 0.08, 0.03, color, 0.8, 0, 0);
      }
      return true;
    }
    case 'ngungdan': {
      // Ngưng Đan Hộ Thế: quầng đan ngọc bao mỗi người nhận khiên.
      softDome(c, color, m.d ?? 10, m.v === 'big' ? 0.65 : 0.55, 0.06);
      if (c.src(_a)) groundRing(v, _a.x, _a.z, 1.8, color, 0.9);
      return true;
    }
    case 'danhoa': {
      // Đan Hỏa Phong Tràn: cầu lửa lam bay tới mục tiêu rồi nổ vòng lửa.
      if (!c.src(_a)) return true;
      const x = m.x ?? 0;
      const z = m.z ?? 0;
      const r = m.r ?? 6;
      v.swordShot(_a.clone(), c.dst, color, 1.1 * sc, 0.28, (at) => {
        v.burst(at.clone(), color, 1.4, 0.3);
        groundRing(v, x, z, r, color, 1.1);
      });
      return true;
    }
  }
  return false;
}

/**
 * Quầng bao thân của chiêu giữ thế (E2-G): kiểu `dome` (rìa sáng, giữa trong suốt), độ đậm thấp, giữ nguyên nửa giây đầu rồi mờ
 * còn một phần tư tới hết thời gian chiêu: nhân vật giữ màu gốc, quầng chỉ báo "đang có hiệu lực".
 */
function softDome(c: MethodFxCtx, color: number, dur: number, scale: number, alpha: number): void {
  const m = c.v.fx(G.dome, color, alpha, 'dome');
  let t = 0;
  c.v.track(
    dur,
    (_k, dt) => {
      t += dt;
      if (!c.src(_a)) {
        m.visible = false;
        return;
      }
      m.visible = true;
      m.position.copy(_a).setY(_a.y - 0.2);
      m.scale.set(1.25 * scale, 1.5 * scale, 1.25 * scale);
      m.rotation.y = t * 1.5;
      const f = t < 0.5 ? 1 : Math.max(0.25, 1 - (t - 0.5) / 1.0);
      m.fxOpacity = (alpha / 0.28) * f * (0.92 + Math.sin(t * 5) * 0.08);
    },
    () => c.v.drop(m),
  );
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
