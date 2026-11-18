/**
 * Mọi tham số URL của client đọc ở đây (R-4a). Ngoài file này không ai được `new URLSearchParams(location.search)`:
 * thêm cờ mới thì thêm vào `FLAG_DOCS` + `readFlags` để cờ có kiểu, có mô tả, có phạm vi.
 *
 * Phạm vi: `user` = người chơi dùng được; `diag` = chẩn đoán hiệu năng, so ảnh; `test` = chỉ tài khoản thử (server kiểm lại);
 * `viewer` = trang xem asset/UI. Tham số riêng của trang xem (`file`, `id`, `voice`, `hit`, `pose`…) đọc bằng `urlParams()`.
 * Không có `location` (test node): mọi cờ về mặc định.
 */

export interface Flags {
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
  /** `?mood=dawn|day|night` đổi thời điểm trong ngày (không lưu). */
  mood: 'dawn' | 'day' | 'night' | null;
  /** `?fxq=low|medium|high` ép chất lượng hiệu ứng (chuỗi thô, nơi dùng kiểm lại). */
  fxq: string | null;
  /** `?chr=v2|v3` nhân vật nền tùy chọn; mặc định v1. */
  chr: 'v2' | 'v3' | null;
  /** `?hair=b` ép kiểu tóc v2. */
  hair: string | null;
  /** `?v3model=a|b` chọn bản Lạc Kiếm v3/v3b (mặc định v3b2; so ảnh). */
  v3Model: string | null;
  /** `?jog=<số>` ép tốc độ clip chạy v3 (chụp). */
  jog: number;
  /** `?v3pal=0` tắt bảng màu nhuộm v3. */
  v3Palette: boolean;
  /** `?ual=0` tắt clip UAL. */
  ual: boolean;
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
  /** `?bhart=0` tắt lớp mỹ thuật riêng Bắc Hoang (so ảnh, chương 5). */
  bhArt: boolean;
  /** `?bf=0` tắt bướm trang trí (so ảnh, đo). */
  butterflies: boolean;
  /** Các cờ sắp gỡ ở R-4b/R-4c (giữ hành vi cũ tới đó). */
  k6: boolean;
  fxTimeline: boolean;
  monFx: boolean;
  ngj: boolean;
}

/** Mô tả từng tham số, để người sau biết cờ nào còn sống. */
export const FLAG_DOCS: Readonly<Record<string, { scope: 'user' | 'diag' | 'test' | 'viewer'; doc: string }>> = {
  mute: { scope: 'user', doc: 'tắt tiếng (playtest luôn bật)' },
  auto: { scope: 'test', doc: 'tự đăng nhập bằng đạo hiệu thử' },
  dev: { scope: 'test', doc: 'hiện đăng nhập thử ngoài localhost' },
  debug: { scope: 'diag', doc: 'bảng F3 + dòng số đo ở bản build' },
  models: { scope: 'diag', doc: '=legacy: model khối (dự phòng)' },
  batch: { scope: 'diag', doc: '=0: tắt gộp draw call VFX' },
  vfxwarm: { scope: 'diag', doc: '=0: tắt biên dịch trước VFX' },
  mood: { scope: 'diag', doc: 'dawn|day|night' },
  fxq: { scope: 'diag', doc: 'low|medium|high' },
  chr: { scope: 'test', doc: 'v2|v3 nhân vật nền tùy chọn' },
  hair: { scope: 'test', doc: 'ép kiểu tóc' },
  v3model: { scope: 'test', doc: '=a bản Lạc Kiếm v3 cũ' },
  jog: { scope: 'test', doc: 'tốc độ clip chạy v3' },
  v3pal: { scope: 'test', doc: '=0 tắt nhuộm v3' },
  ual: { scope: 'test', doc: '=0 tắt clip UAL' },
  renderer: { scope: 'diag', doc: 'webgl2|webgpu|auto' },
  gputime: { scope: 'diag', doc: '=1 timestamp query (công cụ đo)' },
  slowmo: { scope: 'diag', doc: 'chậm hiển thị (dev)' },
  quiet: { scope: 'diag', doc: '=1 bỏ nháy trúng đòn (dev)' },
  night: { scope: 'diag', doc: '0|1 ép đêm/ngày cho nhạc' },
  music: { scope: 'diag', doc: 'id bài nhạc thử (dev)' },
  ambient: { scope: 'diag', doc: 'id âm môi trường thử (dev)' },
  cine: { scope: 'diag', doc: '=0 tắt cảnh mở đầu/boss (công cụ đo dùng)' },
  bhart: { scope: 'diag', doc: '=0 tắt mỹ thuật riêng Bắc Hoang' },
  bf: { scope: 'diag', doc: '=0 tắt bướm trang trí' },
  k6: { scope: 'diag', doc: '=0 tắt ba pha K-6 (sẽ gỡ R-4b)' },
  fxtl: { scope: 'diag', doc: '=0 tắt VFX timeline (sẽ gỡ R-4b)' },
  monfx: { scope: 'diag', doc: '=0 tắt VFX quái V5 (sẽ gỡ R-4b)' },
  ngj: { scope: 'diag', doc: '=0 HUD cũ (sẽ gỡ R-4c)' },
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
    auto: q.get('auto'),
    dev: q.has('dev'),
    debug: q.has('debug'),
    legacyModels: q.get('models') === 'legacy',
    batching: !off(q.get('batch')),
    vfxWarm: !off(q.get('vfxwarm')),
    mood: mood === 'dawn' || mood === 'day' || mood === 'night' ? mood : null,
    fxq: q.get('fxq'),
    chr: chr === 'v2' || chr === 'v3' ? chr : null,
    hair: q.get('hair'),
    v3Model: q.get('v3model'),
    jog: Number(q.get('jog')) || 0,
    v3Palette: !off(q.get('v3pal')),
    ual: !off(q.get('ual')),
    renderer: q.get('renderer'),
    gpuTime: q.get('gputime') === '1',
    slowmo: Math.min(1, Math.max(0.05, Number(q.get('slowmo')) || 1)),
    quiet: q.get('quiet') === '1',
    night: q.get('night'),
    music: q.get('music'),
    ambient: q.get('ambient'),
    bhArt: !off(q.get('bhart')),
    cinematics: !off(q.get('cine')),
    butterflies: !off(q.get('bf')),
    k6: !off(q.get('k6')),
    fxTimeline: !off(q.get('fxtl')),
    monFx: !off(q.get('monfx')),
    ngj: !off(q.get('ngj')),
  };
}

/** Cờ của lần nạp trang này (đọc một lần). */
export const FLAGS: Readonly<Flags> = readFlags(currentSearch());
