// Cảnh riêng của level đảo nổi (E3-N): cầu xích mây (mặt đi bộ do `heightAt` của shared quyết định, đây chỉ là hình) và đảo giả.
// Đảo giả KHÔNG có mặt đứng (bước lên là rơi về sàn mây); nhìn thì thật như đảo thường, thần thức (V) quét qua thì mờ đi và ánh xanh.
// Cầu: ván gỗ, dây xích hai bên, trụ; gộp ba InstancedMesh cho cả level.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bridgeDeckY, type BridgeDef, type IslandDef, type Terrain } from '@dtl/shared';
import type { SpiritScan } from '../ui/store';

const PLANK = 0.9;
const RAIL_H = 1.15;
const POST_EVERY = 6;
const FAKE_OPACITY_REVEALED = 0.32;
const FAKE_FADE_PER_S = 2.2;
const C_GRASS = new THREE.Color(0x6f9d58);
const C_ROCK = new THREE.Color(0x7d7a76);
const C_TREE = new THREE.Color(0x3f6b49);

interface Fake {
  def: IslandDef;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  /** Vòng mép đảo và cột sáng chỉ hiện khi thần thức lộ đảo giả. */
  glow: THREE.Mesh[];
  glowMat: THREE.MeshBasicMaterial;
  k: number;
}

export class SkyIslands {
  readonly group = new THREE.Group();
  private fakes: Fake[] = [];
  private disposables: { dispose(): void }[] = [];
  private lastMs = 0;

  constructor(parent: THREE.Object3D, terrain: Terrain) {
    this.group.name = 'skyIslands';
    const def = terrain.def;
    if (def.bridges?.length) this.buildBridges(def.bridges);
    for (const f of def.fakeIslands ?? []) this.buildFake(f);
    parent.add(this.group);
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildBridges(bridges: BridgeDef[]): void {
    const planks: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const b of bridges) {
      const dx = b.bx - b.ax;
      const dz = b.bz - b.az;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz); // trục z cục bộ của ván chạy dọc cầu
      const n = Math.max(2, Math.round(len / PLANK));
      const at = (t: number): [number, number, number] => [b.ax + dx * t, bridgeDeckY(b, t), b.az + dz * t];
      for (let i = 0; i < n; i++) {
        const [x0, y0, z0] = at(i / n);
        const [x1, y1, z1] = at((i + 1) / n);
        const flat = Math.hypot(x1 - x0, z1 - z0);
        const segLen = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const pitch = -Math.atan2(y1 - y0, flat);
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const cz = (z0 + z1) / 2;
        q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        planks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy - 0.09, cz), q.clone(), new THREE.Vector3(1, 1, (segLen / PLANK) * 0.94)));
        // dây xích tay vịn: hình trụ (trục y) xoay nằm dọc nhịp
        const qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch + Math.PI / 2, yaw, 0, 'YXZ'));
        for (const side of [-1, 1]) {
          const ox = Math.cos(yaw) * (b.halfW + 0.15) * side;
          const oz = -Math.sin(yaw) * (b.halfW + 0.15) * side;
          rails.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + ox, cy + RAIL_H, cz + oz), qr.clone(), new THREE.Vector3(1, segLen * 1.02, 1)));
          if (i % POST_EVERY === 0 || i === n - 1) {
            posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x0 + ox, y0 + RAIL_H / 2, z0 + oz), new THREE.Quaternion(), one));
          }
        }
      }
    }
    const plankGeo = this.track(new THREE.BoxGeometry(2 * 2.6 + 0.3, 0.18, PLANK));
    const railGeo = this.track(new THREE.CylinderGeometry(0.05, 0.05, 1, 5));
    const postGeo = this.track(new THREE.CylinderGeometry(0.09, 0.11, RAIL_H, 6));
    const wood = this.track(new THREE.MeshStandardMaterial({ color: 0xcfc2a6, roughness: 0.85, metalness: 0 }));
    const chain = this.track(new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.45, metalness: 0.7 }));
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], name: string) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      im.name = name;
      this.group.add(im);
    };
    mk(plankGeo, wood, planks, 'bridge-planks');
    mk(railGeo, chain, rails, 'bridge-chains');
    mk(postGeo, chain, posts, 'bridge-posts');
  }

  /** Đảo giả: lathe (mặt phẳng + thân đá nhọn xuống dưới) cộng vài cây nón, gộp một mesh có màu đỉnh. */
  private buildFake(f: IslandDef): void {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(f.r, 0),
      new THREE.Vector2(f.r + f.edge * 0.5, -5),
      new THREE.Vector2(f.r * 0.85, -16),
      new THREE.Vector2(f.r * 0.5, -34),
      new THREE.Vector2(f.r * 0.2, -52),
      new THREE.Vector2(0.01, -62),
    ];
    const body = new THREE.LatheGeometry(pts, 28).toNonIndexed();
    const painted = (g: THREE.BufferGeometry, pick: (x: number, y: number, z: number) => THREE.Color) => {
      const pos = g.attributes.position;
      const colors: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const c = pick(pos.getX(i), pos.getY(i), pos.getZ(i));
        colors.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return g;
    };
    painted(body, (x, y, z) => (y > -0.5 && Math.hypot(x, z) < f.r + 0.5 ? C_GRASS : C_ROCK));
    const parts: THREE.BufferGeometry[] = [body];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + f.x * 0.01;
      const rr = f.r * (0.25 + (0.4 * ((i * 37) % 10)) / 10);
      const tree = new THREE.ConeGeometry(2.4, 9, 7).toNonIndexed();
      tree.translate(Math.cos(a) * rr, 4.5, Math.sin(a) * rr);
      parts.push(painted(tree, () => C_TREE));
    }
    const merged = this.track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    const mat = this.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, transparent: true, opacity: 1, emissive: new THREE.Color(0x9fe8ff), emissiveIntensity: 0 }));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(f.x, f.y, f.z);
    mesh.name = 'fake-island';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const glowMat = this.track(new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const ring = new THREE.Mesh(this.track(new THREE.RingGeometry(f.r - 1.2, f.r, 64)), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x, f.y + 0.3, f.z);
    const beam = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.7, 0.7, 140, 10, 1, true)), glowMat);
    beam.position.set(f.x, f.y + 55, f.z);
    for (const g of [ring, beam]) {
      g.visible = false;
      g.frustumCulled = false;
      this.group.add(g);
    }
    this.fakes.push({ def: f, mesh, mat, glow: [ring, beam], glowMat, k: 0 });
  }

  /** Số đảo giả đang mờ do thần thức (để test/ảnh chụp). */
  get revealed(): number {
    return this.fakes.filter((f) => f.k > 0.5).length;
  }

  /** Thần thức vừa quét (còn hiệu lực, trong phạm vi) thì đảo giả hiện mờ; hết hạn thì đặc lại. `nowMs` cùng đồng hồ với `scan.until`. */
  update(scan: SpiritScan | null, nowMs: number): void {
    const dt = this.lastMs ? Math.min(0.1, Math.max(0, (nowMs - this.lastMs) / 1000)) : 0;
    this.lastMs = nowMs;
    const live = !!scan && nowMs < scan.until;
    for (const f of this.fakes) {
      const reach = live && Math.hypot(scan!.x - f.def.x, scan!.z - f.def.z) <= scan!.r + f.def.r;
      const target = reach ? 1 : 0;
      f.k += Math.sign(target - f.k) * Math.min(Math.abs(target - f.k), FAKE_FADE_PER_S * dt);
      f.mat.opacity = 1 - (1 - FAKE_OPACITY_REVEALED) * f.k;
      f.mat.emissiveIntensity = 1.1 * f.k;
      f.mat.depthWrite = f.k < 0.05;
      f.glowMat.opacity = 0.6 * f.k;
      for (const g of f.glow) g.visible = f.k > 0.02;
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.fakes.length = 0;
  }
}
