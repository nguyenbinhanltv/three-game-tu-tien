import * as THREE from 'three/webgpu';

import { markBloom } from '../../render/post';

/**
 * Kiến trúc riêng của Vấn Đỉnh Âm Dương Giới (TN-3, mỹ thuật), dựng bằng code, không asset ngoài, chỉ để nhìn (không va chạm):
 *  - **Đỉnh Vô Danh**: đỉnh đồng ba chân khổng lồ (thân bầu, hai quai, ba chân), vòng phù văn vàng quanh miệng;
 *  - **Ảnh Bia**: bia đá đen cao có mặt gương nhạt ngả lam, khung đồng, đặt ở ba điểm bia;
 *  - **Cổng Giới Trì**: hai trụ đồng cao, xà ngang, màn sáng mờ ngả hai sắc (lam ở phía Âm, vàng ở phía Dương), mở ra phó bản;
 *  - **Chuyển Diện Trận Đài**: vòng phù văn nằm trên mặt đất quanh hai bệ truyền tống (lam tây, vàng đông).
 * Tất cả dưới 20 draw call. Vị trí lấy từ dữ liệu level (poi, trận), nên đổi bố cục ở `gen-van_dinh.mjs` là tự theo.
 */

export interface VdSite {
  x: number;
  z: number;
}

export interface VdWondersInput {
  heightAt(x: number, z: number): number;
  dinh: VdSite;
  bia: readonly VdSite[];
  cong: VdSite;
  /** Hướng cổng nhìn ra (rad): về phía tâm bản đồ. */
  congYaw: number;
  chuyenAm: VdSite;
  chuyenDuong: VdSite;
}

const BRONZE = 0x8a6a3a;
const OBSIDIAN = 0x1c1a26;
const TEAL = 0x7fe0d4;
const GOLD = 0xffc060;

function bronzeMat(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: BRONZE, roughness: 0.46, metalness: 0.75 });
}
function glowMat(color: number, opacity: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  markBloom(m, 0.25);
  return m;
}

/** Đỉnh ba chân: thân bầu (lathe), miệng loe, hai quai, ba chân. Cao ~15 m ở tỉ lệ 1. */
function cauldronGeometry(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 0.92;
    prof.push(new THREE.Vector2(Math.max(0.05, Math.sin(a) * 4.6 * (1 + 0.1 * Math.sin(t * 9))), 5.2 - Math.cos(a) * 3.6));
  }
  prof.push(new THREE.Vector2(4.9, 8.9), new THREE.Vector2(5.3, 9.1), new THREE.Vector2(5.3, 9.5), new THREE.Vector2(4.5, 9.5));
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof, 28)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.CylinderGeometry(0.9, 0.55, 5.6, 8);
    leg.rotateZ(Math.sin(a) * 0.14);
    leg.rotateX(-Math.cos(a) * 0.14);
    leg.translate(Math.cos(a) * 3.0, 2.6, Math.sin(a) * 3.0);
    parts.push(leg);
  }
  for (const s of [-1, 1]) {
    const handle = new THREE.TorusGeometry(1.5, 0.3, 8, 18, Math.PI);
    handle.rotateZ(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    handle.translate(s * 5.4, 9.2, 0);
    parts.push(handle);
  }
  return mergeGeos(parts);
}

function mergeGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nrm.push(na.getX(i), na.getY(i), na.getZ(i));
    }
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}

/** Vòng phù văn nằm trên mặt đất (hai vành + vạch tia), mặt phẳng XZ, bán kính ngoài `r`. */
function groundRuneGeometry(r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ring = (ri: number, ro: number) => {
    const g = new THREE.RingGeometry(ri, ro, 48);
    g.rotateX(-Math.PI / 2);
    parts.push(g);
  };
  ring(r * 0.92, r);
  ring(r * 0.62, r * 0.66);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.PlaneGeometry(r * 0.06, r * 0.22);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -r * 0.77);
    g.rotateY((i / 12) * Math.PI * 2);
    parts.push(g);
  }
  return mergeGeos(parts);
}

/** Nửa hình tròn phẳng (mặt phẳng XZ) bán kính `r`: `side` −1 nửa tây, +1 nửa đông. */
function halfDiscGeometry(r: number, side: -1 | 1): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, 48, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Giới Trì Động Phủ (phó bản, mỹ thuật TN-3): hàng cột đồng bao quanh sân, vòng phù văn vàng giữa sàn và hai nửa đĩa sáng
 * (lam nhạt phía Âm ở tây, vàng nhạt phía Dương ở đông) gợi "hai mặt hư thực" của phòng. Dưới 8 draw call.
 */
export class VdDungeon {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(inp: { heightAt(x: number, z: number): number; center: VdSite }) {
    this.group.name = 'vd-dungeon';
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.disposables.push(o);
      return o;
    };
    const { x: cx, z: cz } = inp.center;
    const N = 14;
    const R = 74;
    const geo = own(new THREE.CylinderGeometry(1.5, 2.1, 24, 10));
    geo.translate(0, 12, 0);
    const pillars = new THREE.InstancedMesh(geo, own(bronzeMat()), N);
    pillars.name = 'vd-dungeon-pillars';
    const o = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R;
      o.position.set(x, inp.heightAt(x, z) - 0.5, z);
      o.updateMatrix();
      pillars.setMatrixAt(i, o.matrix);
    }
    pillars.instanceMatrix.needsUpdate = true;
    pillars.computeBoundingSphere();
    pillars.castShadow = true;
    const y = inp.heightAt(cx, cz) + 0.12;
    const rune = new THREE.Mesh(own(groundRuneGeometry(26)), own(glowMat(GOLD, 0.26)));
    rune.position.set(cx, y, cz);
    const west = new THREE.Mesh(own(halfDiscGeometry(26, -1)), own(glowMat(TEAL, 0.06)));
    west.position.set(cx, y - 0.02, cz);
    const east = new THREE.Mesh(own(halfDiscGeometry(26, 1)), own(glowMat(GOLD, 0.06)));
    east.position.set(cx, y - 0.02, cz);
    this.group.add(pillars, rune, west, east);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose?.();
  }
}

export class VdWonders {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(inp: VdWondersInput) {
    this.group.name = 'vd-wonders';
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.disposables.push(o);
      return o;
    };
    const place = (o: THREE.Object3D, s: VdSite, yaw = 0, sink = 0, scale = 1): void => {
      o.position.set(s.x, inp.heightAt(s.x, s.z) - sink, s.z);
      o.rotation.y = yaw;
      o.scale.setScalar(scale);
    };

    // Đỉnh Vô Danh (+ phù văn vàng quanh miệng đỉnh)
    const dinh = new THREE.Mesh(own(cauldronGeometry()), own(bronzeMat()));
    dinh.name = 'vd-dinh';
    place(dinh, inp.dinh, 0.4, 0.6, 1.5);
    dinh.castShadow = true;
    dinh.receiveShadow = true;
    const dinhRune = new THREE.Mesh(own(groundRuneGeometry(5.0)), own(glowMat(GOLD, 0.7)));
    dinhRune.name = 'vd-dinh-rune';
    dinhRune.position.set(0, 9.6, 0);
    dinh.add(dinhRune);
    const dinhBase = new THREE.Mesh(own(groundRuneGeometry(11)), own(glowMat(GOLD, 0.45)));
    dinhBase.name = 'vd-dinh-base';
    place(dinhBase, inp.dinh, 0, -0.15);
    this.group.add(dinh, dinhBase);

    // Ảnh Bia: phiến đá đen + mặt gương + khung đồng (3 cá thể mỗi loại)
    const slabGeo = own(new THREE.BoxGeometry(2.6, 8.4, 0.8));
    slabGeo.translate(0, 4.2, 0);
    const slab = new THREE.InstancedMesh(
      slabGeo,
      own(new THREE.MeshStandardNodeMaterial({ color: OBSIDIAN, roughness: 0.3, metalness: 0.55 })),
      inp.bia.length,
    );
    slab.name = 'vd-bia-slab';
    const mirrorGeo = own(new THREE.PlaneGeometry(1.9, 6.4));
    mirrorGeo.translate(0, 4.4, 0.42);
    const mirror = new THREE.InstancedMesh(
      mirrorGeo,
      own(
        new THREE.MeshStandardNodeMaterial({
          color: 0xaad0dc,
          roughness: 0.08,
          metalness: 0.9,
          emissive: new THREE.Color(0x2a5560),
          emissiveIntensity: 0.6,
        }),
      ),
      inp.bia.length,
    );
    mirror.name = 'vd-bia-mirror';
    const frameGeo = own(new THREE.BoxGeometry(3.0, 0.5, 1.0));
    frameGeo.translate(0, 8.5, 0);
    const frame = new THREE.InstancedMesh(frameGeo, own(bronzeMat()), inp.bia.length);
    frame.name = 'vd-bia-frame';
    const o = new THREE.Object3D();
    inp.bia.forEach((s, i) => {
      place(o, s, i * 1.9 + 0.3, 0.3, 1);
      o.updateMatrix();
      slab.setMatrixAt(i, o.matrix);
      mirror.setMatrixAt(i, o.matrix);
      frame.setMatrixAt(i, o.matrix);
    });
    for (const mesh of [slab, mirror, frame]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      this.group.add(mesh);
    }

    // Cổng Giới Trì: hai trụ đồng + xà + màn sáng hai sắc
    const gate = new THREE.Group();
    gate.name = 'vd-gate';
    place(gate, inp.cong, inp.congYaw, 0.4, 1);
    const pillarGeo = own(new THREE.CylinderGeometry(1.1, 1.5, 15, 10));
    pillarGeo.translate(0, 7.5, 0);
    const pillars = new THREE.InstancedMesh(pillarGeo, own(bronzeMat()), 2);
    pillars.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-6.2, 0, 0));
    pillars.setMatrixAt(1, new THREE.Matrix4().makeTranslation(6.2, 0, 0));
    pillars.instanceMatrix.needsUpdate = true;
    pillars.computeBoundingSphere();
    pillars.castShadow = true;
    const lintel = new THREE.Mesh(own(new THREE.BoxGeometry(15.5, 1.6, 2.2)), own(bronzeMat()));
    lintel.position.y = 15.4;
    lintel.castShadow = true;
    const veilMat = own(glowMat(TEAL, 0.22));
    const veil = new THREE.Mesh(own(new THREE.PlaneGeometry(11.4, 14.2)), veilMat);
    veil.position.y = 7.4;
    const veil2 = new THREE.Mesh(veil.geometry, own(glowMat(GOLD, 0.14)));
    veil2.position.set(0, 7.4, -0.5);
    gate.add(pillars, lintel, veil, veil2);
    this.group.add(gate);

    // Chuyển Diện Trận Đài: vòng phù văn trên mặt đất
    const am = new THREE.Mesh(own(groundRuneGeometry(9)), own(glowMat(TEAL, 0.55)));
    am.name = 'vd-chuyen-am';
    place(am, inp.chuyenAm, 0, -0.12);
    const duong = new THREE.Mesh(am.geometry, own(glowMat(GOLD, 0.55)));
    duong.name = 'vd-chuyen-duong';
    place(duong, inp.chuyenDuong, 0, -0.12);
    this.group.add(am, duong);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose?.();
  }
}
