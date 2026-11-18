import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';
import { DUNGEON_EXIT, heightAt, KIEM_TRUNG, PORTAL_POS, SECT } from '@dtl/shared';
import { col, G, GeoBuilder, mat } from '../core/geo';
import { heightAt as levelHeight } from '../../base/levelCtx';

const C_STONE = col(0xa9a59b);
const C_STONE_DARK = col(0x86827a);
const C_WALL = col(0xe9e3d3);
const C_RED = col(0x9a2e29);
const C_ROOF = col(0x2f5560);
const C_ROOF_DARK = col(0x254650);
const C_GOLD = col(0xcaa24c);
const C_WOOD = col(0x6b4a33);
const C_STEEL = col(0xc2ced6);
const C_BRONZE = col(0x8a6b3c);
const C_BLUE = col(0x27506e);
const C_LAMP = col(0xffe2a0);

const R2 = Math.SQRT2;

/** Mái dốc kiểu cổ phong: thân mái chóp cụt + diềm vàng + bốn đầu đao cong. */
function roof(b: GeoBuilder, x: number, y: number, z: number, w: number, d: number, h: number, peak = false): void {
  b.add(G.box, mat(x, y + 0.2, z, 0, 0, 0, w + 0.6, 0.4, d + 0.6), C_GOLD);
  if (peak) b.add(G.pyramid, mat(x, y + 0.4 + h / 2, z, 0, 0, 0, w / R2, h, d / R2), C_ROOF);
  else b.add(G.frustum4, mat(x, y + 0.4 + h / 2, z, 0, 0, 0, w / R2, h, d / R2), C_ROOF);
  // Đầu đao hất lên ở bốn góc.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(G.pyramid, mat(x + (sx * w) / 2, y + 0.9, z + (sz * d) / 2, sz * 0.5, 0, -sx * 0.5, 0.7, 2.2, 0.7), C_ROOF_DARK);
    }
  }
  if (!peak) {
    // Bờ nóc.
    b.add(G.box, mat(x, y + 0.4 + h + 0.25, z, 0, 0, 0, w * 0.44, 0.5, 0.6), C_ROOF_DARK);
    b.add(G.box, mat(x - w * 0.22, y + 0.4 + h + 0.7, z, 0, 0, 0.3, 0.5, 1.1, 0.5), C_GOLD);
    b.add(G.box, mat(x + w * 0.22, y + 0.4 + h + 0.7, z, 0, 0, -0.3, 0.5, 1.1, 0.5), C_GOLD);
  }
}

/** Vị trí bầu đèn của các đèn đá dọc lối vào tông môn (để vẽ quầng sáng giả). */
export const SECT_LANTERNS: readonly { x: number; y: number; z: number }[] = (() => {
  const out: { x: number; y: number; z: number }[] = [];
  for (let z = 2080; z <= 2118; z += 12) for (const sx of [-1, 1]) out.push({ x: SECT.x + sx * 7.5, y: SECT.y + 1.7, z });
  return out;
})();

function lantern(b: GeoBuilder, x: number, y: number, z: number): void {
  b.add(G.box, mat(x, y + 0.2, z, 0, 0, 0, 0.9, 0.4, 0.9), C_STONE_DARK);
  b.add(G.box, mat(x, y + 1.0, z, 0, 0, 0, 0.35, 1.3, 0.35), C_STONE);
  b.add(G.box, mat(x, y + 1.95, z, 0, 0, 0, 0.8, 0.7, 0.8), C_LAMP);
  b.add(G.pyramid, mat(x, y + 2.65, z, 0, 0, 0, 0.85, 0.7, 0.85), C_STONE_DARK);
}

function pavilion(b: GeoBuilder, x: number, y: number, z: number): void {
  b.add(G.cyl6, mat(x, y + 0.4, z, 0, 0, 0, 7.2, 0.8, 7.2), C_STONE);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    b.add(G.cyl8, mat(x + Math.cos(a) * 5.4, y + 3.3, z + Math.sin(a) * 5.4, 0, 0, 0, 0.36, 5, 0.36), C_RED);
  }
  b.add(G.cyl6, mat(x, y + 5.95, z, 0, 0, 0, 8.6, 0.3, 8.6), C_GOLD);
  b.add(G.frustum6, mat(x, y + 7.4, z, 0, 0, 0, 8.4, 2.6, 8.4), C_ROOF);
  b.add(G.cone6, mat(x, y + 9.6, z, 0, 0, 0, 3.0, 2.4, 3.0), C_ROOF_DARK);
  b.add(G.ico0, mat(x, y + 11.1, z, 0, 0, 0, 0.5), C_GOLD);
}

/**
 * Dựng các công trình tĩnh thành một lưới duy nhất.
 * `buildings = true`: dựng cả kiến trúc tông môn bằng code (dùng khi chưa/không tải được sect.glb từ Blender).
 */
export function buildSect(buildings = true): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const y = SECT.y;
  const cx = SECT.x;
  if (buildings) buildSectBuildings(b, y, cx);
  buildStaticRest(b, cx);
  return b.build();
}

function buildSectBuildings(b: GeoBuilder, y: number, cx: number): void {

  // --- Chính điện ---
  const hz = 2004;
  b.add(G.box, mat(cx, y + 0.6, hz, 0, 0, 0, 32, 1.2, 22), C_STONE);
  b.add(G.box, mat(cx, y + 0.2, hz + 12.2, 0, 0, 0, 12, 0.4, 2.6), C_STONE_DARK);
  b.add(G.box, mat(cx, y + 0.6, hz + 11.6, 0, 0, 0, 12, 0.4, 1.6), C_STONE_DARK);
  b.add(G.box, mat(cx, y + 4.6, hz - 1, 0, 0, 0, 24, 6.8, 13), C_WALL);
  b.add(G.box, mat(cx, y + 3.4, hz + 5.6, 0, 0, 0, 5.2, 4.4, 0.3), C_WOOD);
  b.add(G.box, mat(cx, y + 6.6, hz + 5.75, 0, 0, 0, 6, 1.3, 0.25), C_BLUE);
  for (const sx of [-1, 1]) {
    b.add(G.box, mat(cx + sx * 7.5, y + 4.4, hz + 5.6, 0, 0, 0, 3.2, 2.6, 0.2), C_WOOD);
  }
  for (let i = 0; i < 6; i++) {
    const px = cx - 13 + i * 5.2;
    b.add(G.cyl8, mat(px, y + 4.7, hz + 8.2, 0, 0, 0, 0.5, 7, 0.5), C_RED);
    b.add(G.cyl8, mat(px, y + 4.7, hz - 9.4, 0, 0, 0, 0.5, 7, 0.5), C_RED);
    b.add(G.box, mat(px, y + 1.4, hz + 8.2, 0, 0, 0, 1.1, 0.4, 1.1), C_STONE_DARK);
  }
  roof(b, cx, y + 8.2, hz, 35, 24, 4.2);
  b.add(G.box, mat(cx, y + 14.2, hz, 0, 0, 0, 15, 3.2, 8.5), C_WALL);
  roof(b, cx, y + 15.8, hz, 22, 14.5, 4.6, true);
  b.add(G.ico0, mat(cx, y + 21.4, hz, 0, 0, 0, 0.8), C_GOLD);

  // --- Đan phòng (trái) và Tàng Kiếm Các (phải) ---
  pavilion(b, 1996, y, 2052);
  // Lò đan.
  b.add(G.cyl8, mat(1996, y + 1.8, 2052, 0, 0, 0, 1.3, 2, 1.3), C_BRONZE);
  b.add(G.cone6, mat(1996, y + 3.3, 2052, 0, 0, 0, 1.5, 1.1, 1.5), C_BRONZE);
  b.add(G.ico0, mat(1996, y + 4.0, 2052, 0, 0, 0, 0.3), C_GOLD);
  pavilion(b, 2100, y, 2052);
  // Giá kiếm.
  b.add(G.box, mat(2100, y + 1.5, 2052, 0, 0, 0, 3.6, 0.2, 0.5), C_WOOD);
  b.add(G.box, mat(2098.4, y + 1.2, 2052, 0, 0, 0, 0.2, 1.4, 0.5), C_WOOD);
  b.add(G.box, mat(2101.6, y + 1.2, 2052, 0, 0, 0, 0.2, 1.4, 0.5), C_WOOD);
  for (let i = 0; i < 4; i++) b.add(G.box, mat(2098.9 + i * 0.75, y + 2.3, 2052, 0, 0, 0.12, 0.1, 1.9, 0.03), C_STEEL);

  // --- Kiếm đá khổng lồ cắm giữa sân: biểu tượng "Lạc Kiếm" ---
  const sz = 2066;
  b.add(G.cyl12, mat(cx, y + 0.5, sz, 0, 0, 0, 3.3, 1, 3.3), C_STONE_DARK);
  b.add(G.cyl12, mat(cx, y + 1.15, sz, 0, 0, 0, 2.5, 0.4, 2.5), C_STONE);
  b.add(G.box, mat(cx, y + 6.6, sz, 0, 0, 0.07, 1.5, 11, 0.36), C_STEEL);
  b.add(G.box, mat(cx + 0.02, y + 6.6, sz, 0, 0, 0.07, 0.3, 11, 0.5), col(0x9fb0bb));
  b.add(G.box, mat(cx - 0.42, y + 12.3, sz, 0, 0, 0.07, 4.2, 0.6, 0.8), C_GOLD);
  b.add(G.cyl8, mat(cx - 0.58, y + 14.0, sz, 0, 0, 0.07, 0.3, 2.9, 0.3), C_WOOD);
  b.add(G.ico0, mat(cx - 0.7, y + 15.7, sz, 0, 0, 0, 0.55), C_GOLD);

  // --- Cổng tam quan ---
  const gz = 2128;
  for (const sx of [-1, 1]) {
    b.add(G.box, mat(cx + sx * 8, y + 0.5, gz, 0, 0, 0, 2.6, 1, 2.6), C_STONE_DARK);
    b.add(G.cyl8, mat(cx + sx * 8, y + 5.6, gz, 0, 0, 0, 1.0, 10, 1.0), C_RED);
    b.add(G.cyl8, mat(cx + sx * 14.5, y + 3.8, gz, 0, 0, 0, 0.6, 7, 0.6), C_RED);
    roof(b, cx + sx * 12, y + 7.4, gz, 9, 3.4, 1.4);
  }
  b.add(G.box, mat(cx, y + 9.2, gz, 0, 0, 0, 19, 1.1, 1.3), C_RED);
  b.add(G.box, mat(cx, y + 7.6, gz, 0, 0, 0, 6.4, 1.8, 0.4), C_BLUE);
  b.add(G.box, mat(cx, y + 7.6, gz + 0.22, 0, 0, 0, 5.4, 1.0, 0.1), C_GOLD);
  roof(b, cx, y + 10.6, gz, 22, 4.6, 2.2);

  // --- Đèn đá dọc lối đi ---
  for (const l of SECT_LANTERNS) lantern(b, l.x, y, l.z);
  // Lối lát đá từ cổng tới chính điện.
  b.add(G.box, mat(cx, y + 0.04, 2073, 0, 0, 0, 9, 0.08, 110), col(0xcfc9ba));

  return;
}

function buildStaticRest(b: GeoBuilder, cx: number): void {
  // --- Bậc thang đá xuống núi phía ngoài cổng ---
  for (let i = 0; i < 26; i++) {
    const z = 2136 + i * 4.2;
    const gy = heightAt(cx, z);
    b.add(G.box, mat(cx, gy - 0.3, z, 0, 0, 0, 7.5, 1.4, 4.4), C_STONE);
  }

  // --- Cổng bí cảnh Kiếm Trủng ---
  const px = PORTAL_POS.x;
  const pz = PORTAL_POS.z;
  const py = heightAt(px, pz);
  b.add(G.cyl12, mat(px, py + 0.2, pz, 0, 0, 0, 7, 0.4, 7), C_STONE_DARK);
  for (const sx of [-1, 1]) {
    b.add(G.box, mat(px + sx * 3.4, py + 3.6, pz, 0, 0, 0, 1.2, 7, 1.2), C_STONE);
    b.add(G.pyramid, mat(px + sx * 3.4, py + 7.7, pz, 0, 0, 0, 1.1, 1.4, 1.1), C_STONE_DARK);
  }
  b.add(G.box, mat(px, py + 7.4, pz, 0, 0, 0, 9, 1, 1.4), C_STONE);
  // Bia đá khắc kiếm phía sau.
  b.add(G.box, mat(px, py + 4, pz - 8, 0, 0, 0, 5, 8, 2), C_STONE_DARK);
  b.add(G.box, mat(px, py + 4.5, pz - 6.9, 0, 0, 0, 0.5, 5.5, 0.2), C_STEEL);

  // --- Kiếm Trủng: cự kiếm giữa lòng chảo và rừng kiếm gãy cắm quanh ---
  const ax = KIEM_TRUNG.x;
  const az = KIEM_TRUNG.z;
  const ay = KIEM_TRUNG.y;
  const C_OLD = col(0x6f7780);
  const C_RUST = col(0x5a4a40);
  b.add(G.cyl12, mat(ax, ay + 0.5, az, 0, 0, 0, 4.6, 1, 4.6), C_STONE_DARK);
  b.add(G.box, mat(ax, ay + 10.5, az, 0, 0.5, -0.09, 2.6, 19, 0.6), C_OLD);
  b.add(G.box, mat(ax - 0.9, ay + 20.6, az, 0, 0.5, -0.09, 7.4, 1.0, 1.3), C_RUST);
  b.add(G.cyl8, mat(ax - 1.15, ay + 23.4, az, 0, 0.5, -0.09, 0.5, 4.8, 0.5), C_RUST);
  // Rừng kiếm gãy: từ P2-A4 là prop Tripo `prop_kiem_gay` (KIEM_GAY, game/propScatter.ts), không dựng ở đây.
  // Cổng ra.
  const ex = DUNGEON_EXIT.x;
  const ez = DUNGEON_EXIT.z;
  const ey = heightAt(ex, ez);
  for (const sx of [-1, 1]) {
    b.add(G.box, mat(ex + sx * 3.4, ey + 3.6, ez, 0, 0, 0, 1.2, 7, 1.2), C_STONE);
    b.add(G.pyramid, mat(ex + sx * 3.4, ey + 7.7, ez, 0, 0, 0, 1.1, 1.4, 1.1), C_STONE_DARK);
  }
  b.add(G.box, mat(ex, ey + 7.4, ez, 0, 0, 0, 9, 1, 1.4), C_STONE);
}

/** Mặt cổng phát sáng (lưới riêng để chạy hiệu ứng). */
export function buildPortalDisc(x: number = PORTAL_POS.x, z: number = PORTAL_POS.z, color = 0x8fdcff, flat = false): THREE.Mesh {
  const py = levelHeight(x, z);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  );
  if (flat) {
    // Vòng sáng nằm trên nền (hang): không dựng đứng như cổng ngoài trời.
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, py + 0.12, z);
    m.scale.set(1.5, 1.5, 1);
    return m;
  }
  m.position.set(x, py + 3.6, z);
  m.scale.set(1, 1.25, 1);
  return m;
}

/** Hạt giống xác định cho vân đá (không dùng Math.random: cùng một cổng luôn ra cùng một mặt). */
function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Cổng gương nguyệt (E3-M, vào Kính Nguyệt Cung): có khối nhìn rõ từ mọi hướng, không còn là mấy tấm mỏng.
 * Bệ và trụ đá trắng ngà (vân, khắc mây, đổ bóng AO nướng vào màu đỉnh), đế/đỉnh trụ + vòm torus bạc kim loại bắt sáng (vệt phản chiếu nướng),
 * hoa văn trăng + ngọc lam nhỏ dọc vòm, đèn lồng và dải lụa treo hai bên. Gộp một lưới (một draw call, dưới 4k tam giác), `fog: false`
 * để đọc được từ 60–100 m qua sương. Mặt gương là đĩa dày (lõi tối) + đĩa cổng ở phía trước dùng `moonMirrorTexture`.
 * Cùng hướng và tâm với `buildPortalDisc` (đĩa cổng nằm trước mặt gương, mở về +z).
 */
export function buildMoonGate(x: number, z: number): THREE.Mesh {
  const py = levelHeight(x, z);
  const L = new THREE.Vector3(0.45, 0.75, 0.5).normalize();
  const H = new THREE.Vector3(0.2, 0.5, 1).normalize();
  type Kind = 'stone' | 'metal' | 'glow';
  const paint = (g: THREE.BufferGeometry, color: number, kind: Kind = 'stone'): THREE.BufferGeometry => {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    const pos = n.attributes.position, nor = n.attributes.normal;
    const base = new THREE.Color(color);
    const arr = new Float32Array(pos.count * 3);
    const nv = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      nv.fromBufferAttribute(nor, i);
      const px = pos.getX(i), qy = pos.getY(i), pz = pos.getZ(i);
      let k = 1;
      if (kind !== 'glow') {
        const lam = Math.max(0, nv.dot(L));
        const ao = 0.72 + 0.28 * Math.min(1, qy / 3.2); // chân tối hơn (bóng đổ xuống nền)
        k = (0.5 + 0.5 * lam) * ao;
        if (kind === 'stone') k *= 0.92 + 0.16 * hash3(Math.round(px * 2.5), Math.round(qy * 2.5), Math.round(pz * 2.5)); // vân đá
        else k += Math.pow(Math.max(0, nv.dot(H)), 10) * 0.55; // vệt sáng kim loại
      }
      arr[i * 3] = Math.min(1, base.r * k);
      arr[i * 3 + 1] = Math.min(1, base.g * k);
      arr[i * 3 + 2] = Math.min(1, base.b * k);
    }
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    n.deleteAttribute('uv');
    return n;
  };
  const IVORY = 0xe6dcc6, IVORY_D = 0xc6bba3, SILVER = 0xc4d0e2, CARVE = 0x7d7562, MIRROR = 0x1d2e4e, JADE = 0x57e0e8, LANTERN = 0xffc274, SILK = 0xdce8ff;
  const box = (w: number, h: number, d: number, cx: number, cy: number, cz: number, col: number, kind: Kind = 'stone', rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    return paint(g.translate(cx, cy, cz), col, kind);
  };
  const parts: THREE.BufferGeometry[] = [
    // Bệ tam cấp đá trắng ngà
    box(13, 0.4, 5.6, 0, 0.2, 0, IVORY_D), box(11, 0.4, 4.4, 0, 0.6, 0, IVORY), box(9.2, 0.4, 3.2, 0, 1.0, 0, IVORY_D),
  ];
  for (const sx of [-1, 1]) {
    const cx = sx * 4.4;
    parts.push(box(1.9, 0.6, 1.9, cx, 1.5, 0, SILVER, 'metal'), box(1.3, 7.2, 1.3, cx, 5.4, 0, IVORY), box(1.7, 0.5, 1.7, cx, 9.2, 0, SILVER, 'metal'));
    parts.push(paint(new THREE.ConeGeometry(0.95, 1.2, 4).rotateY(Math.PI / 4).translate(cx, 10.05, 0), SILVER, 'metal'));
    // Đai bạc quanh thân trụ
    parts.push(box(1.45, 0.16, 1.45, cx, 3.0, 0, SILVER, 'metal'), box(1.45, 0.16, 1.45, cx, 7.6, 0, SILVER, 'metal'));
    // Khắc mây (cung xoắn) ở mặt trước trụ
    for (const cy of [4.2, 5.4, 6.6]) parts.push(paint(new THREE.TorusGeometry(0.22, 0.05, 4, 8, Math.PI * 1.5).rotateZ(sx * 0.7).translate(cx, cy, 0.68), CARVE));
    // Đèn lồng treo cạnh đỉnh trụ (phía ngoài), dải lụa buông từ chóp
    const lx = cx + sx * 1.15;
    parts.push(box(0.05, 1.1, 0.05, lx, 8.65, 0, SILVER, 'metal'), paint(new THREE.OctahedronGeometry(0.42).scale(1, 1.3, 1).translate(lx, 7.75, 0), LANTERN, 'glow'), box(0.34, 0.12, 0.34, lx, 8.25, 0, SILVER, 'metal'));
    for (let i = 0; i < 4; i++) parts.push(box(0.3, 1.0, 0.05, cx + sx * (0.95 + 0.14 * i), 8.7 - i * 0.55, 0.78, SILK, 'stone', sx * (0.1 + i * 0.07)));
  }
  // Vòm: torus bạc dày + vòng viền sáng trong lòng vòm
  const arch = new THREE.TorusGeometry(3.0, 0.55, 12, 36); arch.scale(1, 1.25, 1); arch.translate(0, 5.0, 0);
  const rim = new THREE.TorusGeometry(2.55, 0.12, 6, 36); rim.scale(1, 1.25, 1); rim.translate(0, 5.0, 0.28);
  parts.push(paint(arch, SILVER, 'metal'), paint(rim, 0xdff0ff, 'glow'));
  // Hoa văn trăng: bảy ngọc lam nhỏ dọc nửa trên vòm, chân đế bạc; ngọc lớn ở đỉnh
  for (let i = 0; i < 7; i++) {
    const t = Math.PI * (0.12 + (0.76 * i) / 6);
    const gx = Math.cos(t) * 3.0, gy = 5.0 + Math.sin(t) * 3.75;
    const r = i === 3 ? 0.26 : 0.15;
    parts.push(paint(new THREE.SphereGeometry(r, 6, 5).translate(gx, gy, 0.55), JADE, 'glow'), paint(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.08, 8).rotateX(Math.PI / 2).translate(gx, gy, 0.5), SILVER, 'metal'));
  }
  // Mặt gương: đĩa dày (trụ ngắn xoay hướng +z) có gờ bạc nổi
  const mir = new THREE.CylinderGeometry(2.55, 2.55, 0.5, 32).rotateX(Math.PI / 2); mir.scale(1, 1.25, 1); mir.translate(0, 5.0, 0);
  parts.push(paint(mir, MIRROR));
  const lip = new THREE.TorusGeometry(2.45, 0.18, 6, 32); lip.scale(1, 1.25, 1); lip.translate(0, 5.0, 0.27);
  parts.push(paint(lip, SILVER, 'metal'));
  const geo = mergeGeometries(parts)!;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.position.set(x, py, z);
  m.userData.op = 0.85;
  m.name = 'moon-gate';
  return m;
}

/**
 * Texture mặt gương nguyệt (vẽ bằng canvas, không tải asset): bầu trời lam mờ phản chiếu, vài dải mây, trăng khuyết, vòng ripple đồng tâm
 * và viền sáng kiểu fresnel (sáng dần về mép). Đủ tối để không lóa. Trả null khi không có DOM (test).
 */
export function moonMirrorTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(N * 0.45, N * 0.4, N * 0.05, N / 2, N / 2, N / 2);
  grad.addColorStop(0, '#6f9acb'); grad.addColorStop(0.6, '#3b5f93'); grad.addColorStop(0.88, '#2b4575'); grad.addColorStop(1, '#2b4575');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  // Mây phản chiếu
  g.filter = 'blur(10px)';
  g.fillStyle = 'rgba(225,238,255,0.35)';
  for (const [cx, cy, rx, ry] of [[90, 80, 60, 14], [160, 130, 70, 12], [100, 190, 50, 10], [180, 60, 36, 9]]) { g.beginPath(); g.ellipse(cx, cy, rx, ry, -0.2, 0, Math.PI * 2); g.fill(); }
  g.filter = 'none';
  // Trăng khuyết (vẽ riêng một lớp để cắt không xóa nền)
  const moon = document.createElement('canvas');
  moon.width = moon.height = N;
  const mg = moon.getContext('2d')!;
  mg.fillStyle = 'rgba(240,248,255,0.8)';
  mg.beginPath(); mg.arc(150, 100, 20, 0, Math.PI * 2); mg.fill();
  mg.globalCompositeOperation = 'destination-out';
  mg.beginPath(); mg.arc(158, 95, 18, 0, Math.PI * 2); mg.fill();
  g.drawImage(moon, 0, 0);
  // Ripple đồng tâm
  g.strokeStyle = 'rgba(200,225,255,0.25)'; g.lineWidth = 2;
  for (const r of [34, 62, 90]) { g.beginPath(); g.arc(N / 2, N / 2, r, 0, Math.PI * 2); g.stroke(); }
  // Viền fresnel
  const fr = g.createRadialGradient(N / 2, N / 2, N * 0.34, N / 2, N / 2, N / 2);
  fr.addColorStop(0, 'rgba(210,232,255,0)'); fr.addColorStop(0.85, 'rgba(210,232,255,0.45)'); fr.addColorStop(1, 'rgba(235,246,255,0.85)');
  g.fillStyle = fr; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.center.set(0.5, 0.5);
  return t;
}
