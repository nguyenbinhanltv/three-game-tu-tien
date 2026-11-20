import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  float,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import { getCloudNoise } from '../../render/noiseTex';
import { tkFbm } from './thienKhuyetSky';

/**
 * Vách núi bao quanh Thiên Khuyết (POLISH-1): lớp "da" mesh thật phủ lên vách địa hình (địa hình chỉ là heightmap dốc đứng, shader chỉ tô được màu).
 * Từ tâm bắn tia theo mọi hướng, dò độ cao vách `heightAt` để biết bán kính vách ở từng tầng, rồi dựng lưới (tia × tầng) lệch vào trong một khoảng
 * theo: tầng đá trầm tích (mỗi tầng một độ nhô, mép gãy), khối vỡ lệch cao thấp (nhiễu thấp tần), khe nứt dọc chữ V (lõm sâu tối), gờ nhô. Màu đỉnh theo tầng + AO ở khe;
 * vật liệu triplanar (nhiễu thế giới đổi màu/độ nhám, rêu mặt ngửa) nên không có đường nối. Thêm cây bám gờ (InstancedMesh) và vài dải thác mảnh.
 * Chỉ để nhìn, không va chạm (vách thật vẫn là địa hình). Tất định.
 */

const CX = 1044;
const CZ = 884;
const RAYS = 960;
const ROWS = 44;
const Y0 = 92; // chân da vách: cao hơn gò trong đấu trường (~87 m), nếu thấp hơn dò tia dừng sớm và dựng tấm phẳng giữa sân
const Y1 = 430; // đỉnh vách (tia dò chạm cao nguyên trước thì hàng trên giữ bán kính hàng dưới, xem wallRadii)

function hash(i: number, s: number): number {
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bán kính vách theo từng tầng cho một tia (nhị phân trên đoạn dốc). */
function wallRadii(groundAt: (x: number, z: number) => number, dx: number, dz: number, ys: number[]): number[] {
  const out: number[] = [];
  let r = 640;
  const h = (rr: number) => groundAt(CX + dx * rr, CZ + dz * rr);
  while (r < 1800 && h(r) < ys[0]!) r += 6; // đi ra tới khi chạm tầng thấp nhất
  let last = r;
  for (const y of ys) {
    while (r < 1800 && h(r) < y) r += 3;
    if (r >= 1800) {
      out.push(-last); // cao nguyên thấp hơn y: không có vách ở độ cao này (bán kính âm = đánh dấu, dựng điểm này trùng hàng dưới → ô suy biến)
      continue;
    }
    // tinh chỉnh trong [r-3, r]
    let lo = r - 3;
    let hi = r;
    for (let k = 0; k < 5; k++) {
      const m = (lo + hi) / 2;
      if (h(m) < y) lo = m;
      else hi = m;
    }
    out.push(hi);
    last = hi;
  }
  return out;
}

function wallMaterial(): THREE.MeshStandardNodeMaterial {
  // fog: false — vách ở xa 500–800 m, sương cảnh làm cả vách thành màn hồng mờ; thay bằng pha sương nhẹ theo khoảng cách bên dưới
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide, fog: false });
  const noise = getCloudNoise();
  const wp = positionWorld;
  const w3 = normalWorld.abs().pow(4);
  const wn = w3.div(w3.x.add(w3.y).add(w3.z).max(1e-4));
  const smp = (u: Parameters<typeof texture>[1], ch: 'g' | 'a') => (ch === 'g' ? texture(noise, u).g : texture(noise, u).a);
  const tri = (sc: number, ch: 'g' | 'a') =>
    smp(vec2(wp.z, wp.y).mul(sc), ch)
      .mul(wn.x)
      .add(smp(vec2(wp.x, wp.z).mul(sc), ch).mul(wn.y))
      .add(smp(vec2(wp.x, wp.y).mul(sc), ch).mul(wn.z));
  const a = tri(0.012, 'g');
  const b = tri(0.09, 'a');
  const c = tri(0.4, 'g');
  const up = smoothstep(0.5, 0.9, normalWorld.y.add(a.sub(0.5).mul(0.3)));
  const rock = vertexColor().mul(float(0.7).add(a.mul(0.45)).add(b.mul(0.25)).add(c.mul(0.12)));
  const tint = mix(vec3(1.06, 0.98, 0.92), vec3(0.9, 0.94, 1.1), smoothstep(0.35, 0.65, tri(0.0045, 'g'))); // đổi sắc nhẹ ấm ↔ lạnh theo mảng lớn
  const base = mix(rock.mul(tint), vec3(0.2, 0.31, 0.12).mul(float(0.7).add(b.mul(0.6))), up.mul(0.6));
  const dist = wp.sub(cameraPosition).length();
  // xám tím: nhân lạnh để ánh nắng ấm không đẩy đá thành nâu đỏ; sương tím cố định theo khoảng cách
  // (không dùng skyParams.horizon: HDR sáng; cũng không pha xám bằng dot(): kết quả ra màu cát trên WebGPU, chưa rõ nguyên nhân)
  const cool = base.mul(vec3(0.82, 0.86, 1.12));
  m.colorNode = mix(cool, vec3(0.1, 0.085, 0.14), smoothstep(300, 1600, dist).mul(0.35));
  m.roughnessNode = float(0.72).add(b.mul(0.28));
  m.emissiveNode = vertexColor().mul(0.06);
  return m;
}

export class TkWall {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private fallTime: { value: number } | null = null;

  constructor(groundAt: (x: number, z: number) => number) {
    this.group.name = 'tkWall';
    const ys: number[] = [];
    for (let j = 0; j <= ROWS; j++) ys.push(Y0 + (Y1 - Y0) * (j / ROWS) ** 1.1);
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const lo = new THREE.Color(0x2b2733); // đá xám tím (palette Thiên Khuyết), vàng chỉ ở vỉa nhỏ
    const mid = new THREE.Color(0x4f4a5c);
    const hi = new THREE.Color(0x726a80);
    const dark = new THREE.Color(0x1d1a24);
    const tmp = new THREE.Color();
    const ledgeTop: { x: number; y: number; z: number; nx: number; nz: number }[] = [];
    const stride = ROWS + 1;
    for (let i = 0; i <= RAYS; i++) {
      const th = ((i % RAYS) / RAYS) * Math.PI * 2;
      const dx = Math.cos(th);
      const dz = Math.sin(th);
      const radii = wallRadii(groundAt, dx, dz, ys);
      let top = ROWS;
      while (top > 0 && radii[top]! < 0) top--;
      for (let j = 0; j <= ROWS; j++) {
        const jj = Math.min(j, top); // hàng trên cao nguyên: lặp hàng cuối có vách
        const y = ys[jj]!;
        const sd = 77;
        // lệch về phía tâm (đứng trước vách địa hình), luôn ≥ 1 m để không z-fight
        const layerK = Math.floor(y / 9.5);
        const layer = (hash(layerK, sd) - 0.5) * 2; // mỗi tầng một độ nhô
        const ledge = Math.pow((y / 9.5) % 1, 2.6); // mép trên tầng nhô, gãy ngang
        const col3 = th * 3.2;
        const chunk = tkFbm(Math.cos(th) * 7 + 3, y * 0.018, Math.sin(th) * 7, sd + 1, 3); // khối lệch cao thấp
        const crackN = Math.abs(tkFbm(col3 * 4 + 11, y * 0.004, 5.5, sd + 2, 2) - 0.5);
        const crack = Math.max(0, 1 - crackN * 40) * 0.8; // khe dọc V hẹp (không thành sọc rèm to)
        const fine = tkFbm(Math.cos(th) * 60, y * 0.08, Math.sin(th) * 60, sd + 3, 2);
        const proud = 4 + layer * 6 + ledge * 9 + chunk * 44 + fine * 5 - crack * 11;
        const off = Math.max(1, proud);
        const r = radii[jj]! - off;
        const px = CX + dx * r;
        const pz = CZ + dz * r;
        pos.push(px, y, pz);
        const band = hash(layerK, sd + 9);
        tmp
          .copy(lo)
          .lerp(mid, 0.25 + band * 0.6)
          .lerp(hi, Math.max(0, (y - 140) / 260) * 0.5 + (ledge > 0.8 ? 0.15 : 0));
        tmp.lerp(dark, Math.min(0.8, crack * 0.8 + Math.max(0, (6 - off) * 0.06)));
        tmp.multiplyScalar(0.85 + chunk * 0.5);
        col.push(tmp.r, tmp.g, tmp.b);
        if (j > 9 && j < ROWS && ledge < 0.12 && off > 9 && hash(i * 131 + j, 5) < 0.022)
          ledgeTop.push({ x: px, y, z: pz, nx: -dx, nz: -dz });
      }
    }
    const rad = (v: number) => Math.hypot(pos[v * 3]! - CX, pos[v * 3 + 2]! - CZ);
    for (let i = 0; i < RAYS; i++)
      for (let j = 0; j < ROWS; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        // bỏ ô nối hai tia mà bán kính nhảy > 40 m (tia dò hụt): đó là chỗ sinh các tấm phẳng dựng chéo
        if (Math.abs(rad(a) - rad(b)) > 40 || Math.abs(rad(a) - rad(a + 1)) > 40) continue;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // mặt vách quay vào tâm: đảo chiều nếu pháp tuyến hướng ra ngoài
    const mat = wallMaterial();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'tk-wall-skin';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(g, mat);

    // cây bám gờ vách: nón tối nhiều tầng, một InstancedMesh
    if (ledgeTop.length) {
      const tg = new THREE.ConeGeometry(2.2, 9, 6).toNonIndexed();
      tg.translate(0, 4.5, 0);
      const tm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
      tm.colorNode = vec3(0.12, 0.2, 0.11).mul(
        float(0.8).add(texture(getCloudNoise(), vec2(positionWorld.x, positionWorld.y).mul(0.07)).g.mul(0.5)),
      );
      const im = new THREE.InstancedMesh(tg, tm, ledgeTop.length);
      const d = new THREE.Object3D();
      ledgeTop.forEach((t, k) => {
        const s = 0.6 + hash(k, 41) * 0.9;
        d.position.set(t.x + t.nx * 1.2, t.y, t.z + t.nz * 1.2);
        d.rotation.set(0, hash(k, 43) * 6, 0);
        d.scale.set(s, s * (0.9 + hash(k, 47) * 0.7), s);
        d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.name = 'tk-wall-trees';
      this.group.add(im);
      this.disposables.push(tg, tm, im);
    }

    // thác mảnh: dải dọc từ gờ cao xuống chân vách, cuộn chậm, tan thành sương ở chân
    {
      const wg: number[] = [];
      const wu: number[] = [];
      const wi: number[] = [];
      let base = 0;
      for (let k = 0; k < 9; k++) {
        const i = Math.floor(hash(k, 91) * RAYS);
        const top = 20 + Math.floor(hash(k, 93) * 18);
        const dxk = Math.cos((i / RAYS) * Math.PI * 2);
        const dzk = Math.sin((i / RAYS) * Math.PI * 2);
        const tx = -dzk;
        const tz = dxk;
        const wdt = 1.3 + hash(k, 95) * 1.4;
        for (let j = top; j >= 0; j--) {
          const p0 = pos.slice((i * stride + j) * 3, (i * stride + j) * 3 + 3) as number[];
          const t = (top - j) / top;
          const w = wdt * (0.6 + 0.8 * t);
          const out = 0.6 + t * 0.8;
          wg.push(
            p0[0]! - dxk * -out + tx * w,
            p0[1]!,
            p0[2]! - dzk * -out + tz * w,
            p0[0]! - dxk * -out - tx * w,
            p0[1]!,
            p0[2]! - dzk * -out - tz * w,
          );
          wu.push(0, t * 3 + k, 1, t * 3 + k);
        }
        const n = top + 1;
        for (let q = 0; q < n - 1; q++) {
          const a = base + q * 2;
          wi.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
        base += n * 2;
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(wg, 3));
      fg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
      fg.setIndex(wi);
      const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const u = uv();
      const streak = texture(getCloudNoise(), vec2(u.x.mul(3.1).add(u.y.mul(0.2)), u.y.sub(time.mul(0.35)).mul(0.7))).a;
      fm.colorNode = vec3(0.92, 0.96, 1.0);
      fm.opacityNode = clamp(streak.mul(1.4).sub(0.15), 0, 1)
        .mul(0.6)
        .mul(smoothstep(0, 0.12, u.x.mul(float(1).sub(u.x)).mul(4)));
      const fmesh = new THREE.Mesh(fg, fm);
      fmesh.name = 'tk-wall-falls';
      fmesh.frustumCulled = false;
      fmesh.renderOrder = 2;
      this.group.add(fmesh);
      this.disposables.push(fg, fm);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    void this.fallTime;
  }
}
