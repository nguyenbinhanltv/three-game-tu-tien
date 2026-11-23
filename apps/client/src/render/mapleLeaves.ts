import * as THREE from 'three/webgpu';
import { attribute, cos, float, mix, mod, positionLocal, sin, texture, time, uniform, uv, vec3 } from 'three/tsl';

/**
 * Lá phong bay (MAP-2 Đoạn Mạch): quầng lá thật (thẻ vẽ lá phong năm thùy, alpha test) rơi và xoáy theo gió quanh camera, một
 * `InstancedMesh` (một draw call). Toàn bộ chuyển động tính trên GPU từ `time`: mỗi lá có hạt giống riêng, vị trí cuộn vòng trong hộp
 * `BOX` bám theo camera nên số lượng cố định mà luôn có lá quanh người chơi; lá lật xoay quanh hai trục khi rơi. Độ sáng theo mood
 * (`leafParams.light`, đặt ở `tuneAtmosphere`): ban đêm tối đi để lá không phát sáng như đốm.
 */
export const leafParams = {
  /** Vị trí camera (m) và cao độ mặt đất ngay dưới camera: cập nhật mỗi khung bằng `MapleLeaves.update`. */
  cam: uniform(new THREE.Vector3()),
  groundY: uniform(0),
  light: uniform(1),
  /** Hệ số chiều cao hộp lá (1 = 26 m; camera chéo camera chéo: thấp, để lá không bay ngay trước ống kính camera cao 15 m và phóng to thành mảng đỏ). */
  heightK: uniform(1),
};

export const LEAF_LIGHT: Record<string, number> = {
  dm_dawn: 0.9,
  dm_day: 1,
  dm_dusk: 0.85,
  dm_night: 0.28,
};

/** Hộp cuộn vòng quanh camera (m): ngang và cao. */
const BOX = new THREE.Vector3(70, 26, 70);

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Texture một lá phong năm thùy (trắng, viền tối nhẹ, gân), nền trong suốt; màu lá nhuộm theo từng lá trong shader. */
function leafTexture(): THREE.CanvasTexture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('canvas 2d không khả dụng');
  ctx.translate(S / 2, S / 2 + 4);
  const R = S * 0.44;
  // Năm thùy: mũi nhọn xen khuyết, thêm hai thùy phụ nhỏ cho ra dáng lá phong.
  const pts: [number, number][] = [];
  const tips = 5;
  for (let i = 0; i < tips * 2; i++) {
    const a = (i * Math.PI) / tips - Math.PI / 2;
    const rr = i % 2 === 0 ? (i === 0 ? R : i === 4 || i === 6 ? R * 0.9 : R * 0.97) : R * 0.46;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,90,90,1)';
  ctx.stroke();
  // gân lá: trục giữa, hai nhánh bên mỗi thùy, cuống
  ctx.strokeStyle = 'rgba(120,120,120,1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < tips; i++) {
    const a = (i * 2 * Math.PI) / tips - Math.PI / 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
  }
  ctx.moveTo(0, 0);
  ctx.lineTo(0, R * 0.62);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const LEAF_COLORS = [new THREE.Color(0xc42a1a), new THREE.Color(0xd9441c), new THREE.Color(0xe0782a), new THREE.Color(0xe6b03c)];

export class MapleLeaves {
  readonly mesh: THREE.InstancedMesh;
  private tex: THREE.CanvasTexture;

  constructor(count = 360, seed = 20261121) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const rand = rng(seed);
    const seeds = new Float32Array(count * 4); // x,y,z ∈ [0,1): vị trí đầu trong hộp; w: pha riêng
    const prm = new Float32Array(count * 4); // x: cỡ lá, y: tốc độ rơi, z: tốc độ xoay, w: chỉ số màu
    for (let i = 0; i < count; i++) {
      seeds.set([rand(), rand(), rand(), rand() * 6.28], i * 4);
      prm.set([0.32 + rand() * 0.3, 0.9 + rand() * 1.3, 1.4 + rand() * 2.6, Math.floor(rand() * LEAF_COLORS.length)], i * 4);
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('iPrm', new THREE.InstancedBufferAttribute(prm, 4));
    this.tex = leafTexture();
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    const sd = attribute('iSeed', 'vec4');
    const pr = attribute('iPrm', 'vec4');
    const t = time;
    // Vị trí trong hộp: gió đẩy chéo (đông-nam), rơi xuống, lắc ngang; cuộn vòng bằng mod rồi đặt quanh camera.
    const wind = vec3(1.7, 0, 0.7);
    const raw = vec3(sd.x.mul(BOX.x), sd.y.mul(BOX.y), sd.z.mul(BOX.z))
      .add(wind.mul(t))
      .add(vec3(sin(t.mul(1.3).add(sd.w)).mul(1.4), pr.y.negate().mul(t), cos(t.mul(1.1).add(sd.w.mul(2))).mul(1.4)));
    const wrapped = vec3(
      mod(raw.x.sub(leafParams.cam.x), BOX.x),
      mod(raw.y, BOX.y).mul(leafParams.heightK),
      mod(raw.z.sub(leafParams.cam.z), BOX.z),
    );
    const center = vec3(
      leafParams.cam.x.add(wrapped.x).sub(BOX.x / 2),
      leafParams.groundY.add(wrapped.y).add(0.4),
      leafParams.cam.z.add(wrapped.z).sub(BOX.z / 2),
    );
    // Lật xoay: quay quanh trục Y rồi trục X theo thời gian.
    const a = t.mul(pr.z).add(sd.w);
    const b = t.mul(pr.z.mul(0.7)).add(sd.w.mul(3));
    const p0 = positionLocal.mul(pr.x);
    const ca = cos(a);
    const sa = sin(a);
    const cb = cos(b);
    const sb = sin(b);
    const p1 = vec3(p0.x.mul(ca).sub(p0.z.mul(sa)), p0.y, p0.x.mul(sa).add(p0.z.mul(ca)));
    const p2 = vec3(p1.x, p1.y.mul(cb).sub(p1.z.mul(sb)), p1.y.mul(sb).add(p1.z.mul(cb)));
    mat.positionNode = center.add(p2);
    const ci = pr.w;
    const base = mix(
      mix(
        vec3(LEAF_COLORS[0]!.r, LEAF_COLORS[0]!.g, LEAF_COLORS[0]!.b),
        vec3(LEAF_COLORS[1]!.r, LEAF_COLORS[1]!.g, LEAF_COLORS[1]!.b),
        ci.clamp(0, 1),
      ),
      mix(
        vec3(LEAF_COLORS[2]!.r, LEAF_COLORS[2]!.g, LEAF_COLORS[2]!.b),
        vec3(LEAF_COLORS[3]!.r, LEAF_COLORS[3]!.g, LEAF_COLORS[3]!.b),
        ci.sub(2).clamp(0, 1),
      ),
      ci.sub(1).clamp(0, 1),
    );
    const tx = texture(this.tex, uv());
    mat.colorNode = base
      .mul(tx.rgb.mul(0.5).add(0.5))
      .mul(leafParams.light)
      .mul(float(0.85).add(sin(a).mul(0.15)));
    mat.opacityNode = tx.a;
    mat.fog = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    // vị trí nằm trong shader: ma trận đơn vị
    const id = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.name = 'maple-leaves';
    this.mesh.frustumCulled = false;
  }

  /** Mỗi khung: đặt tâm hộp cuộn vòng ở camera và cao độ mặt đất bên dưới. */
  update(cam: THREE.Vector3, groundY: number, heightK = 1): void {
    leafParams.heightK.value = heightK;
    leafParams.cam.value.copy(cam);
    leafParams.groundY.value = groundY;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
    this.mesh.dispose();
  }
}
