// Cảnh riêng của level đảo nổi (E3-N): cầu xích mây (mặt đi bộ do `heightAt` của shared quyết định, đây chỉ là hình) và đảo giả.
// Đảo giả KHÔNG có mặt đứng (bước lên là rơi về sàn mây); nhìn thì thật như đảo thường, thần thức (V) quét qua thì mờ đi và ánh xanh.
// Cầu: ván gỗ, dây xích hai bên, trụ; gộp ba InstancedMesh cho cả level.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bridgeDeckY, type BridgeDef, hash01, type IslandDef, type Terrain } from '@dtl/shared';
import type { SpiritScan } from '../../ui/store';
import { pondMaterial } from '../../render/pondWater';
import { vanHaiArt, type VhIsland, type VhKind } from './vanHaiArt';

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
const _FLASH = new THREE.Color(0xe8eeff);

/** Dáng chân đảo theo bản sắc: biên độ nhiễu, độ phình thân, độ dài, số nhũ đá và rễ (hệ số). */
const SKIRT: Record<VhKind, { amp: number; belly: number; len: number; spikes: number; roots: number }> = {
  hub: { amp: 1, belly: 1, len: 1, spikes: 1, roots: 1 },
  tung_dai_dao: { amp: 1.1, belly: 1, len: 1, spikes: 0.7, roots: 2.2 },
  thach_quy_dao: { amp: 0.8, belly: 1.14, len: 0.78, spikes: 0.5, roots: 0.3 },
  kinh_ho_dao: { amp: 0.65, belly: 1.05, len: 0.9, spikes: 0.4, roots: 1.2 },
  loi_van_dao: { amp: 1.9, belly: 0.92, len: 1.05, spikes: 2.4, roots: 0.3 },
  kinh_ngu_dai: { amp: 1.3, belly: 0.9, len: 1.3, spikes: 1.4, roots: 0.8 },
  tieu_dao: { amp: 1.2, belly: 1, len: 0.9, spikes: 0.8, roots: 1 },
};

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
      const art = vanHaiArt(def);
      for (const isl of def.islands) this.buildSkirt(isl, def.voidFloor, art.islandAt(isl.x, isl.z));
      this.buildFloorMist(def.voidFloor, def.size);
      this.buildBanks(art.islands, def.voidFloor);
      this.buildDebris(art.islands);
      this.buildFalls(art.islands, def.voidFloor);
      this.buildPonds(def.ponds ?? [], terrain);
      this.buildStorm(art.islands);
      this.buildWhaleRibs(art.islands);
    }
    const chains = (def.bridges ?? []).filter((b) => !b.own);
    if (chains.length) this.buildBridges(chains, terrain);
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
        planks.push(
          new THREE.Matrix4().compose(new THREE.Vector3(cx, cy - 0.09, cz), q.clone(), new THREE.Vector3(1, 1, (segLen / PLANK) * 0.94)),
        );
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
          rails.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(cx + ox, cy + RAIL_H, cz + oz),
              qr.clone(),
              new THREE.Vector3(1, segLen * 1.02, 1),
            ),
          );
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
  private buildSkirt(isl: IslandDef, floor: number, vi: VhIsland | null): void {
    const r = isl.r;
    const kind: VhKind = vi?.kind ?? 'tieu_dao';
    const SK = SKIRT[kind];
    const prof: [number, number][] = [
      [r - 4, -0.02],
      [r + 3, -0.1],
      [r + 6.5, -1.2],
      [r + 7.5, -4],
      [r + 6, -9],
      [r + 2, -15],
      [r - 5, -22],
      [r - 14, -31],
      [r * 0.78, -41],
      [r * 0.58, -52],
      [r * 0.38, -62],
      [r * 0.2, -72],
      [r * 0.07, -80],
      [0.01, -86],
    ];
    // bản sắc dáng đảo: Thạch Quy phình rộng như mai rùa, Kình Ngư thon dài, Lôi Vân nhọn lởm chởm
    const lathe = new THREE.LatheGeometry(
      prof.map(([x, y]) => new THREE.Vector2(x < r ? x * (x < r * 0.9 ? SK.belly : 1) : x, y * SK.len)),
      56,
    ).toNonIndexed();
    const pos = lathe.attributes.position!;
    const col: number[] = [];
    const rock = new THREE.Color();
    const pal = vi?.pal;
    const A = new THREE.Color(pal ? pal.moss : 0x7a8460).lerp(new THREE.Color(pal ? pal.soil : 0x7a8460), 0.5).multiplyScalar(1.3 * 0.84); // khớp màu rìa mặt đảo (terrain.ts islandColor)
    const B = new THREE.Color(pal ? pal.stone : 0x8e8a7e).multiplyScalar(0.92); // đá sáng
    const D = new THREE.Color(pal ? pal.dark : 0x4e4b48).multiplyScalar(0.8); // đá tối ở mũi
    const seed = Math.floor(isl.x * 3.1 + isl.z * 1.7);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const depth = Math.min(1, -y / (86 * SK.len));
      // nhiễu xác định theo vị trí (đỉnh trùng nhau cho cùng độ dịch)
      const n1 = Math.sin(x * 0.19 + y * 0.31 + seed) * Math.cos(z * 0.23 - y * 0.17 + seed * 0.5);
      const n2 = Math.sin(x * 0.61 - z * 0.47 + y * 0.53) * 0.5;
      const rad = Math.hypot(x, z) || 1;
      const push = (n1 * 4.5 + n2 * 2.2) * SK.amp * (0.25 + depth * 0.9) * (y > -1 ? 0.15 : 1);
      x += (x / rad) * push;
      z += (z / rad) * push;
      y += n1 * 2.2 * depth;
      pos.setXYZ(i, x, y, z);
      // vân tầng đá: mỗi lớp ~3 m một sắc độ riêng (xếp lớp trầm tích), lộ rõ ở thân đảo
      const band = hash01(Math.floor(y / 3.1), seed, 61);
      rock
        .copy(B)
        .lerp(D, depth * 0.9)
        .multiplyScalar((0.86 + n2 * 0.25) * (0.88 + band * 0.26));
      if (y > -4) rock.lerp(A, Math.min(1, (y + 4) / 4.5));
      col.push(rock.r, rock.g, rock.b);
    }
    lathe.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const parts: THREE.BufferGeometry[] = [lathe];
    // rễ cây thòng từ mép và thân đá
    const ROOT = new THREE.Color(0x5b4a38);
    // nhũ đá nhọn rủ xuống từ thân đảo
    const DK = new THREE.Color(pal ? pal.dark : 0x4e4b48).multiplyScalar(0.75);
    const spikes = Math.round((6 + r / 22) * SK.spikes);
    for (let i = 0; i < spikes; i++) {
      const a = hash01(i, seed, 97) * Math.PI * 2;
      const rr = r * (0.45 + hash01(i, seed, 103) * 0.45);
      const dy = -(18 + hash01(i, seed, 107) * 30) * SK.len;
      // mũi nhũ không được chọc xuống sàn mây (cách sàn ≥ 10 m), nếu không thấy mảnh trắng nhọn nhô lên khỏi mây
      const len = Math.min(10 + hash01(i, seed, 101) * 26 * SK.amp, isl.y + dy - floor - 10);
      if (len < 5) continue;
      const sp = new THREE.ConeGeometry(1 + hash01(i, seed, 109) * 2.2, len, 5, 1, true).toNonIndexed();
      sp.rotateX(Math.PI);
      sp.translate(0, -len / 2, 0);
      sp.rotateZ((hash01(i, seed, 113) - 0.5) * 0.35);
      sp.translate(Math.cos(a) * rr, dy, Math.sin(a) * rr);
      const sc: number[] = [];
      for (let k = 0; k < sp.attributes.position!.count; k++) sc.push(DK.r, DK.g, DK.b);
      sp.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
      parts.push(sp);
    }
    const roots = Math.round((10 + r / 14) * SK.roots);
    for (let i = 0; i < roots; i++) {
      const a = hash01(i, seed, 71) * Math.PI * 2;
      const depthAt = -(2 + hash01(i, seed, 79) * 16);
      const len = Math.min((12 + hash01(i, seed, 73) * 26) * (SK.roots > 1 ? 1.4 : 1), isl.y + depthAt - floor - 8);
      const rr = r + 6.8 + depthAt * -0.12 - (depthAt < -9 ? 6 : 0);
      const cone = new THREE.ConeGeometry(0.28 + hash01(i, seed, 83) * 0.3, len, 5, 1, true).toNonIndexed();
      cone.rotateX(Math.PI); // mũi chúc xuống
      cone.translate(0, -len / 2, 0);
      cone.rotateZ(0.12 + hash01(i, seed, 89) * 0.25);
      cone.rotateY(a + Math.PI / 2);
      cone.translate(Math.cos(a) * rr, depthAt, Math.sin(a) * rr);
      const cc: number[] = [];
      for (let k = 0; k < cone.attributes.position!.count; k++) cc.push(ROOT.r, ROOT.g, ROOT.b);
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
    const ringMat = this.track(
      new THREE.MeshBasicMaterial({
        map: this.mistRing(),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
        color: 0xf2f5f4,
      }),
    );
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
        const n =
          0.5 +
          0.25 * Math.sin(u * 2 + Math.sin(v * 3) * 1.2) * Math.cos(v * 2 + 0.7) +
          0.18 * Math.sin(u * 5 + v * 4 + 1.3) +
          0.1 * Math.sin(u * 9 - v * 7);
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

  private puff: THREE.CanvasTexture | null = null;
  /** Đám mây mềm: nhiều đốm tròn mờ chồng nhau (canvas 128², xác định). Dùng chung cho tầng mây quanh chân đảo và mây sấm. */
  private puffTex(): THREE.CanvasTexture {
    if (this.puff) return this.puff;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 16; i++) {
      const a = hash01(i, 7, 301) * Math.PI * 2;
      const d = Math.sqrt(hash01(i, 7, 303)) * 34;
      const x = 64 + Math.cos(a) * d;
      const y = 64 + Math.sin(a) * d;
      const rad = 20 + hash01(i, 7, 307) * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    }
    // tắt dần về rìa ô để đĩa mây không có mép cứng
    const edge = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge;
    g.fillRect(0, 0, 128, 128);
    this.puff = this.track(new THREE.CanvasTexture(c));
    this.puff.colorSpace = THREE.SRGBColorSpace;
    return this.puff;
  }

  /**
   * Tầng mây quanh chân đảo và giữa các đảo (một InstancedMesh): đĩa mây ngang ở nhiều độ cao giữa sàn mây và đáy đảo, nhìn từ mép đảo xuống thấy lớp lớp
   * có chiều sâu thay vì một mặt phẳng; ở ngay trên sàn mây (≥ 16 m) không có đĩa nào nên không che người đi dưới đó.
   */
  private buildBanks(islands: VhIsland[], floor: number): void {
    const list: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    for (const isl of islands) {
      const n = isl.r > 100 ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const a = hash01(i, Math.floor(isl.x), 311) * Math.PI * 2;
        const rr = isl.r * (0.85 + hash01(i, Math.floor(isl.z), 313) * 0.7);
        const y = floor + 16 + hash01(i, Math.floor(isl.x + isl.z), 317) * Math.max(8, isl.y - 40 - floor - 16);
        const sc = (isl.r > 100 ? 70 : 34) * (0.7 + hash01(i, Math.floor(isl.z), 319) * 0.9);
        list.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(isl.x + Math.cos(a) * rr, y, isl.z + Math.sin(a) * rr),
            q,
            new THREE.Vector3(sc, sc, 1),
          ),
        );
        // dưới đảo ngả lam xám, gần mặt sàn ngả ngà ấm (nắng bình minh hắt lên)
        cols.push(new THREE.Color().setHSL(0.52 - 0.04 * hash01(i, 5, 321), 0.18, 0.8 + 0.12 * ((y - floor) / (isl.y - floor))));
      }
    }
    const geo = this.track(new THREE.PlaneGeometry(2, 2));
    const mat = this.track(
      new THREE.MeshBasicMaterial({
        map: this.puffTex(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, cols[i]!);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.renderOrder = -6;
    im.name = 'cloud-banks';
    this.group.add(im);
  }

  /** Đá trôi: mảnh đá lơ lửng quanh mỗi đảo (một InstancedMesh, tĩnh), cho cảm giác đảo đang vỡ dần vì mạch tinh đã bị rút. */
  private buildDebris(islands: VhIsland[]): void {
    const list: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    for (const isl of islands) {
      const n = isl.r > 100 ? 16 : 5;
      for (let i = 0; i < n; i++) {
        const a = hash01(i, Math.floor(isl.x), 331) * Math.PI * 2;
        const rr = isl.r + 18 + hash01(i, Math.floor(isl.z), 333) * 80;
        const y = isl.y - 55 + hash01(i, Math.floor(isl.x), 337) * 75;
        const s = 1.3 + hash01(i, Math.floor(isl.z), 339) ** 2 * 6;
        e.set(hash01(i, 1, 341) * 3, hash01(i, 2, 343) * 6, hash01(i, 3, 347) * 3);
        q.setFromEuler(e);
        list.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(isl.x + Math.cos(a) * rr, y, isl.z + Math.sin(a) * rr),
            q,
            new THREE.Vector3(s, s * (0.55 + hash01(i, 4, 349) * 0.5), s * 0.9),
          ),
        );
        cols.push(new THREE.Color(isl.pal.dark).lerp(new THREE.Color(isl.pal.stone), hash01(i, 5, 351) * 0.6).multiplyScalar(1.1));
      }
    }
    const geo = this.track(new THREE.IcosahedronGeometry(1, 0));
    const mat = this.track(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }));
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, cols[i]!);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.name = 'island-debris';
    this.group.add(im);
  }

  private fallTex: THREE.CanvasTexture | null = null;
  /** Thác mây rơi từ mép đảo xuống sàn mây: dải dọc nhiều sợi sáng tối cuộn chậm (offset đổi mỗi khung), mờ ở đầu và chân. */
  private buildFalls(islands: VhIsland[], floor: number): void {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 26; i++) {
      const x = hash01(i, 9, 361) * 64;
      const w = 1 + hash01(i, 9, 363) * 4;
      const y0 = hash01(i, 9, 365) * 256;
      const len = 60 + hash01(i, 9, 367) * 190;
      const grd = g.createLinearGradient(0, y0, 0, y0 + len);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${0.25 + hash01(i, 9, 369) * 0.45})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - w / 2, y0, w, len);
      g.fillRect(x - w / 2, y0 - 256, w, len); // lặp liền mạch theo chiều dọc
    }
    // mép dải mờ dần hai bên: thác mây không thành tấm ván cứng
    const side = g.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)');
    side.addColorStop(0.3, 'rgba(0,0,0,1)');
    side.addColorStop(0.7, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = side;
    g.fillRect(0, 0, 64, 256);
    const t = this.track(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.fallTex = t;
    const mat = this.track(
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, color: 0xf4f8f8 }),
    );
    const geos: THREE.BufferGeometry[] = [];
    const which: VhKind[] = ['tung_dai_dao', 'kinh_ho_dao', 'kinh_ngu_dai', 'thach_quy_dao', 'hub'];
    for (const isl of islands) {
      if (!which.includes(isl.kind)) continue;
      const n = isl.kind === 'hub' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash01(Math.floor(isl.x), i, 371) * 2;
        const w = 7 + hash01(i, Math.floor(isl.z), 373) * 9;
        const len = Math.min(70, isl.y - floor - 8);
        const geo = new THREE.PlaneGeometry(w, len, 1, 1);
        geo.rotateY(-a + Math.PI / 2);
        geo.translate(isl.x + Math.cos(a) * (isl.r + 8.5), isl.y - 2 - len / 2, isl.z + Math.sin(a) * (isl.r + 8.5));
        geos.push(geo);
      }
    }
    if (!geos.length) return;
    const merged = this.track(mergeGeometries(geos, false));
    for (const gg of geos) gg.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -5;
    mesh.name = 'cloud-falls';
    this.group.add(mesh);
  }

  /** Hồ gương: đĩa nước phẳng đặt ngang mực trung bình của bờ (lòng hồ đã lõm trong `heightAt`, bờ nhấp nhô nên mép nước tự lượn). */
  private buildPonds(ponds: { x: number; z: number; r: number }[], terrain: Terrain): void {
    if (!ponds.length) return;
    const mat = this.track(pondMaterial());
    for (const p of ponds) {
      let sum = 0;
      for (let i = 0; i < 12; i++)
        sum += terrain.heightAt(p.x + Math.cos(i * 0.5236) * p.r * 1.02, p.z + Math.sin(i * 0.5236) * p.r * 1.02);
      const geo = this.track(new THREE.CircleGeometry(p.r * 1.06, 48));
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, sum / 12 - 0.2, p.z);
      m.renderOrder = -6;
      m.frustumCulled = false;
      m.name = 'pond';
      this.group.add(m);
    }
  }

  private storm: { mat: THREE.MeshBasicMaterial; next: number; flash: number } | null = null;
  /** Mây sấm trên Lôi Vân Đảo: vài đĩa mây xám tối treo cao, thỉnh thoảng lóe sáng (đổi màu vật liệu, không thêm đèn). */
  private buildStorm(islands: VhIsland[]): void {
    const isl = islands.find((i) => i.kind === 'loi_van_dao');
    if (!isl) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const geo = this.track(new THREE.PlaneGeometry(2, 2));
    const mat = this.track(
      new THREE.MeshBasicMaterial({
        map: this.puffTex(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        color: 0x6f7480,
      }),
    );
    const im = new THREE.InstancedMesh(geo, mat, 9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = i === 0 ? 0 : isl.r * (0.35 + hash01(i, 5, 381) * 0.7);
      const sc = 75 + hash01(i, 5, 383) * 60;
      im.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          new THREE.Vector3(isl.x + Math.cos(a) * rr, isl.y + 70 + hash01(i, 5, 385) * 26, isl.z + Math.sin(a) * rr),
          q,
          new THREE.Vector3(sc, sc, 1),
        ),
      );
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.renderOrder = -4;
    im.name = 'storm-clouds';
    this.group.add(im);
    this.storm = { mat, next: 3, flash: 0 };
  }

  /** Xương kình ngư khổng lồ trên Kình Ngư Đài: một dãy sườn cong (nửa vòng xuyến) cắm xuống đất dọc sống lưng, nhỏ dần về đuôi. Chỉ để nhìn, không va chạm. */
  private buildWhaleRibs(islands: VhIsland[]): void {
    const isl = islands.find((i) => i.kind === 'kinh_ngu_dai');
    if (!isl) return;
    const parts: THREE.BufferGeometry[] = [];
    const a0 = 0.9; // hướng sống lưng (rad), lệch khỏi lối chính
    const bone = new THREE.Color(0xe6e0cf);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const R = 17 * (1 - t * 0.55) * (0.9 + hash01(i, 7, 391) * 0.2);
      const rib = new THREE.TorusGeometry(R, 0.9 * (1 - t * 0.4), 6, 18, Math.PI * 0.92).toNonIndexed();
      rib.rotateZ(Math.PI * 0.04); // nâng nhẹ để chân sườn cắm xuống đất
      rib.rotateY(a0 + Math.PI / 2);
      const d = -70 + t * 120;
      rib.translate(isl.x + Math.cos(a0) * d - Math.sin(a0) * 80, isl.y - 0.5, isl.z + Math.sin(a0) * d + Math.cos(a0) * 80);
      const cc: number[] = [];
      for (let k = 0; k < rib.attributes.position!.count; k++) cc.push(bone.r, bone.g, bone.b);
      rib.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      parts.push(rib);
    }
    const merged = this.track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, this.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 })));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'whale-ribs';
    this.group.add(mesh);
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
      const pos = g.attributes.position!;
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
    const mat = this.track(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        transparent: true,
        opacity: 1,
        emissive: new THREE.Color(0x9fe8ff),
        emissiveIntensity: 0,
      }),
    );
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(f.x, f.y, f.z);
    mesh.name = 'fake-island';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const glowMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
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
    if (this.fallTex) this.fallTex.offset.y = (this.fallTex.offset.y - dt * 0.16) % 1;
    if (this.storm) {
      const st = this.storm;
      st.next -= dt;
      if (st.next <= 0) {
        st.flash = 0.16;
        st.next = 4 + Math.random() * 7; // chỉ hình: không đổi luật, không cần tất định
      }
      st.flash = Math.max(0, st.flash - dt);
      st.mat.color.setHex(0x6f7480).lerp(_FLASH, st.flash > 0 ? Math.min(1, st.flash * 7) * 0.9 : 0);
    }
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
