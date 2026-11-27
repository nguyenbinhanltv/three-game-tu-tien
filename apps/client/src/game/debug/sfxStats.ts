// Xưởng âm thanh của phòng thử (Diễn Võ Trường, V2d): thống kê từ nhật ký LỜI GỌI phát tiếng (`sfxProbe` ở game/audio/audio.ts).
// Nhật ký ghi cả lời gọi bị bỏ (tắt tiếng, quá nhỏ, bị giãn), nên đếm được mật độ tiếng kể cả khi chơi thử tắt tiếng. Hàm thuần.

export interface SfxRow {
  name: string;
  /** Âm lượng yêu cầu (0–1, đã nhân suy giảm theo khoảng cách). */
  vol: number;
  /** `performance.now()` lúc gọi. */
  at: number;
  /** Tiếng đặt lịch trễ (tiếng vung chờ tới sát khung trúng): số ms từ lúc gọi tới lúc tiếng vang lên. Bỏ trống = phát ngay. */
  delayMs?: number;
  /** `ok` đã phát; `mute` đang tắt tiếng; `quiet` âm lượng dưới ngưỡng nghe; `throttle` trùng tên trong 45 ms; `idle` âm thanh chưa mở khóa. */
  why: 'ok' | 'mute' | 'quiet' | 'throttle' | 'idle';
}

export interface SfxStats {
  /** Số lời gọi ĐÁNG phát (ok + mute + idle: tức sẽ ra tiếng nếu bật tiếng) trong `windowMs` gần nhất. */
  calls: number;
  /** Bị giãn vì trùng tên quá dày, và bị bỏ vì quá nhỏ. */
  throttled: number;
  quiet: number;
  /** Nhiều tiếng nhất rơi vào cùng một cửa sổ 100 ms, và tổng âm lượng yêu cầu lớn nhất của một cửa sổ như thế (ước lượng độ dồn, không phải dB). */
  burst: number;
  burstVol: number;
  /** Ba tên được gọi nhiều nhất trong cửa sổ. */
  top: { name: string; n: number }[];
}

export const SFX_BURST_MS = 100;

export function sfxStats(rows: readonly SfxRow[], now: number, windowMs = 2000): SfxStats {
  const recent = rows.filter((r) => now - r.at <= windowMs && r.at <= now);
  const heard = recent.filter((r) => r.why === 'ok' || r.why === 'mute' || r.why === 'idle');
  let burst = 0;
  let burstVol = 0;
  // Cửa sổ trượt bắt đầu ở từng lời gọi (nhật ký đã theo thứ tự thời gian).
  for (let i = 0; i < heard.length; i++) {
    let n = 0;
    let v = 0;
    for (let j = i; j < heard.length && heard[j]!.at - heard[i]!.at < SFX_BURST_MS; j++) {
      n++;
      v += heard[j]!.vol;
    }
    if (n > burst) burst = n;
    if (v > burstVol) burstVol = v;
  }
  const by = new Map<string, number>();
  for (const r of heard) by.set(r.name, (by.get(r.name) ?? 0) + 1);
  const top = [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, n]) => ({ name, n }));
  return {
    calls: heard.length,
    throttled: recent.filter((r) => r.why === 'throttle').length,
    quiet: recent.filter((r) => r.why === 'quiet').length,
    burst,
    burstVol: Math.round(burstVol * 100) / 100,
    top,
  };
}
