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

/** Màu trung bình (0..1, sRGB) của texture các lưới cũ ở đúng các UV đỉnh của chúng; không đọc được thì màu tím nhạt mặc định. */
export function averageTexColor(meshes: THREE.Mesh[], palette?: [number, number, number][]): [number, number, number] {
  const def: [number, number, number] = [0.72, 0.65, 0.9];
  try {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const img = mat.map?.image as CanvasImageSource & { width: number; height: number };
      const uv = m.geometry.getAttribute('uv');
      if (!img || !uv || !img.width) continue;
      // thu nhỏ về 64×64 một lần rồi đọc cả khối (getImageData từng điểm trên texture gốc 2K+ tốn vài ms lúc tạo model)
      const S = 64;
      const cv = document.createElement('canvas');
      cv.width = S;
      cv.height = S;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) continue;
      cx.drawImage(img, 0, 0, S, S);
      const px = cx.getImageData(0, 0, S, S).data;
      const step = Math.max(1, Math.floor(uv.count / 200));
      for (let i = 0; i < uv.count; i += step) {
        const x = Math.min(S - 1, Math.max(0, Math.floor(uv.getX(i) * S)));
        const y = Math.min(S - 1, Math.max(0, Math.floor((mat.map!.flipY ? 1 - uv.getY(i) : uv.getY(i)) * S)));
        const o = (y * S + x) * 4;
        r += px[o]!;
        g += px[o + 1]!;
        b += px[o + 2]!;
        n++;
        if (palette && palette.length < 24 && n % 7 === 0) palette.push([px[o]! / 255, px[o + 1]! / 255, px[o + 2]! / 255]);
      }
    }
    return n ? [r / n / 255, g / n / 255, b / n / 255] : def;
  } catch {
    return def;
  }
}

/** Texture voan: màu áo (đậm hơn ở trên, nhạt ở gấu), alpha giảm dần về gấu và mờ ở hai mép; v = 0 ở hàng ghim. */
export function voanTexture(c: [number, number, number], palette: [number, number, number][] = []): THREE.Texture {
  const W = 32;
  const H = 64;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext('2d')!;
  const img = cx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = y / (H - 1);
      const edge = Math.min(1, Math.min(x, W - 1 - x) / 4 + 0.35);
      const k = 0.78 + 0.32 * t;
      const i = (y * W + x) * 4;
      // hoa văn từ áo: sọc dọc (nếp vải) lấy màu từ bảng màu mẫu của tay áo cũ, pha 55% với màu trung bình để không loang
      const pc = palette.length ? palette[(Math.floor(x / 2) * 5 + Math.floor(y / 14) * 3) % palette.length]! : c;
      const m = palette.length ? 0.45 : 0;
      img.data[i] = Math.min(255, (c[0] * (1 - m) + pc[0] * m) * 255 * k);
      img.data[i + 1] = Math.min(255, (c[1] * (1 - m) + pc[1] * m) * 255 * k);
      img.data[i + 2] = Math.min(255, (c[2] * (1 - m) + pc[2] * m) * 255 * k);
      img.data[i + 3] = 255 * (0.92 - 0.45 * t) * edge;
    }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  return tex;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** Thông số theo mẫu vải: dây neo giữ vải gần thân (lệch tối đa ở gấu/mép tự do), voan nhẹ hơn lớp đặc. */
const PARAMS: Record<string, ClothParams> = {
  skirt_in: { ...CLOTH_DEFAULT, tether: 0.16, tetherPow: 1.2, damping: 0.97 },
  skirt_mid: { ...CLOTH_DEFAULT, tether: 0.24, tetherPow: 1.25, damping: 0.975 },
  skirt_out: { ...CLOTH_DEFAULT, tether: 0.32, tetherPow: 1.3, damping: 0.98 },
  // Biên độ giới hạn (dây neo ngắn): lướt/đòn nặng không bung tay áo ra như cánh.
  sleeve: { ...CLOTH_DEFAULT, tether: 0.3, tetherPow: 1.6, damping: 0.96, iterations: 2 },
  // Dải lụa: nhẹ (trọng lực thấp), phấp phới nhưng neo trong ~0,4 m.
  ribbon: { ...CLOTH_DEFAULT, gravity: 7.5, tether: 0.4, tetherPow: 1.0, damping: 0.985, iterations: 2, bend: 0.05 },
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
  /** Số đỉnh vải nằm trong viên nang thân/chân (< 0,85 r) ở khung vừa mô phỏng, và lớn nhất từ lúc bật `measurePen`. */
  pen: number;
  penMax: number;
  /** Màu voan (0..1) và số màu mẫu lấy được từ texture tay áo cũ (0 = không đọc được, dùng màu mặc định). */
  tint: [number, number, number];
  palette: number;
  penBy: Record<string, number>;
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

/**
 * Ngân sách CPU chung của mọi vải mô phỏng trong một khung: nhân vật nào tới lượt mà ngân sách khung đã cạn thì hoãn (dồn `dt`, lần sau mô phỏng bù),
 * nhưng hoãn quá `maxLagS` thì buộc chạy để không bị đứng hình. Đồng hồ tiêm vào để kiểm bằng test.
 */
export class ClothBudget {
  private frameStart = -1e9;
  private spent = 0;
  /** Tổng ms vải mỗi khung (trung bình trượt) và lớn nhất một khung, để đo ngân sách thật. */
  avg = 0;
  max = 0;
  /** `maxLagS` 0,12 s (từ 0,08): với bộ vải nặng (Thần Tạng) lệnh ép chạy sau 80 ms làm tổng vượt 0,5 ms với 10 nhân vật (đo 0,60); 0,12 s cho 0,36–0,44 ms. */
  constructor(
    readonly budgetMs = 0.4,
    readonly maxLagS = 0.12,
    private now: () => number = () => performance.now(),
  ) {}
  /** Được chạy lúc này không? `pendingS`: dt đã dồn do bị hoãn; `estMs`: chi phí ước tính của lần chạy (trung bình trượt của chính nó). Nhân vật đầu tiên mỗi khung luôn được chạy. */
  allow(pendingS: number, estMs = 0): boolean {
    const t = this.now();
    if (t - this.frameStart > 6) {
      if (this.spent > 0 || this.frameStart > 0) {
        this.avg += (this.spent - this.avg) * 0.05;
        if (this.spent > this.max) this.max = this.spent;
      }
      this.frameStart = t;
      this.spent = 0;
    }
    return this.spent + estMs <= this.budgetMs || this.spent === 0 || pendingS >= this.maxLagS;
  }
  /** Ghi chi phí (ms) đã tốn của lần chạy vừa xong. */
  charge(ms: number): void {
    this.spent += ms;
  }
}
export const CLOTH_BUDGET = new ClothBudget();

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
  private pending = 0;
  private pen = 0;
  /** Đỉnh xuyên lớn nhất theo từng lưới vải (id → số đỉnh), để biết lưới nào gây xuyên. */
  penBy: Record<string, number> = {};
  /** Mức khép tay áo [trái, phải] 0..1 theo độ nhấc cánh tay (tính mỗi khung). */
  private fold = [0, 0];
  private penMax = 0;
  /** Bật đo xuyên thân (kịch bản chụp): đếm đỉnh vải nằm trong viên nang mỗi khung mô phỏng. */
  measurePen = false;
  private uvBox: { l: number[]; r: number[] } = { l: [1, 1, 0, 0], r: [1, 1, 0, 0] };
  /** Texture của áo (dùng chung với lưới cũ, KHÔNG dispose ở đây). */
  private sleeveMap: THREE.Texture | null = null;
  private palette: [number, number, number][] = [];
  private tint: [number, number, number] = [0.72, 0.65, 0.9];
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
      const uvA = om.geometry.getAttribute('uv');
      if (target === 'sleeve' && uvA) {
        // hộp UV của từng tay áo cũ (trái/phải theo dấu x): voan mới lấy chính vùng texture đó của áo (texture KTX2 đọc không được trên CPU nên dùng thẳng trên GPU)
        for (let i = 0; i < uvA.count; i++) {
          const b = this.uvBox[p.getX(i) >= 0 ? 'l' : 'r'];
          b[0] = Math.min(b[0]!, uvA.getX(i));
          b[1] = Math.min(b[1]!, uvA.getY(i));
          b[2] = Math.max(b[2]!, uvA.getX(i));
          b[3] = Math.max(b[3]!, uvA.getY(i));
        }
        const mm = (om.material as THREE.MeshStandardMaterial).map;
        if (mm && !this.sleeveMap) this.sleeveMap = mm;
      }
    }
    // Màu voan = trung bình texture tay áo cũ, pha 45% về tông áo ấm (hồng nhạt) để không lệch xanh so với thân áo.
    const avg = averageTexColor(
      oldMeshes.filter((m) => m.name.includes('oldsleeve')),
      this.palette,
    );
    this.tint = [avg[0] * 0.55 + 0.8 * 0.45, avg[1] * 0.55 + 0.68 * 0.45, avg[2] * 0.55 + 0.72 * 0.45];
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
        col = new Float32Array(nv * 4).fill(1),
        index = new Uint32Array(ni);
      let ii = 0;
      ids.forEach((gi, n) => {
        const g = this.grids[gi]!;
        pos.set(g.rest, start[n]! * 3);
        if (/^(sleeve|ribbon)/.test(g.id) && this.sleeveMap) {
          const b = this.uvBox[g.id.endsWith('l') || g.id.endsWith('la') || g.id.endsWith('lb') ? 'l' : 'r'];
          const du = Math.max(1e-4, b[2]! - b[0]!),
            dv = Math.max(1e-4, b[3]! - b[1]!);
          for (let i = 0; i < g.nu * g.nv; i++) {
            uv[(start[n]! + i) * 2] = b[0]! + g.uv[2 * i]! * du;
            uv[(start[n]! + i) * 2 + 1] = b[1]! + g.uv[2 * i + 1]! * dv;
          }
        } else uv.set(/^(sleeve|ribbon)/.test(g.id) ? g.uv : atlasUv(g), start[n]! * 2);
        // alpha đỉnh (voan): đặc ở hàng ghim, mờ dần về gấu và ở hai mép
        for (let r = 0; r < g.nv; r++)
          for (let c = 0; c < g.nu; c++) {
            const o = (start[n]! + r * g.nu + c) * 4;
            const edge = g.nu > 2 ? Math.min(1, Math.min(c, g.nu - 1 - c) / 2 + 0.4) : 1;
            col[o] = col[o + 1] = col[o + 2] = 1;
            col[o + 3] = (0.92 - 0.5 * (r / (g.nv - 1))) * edge;
          }
        for (let i = 0; i < g.index.length; i++) index[ii++] = g.index[i]! + start[n]!;
      });
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3);
      const na = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
      geo.setAttribute('position', pa);
      geo.setAttribute('normal', na);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (!solid) geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: !solid ? (this.sleeveMap ?? voanTexture(this.tint, this.palette)) : (opt.map ?? null),
        vertexColors: !solid,
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
      this.sims.push(new ClothSim(g, paramsOf(g.id.startsWith('sleeve') ? 'sleeve' : g.id.startsWith('ribbon') ? 'ribbon' : g.id)));
      this.targets.push(new Float32Array(g.nu * g.nv * 3));
      this.normals.push(new Float32Array(g.nu * g.nv * 3));
    });

    this.warm();

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

  /** Chạy thử vài bước giải ở lúc dựng model (JIT + bộ nhớ) để khung đầu tiên hiện vải không đột biến vài ms. */
  private warm(): void {
    this.grids.forEach((g, gi) => {
      const sim = this.sims[gi]!;
      sim.reset(g.rest);
      for (let i = 0; i < 6; i++) sim.step(1 / 60, g.rest, [], [0, 0, 0], -1e9);
      sim.normals(this.normals[gi]!);
    });
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
  update(dtIn: number, sit = 0, freshMatrices = false): void {
    if (!this.active) return;
    this.pending += dtIn;
    if (!CLOTH_BUDGET.allow(this.pending, this.msAvg)) return;
    const dt = this.pending;
    this.pending = 0;
    const t0 = performance.now();
    if (!freshMatrices) this.root.updateMatrixWorld(true);
    const bind = this.skinned.bindMatrix;
    for (const p of this.pins.values()) p.m.copy(p.bone.matrixWorld).multiply(p.ibm).multiply(bind);
    for (let sd = 0; sd < 2; sd++) {
      const ua = this.pins.get(`upperarm_${sd === 0 ? 'l' : 'r'}`);
      const la = this.pins.get(`lowerarm_${sd === 0 ? 'l' : 'r'}`);
      if (!ua || !la) continue;
      _a.setFromMatrixPosition(ua.bone.matrixWorld);
      _v.setFromMatrixPosition(la.bone.matrixWorld).sub(_a);
      const up = _v.y / (_v.length() || 1); // -1 buông xuống, 0 ngang, 1 giơ thẳng lên
      this.fold[sd] = Math.min(0.4, Math.max(0, (up + 0.55) / 0.9) * 0.4);
    }
    // vị trí đích: skin của vị trí nghỉ theo xương ghim của từng đỉnh (cho MỌI đỉnh: dây neo cần)
    this.grids.forEach((g, gi) => {
      const tgt = this.targets[gi]!;
      for (let i = 0; i < g.nu * g.nv; i++) {
        const pm = this.pins.get(g.pinBone[i]!)!;
        _v.set(g.rest[3 * i]!, g.rest[3 * i + 1]!, g.rest[3 * i + 2]!).applyMatrix4(pm.m);
        if (g.id.startsWith('sleeve')) {
          // khép tấm về trục cánh tay khi tay nhấc cao (giới hạn góc bung): kéo đỉnh về gốc xương ghim tay áo theo mức nhấc
          const f = this.fold[g.id.charAt(7) === 'l' ? 0 : 1]!;
          if (f > 0) {
            _a.setFromMatrixPosition(pm.bone.matrixWorld);
            _v.lerp(_a, f);
          }
        }
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
    if (this.measurePen) {
      let n = 0;
      this.sims.forEach((sim, gi) => {
        let ng = 0;
        for (let i = 0; i < sim.n; i++) {
          const px = sim.pos[3 * i]!,
            py = sim.pos[3 * i + 1]!,
            pz = sim.pos[3 * i + 2]!;
          for (let ci = 0; ci < this.capOut.length; ci++) {
            if (/^(upperarm|lowerarm)/.test(this.caps[ci]!.a.name)) continue; // ống tay áo ghim trên trục cánh tay nên bỏ qua tay
            const c = this.capOut[ci]!;
            const bx = c.bx - c.ax,
              by = c.by - c.ay,
              bz = c.bz - c.az;
            const l2 = bx * bx + by * by + bz * bz;
            const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((px - c.ax) * bx + (py - c.ay) * by + (pz - c.az) * bz) / l2)) : 0;
            const dx = px - (c.ax + bx * t),
              dy = py - (c.ay + by * t),
              dz = pz - (c.az + bz * t);
            if (dx * dx + dy * dy + dz * dz < c.r * c.r * 0.7225) {
              ng++;
              break;
            }
          }
        }
        n += ng;
        const id = this.grids[gi]!.id;
        if (ng > (this.penBy[id] ?? 0)) this.penBy[id] = ng;
      });
      this.pen = n;
      if (n > this.penMax) this.penMax = n;
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
    CLOTH_BUDGET.charge(ms);
    this.msAvg += (ms - this.msAvg) * 0.1;
  }

  /** Tổng chi phí vải của mọi nhân vật mỗi khung (ms): trung bình trượt và lớn nhất. */
  get budget(): { avg: number; max: number } {
    return { avg: CLOTH_BUDGET.avg, max: CLOTH_BUDGET.max };
  }

  get stats(): ClothStats {
    return {
      verts: this.nVerts,
      ms: this.msAvg,
      pen: this.pen,
      penMax: this.penMax,
      tint: this.tint,
      palette: this.palette.length,
      penBy: this.penBy,
    };
  }

  dispose(): void {
    for (const b of this.batches) {
      this.root.remove(b.mesh);
      b.mesh.geometry.dispose();
      const mat = b.mesh.material as THREE.MeshStandardMaterial;
      if (mat.map !== this.sleeveMap) mat.map?.dispose(); // texture riêng của từng nhân vật (TextureLoader ở mannequin.ts); dispose lặp lại vô hại
      mat.dispose();
    }
  }
}
