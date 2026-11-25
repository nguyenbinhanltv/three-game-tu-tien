import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frustumOf, outsideFrustum } from './reflectCull';

describe('outsideFrustum', () => {
  // Camera ở (0, 20, 20) nhìn về gốc toạ độ, FOV 32° như camera chéo.
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400);
  cam.position.set(0, 20, 20);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const fr = frustumOf(cam);

  it('vật ở giữa khung nhìn thì không bị cắt', () => {
    expect(outsideFrustum(fr, 0, 0, 0, 1, 0)).toBe(false);
  });

  it('vật sau lưng camera hoặc rất xa bên sườn thì bị cắt', () => {
    expect(outsideFrustum(fr, 0, 20, 80, 1, 0)).toBe(true); // sau camera
    expect(outsideFrustum(fr, 200, 0, 0, 2, 0)).toBe(true); // xa bên sườn
  });

  it('margin nới vùng giữ lại: vật vừa ngoài mép khung được giữ khi có margin', () => {
    // dịch sang trái cho tới khi vừa ra ngoài khung (không margin), rồi thêm margin thì phải được giữ.
    let x = 0;
    while (!outsideFrustum(fr, x, 0, 0, 1, 0) && x < 200) x += 1;
    expect(x).toBeLessThan(200);
    expect(outsideFrustum(fr, x, 0, 0, 1, 0)).toBe(true);
    expect(outsideFrustum(fr, x, 0, 0, 1, 12)).toBe(false);
  });
});
