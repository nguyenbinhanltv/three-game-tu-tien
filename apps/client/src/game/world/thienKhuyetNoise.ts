// Nhiễu và RNG tất định dùng chung cho Thiên Khuyết, Đoạn Mạch (module lá, không import ngược để tránh vòng).

// ---------- nhiễu tất định ----------

export function hash(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const sx = s(x - xi);
  const sy = s(y - yi);
  const sz = s(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

export function tkFbm(x: number, y: number, z: number, seed: number, oct = 3): number {
  let a = 0.5;
  let sum = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(x * f, y * f, z * f, seed + i * 17);
    a *= 0.5;
    f *= 2.1;
  }
  return sum / (1 - Math.pow(0.5, oct));
}

export function tkRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
