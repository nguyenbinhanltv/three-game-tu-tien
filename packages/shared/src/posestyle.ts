// K-5: chọn pose theo công pháp ("ba ngôn ngữ động tác") và theo đòn trong chuỗi đánh thường.
// Chỉ là lớp hình ở client; không ảnh hưởng luật (thời gian chiêu vẫn lấy từ `skills.json`).

/** Giọng động tác: kiếm tu (nhanh, thẳng, xa), hộ pháp (nặng, thấp, gần), đan sư (tròn, mềm, tay áo), đao tu (Chân Cảnh C3c: nặng, rộng, hai tay cầm đao lớn), lôi tu (C3d: nhanh, gọn, tay trái triệu lôi lên cao, kiếm bổ từ trên xuống). */
export type PoseVoice = 'kt' | 'hp' | 'ds' | 'dt' | 'lt';
export const POSE_VOICES: readonly PoseVoice[] = ['kt', 'hp', 'ds', 'dt', 'lt'];

/**
 * Công pháp → giọng. Chưa chọn công pháp (hoặc id lạ) dùng giọng kiếm tu, cũng là bản gốc của mỗi pose.
 * VS-3: bảng lấy từ hướng tu (`paths.json` → `voice`); `@dtl/content` đăng ký lúc nạp bằng `registerMethodVoices`
 * (shared không đọc được dữ liệu content). Trước khi đăng ký thì bảng rỗng: mọi công pháp dùng giọng kiếm tu.
 */
const METHOD_VOICE: Record<string, PoseVoice> = {};

/** Đăng ký (thay toàn bộ) bảng công pháp → giọng. Gọi một lần lúc nạp `@dtl/content`. */
export function registerMethodVoices(table: Readonly<Record<string, PoseVoice>>): void {
  for (const k of Object.keys(METHOD_VOICE)) delete METHOD_VOICE[k];
  for (const [k, v] of Object.entries(table)) if ((POSE_VOICES as readonly string[]).includes(v)) METHOD_VOICE[k] = v;
}

/** Một công pháp đại diện cho giọng `v` (công pháp đầu tiên đăng ký với giọng đó); không có thì undefined. */
export function methodOfVoice(v: PoseVoice): string | undefined {
  return Object.keys(METHOD_VOICE).find((m) => METHOD_VOICE[m] === v);
}

/** Hậu tố id pose theo giọng (kiếm tu là bản gốc, không hậu tố). */
export const VOICE_SUFFIX: Readonly<Record<PoseVoice, string>> = { kt: '', hp: '_hp', ds: '_ds', dt: '_dt', lt: '_lt' };

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
  for (const v of voices) for (let i = 0; i < comboHits; i++) out.push(poseIdFor(base, { combo: i, method: methodOfVoice(v) }));
  return out;
}
