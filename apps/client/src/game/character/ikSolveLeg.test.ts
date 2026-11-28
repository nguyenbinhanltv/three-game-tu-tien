import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { refreshWorld, solveLeg } from './ikpose';

/** Chân thẳng đứng dài 0,5 + 0,5 (hông ở y = 1): thigh → calf → foot. */
function leg() {
  const root = new THREE.Group();
  const bone = (n: string, y: number) => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(0, y, 0);
    return b;
  };
  const up = bone('thigh', 1);
  const mid = bone('calf', -0.5);
  const foot = bone('foot', -0.5);
  root.add(up);
  up.add(mid);
  mid.add(foot);
  root.updateMatrixWorld(true);
  return { root, up, mid, foot };
}

function kneeZ(pole: THREE.Vector3, hint: THREE.Vector3 | undefined, targetY: number): number {
  const { root, up, mid, foot } = leg();
  refreshWorld(up);
  refreshWorld(mid);
  refreshWorld(foot);
  solveLeg(up, mid, foot, new THREE.Vector3(0, targetY, 0), pole, new THREE.Quaternion(), hint);
  root.updateMatrixWorld(true);
  return mid.getWorldPosition(new THREE.Vector3()).z;
}

describe('solveLeg: hướng gập gối khi chân gần duỗi thẳng', () => {
  const poles = [
    new THREE.Vector3(0, -0.5, 0.002),
    new THREE.Vector3(0, -0.5, -0.002),
    new THREE.Vector3(0.002, -0.5, 0),
    new THREE.Vector3(-0.002, -0.5, -0.001),
  ];
  it('không có hint: pole nhiễu quyết định hướng gập (gối có thể gập về sau)', () => {
    const zs = poles.map((p) => kneeZ(p, undefined, 0.05));
    expect(Math.min(...zs)).toBeLessThan(-0.01);
  });
  it('có hint phía trước: gối luôn gập về phía trước dù pole nhiễu ngược dấu', () => {
    for (const p of poles) expect(kneeZ(p, new THREE.Vector3(0, 0, 1), 0.05)).toBeGreaterThan(0.01);
  });
  it('knee đã gập rõ về phía hint thì hint không đổi kết quả; gập ngược hint thì giữ nguyên (không ép)', () => {
    const bentFwd = kneeZ(new THREE.Vector3(0, -0.5, 0.3), new THREE.Vector3(0, 0, 1), 0.2);
    const noHint = kneeZ(new THREE.Vector3(0, -0.5, 0.3), undefined, 0.2);
    expect(bentFwd).toBeCloseTo(noHint, 6);
    const bentBack = kneeZ(new THREE.Vector3(0, -0.5, -0.3), new THREE.Vector3(0, 0, 1), 0.2);
    expect(bentBack).toBeLessThan(-0.05);
  });
});
