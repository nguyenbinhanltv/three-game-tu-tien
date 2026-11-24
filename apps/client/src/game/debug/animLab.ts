// Phòng thử animation "Thân Pháp" (TP-0, `?animlab=1`, chỉ bản dev), song song `?vfxlab`: điều khiển thời gian, camera chéo/cận, phát động tác
// chiêu (pose) của chính nhân vật, đồng hồ CPU xương. Dùng game thật (cùng camera chéo, cùng nhân vật v3) nên ảnh chụp đúng cái người chơi thấy.
// Không đổi luật chơi: chỉ nhân dt trình diễn, đặt `freeCam` và gọi `perform` ở phía hiển thị.

import { POSE, SKILLS } from '@dtl/content';
import type { Game } from '../engine';
import { ANIM_FX, type AnimFxFlags } from '../character/animFx';

/** Trạng thái điều khiển thời gian, đọc bởi vòng khung (`animLabDt`). */
const state = { scale: 1, paused: false, stepSec: 0 };

/** Nhân dt thật theo điều khiển phòng thử (cùng luật với `labDt` của phòng VFX). */
export function animLabDt(dt: number): number {
  if (state.paused) {
    const s = state.stepSec;
    state.stepSec = 0;
    return s;
  }
  return dt * state.scale;
}

export type LabCam = 'iso' | 'close' | 'front' | 'side';

export interface CamPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

/**
 * Camera cận quanh một người đứng ở (px, py, pz) cao `h` m. `bearing` là hướng ngang (rad) từ người tới camera (lấy từ camera chéo hiện tại cho
 * `close`; cộng thêm π/2, π cho `side`, `front` do hướng nhìn của nhân vật). Cận để thấy tay, kiếm, mặt: FOV 28°, cách ~3,6 m.
 */
export function closeCam(px: number, py: number, pz: number, h: number, bearing: number, dist = 3.6): CamPose {
  return {
    x: px + Math.sin(bearing) * dist,
    y: py + h * 0.82,
    z: pz + Math.cos(bearing) * dist,
    tx: px,
    ty: py + h * 0.55,
    tz: pz,
    fov: 28,
  };
}

/** Các mốc tự chụp quanh một đòn (ms so với `hit[0]`): dồn lực, đỉnh đòn, +30 ms (khung giữ), thu đòn. */
export function keyMoments(hit: number, dur: number): { name: string; at: number }[] {
  const h = Math.max(0.05, hit);
  return [
    { name: 'dolu', at: Math.max(0, h * 0.45) },
    { name: 'dinh', at: h },
    { name: 'p30', at: h + 0.03 },
    { name: 'thu', at: Math.min(dur - 0.02, h + (dur - h) * 0.6) },
  ];
}

export interface AnimLabApi {
  pause(on: boolean): void;
  scale(x: number): void;
  /** Chạy tiếp đúng `ms` mili giây trình diễn rồi dừng lại. */
  step(ms: number): void;
  /** Đổi camera: `iso` = camera chéo của game; còn lại là camera cận quanh nhân vật. */
  cam(kind: LabCam): void;
  /** Phát động tác `pose` (id trong packages/content/data/poses) cho chính mình. Trả false nếu model không nhận. */
  perform(pose: string): boolean;
  /** Đồng hồ động tác đang phát (giây) hoặc null. */
  clock(): { t: number; skill: string } | null;
  /** Thời lượng, mốc trúng của pose (giây). */
  poseInfo(pose: string): { duration: number; hit: number[] } | null;
  /** Mốc tự chụp (giây trong pose) của pose. */
  moments(pose: string): { name: string; at: number }[];
  /** Pose của chiêu `skillId` (qua dữ liệu chiêu). */
  poseOfSkill(skillId: string): string | null;
  /** Số liệu CPU: trung bình/đỉnh mỗi hệ (ms) từ lần hỏi trước (đặt lại). Mục `anim` là xương + lớp phụ. */
  cpu(): { section: string; avg: number; max: number }[];
  /** Bật/tắt lớp Thân Pháp (so A/B). */
  fx(flags: Partial<AnimFxFlags>): AnimFxFlags;
  poses(): string[];
}

/** Gắn `window.__animlab` (gọi một lần khi tạo Game, chỉ khi `?animlab=1` ở bản dev). */
export function installAnimLab(g: Game): void {
  let bearing = 0;
  const self = () => g.ents.players.get(g.sid)?.model;
  const api: AnimLabApi = {
    pause(on) {
      state.paused = on;
      state.stepSec = 0;
    },
    scale(x) {
      state.scale = Math.max(0.05, Math.min(4, x));
    },
    step(ms) {
      state.paused = true;
      state.stepSec = Math.max(0, ms) / 1000;
    },
    cam(kind) {
      const m = self();
      if (kind === 'iso' || !m) {
        g.freeCam = null;
        return;
      }
      const p = m.root.position;
      if (!g.freeCam) bearing = Math.atan2(g.camera.position.x - p.x, g.camera.position.z - p.z);
      const face = m.root.rotation.y;
      const b = kind === 'close' ? bearing : kind === 'front' ? face : face + Math.PI / 2;
      g.freeCam = closeCam(p.x, p.y, p.z, m.height, b);
    },
    perform(pose) {
      const m = self();
      return !!m?.perform && m.perform(pose, { skill: pose });
    },
    clock() {
      const m = self();
      const c = m?.performClock?.();
      if (c) return c;
      // Chiêu phát từ phòng thử không có `timing`: đọc thẳng đồng hồ pose của model v3.
      const p = (m as unknown as { perf?: { t: number; id: string } | null } | undefined)?.perf;
      return p ? { t: p.t, skill: p.id } : null;
    },
    poseInfo(pose) {
      const d = POSE.get(pose);
      return d ? { duration: d.duration, hit: d.hit ?? [] } : null;
    },
    moments(pose) {
      const d = POSE.get(pose);
      return d ? keyMoments(d.hit?.[0] ?? d.duration * 0.4, d.duration) : [];
    },
    poseOfSkill: (id) => SKILLS.find((s) => s.id === id)?.pose ?? null,
    cpu: () => g.budget.snapshot().map((s) => ({ section: s.section, avg: s.avg, max: s.max })),
    fx(flags) {
      Object.assign(ANIM_FX, flags);
      return { ...ANIM_FX };
    },
    poses: () => [...POSE.keys()],
  };
  (window as unknown as { __animlab?: AnimLabApi }).__animlab = api;
}
