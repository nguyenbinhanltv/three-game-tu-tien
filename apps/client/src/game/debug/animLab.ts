// Phòng thử animation "Thân Pháp" (TP-0, `?animlab=1`, chỉ bản dev), song song `?vfxlab`: điều khiển thời gian, camera chéo/cận, phát động tác
// chiêu (pose) của chính nhân vật, đồng hồ CPU xương. Dùng game thật (cùng camera chéo, cùng nhân vật v3) nên ảnh chụp đúng cái người chơi thấy.
// Không đổi luật chơi: chỉ nhân dt trình diễn, đặt `freeCam` và gọi `perform` ở phía hiển thị.

import * as THREE from 'three/webgpu';
import { POSE, SKILLS } from '@dtl/content';
import type { Game } from '../engine';
import { ANIM_FX, CUTIN_FREEZE_MS, cutinArt, type AnimFxFlags } from '../character/animFx';
import { set } from '../../ui/store';
import { v3SetKeyOf } from '../character/mannequin';
import { walkableGround } from '../character/mannequinFeet';
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
  /** T5: cho chính mình trúng đòn từ hướng `from` ('front'|'back'|'left'|'right'), cấp `tier` 0..3; `knock` = ngã (knockdown). */
  hitSelf(from: 'front' | 'back' | 'left' | 'right', tier: number, knock?: boolean): boolean;
  /** T5: như `hitSelf` nhưng cho quái đầu tiên trong cảnh; trả toạ độ màn hình (px) của quái để cắt ảnh, hoặc null nếu không có quái. */
  hitMon(from: 'front' | 'back' | 'left' | 'right', tier: number, knock?: boolean): { x: number; y: number } | null;
  /** T7: phát cut-in chiêu cuối `skill` như khi mình tung chiêu (khựng + thẻ); trả false nếu chiêu chưa có tranh. */
  cutin(skill: string, setKey?: string, g?: string): boolean;
  /**
   * Số đo dáng người khung hiện tại (đo pivot và IK chân): gốc, hướng thân đang hiển thị (gốc + độ lệch của nhịp đảo chiều), độ dời thân của lớp phụ (`innerY`), hông/đầu (thế giới),
   * mỗi cổ chân kèm độ cao mặt đứng ngay dưới nó (`g`). null khi model chưa có xương Mannequin.
   */
  probe(): AnimLabProbe | null;
}

export interface AnimLabProbe {
  root: [number, number, number];
  yaw: number;
  innerY: number;
  pelvis: [number, number, number];
  head: [number, number, number];
  /** Trái rồi phải: vị trí cổ chân và mặt đứng dưới nó. */
  feet: { x: number; y: number; z: number; g: number }[];
  /** Mặt đứng dưới gốc nhân vật. */
  ground: number;
}

const _pv = new THREE.Vector3();

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
    hitSelf(from, tier, knock) {
      const m = self() as unknown as
        | {
            root: { rotation: { y: number } };
            hitReact?(o: object): void;
            knockdown?(): void;
          }
        | undefined;
      if (!m?.hitReact) return false;
      const y = m.root.rotation.y;
      const f: [number, number] = [Math.sin(y), Math.cos(y)];
      const r: [number, number] = [Math.cos(y), -Math.sin(y)];
      // dir = từ người đánh tới người bị đánh: bị đánh từ phía trước thì bị đẩy ra sau (−f).
      const d = from === 'front' ? [-f[0], -f[1]] : from === 'back' ? f : from === 'left' ? [-r[0], -r[1]] : r;
      m.hitReact({ dirX: d[0], dirZ: d[1], tier, heavy: tier >= 2 });
      if (knock) m.knockdown?.();
      return true;
    },
    hitMon(from, tier, knock) {
      const e = [...g.ents.monsters.values()][0] as
        | { model: { root: THREE.Object3D & { rotation: { y: number } }; height: number; hitReact?(o: object): void; knockdown?(): void } }
        | undefined;
      const m = e?.model;
      if (!m?.hitReact) return null;
      const y = m.root.rotation.y;
      const f: [number, number] = [Math.sin(y), Math.cos(y)];
      const r: [number, number] = [Math.cos(y), -Math.sin(y)];
      const d = from === 'front' ? [-f[0], -f[1]] : from === 'back' ? f : from === 'left' ? [-r[0], -r[1]] : r;
      m.hitReact({ dirX: d[0], dirZ: d[1], tier, heavy: tier >= 2 });
      if (knock) m.knockdown?.();
      const v = m.root.getWorldPosition(new THREE.Vector3());
      v.y += m.height * 0.5;
      v.project(g.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    },
    probe() {
      const m = self() as unknown as { root: THREE.Object3D; inner?: THREE.Object3D; rig?: THREE.Object3D } | undefined;
      const rig = m?.rig;
      const bone = (n: string) => rig?.getObjectByName(n);
      const pel = bone('pelvis');
      const head = bone('Head') ?? bone('head');
      const fl = bone('foot_l');
      const fr = bone('foot_r');
      if (!m || !pel || !head || !fl || !fr) return null;
      const rp = m.root.position;
      const ground = walkableGround(rp.y);
      const at = (o: THREE.Object3D): [number, number, number] => {
        o.getWorldPosition(_pv);
        return [_pv.x, _pv.y, _pv.z];
      };
      const foot = (o: THREE.Object3D) => {
        const [x, y, z] = at(o);
        return { x, y, z, g: ground(x, z) };
      };
      return {
        root: [rp.x, rp.y, rp.z],
        yaw: m.root.rotation.y + (m.inner?.rotation.y ?? 0),
        innerY: m.inner?.position.y ?? 0,
        pelvis: at(pel),
        head: at(head),
        feet: [foot(fl), foot(fr)],
        ground: ground(rp.x, rp.z),
      };
    },
    cutin(skill, setKey, gender) {
      const me = g.ents.players.get(g.sid);
      const art = cutinArt(setKey ?? v3SetKeyOf(me?.look.g ?? 'm', me?.look.skin, me?.look.set), gender ?? me?.look.g ?? 'm');
      if (!art) return false;
      g.fxSlow = { scale: 0.04, until: performance.now() + CUTIN_FREEZE_MS };
      set({ ultCard: { id: ++g.ultCardId, skill, color: '9fd8ff', until: Date.now() + 900, cutin: art } });
      return true;
    },
  };
  (window as unknown as { __animlab?: AnimLabApi }).__animlab = api;
}
