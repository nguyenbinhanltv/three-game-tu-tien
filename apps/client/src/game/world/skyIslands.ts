// Cảnh riêng của level đảo nổi (E3-N): cầu xích mây (mặt đi bộ do `heightAt` của shared quyết định, đây chỉ là hình) và đảo giả.
// Đảo giả KHÔNG có mặt đứng (bước lên là rơi về sàn mây); nhìn thì thật như đảo thường, thần thức (V) quét qua thì mờ đi và ánh xanh.
// Cầu: ván gỗ, dây xích hai bên, trụ; gộp ba InstancedMesh cho cả level.

import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  clamp,
  cameraPosition,
  float,
  mix,
  normalView,
  normalWorld,
  positionWorld,
  smoothstep,
  dot,
  texture,
  time,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import { getCloudNoise } from '../../render/noiseTex';
import { skyParams } from '../../render/sky';
import { bridgeDeckY, type BridgeDef, hash01, type IslandDef, type Terrain, type TerrainDef } from '@dtl/shared';
import type { SpiritScan } from '../../ui/store';
import { pondMaterial } from '../../render/pondWater';
import { assets, type AssetHandle } from '../core/assets';
import { billowPlan } from './billows';
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

/** Bán kính danh nghĩa của khối đá dựng sẵn trong `arch_vh_island` (Blender, `vh_island_arch.py`): client co giãn ngang theo `r / R`. */
const ROCK_R: Record<VhKind, number> = {
  hub: 85,
  tung_dai_dao: 207,
  thach_quy_dao: 207,
  kinh_ho_dao: 207,
  loi_van_dao: 207,
  kinh_ngu_dai: 207,
  tieu_dao: 40,
};
const FAKE_R = 40;

/** Bản sao có position/normal/color dạng float32 (pipeline lượng tử hóa thành số nguyên chuẩn hóa: ghi số mét vào đó sẽ bị cắt về [-1, 1]). */
function toFloatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const size = name === 'color' ? 3 : a.itemSize;
    const f = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      f[i * size] = a.getX(i);
      f[i * size + 1] = a.getY(i);
      f[i * size + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(f, size));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

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
  /** Chân đảo thật đang vẽ bằng lưới thủ tục (dự phòng); thay bằng lưới Blender khi GLB về. */
  private skirts: { isl: IslandDef; vi: VhIsland | null; mesh: THREE.Mesh }[] = [];
  private rockHandle: AssetHandle | null = null;
  private gone = false;
  private debris: THREE.Object3D | null = null;
  private oldFalls: THREE.Object3D | null = null;
  /** Cao độ mặt đảo (m): rêu chỉ ăn ở phần thân sát mặt đảo, thưa dần xuống mũi. */
  private islandTopY = 124;

  constructor(parent: THREE.Object3D, terrain: Terrain) {
    this.group.name = 'skyIslands';
    const def = terrain.def;
    if (def.islands?.length && def.voidFloor !== undefined) {
      const art = vanHaiArt(def);
      this.islandsDef = def.islands;
      this.floorY = def.voidFloor;
      this.islandTopY = Math.max(...def.islands.map((i) => i.y));
      for (const isl of def.islands) this.buildSkirt(isl, def.voidFloor, art.islandAt(isl.x, isl.z));
      this.buildFloorMist(def.voidFloor, def.size);
      this.buildBillows(def.voidFloor, def.size, def);
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
    if (this.skirts.length || this.fakes.length) void this.loadRocks();
  }

  private islandsDef: IslandDef[] = [];
  private floorY = 60;

  /** Đảo đá nhỏ vệ tinh lơ lửng quanh các đảo lớn (3 InstancedMesh, tất định theo vị trí đảo); tránh đè lên đảo khác và nằm trên sàn mây. */
  private buildSatellites(geo: Map<string, THREE.BufferGeometry>): void {
    const names = ['a', 'b', 'c'];
    const mats: Record<string, THREE.Matrix4[]> = { a: [], b: [], c: [] };
    const q = new THREE.Quaternion();
    for (const isl of this.islandsDef) {
      if (isl.r < 60) continue;
      const n = isl.r > 150 ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const h = (k: number) => hash01(Math.floor(isl.x) + i * 7, Math.floor(isl.z), 900 + k);
        const a = h(1) * Math.PI * 2;
        const d = isl.r * (1.12 + h(2) * 0.35) + 24;
        const x = isl.x + Math.cos(a) * d;
        const z = isl.z + Math.sin(a) * d;
        const y = isl.y + (h(3) - 0.4) * 46;
        if (y < this.floorY + 36) continue;
        if (this.islandsDef.some((o) => o !== isl && Math.hypot(o.x - x, o.z - z) < o.r + 40)) continue;
        const sc = 0.6 + h(4) * 0.8;
        q.setFromEuler(new THREE.Euler((h(5) - 0.5) * 0.12, h(6) * Math.PI * 2, (h(7) - 0.5) * 0.12));
        mats[names[Math.floor(h(8) * 3) % 3]!]!.push(
          new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone(), new THREE.Vector3(sc, sc, sc)),
        );
      }
    }
    for (const nm of names) {
      const g = geo.get(`vhsat_${nm}`);
      const list = mats[nm]!;
      if (!g || !list.length) continue;
      const im = new THREE.InstancedMesh(g, this.rockMaterial(), list.length);
      list.forEach((m4, i) => im.setMatrixAt(i, m4));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = true;
      im.name = `island-satellite-${nm}`;
      this.group.add(im);
    }
  }

  /** Nạp khối đá Blender (`arch_vh_island`) và thay lưới thủ tục: lỗi mạng thì giữ nguyên bản thủ tục. */
  private async loadRocks(): Promise<void> {
    try {
      const h = await assets.acquire('arch_vh_island', { priority: 400 });
      if (this.gone) {
        h.release();
        return;
      }
      this.rockHandle = h;
      const geo = new Map<string, THREE.BufferGeometry>();
      h.scene.updateMatrixWorld(true);
      h.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        // pipeline lượng tử hóa đỉnh (KHR_mesh_quantization): phần co giãn/dịch nằm ở ma trận nút, phải áp vào lưới
        if (m.isMesh) geo.set(o.name, toFloatGeometry(m.geometry).applyMatrix4(m.matrixWorld));
      });
      for (const g of geo.values()) this.track(g);
      // dải nước mảnh: chỉ cần position + uv (áp ma trận nút)
      const fallSrc = new Map<string, THREE.BufferGeometry>();
      h.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !o.name.startsWith('vhfall_')) return;
        const pa = m.geometry.attributes.position!;
        const pf = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) pf.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pf, 3));
        if (m.geometry.index) g.setIndex(m.geometry.index.clone());
        g.applyMatrix4(m.matrixWorld);
        // pipeline bỏ uv của vật liệu không texture: tự sinh uv từ vị trí (u theo ngang, v theo độ sâu) cho dải nước cuộn
        const q = g.attributes.position!;
        const uf = new Float32Array(q.count * 2);
        for (let i = 0; i < q.count; i++) uf.set([(q.getX(i) + q.getZ(i)) * 0.7, -q.getY(i) / 14], i * 2);
        g.setAttribute('uv', new THREE.BufferAttribute(uf, 2));
        fallSrc.set(o.name, g);
      });
      const baked: THREE.BufferGeometry[] = [];
      const bakedFalls: THREE.BufferGeometry[] = [];
      for (const sk of this.skirts) {
        const src = geo.get(`vhrock_${sk.vi?.kind ?? 'tieu_dao'}`);
        if (!src) continue;
        const g = this.track(src.clone());
        const pos = g.attributes.position!;
        const c0 = g.attributes.color as THREE.BufferAttribute;
        const cf = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) cf.set([c0.getX(i), c0.getY(i), c0.getZ(i)], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(cf, 3)); // về float (pipeline có thể lượng tử hóa màu đỉnh) để sửa vành cỏ
        const col = g.attributes.color as THREE.BufferAttribute;
        // vành cỏ ở mép trên khớp màu mặt đảo (palette riêng từng đảo, như terrain.ts islandColor)
        const pal = sk.vi?.pal;
        const A = new THREE.Color(pal ? pal.moss : 0x7a8460)
          .lerp(new THREE.Color(pal ? pal.soil : 0x7a8460), 0.5)
          .multiplyScalar(1.3 * 0.84);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          if (y > -1.4) {
            c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(A, Math.min(1, (y + 1.4) / 1.4));
            col.setXYZ(i, c.r, c.g, c.b);
          }
        }
        const kr = sk.vi ? (ROCK_R[sk.vi.kind] ?? 207) : 40;
        const sx = sk.isl.r / kr;
        const bake = new THREE.Matrix4().compose(sk.mesh.position, new THREE.Quaternion(), new THREE.Vector3(sx, 1, sx));
        const gi = g.index ? g.toNonIndexed() : g;
        gi.applyMatrix4(bake);
        baked.push(gi);
        const fs = fallSrc.get(`vhfall_${sk.vi?.kind ?? 'tieu_dao'}`);
        if (fs) {
          const fg = fs.index ? fs.toNonIndexed() : fs.clone();
          fg.applyMatrix4(bake);
          bakedFalls.push(fg);
        }
      }
      if (baked.length) {
        // một mesh cho mọi chân đảo (draw call): thay chín mesh thủ tục
        const merged = this.track(mergeGeometries(baked, false));
        for (const b of baked) b.dispose();
        const mesh = new THREE.Mesh(merged, this.skirts[0]!.mesh.material);
        mesh.name = 'island-skirts';
        mesh.frustumCulled = false;
        this.group.add(mesh);
        for (const sk of this.skirts) {
          this.group.remove(sk.mesh);
          sk.mesh.geometry.dispose();
        }
        this.skirts = [];
      }
      if (bakedFalls.length && this.fallTex) {
        const fm = this.track(mergeGeometries(bakedFalls, false));
        for (const b of bakedFalls) b.dispose();
        const fmat = this.track(
          new THREE.MeshBasicMaterial({
            map: this.fallTex,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
            side: THREE.DoubleSide,
            color: 0xf4f8f8,
          }),
        );
        const fmesh = new THREE.Mesh(fm, fmat);
        fmesh.name = 'island-waterfalls';
        fmesh.frustumCulled = false;
        fmesh.renderOrder = -4;
        this.group.add(fmesh);
        if (this.oldFalls) {
          this.group.remove(this.oldFalls);
          this.oldFalls = null;
        }
      }
      if (this.debris) {
        this.group.remove(this.debris); // đá trôi icosphere cũ: thay bằng đảo đá vệ tinh cùng bộ khối đá
        this.debris = null;
      }
      this.buildSatellites(geo);
      for (const f of this.fakes) {
        const src = geo.get(`vhfake_${(Math.floor(f.def.x) + Math.floor(f.def.z)) % 2 ? 'a' : 'b'}`);
        if (!src) continue;
        const g = src.clone().toNonIndexed();
        g.scale(f.def.r / FAKE_R, 1, f.def.r / FAKE_R);
        const fc = g.attributes.color as THREE.BufferAttribute;
        const ff = new Float32Array(fc.count * 3);
        for (let i = 0; i < fc.count; i++) ff.set([fc.getX(i), fc.getY(i), fc.getZ(i)], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(ff, 3));
        const trees = f.mesh.userData.trees as THREE.BufferGeometry | undefined;
        const merged = (trees ? mergeGeometries([g, trees], false) : g) ?? g;
        if (merged !== g) g.dispose();
        f.mesh.geometry.dispose();
        f.mesh.geometry = this.track(merged);
      }
    } catch (e) {
      console.warn('[skyIslands] không nạp được khối đá Blender, giữ chân đảo thủ tục', e);
    }
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
      [r + 4.5, -1.2],
      [r + 5.5, -4],
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
    // lấy mẫu lại profile bằng spline (56 vòng): profile 14 điểm quá thưa nên dịch chuyển chỉ làm bầu, không tạo được gờ tầng
    const base = prof.map(([x, y]) => new THREE.Vector2(x < r ? x * (x < r * 0.9 ? SK.belly : 1) : x, y * SK.len));
    const smooth = new THREE.SplineCurve(base).getSpacedPoints(56).map((p) => new THREE.Vector2(Math.max(0.01, p.x), p.y));
    const lathe0 = new THREE.LatheGeometry(smooth, 96);
    lathe0.deleteAttribute('uv');
    lathe0.deleteAttribute('normal');
    const lathe = mergeVertices(lathe0, 1e-3); // dùng chung đỉnh để pháp tuyến mịn (không lộ mặt phẳng low-poly)
    lathe0.dispose();
    const pos = lathe.attributes.position!;
    const col: number[] = [];
    const rock = new THREE.Color();
    const pal = vi?.pal;
    const A = new THREE.Color(pal ? pal.moss : 0x7a8460).lerp(new THREE.Color(pal ? pal.soil : 0x7a8460), 0.5).multiplyScalar(1.3 * 0.84); // khớp màu rìa mặt đảo (terrain.ts islandColor)
    const B = new THREE.Color(0x8d857a); // đá xám ấm (PBR, không pha lam)
    const MID = new THREE.Color(0x6b5a4a); // đá nâu
    const D = new THREE.Color(0x3d3834); // đá tối ở mũi
    const MOSS = new THREE.Color(0x56703f);
    const seed = Math.floor(isl.x * 3.1 + isl.z * 1.7);
    // nhiễu 3D tất định (giá trị nội suy) cho vách đá: ba tầng ridged, gờ tầng nhô ra như đá trầm tích
    const nz = (x: number, y: number, z: number, sd: number): number => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const zi = Math.floor(z);
      const fx = x - xi;
      const fy = y - yi;
      const fz = z - zi;
      const sm = (t: number) => t * t * (3 - 2 * t);
      const h = (a: number, b: number, c: number) => hash01(xi + a + (zi + c) * 57, yi + b, sd);
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      const ux = sm(fx);
      const uy = sm(fy);
      const uz = sm(fz);
      return l(
        l(l(h(0, 0, 0), h(1, 0, 0), ux), l(h(0, 1, 0), h(1, 1, 0), ux), uy),
        l(l(h(0, 0, 1), h(1, 0, 1), ux), l(h(0, 1, 1), h(1, 1, 1), ux), uy),
        uz,
      );
    };
    const ridged = (x: number, y: number, z: number): number => {
      let sum = 0;
      let amp = 0.55;
      let f = 1;
      for (let o = 0; o < 3; o++) {
        sum += amp * (1 - Math.abs(2 * nz(x * f, y * f, z * f, 700 + o * 31) - 1));
        amp *= 0.5;
        f *= 2.2;
      }
      return sum;
    };
    const OCHRE = new THREE.Color(0xa58b68);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const depth = Math.min(1, -y / (86 * SK.len));
      const rad = Math.hypot(x, z) || 1;
      const rid = ridged(x * 0.045 + seed, y * 0.07, z * 0.045);
      const ledgeT = y / 4.4 + nz(x * 0.03, y * 0.01, z * 0.03, 710) * 1.6;
      const ledge = Math.pow(ledgeT - Math.floor(ledgeT), 2.2); // tăng dần rồi gãy: gờ nhô ra từng tầng
      const fine = nz(x * 0.22 + seed, y * 0.35, z * 0.22, 730) - 0.5; // gồ ghề mịn trên vách
      const groove = nz(Math.atan2(z, x) * 5 + seed, y * 0.05, 3.3, 720) - 0.5;
      const push = ((rid - 0.45) * 17 + ledge * 6 + groove * 7 + fine * 3.2) * SK.amp * (0.3 + depth * 0.9) * (y > -0.5 ? 0.4 : 1); // mép đảo gồ ghề, không còn vành tròn đều
      x += (x / rad) * push;
      z += (z / rad) * push;
      y += (rid - 0.4) * 3 * depth;
      pos.setXYZ(i, x, y, z);
    }
    lathe.computeVertexNormals();
    const nor = lathe.attributes.normal!;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const depth = Math.min(1, -y / (86 * SK.len));
      const ny = nor.getY(i);
      // vân tầng đá: mỗi lớp ~1,6 m một sắc (xám ấm ↔ nâu ↔ nâu vàng), tối dần xuống mũi
      const band = hash01(Math.floor(y / 1.6), seed, 61);
      rock
        .copy(B)
        .lerp(MID, band * 0.7)
        .lerp(OCHRE, band > 0.75 ? 0.45 : 0)
        .lerp(D, depth * 0.75)
        .multiplyScalar(0.72 + band * 0.55);
      // chỉ một vành cỏ mỏng ở mép; dưới đó là vách đá, rêu loang theo mảng ở mặt ngửa
      if (y > -1.4) rock.lerp(A, Math.min(1, (y + 1.4) / 1.4));
      else if (ny > 0.55 && hash01(Math.floor(y / 1.7), Math.floor(Math.atan2(pos.getZ(i), pos.getX(i)) * 6), seed) > 0.4)
        rock.lerp(MOSS, Math.min(0.85, (ny - 0.55) * 1.8) * (1 - depth * 0.6));
      col.push(rock.r, rock.g, rock.b);
    }
    lathe.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const parts: THREE.BufferGeometry[] = [lathe.toNonIndexed()];
    // rễ cây thòng từ mép và thân đá
    const ROOT = new THREE.Color(0x5b4a38);
    // nhũ đá nhọn rủ xuống từ thân đảo
    const DK = new THREE.Color(pal ? pal.dark : 0x4e4b48).multiplyScalar(0.75);
    const spikes = Math.round((6 + r / 22) * SK.spikes * 1.7);
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
    const roots = Math.round((10 + r / 14) * SK.roots * 1.9);
    for (let i = 0; i < roots; i++) {
      const a = hash01(i, seed, 71) * Math.PI * 2;
      const depthAt = -(2 + hash01(i, seed, 79) * 16);
      const len = Math.min((14 + hash01(i, seed, 73) * 34) * (SK.roots > 1 ? 1.4 : 1.15), isl.y + depthAt - floor - 8);
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
    for (const p of parts) p.deleteAttribute('uv');
    const merged = this.track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    const mat = this.track(this.rockMaterial());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(isl.x, isl.y, isl.z);
    mesh.name = 'island-skirt';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.skirts.push({ isl, vi, mesh });
    // (vành sương phẳng ở chân đảo đã gỡ: nhìn ngang tầm chúng thành vệt trắng cắt ngang chân đảo; thay bằng vòng mây cuộn trong `billowPlan`)
  }

  private rock: THREE.MeshStandardNodeMaterial | null = null;
  /** Vật liệu đá chân đảo: màu đỉnh phân tầng nhân hạt đá (nhiễu theo toạ độ thế giới, hai tần số) để mặt đá không bệt màu; dùng chung một instance. */
  private rockMaterial(): THREE.MeshStandardNodeMaterial {
    if (this.rock) return this.rock;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const noise = getCloudNoise();
    const wp = positionWorld;
    // triplanar: ba mặt chiếu theo pháp tuyến thế giới (không kéo dãn trên vách dốc của nón)
    const w3 = normalWorld.abs().pow(4);
    const wn = w3.div(w3.x.add(w3.y).add(w3.z).max(1e-4));
    const smp = (u: Parameters<typeof texture>[1], ch: 'g' | 'a') => (ch === 'g' ? texture(noise, u).g : texture(noise, u).a);
    const tri = (sc: number, ch: 'g' | 'a') =>
      smp(vec2(wp.z, wp.y).mul(sc), ch)
        .mul(wn.x)
        .add(smp(vec2(wp.x, wp.z).mul(sc), ch).mul(wn.y))
        .add(smp(vec2(wp.x, wp.y).mul(sc), ch).mul(wn.z));
    const a = tri(0.03, 'g');
    const b = tri(0.21, 'a');
    // rêu ở mặt ngửa (loang theo nhiễu), đá sáng hơn ở mặt hướng nắng
    const up = smoothstep(0.55, 0.92, normalWorld.y.add(a.sub(0.5).mul(0.35)));
    const sun = dot(normalWorld, skyParams.sunDir).max(0);
    const rock = vertexColor()
      .mul(float(0.62).add(a.mul(0.5)).add(b.mul(0.3)))
      .mul(float(0.88).add(sun.mul(0.5)));
    m.colorNode = mix(
      rock,
      vec3(0.2, 0.33, 0.12).mul(float(0.7).add(b.mul(0.6))),
      up
        .mul(0.5)
        .mul(smoothstep(-60, -8, wp.y.sub(this.islandTopY)))
        .mul(float(1).sub(smoothstep(-3, 0, wp.y.sub(this.islandTopY)))),
    );
    m.roughnessNode = float(0.8).add(b.mul(0.2));
    m.emissiveNode = vertexColor().mul(0.24); // fill nhẹ: mặt dưới đảo không đen đặc khi nhìn từ biển mây
    this.rock = this.track(m);
    return m;
  }

  /**
   * Biển mây cuộn (một InstancedMesh): các khối mây phình dẹt trải trên sàn mây, có sáng/tối theo hướng mặt (đỉnh sáng, hông và đáy lam xám), mép tan mờ, vân
   * mây chuyển động chậm; mờ dần khi camera ở gần (không che nhân vật đi trên sàn mây).
   */
  private buildBillows(floor: number, size: number, def: TerrainDef): void {
    const geo = this.track(new THREE.IcosahedronGeometry(1, 1));
    const mat = this.track(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false }));
    const noise = getCloudNoise();
    const wp = positionWorld;
    const lit = clamp(normalWorld.y.mul(0.55).add(0.45).add(normalWorld.x.mul(0.12)), 0, 1);
    const swirl = texture(noise, vec2(wp.x.mul(0.012).add(time.mul(0.006)), wp.z.mul(0.012).add(wp.y.mul(0.02)))).a;
    const shadow = mix(skyParams.top, vec3(0.2, 0.32, 0.62), 0.75).mul(0.36);
    const light = mix(skyParams.horizon, vec3(1.0, 0.98, 0.95), 0.5).mul(0.95);
    // phần thấp của khối tối hơn (chiều sâu): chân mây sát vực xám lam, đỉnh trắng sáng
    const h = smoothstep(floor - 40, floor + 45, wp.y);
    mat.colorNode = mix(shadow, light, lit.mul(0.8).add(swirl.mul(0.2))).mul(float(0.55).add(h.mul(0.45)));
    const facing = normalView.z.abs();
    const near = smoothstep(40, 170, wp.sub(cameraPosition).length());
    mat.opacityNode = clamp(facing.pow(1.0).mul(float(0.3).add(swirl.mul(0.7))), 0, 0.72).mul(near);
    const plan = billowPlan(size, floor, def.islands ?? [], def.bridges ?? [], 900);
    const im = new THREE.InstancedMesh(geo, mat, plan.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    plan.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(0, b.yaw, 0));
      m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.sx, b.sy, b.sz));
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.renderOrder = -5;
    im.name = 'cloud-billows';
    this.group.add(im);
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
    // mặt sàn mây: phủ lên mặt đất texture của sàn (đúng cao độ `floor`) (sàn mây đi được, không được lộ ra đất), xanh thẫm có vân mây trắng chuyển động;
    // các khe giữa khối mây thấy lớp này tối hơn đỉnh mây trắng nên biển mây có chiều sâu
    const abyssGeo = this.track(new THREE.PlaneGeometry(size * 1.6, size * 1.6));
    abyssGeo.rotateX(-Math.PI / 2);
    // trùng đúng mặt địa hình của sàn mây (floor): `polygonOffset` để luôn thắng độ sâu ở mọi khoảng cách (đặt cao hơn 0,2 m sẽ z-fight từ xa > 1 km)
    const abyssMat = this.track(new THREE.MeshBasicNodeMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const cn = getCloudNoise();
    const wxz = vec2(positionWorld.x, positionWorld.z);
    const sw = texture(cn, wxz.mul(0.0035).add(vec2(time.mul(0.0015), 0)))
      .a.mul(0.6)
      .add(texture(cn, wxz.mul(0.011).sub(vec2(0, time.mul(0.003)))).g.mul(0.4));
    abyssMat.colorNode = mix(vec3(0.3, 0.45, 0.72), mix(skyParams.horizon, vec3(1, 1, 1), 0.5), smoothstep(0.25, 0.8, sw));
    const abyss = new THREE.Mesh(abyssGeo, abyssMat);
    abyss.position.set(size / 2, floor, size / 2);
    abyss.renderOrder = -9;
    abyss.frustumCulled = false;
    abyss.name = 'cloud-floor';
    this.group.add(abyss);
    const layers: [number, number, number][] = [
      [0.25, 0.12, 11],
      [0.9, 0.08, 7],
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
    this.debris = im;
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
    this.oldFalls = mesh;
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
    const treeParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + f.x * 0.01;
      const rr = f.r * (0.25 + (0.4 * ((i * 37) % 10)) / 10);
      const tree = new THREE.ConeGeometry(2.4, 9, 7).toNonIndexed();
      tree.translate(Math.cos(a) * rr, 4.5, Math.sin(a) * rr);
      parts.push(painted(tree, () => C_TREE));
      const tc = tree.clone();
      tc.deleteAttribute('uv'); // khớp thuộc tính lưới Blender (position, normal, color) để gộp được
      treeParts.push(tc);
    }
    const trees = this.track(mergeGeometries(treeParts, false));
    for (const p of treeParts) p.dispose();
    const merged = this.track(mergeGeometries(parts, false));
    for (const p of parts) p.dispose();
    const mat = this.track(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide, // mặt cỏ trên của lưới Blender có thể quay xuống tùy hướng pháp tuyến
        transparent: true,
        opacity: 1,
        emissive: new THREE.Color(0x9fe8ff),
        emissiveIntensity: 0,
      }),
    );
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(f.x, f.y, f.z);
    mesh.name = 'fake-island';
    mesh.userData.trees = trees;
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
    this.gone = true;
    this.rockHandle?.release();
    this.rockHandle = null;
    this.group.parent?.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.fakes.length = 0;
  }
}
