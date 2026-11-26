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
  /** `?vfxlab=1` (chỉ dev) phòng thử VFX: gắn `window.__vfxlab` (tạm dừng, chậm, bước đơn, đồng hồ ngân sách) cho `pnpm shots vfxlab`. */
  vfxLab: boolean;
  /** `?animlab=1` (chỉ dev) phòng thử animation Thân Pháp: gắn `window.__animlab`. */
  animLab: boolean;
  /** Lớp Thân Pháp (cường điệu góc chéo, nảy bước, pivot, clip Patch...) trên nhân vật v3; mặc định BẬT, `?thanphap=0` tắt. Lớp riêng Kiếm tu (idle, pose `_tp`, cut-in, lướt thấp) chỉ chạy với công pháp Kiếm tu. */
  thanPhap: boolean;
  /** `?ploop=0` (cùng `?thanphap=1`) giữ vòng chạy UAL thay vì clip Patch, để so trước/sau. */
  patchLoop: boolean;
  /** `?pstride=<k>` nhân độ dài chu kỳ chạy Patch (hiệu chỉnh trượt chân, mặc định 1). */
  pStride: number;
  /** `?vfxwarm=0` tắt biên dịch trước VFX (chẩn đoán). */
  vfxWarm: boolean;
  /** `?aura=0` tắt hào quang cảnh giới (so số đo trước/sau, RFX-1). */
  aura: boolean;
  /** `?auraground=0` hào quang cảnh giới kiểu cũ quanh người (không có ấn dưới chân); so ảnh trước/sau (Chân Cảnh C5). */
  auraGround: boolean;
  /** `?pathaura=0` về hào quang cảnh giới mặc định cho Đao tu/Cổ tu/Cấm chế sư (so ảnh trước/sau lớp hào quang riêng của hướng). */
  pathAura: boolean;
  /** `?mood=dawn|day|dusk|night` đổi thời điểm trong ngày (không lưu). */
  mood: 'dawn' | 'day' | 'dusk' | 'night' | null;
  /** `?fxq=low|medium|high` ép chất lượng hiệu ứng (chuỗi thô, nơi dùng kiểm lại). */
  fxq: string | null;
  /** `?chr=v1` quay về nhân vật cũ (N-7: mặc định là v3 Mannequin; `v1` giữ một bản làm dự phòng, `v3` = mặc định). */
  chr: 'v1' | 'v3' | null;
  /** `?v3model=b2` chọn bản Lạc Kiếm v3b2 (không tua) để so ảnh (mặc định v3b3 = v3b2 + tua/dải đai lò xo). */
  v3Model: string | null;
  /** `?jog=<số>` ép tốc độ clip chạy v3 (chụp). */
  jog: number;
  /** `?proplod0=<hệ số>` nhân ngưỡng LOD0 của prop không phải cây (mặc định 0,7; 1 = như trước). */
  propLod0: number;
  /** `?shadowhz=<số>` tần suất vẽ lại bản đồ bóng mặt trời tối đa (Hz); 0 = mỗi khung; mặc định 50 (v3cpu). */
  shadowHz: number;
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
  /** `?v3silk=0` tắt độ bóng lụa của voan Đan sư (đo A/B). */
  v3Silk: boolean;
  /** `?v3off=proc,feet,twist,cloth,park` tắt từng hệ phụ của v3 (chẩn đoán; `park` = đỗ rig ở LOD2). */
  v3Off: string[];
  /** `?headlift=<rad>` góc ngửa đầu bù clip Idle cho model giữ gốc (mặc định 0,23). */
  headLift: number;
  /** `?renderer=webgl2|webgpu|auto` (xem `rendererChoice`). */
  renderer: string | null;
  /** `?nobake=1` giữ InstancedMesh cho vật trang trí bí cảnh (không nướng/gộp theo ô, O2): đối chứng trước/sau. */
  noBake: boolean;
  /** `?keeptex=1` giữ bản sao texture phía CPU sau khi đã lên GPU (đối chứng heap JS, O4′). */
  keepTex: boolean;
  /** `?fullnormal=1` giữ pháp tuyến 2K của GLB kiến trúc (không thu về 1K): đối chứng bộ nhớ texture. */
  fullNormal: boolean;
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
  /** `?birds=0` tắt đàn chim lượn trên Lạc Kiếm (Chân Cảnh M4): ảnh đối chứng. */
  birds: boolean;
  /** `?hero=0` tắt viền nhân vật (hero light, C1). */
  hero: boolean;
  /** `?brk=0` tắt vật thể vỡ (vò, bia, cọc). */
  breakables: boolean;
  /** `?scenes=0` tắt tiểu cảnh Lạc Kiếm (cổng bài, ao sen, kiếm bia, cầu treo; Chân Cảnh M1+M2): ảnh đối chứng (chỉ tắt hình; va chạm vẫn còn, ảnh có thể có tường vô hình). */
  scenes: boolean;
  /** `?ground=0` tắt decal mặt đất kể chuyện Lạc Kiếm (vết chân, vũng nước, gạch vỡ, ấn trận, rễ; Chân Cảnh M3): ảnh đối chứng. */
  ground: boolean;
  /** `?isoyaw=<độ>` ghi đè hướng nhìn cố định của camera chéo (chỉ để chọn hướng đẹp nhất cho từng bản đồ). */
  isoYaw: number | null;
  /** `?vista=0` tắt "khoảnh khắc mở tầm nhìn" (camera hạ thấp khi ngự kiếm / đứng ở điểm ngắm cảnh). */
  vista: boolean;
  /** `?isofx=0` tắt nén hình VFX đứng cao ở camera chéo (so ảnh trước/sau, Thiên Nhãn P4-1). */
  isoFxCompress: boolean;
  /** `?style=painted` phong cách "Họa Cảnh" (nền hoạt hình vẽ tay, thử ở Vân Lam); mặc định không đổi gì. Giá trị lạ = tắt. */
  style: 'painted' | null;
  /** `?paint=0..3` mức lớp Kuwahara của Họa Cảnh (0 tắt, mặc định 1 khi `?style=painted`). */
  paint: number | null;
  /** `?far=1|0` (cùng `?style=painted`): ép bật/tắt vùng xa nướng một lần (FarBackdrop). Không có cờ: theo bảng level (`render/painted/theme.ts` `far`; Vân Lam tắt vì thung lũng kín). */
  far: boolean | null;
  /** `?vistafly=<độ>`: ghi đè pitch camera vista khi ngự kiếm (chỉ với ?far=1; để so mức). */
  vistaFlyPitch: number | null;
  /** `?paintdbg=dry` (cùng `?style=painted`): đất xuất mặt nạ đất trần ra màn hình (R = (r−g của màu đỉnh)×10, G = mặt nạ dùng để tô, B = 0) để gỡ lỗi. */
  paintDbg: 'dry' | 'vc' | null;
  /** `?touch=1|0` ép bật/tắt chế độ cảm ứng (U2-6; kiểm thử, ghi đè cài đặt). */
  touch: boolean | null;
}

/** Mô tả từng tham số, để người sau biết cờ nào còn sống. */
export const FLAG_DOCS: Readonly<Record<string, { scope: 'user' | 'diag' | 'test' | 'viewer'; doc: string }>> = {
  style: {
    scope: 'diag',
    doc: '=painted: phong cách Họa Cảnh (nền hoạt hình vẽ tay, pilot Vân Lam); mặc định tắt, xem docs/handbook/painted.md',
  },
  far: {
    scope: 'diag',
    doc: '=1: vùng xa Họa Cảnh (núi nướng một lần, render/painted/farBackdrop.ts); =0 tắt; chỉ có tác dụng với ?style=painted, WebGPU; mặc định theo level (Bắc Hoang bật)',
  },
  paintdbg: { scope: 'diag', doc: '=dry|vc: gỡ lỗi mảng đất trần của Họa Cảnh (xuất mặt nạ ra đất; xem render/painted/theme.ts dryMix)' },
  paint: { scope: 'diag', doc: '0..3: mức Kuwahara của ?style=painted (0 tắt, mặc định 1)' },
  vista: { scope: 'diag', doc: '0: tắt camera mở tầm nhìn (hạ thấp khi ngự kiếm và ở điểm ngắm cảnh)' },
  paintedlab: {
    scope: 'test',
    doc: '=1: cảnh thử đối chiếu Họa Cảnh với painted-valley (render/painted/lab; tools/painted-compare); ?win=x,z ?paint=0..3; =far: bản đồ độ cao vùng xa (P3a)',
  },
  isoyaw: { scope: 'diag', doc: 'độ: ghi đè hướng nhìn cố định của camera chéo (chọn hướng đẹp nhất cho từng bản đồ)' },
  isofx: { scope: 'diag', doc: '=0 tắt nén hình VFX đứng cao ở camera chéo (debug, so ảnh trước/sau)' },
  touch: { scope: 'user', doc: '=1 ép chế độ cảm ứng, =0 ép tắt (mặc định theo thiết bị + Cài đặt)' },
  mute: { scope: 'user', doc: 'tắt tiếng (playtest luôn bật)' },
  auto: { scope: 'test', doc: 'tự đăng nhập bằng đạo hiệu thử' },
  dev: { scope: 'test', doc: 'hiện đăng nhập thử ngoài localhost' },
  debug: { scope: 'diag', doc: 'bảng F3 + dòng số đo ở bản build' },
  models: { scope: 'diag', doc: '=legacy: model khối (dự phòng)' },
  batch: { scope: 'diag', doc: '=0: tắt gộp draw call VFX' },
  vfxlab: { scope: 'test', doc: '=1 (dev): phòng thử VFX, gắn window.__vfxlab; dùng với pnpm shots vfxlab' },
  animlab: { scope: 'test', doc: '=1 (dev): phòng thử animation Thân Pháp, gắn window.__animlab; dùng với pnpm shots animlab' },
  pstride: { scope: 'test', doc: '=<k> (khi Thân Pháp bật): nhân độ dài chu kỳ chạy Patch để quét trượt chân (mặc định 1)' },
  ploop: { scope: 'test', doc: '=0 (khi Thân Pháp bật): giữ vòng chạy UAL thay vì clip Patch PM_Run/PM_Sprint, để so trước/sau' },
  thanphap: {
    scope: 'diag',
    doc: '=0: tắt lớp Thân Pháp (mặc định bật: cường điệu góc chéo, nảy bước, pivot, clip Patch cho mọi hệ; idle/chiêu/cut-in mới chỉ Kiếm tu)',
  },
  vfxwarm: { scope: 'diag', doc: '=0: tắt biên dịch trước VFX' },
  auraground: { scope: 'diag', doc: '=0: hào quang cảnh giới kiểu cũ quanh người, không có ấn dưới chân (so ảnh C5)' },
  aura: { scope: 'diag', doc: '=0: tắt hào quang cảnh giới trên nhân vật' },
  pathaura: { scope: 'diag', doc: '=0: Đao tu/Cổ tu/Cấm chế sư dùng hào quang cảnh giới mặc định thay lớp hào quang riêng của hướng' },
  mood: { scope: 'diag', doc: 'dawn|day|dusk|night' },
  fxq: { scope: 'diag', doc: 'low|medium|high' },
  chr: { scope: 'user', doc: '=v1 quay về nhân vật cũ (dự phòng một bản sau N-7, model gốc không áo mô-đun); mặc định v3' },
  v3model: { scope: 'test', doc: '=b2 v3b2 (không tua); mặc định v3b3' },
  jog: { scope: 'test', doc: 'tốc độ clip chạy v3' },
  proplod0: { scope: 'test', doc: 'hệ số ngưỡng LOD0 của prop (mặc định 0,7)' },
  shadowhz: { scope: 'test', doc: 'tần suất vẽ lại bản đồ bóng tối đa (Hz, 0 = mỗi khung, mặc định 50)' },
  v3anim: { scope: 'test', doc: '=0 hệ animation v3 cũ' },
  v3feet: { scope: 'test', doc: '=0 tắt IK chân bám đất + bước chân xoay tại chỗ của v3' },
  armfit: { scope: 'test', doc: 'góc bù dang tay v3 (độ)' },
  v3pal: { scope: 'test', doc: '=0 tắt nhuộm v3' },
  ual: { scope: 'test', doc: '=0 tắt clip UAL' },
  v3veil: { scope: 'test', doc: '0: tắt xử lý voan alpha/sáng của model giữ gốc (đo A/B chi phí)' },
  v3silk: { scope: 'test', doc: '0: tắt độ bóng lụa (sheen + dị hướng) của voan Đan sư (đo A/B)' },
  v3side: { scope: 'test', doc: 'front|double: ép mặt vẽ vật liệu model giữ gốc Tripo (so sánh voan một lớp)' },
  norobeanim: { scope: 'test', doc: 'có mặt: dùng clip UAL gốc thay clip áo bào (model giữ gốc Tripo)' },
  v3off: { scope: 'test', doc: 'proc,feet,twist,cloth,park: tắt từng hệ phụ của v3 (chẩn đoán; park = đỗ rig ở LOD2)' },
  headlift: { scope: 'test', doc: 'góc ngửa đầu bù clip Idle cho model giữ gốc (rad, mặc định 0,23)' },
  cloth: { scope: 'test', doc: '=1 vải mô phỏng Thiên Y (model v3 có vải cũ tách riêng)' },
  renderer: { scope: 'diag', doc: 'webgl2|webgpu|auto' },
  fullnormal: { scope: 'diag', doc: '=1 giữ pháp tuyến 2K của GLB kiến trúc (đối chứng bộ nhớ texture)' },
  keeptex: { scope: 'diag', doc: '=1 giữ bản sao texture CPU sau khi tải lên GPU (đối chứng heap JS)' },
  nobake: { scope: 'diag', doc: '=1 không gộp vật trang trí bí cảnh (đối chứng O2)' },
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
  birds: { scope: 'diag', doc: '=0 tắt đàn chim lượn trên Lạc Kiếm (Chân Cảnh M4)' },
  hero: { scope: 'diag', doc: '=0 tắt viền nhân vật (hero light)' },
  ground: { scope: 'diag', doc: '=0 tắt decal mặt đất kể chuyện Lạc Kiếm (Chân Cảnh M3)' },
  scenes: { scope: 'diag', doc: '=0 tắt HÌNH tiểu cảnh Lạc Kiếm (Chân Cảnh M1+M2); va chạm vật đặc vẫn còn (shared)' },
  brk: { scope: 'diag', doc: '=0 tắt vật thể vỡ (vò, bia, cọc)' },
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
    style: q.get('style') === 'painted' ? 'painted' : null,
    far: q.get('far') === '1' ? true : q.get('far') === '0' ? false : null,
    paintDbg: q.get('paintdbg') === 'dry' ? 'dry' : q.get('paintdbg') === 'vc' ? 'vc' : null,
    vistaFlyPitch: Number.isFinite(Number(q.get('vistafly') ?? NaN)) && q.has('vistafly') ? Number(q.get('vistafly')) : null,
    paint: /^[0-3]$/.test(q.get('paint') ?? '') ? Number(q.get('paint')) : null,
    isoFxCompress: q.get('isofx') !== '0',
    vista: q.get('vista') !== '0',
    isoYaw: q.get('isoyaw') === null || Number.isNaN(Number(q.get('isoyaw'))) ? null : (Number(q.get('isoyaw')) * Math.PI) / 180,
    touch: q.get('touch') === '1' ? true : q.get('touch') === '0' ? false : null,
    auto: q.get('auto'),
    dev: q.has('dev'),
    debug: q.has('debug'),
    legacyModels: q.get('models') === 'legacy',
    batching: !off(q.get('batch')),
    vfxLab: q.get('vfxlab') === '1',
    animLab: q.get('animlab') === '1',
    thanPhap: q.get('thanphap') !== '0',
    patchLoop: !off(q.get('ploop')),
    pStride: Number(q.get('pstride')) > 0 ? Number(q.get('pstride')) : 1,
    vfxWarm: !off(q.get('vfxwarm')),
    aura: !off(q.get('aura')),
    auraGround: !off(q.get('auraground')),
    pathAura: !off(q.get('pathaura')),
    mood: mood === 'dawn' || mood === 'day' || mood === 'dusk' || mood === 'night' ? mood : null,
    fxq: q.get('fxq'),
    chr: chr === 'v1' || chr === 'v3' ? chr : null,
    v3Model: q.get('v3model'),
    jog: Number(q.get('jog')) || 0,
    propLod0: q.get('proplod0') === null ? 0.7 : Math.max(0.1, Number(q.get('proplod0')) || 1),
    shadowHz: q.get('shadowhz') === null ? 50 : Math.max(0, Number(q.get('shadowhz')) || 0),
    v3Anim: !off(q.get('v3anim')),
    v3Feet: !off(q.get('v3feet')),
    armFit: q.get('armfit') === null || Number.isNaN(Number(q.get('armfit'))) ? null : Number(q.get('armfit')),
    v3Palette: !off(q.get('v3pal')),
    ual: !off(q.get('ual')),
    cloth: q.get('cloth') === '1',
    noRobeAnim: q.has('norobeanim'),
    v3Side: q.get('v3side'),
    v3Veil: !off(q.get('v3veil')),
    v3Silk: !off(q.get('v3silk')),
    v3Off: (q.get('v3off') ?? '').split(',').filter(Boolean),
    headLift: Number.isFinite(Number(q.get('headlift') ?? NaN)) && q.get('headlift') !== null ? Number(q.get('headlift')) : 0.23,
    renderer: q.get('renderer'),
    noBake: q.get('nobake') === '1',
    keepTex: q.get('keeptex') === '1',
    fullNormal: q.get('fullnormal') === '1',
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
    birds: !off(q.get('birds')),
    hero: !off(q.get('hero')),
    breakables: !off(q.get('brk')),
    scenes: !off(q.get('scenes')),
    ground: !off(q.get('ground')),
  };
}

/** Cờ của lần nạp trang này (đọc một lần). */
export const FLAGS: Readonly<Flags> = readFlags(currentSearch());
