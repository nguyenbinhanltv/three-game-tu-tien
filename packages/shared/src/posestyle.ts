// K-5: chọn pose theo công pháp ("ba ngôn ngữ động tác") và theo đòn trong chuỗi đánh thường.
// Chỉ là lớp hình ở client; không ảnh hưởng luật (thời gian chiêu vẫn lấy từ `skills.json`).

/** Giọng động tác: kiếm tu (nhanh, thẳng, xa), hộ pháp (nặng, thấp, gần), đan sư (tròn, mềm, tay áo). */
export type PoseVoice = 'kt' | 'hp' | 'ds';
export const POSE_VOICES: readonly PoseVoice[] = ['kt', 'hp', 'ds'];

/** Công pháp → giọng. Chưa chọn công pháp (hoặc id lạ) dùng giọng kiếm tu, cũng là bản gốc của mỗi pose. */
export const METHOD_VOICE: Readonly<Record<string, PoseVoice>> = {
  lac_kiem_quyet: 'kt',
  bat_dong_kim_than: 'hp',
  thanh_moc_dan_kinh: 'ds',
};

/** Hậu tố id pose theo giọng (kiếm tu là bản gốc, không hậu tố). */
export const VOICE_SUFFIX: Readonly<Record<PoseVoice, string>> = { kt: '', hp: '_hp', ds: '_ds' };

/** Pose gốc có đủ ba giọng: đòn thường (3 đòn) và Kiếm Khí Trảm. Các chiêu khác chỉ một giọng (của công pháp chiêu hoặc kiếm tu). */
export const VOICED_POSES: ReadonlySet<string> = new Set(['phi_kiem', 'kiem_khi_tram']);

export function voiceOf(method: string | undefined): PoseVoice {
  return (method && METHOD_VOICE[method]) || 'kt';
}

/**
 * Id pose của chiêu có pose gốc `base`: đòn thứ `combo` của chuỗi (`_2`, `_3`; đòn 1 là pose gốc) rồi hậu tố giọng
 * của công pháp `method` (chỉ pose có ba giọng). Chưa chắc id có tồn tại: nơi dùng phải rơi về `base` khi thiếu
 * (`content:check` bảo đảm đủ bộ cho chiêu có `combo`/giọng).
 */
export function poseIdFor(base: string, opts: { combo?: number; method?: string } = {}): string {
  let id = base;
  if (opts.combo !== undefined && opts.combo > 0) id += `_${opts.combo + 1}`;
  if (VOICED_POSES.has(base)) id += VOICE_SUFFIX[voiceOf(opts.method)];
  return id;
}

/** Mọi id pose mà chiêu có pose gốc `base` (và `combo` đòn) có thể chọn, để kiểm dữ liệu và nạp trước. */
export function poseIdsFor(base: string, comboHits = 1): string[] {
  const out: string[] = [];
  const voices = VOICED_POSES.has(base) ? POSE_VOICES : (['kt'] as const);
  for (const v of voices)
    for (let i = 0; i < comboHits; i++)
      out.push(poseIdFor(base, { combo: i, method: Object.keys(METHOD_VOICE).find((m) => METHOD_VOICE[m] === v) }));
  return out;
}
