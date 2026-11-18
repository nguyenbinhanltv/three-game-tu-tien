// R-8: tách từ game/vfx.ts (hàm nhận `v: Vfx`, trước là phương thức của lớp Vfx).
import * as THREE from 'three/webgpu';
import { groundAt } from '../../../base/levelCtx';
import {
  BEAM_GEO,
  LOOT_ARC,
  LOOT_BOUNCE,
  LOOT_GOLD,
  LOOT_TIERS,
  lootCrowd,
  lootDuration,
  lootHop,
  lootPulse,
  type LootTier,
} from '../../../render/vfx/loot';
import { PARTICLES } from '../../../render/vfx/particles';
import { G } from '../../core/geo';
import { LOOT_FX_MAX, RING_GEO, _a } from './common';
import type { Vfx } from '../vfx';

/**
 * Đồ rơi (M4-6), chỉ là lớp hình: viên đồ nảy ra từ `from` (ngực quái) tới một điểm quanh xác, chạm
 * đất (gọi `onLand`: chuông), cột sáng theo bậc dâng lên, nằm một lúc rồi biến mất (gọi `onCollect`
 * với vị trí cuối: engine cho icon bay vào túi). `slot`: thứ tự món trong cùng một lần rơi, để các món
 * tỏa ra các hướng khác nhau và nảy lệch nhịp. Trả về điểm chạm đất (cho chỉ báo ngoài màn hình).
 */
export function lootDrop(
  v: Vfx,
  from: THREE.Vector3,
  tier: LootTier,
  slot = 0,
  onLand?: () => void,
  onCollect?: (at: THREE.Vector3) => void,
  color?: number,
): THREE.Vector3 {
  const T = LOOT_TIERS[tier]!;
  const col = color ?? T.color;
  const delay = Math.min(slot, 5) * 0.12;
  const ang = Math.random() * Math.PI * 2 + slot * 2.4;
  const dist = 0.9 + Math.random() * 0.7;
  const tx = from.x + Math.cos(ang) * dist;
  const tz = from.z + Math.sin(ang) * dist;
  const ground = groundAt(tx, tz);
  const gy = ground + 0.32;
  const sx = from.x;
  const sy = from.y;
  const sz = from.z;
  const size = 1 + tier * 0.18;
  const gem = v.fx(G.octa, col, 0.95);
  gem.visible = false;
  // Quá `LOOT_FX_MAX` món đang rơi cùng lúc thì món mới chỉ có viên đồ (không cột, vòng, lõi): đỡ cộng sáng chồng thành mảng trắng.
  const full = v.lootActive >= LOOT_FX_MAX;
  const beam = v.fx(BEAM_GEO, col, 0, 'beam');
  beam.fxA.w = Math.random() * 40;
  beam.position.set(tx, ground - 0.05, tz);
  beam.scale.set(T.radius, T.height, T.radius);
  const core = T.core && !full ? v.fx(BEAM_GEO, 0xfff6dc, 0, 'beam') : null;
  if (core) {
    core.fxA.w = beam.fxA.w + 11;
    core.position.copy(beam.position);
    core.scale.set(T.radius * 0.4, T.height * 0.75, T.radius * 0.4);
  }
  const ring = tier > 0 && !full ? v.fx(RING_GEO, col, 0) : null;
  if (ring) {
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tx, ground + 0.08, tz);
  }
  const lift = LOOT_ARC + LOOT_BOUNCE + T.hold;
  v.lootActive++;
  let t = 0;
  let landed = false;
  let collected = false;
  v.add(
    delay + lootDuration(tier),
    (_k, dt) => {
      t += dt;
      const tt = t - delay;
      if (tt < 0) return;
      // Viên đồ: vồng từ xác xuống đất, nảy lại một lần, rồi lơ lửng xoay chậm.
      if (!collected) {
        gem.visible = true;
        const f = Math.min(1, tt / LOOT_ARC);
        const bob = tt > LOOT_ARC + LOOT_BOUNCE ? 0.1 + Math.sin(tt * 3.2) * 0.05 : 0;
        gem.position.set(sx + (tx - sx) * f, sy + (gy - sy) * f + lootHop(tt) + bob, sz + (tz - sz) * f);
        gem.rotation.y += dt * (tt < LOOT_ARC ? 9 : 2.6);
        gem.scale.set(0.15 * size, 0.26 * size, 0.15 * size);
        gem.fxK = Math.min(1, tt / 0.4);
      }
      if (!landed && tt >= LOOT_ARC) {
        landed = true;
        onLand?.();
        _a.set(tx, gy, tz);
        v.burst(_a, col, 0.5 + tier * 0.25, 0.3);
        for (let i = 0; i < T.sparks; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * T.radius * 0.8;
          PARTICLES.emit(
            'glow',
            tx + Math.cos(a) * r,
            ground + 0.2,
            tz + Math.sin(a) * r,
            0,
            1.4 + Math.random() * 2.2,
            0,
            1 + Math.random() * 0.9,
            0.09,
            0.02,
            i & 1 ? 0xfff6dc : col,
            0.9,
            -0.6,
            0.6,
          );
        }
      }
      // Cột sáng: dâng từ chân lên trong 0,25 giây sau khi chạm đất, tan dần sau khi đồ bay đi.
      const bt = tt - LOOT_ARC;
      if (bt >= 0) {
        const out = tt > lift ? Math.max(0, 1 - (tt - lift) / 0.7) : 1;
        beam.fxA.x = Math.min(1.1, bt / 0.25);
        beam.fxK = Math.min(1, bt / 0.8);
        // Camera sát hay nằm trong cột (nhiều món rơi chồng nhau): mặt cột che kín màn hình thành tấm trắng cháy sáng, nên mờ dần khi lại gần.
        const cam = v.camera;
        const near = cam ? Math.min(1, Math.max(0, (Math.hypot(cam.position.x - tx, cam.position.z - tz) - T.radius * 1.2) / 5)) : 1;
        const vis = (0.15 + 0.85 * near) * lootCrowd(v.lootActive);
        beam.fxOpacity = full ? 0 : T.alpha * out * lootPulse(tier, bt) * vis;
        if (core) {
          core.fxA.x = Math.min(1.1, bt / 0.35);
          core.fxK = beam.fxK;
          core.fxOpacity = 0.5 * out * vis;
        }
        if (ring) {
          // Loang ra rồi đọng lại thành quầng dưới chân cột, thở nhẹ, tắt cùng cột.
          const rk = Math.min(1, bt / 0.5);
          const e = 1 - (1 - rk) * (1 - rk);
          ring.scale.setScalar((0.3 + e * 0.7) * (0.8 + tier * 0.45) * (1 + Math.sin(bt * 5) * 0.04));
          ring.fxOpacity = (0.85 - e * 0.4) * out * lootCrowd(v.lootActive);
        }
      }
      if (!collected && tt >= lift) {
        collected = true;
        gem.visible = false;
        v.burst(gem.position, col, 0.35, 0.2);
        onCollect?.(gem.position);
      }
    },
    () => {
      v.lootActive = Math.max(0, v.lootActive - 1);
      v.drop(gem);
      v.drop(beam);
      if (core) v.drop(core);
      if (ring) v.drop(ring);
    },
  );
  return new THREE.Vector3(tx, gy, tz);
}

/** Đồng tiền nảy ra từ xác rồi lóe lên và tan (vàng đã vào túi; không cột sáng, không bay vào túi). */
export function goldDrop(v: Vfx, from: THREE.Vector3): void {
  const ang = Math.random() * Math.PI * 2;
  const tx = from.x + Math.cos(ang) * 0.7;
  const tz = from.z + Math.sin(ang) * 0.7;
  const gy = groundAt(tx, tz) + 0.18;
  const sx = from.x;
  const sy = from.y;
  const sz = from.z;
  const coin = v.fx(G.octa, LOOT_GOLD, 0.95);
  const end = LOOT_ARC + LOOT_BOUNCE + 0.3;
  let t = 0;
  v.add(
    end,
    (_k, dt) => {
      t += dt;
      const f = Math.min(1, t / LOOT_ARC);
      coin.position.set(sx + (tx - sx) * f, sy + (gy - sy) * f + lootHop(t, 1.1), sz + (tz - sz) * f);
      coin.rotation.y += dt * 12;
      const fade = t > end - 0.3 ? Math.max(0, (end - t) / 0.3) : 1;
      coin.scale.set(0.13 * fade, 0.04 + 0.13 * fade, 0.13 * fade);
      coin.fxOpacity = 0.95 * fade;
    },
    () => {
      v.burst(coin.position, LOOT_GOLD, 0.3, 0.18);
      v.drop(coin);
    },
  );
}
