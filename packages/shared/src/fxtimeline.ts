// Dòng thời gian hiệu ứng của một chiêu (VFX-V0): mỗi chiêu một file JSON `packages/content/data/fx/<id chiêu>.json`
// liệt kê sự kiện theo mốc thời gian (mesh, hạt, decal, vệt kiếm, khựng hình, rung camera, chớp, âm thanh).
// Chỉ là lớp hình: không đụng luật chơi, windup/hitAt vẫn do `skills.json` và server quyết định.
// Kiểu và hàm thuần ở đây để `content:check` kiểm; phần vẽ ở `apps/client/src/game/fxTimeline.ts`.

/** Ba tầng màu + bóng sẫm của một nhánh: lõi (đậm), thân (chủ đạo), viền (sáng), điểm nhấn (vàng...), bóng (sẫm nhất). */
export type FxTone = 'core' | 'body' | 'rim' | 'accent' | 'shadow';

/** Hình khối FX dùng chung (dựng ở `render/vfx/fxShapes.ts`). */
export type FxShape =
  /** Lưỡi liềm hai tông, mép trong rách, mọc theo đường vung. */
  | 'crescent'
  /** Gai tinh thể sáu mặt (trồi từ đất, mảnh vỡ). */
  | 'spike'
  /** Mũi tinh thể dài hai đầu nhọn (kiếm hóa quang). */
  | 'kite'
  /** Đĩa/vòng nằm ngang, mép rách (gợn sóng, vòng ấn). */
  | 'ripple'
  /** Tấm vuông quay mặt về camera: chớp va chạm + vạch tốc độ tỏa tròn. */
  | 'burst'
  /** Tấm khói toon phẳng trên mặt đất, nở rồi tan theo nhiễu. */
  | 'smoke'
  /** Dải xoắn quanh một trục (vòng xoắn của phi kiếm). */
  | 'helix'
  /** Dải xoắn mảnh (nét bút lông) cho vòng lụa cỡ lớn quanh một vùng: bề rộng dải chỉ bằng 1/3 `helix` khi phóng to. */
  | 'ribbon'
  /** Pháp tướng rồng: ống thon cuộn xoắn quanh một trục đứng, đầu ở đỉnh (kiểu `crystal`, mọc từ đuôi lên đầu). */
  | 'dragon'
  /** Pháp tướng tượng ngồi (La Hán): thân tròn xoay dựng từ đài sen tới đầu, cao ~4,2 m ở scale 1 (kiểu `crystal`). */
  | 'statue'
  /** Thẻ pháp tướng vẽ 2D quay mặt về camera (kiểu `card`); chọn tranh bằng `card`. */
  | 'card';

/** Bố trí gốc của sự kiện. */
/** `area`: tâm vùng của chiêu diện rộng (`S.FX` x,z; không có thì như `ground`). `ground`: chân mục tiêu (mặt đất dưới chân); không có mục tiêu thì 5 m trước mặt, ngang chân người ra chiêu. */
export type FxAnchor = 'self' | 'target' | 'ahead' | 'ground' | 'area';

export interface FxBase {
  /** Giây so với mốc neo (mặc định `hitAt` của mốc trúng đang xét; `from: "start"` thì tính từ lúc bấm chiêu). Có thể âm. */
  t: number;
  from?: 'hit' | 'start';
  /**
   * Bậc chất lượng tối thiểu để phát: 0 = luôn (cả chiêu người khác ở mức Thấp), 1 = từ Vừa, 2 = chỉ Cao.
   * Chiêu của người khác bị hạ một bậc (xem `fxTierFor`).
   */
  tier?: 0 | 1 | 2;
  /** Chỉ phát ở mốc trúng thứ mấy (0-based) của chiêu nhiều mốc (Kiếm Vũ Tam Điệp...); không có thì mọi mốc. */
  hit?: number | number[];
}

export interface FxMeshEvent extends FxBase {
  type: 'mesh';
  shape: FxShape;
  /** Tự thêm lớp bóng sẫm (cùng hình, to hơn 8%, vẽ trước) cho hình `toon`. Mặc định có. */
  shadow?: boolean;
  /** Gốc đặt: `self` ngực người ra chiêu, `ahead` trước ngực `dist` m theo hướng nhìn, `target` điểm trúng. */
  at?: FxAnchor;
  /** Dịch theo hệ cục bộ (x phải, y lên, z tiến) của người ra chiêu (mét). */
  offset?: [number, number, number];
  /** Xoay (độ) quanh x, y, z cục bộ; `roll` của lưỡi liềm là z. */
  rot?: [number, number, number];
  /** Cỡ ban đầu → cuối (đều hoặc [x,y,z]). */
  scale?: number | [number, number, number];
  scaleTo?: number | [number, number, number];
  dur: number;
  /** Màu: tầng nào của bảng màu nhánh làm thân. */
  tone?: FxTone;
  /** Độ trong lớn nhất (0..1). */
  alpha?: number;
  /** Đầu quét: 0..1 trong `sweep` đầu của vòng đời (mặc định 0,35); 0 = hiện cả hình ngay. */
  sweep?: number;
  /** Tan (ăn mòn) từ tỉ lệ vòng đời này (mặc định 0,5). */
  erodeFrom?: number;
  /** Mép rách 0..1 (mặc định 0,5). */
  ragged?: number;
  /** Quay hình mặt về camera (burst, smoke). */
  billboard?: boolean;
  /** Bay từ gốc sang `to` trong `dur` (phi kiếm lao, kiếm khí bay): gốc → đích, đơn vị mét hoặc theo neo. */
  move?: { to: FxAnchor; ahead?: number; ease?: 'out' | 'in' | 'linear'; /** Dịch đích (khác `offset` của điểm xuất phát), ví dụ rơi thẳng từ trên cao. */ offset?: [number, number, number] };
  /** Tranh của hình `card`: `arhat` (La Hán ngồi + hào quang) hoặc `phoenix` (Phượng dang cánh). */
  card?: 'arhat' | 'phoenix';
  /** Với `move`: giữ hướng thẳng đứng (chỉ xoay theo hướng nhìn) thay vì quay mũi theo hướng bay (rồng lao xuống). */
  keepUp?: boolean;
  /** Quay quanh trục tiến (độ/giây), cho vòng xoắn. */
  spin?: number;
  /** Seed hình (mặc định theo lần phát). */
  seed?: number;
  /** Bám theo mục tiêu/người ra chiêu suốt vòng đời (mặc định cố định tại điểm đặt). */
  follow?: boolean;
  /** Nhân kích thước (x, z) với bán kính vùng `r` của chiêu diện rộng (scale thành mét tính theo bán kính). */
  fit?: 'area';
}

export interface FxParticleEvent extends FxBase {
  type: 'particles';
  /** `spark` tia sáng ngắn, `shard` mảnh tinh thể, `dust` bụi mờ, `petal` cánh sáng. */
  kind: 'spark' | 'shard' | 'dust' | 'petal';
  n: number;
  at?: FxAnchor;
  offset?: [number, number, number];
  /** Tốc độ (m/s), độ tỏa 0..1 (0 = theo hướng tiến, 1 = mọi hướng), tuổi thọ (giây), cỡ. */
  speed: number;
  spread: number;
  life: number;
  size: number;
  tone?: FxTone;
  /** Bắn ngược (về phía người ra chiêu) thay vì theo hướng tiến. */
  back?: boolean;
  /** Thêm trọng lực (m/s², dương = rơi). */
  grav?: number;
  /** Hạt sinh quanh gốc (bán kính ≈ speed × life) rồi bay vào tâm (tụ khí). */
  inward?: boolean;
}

export interface FxDecalEvent extends FxBase {
  type: 'decal';
  /** `crack` vết nứt phát sáng, `rune` vòng triện văn, `scorch` vết cháy mờ. */
  tex: 'crack' | 'rune' | 'scorch';
  at?: FxAnchor;
  offset?: [number, number, number];
  r: number;
  /** Mọc trong `grow` giây rồi giữ tới `dur` (tổng) và mờ dần. */
  grow?: number;
  dur: number;
  tone?: FxTone;
  alpha?: number;
  /** Góc xoay quanh trục đứng (độ); không có thì theo hướng nhìn + seed. */
  yaw?: number;
}

export interface FxTrailEvent extends FxBase {
  type: 'trail';
  /** Thời lượng lấy mẫu vệt kiếm bám xương `dtl_sword` (giây). */
  dur: number;
  tone?: FxTone;
}

export interface FxHitstopEvent extends FxBase {
  type: 'hitstop';
  /** Mili giây (40–80). */
  ms: number;
}

export interface FxShakeEvent extends FxBase {
  type: 'shake';
  /** Mức rung của `CameraShake` (0..1). */
  level: number;
}

/** Tia sét thiên lôi (hình có sẵn của `Vfx.lightning`), tông theo bảng màu; mảnh, không chớp toàn cảnh. */
export interface FxBoltEvent extends FxBase {
  type: 'bolt';
  at?: FxAnchor;
  offset?: [number, number, number];
  scale?: number;
  tone?: FxTone;
  seed?: number;
}

/** Kéo camera ra xa nhẹ (chỉ của mình): `pull` = hệ số khoảng cách thêm (0..0,4), lên trong 0,4 s, giữ rồi hạ trong 0,6 s cuối của `dur`. */
export interface FxCameraEvent extends FxBase {
  type: 'camera';
  pull: number;
  dur: number;
}

export interface FxFlashEvent extends FxBase {
  type: 'flash';
  /** Độ chớp toàn cảnh 0..0,3 (tắt theo công tắc rung màn hình? không: giới hạn cứng để không lóa). */
  amount: number;
}

export interface FxSoundEvent extends FxBase {
  type: 'sound';
  id: string;
  gain?: number;
}

export type FxEvent = FxMeshEvent | FxParticleEvent | FxDecalEvent | FxTrailEvent | FxHitstopEvent | FxShakeEvent | FxFlashEvent | FxSoundEvent | FxBoltEvent | FxCameraEvent;

export interface FxTimeline {
  /** id chiêu (khớp `skills.json`/`methods.json`). */
  skill: string;
  /** Công pháp có bảng màu riêng; không có thì theo công pháp của chiêu (chung = kiếm tu). */
  palette?: string;
  /** Sự kiện chung mọi mốc trúng (neo `hit` thì áp cho từng mốc trúng của đòn). */
  events: FxEvent[];
  /** Sự kiện thêm theo đòn thứ mấy của chuỗi liên hoàn (khóa "0", "1", "2"). */
  combo?: Record<string, FxEvent[]>;
  /** Sự kiện thêm theo biến thức đã chọn (`fx` của `SkillVariant`: deep, spread, twin, long...). */
  variants?: Record<string, FxEvent[]>;
  /**
   * `fx`: chiêu không có mốc trúng/động tác riêng (lướt) nên phát khi nhận `S.FX` cùng loại `fxKind` (đúng công pháp `method` nếu có);
   * mọi sự kiện neo vào lúc nhận (hitAt = 0). Mặc định `skill`: phát theo sự kiện chiêu của model.
   */
  trigger?: 'skill' | 'fx';
  fxKind?: string;
  method?: string;
  /** `S.FX` kiểu cũ mà timeline này thay thế (engine bỏ hình cũ của kiểu đó cho chiêu này). */
  replaces?: string[];
}

/**
 * Số draw call ước của một tập sự kiện: lưới cùng (hình, lớp) gộp một nhóm instanced (render/materials/fxBatch.ts), nên đếm số nhóm khác nhau:
 * mỗi hình mesh một nhóm (+1 nhóm bóng nếu có lớp bóng), decal nằm một nhóm riêng theo kiểu, vệt kiếm một nhóm. Hạt dùng chung hai lớp, không tính.
 */
export function fxDrawCount(events: readonly FxEvent[]): number {
  const groups = new Set<string>();
  let bolts = 0;
  for (const e of events) {
    if (e.type === 'mesh') {
      groups.add(e.shape);
      if (e.shadow !== false && (e.shape === 'crescent' || e.shape === 'ripple' || e.shape === 'helix' || e.shape === 'ribbon')) groups.add(e.shape + ':shadow');
    } else if (e.type === 'decal') groups.add('decal:' + e.tex);
    else if (e.type === 'trail') groups.add('trail');
    else if (e.type === 'bolt') bolts++;
  }
  // Tia sét (`Vfx.lightning`) KHÔNG gộp instanced: mỗi tia một draw call; thêm hai nhóm gộp dùng chung (cầu sáng + vòng chạm đất) cho mọi tia.
  if (bolts > 0) {
    groups.add('bolt-glow');
    groups.add('bolt-ring');
  }
  return groups.size + bolts;
}

/** Tổng số hạt của một tập sự kiện (ngân sách ≤ 1.500/chiêu). */
export function fxParticleCount(events: readonly FxEvent[]): number {
  let n = 0;
  for (const e of events) if (e.type === 'particles') n += e.n;
  return n;
}

/** Sự kiện của một mốc trúng thuộc đòn `combo` (không có `combo` thì chỉ sự kiện chung). */
export function fxEventsFor(tl: FxTimeline, combo: number, variant?: string): FxEvent[] {
  const extra = combo >= 0 ? tl.combo?.[String(combo)] : undefined;
  const vr = variant ? tl.variants?.[variant] : undefined;
  return extra || vr ? [...tl.events, ...(extra ?? []), ...(vr ?? [])] : tl.events;
}

/** Bậc chất lượng hiệu ứng (cài đặt người chơi): 0 Thấp, 1 Vừa, 2 Cao. */
export type FxQuality = 'low' | 'medium' | 'high';

export const FX_QUALITY_TIER: Record<FxQuality, 0 | 1 | 2> = { low: 0, medium: 1, high: 2 };

/** Bậc cao nhất được phát: chiêu người khác hạ một bậc (Cao → Vừa, còn lại → Thấp). */
export function fxTierFor(q: FxQuality, mine: boolean): 0 | 1 | 2 {
  const t = FX_QUALITY_TIER[q];
  return mine ? t : (Math.max(0, t - 1) as 0 | 1);
}

/** Kiểm một timeline; trả danh sách lỗi (rỗng = hợp lệ). */
export function validateFxTimeline(tl: FxTimeline, skillExists: (id: string) => boolean): string[] {
  const errs: string[] = [];
  const p = `fx ${tl.skill}`;
  if (!skillExists(tl.skill)) errs.push(`${p}: không có chiêu ${tl.skill}`);
  const all = [tl.events, ...Object.values(tl.combo ?? {}), ...Object.values(tl.variants ?? {})];
  for (const list of all) {
    for (const e of list) {
      if (!Number.isFinite(e.t) || Math.abs(e.t) > 3) errs.push(`${p}: mốc t=${e.t} ngoài [-3, 3]`);
      if (e.type === 'mesh' && !(e.dur > 0 && e.dur <= 4)) errs.push(`${p}: mesh ${e.shape} dur=${e.dur} ngoài (0, 4]`);
      if (e.type === 'decal' && !(e.dur > 0 && e.dur <= 4)) errs.push(`${p}: decal dur=${e.dur} ngoài (0, 4]`);
      if (e.type === 'hitstop' && !(e.ms >= 40 && e.ms <= 80)) errs.push(`${p}: hitstop ${e.ms} ms ngoài 40–80`);
      if (e.type === 'shake' && !(e.level >= 0 && e.level <= 0.6)) errs.push(`${p}: rung ${e.level} ngoài 0–0,6`);
      if (e.type === 'flash' && !(e.amount >= 0 && e.amount <= 0.3)) errs.push(`${p}: chớp ${e.amount} ngoài 0–0,3`);
      if (e.type === 'camera' && !(e.pull >= 0 && e.pull <= 0.4 && e.dur > 0 && e.dur <= 4)) errs.push(`${p}: camera pull=${e.pull} dur=${e.dur} ngoài (0–0,4, ≤ 4 s)`);
      if (e.type === 'bolt' && !(e.scale === undefined || (e.scale > 0 && e.scale <= 2))) errs.push(`${p}: bolt scale=${e.scale} ngoài (0, 2]`);
      if (e.type === 'particles' && !(e.n > 0 && e.n <= 400)) errs.push(`${p}: hạt n=${e.n} ngoài (0, 400]`);
    }
  }
  // Ngân sách: mỗi đòn (sự kiện chung + của đòn đó) ≤ 12 draw và ≤ 1.500 hạt.
  const combos = Object.keys(tl.combo ?? {}).length ? Object.keys(tl.combo!).map(Number) : [-1];
  const vars: (string | undefined)[] = [undefined, ...Object.keys(tl.variants ?? {})];
  for (const c of combos) {
    for (const v of vars) {
      const ev = fxEventsFor(tl, c, v);
      if (fxDrawCount(ev) > 12) errs.push(`${p}: ${fxDrawCount(ev)} draw > 12 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
      if (fxParticleCount(ev) > 1500) errs.push(`${p}: ${fxParticleCount(ev)} hạt > 1500 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
    }
  }
  // Tia sét: tối đa 4 tia mỗi đòn (mỗi tia một draw call riêng, không gộp).
  for (const c of combos) for (const v of vars) {
    const n = fxEventsFor(tl, c, v).filter((e) => e.type === 'bolt').length;
    if (n > 4) errs.push(`${p}: ${n} tia sét > 4 (đòn ${c}${v ? ', biến thức ' + v : ''})`);
  }
  if (tl.trigger === 'fx' && !tl.fxKind) errs.push(`${p}: trigger fx thiếu fxKind`);
  return errs;
}
