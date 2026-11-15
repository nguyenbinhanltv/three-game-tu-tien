import type { PoseDef, SkillDef } from '@dtl/shared';
import { GCD } from '@dtl/shared';
import { METHOD_SKILLS, POSE, SKILLS } from '@dtl/content';
import { MAX_HOLD } from '../game/skillPose';

/** Bảng thời gian một chiêu (K-1): pose, nhịp vung, và lúc server áp sát thương so với lúc hình trúng. */
export interface SkillTiming {
  skill: string;
  pose: string;
  /** Công pháp của chiêu (rỗng = chiêu gốc). */
  method: string;
  ult: boolean;
  duration: number;
  /** Số khung khóa và thời điểm từng khung (giây). */
  keys: number[];
  /** Khung vung [từ, tới] (giây): `hit[0]` là lúc ra đòn trong hình. */
  hit: [number, number];
  /** Thời gian vào thế trước lúc ra đòn (= hit[0]). */
  windup: number;
  /** Thời gian sau khi hết khung vung tới khi về thế (giây). */
  recovery: number;
  gcd: number;
  /** Thời gian niệm chú của chiêu (giây, 0 = ra ngay). */
  cast: number;
  cd: number;
  /**
   * Lúc server áp hiệu quả, tính từ lúc bấm (giây): ngay (0) với chiêu không niệm, hết niệm với chiêu niệm.
   * Server không chờ animation.
   */
  serverAt: number;
  /** Lúc hình ra đòn kể từ lúc bấm (giây): chiêu niệm xếp lịch cho trùng `serverAt`, chiêu ngay thì `hit[0]`. */
  visualAt: number;
  /** Lúc client phát FX và số sát thương kể từ lúc bấm: trễ tối đa `MAX_HOLD` để chờ nhát vung. */
  fxAt: number;
  /** Chênh giữa lúc hình ra đòn và lúc server áp (giây, > 0: hình trễ hơn server). */
  gap: number;
}

export function timingOf(skill: SkillDef, pose: PoseDef): SkillTiming | null {
  if (!pose.hit) return null;
  const hit0 = pose.hit[0];
  const serverAt = skill.cast;
  // Chiêu niệm: động tác xếp lịch để ra đòn đúng lúc niệm xong (skillPose.onCast); chiêu ngay: vào thế từ lúc bấm.
  const visualAt = skill.cast > 0 ? Math.max(skill.cast, hit0) : hit0;
  const fxAt = skill.cast > 0 ? visualAt : Math.min(MAX_HOLD, hit0);
  return {
    skill: skill.id,
    pose: pose.id,
    method: skill.method ?? '',
    ult: !!skill.ult,
    duration: pose.duration,
    keys: pose.keys.map((k) => k.t),
    hit: pose.hit,
    windup: hit0,
    recovery: Math.max(0, pose.duration - pose.hit[1]),
    gcd: GCD,
    cast: skill.cast,
    cd: skill.cd,
    serverAt,
    visualAt,
    fxAt,
    gap: visualAt - serverAt,
  };
}

/** Mọi chiêu có pose (6 gốc + 6 công pháp) theo thứ tự thanh chiêu. */
export function allSkillTimings(): SkillTiming[] {
  const out: SkillTiming[] = [];
  for (const s of [...SKILLS, ...METHOD_SKILLS]) {
    const p = s.pose ? POSE.get(s.pose) : undefined;
    const t = p ? timingOf(s, p) : null;
    if (t) out.push(t);
  }
  return out;
}

/** `?id=` có thể là id chiêu hoặc id pose → chiêu tương ứng (nếu có). */
export function skillForId(id: string): SkillDef | undefined {
  const all = [...SKILLS, ...METHOD_SKILLS];
  return all.find((s) => s.id === id) ?? all.find((s) => s.pose === id);
}
