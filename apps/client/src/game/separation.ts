/**
 * Tách thân mềm chỉ để hiển thị (P2-E2): quái không chồng lên nhau, không xuyên người chơi. Không đổi vị trí logic
 * (`v.x/v.z` do server quyết định); kết quả là độ lệch hiển thị cộng vào root, giống giật lùi của hit-stop.
 *
 * Mỗi thân là hình tròn. Cặp chồng nhau thì đẩy ra theo tỉ lệ nghịch khối lượng (khối lượng ~ r²); thân `fixed`
 * (người chơi, NPC) đứng yên và quái tự né. Lặp vài vòng cho đám đông; độ lệch bị chặn để không tách xa vị trí thật.
 */
export interface Body {
  /** Vị trí logic (m). */
  x: number;
  z: number;
  /** Bán kính (m). */
  r: number;
  /** Đứng yên (không bị đẩy). */
  fixed: boolean;
  /** Kết quả: độ lệch hiển thị. */
  ox: number;
  oz: number;
}

/** Độ lệch tối đa so với vị trí logic (m). */
export const SEP_MAX = 1.6;
/** Khe hở chừa giữa hai thân (m). */
const SEP_GAP = 0.05;

/** Giải tách cho `n` thân đầu của `bodies` (phần tử thừa bị bỏ qua). O(n²), n nhỏ (thân gần camera). */
export function solveSeparation(bodies: Body[], n = bodies.length, iterations = 3): void {
  for (let i = 0; i < n; i++) {
    bodies[i].ox = 0;
    bodies[i].oz = 0;
  }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (a.fixed && b.fixed) continue;
        let dx = b.x + b.ox - (a.x + a.ox);
        let dz = b.z + b.oz - (a.z + a.oz);
        const min = a.r + b.r + SEP_GAP;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Trùng hẳn: đẩy theo hướng tất định (theo chỉ số) để hai thân không dính nhau mãi.
          const ang = (i * 12.9898 + j * 78.233) % (Math.PI * 2);
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
        }
        const push = min - d;
        const ma = a.fixed ? Infinity : a.r * a.r;
        const mb = b.fixed ? Infinity : b.r * b.r;
        // Phần của a = mb / (ma + mb); thân đứng yên có khối lượng vô hạn nên phần của nó là 0.
        const wa = a.fixed ? 0 : b.fixed ? 1 : mb / (ma + mb);
        const wb = 1 - wa;
        const nx = dx / d;
        const nz = dz / d;
        a.ox -= nx * push * wa;
        a.oz -= nz * push * wa;
        b.ox += nx * push * wb;
        b.oz += nz * push * wb;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const len = Math.hypot(b.ox, b.oz);
    if (len > SEP_MAX) {
      b.ox *= SEP_MAX / len;
      b.oz *= SEP_MAX / len;
    }
  }
}
