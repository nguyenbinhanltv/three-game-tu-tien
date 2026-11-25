import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frustumOf, mirrorOutsideFrustum, outsideFrustum } from './reflectCull';

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

describe('mirrorOutsideFrustum (ảnh gương qua sàn)', () => {
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400);
  cam.position.set(0, 20, 20);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const fr = frustumOf(cam);
  const floorY = 0;

  it('vật cao NGOÀI khung nhìn nhưng ảnh gương nằm TRONG khung: không bị cắt', () => {
    // Tìm độ cao mà vật (x=0, z=-6) nằm ngoài mép trên màn hình nhưng ảnh gương (y âm) nằm trong khung.
    let found = -1;
    for (let y = 2; y <= 120; y += 1) {
      if (outsideFrustum(fr, 0, y, -6, 1, 0) && !outsideFrustum(fr, 0, -y, -6, 1, 0)) {
        found = y;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(mirrorOutsideFrustum(fr, 0, found, -6, 1, floorY, 0)).toBe(false);
    // phép thử cũ (vị trí thật) sẽ cắt nhầm vật này
    expect(outsideFrustum(fr, 0, found, -6, 1, 0)).toBe(true);
  });

  it('vật xa bên sườn (cả ảnh gương cũng ngoài khung) vẫn bị cắt; mặt sàn không phải y = 0 thì lật theo đúng độ cao sàn', () => {
    expect(mirrorOutsideFrustum(fr, 300, 3, 0, 2, floorY, 0)).toBe(true);
    // sàn ở y = 10: ảnh gương của điểm (y = 12) là y = 8; kiểm bằng so với outsideFrustum ở y = 8
    expect(mirrorOutsideFrustum(fr, 0, 12, 0, 1, 10, 0)).toBe(outsideFrustum(fr, 0, 8, 0, 1, 0));
  });
});
