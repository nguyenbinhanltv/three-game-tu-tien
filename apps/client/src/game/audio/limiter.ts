// Đường cong chặn đỉnh mềm ở đầu ra âm thanh (`softLimiter` ở audio.ts nạp vào WaveShaper). Hàm thuần, tách riêng để test trong Node.

/** Dưới mức này (biên độ, ≈ −3 dBFS) tín hiệu đi qua NGUYÊN VẸN. */
export const LIMIT_KNEE = 0.7;
/** Nhận được tín hiệu tới biên độ này (≈ +12 dBFS) mà vẫn bo mềm; cao hơn nữa thì kẹp ở sát 1. */
export const LIMIT_RANGE = 4;

/**
 * |x| ≤ `LIMIT_KNEE` thì y = x (không đổi âm), trên đó bo dần tiệm cận 1 (độ dốc liên tục tại điểm gãy), nên đầu ra không bao giờ vượt 0 dBFS.
 */
export function limitCurve(x: number): number {
  const a = Math.abs(x);
  if (a <= LIMIT_KNEE) return x;
  const room = 1 - LIMIT_KNEE;
  return Math.sign(x) * (LIMIT_KNEE + room * Math.tanh((a - LIMIT_KNEE) / room));
}

/** Bảng `n` mẫu (lẻ, để 0 rơi đúng một mẫu) của đường cong trên đoạn [−`LIMIT_RANGE`, `LIMIT_RANGE`], cho `WaveShaperNode.curve`. */
export function limitTable(n = 8193): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = limitCurve(((i / (n - 1)) * 2 - 1) * LIMIT_RANGE);
  return curve;
}
