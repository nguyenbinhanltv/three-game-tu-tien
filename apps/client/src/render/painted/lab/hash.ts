import { dot, fract, float, ivec3, uint, uvec3, vec4 } from 'three/tsl';
import type { N } from './field';

/**
 * Dựa trên painted-valley/src/lib/glsl.js (pcg3d, cellRand; MIT, © 2026 Patch). Bốn số ngẫu nhiên cho một ô của thế giới, giống nhau
 * mọi khung và mọi máy: số nguyên 32 bit, cùng hằng số của nguồn.
 */
export function pcg3d(v: N): N {
  let x: N = v.x.mul(uint(1664525)).add(uint(1013904223));
  let y: N = v.y.mul(uint(1664525)).add(uint(1013904223));
  let z: N = v.z.mul(uint(1664525)).add(uint(1013904223));
  x = x.add(y.mul(z));
  y = y.add(z.mul(x));
  z = z.add(x.mul(y));
  x = x.bitXor(x.shiftRight(uint(16)));
  y = y.bitXor(y.shiftRight(uint(16)));
  z = z.bitXor(z.shiftRight(uint(16)));
  x = x.add(y.mul(z));
  y = y.add(z.mul(x));
  z = z.add(x.mul(y));
  return uvec3(x, y, z);
}

/** Bốn số ngẫu nhiên (0..1) cho ô `cell` (vec2 float, giá trị nguyên) với muối `salt` (float). */
export function cellRand(cell: N, salt: N): N {
  const a: N = pcg3d(uvec3(ivec3(cell.x.toInt().add(65536), cell.y.toInt().add(65536), salt.toInt())));
  const b: N = pcg3d(uvec3(a.x.add(uint(7)), a.y.add(uint(7)), a.z.add(uint(7))));
  const eight = uint(8);
  return vec4(float(a.x.shiftRight(eight)), float(a.y.shiftRight(eight)), float(a.z.shiftRight(eight)), float(b.x.shiftRight(eight))).div(
    16777216,
  );
}

/** Băm 4 số từ một vec2 (số thực, dùng được ở mọi backend): hash42 của nguồn (glsl.js). */
export function hash42(p: N): N {
  const p4: N = fract(vec4(p.x, p.y, p.x, p.y).mul(vec4(0.1031, 0.103, 0.0973, 0.1099)));
  const s: N = p4.add(dot(p4, p4.wzxy.add(33.33)));
  return fract(s.xxyz.add(s.yzzw).mul(s.zywx));
}
