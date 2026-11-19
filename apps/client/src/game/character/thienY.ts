// Thiên Y (NV3-B): vải mô phỏng thời gian thực cho nhân vật v3 có mesh vải cũ tách riêng (`*_oldskirt`, `*_oldsleeve`, do `chr_v3.py --split-cloth`).
// Hình dạng vải mới đo từ chính lưới Tripo cũ (cùng hình bóng nên texture chiếu từ tranh khớp), ghim vào xương như skin, mô phỏng bằng verlet
// (`@dtl/shared` cloth.ts) với viên nang chân/tay/thân và gió nhẹ. Chỉ nhân vật LOD0 trong khung nhìn mô phỏng; xa/khuất thì hiện lại vải cũ.
// Một mesh gộp duy nhất (váy + hai tay áo), một vật liệu hai mặt: +1 draw call mỗi nhân vật.
import * as THREE from 'three/webgpu';
import { atlasUv, type Capsule, CLOTH_DEFAULT, type ClothParams, ClothSim, type ClothGrid, fitThienY, type V3 } from '@dtl/shared';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _inv = new THREE.Matrix4();

interface PinMat {
  bone: THREE.Bone;
  /** world(bone) · IBM · bindMatrix: đưa vị trí nghỉ (toạ độ mesh) ra thế giới. */
  m: THREE.Matrix4;
  ibm: THREE.Matrix4;
}

interface CapDef {
  a: THREE.Object3D;
  b: THREE.Object3D;
  r: number;
}

/** Thông số theo mẫu vải: dây neo giữ vải gần thân (váy lệch tối đa 0,3 m ở gấu, tay áo 0,2 m ở mút). */
const SKIRT_PARAMS: ClothParams = { ...CLOTH_DEFAULT, tether: 0.3, tetherPow: 1.3, damping: 0.98 };
const SLEEVE_PARAMS: ClothParams = { ...CLOTH_DEFAULT, tether: 0.2, tetherPow: 1.1, damping: 0.97, iterations: 3 };

export interface ClothStats {
  verts: number;
  /** ms trung bình mỗi `update` (cửa sổ trượt ngắn). */
  ms: number;
}

export interface ThienYRigOptions {
  color?: string;
  /** Texture đã bake (nếu có); không có thì vải màu trơn theo `color`. */
  map?: THREE.Texture | null;
  skirtCols?: number;
  skirtRows?: number;
  sleeveCols?: number;
  sleeveRows?: number;
}

export class ClothRig {
  readonly mesh: THREE.Mesh;
  readonly sims: ClothSim[] = [];
  private grids: ClothGrid[] = [];
  private offsets: number[] = [];
  private pins = new Map<string, PinMat>();
  private caps: CapDef[] = [];
  private capOut: Capsule[] = [];
  private target: Float32Array;
  private normals: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private norAttr: THREE.BufferAttribute;
  private skinned: THREE.SkinnedMesh;
  private acc = 0;
  private t = 0;
  private lastRoot = new THREE.Vector3();
  private fresh = true;
  private msAvg = 0;
  active = false;

  /** Gọi sau khi `rig` đã có xương và (tuỳ chọn) khi mesh cũ đã có trong cây. Ném lỗi nếu thiếu mesh cũ để chỗ gọi tự bỏ qua. */
  constructor(
    private rig: THREE.Object3D,
    private root: THREE.Object3D,
    height: number,
    private oldMeshes: THREE.Mesh[],
    opt: ThienYRigOptions = {},
  ) {
    const sm = oldMeshes.find((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh | undefined;
    if (!sm) throw new Error('thienY: không có mesh cũ có skin');
    this.skinned = sm;
    const sk = sm.skeleton;
    const bind = sm.bindMatrix;
    const bindInv = sm.bindMatrixInverse;
    const k = height / 1.8;
    const idx = (n: string) => sk.bones.findIndex((b) => b.name === n);
    const joint = (n: string): V3 => {
      const i = idx(n);
      if (i < 0) throw new Error(`thienY: thiếu xương ${n}`);
      _inv.copy(sk.boneInverses[i]!).invert();
      _v.setFromMatrixPosition(_inv).applyMatrix4(bindInv);
      return [_v.x, _v.y, _v.z];
    };
    const pin = (n: string): void => {
      if (this.pins.has(n)) return;
      const i = idx(n);
      this.pins.set(n, { bone: sk.bones[i]!, m: new THREE.Matrix4(), ibm: sk.boneInverses[i]! });
    };
    void bind;

    const skirtPos: number[] = [];
    const sleevePos: { l: number[]; r: number[] } = { l: [], r: [] };
    for (const om of oldMeshes) {
      const p = om.geometry.getAttribute('position');
      const target = om.name.includes('oldsleeve') ? 'sleeve' : om.name.includes('oldskirt') ? 'skirt' : null;
      if (!target) continue;
      for (let i = 0; i < p.count; i++) {
        if (target === 'skirt') skirtPos.push(p.getX(i), p.getY(i), p.getZ(i));
        else sleevePos[p.getX(i) >= 0 ? 'l' : 'r'].push(p.getX(i), p.getY(i), p.getZ(i));
      }
    }
    this.grids = fitThienY({ joint, skirtPts: skirtPos, sleevePts: sleevePos, height }, opt);
    for (const g of this.grids) pin(g.pinBone[0]!);

    // ---- gộp hình học ----
    let nv = 0, ni = 0;
    for (const g of this.grids) {
      this.offsets.push(nv);
      nv += g.nu * g.nv;
      ni += g.index.length;
    }
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), index = new Uint32Array(ni);
    let ii = 0;
    this.grids.forEach((g, gi) => {
      const o = this.offsets[gi]!;
      pos.set(g.rest, o * 3);
      uv.set(atlasUv(g), o * 2);
      for (let i = 0; i < g.index.length; i++) index[ii++] = g.index[i]! + o;
      this.sims.push(new ClothSim(g, g.id === 'skirt' ? SKIRT_PARAMS : SLEEVE_PARAMS));
    });
    this.target = new Float32Array(nv * 3);
    this.normals = new Float32Array(nv * 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.norAttr = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    this.norAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.norAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mat = new THREE.MeshStandardMaterial({
      color: opt.map ? 0xffffff : new THREE.Color(opt.color ?? '#7d62b8'),
      map: opt.map ?? null,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'thien_y';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    root.add(this.mesh);

    // ---- viên nang va chạm (thế giới): hông, đùi, cẳng, thân, tay ----
    const spec: [string, string, number][] = [['pelvis', 'spine_01', 0.11], ['spine_01', 'spine_03', 0.13]];
    for (const sd of ['l', 'r']) {
      spec.push([`thigh_${sd}`, `calf_${sd}`, 0.085], [`calf_${sd}`, `foot_${sd}`, 0.06], [`upperarm_${sd}`, `lowerarm_${sd}`, 0.05], [`lowerarm_${sd}`, `hand_${sd}`, 0.04]);
    }
    for (const [an, bn, r] of spec) {
      const a = rig.getObjectByName(an), b = rig.getObjectByName(bn);
      if (a && b) {
        this.caps.push({ a, b, r: r * k });
        this.capOut.push({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: r * k });
      }
    }
  }

  /** Hiện vải mô phỏng và ẩn vải cũ (hoặc ngược lại khi LOD xa/khuất). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.mesh.visible = on;
    for (const m of this.oldMeshes) m.visible = !on;
    this.fresh = on;
  }

  /** Cập nhật mỗi khung (khi `active`): ghim, bước giải cố định 1/60 s (tối đa 2 bước/khung), ghi vị trí + pháp tuyến. */
  update(dt: number): void {
    if (!this.active) return;
    const t0 = performance.now();
    this.rig.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    const bind = this.skinned.bindMatrix;
    for (const p of this.pins.values()) p.m.copy(p.bone.matrixWorld).multiply(p.ibm).multiply(bind);
    // vị trí đích của đỉnh ghim
    this.grids.forEach((g, gi) => {
      const o = this.offsets[gi]!;
      const pm = this.pins.get(g.pinBone[0]!)!;
      for (let i = 0; i < g.nu * g.nv; i++) {
        _v.set(g.rest[3 * i]!, g.rest[3 * i + 1]!, g.rest[3 * i + 2]!).applyMatrix4(pm.m);
        this.target[3 * (o + i)] = _v.x;
        this.target[3 * (o + i) + 1] = _v.y;
        this.target[3 * (o + i) + 2] = _v.z;
      }
    });
    // viên nang thế giới
    for (let c = 0; c < this.caps.length; c++) {
      const cd = this.caps[c]!;
      cd.a.getWorldPosition(_a);
      cd.b.getWorldPosition(_b);
      const o = this.capOut[c]!;
      o.ax = _a.x; o.ay = _a.y; o.az = _a.z;
      o.bx = _b.x; o.by = _b.y; o.bz = _b.z;
    }
    this.root.getWorldPosition(_a);
    if (this.fresh || _a.distanceToSquared(this.lastRoot) > 9) {
      this.grids.forEach((g, gi) => {
        const o = this.offsets[gi]!;
        const n = g.nu * g.nv;
        const full = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const pm = this.pins.get(g.pinBone[i]!)!;
          _v.set(g.rest[3 * i]!, g.rest[3 * i + 1]!, g.rest[3 * i + 2]!).applyMatrix4(pm.m);
          full[3 * i] = _v.x; full[3 * i + 1] = _v.y; full[3 * i + 2] = _v.z;
        }
        this.sims[gi]!.reset(full);
        void o;
      });
      this.fresh = false;
    }
    this.lastRoot.copy(_a);
    this.t += dt;
    this.acc = Math.min(this.acc + dt, 2 / 60);
    const wind: V3 = [Math.sin(this.t * 1.3) * 0.5 + 0.2, 0, Math.cos(this.t * 0.9) * 0.5];
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.grids.forEach((g, gi) => {
        const o = this.offsets[gi]!;
        const n = g.nu * g.nv;
        const tgt = this.target.subarray(3 * o, 3 * (o + n));
        this.sims[gi]!.step(1 / 60, tgt, this.capOut, wind);
      });
    }
    // sang toạ độ cục bộ của root để mesh đi theo root
    _inv.copy(this.root.matrixWorld).invert();
    const pa = this.posAttr.array as Float32Array;
    const na = this.norAttr.array as Float32Array;
    this.grids.forEach((g, gi) => {
      const o = this.offsets[gi]!;
      const sim = this.sims[gi]!;
      const n = g.nu * g.nv;
      sim.normals(this.normals.subarray(3 * o, 3 * (o + n)));
      for (let i = 0; i < n; i++) {
        _v.set(sim.pos[3 * i]!, sim.pos[3 * i + 1]!, sim.pos[3 * i + 2]!).applyMatrix4(_inv);
        pa[3 * (o + i)] = _v.x;
        pa[3 * (o + i) + 1] = _v.y;
        pa[3 * (o + i) + 2] = _v.z;
        _a.set(this.normals[3 * (o + i)]!, this.normals[3 * (o + i) + 1]!, this.normals[3 * (o + i) + 2]!).transformDirection(_inv);
        na[3 * (o + i)] = _a.x;
        na[3 * (o + i) + 1] = _a.y;
        na[3 * (o + i) + 2] = _a.z;
      }
    });
    this.posAttr.needsUpdate = true;
    this.norAttr.needsUpdate = true;
    const ms = performance.now() - t0;
    this.msAvg += (ms - this.msAvg) * 0.1;
    void _m;
  }

  get stats(): ClothStats {
    return { verts: this.posAttr.count, ms: this.msAvg };
  }

  dispose(): void {
    this.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
