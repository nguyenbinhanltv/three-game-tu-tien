import * as THREE from 'three/webgpu';
import { abs, atan, attribute, clamp, float, floor, fract, length, mix, sin, smoothstep, step, time, uniform, uv, vec3 } from 'three/tsl';

/**
 * Cổ trận khắc vào vách đá (MAP-2 Đoạn Mạch): tấm phẳng dán lên vách, vẽ bằng shader TSL (không texture): vòng ngoài, vòng giữa,
 * tám quẻ (ba hào, hào đứt hào liền theo hash từng quẻ), nhãn tâm và tia chéo; đỏ son ở viền, vàng ở lõi, nhịp sáng chậm.
 * Cộng sáng, không ghi độ sâu. Cường độ theo mood (`RUNE_INTENSITY`, đặt ở `tuneAtmosphere`): đêm rực, hoàng hôn rõ, ban ngày chỉ le lói.
 */
export const runeParams = { intensity: uniform(0.4) };

export const RUNE_INTENSITY: Record<string, number> = {
  dm_dawn: 0.6,
  dm_day: 0.35,
  dm_dusk: 0.9,
  dm_night: 1.5,
};

const band = (x: ReturnType<typeof float>, c: number, w: number) => float(1).sub(smoothstep(0, w, abs(x.sub(c))));

export function runeMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const phase = attribute('iPhase', 'float');
  const p = uv().sub(0.5);
  const d = length(p).mul(2);
  const a = atan(p.y, p.x)
    .div(Math.PI * 2)
    .add(0.5); // 0..1 quanh tâm
  const seg = floor(a.mul(8));
  const f = abs(fract(a.mul(8)).sub(0.5)).mul(2); // 0 giữa quẻ, 1 ở mép quẻ

  const rings = band(d, 0.94, 0.022)
    .add(band(d, 0.6, 0.016))
    .add(band(d, 0.28, 0.014).mul(0.9));
  const hash = (k: number) => fract(sin(seg.mul(12.9898).add(k * 78.233)).mul(43758.5453));
  const bar = (r: number, k: number) =>
    band(d, r, 0.026)
      .mul(step(f, 0.74))
      .mul(float(1).sub(step(0.5, hash(k)).mul(step(f, 0.16))));
  const trigram = bar(0.68, 1).add(bar(0.76, 2)).add(bar(0.84, 3));
  // Tia chéo bốn hướng trong vòng tâm, chấm giữa.
  const spokes = step(abs(abs(p.x).sub(abs(p.y))), 0.012)
    .mul(step(d, 0.26))
    .mul(0.8);
  const core = float(1).sub(smoothstep(0.05, 0.1, d));
  const shape = clamp(rings.add(trigram).add(spokes).add(core), 0, 1).mul(float(1).sub(smoothstep(0.94, 1, d)));

  const pulse = sin(time.mul(0.7).add(phase)).mul(0.5).add(0.5).mul(0.45).add(0.55);
  const rim = smoothstep(0.35, 0.95, d);
  const col = mix(vec3(1.0, 0.78, 0.32), vec3(1.0, 0.28, 0.1), rim);
  mat.colorNode = col.mul(shape).mul(pulse).mul(runeParams.intensity).mul(1.9);
  mat.opacityNode = clamp(shape.mul(pulse).mul(runeParams.intensity).mul(1.4), 0, 1);
  return mat;
}
