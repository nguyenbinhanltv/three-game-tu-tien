import * as THREE from 'three/webgpu';
import { LEVELS } from '@dtl/content';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { createLanternHalos } from '../../render/atmosphere';
import { DungeonFx } from './dungeonFx';
import { xichCracks } from './xichArt';

/**
 * Cảnh Xích Tẫn Khích (DUN-1 PR6; chỉ để nhìn, không đổi vùng boss/đợt quái/bia giữ/ba khe mạch/cổng): hẻm núi lửa tàn đỏ-đen.
 * Địa hình và màu đất ở `xichArt.ts` (đen than núi lửa, không tím); GLB Blender `arch_xich_tan` (cụm cột bazan lục giác có khe than hồng, mảnh obsidian, vỏ dung nham
 * nguội nứt, miệng phun, cây cháy xém, cột cờ gãy, xương + mũ giáp, lò sắt) nạp ở `engine/levelLoad.ts` `loadXkModel`. File này dựng phần động: vết nứt dung nham LÕM có gờ đá
 * (thay màn đỏ dày của `riftVeil`; ba đường chính + khe nhánh, đáy than hồng nhấp nháy mềm), sương tro thấp, quầng lò sắt than hồng.
 */

const SEED = 20261119;
const DG = LEVELS.xich_tan_khich!.dungeon!;
const CENTER = DG.center;

/** Tám lò sắt (khớp `put('brazier', …)` ở `tools/blender/xich_tan_arch.py`): toạ độ tương đối tâm hẻm. */
const BRAZIERS: readonly [number, number][] = [
  [-24, -50],
  [24, -50],
  [-26, 30],
  [26, 30],
  [-14, -68],
  [14, -68],
  [-28, -10],
  [28, -10],
];

/** Vùng cấm đặt vết nứt ngẫu nhiên: quanh bia giữ và lối vào phía nam. */
export function xkKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  return Math.hypot(dx, dz) < minR || (Math.abs(dx) < 9 && dz > 34);
}

export class XichTanArt {
  readonly group = new THREE.Group();
  private readonly fx: DungeonFx;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'xich-tan-art';
    const def = levelTerrain().def;
    const paths = xichCracks(def, (x, z) => heightAt(x, z));
    this.fx = new DungeonFx({
      cx: CENTER.x,
      cz: CENTER.z,
      exit: DG.exit,
      seed: SEED,
      keepOut: xkKeepOut,
      cracks: {
        count: 16,
        rMin: 24,
        rMax: 72,
        floor: [1.0, 0.36, 0.1],
        halo: [0.5, 0.16, 0.04],
        rock: [0.1, 0.08, 0.07],
        w0: 0.16,
        w1: 0.34,
        glowW: 0.5,
        paths,
        pathW: 0.55,
        fade: [24, 52],
      },
      mist: { a: [0.1, 0.075, 0.065], b: [0.3, 0.22, 0.18], innerR: 24, outerR: 80, opacity: 0.3 },
    });
    this.group.add(this.fx.group);
    const pts = BRAZIERS.map(([dx, dz]) => ({ x: CENTER.x + dx, y: heightAt(CENTER.x + dx, CENTER.z + dz) + 2.6, z: CENTER.z + dz }));
    const halos = createLanternHalos(pts, 4.5, 0xff6a2a);
    this.group.add(halos);
    this.disposables.push(halos.geometry, halos.material as THREE.Material);
  }

  update(dt: number): void {
    this.fx.update(dt);
  }

  dispose(): void {
    this.fx.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
