// Phòng thử animation "Thân Pháp" (TP-0, `?animlab=1`, chỉ bản dev), song song `?vfxlab`: điều khiển thời gian, camera chéo/cận, phát động tác
// chiêu (pose) của chính nhân vật, đồng hồ CPU xương. Dùng game thật (cùng camera chéo, cùng nhân vật v3) nên ảnh chụp đúng cái người chơi thấy.
// Không đổi luật chơi: chỉ nhân dt trình diễn, đặt `freeCam` và gọi `perform` ở phía hiển thị.

import { POSE, SKILLS } from '@dtl/content';
import type { Game } from '../engine';
import { ANIM_FX, CUTIN_FREEZE_MS, cutinArt, type AnimFxFlags } from '../character/animFx';
import { set } from '../../ui/store';
import { closeCam, keyMoments, type LabCam } from './animLabMath';

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

export type { LabCam, CamPose } from './animLabMath';

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
  /** T7: phát cut-in chiêu cuối `skill` như khi mình tung chiêu (khựng + thẻ); trả false nếu chiêu chưa có tranh. */
  cutin(skill: string): boolean;
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
    cutin(skill) {
      const art = cutinArt(skill, g.ents.players.get(g.sid)?.look.g ?? 'm');
      if (!art) return false;
      g.fxSlow = { scale: 0.04, until: performance.now() + CUTIN_FREEZE_MS };
      set({ ultCard: { id: ++g.ultCardId, skill, color: '9fd8ff', until: Date.now() + 900, cutin: art } });
      return true;
    },
  };
  (window as unknown as { __animlab?: AnimLabApi }).__animlab = api;
}
