import * as THREE from 'three/webgpu';
import { type HazardMsg } from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';
import { SIGIL_CONE, SIGIL_RECT } from '../../render/vfx/sigil';
import { hazardFlash, hazardStyleDanger, ISO_HAZARD_OPACITY } from '../../render/vfx/phases';
import type { Vfx } from './vfx';

/**
 * Vùng báo trước hình chữ nhật/quạt (đòn của quái đánh xa). Chỉ vẽ; ai trúng do server phán định
 * bằng `inHazard` trong packages/shared. Hình tròn đi qua `Vfx.hazard`.
 *
 * Mỗi vùng là MỘT pháp trận (render/vfx/sigil.ts, M4-3): nền mực đúng hình, viền, dải phù văn trôi,
 * sọc chữ V/cung chảy ra ngoài, vạch tiến độ chạy từ gốc ra mép theo đúng `delay` của server. Vạch
 * chạm mép là lúc nổ; chớp khi nổ là `Vfx.burst` (có bloom).
 */

const _p = new THREE.Vector3();

export function telegraph(v: Vfx, m: HazardMsg, boss = false, danger: 0 | 1 | 2 = boss ? 2 : 1, top = false, tint?: number): void {
  if (!m.sh || !(m.r > 0) || !(m.delay > 0)) return;
  const style = hazardStyleDanger(m.kind, danger);
  const light = tint ?? (m.hot && m.kind === 'lightning' ? 0xff9a5a : style.color);
  const yaw = m.yaw ?? 0;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Mặt đất không phẳng: đặt cao hơn điểm cao nhất dọc trục để không bị cắt.
  let y = -Infinity;
  for (let i = 0; i <= 4; i++) y = Math.max(y, groundAt(m.x + fx * m.r * (i / 4), m.z + fz * m.r * (i / 4)));
  y += 0.3;

  const rect = m.sh === 'rect';
  const w = rect ? (m.w ?? 2) : Math.min(Math.PI * 0.45, Math.max(0.05, m.w ?? Math.PI / 6));
  const s = v.sigil(rect ? SIGIL_RECT : SIGIL_CONE, m.x, m.z, yaw, m.r, w, light, y, top);
  s.fxColor.multiplyScalar(style.gain);

  v.track(
    m.delay,
    (k) => {
      s.fxA.x = k;
      s.fxA.z = hazardFlash(k, m.delay);
      s.fxOpacity = Math.min(1, k * 10) * ISO_HAZARD_OPACITY;
    },
    () => {
      v.drop(s);
      // Nổ: vài chớp sáng dọc trục chiêu. Chiêu có timeline nổ riêng (`top` = `MonFx.ownWarn`) tự vẽ vùng nổ: bỏ chớp màu cảnh báo (đỏ) này
      // vì đỏ chỉ dành cho vạch báo, và chớp tỏa tròn đỏ-hồng đè lên vùng nổ làm lẫn với cảnh báo.
      for (let i = 1; i <= 3 && !top; i++) {
        const d = m.r * (i / 3.4);
        _p.set(m.x + fx * d, 0, m.z + fz * d);
        _p.y = groundAt(_p.x, _p.z) + 0.6;
        v.burst(_p, light, rect ? (m.w ?? 2) * 0.9 : 1 + d * 0.35, 0.35);
        // Tia quét của thiên kiếp (vạch sét): mỗi chớp kèm một tia đánh thật; lôi hỏa nhuốm cam.
        if (m.kind === 'lightning') v.lightning(_p.x, _p.y - 0.6, _p.z, m.hot ? 0xffc89a : 0xe2d4ff, 0.9, (m.sd ?? 7) + i * 131);
      }
    },
  );
}
