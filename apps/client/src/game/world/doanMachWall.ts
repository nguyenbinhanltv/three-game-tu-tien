import * as THREE from 'three/webgpu';
import { cameraPosition, float, mix, normalWorld, positionWorld, smoothstep, texture, vec2, vec3, vertexColor } from 'three/tsl';
import { getCloudNoise } from '../../render/noiseTex';
import { tkFbm } from './thienKhuyetSky';

/**
 * Vách vực Đoạn Mạch dạng bậc thang địa chất (POLISH-3): lớp "da" mesh phủ lên vách địa hình (cùng cách làm với `thienKhuyetWall.ts`).
 * Địa hình là heightmap nên vách chỉ là mặt dốc mịn như đồi; ở đây từ tâm bắn tia, dò bán kính vách theo từng độ cao rồi dựng lưới (tia × tầng) có:
 *   - tầng đá trầm tích dày ~16 m, mỗi tầng một mặt cắt THẲNG ĐỨNG ở mép rồi lùi vào thành bậc thềm (gờ nằm ngang rộng vài mét, nhô ra rồi gãy);
 *   - cột khối ~14 m: các khối kề nhau lệch nhau (nhiễu lượng tử theo nhóm tia), khe nứt dọc hẹp lõm sâu, vỡ mép;
 *   - màu đỉnh đỏ-nâu theo tầng (sa thạch) + AO ở khe và chân gờ; vật liệu triplanar (nhiễu thế giới) nên không có đường nối.
 * Chỉ để nhìn (không va chạm: vách thật vẫn là địa hình). Tất định.
 */

const CX = 1024;
const CZ = 1024;
const RAYS = 1000;
const LAYER = 16; // dày một tầng đá (m)
const LAYERS = 20;
const ROWS = LAYERS * 3 - 1; // mỗi tầng ba hàng: sát chân, giữa, sát đỉnh → mặt cắt đứng + thềm ngang ở chỗ chuyển tầng
const HEIGHT = LAYER * LAYERS; // cao da vách tính từ chân vách của từng tia
const GROUP = 5; // số tia chung một cột khối

function hash(i: number, s: number): number {
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Chân vách của một tia: bán kính và độ cao nơi mặt dốc bắt đầu (null nếu không có vách trong tầm). */
function wallFoot(groundAt: (x: number, z: number) => number, dx: number, dz: number): { r: number; y: number } | null {
  const h = (rr: number) => groundAt(CX + dx * rr, CZ + dz * rr);
  for (let r = 560; r < 1150; r += 5) if (h(r + 25) - h(r) > 34 && h(r + 60) - h(r) > 80) return { r, y: h(r) };
  return null;
}

function wallRadius(groundAt: (x: number, z: number) => number, dx: number, dz: number, r0: number, y: number): number | null {
  const h = (rr: number) => groundAt(CX + dx * rr, CZ + dz * rr);
  let r = r0;
  while (r < 1500 && h(r) < y) r += 3;
  if (r >= 1500) return null;
  let lo = r - 3;
  let hi = r;
  for (let k = 0; k < 5; k++) {
    const m = (lo + hi) / 2;
    if (h(m) < y) lo = m;
    else hi = m;
  }
  return hi;
}

function wallMaterial(): THREE.MeshStandardNodeMaterial {
  // fog: false như vách Thiên Khuyết: sương cảnh làm cả vách thành màn mờ; pha sương nhẹ theo khoảng cách
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
  const up = smoothstep(0.6, 0.92, normalWorld.y.add(a.sub(0.5).mul(0.3))); // mặt ngửa của thềm: cát/đất vàng nhạt
  const d = tri(1.3, 'a'); // hạt đá mịn (sắc nét khi nhìn gần)
  const rock = vertexColor().mul(float(0.66).add(a.mul(0.45)).add(b.mul(0.3)).add(c.mul(0.2)).add(d.sub(0.5).mul(0.35)));
  const ledgeTop = mix(rock, vec3(0.55, 0.36, 0.2).mul(float(0.7).add(b.mul(0.5))), up.mul(0.55));
  const dist = wp.sub(cameraPosition).length();
  m.colorNode = mix(ledgeTop, vec3(0.5, 0.33, 0.28), smoothstep(350, 1800, dist).mul(0.3));
  m.roughnessNode = float(0.74).add(b.mul(0.26));
  m.emissiveNode = vertexColor().mul(0.05);
  return m;
}

export class DoanMachWall {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(groundAt: (x: number, z: number) => number) {
    this.group.name = 'doanMachWall';
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const lo = new THREE.Color(0x4a2418);
    const mid = new THREE.Color(0x86472c);
    const hi = new THREE.Color(0xad6a42);
    const dark = new THREE.Color(0x24120d);
    const tmp = new THREE.Color();
    const stride = ROWS + 1;
    const rays: number[][] = [];
    const rawR: number[] = [];
    const offs: number[] = [];
    const ys: number[] = [];
    // chân vách từng tia, lọc trung vị 41 tia kề (chân vách lệch giữa hai tia kề → tấm da dựng chéo / khe nứt dọc, bậc trên đường chân trời) (tia lệch chân → dải da bị xô lệch độ cao thành tấm dựng chéo)
    const feet0: ({ r: number; y: number } | null)[] = [];
    for (let i = 0; i < RAYS; i++) feet0.push(wallFoot(groundAt, Math.cos((i / RAYS) * Math.PI * 2), Math.sin((i / RAYS) * Math.PI * 2)));
    const feet = feet0.map((f, i) => {
      if (!f) return null;
      const ys2: number[] = [];
      const rs2: number[] = [];
      for (let d = -20; d <= 20; d++) {
        const g = feet0[(((i + d) % RAYS) + RAYS) % RAYS];
        if (g) {
          ys2.push(g.y);
          rs2.push(g.r);
        }
      }
      ys2.sort((a, b) => a - b);
      rs2.sort((a, b) => a - b);
      return { r: Math.min(f.r, rs2[rs2.length >> 1]!), y: ys2[ys2.length >> 1]! };
    });
    for (let i = 0; i <= RAYS; i++) {
      const th = ((i % RAYS) / RAYS) * Math.PI * 2;
      const dx = Math.cos(th);
      const dz = Math.sin(th);
      const foot = feet[i % RAYS]!;
      const grp = Math.floor((i % RAYS) / GROUP); // cột khối: các tia cùng nhóm cùng độ nhô nền
      let rLast = foot?.r ?? 0;
      for (let j = 0; j <= ROWS; j++) {
        const lk = Math.floor(j / 3);
        const m = j % 3; // 0 sát chân tầng, 1 giữa, 2 sát đỉnh
        const dy = lk * LAYER + (m === 0 ? 0.4 : m === 1 ? LAYER * 0.5 : LAYER - 0.4);
        const t = dy / HEIGHT;
        const y = (foot?.y ?? 0) - 18 + dy; // da bắt đầu thấp hơn chân vách 18 m: không hở dải đất ở chân
        let r = foot ? wallRadius(groundAt, dx, dz, rLast, y) : null;
        const ok = !!foot && r !== null;
        if (ok) rLast = r!;
        else r = rLast;
        // mặt cắt thẳng đứng: độ nhô cố định trong tầng (theo cột khối), tầng kế lệch hẳn → thềm ngang rộng vài mét
        const layerOff = (hash(lk, 71) - 0.5) * 3 + (hash(lk * 7 + grp, 73) - 0.5) * 4;
        const chunk = (tkFbm(grp * 0.7 + 3, lk * 0.35, 1.7, 311, 2) - 0.5) * 5; // khối kề nhau lệch nhau
        const crackN = Math.abs(tkFbm(grp * 0.9 + 11, lk * 0.12, 5.5, 313, 2) - 0.5);
        const crack = Math.max(0, 1 - crackN * 30); // khe dọc hẹp lõm sâu (theo tầng, nên có đoạn đứt)
        const fine = (tkFbm(Math.cos(th) * 70, dy * 0.08, Math.sin(th) * 70, 317, 2) - 0.5) * (m === 1 ? 3.5 : 1.2);
        const lip = m === 2 ? 1.6 + hash(lk * 11 + grp, 79) * 2.4 : 0; // mép trên tầng nhô ra rồi gãy
        const proud = 3.5 + layerOff + chunk + fine - crack * 3 + lip;
        // da sát vách thật (vài mét); chỉ ở chân vách (< 110 m) lùi thêm tới 18 m trước đồi/ghềnh nhô che da, rồi tắt dần lên cao (thác/phù văn nằm trên vách)
        const lowK = Math.max(0, 1 - dy / 110);
        const off = Math.min(8, Math.max(0.8, proud)) + 18 * lowK * lowK;
        rawR.push(r!);
        offs.push(off);
        ys.push(y);
        const band = hash(lk, 91);
        tmp
          .copy(lo)
          .lerp(mid, 0.3 + band * 0.55)
          .lerp(hi, Math.min(0.45, t * 0.4) + (m === 2 ? 0.28 : 0));
        tmp.lerp(dark, Math.min(0.85, crack * 0.7 + (m === 0 ? 0.35 : 0) + Math.max(0, (4 - off) * 0.08)));
        tmp.multiplyScalar(0.8 + hash(lk * 13 + grp, 5) * 0.4);
        // đổi sắc theo tầng: xám nâu ↔ vàng đất; giảm bão hòa ~25%
        const hsl = { h: 0, s: 0, l: 0 };
        tmp.getHSL(hsl);
        const warm = hash(lk * 5 + 3, 97);
        tmp.setHSL(hsl.h + (warm - 0.5) * 0.04 + (warm > 0.7 ? 0.03 : 0), hsl.s * (warm < 0.3 ? 0.3 : 0.55), hsl.l * (0.92 + warm * 0.16));
        col.push(tmp.r, tmp.g, tmp.b);
        if (!ok) col.splice(col.length - 3, 3, 0, 0, 0);
      }
      rays.push([foot ? 1 : 0]);
    }
    // lọc trung vị bán kính theo tia lân cận (tia dò hụt/nhảy làm thủng lưới): thay giá trị lệch > 25 m so với trung vị 7 tia kề
    const med = rawR.slice();
    for (let i = 0; i <= RAYS; i++)
      for (let j = 0; j <= ROWS; j++) {
        const nb: number[] = [];
        for (let d = -3; d <= 3; d++) nb.push(rawR[((((i + d) % RAYS) + RAYS) % RAYS) * stride + j]!);
        nb.sort((p, q) => p - q);
        const m = nb[3]!;
        if (Math.abs(rawR[i * stride + j]! - m) > 25) med[i * stride + j] = m;
      }
    // Lớp da LIỀN KÍN (không bỏ ô nào): bán kính từng đỉnh = vách − độ nhô; rồi (1) đẩy đỉnh nào chìm dưới địa hình (đồi/ghềnh nhô trước vách) ra phía tâm cho tới khi nổi
    // trên mặt đất, (2) làm mịn bán kính theo các tia kề để không còn khe nứt/tấm rời, (3) đẩy lần nữa. Thay cho cách cũ (bỏ ô khi bán kính nhảy / chìm đất) vốn để lộ nền sau.
    const rad = new Float32Array((RAYS + 1) * stride);
    for (let k = 0; k < rad.length; k++) rad[k] = med[k]! - offs[k]!;
    const raise = () => {
      for (let i = 0; i <= RAYS; i++) {
        const th = ((i % RAYS) / RAYS) * Math.PI * 2;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        for (let j = 0; j <= ROWS; j++) {
          const k = i * stride + j;
          let r = rad[k]!;
          for (let n = 0; n < 40 && r > 300 && groundAt(CX + c * r, CZ + sn * r) > ys[k]! - 0.4; n++) r -= 3;
          rad[k] = r;
        }
      }
    };
    const smooth = (w: number) => {
      const src = rad.slice();
      for (let i = 0; i <= RAYS; i++)
        for (let j = 0; j <= ROWS; j++) {
          let sum = 0;
          for (let d = -w; d <= w; d++) sum += src[((((i + d) % RAYS) + RAYS) % RAYS) * stride + j]!;
          rad[i * stride + j] = sum / (2 * w + 1);
        }
      for (let j = 0; j <= ROWS; j++) rad[RAYS * stride + j] = rad[j]!; // tia cuối trùng tia đầu
    };
    // trung vị 41 tia kề: tia lệch > 10 m (dò trúng đồi thay vì vách) bị thay → hết khe nứt dọc / tấm rời
    {
      const src = rad.slice();
      for (let i = 0; i < RAYS; i++)
        for (let j = 0; j <= ROWS; j++) {
          const nb: number[] = [];
          for (let d = -20; d <= 20; d++) nb.push(src[((((i + d) % RAYS) + RAYS) % RAYS) * stride + j]!);
          nb.sort((p, q) => p - q);
          if (Math.abs(src[i * stride + j]! - nb[20]!) > 10) rad[i * stride + j] = nb[20]!;
        }
      for (let j = 0; j <= ROWS; j++) rad[RAYS * stride + j] = rad[j]!;
    }
    raise();
    smooth(2);
    raise();
    smooth(1);
    for (let i = 0; i <= RAYS; i++) {
      const th = ((i % RAYS) / RAYS) * Math.PI * 2;
      for (let j = 0; j <= ROWS; j++) {
        const k = i * stride + j;
        pos.push(CX + Math.cos(th) * rad[k]!, ys[k]!, CZ + Math.sin(th) * rad[k]!);
      }
    }
    for (let i = 0; i < RAYS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = wallMaterial();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'dm-wall-skin';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(g, mat);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
