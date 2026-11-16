import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { BATCH_CHUNK, FxBatcher } from './fxBatch';
import { BATCH_KINDS, FxPool } from './vfx';

const GEO_A = new THREE.IcosahedronGeometry(1, 1);
const GEO_B = new THREE.PlaneGeometry(1, 1);

describe('gộp draw call hiệu ứng (K-6)', () => {
  it('chỉ các kiểu tĩnh được gộp; sét, vệt, cột sáng giữ lưới riêng', () => {
    for (const k of ['glow', 'flat', 'solid', 'slash', 'ink', 'dome', 'inkpool'] as const) expect(BATCH_KINDS.has(k)).toBe(true);
    for (const k of ['bolt', 'vortex', 'trail', 'beam', 'shade', 'sigil'] as const) expect(BATCH_KINDS.has(k)).toBe(false);
  });

  it('pool ghi tay cầm của kiểu gộp và bỏ khi trả về', () => {
    const pool = new FxPool();
    const a = pool.acquire(GEO_A, 'glow', 0xffffff, 1);
    const t = pool.acquire(GEO_A, 'trail', 0xffffff, 1);
    expect(pool.batched.has(a)).toBe(true);
    expect(pool.batched.has(t)).toBe(false);
    pool.release(a);
    expect(pool.batched.size).toBe(0);
  });

  it('nhiều lưới cùng (kiểu, hình, renderOrder) chỉ một draw call; khác hình hoặc renderOrder thì tách', () => {
    const pool = new FxPool();
    const b = new FxBatcher(pool);
    for (let i = 0; i < 30; i++) pool.acquire(GEO_A, 'glow', 0x88ccff, 0.5).position.set(i, 0, 0);
    pool.acquire(GEO_B, 'glow', 0xffffff, 1);
    const ink = pool.acquire(GEO_B, 'ink', 0x101010, 1);
    ink.renderOrder = -1;
    b.flush();
    expect(b.stats()).toEqual({ draws: 3, handles: 32 });
    // Trả hết: không còn draw call nào.
    for (const h of [...pool.batched]) pool.release(h);
    b.flush();
    expect(b.stats().draws).toBe(0);
  });

  it('vượt BATCH_CHUNK thì thêm mảnh; số instance mỗi mảnh đúng', () => {
    const pool = new FxPool();
    const b = new FxBatcher(pool);
    for (let i = 0; i < BATCH_CHUNK + 5; i++) pool.acquire(GEO_A, 'glow', 0xffffff, 1);
    b.flush();
    const meshes = b.root.children as THREE.InstancedMesh[];
    expect(meshes.length).toBe(2);
    expect(meshes.map((m) => m.count).sort((x, y) => x - y)).toEqual([5, BATCH_CHUNK]);
  });

  it('ghi đúng màu, độ trong, fxA, fxK vào thuộc tính instance; lưới ẩn bị bỏ', () => {
    const pool = new FxPool();
    const b = new FxBatcher(pool);
    const h = pool.acquire(GEO_A, 'slash', 0xffffff, 0.7);
    h.fxA.set(0.1, 0.2, 0.3, 0.4);
    h.fxK = 0.6;
    h.position.set(1, 2, 3);
    const hidden = pool.acquire(GEO_A, 'slash', 0xffffff, 1);
    hidden.visible = false;
    b.flush();
    const mesh = b.root.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(1);
    const g = mesh.geometry;
    const get = (n: string) => Array.from((g.getAttribute(n) as THREE.BufferAttribute).array.slice(0, 4)).map((v) => +v.toFixed(3));
    expect(get('aFxC')[3]).toBeCloseTo(0.7);
    expect(get('aFxA')).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(get('aFxK')[0]).toBeCloseTo(0.6);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    // Mảnh nằm ở tâm instance (để sắp vật trong suốt theo độ sâu đúng); vị trí thế giới = vị trí mảnh + tịnh tiến instance.
    const world = new THREE.Vector3().setFromMatrixPosition(m).add(mesh.position);
    expect(world.toArray()).toEqual([1, 2, 3]);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('thứ tự vẽ trong suốt', () => {
  it('mảnh gộp nằm ở tâm các instance, không ở gốc tọa độ', () => {
    const pool = new FxPool();
    const b = new FxBatcher(pool);
    pool.acquire(GEO_A, 'glow', 0xffffff, 1).position.set(2040, 150, 2080);
    pool.acquire(GEO_A, 'glow', 0xffffff, 1).position.set(2050, 152, 2090);
    b.flush();
    const mesh = b.root.children[0] as THREE.InstancedMesh;
    expect(mesh.position.toArray()).toEqual([2045, 151, 2085]);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    expect(Math.abs(new THREE.Vector3().setFromMatrixPosition(m).x)).toBeLessThan(10);
  });
});
