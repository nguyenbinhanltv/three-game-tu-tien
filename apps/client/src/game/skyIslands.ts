// Cảnh riêng của level đảo nổi (E3-N): cầu xích mây (mặt đi bộ do `heightAt` của shared quyết định, đây chỉ là hình) và đảo giả.
// Đảo giả KHÔNG có mặt đứng (bước lên là rơi về sàn mây); nhìn thì thật như đảo thường, thần thức (V) quét qua thì mờ đi và ánh xanh.
// Cầu: ván gỗ, dây xích hai bên, trụ; gộp ba InstancedMesh cho cả level.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bridgeDeckY, type BridgeDef, hash01, type IslandDef, type Terrain } from '@dtl/shared';
import type { SpiritScan } from '../ui/store';

const PLANK = 0.9;
const RAIL_H = 1.15;
const POST_EVERY = 6;
/** Tay vịn chỉ dựng ở chỗ mặt đất dưới thấp hơn mặt cầu chừng này (m). */
const OVER_VOID = 1.2;
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
    if (def.islands?.length && def.voidFloor !== undefined) {
      for (const isl of def.islands) this.buildSkirt(isl, def.voidFloor);
      this.buildFloorMist(def.voidFloor, def.size);
    }
    if (def.bridges?.length) this.buildBridges(def.bridges, terrain);
    for (const f of def.fakeIslands ?? []) this.buildFake(f);
    parent.add(this.group);
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildBridges(bridges: BridgeDef[], terrain: Terrain): void {
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
      const prevOver = [false, false];
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
          // Tay vịn chỉ có ở chỗ mặt cầu nằm trên khoảng không: chỗ đã trên mặt đảo/sàn mây (mặt đất ngang hoặc cao hơn mặt cầu) thì không dựng, để tay vịn
          // bắt đầu đúng ở mép đảo (đầu thang: ở chỗ thang rời sàn mây) chứ không chạy chéo trên bãi cỏ.
          const over = (px: number, pz: number, py: number) => terrain.surfaceAt(px, pz) < py - OVER_VOID;
          if (!over(cx + ox, cz + oz, cy) || !over(x0 + ox, z0 + oz, y0) || !over(x1 + ox, z1 + oz, y1)) {
            prevOver[side === -1 ? 0 : 1] = false;
            continue;
          }
          const first = !prevOver[side === -1 ? 0 : 1];
          prevOver[side === -1 ? 0 : 1] = true;
          rails.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + ox, cy + RAIL_H, cz + oz), qr.clone(), new THREE.Vector3(1, segLen * 1.02, 1)));
          if (first || i % POST_EVERY === 0 || i === n - 1) {
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

  /**
   * Khối đá treo dưới mỗi đảo (vách đảo không dựng bằng lưới địa hình, xem `CLIFF_SKIP` ở terrain.ts): mép bo tròn, thân thu nhỏ dần thành mũi đá
   * lởm chởm (nhiễu xác định theo vị trí nên không nứt khe), rễ cây thòng xuống, hai vành sương ôm chân đảo (cao hơn sàn mây ≥ 20 m để không phủ lên người đứng trên sàn).
   */
  private buildSkirt(isl: IslandDef, floor: number): void {
    const r = isl.r;
    const prof: [number, number][] = [
      [r - 4, 0.3], [r + 3, 0.2], [r + 6.5, -1.2], [r + 7.5, -4], [r + 6, -9], [r + 2, -15], [r - 5, -22], [r - 14, -31],
      [r * 0.78, -41], [r * 0.58, -52], [r * 0.38, -62], [r * 0.2, -72], [r * 0.07, -80], [0.01, -86],
    ];
    const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 56).toNonIndexed();
    const pos = lathe.attributes.position;
    const col: number[] = [];
    const rock = new THREE.Color();
    const A = new THREE.Color(0x7a8460); // rêu ở mép
    const B = new THREE.Color(0x8e8a7e); // đá sáng
    const D = new THREE.Color(0x4e4b48); // đá tối ở mũi
    const seed = Math.floor(isl.x * 3.1 + isl.z * 1.7);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const depth = Math.min(1, -y / 86);
      // nhiễu xác định theo vị trí (đỉnh trùng nhau cho cùng độ dịch)
      const n1 = Math.sin(x * 0.19 + y * 0.31 + seed) * Math.cos(z * 0.23 - y * 0.17 + seed * 0.5);
      const n2 = Math.sin(x * 0.61 - z * 0.47 + y * 0.53) * 0.5;
      const rad = Math.hypot(x, z) || 1;
      const push = (n1 * 4.5 + n2 * 2.2) * (0.25 + depth * 0.9) * (y > -1 ? 0.15 : 1);
      x += (x / rad) * push;
      z += (z / rad) * push;
      y += n1 * 2.2 * depth;
      pos.setXYZ(i, x, y, z);
      rock.copy(B).lerp(D, depth * 0.9).multiplyScalar(0.86 + n2 * 0.25);
      if (y > -4) rock.lerp(A, Math.min(1, (y + 4) / 4) * 0.8);
      col.push(rock.r, rock.g, rock.b);
    }
    lathe.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const parts: THREE.BufferGeometry[] = [lathe];
    // rễ cây thòng từ mép và thân đá
    const ROOT = new THREE.Color(0x5b4a38);
    const roots = Math.round(10 + r / 14);
    for (let i = 0; i < roots; i++) {
      const a = hash01(i, seed, 71) * Math.PI * 2;
      const len = 12 + hash01(i, seed, 73) * 26;
      const depthAt = -(2 + hash01(i, seed, 79) * 16);
      const rr = r + 6.8 + depthAt * -0.12 - (depthAt < -9 ? 6 : 0);
      const cone = new THREE.ConeGeometry(0.28 + hash01(i, seed, 83) * 0.3, len, 5, 1, true).toNonIndexed();
      cone.rotateX(Math.PI); // mũi chúc xuống
      cone.translate(0, -len / 2, 0);
      cone.rotateZ(0.12 + hash01(i, seed, 89) * 0.25);
      cone.rotateY(a + Math.PI / 2);
      cone.translate(Math.cos(a) * rr, depthAt, Math.sin(a) * rr);
      const cc: number[] = [];
      for (let k = 0; k < cone.attributes.position.count; k++) cc.push(ROOT.r, ROOT.g, ROOT.b);
      cone.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      parts.push(cone);
    }
    const merged = this.track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    merged.computeVertexNormals();
    const mat = this.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(isl.x, isl.y, isl.z);
    mesh.name = 'island-skirt';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // sương ôm chân đảo: hai vành mờ ở lưng chừng thân đá
    const ringMat = this.track(new THREE.MeshBasicMaterial({ map: this.mistRing(), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, color: 0xf2f5f4 }));
    const geo = this.track(new THREE.CircleGeometry(r / 0.7, 48));
    for (const dy of [-30, -42]) {
      const ring = new THREE.Mesh(geo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(isl.x, Math.max(floor + 20, isl.y + dy), isl.z);
      ring.renderOrder = -6;
      ring.frustumCulled = false;
      this.group.add(ring);
    }
  }

  private mistTex: THREE.CanvasTexture | null = null;
  /** Vành sương: trong suốt ở tâm và ngoài rìa, dày ở khoảng 0,7 bán kính (đúng chân đảo). Dùng chung. */
  private mistRing(): THREE.CanvasTexture {
    if (this.mistTex) return this.mistTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    grd.addColorStop(0.72, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.86, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    this.mistTex = this.track(new THREE.CanvasTexture(c));
    this.mistTex.colorSpace = THREE.SRGBColorSpace;
    return this.mistTex;
  }

  /** Sương sát mặt sàn mây: hai mặt phẳng mờ có nhiễu (gợn mây) phủ cả bản đồ, cao hơn sàn 0,25 m và 0,9 m (dưới đầu gối: người chơi quanh 15–20 m phải nhìn rõ nhân vật và mặt sàn). */
  private buildFloorMist(floor: number, size: number): void {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        // tổng sin chu kỳ nguyên theo N: ghép được không thấy mối
        const u = (i / N) * Math.PI * 2;
        const v = (j / N) * Math.PI * 2;
        const n = 0.5 + 0.25 * Math.sin(u * 2 + Math.sin(v * 3) * 1.2) * Math.cos(v * 2 + 0.7) + 0.18 * Math.sin(u * 5 + v * 4 + 1.3) + 0.1 * Math.sin(u * 9 - v * 7);
        const a = Math.max(0, Math.min(1, (n - 0.25) * 1.6));
        const k = (j * N + i) * 4;
        img.data[k] = 238;
        img.data[k + 1] = 243;
        img.data[k + 2] = 244;
        img.data[k + 3] = Math.round(a * 255);
      }
    g.putImageData(img, 0, 0);
    const base = this.track(new THREE.CanvasTexture(c));
    base.colorSpace = THREE.SRGBColorSpace;
    const geo = this.track(new THREE.PlaneGeometry(size * 1.15, size * 1.15));
    geo.rotateX(-Math.PI / 2);
    const layers: [number, number, number][] = [
      [0.25, 0.2, 11],
      [0.9, 0.13, 7],
    ];
    layers.forEach(([dy, op, rep], i) => {
      const t = this.track(base.clone());
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      t.offset.set(i * 0.31, i * 0.17);
      t.needsUpdate = true;
      const m = this.track(new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, depthWrite: false }));
      const plane = new THREE.Mesh(geo, m);
      plane.position.set(size / 2, floor + dy, size / 2);
      plane.renderOrder = -7 + i;
      plane.frustumCulled = false;
      plane.name = 'floor-mist';
      this.group.add(plane);
    });
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
