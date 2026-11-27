// Đường cong chặn đỉnh mềm ở đầu ra âm thanh (`softLimiter` ở audio.ts nạp vào WaveShaper). Hàm thuần, tách riêng để test trong Node.

/** Dưới mức này (biên độ, ≈ −3 dBFS) tín hiệu đi qua NGUYÊN VẸN. */
export const LIMIT_KNEE = 0.7;
/** Nhận được tín hiệu tới biên độ này (≈ +12 dBFS) mà vẫn bo mềm; cao hơn nữa thì kẹp ở sát 1. */
export const LIMIT_RANGE = 4;
/**
 * Khoảng trống đầu ra: mọi thứ hạ 3 dB trước bộ chặn đỉnh (cân bằng giữa các bus giữ nguyên). Đo ở Diễn Võ Trường 28/11: một người ra chiêu,
 * đỉnh bus SFX của 9 lối tu nằm từ −1,6 đến +1,2 dBFS, tức gần như đòn nào cũng lọt vào vùng bị bo (trên −3 dBFS). Hạ 3 dB thì đỉnh còn
 * −4,6 đến −1,8 dBFS: phần lớn đi qua nguyên vẹn, bộ chặn đỉnh chỉ còn làm việc ở đòn to nhất.
 */
export const HEADROOM = 0.708;

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
