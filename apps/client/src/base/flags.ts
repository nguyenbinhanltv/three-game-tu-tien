/**
 * Mọi tham số URL của client đọc ở đây (R-4a). Ngoài file này không ai được `new URLSearchParams(location.search)`:
 * thêm cờ mới thì thêm vào `FLAG_DOCS` + `readFlags` để cờ có kiểu, có mô tả, có phạm vi.
 *
 * Phạm vi: `user` = người chơi dùng được; `diag` = chẩn đoán hiệu năng, so ảnh; `test` = chỉ tài khoản thử (server kiểm lại);
 * `viewer` = trang xem asset/UI. Tham số riêng của trang xem (`file`, `id`, `voice`, `hit`, `pose`…) đọc bằng `urlParams()`.
 * Không có `location` (test node): mọi cờ về mặc định.
 */

interface Flags {
  /** `?mute=1` tắt tiếng (playtest luôn dùng). */
  mute: boolean;
  /** `?auto=<đạo hiệu>` tự đăng nhập bằng tài khoản thử. */
  auto: string | null;
  /** `?dev` hiện đường đăng nhập thử ngoài localhost. */
  dev: boolean;
  /** `?debug` mở bảng F3 và dòng số đo ở bản build. */
  debug: boolean;
  /** `?models=legacy`: luôn dùng model khối (dự phòng khi nạp GLB lỗi). */
  legacyModels: boolean;
  /** `?batch=0` tắt gộp draw call VFX (chẩn đoán hiệu năng). */
  batching: boolean;
  /** `?vfxwarm=0` tắt biên dịch trước VFX (chẩn đoán). */
  vfxWarm: boolean;
  /** `?aura=0` tắt hào quang cảnh giới (so số đo trước/sau, RFX-1). */
  aura: boolean;
  /** `?mood=dawn|day|dusk|night` đổi thời điểm trong ngày (không lưu). */
  mood: 'dawn' | 'day' | 'dusk' | 'night' | null;
  /** `?fxq=low|medium|high` ép chất lượng hiệu ứng (chuỗi thô, nơi dùng kiểm lại). */
  fxq: string | null;
  /** `?chr=v1` quay về nhân vật cũ (N-7: mặc định là v3 Mannequin; `v1` giữ một bản làm dự phòng, `v3` = mặc định). */
  chr: 'v1' | 'v3' | null;
  /** `?v3model=a|b` chọn bản Lạc Kiếm v3/v3b (mặc định v3b2; so ảnh). */
  v3Model: string | null;
  /** `?jog=<số>` ép tốc độ clip chạy v3 (chụp). */
  jog: number;
  /** `?v3anim=0` về hệ animation cũ của v3 (so video trước/sau). */
  v3Anim: boolean;
  /** `?v3feet=0` tắt IK chân bám đất + bước chân xoay tại chỗ của v3 (so video trước/sau). */
  v3Feet: boolean;
  /** `?armfit=<độ>` ghi đè góc bù dang tay của v3 (null = mặc định theo model). */
  armFit: number | null;
  /** `?v3pal=0` tắt bảng màu nhuộm v3. */
  v3Palette: boolean;
  /** `?ual=0` tắt clip UAL. */
  ual: boolean;
  /** `?cloth=1` bật vải mô phỏng (Thiên Y) cho model v3 có mesh vải cũ tách riêng. */
  cloth: boolean;
  /** `?norobeanim` dùng clip UAL gốc thay clip áo bào cho model giữ gốc (so sánh). */
  noRobeAnim: boolean;
  /** `?v3side=front|double` ép mặt vẽ của vật liệu model giữ gốc Tripo (so sánh; mặc định theo cấu hình asset). */
  v3Side: string | null;
  /** `?v3veil=0` tắt xử lý voan alpha/sáng của model giữ gốc (đo chi phí A/B). */
  v3Veil: boolean;
  /** `?v3off=proc,feet,twist,cloth` tắt từng hệ phụ của v3 (chẩn đoán). */
  v3Off: string[];
  /** `?headlift=<rad>` góc ngửa đầu bù clip Idle cho model giữ gốc (mặc định 0,23). */
  headLift: number;
  /** `?renderer=webgl2|webgpu|auto` (xem `rendererChoice`). */
  renderer: string | null;
  /** `?gputime=1` bật timestamp query (chỉ công cụ đo). */
  gpuTime: boolean;
  /** `?slowmo=<0.05..1>` chậm thời gian hiển thị (chỉ dev). */
  slowmo: number;
  /** `?quiet=1` bỏ nháy trúng đòn khi quay VFX (chỉ dev). */
  quiet: boolean;
  /** `?night=0|1` ép đêm/ngày cho nhạc. */
  night: string | null;
  /** `?music=<id>` nghe thử bài (chỉ dev). */
  music: string | null;
  /** `?ambient=<id>` nghe thử âm môi trường (chỉ dev). */
  ambient: string | null;
  /** `?cine=0` tắt cảnh mở đầu và cảnh boss/chuyển pha (công cụ đo bench/crowd/load/compat dùng để camera đo không bị cảnh điện ảnh chiếm). */
  cinematics: boolean;
  /** `?xichart=0` tắt vết nứt/đèn nhấn riêng của Xích Tẫn Khích (so ảnh). */
  xichArt: boolean;
  /** `?bhart=0` tắt lớp mỹ thuật riêng Bắc Hoang (so ảnh, chương 5). */
  bhArt: boolean;
  /** `?tc=0` ẩn bộ prop "Thiên Công Khai Vật" (PROP-1; so ảnh trước/sau, đo hiệu năng). Chỉ ẩn hình, va chạm vẫn còn. */
  tcProps: boolean;
  /** `?bf=0` tắt bướm trang trí (so ảnh, đo). */
  butterflies: boolean;
  /** `?touch=1|0` ép bật/tắt chế độ cảm ứng (U2-6; kiểm thử, ghi đè cài đặt). */
  touch: boolean | null;
}

/** Mô tả từng tham số, để người sau biết cờ nào còn sống. */
export const FLAG_DOCS: Readonly<Record<string, { scope: 'user' | 'diag' | 'test' | 'viewer'; doc: string }>> = {
  touch: { scope: 'user', doc: '=1 ép chế độ cảm ứng, =0 ép tắt (mặc định theo thiết bị + Cài đặt)' },
  mute: { scope: 'user', doc: 'tắt tiếng (playtest luôn bật)' },
  auto: { scope: 'test', doc: 'tự đăng nhập bằng đạo hiệu thử' },
  dev: { scope: 'test', doc: 'hiện đăng nhập thử ngoài localhost' },
  debug: { scope: 'diag', doc: 'bảng F3 + dòng số đo ở bản build' },
  models: { scope: 'diag', doc: '=legacy: model khối (dự phòng)' },
  batch: { scope: 'diag', doc: '=0: tắt gộp draw call VFX' },
  vfxwarm: { scope: 'diag', doc: '=0: tắt biên dịch trước VFX' },
  aura: { scope: 'diag', doc: '=0: tắt hào quang cảnh giới trên nhân vật' },
  mood: { scope: 'diag', doc: 'dawn|day|dusk|night' },
  fxq: { scope: 'diag', doc: 'low|medium|high' },
  chr: { scope: 'user', doc: '=v1 quay về nhân vật cũ (dự phòng một bản sau N-7, model gốc không áo mô-đun); mặc định v3' },
  v3model: { scope: 'test', doc: '=a bản Lạc Kiếm v3 cũ' },
  jog: { scope: 'test', doc: 'tốc độ clip chạy v3' },
  v3anim: { scope: 'test', doc: '=0 hệ animation v3 cũ' },
  v3feet: { scope: 'test', doc: '=0 tắt IK chân bám đất + bước chân xoay tại chỗ của v3' },
  armfit: { scope: 'test', doc: 'góc bù dang tay v3 (độ)' },
  v3pal: { scope: 'test', doc: '=0 tắt nhuộm v3' },
  ual: { scope: 'test', doc: '=0 tắt clip UAL' },
  v3veil: { scope: 'test', doc: '0: tắt xử lý voan alpha/sáng của model giữ gốc (đo A/B chi phí)' },
  v3side: { scope: 'test', doc: 'front|double: ép mặt vẽ vật liệu model giữ gốc Tripo (so sánh voan một lớp)' },
  norobeanim: { scope: 'test', doc: 'có mặt: dùng clip UAL gốc thay clip áo bào (model giữ gốc Tripo)' },
  v3off: { scope: 'test', doc: 'proc,feet,twist,cloth: tắt từng hệ phụ của v3 (chẩn đoán)' },
  headlift: { scope: 'test', doc: 'góc ngửa đầu bù clip Idle cho model giữ gốc (rad, mặc định 0,23)' },
  cloth: { scope: 'test', doc: '=1 vải mô phỏng Thiên Y (model v3 có vải cũ tách riêng)' },
  renderer: { scope: 'diag', doc: 'webgl2|webgpu|auto' },
  gputime: { scope: 'diag', doc: '=1 timestamp query (công cụ đo)' },
  slowmo: { scope: 'diag', doc: 'chậm hiển thị (dev)' },
  quiet: { scope: 'diag', doc: '=1 bỏ nháy trúng đòn (dev)' },
  night: { scope: 'diag', doc: '0|1 ép đêm/ngày cho nhạc' },
  music: { scope: 'diag', doc: 'id bài nhạc thử (dev)' },
  ambient: { scope: 'diag', doc: 'id âm môi trường thử (dev)' },
  cine: { scope: 'diag', doc: '=0 tắt cảnh mở đầu/boss (công cụ đo dùng)' },
  xichart: { scope: 'diag', doc: '=0 tắt mỹ thuật riêng Xích Tẫn Khích' },
  bhart: { scope: 'diag', doc: '=0 tắt mỹ thuật riêng Bắc Hoang' },
  tc: { scope: 'diag', doc: '=0 ẩn bộ prop Thiên Công Khai Vật (PROP-1, so ảnh/đo)' },
  bf: { scope: 'diag', doc: '=0 tắt bướm trang trí' },
  god: { scope: 'test', doc: 'bất tử (server kiểm lại, xem testParams.ts)' },
  at: { scope: 'test', doc: 'vào ở điểm đặt tên hoặc x,z (testParams.ts)' },
  realm: { scope: 'test', doc: 'đặt cảnh giới lúc vào (testParams.ts)' },
  tribulation: { scope: 'test', doc: 'kích độ kiếp ngay (testParams.ts)' },
  show: { scope: 'viewer', doc: 'trang xem asset/boss/chiêu (testParams.ts)' },
  viewer: { scope: 'viewer', doc: 'asset|ui' },
  ui: { scope: 'viewer', doc: '=kit trang xem bộ giao diện Ngọc Giản' },
  sword: { scope: 'test', doc: 'ép model kiếm (testParams.ts)' },
  root: { scope: 'test', doc: 'linh căn mặc định ở màn tạo nhân vật' },
  dye: { scope: 'test', doc: 'màu áo mặc định ở màn tạo nhân vật' },
};

/** Chuỗi truy vấn hiện tại; rỗng khi không có `location` (test node). */
export function currentSearch(): string {
  return typeof location === 'undefined' ? '' : location.search;
}

/** Tham số URL hiện tại. Nơi DUY NHẤT trong client được dựng `URLSearchParams` từ `location`. */
export function urlParams(search: string = currentSearch()): URLSearchParams {
  return new URLSearchParams(search);
}

const off = (v: string | null): boolean => v === '0';

export function readFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const mood = q.get('mood');
  const chr = q.get('chr');
  return {
    mute: q.get('mute') === '1',
    touch: q.get('touch') === '1' ? true : q.get('touch') === '0' ? false : null,
    auto: q.get('auto'),
    dev: q.has('dev'),
    debug: q.has('debug'),
    legacyModels: q.get('models') === 'legacy',
    batching: !off(q.get('batch')),
    vfxWarm: !off(q.get('vfxwarm')),
    aura: !off(q.get('aura')),
    mood: mood === 'dawn' || mood === 'day' || mood === 'dusk' || mood === 'night' ? mood : null,
    fxq: q.get('fxq'),
    chr: chr === 'v1' || chr === 'v3' ? chr : null,
    v3Model: q.get('v3model'),
    jog: Number(q.get('jog')) || 0,
    v3Anim: !off(q.get('v3anim')),
    v3Feet: !off(q.get('v3feet')),
    armFit: q.get('armfit') === null || Number.isNaN(Number(q.get('armfit'))) ? null : Number(q.get('armfit')),
    v3Palette: !off(q.get('v3pal')),
    ual: !off(q.get('ual')),
    cloth: q.get('cloth') === '1',
    noRobeAnim: q.has('norobeanim'),
    v3Side: q.get('v3side'),
    v3Veil: !off(q.get('v3veil')),
    v3Off: (q.get('v3off') ?? '').split(',').filter(Boolean),
    headLift: Number.isFinite(Number(q.get('headlift') ?? NaN)) && q.get('headlift') !== null ? Number(q.get('headlift')) : 0.23,
    renderer: q.get('renderer'),
    gpuTime: q.get('gputime') === '1',
    slowmo: Math.min(1, Math.max(0.05, Number(q.get('slowmo')) || 1)),
    quiet: q.get('quiet') === '1',
    night: q.get('night'),
    music: q.get('music'),
    ambient: q.get('ambient'),
    bhArt: !off(q.get('bhart')),
    xichArt: !off(q.get('xichart')),
    cinematics: !off(q.get('cine')),
    tcProps: !off(q.get('tc')),
    butterflies: !off(q.get('bf')),
  };
}

/** Cờ của lần nạp trang này (đọc một lần). */
export const FLAGS: Readonly<Flags> = readFlags(currentSearch());
