import * as THREE from 'three/webgpu';
import { abs, clamp, dot, float, length, mix, normalize, normalView, positionView, sin, smoothstep, time, uv, vec3 } from 'three/tsl';
import { heightAt } from '../base/levelCtx';
import { beaconParams } from './atmosphere';
import { FX_MAX_HDR } from './materials/vfx';

/**
 * Cột linh quang (M-5): dấu hiệu "cơ duyên" nhìn thấy từ xa ở mỗi điểm đáng chú ý. Một `InstancedMesh` (một draw call
 * cho mọi cột), vỏ hình nón cụt hở hai đầu, shader TSL không có texture: sáng dưới chân và nhạt dần lên cao, mép mờ theo
 * góc nhìn (không lộ cạnh), dải sáng trôi lên chậm. Cộng sáng, không ghi độ sâu, bỏ sương (cột phải thấy xuyên sương).
 * Cường độ theo thời điểm trong ngày (`beaconParams`, atmosphere.ts): yếu ban ngày, rõ ban đêm. Đỉnh HDR giữ dưới
 * `BEACON_MAX_HDR`, không lóa.
 */
const BEACON_MAX_HDR = Math.min(2.2, FX_MAX_HDR);
const R_BOTTOM = 5.2;
const R_TOP = 2.6;
/** Quầng mềm quanh lõi: nón rộng gấp chừng này, mờ nhiều, để cột thấy được từ 150–300 m ban đêm. */
const HALO_SCALE = 3;
const SEGS = 18;
const RINGS = 8;

/**
 * Camera chéo (`?cam=iso`, nhìn xuống 52°): cột cao 30 m, chân rộng 10 m kéo thành vệt/quầng sáng phủ nửa màn hình. Hạ cột còn `ISO_BEACON_HEIGHT_MUL`, thu bán kính còn `ISO_BEACON_RADIUS_MUL` và cho phần trên
 * tắt sớm hơn (`ISO_BEACON_FADE_FROM` thay cho 0,55 của chiều cao) để vẫn thấy điểm cổng nhưng không che vùng chiến.
 */
export const ISO_BEACON_HEIGHT_MUL = 0.25;
export const ISO_BEACON_FADE_FROM = 0.2;
/** Iso: bán kính cột (chân 5,2 m → ≈ 2 m) và quầng mềm (gấp 3 → gấp 1,8 lần cột) thu nhỏ để chỉ còn trụ ngắn/vầng sáng quanh cổng, không phủ nửa màn hình. */
export const ISO_BEACON_RADIUS_MUL = 0.4;
export const ISO_HALO_SCALE = 1.8;

/** Chiều cao cột (m) thực dùng: iso thì hạ thấp. */
export function beaconHeight(h: number, iso: boolean): number {
  return iso ? h * ISO_BEACON_HEIGHT_MUL : h;
}

/** Hệ số bán kính cột (iso thu nhỏ). */
export function beaconRadiusMul(iso: boolean): number {
  return iso ? ISO_BEACON_RADIUS_MUL : 1;
}

/** Quầng mềm gấp chừng này lần cột. */
export function haloScale(iso: boolean): number {
  return iso ? ISO_HALO_SCALE : HALO_SCALE;
}

interface BeaconPoint {
  x: number;
  z: number;
  /** Cao cột (m). */
  h: number;
}

/** Vỏ nón cao 1, uv.x quanh trục, uv.y theo chiều cao; tỉ lệ y theo từng cột qua ma trận instance. */
function beaconGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS;
    const r = R_BOTTOM + (R_TOP - R_BOTTOM) * v;
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(c * r, v, s * r);
      nrm.push(c, 0, s);
      uvs.push(i / SEGS, v);
    }
  }
  for (let j = 0; j < RINGS; j++)
    for (let i = 0; i < SEGS; i++) {
      const a = j * (SEGS + 1) + i;
      const b = a + SEGS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function beaconMaterial(halo = false, iso = false): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const h = uv().y;
  const around = uv().x;
  // Sáng ở chân, tắt dần tới đỉnh; chân cột tắt nhẹ để không có mép cứng trên đất.
  const vertical = smoothstep(0, 0.06, h).mul(float(1).sub(smoothstep(iso ? ISO_BEACON_FADE_FROM : 0.55, 1, h)));
  // Dải sáng trôi lên chậm, lệch pha theo góc quanh trục.
  const flow = sin(
    h
      .mul(22)
      .sub(time.mul(1.1))
      .add(around.mul(Math.PI * 6)),
  )
    .mul(0.5)
    .add(0.5)
    .mul(0.4)
    .add(0.6);
  // Mép mờ: pháp tuyến vuông góc hướng nhìn thì trong suốt (mặt nghiêng về phía người nhìn thì đậm).
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const edge = facing.pow(halo ? 2.2 : 1.4);
  const dist = length(positionView);
  // Xa vẫn thấy (nhạt bớt); gần thì mờ hẳn đi (còn ~22%) để đứng cạnh hay trong cột không bị bức tường sáng che màn hình.
  const far = mix(float(1), float(0.6), smoothstep(300, 1100, dist));
  const near = mix(float(0.22), float(1), smoothstep(10, 120, dist));
  const k = beaconParams.intensity;
  mat.colorNode = vec3(0.45, 1, 0.86).mul(clamp(float(1).add(k.mul(halo ? 0.2 : 0.9)), 1, BEACON_MAX_HDR));
  mat.opacityNode = clamp(
    vertical
      .mul(flow)
      .mul(edge)
      .mul(k)
      .mul(halo ? 0.4 : 1.2)
      .mul(far)
      .mul(near),
    0,
    1,
  );
  // Không đánh dấu bloom: dải sáng mảnh, rất sáng ở xa làm bloom ra khối chữ nhật; cột tự có mép mờ.
  return mat;
}

export class Beacons {
  readonly mesh: THREE.InstancedMesh;
  private halo: THREE.InstancedMesh;

  constructor(points: readonly BeaconPoint[], iso = false) {
    this.mesh = new THREE.InstancedMesh(beaconGeometry(), beaconMaterial(false, iso), Math.max(1, points.length));
    this.mesh.name = 'beacons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = points.length;
    const m = new THREE.Matrix4();
    points.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.5, p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(beaconRadiusMul(iso), beaconHeight(p.h, iso), beaconRadiusMul(iso)),
      );
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    // Quầng mềm: cùng hình học, nón rộng hơn, con của lõi (hiện/ẩn theo lõi).
    this.halo = new THREE.InstancedMesh(this.mesh.geometry, beaconMaterial(true, iso), Math.max(1, points.length));
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 4;
    this.halo.count = points.length;
    points.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.5, p.z),
        new THREE.Quaternion(),
        new THREE.Vector3(beaconRadiusMul(iso) * haloScale(iso), beaconHeight(p.h, iso), beaconRadiusMul(iso) * haloScale(iso)),
      );
      this.halo.setMatrixAt(i, m);
    });
    this.halo.instanceMatrix.needsUpdate = true;
    this.mesh.add(this.halo);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.halo.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
