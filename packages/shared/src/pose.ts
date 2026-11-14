// Key pose dữ liệu cho công cụ tư thế IK (client nướng thành AnimationClip; content:check kiểm hợp lệ).
//
// Không gian nhân vật: +Y lên, +Z trước mặt, tay PHẢI ở phía -X, đơn vị mét theo người tham chiếu
// (`POSE_REF`, cao ~1,75m, hông 0,95m). Rig khác cỡ thì client nhân theo tỉ lệ chiều cao hông.

export type PoseVec = [number, number, number];

/** Cách đi từ key trước tới key này. `quartOut`: vung nhanh rồi chậm dần (đòn chém). `step`: giữ rồi nhảy. */
export type PoseEase = 'linear' | 'in' | 'out' | 'inOut' | 'quartOut' | 'step';
export const POSE_EASES: readonly PoseEase[] = ['linear', 'in', 'out', 'inOut', 'quartOut', 'step'];

/**
 * Một key pose. Trường bỏ trống thì giữ giá trị của key gần nhất có trường đó (trước, hoặc sau nếu là đầu clip).
 * Chi không xuất hiện ở key nào thì không chạy IK (theo tư thế nghỉ của rig).
 */
export interface PoseKey {
  /** Thời điểm (giây). Key đầu phải ở 0. */
  t: number;
  ease?: PoseEase;
  /** Hông: dời (m, so với hông lúc nghỉ) và xoay [cúi X, xoay Y, nghiêng Z] (độ). Xoay Y dương: vai phải ra trước. */
  hips?: { pos?: PoseVec; rot?: PoseVec };
  /** Xoay cột sống (độ, cùng quy ước với hông), chia đều cho các đốt sống. Cúi dương = gập về trước. */
  spine?: PoseVec;
  /** Xoay cổ + đầu (độ). */
  head?: PoseVec;
  /** Vị trí cổ tay (m) so với hông lúc nghỉ. */
  handR?: PoseVec;
  handL?: PoseVec;
  /** Hướng gợi ý khuỷu (vector, không cần chuẩn hóa). Mặc định ra ngoài, xuống, ra sau. */
  elbowR?: PoseVec;
  elbowL?: PoseVec;
  /** Hướng mũi kiếm tay phải. */
  sword?: PoseVec;
  /** Hướng lưỡi kiếm (phía sắc), sẽ chỉnh cho vuông góc với `sword`. Trong đòn chém: hướng lưỡi đi tới. */
  edge?: PoseVec;
  /** Cổ chân: [x, nhấc khỏi đất, z]. x/z so với hông lúc nghỉ; nhấc 0 = chạm đất. */
  footR?: PoseVec;
  footL?: PoseVec;
  /** Hướng gợi ý gối. Mặc định về trước. */
  kneeR?: PoseVec;
  kneeL?: PoseVec;
}

export interface PoseDef {
  id: string;
  /** Độ dài clip (giây). */
  duration: number;
  /** Lặp (thế thủ, thở) hay một lần (đòn). Clip lặp tự nối key cuối về key đầu. */
  loop: boolean;
  /** Khung sát thương [từ, tới] (giây) để khớp với luật combat; chỉ là ghi chú cho M3-4, client không dùng để tính. */
  hit?: [number, number];
  keys: PoseKey[];
}

/**
 * Người tham chiếu mà dữ liệu pose viết theo (khớp rig Mixamo chuẩn cao 1,75m). Tọa độ so với hông lúc nghỉ,
 * cho bên TRÁI (+X); bên phải đổi dấu x.
 */
export const POSE_REF = {
  hipHeight: 0.95,
  /** Khớp vai (đầu xương cánh tay). */
  shoulder: [0.18, 0.45, 0] as PoseVec,
  /** Vai → khuỷu → cổ tay. */
  upperArm: 0.28,
  foreArm: 0.26,
  /** Khớp háng. */
  hip: [0.09, -0.05, 0] as PoseVec,
  thigh: 0.42,
  shin: 0.4,
  /** Độ cao cổ chân so với hông lúc chân chạm đất. */
  ankleY: -0.87,
} as const;

/** Góc xoay tối đa cho phép ở một trục (độ). */
const MAX_DEG = 120;
/** Sai số cho phép khi kiểm tầm với (người thật có thể nhô vai/xoay thân thêm chút). */
const REACH_SLACK = 1.03;

const isVec = (v: unknown): v is PoseVec => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const len = (v: PoseVec) => Math.hypot(v[0], v[1], v[2]);
const sub = (a: PoseVec, b: PoseVec): PoseVec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Kiểm một pose; trả về danh sách lỗi (rỗng = hợp lệ). */
export function validatePose(p: PoseDef): string[] {
  const errs: string[] = [];
  const at = `pose ${p.id}`;
  const e = (m: string) => errs.push(`${at}: ${m}`);
  if (typeof p.id !== 'string' || !/^[a-z0-9_]+$/.test(p.id)) e('id không hợp lệ');
  if (!(p.duration > 0 && p.duration <= 10)) e('duration phải trong (0, 10] giây');
  if (typeof p.loop !== 'boolean') e('loop phải là true/false');
  if (p.hit !== undefined && !(Array.isArray(p.hit) && p.hit.length === 2 && p.hit[0] >= 0 && p.hit[0] < p.hit[1] && p.hit[1] <= p.duration)) e('hit phải là [từ, tới] trong clip');
  if (!Array.isArray(p.keys) || p.keys.length === 0) {
    e('cần ít nhất một key');
    return errs;
  }
  if (p.keys[0].t !== 0) e('key đầu phải ở t = 0');

  const vecFields = ['handR', 'handL', 'elbowR', 'elbowL', 'sword', 'edge', 'footR', 'footL', 'kneeR', 'kneeL', 'spine', 'head'] as const;
  const dirFields = new Set(['elbowR', 'elbowL', 'sword', 'edge', 'kneeR', 'kneeL']);
  const angFields = new Set(['spine', 'head']);
  const known = new Set<string>(['t', 'ease', 'hips', ...vecFields]);
  let prevT = -1;
  let hipsPos: PoseVec = [0, 0, 0];
  for (const [i, k] of p.keys.entries()) {
    const kAt = `key ${i} (t=${k.t})`;
    for (const f of Object.keys(k)) if (!known.has(f)) e(`${kAt}: trường lạ "${f}"`);
    if (!(typeof k.t === 'number' && k.t > prevT && k.t <= p.duration)) e(`${kAt}: t phải tăng dần và không quá duration`);
    prevT = k.t;
    if (k.ease !== undefined && !POSE_EASES.includes(k.ease)) e(`${kAt}: ease không hợp lệ`);
    for (const f of vecFields) {
      const v = k[f];
      if (v === undefined) continue;
      if (!isVec(v)) {
        e(`${kAt}: ${f} phải là [x, y, z] số`);
        continue;
      }
      if (dirFields.has(f) && len(v) < 1e-3) e(`${kAt}: ${f} là hướng, không được bằng 0`);
      if (angFields.has(f) && v.some((a) => Math.abs(a) > MAX_DEG)) e(`${kAt}: ${f} xoay quá ${MAX_DEG}°`);
    }
    if (k.hips) {
      if (k.hips.pos !== undefined && !isVec(k.hips.pos)) e(`${kAt}: hips.pos phải là [x, y, z]`);
      if (k.hips.rot !== undefined && (!isVec(k.hips.rot) || k.hips.rot.some((a) => Math.abs(a) > MAX_DEG))) e(`${kAt}: hips.rot không hợp lệ`);
      if (isVec(k.hips.pos)) hipsPos = k.hips.pos;
    }
    if (isVec(k.sword) && isVec(k.edge)) {
      const c = (k.sword[0] * k.edge[0] + k.sword[1] * k.edge[1] + k.sword[2] * k.edge[2]) / (len(k.sword) * len(k.edge) || 1);
      if (Math.abs(c) > 0.95) e(`${kAt}: edge gần song song với sword`);
    }
    // Tầm với theo người tham chiếu: vai và khớp háng đi theo hông đã dời (bỏ qua xoay thân; ngồi thiền hạ hông ~0,7m).
    const arm = (POSE_REF.upperArm + POSE_REF.foreArm) * REACH_SLACK;
    for (const [f, side] of [['handR', -1], ['handL', 1]] as const) {
      const v = k[f];
      if (!isVec(v)) continue;
      const s: PoseVec = [POSE_REF.shoulder[0] * side + hipsPos[0], POSE_REF.shoulder[1] + hipsPos[1], POSE_REF.shoulder[2] + hipsPos[2]];
      if (len(sub(v, s)) > arm) e(`${kAt}: ${f} ngoài tầm với (${len(sub(v, s)).toFixed(2)}m > ${arm.toFixed(2)}m)`);
    }
    const leg = (POSE_REF.thigh + POSE_REF.shin) * REACH_SLACK;
    for (const [f, side] of [['footR', -1], ['footL', 1]] as const) {
      const v = k[f];
      if (!isVec(v)) continue;
      if (v[1] < 0) e(`${kAt}: ${f} nhấc âm (chân xuyên đất)`);
      const hip: PoseVec = [POSE_REF.hip[0] * side + hipsPos[0], POSE_REF.hip[1] + hipsPos[1], POSE_REF.hip[2] + hipsPos[2]];
      const ankle: PoseVec = [v[0], POSE_REF.ankleY + v[1], v[2]];
      if (len(sub(ankle, hip)) > leg) e(`${kAt}: ${f} ngoài tầm với (${len(sub(ankle, hip)).toFixed(2)}m > ${leg.toFixed(2)}m)`);
    }
  }
  return errs;
}
