import * as THREE from 'three/webgpu';
import { DUNGEON_EXIT, hash01, heightAt, KIEM_TRUNG, PORTAL_POS, SECT } from '@dtl/shared';
import { col, G, GeoBuilder, mat } from './geo';

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
  for (let z = 2080; z <= 2118; z += 12) for (const sx of [-1, 1]) out.push({ x: SECT.x + sx * 7.5, y: SECT.y + 1.95, z });
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
  for (let i = 0; i < 46; i++) {
    const a = hash01(i, 3, 4401) * Math.PI * 2;
    const r = 30 + hash01(i, 5, 4401) * 62;
    const x = ax + Math.cos(a) * r;
    const z = az + Math.sin(a) * r;
    // Chừa lối vào phía nam và khu giữa để đánh.
    if (Math.abs(x - ax) < 9 && z > az + 20) continue;
    const y = heightAt(x, z);
    const s = 0.7 + hash01(i, 7, 4401) * 1.9;
    const tilt = (hash01(i, 9, 4401) - 0.5) * 0.7;
    const yaw = hash01(i, 11, 4401) * 6;
    b.add(G.box, mat(x, y + 1.9 * s, z, tilt, yaw, tilt * 0.6, 0.34 * s, 4.2 * s, 0.07 * s), hash01(i, 13, 4401) > 0.5 ? C_OLD : C_STEEL);
    b.add(G.box, mat(x, y + 4.1 * s, z, tilt, yaw, tilt * 0.6, 1.0 * s, 0.16 * s, 0.2 * s), C_RUST);
  }
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
export function buildPortalDisc(x: number = PORTAL_POS.x, z: number = PORTAL_POS.z, color = 0x8fdcff): THREE.Mesh {
  const py = heightAt(x, z);
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.position.set(x, py + 3.6, z);
  m.scale.set(1, 1.25, 1);
  return m;
}
