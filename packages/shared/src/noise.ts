// Nhiễu gradient 2D tất định (chỉ dùng phép toán số nguyên + IEEE cơ bản,
// không dùng sin/cos) để server và mọi trình duyệt tính ra cùng một địa hình.

// 16 hướng gradient lệch 11,25° so với trục (không có hướng song song trục): gradient dọc trục làm nhiễu về 0 dọc
// các đường lưới nên sống núi (ridged) lộ vết cắt thẳng hình chữ nhật. Hằng số viết sẵn để mọi máy cùng kết quả.
const GX = [
  0.980785, 0.83147, 0.55557, 0.19509, -0.19509, -0.55557, -0.83147, -0.980785, -0.980785, -0.83147, -0.55557, -0.19509, 0.19509, 0.55557,
  0.83147, 0.980785,
];
const GZ = [
  0.19509, 0.55557, 0.83147, 0.980785, 0.980785, 0.83147, 0.55557, 0.19509, -0.19509, -0.55557, -0.83147, -0.980785, -0.980785, -0.83147,
  -0.55557, -0.19509,
];

export function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Số ngẫu nhiên tất định trong [0, 1) theo ô lưới + seed. */
export function hash01(ix: number, iz: number, seed: number): number {
  return hash2(ix, iz, seed) / 4294967296;
}

function grad(ix: number, iz: number, dx: number, dz: number, seed: number): number {
  const h = (hash2(ix, iz, seed) >>> 7) & 15;
  return (GX[h] ?? 0) * dx + (GZ[h] ?? 0) * dz;
}

/** Perlin 2D, giá trị xấp xỉ trong [-1, 1]. */
export function perlin2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const n00 = grad(x0, z0, fx, fz, seed);
  const n10 = grad(x0 + 1, z0, fx - 1, fz, seed);
  const n01 = grad(x0, z0 + 1, fx, fz - 1, seed);
  const n11 = grad(x0 + 1, z0 + 1, fx - 1, fz - 1, seed);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  // 1,22: bù độ dài gradient (bộ cũ có hướng chéo dài √2) để biên độ địa hình gần như cũ.
  return (a + (b - a) * v) * 1.22;
}

/** fBm, trả về xấp xỉ [-1, 1]. */
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin2(x * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Nhiễu sống núi (ridged), trả về [0, 1], đỉnh nhọn. */
export function ridged(x: number, z: number, octaves: number, seed: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(perlin2(x * freq, z * freq, seed + i * 31));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bộ sinh số ngẫu nhiên có seed (mulberry32) cho những chỗ cần chuỗi ngẫu nhiên lặp lại được. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
