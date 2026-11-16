import { FOREST, featureWeight, KIEM_TRUNG, LAKE, SECT, VALLEY, WATER_Y } from '@dtl/shared';
import { heightAt } from './levelCtx';
import type { Particles } from '../render/vfx/particles';

/**
 * Hạt môi trường quanh camera (V4): bụi sáng trong nắng, phấn hoa, cánh đào, lá rơi, sương mỏng sát đất,
 * tro của Kiếm Trủng. Không có lưới riêng: phát vào hệ hạt GPU dùng chung (M4-5), nên 0 draw call mới và
 * số hạt luôn nằm trong ngân sách của preset. Loại và lượng hạt trộn theo trọng số vùng tại chỗ đứng, nên
 * đi từ sân tông môn xuống thung lũng hay vào rừng thì hạt đổi dần, không giật.
 */

export type AmbientKind = 'mote' | 'pollen' | 'petal' | 'leaf' | 'mist' | 'jade' | 'ash';

/** Số hạt mỗi giây ở preset Vừa, theo loại. */
export type AmbientRates = Record<AmbientKind, number>;

/** Hệ số lượng hạt theo preset (Thấp vẫn có ít hạt cho có không khí). */
export const AMBIENT_SCALE: Record<string, number> = { low: 0.35, medium: 1, high: 1.6 };

const KINDS: AmbientKind[] = ['mote', 'pollen', 'petal', 'leaf', 'mist', 'jade', 'ash'];

/** Màu (sRGB) theo bảng tâm trạng art bible v3 mục 4.1. */
const COLOR = {
  sun: 0xf2c47e, // air_sun_dawn: bụi bắt nắng
  mist: 0xdce6df, // air_mist
  ivory: 0xe6ddcb, // attire_ivory: phấn hoa nhạt
  blossom: 0xe9b4c0, // leaf_blossom
  leaf: 0x3e7552, // leaf
  leafDry: 0xb7ac74, // leaf_dry
  leafGrass: 0x7ea25a, // leaf_grass
  jade: 0x7fe3d0, // spirit_jade: linh khí
  stone: 0x7d786c, // stone: tro
  sword: 0xcff3ff, // spirit_sword: ánh kiếm gãy
};

/**
 * Lượng hạt mỗi giây (preset Vừa) tại vị trí (x, z) với độ cao camera so với đất `above`.
 * Hàm thuần để test: vùng nào ra loại hạt nào.
 */
export function ambientRates(x: number, z: number, above: number, out?: AmbientRates): AmbientRates {
  const r = out ?? ({} as AmbientRates);
  for (const k of KINDS) r[k] = 0;
  const wSect = featureWeight(SECT, x, z);
  const wValley = featureWeight(VALLEY, x, z);
  const wForest = featureWeight(FOREST, x, z);
  const wLake = featureWeight(LAKE, x, z);
  const wTomb = featureWeight(KIEM_TRUNG, x, z);
  const wild = Math.max(0, 1 - wSect - wValley - wForest - wLake - wTomb);
  // Sân tông môn: bụi bắt nắng lơ lửng, cánh đào từ hàng cây quanh sân.
  r.mote += wSect * 34 + wValley * 10 + wild * 8 + wLake * 6;
  r.petal += wSect * 7;
  // Thung lũng và đồng cỏ: phấn hoa.
  r.pollen += wValley * 30 + wild * 14 + wLake * 4;
  // Rừng: lá rơi, linh khí ngọc lấp lánh.
  r.leaf += wForest * 16 + wild * 1.5;
  r.jade += wForest * 5 + wLake * 1.5;
  // Sương mỏng sát đất: dày ở hồ, có ở thung lũng và rừng.
  r.mist += wLake * 5 + wValley * 1.6 + wForest * 2.2 + wild * 1;
  // Kiếm Trủng: tro xám bay, thỉnh thoảng ánh kiếm gãy.
  r.ash += wTomb * 34;
  r.mote *= 1 - wTomb;
  // Bay cao (ngự kiếm): hạt sát đất thưa dần, chỉ còn bụi sáng.
  const lowK = Math.max(0, Math.min(1, 1 - (above - 12) / 25));
  r.mist *= lowK;
  r.pollen *= lowK;
  r.petal *= lowK;
  r.leaf *= lowK;
  r.ash *= Math.max(0.3, lowK);
  return r;
}

const _rates = {} as AmbientRates;

export class AmbientParticles {
  private scale = AMBIENT_SCALE.medium;
  private acc: AmbientRates = { mote: 0, pollen: 0, petal: 0, leaf: 0, mist: 0, jade: 0, ash: 0 };
  private rates: AmbientRates = { mote: 0, pollen: 0, petal: 0, leaf: 0, mist: 0, jade: 0, ash: 0 };
  private sample = 0;
  enabled = true;

  constructor(private readonly ps: Particles) {}

  setQuality(q: string): void {
    this.scale = AMBIENT_SCALE[q] ?? AMBIENT_SCALE.medium;
  }

  /**
   * `cam`: vị trí camera; `focus`: chân người chơi. Hạt sinh quanh điểm giữa hai cái (lệch về phía người
   * chơi), trong vòng cầu ~16 m, để luôn có hạt trước ống kính mà không chắn mặt nhân vật.
   */
  update(dt: number, cam: { x: number; y: number; z: number }, focus: { x: number; y: number; z: number }): void {
    if (!this.enabled || dt <= 0) return;
    const cx = cam.x + (focus.x - cam.x) * 0.65;
    const cy = cam.y + (focus.y - cam.y) * 0.65;
    const cz = cam.z + (focus.z - cam.z) * 0.65;
    this.sample -= dt;
    if (this.sample <= 0) {
      this.sample = 0.25;
      const g = heightAt(cx, cz);
      ambientRates(cx, cz, cy - g, _rates);
      for (const k of KINDS) this.rates[k] = _rates[k] * this.scale;
    }
    // Chặn dt lớn (tab bị treo) để không xả cả loạt hạt một lúc.
    const t = Math.min(dt, 0.1);
    for (const k of KINDS) {
      this.acc[k] += this.rates[k] * t;
      while (this.acc[k] >= 1) {
        this.acc[k] -= 1;
        this.spawn(k, cx, cy, cz);
      }
    }
  }

  private spawn(kind: AmbientKind, cx: number, cy: number, cz: number): void {
    const R = Math.random;
    const a = R() * Math.PI * 2;
    const ps = this.ps;
    if (kind === 'mist') {
      // Mảng sương lớn, rất mờ, sát mặt đất ở xa hơn một chút, trôi chậm theo gió.
      const d = 8 + R() * 26;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const g = Math.max(heightAt(x, z), WATER_Y + 0.2);
      ps.emit('dust', x, g + 0.6 + R() * 1.4, z, 0.5 + R() * 0.3, 0.05, 0.35, 7 + R() * 2, 3.5 + R() * 2, 6 + R() * 3, COLOR.mist, 0.1 + R() * 0.06);
      return;
    }
    const d = Math.sqrt(R()) * 16;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const g = heightAt(x, z);
    const floorY = Math.max(g, WATER_Y) + 0.25;
    switch (kind) {
      case 'mote': {
        const y = Math.max(floorY, cy + (R() - 0.4) * 7);
        ps.emit('glow', x, y, z, (R() - 0.5) * 0.25, 0.04 + R() * 0.08, (R() - 0.5) * 0.25, 4 + R() * 3, 0.1, 0.06, COLOR.sun, 0.4 + R() * 0.25);
        break;
      }
      case 'pollen': {
        const y = floorY + R() * 3.5;
        ps.emit('dust', x, y, z, 0.35 + R() * 0.3, 0.06 + R() * 0.1, 0.2 + R() * 0.2, 4 + R() * 3, 0.08, 0.05, COLOR.ivory, 0.8);
        break;
      }
      case 'petal': {
        const y = floorY + 1.5 + R() * 4.5;
        // Rơi chậm (lực cản cao), gió đẩy ngang.
        ps.emit('dust', x, y, z, 0.6 + R() * 0.6, -0.1, 0.4 + R() * 0.5, 5 + R() * 2, 0.15, 0.13, COLOR.blossom, 0.95, 1.4, 1.6);
        break;
      }
      case 'leaf': {
        const y = floorY + 2 + R() * 6;
        const c = R() < 0.45 ? COLOR.leaf : R() < 0.6 ? COLOR.leafDry : COLOR.leafGrass;
        ps.emit('dust', x, y, z, (R() - 0.3) * 1.2, -0.2, (R() - 0.3) * 1.0, 6 + R() * 2, 0.22, 0.2, c, 0.95, 2.2, 1.3);
        break;
      }
      case 'jade': {
        const y = floorY + 0.3 + R() * 2.5;
        ps.emit('glow', x, y, z, 0, 0.18 + R() * 0.15, 0, 3 + R() * 2, 0.12, 0.03, COLOR.jade, 0.5);
        break;
      }
      case 'ash': {
        const y = floorY + R() * 6;
        if (R() < 0.06) {
          ps.emit('glow', x, y, z, 0, 0.1, 0, 1.5 + R(), 0.14, 0.03, COLOR.sword, 0.6);
        } else {
          ps.emit('dust', x, y, z, 0.5 + R() * 0.5, 0.12 + R() * 0.2, 0.2 + R() * 0.3, 5 + R() * 3, 0.12, 0.08, COLOR.stone, 0.75, -0.05, 0.4);
        }
        break;
      }
    }
  }
}
