import * as THREE from 'three/webgpu';
import { hash01 } from '@dtl/shared';
import type { DeadTreeSpot } from './bacHoangArt';

/**
 * Cây chết thủ tục của Bắc Hoang (DV-3I): ba kiểu thân trụi cành dựng bằng code (thân cong thon dần, cành chẻ đệ quy, không lá), mỗi kiểu một `InstancedMesh`
 * (3 draw call cho mọi cây), vật liệu PBR nhám màu tro than, sắc độ riêng từng cây. Không dùng asset ngoài, không texture. Mỗi cây ~200 tam giác.
 */
const SIDES = 5;

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];

  /** Ống thon từ a (bán kính ra) đến b (bán kính rb), SIDES cạnh. */
  tube(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): void {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize();
    const w = new THREE.Vector3().crossVectors(dir, u).normalize();
    const base = this.pos.length / 3;
    for (let k = 0; k < 2; k++) {
      const c = k ? b : a;
      const r = k ? rb : ra;
      for (let i = 0; i < SIDES; i++) {
        const t = (i / SIDES) * Math.PI * 2;
        const nx = u.x * Math.cos(t) + w.x * Math.sin(t);
        const ny = u.y * Math.cos(t) + w.y * Math.sin(t);
        const nz = u.z * Math.cos(t) + w.z * Math.sin(t);
        this.pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
        this.nrm.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < SIDES; i++) {
      const i2 = (i + 1) % SIDES;
      this.idx.push(base + i, base + SIDES + i, base + i2, base + i2, base + SIDES + i, base + SIDES + i2);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Cành đệ quy: đi theo hướng `dir`, uốn nhẹ, chẻ hai ở cuối đoạn. */
function branch(b: Builder, from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, seed: number): void {
  const segs = depth === 0 ? 3 : 2;
  let p = from.clone();
  let d = dir.clone();
  let rr = r;
  for (let s = 0; s < segs; s++) {
    const bend = new THREE.Vector3(
      (hash01(seed, s, 11) - 0.5) * 0.5,
      (hash01(seed, s, 13) - 0.4) * 0.18,
      (hash01(seed, s, 17) - 0.5) * 0.5,
    );
    d = d.clone().add(bend).normalize();
    const q = p.clone().addScaledVector(d, len / segs);
    const r2 = rr * 0.72;
    b.tube(p, q, rr, r2);
    p = q;
    rr = r2;
  }
  if (depth >= 2 || len < 0.5) return;
  const n = depth === 0 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = hash01(seed, i + 3, 31) * Math.PI * 2;
    const spread = 0.55 + hash01(seed, i, 37) * 0.5;
    const nd = d
      .clone()
      .add(new THREE.Vector3(Math.cos(a) * spread, 0.25 + hash01(seed, i, 41) * 0.3, Math.sin(a) * spread))
      .normalize();
    branch(b, p, nd, len * (0.55 + hash01(seed, i, 43) * 0.2), rr * 0.8, depth + 1, seed * 7 + i + 1);
  }
}

/** Thân cây chết cao ~5–8 m: kiểu 0 thẳng gãy ngọn, 1 cong nghiêng nhiều cành, 2 gốc thấp xoắn. */
function deadTreeGeometry(kind: number): THREE.BufferGeometry {
  const b = new Builder();
  const base = new THREE.Vector3(0, -0.4, 0);
  if (kind === 0) {
    const top = new THREE.Vector3(0.3, 4.2, -0.2);
    b.tube(base, new THREE.Vector3(0.1, 2.2, 0), 0.34, 0.24);
    b.tube(new THREE.Vector3(0.1, 2.2, 0), top, 0.24, 0.1);
    branch(b, new THREE.Vector3(0.1, 2.9, 0), new THREE.Vector3(1, 0.7, 0.2).normalize(), 2.4, 0.1, 1, 5);
    branch(b, new THREE.Vector3(0.2, 3.4, -0.1), new THREE.Vector3(-0.8, 0.8, -0.5).normalize(), 2.0, 0.09, 1, 9);
  } else if (kind === 1) {
    const m1 = new THREE.Vector3(0.7, 2.4, 0.2);
    const m2 = new THREE.Vector3(1.3, 4.4, 0.1);
    b.tube(base, m1, 0.3, 0.22);
    b.tube(m1, m2, 0.22, 0.12);
    branch(b, m2, new THREE.Vector3(0.5, 1, 0.2).normalize(), 2.2, 0.11, 0, 21);
    branch(b, m1, new THREE.Vector3(-1, 0.9, 0.3).normalize(), 2.6, 0.12, 0, 33);
    branch(b, new THREE.Vector3(0.9, 3.3, 0.15), new THREE.Vector3(0.4, 0.8, -1).normalize(), 2.0, 0.09, 1, 47);
  } else {
    const m1 = new THREE.Vector3(-0.3, 1.5, 0.35);
    const m2 = new THREE.Vector3(0.2, 2.8, -0.2);
    b.tube(base, m1, 0.42, 0.3);
    b.tube(m1, m2, 0.3, 0.17);
    branch(b, m2, new THREE.Vector3(0, 1, 0.5).normalize(), 2.3, 0.14, 0, 61);
    branch(b, m1, new THREE.Vector3(1, 0.6, -0.4).normalize(), 2.4, 0.12, 0, 73);
  }
  return b.geometry();
}

export class DeadTrees {
  readonly group = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private mat: THREE.MeshStandardNodeMaterial;
  readonly count: number;

  constructor(spots: readonly DeadTreeSpot[], heightAt: (x: number, z: number) => number) {
    this.group.name = 'dead-trees';
    this.mat = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    this.count = spots.length;
    for (let kind = 0; kind < 3; kind++) {
      const mine = spots.filter((s) => s.kind === kind);
      if (!mine.length) continue;
      const g = deadTreeGeometry(kind);
      this.geos.push(g);
      const mesh = new THREE.InstancedMesh(g, this.mat, mine.length);
      mesh.name = `dead-tree-${kind}`;
      mine.forEach((s, i) => {
        e.set((hash01(i, kind, 91) - 0.5) * 0.18, s.yaw, (hash01(i, kind, 93) - 0.5) * 0.18);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z),
          q,
          new THREE.Vector3(s.s, s.s * (0.85 + hash01(i, kind, 95) * 0.4), s.s),
        );
        mesh.setMatrixAt(i, m);
        // Tro than có hơi ấm: 0x3a3330 ± 20 %, vài cây ngả huyết sậm.
        const k = 0.8 + hash01(i, kind, 97) * 0.45;
        col.setRGB(0.2 * k, 0.17 * k, 0.16 * k);
        if (hash01(i, kind, 99) > 0.88) col.lerp(new THREE.Color(0x3a1a1c), 0.5);
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose();
  }
}
