// Thiên Y (NV3-B): vải mô phỏng thời gian thực cho nhân vật v3 có mesh vải cũ tách riêng (`*_oldskirt`, `*_oldsleeve`, do `chr_v3.py --split-cloth`).
// Hình dạng vải mới đo từ chính lưới Tripo cũ (cùng hình bóng nên texture chiếu từ tranh khớp): 3 lớp váy xếp tầng + 2 tấm tay áo hở. Ghim vào
// xương như skin, mô phỏng bằng verlet (`@dtl/shared` cloth.ts) với viên nang chân/tay/thân, sàn, gió nhẹ. Chỉ nhân vật LOD0 trong khung nhìn mô
// phỏng; xa/khuất thì hiện lại vải cũ. Hai mesh (một đặc, một trong suốt) dùng chung texture atlas: +2 draw call mỗi nhân vật.
import * as THREE from 'three/webgpu';
import {
  atlasUv,
  type Capsule,
  CLOTH_DEFAULT,
  type ClothGrid,
  type ClothParams,
  ClothSim,
  fitThienY,
  THIEN_Y_SHEER,
  type V3,
} from '@dtl/shared';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** Thông số theo mẫu vải: dây neo giữ vải gần thân (lệch tối đa ở gấu/mép tự do), voan nhẹ hơn lớp đặc. */
const PARAMS: Record<string, ClothParams> = {
  skirt_in: { ...CLOTH_DEFAULT, tether: 0.16, tetherPow: 1.2, damping: 0.97 },
  skirt_mid: { ...CLOTH_DEFAULT, tether: 0.24, tetherPow: 1.25, damping: 0.975 },
  skirt_out: { ...CLOTH_DEFAULT, tether: 0.32, tetherPow: 1.3, damping: 0.98 },
  sleeve: { ...CLOTH_DEFAULT, tether: 0.32, tetherPow: 1.1, damping: 0.975, iterations: 2 },
};
const paramsOf = (id: string): ClothParams => PARAMS[id] ?? PARAMS.sleeve!;

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

export interface ClothStats {
  verts: number;
  /** ms trung bình mỗi `update` (cửa sổ trượt ngắn). */
  ms: number;
}

export interface ThienYRigOptions {
  /** Texture đã bake (RGBA: alpha dùng cho lớp trong suốt); không có thì vải màu trơn. */
  map?: THREE.Texture | null;
  skirtCols?: number;
  skirtRows?: number;
  sleeveCols?: number;
  sleeveRows?: number;
}

interface Batch {
  mesh: THREE.Mesh;
  grids: number[];
  pos: THREE.BufferAttribute;
  nor: THREE.BufferAttribute;
  /** chỉ số đỉnh đầu của từng lưới trong batch. */
  start: number[];
}

export class ClothRig {
  readonly sims: ClothSim[] = [];
  private grids: ClothGrid[] = [];
  private batches: Batch[] = [];
  private pins = new Map<string, PinMat>();
  private caps: CapDef[] = [];
  private capOut: Capsule[] = [];
  private capBase: number[] = [];
  private targets: Float32Array[] = [];
  private normals: Float32Array[] = [];
  private skinned: THREE.SkinnedMesh;
  private acc = 0;
  private t = 0;
  private lastRoot = new THREE.Vector3();
  private fresh = true;
  private msAvg = 0;
  private nVerts = 0;
  active = false;

  /** Ném lỗi nếu thiếu mesh cũ/xương để chỗ gọi tự bỏ qua. */
  constructor(
    rig: THREE.Object3D,
    private root: THREE.Object3D,
    height: number,
    private oldMeshes: THREE.Mesh[],
    opt: ThienYRigOptions = {},
  ) {
    const sm = oldMeshes.find((m) => (m as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh | undefined;
    if (!sm) throw new Error('thienY: không có mesh cũ có skin');
    this.skinned = sm;
    const sk = sm.skeleton;
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
    for (const g of this.grids)
      for (const bn of new Set(g.pinBone)) {
        if (this.pins.has(bn)) continue;
        const i = idx(bn);
        if (i < 0) throw new Error(`thienY: thiếu xương ghim ${bn}`);
        this.pins.set(bn, { bone: sk.bones[i]!, m: new THREE.Matrix4(), ibm: sk.boneInverses[i]! });
      }

    // ---- hai lô hình học: đặc / trong suốt ----
    const sheer = (g: ClothGrid) => g.id in THIEN_Y_SHEER;
    for (const solid of [true, false]) {
      const ids = this.grids.map((g, i) => (sheer(g) === !solid ? i : -1)).filter((i) => i >= 0);
      if (!ids.length) continue;
      let nv = 0,
        ni = 0;
      const start: number[] = [];
      for (const gi of ids) {
        start.push(nv);
        nv += this.grids[gi]!.nu * this.grids[gi]!.nv;
        ni += this.grids[gi]!.index.length;
      }
      const pos = new Float32Array(nv * 3),
        uv = new Float32Array(nv * 2),
        index = new Uint32Array(ni);
      let ii = 0;
      ids.forEach((gi, n) => {
        const g = this.grids[gi]!;
        pos.set(g.rest, start[n]! * 3);
        uv.set(atlasUv(g), start[n]! * 2);
        for (let i = 0; i < g.index.length; i++) index[ii++] = g.index[i]! + start[n]!;
      });
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3);
      const na = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
      geo.setAttribute('position', pa);
      geo.setAttribute('normal', na);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      const mat = new THREE.MeshStandardMaterial({
        color: opt.map ? 0xffffff : new THREE.Color(solid ? '#6b5aa8' : '#b9a6ea'),
        map: opt.map ?? null,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: !solid,
        opacity: 1,
        depthWrite: solid,
        alphaTest: solid ? 0 : 0.02,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = solid ? 'thien_y_dac' : 'thien_y_voan';
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = solid ? 0 : 2;
      root.add(mesh);
      this.batches.push({ mesh, grids: ids, pos: pa, nor: na, start });
      this.nVerts += nv;
    }
    this.grids.forEach((g) => {
      this.sims.push(new ClothSim(g, paramsOf(g.id.startsWith('sleeve') ? 'sleeve' : g.id)));
      this.targets.push(new Float32Array(g.nu * g.nv * 3));
      this.normals.push(new Float32Array(g.nu * g.nv * 3));
    });

    // ---- viên nang va chạm (thế giới): hông, đùi, cẳng, thân, tay ----
    const spec: [string, string, number][] = [
      ['pelvis', 'spine_01', 0.11],
      ['spine_01', 'spine_03', 0.13],
    ];
    for (const sd of ['l', 'r']) {
      spec.push(
        [`thigh_${sd}`, `calf_${sd}`, 0.09],
        [`calf_${sd}`, `foot_${sd}`, 0.06],
        [`upperarm_${sd}`, `lowerarm_${sd}`, 0.05],
        [`lowerarm_${sd}`, `hand_${sd}`, 0.04],
      );
    }
    for (const [an, bn, r] of spec) {
      const a = rig.getObjectByName(an),
        b = rig.getObjectByName(bn);
      if (a && b) {
        this.caps.push({ a, b, r: r * k });
        this.capBase.push(r * k);
        this.capOut.push({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: r * k });
      }
    }
  }

  /** Hiện vải mô phỏng và ẩn vải cũ (hoặc ngược lại khi LOD xa/khuất). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    for (const b of this.batches) b.mesh.visible = on;
    for (const m of this.oldMeshes) m.visible = !on;
    this.fresh = on;
  }

  /**
   * Cập nhật mỗi khung (khi `active`). `sit` 0..1: phình viên nang chân để vải phủ lên đùi khi ngồi. `freshMatrices`: ma trận thế giới của rig đã được cập nhật
   * trong khung này (bỏ qua cập nhật lặp, tốn nhất).
   */
  update(dt: number, sit = 0, freshMatrices = false): void {
    if (!this.active) return;
    const t0 = performance.now();
    if (!freshMatrices) this.root.updateMatrixWorld(true);
    const bind = this.skinned.bindMatrix;
    for (const p of this.pins.values()) p.m.copy(p.bone.matrixWorld).multiply(p.ibm).multiply(bind);
    // vị trí đích: skin của vị trí nghỉ theo xương ghim của từng đỉnh (cho MỌI đỉnh: dây neo cần)
    this.grids.forEach((g, gi) => {
      const tgt = this.targets[gi]!;
      for (let i = 0; i < g.nu * g.nv; i++) {
        const pm = this.pins.get(g.pinBone[i]!)!;
        _v.set(g.rest[3 * i]!, g.rest[3 * i + 1]!, g.rest[3 * i + 2]!).applyMatrix4(pm.m);
        tgt[3 * i] = _v.x;
        tgt[3 * i + 1] = _v.y;
        tgt[3 * i + 2] = _v.z;
      }
    });
    // viên nang thế giới (chân phình khi ngồi)
    for (let c = 0; c < this.caps.length; c++) {
      const cd = this.caps[c]!;
      // đọc thẳng matrixWorld (đã cập nhật): getWorldPosition đi ngược cây cha mỗi lần gọi nên đắt
      const ea = cd.a.matrixWorld.elements,
        eb = cd.b.matrixWorld.elements;
      const o = this.capOut[c]!;
      o.ax = ea[12]!;
      o.ay = ea[13]!;
      o.az = ea[14]!;
      o.bx = eb[12]!;
      o.by = eb[13]!;
      o.bz = eb[14]!;
      o.r = this.capBase[c]! * (cd.a.name.startsWith('thigh') || cd.a.name.startsWith('calf') ? 1 + 0.35 * sit : 1);
    }
    const er = this.root.matrixWorld.elements;
    _a.set(er[12]!, er[13]!, er[14]!);
    const floorY = _a.y + 0.01;
    if (this.fresh || _a.distanceToSquared(this.lastRoot) > 9) {
      this.grids.forEach((_g, gi) => this.sims[gi]!.reset(this.targets[gi]!));
      this.fresh = false;
    }
    this.lastRoot.copy(_a);
    this.t += dt;
    this.acc = Math.min(this.acc + dt, 2 / 60);
    const wind: V3 = [Math.sin(this.t * 1.3) * 0.5 + 0.2, 0, Math.cos(this.t * 0.9) * 0.5];
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      for (let gi = 0; gi < this.grids.length; gi++) this.sims[gi]!.step(1 / 60, this.targets[gi]!, this.capOut, wind, floorY);
    }
    // sang toạ độ cục bộ của root để mesh đi theo root
    _inv.copy(this.root.matrixWorld).invert();
    for (const b of this.batches) {
      const pa = b.pos.array as Float32Array;
      const na = b.nor.array as Float32Array;
      b.grids.forEach((gi, n) => {
        const g = this.grids[gi]!;
        const sim = this.sims[gi]!;
        const nrm = this.normals[gi]!;
        sim.normals(nrm);
        const o = b.start[n]!;
        for (let i = 0; i < g.nu * g.nv; i++) {
          _v.set(sim.pos[3 * i]!, sim.pos[3 * i + 1]!, sim.pos[3 * i + 2]!).applyMatrix4(_inv);
          pa[3 * (o + i)] = _v.x;
          pa[3 * (o + i) + 1] = _v.y;
          pa[3 * (o + i) + 2] = _v.z;
          _a.set(nrm[3 * i]!, nrm[3 * i + 1]!, nrm[3 * i + 2]!).transformDirection(_inv);
          na[3 * (o + i)] = _a.x;
          na[3 * (o + i) + 1] = _a.y;
          na[3 * (o + i) + 2] = _a.z;
        }
      });
      b.pos.needsUpdate = true;
      b.nor.needsUpdate = true;
    }
    const ms = performance.now() - t0;
    this.msAvg += (ms - this.msAvg) * 0.1;
  }

  get stats(): ClothStats {
    return { verts: this.nVerts, ms: this.msAvg };
  }

  dispose(): void {
    for (const b of this.batches) {
      this.root.remove(b.mesh);
      b.mesh.geometry.dispose();
      const mat = b.mesh.material as THREE.MeshStandardMaterial;
      mat.map?.dispose(); // texture riêng của từng nhân vật (TextureLoader ở mannequin.ts); dispose lặp lại vô hại
      mat.dispose();
    }
  }
}
