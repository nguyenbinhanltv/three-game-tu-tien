import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PATHS } from '@dtl/content';
import { snapshotBind } from './brawlerGear';
import { attachCoGear, CO_COLORS, COHU_WEAPON, fluteGeometry, fluteLength, fluteMesh, gourdGeometry } from './coGear';

function bone(name: string, x: number, y: number, parent?: THREE.Object3D): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, 0);
  parent?.add(b);
  return b;
}

/** Bộ xương tối giản có `spine_01` + một mesh da tham chiếu chung bộ xương. */
function rig(withSkin = true): THREE.Group {
  const g = new THREE.Group();
  const all: THREE.Bone[] = [];
  const pelvis = bone('pelvis', 0, 0.95, g);
  const s1 = bone('spine_01', 0, 0.1, pelvis);
  all.push(pelvis, s1);
  g.updateMatrixWorld(true);
  if (withSkin) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const sm = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    g.add(sm);
    sm.bind(new THREE.Skeleton(all));
  }
  return g;
}

describe('Cổ tu: hũ cổ + sáo cổ thủ tục', () => {
  it('hướng co_tu khai hũ cổ; các hướng khác không', () => {
    expect(PATHS.find((p) => p.id === 'co_tu')!.weapons).toContain(COHU_WEAPON);
    for (const p of PATHS.filter((p) => p.id !== 'co_tu')) expect(p.weapons).not.toContain(COHU_WEAPON);
  });

  it('sáo: ống trúc dài theo chiều cao, đủ màu đỉnh, tam giác trong ngân sách, một mesh dùng chung vật liệu', () => {
    const g = fluteGeometry(1.7);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.max.y).toBeGreaterThan(fluteLength(1.7) / 2);
    expect(bb.min.y).toBeLessThan(-fluteLength(1.7) / 2); // dây buộc phía đuôi
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(g.getAttribute('position').count / 3).toBeLessThan(1500);
    const tall = fluteGeometry(2.0);
    tall.computeBoundingBox();
    expect(tall.boundingBox!.max.y).toBeGreaterThan(bb.max.y);
    const a = fluteMesh(1.7);
    const b = fluteMesh(1.7);
    expect(a.mesh.material).toBe(b.mesh.material);
    expect(a.len).toBeGreaterThan(0);
    const set = new Set<number>();
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i += 3) set.add(Math.round(col.getX(i) * 255) * 1000 + Math.round(col.getY(i) * 255));
    expect(set.size).toBeGreaterThanOrEqual(4); // trúc, đốt, xương, lục, tối
  });

  it('hũ cổ: hồ lô (thân dưới rộng hơn thân trên), nằm dưới điểm treo, đủ màu da/mây/xương/lục', () => {
    const g = gourdGeometry(1.7);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.max.y).toBeGreaterThan(0);
    expect(bb.min.y).toBeLessThan(-0.15);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.1);
    expect(bb.max.x - bb.min.x).toBeLessThan(0.3);
    const colors = new Set<string>();
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) colors.add(`${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`);
    expect(colors.size).toBeGreaterThanOrEqual(5);
    expect(CO_COLORS.venom).toBeGreaterThan(0);
  });

  it('treo hũ vào xương hông bằng MỘT SkinnedMesh dùng chung bộ xương; ẩn/hiện, dọn sạch; thiếu xương hay mesh da thì bỏ', () => {
    const r = rig();
    const gear = attachCoGear(r, snapshotBind(r), 1.7);
    expect(gear.meshes).toHaveLength(1);
    const m = gear.meshes[0] as THREE.SkinnedMesh;
    const ref = r.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh && c !== m) as THREE.SkinnedMesh;
    expect(m.skeleton).toBe(ref.skeleton);
    const g = m.geometry;
    const n = g.getAttribute('position').count;
    const idx = new Set<number>();
    for (let i = 0; i < n; i++) idx.add(g.getAttribute('skinIndex').getX(i));
    expect([...idx].map((i) => ref.skeleton.bones[i]!.name)).toEqual(['spine_01']);
    gear.setVisible(false);
    expect(m.visible).toBe(false);
    gear.dispose();
    expect(r.getObjectByName('dtl_cohu')).toBeUndefined();
    const none = rig(false);
    expect(attachCoGear(none, snapshotBind(none), 1.7).meshes).toHaveLength(0);
    const empty = new THREE.Group();
    expect(attachCoGear(empty, snapshotBind(empty), 1.7).meshes).toHaveLength(0);
  });
});
