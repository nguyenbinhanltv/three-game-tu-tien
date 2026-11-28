import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createLabel, LABELS, releaseLabel } from './labelBatch';

/** `spread` là phần riêng của lô nhãn; nạp thẳng các instance (không cần canvas) và kiểm thứ tự đẩy. */
function run(items: { x: number; y: number; pri: number }[], focus?: number) {
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  cam.position.set(0, 0, 20);
  cam.updateMatrixWorld();
  const labels = items.map((it) => {
    const l = createLabel('x');
    l.priority = it.pri;
    return l;
  });
  const b = LABELS as unknown as { a: Float32Array; live: THREE.Object3D[]; spread(c: THREE.Camera, n: number, f: unknown): void; pushed: number };
  b.live = labels;
  items.forEach((it, k) => {
    b.a.set([it.x, it.y, 0, 3.6], k * 4);
  });
  b.spread(cam, items.length, focus === undefined ? null : labels[focus]);
  const ys = items.map((_, k) => b.a[k * 4 + 1]!);
  labels.forEach(releaseLabel);
  return ys;
}

describe('né chồng nhãn', () => {
  it('nhãn ưu tiên cao đứng yên, nhãn thấp bị đẩy lên', () => {
    const [npc, player] = run([
      { x: 0, y: 2, pri: 2 },
      { x: 0, y: 2, pri: 1 },
    ]);
    expect(npc).toBe(2);
    expect(player!).toBeGreaterThan(2.5);
  });
  it('mục tiêu thắng NPC', () => {
    const [npc, tgt] = run(
      [
        { x: 0, y: 2, pri: 2 },
        { x: 0, y: 2, pri: 1 },
      ],
      1,
    );
    expect(tgt).toBe(2);
    expect(npc!).toBeGreaterThan(2.5);
  });
  it('nhãn xa nhau không bị đụng tới', () => {
    expect(run([
      { x: -6, y: 2, pri: 1 },
      { x: 6, y: 2, pri: 1 },
    ])).toEqual([2, 2]);
  });
  it('chi phí: 96 nhãn dồn một cụm vẫn dưới 1 ms mỗi khung', () => {
    const items = Array.from({ length: 96 }, (_, k) => ({ x: (k % 8) * 0.4, y: 2 + (k % 5) * 0.1, pri: 1 + (k % 3) }));
    run(items);
    const t0 = performance.now();
    for (let r = 0; r < 50; r++) run(items);
    const ms = (performance.now() - t0) / 50;
    console.log(`spread 96 nhãn dồn cụm: ${ms.toFixed(3)} ms/khung (gồm tạo/giải phóng nhãn)`);
    expect(ms).toBeLessThan(1);
  });
});
