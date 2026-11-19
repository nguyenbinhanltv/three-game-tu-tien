// Thiên Y: bake texture vải bằng cách CHIẾU 4 ảnh multiview (front/left/right/back, nền xám phẳng) lên atlas UV của lưới vải mới.
// Dùng: pnpm --filter @dtl/asset-pipeline exec tsx src/thienybake.ts --glb <chr_v3_x.glb> --views <thư mục>/<bo>_<nam|nu> --out <png> [--size 1024]
// Hình học lấy từ `fitThienY` (cùng mã với client), căn ảnh theo hộp bao hình bóng (cao theo chiều cao model, ngang theo tâm hộp bao).
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { fitThienY, THIEN_Y_ATLAS, THIEN_Y_SHEER, type ClothGrid, type V3 } from '@dtl/shared';

const args = process.argv.slice(2);
const opt = (k: string, d = '') => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const glbPath = opt('--glb');
const viewsBase = opt('--views');
const outPath = opt('--out');
const SIZE = Number(opt('--size', '1024'));
if (!glbPath || !viewsBase || !outPath) throw new Error('thiếu --glb / --views / --out');

type M4 = number[];
const inv = (m: M4): M4 => {
  // nghịch đảo tổng quát 4x4 (cofactor)
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
};
const tf = (m: M4, p: V3): V3 => [
  m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
  m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
  m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
];

const io = new NodeIO();
const doc = await io.read(glbPath);
const root = doc.getRoot();
const skin = root.listSkins()[0];
if (!skin) throw new Error('GLB không có skin');
const joints = skin.listJoints();
const ibmAcc = skin.getInverseBindMatrices();
if (!ibmAcc) throw new Error('thiếu inverseBindMatrices');
const ibm = ibmAcc.getArray()!;
// mesh gắn node nào: tìm node có mesh trùng tên
let bindWorld: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const skirtPts: number[] = [];
const sleeve = { l: [] as number[], r: [] as number[] };
// Hướng lai: màu panel lấy từ CHÍNH lưới Tripo (đỉnh voan gần nhất → UV → texture gốc), giữ màu và hoa văn.
const slvV: { p: V3; uv: [number, number] }[] = [];
let baseTex: { data: Buffer; w: number; h: number; ch: number } | null = null;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = -1e9;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const nm = mesh.getName() + ' ' + node.getName();
  bindWorld = Array.from(node.getWorldMatrix()) as M4;
  for (const prim of mesh.listPrimitives()) {
    const pa = prim.getAttribute('POSITION')!;
    const arr = pa.getArray()!;
    for (let i = 0; i < pa.getCount(); i++) {
      const x = arr[3 * i]!, y = arr[3 * i + 1]!, z = arr[3 * i + 2]!;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); maxY = Math.max(maxY, y);
      if (nm.includes('oldskirt')) skirtPts.push(x, y, z);
      else if (nm.includes('oldsleeve')) {
        sleeve[x >= 0 ? 'l' : 'r'].push(x, y, z);
        const ta = prim.getAttribute('TEXCOORD_0');
        if (ta) slvV.push({ p: [x, y, z], uv: [ta.getElement(i, [])[0]!, ta.getElement(i, [])[1]!] });
      }
    }
    if (nm.includes('oldsleeve') && !baseTex) {
      const img = prim.getMaterial()?.getBaseColorTexture()?.getImage();
      if (img) {
        const { data, info } = await sharp(Buffer.from(img)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        baseTex = { data, w: info.width, h: info.height, ch: info.channels };
      }
    }
  }
}
const bindInv = inv(bindWorld);
const jointByName = new Map<string, V3>();
joints.forEach((j, i) => {
  const ib = Array.from(ibm.subarray(16 * i, 16 * i + 16)) as M4;
  const w = inv(ib);
  jointByName.set(j.getName(), tf(bindInv, [w[12]!, w[13]!, w[14]!]));
});
const height = maxY;
const grids = fitThienY({ joint: (n) => jointByName.get(n) ?? [0, 0, 0], skirtPts, sleevePts: sleeve, height });
console.log(`[thienybake] ${grids.map((g) => `${g.id} ${g.nu}x${g.nv}`).join(', ')}; cao ${height.toFixed(3)} m`);

// ---- ảnh multiview: căn theo hộp bao hình bóng ----
interface View {
  data: Buffer;
  w: number;
  h: number;
  ch: number;
  scale: number;
  /** cột/hàng ảnh ứng với gốc toạ độ (x=0 hoặc z=zc, y=0). */
  c0: number;
  r0: number;
  /** hướng ngang ảnh theo trục model: +1 = trục tăng sang phải. */
  axis: 'x' | 'z';
  sign: 1 | -1;
  /** hướng từ bề mặt tới camera. */
  dir: V3;
}
async function loadView(name: string, axis: 'x' | 'z', sign: 1 | -1, dir: V3): Promise<View> {
  const file = `${viewsBase}_${name}.png`;
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  // nền = màu góc; hình = khác nền > 14
  const bg = [data[0]!, data[1]!, data[2]!];
  let top = h, bot = 0, left = w, right = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * ch;
      if (Math.abs(data[o]! - bg[0]!) + Math.abs(data[o + 1]! - bg[1]!) + Math.abs(data[o + 2]! - bg[2]!) > 30) {
        if (y < top) top = y;
        if (y > bot) bot = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  const scale = (bot - top) / height;
  const colMid = (left + right) / 2;
  const modelMid = axis === 'x' ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
  // cột = colMid + sign * (coord - modelMid) * scale → cột của gốc (coord = 0) = colMid - sign * modelMid * scale
  return { data, w, h, ch, scale, c0: colMid - sign * modelMid * scale, r0: bot, axis, sign, dir };
}
const views = await Promise.all([
  loadView('front', 'x', 1, [0, 0, 1]),
  loadView('back', 'x', -1, [0, 0, -1]),
  loadView('left', 'z', -1, [1, 0, 0]),
  loadView('right', 'z', 1, [-1, 0, 0]),
]);
console.log('[thienybake] ảnh: ' + views.map((v) => `${v.w}x${v.h} s=${v.scale.toFixed(1)}`).join(' | '));

const CELL = 0.02;
const cellKey = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
const hash = new Map<string, number[]>();
slvV.forEach((v, i) => {
  const k = cellKey(...v.p);
  (hash.get(k) ?? hash.set(k, []).get(k)!).push(i);
});
/** Đỉnh voan cũ gần p nhất (tìm theo vòng ô tăng dần); null nếu xa quá `maxR`. */
function nearestSleeve(p: V3, maxR: number): number | null {
  let best = -1, bd = maxR * maxR;
  const R = Math.ceil(maxR / CELL);
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), cz = Math.floor(p[2] / CELL);
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++) {
        const arr = hash.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!arr) continue;
        for (const i of arr) {
          const q = slvV[i]!.p;
          const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
  return best < 0 ? null : best;
}
function sampleTex(uv: [number, number]): [number, number, number] {
  const t = baseTex!;
  const x = Math.min(t.w - 1, Math.max(0, Math.floor((uv[0] % 1 + 1) % 1 * t.w)));
  const y = Math.min(t.h - 1, Math.max(0, Math.floor(uv[1] * t.h)));
  const o = (y * t.w + x) * t.ch;
  return [t.data[o]!, t.data[o + 1]!, t.data[o + 2]!];
}

function sample(v: View, p: V3): [number, number, number] {
  const coord = v.axis === 'x' ? p[0] : p[2];
  const fx = v.c0 + v.sign * coord * v.scale;
  const fy = v.r0 - p[1] * v.scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const px = (x: number, y: number, c: number) => v.data[(Math.min(v.h - 1, Math.max(0, y)) * v.w + Math.min(v.w - 1, Math.max(0, x))) * v.ch + c]!;
  const o: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = px(x0, y0, c) * (1 - tx) + px(x0 + 1, y0, c) * tx;
    const b = px(x0, y0 + 1, c) * (1 - tx) + px(x0 + 1, y0 + 1, c) * tx;
    o[c] = a * (1 - ty) + b * ty;
  }
  return o;
}

// ---- vị trí nghỉ + hướng ra ngoài mỗi đỉnh ----
function gridGeom(g: ClothGrid): { pos: Float32Array; nrm: Float32Array } {
  const nrm = new Float32Array(g.nu * g.nv * 3);
  for (let r = 0; r < g.nv; r++) {
    let cx = 0, cy = 0, cz = 0;
    for (let c = 0; c < g.nu; c++) {
      cx += g.rest[3 * (r * g.nu + c)]!;
      cy += g.rest[3 * (r * g.nu + c) + 1]!;
      cz += g.rest[3 * (r * g.nu + c) + 2]!;
    }
    cx /= g.nu; cy /= g.nu; cz /= g.nu;
    for (let c = 0; c < g.nu; c++) {
      const i = 3 * (r * g.nu + c);
      let dx = g.rest[i]! - cx, dy = g.rest[i + 1]! - cy, dz = g.rest[i + 2]! - cz;
      if (g.id.startsWith('skirt')) dy = 0; // hướng ngang
      const l = Math.hypot(dx, dy, dz) || 1;
      nrm[i] = dx / l; nrm[i + 1] = dy / l; nrm[i + 2] = dz / l;
    }
  }
  return { pos: g.rest, nrm };
}

const BG0 = [views[0]!.data[0]!, views[0]!.data[1]!, views[0]!.data[2]!];
const FROM_MESH = opt('--from-mesh', '1') !== '0';
const SLEEVE_SHIFT = Number(opt('--sleeve-shift', '0'));
const SLEEVE_DROP = Number(opt('--sleeve-drop', '0'));
const out = Buffer.alloc(SIZE * SIZE * 4, 255);
for (const g of grids) {
  const reg = THIEN_Y_ATLAS[g.id];
  if (!reg) continue;
  const { pos, nrm } = gridGeom(g);
  const x0 = Math.round(reg[0] * SIZE), y0 = Math.round(reg[1] * SIZE), x1 = Math.round(reg[2] * SIZE), y1 = Math.round(reg[3] * SIZE);
  const cols = g.wrap ? g.nu : g.nu - 1;
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      const u = (tx - x0 + 0.5) / (x1 - x0), v = (ty - y0 + 0.5) / (y1 - y0);
      const fu = u * cols, fv = v * (g.nv - 1);
      const c0 = Math.min(Math.floor(fu), cols - 1), r0 = Math.min(Math.floor(fv), g.nv - 2);
      const c1 = (c0 + 1) % g.nu, r1 = r0 + 1;
      const su = fu - c0, sv = fv - r0;
      const at = (arr: Float32Array, r: number, c: number, k: number) => arr[3 * (r * g.nu + c) + k]!;
      const lerp2 = (arr: Float32Array, k: number) => (at(arr, r0, c0, k) * (1 - su) + at(arr, r0, c1, k) * su) * (1 - sv) + (at(arr, r1, c0, k) * (1 - su) + at(arr, r1, c1, k) * su) * sv;
      const p: V3 = [lerp2(pos, 0), lerp2(pos, 1), lerp2(pos, 2)];
      // Tay áo ôm sát cánh tay trong ảnh nên chiếu thẳng sẽ lấy da/hộ uyển: lấy mẫu lệch ra ngoài (theo trục ngang của ảnh trước/sau) để chạm voan.
      const ps: V3 = g.id.startsWith('sleeve') ? [p[0] + Math.sign(p[0] || 1) * SLEEVE_SHIFT * height, p[1] - SLEEVE_DROP * height * Math.max(0, v - 0.2), p[2]] : p;
      const n: V3 = [lerp2(nrm, 0), lerp2(nrm, 1), lerp2(nrm, 2)];
      const nl = Math.hypot(n[0], n[1], n[2]) || 1;
      let acc = [0, 0, 0], wsum = 0;
      let meshCol: [number, number, number] | null = null;
      if (FROM_MESH && g.id.startsWith('sleeve') && baseTex) {
        // lấy màu từ đỉnh voan Tripo gần nhất trong 12 cm (panel gần phẳng nên mở rộng dần); nếu không có thì dùng ảnh multiview
        const ni = nearestSleeve(p, 0.12);
        if (ni !== null) meshCol = sampleTex(slvV[ni]!.uv);
      }
      for (const vw of views) {
        const d = (n[0] * vw.dir[0] + n[1] * vw.dir[1] + n[2] * vw.dir[2]) / nl;
        if (d <= 0) continue;
        const w = d * d * d;
        const s = sample(vw, ps);
        acc[0]! += s[0] * w; acc[1]! += s[1] * w; acc[2]! += s[2] * w;
        wsum += w;
      }
      if (wsum < 1e-4) {
        // hướng ngang với mọi camera: dùng ảnh trước
        const s = sample(views[0]!, ps);
        acc = [s[0], s[1], s[2]];
        wsum = 1;
      }
      const o = (ty * SIZE + tx) * 4;
      if (meshCol) {
        // Ảnh multiview nét hơn (hoa văn, viền vàng) nhưng ở tay áo ôm sát tay nó lấy da/hộ uyển hoặc nền: những texel đó dùng màu từ lưới Tripo.
        const r = acc[0]! / wsum, gc = acc[1]! / wsum, bc = acc[2]! / wsum;
        const lum = 0.299 * r + 0.587 * gc + 0.114 * bc;
        const skin = r > gc + 4 && gc > bc - 2 && r - bc > 22 && r - bc < 95 && lum > 110;
        const dark = lum < 85;
        const bg = Math.abs(r - BG0[0]!) + Math.abs(gc - BG0[1]!) + Math.abs(bc - BG0[2]!) < 40;
        if (skin || dark || bg) acc = [meshCol[0] * wsum, meshCol[1] * wsum, meshCol[2] * wsum];
      }
      out[o] = acc[0]! / wsum;
      out[o + 1] = acc[1]! / wsum;
      out[o + 2] = acc[2]! / wsum;
      // alpha: lớp đặc 255; voan/tay áo trong suốt theo hệ số, mờ dần về mép dưới (v → 1) để mép tự do nhẹ như voan
      const sh = THIEN_Y_SHEER[g.id];
      out[o + 3] = sh === undefined ? 255 : Math.round(255 * sh * (1 - 0.65 * Math.max(0, (v - 0.75) / 0.25)));
    }
}
// Texel rơi ra ngoài hình bóng (màu nền xám) hoặc là da: thay bằng màu trung bình của voan cùng ô atlas.
const BG = [views[0]!.data[0]!, views[0]!.data[1]!, views[0]!.data[2]!];
for (const g of grids) {
  const reg = THIEN_Y_ATLAS[g.id];
  if (!reg) continue;
  const x0 = Math.round(reg[0] * SIZE), y0 = Math.round(reg[1] * SIZE), x1 = Math.round(reg[2] * SIZE), y1 = Math.round(reg[3] * SIZE);
  const isBad = (o: number) => Math.abs(out[o]! - BG[0]!) + Math.abs(out[o + 1]! - BG[1]!) + Math.abs(out[o + 2]! - BG[2]!) < 40;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      const o = (ty * SIZE + tx) * 4;
      if (!isBad(o)) { r += out[o]!; gg += out[o + 1]!; b += out[o + 2]!; n++; }
    }
  if (!n) continue;
  const mean = [r / n, gg / n, b / n];
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      const o = (ty * SIZE + tx) * 4;
      if (isBad(o)) { out[o] = mean[0]!; out[o + 1] = mean[1]!; out[o + 2] = mean[2]!; }
    }
}
fs.mkdirSync(outPath.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(outPath);
console.log(`[thienybake] ghi ${outPath} ${SIZE}x${SIZE}`);
