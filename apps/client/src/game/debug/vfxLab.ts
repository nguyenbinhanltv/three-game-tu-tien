// Phòng thử VFX (V-P0, `?vfxlab=1`, chỉ bản dev): điều khiển thời gian và đồng hồ ngân sách cho `pnpm shots vfxlab`.
// Dùng game thật (camera chéo, nhân vật, quái làm hình nộm bằng lệnh GM `spawn`), nên ảnh chụp đúng phối cảnh người chơi thấy.
// Không đổi luật chơi: chỉ nhân dt trình diễn, phát hình chiêu qua `skillFx.handle` và đo số liệu dựng hình.

import * as THREE from 'three/webgpu';
import { SKILL } from '@dtl/content';
import { FxMesh } from '../../render/materials/vfx';
import { PARTICLES } from '../../render/vfx/particles';
import type { Game } from '../engine';

/** Trạng thái điều khiển thời gian, đọc bởi vòng khung (`labDt`). */
const state = { scale: 1, paused: false, stepSec: 0 };

/** Nhân dt thật theo điều khiển phòng thử: tạm dừng thì 0 (trừ khi có bước đơn), chậm thì nhân `scale`. */
export function labDt(dt: number): number {
  if (state.paused) {
    const s = state.stepSec;
    state.stepSec = 0;
    return s;
  }
  return dt * state.scale;
}

export interface LabBudget {
  drawCalls: number;
  triangles: number;
  /** Lưới hiệu ứng đang sống (mỗi lưới ≤ 1 draw call trước khi gộp). */
  fxLive: number;
  particles: number;
  particleBudget: number;
  /** Ước lượng phủ màn hình (0..1) từ khối bao các lưới hiệu ứng trên lưới 64×36. Cận trên; số thật đo bằng so ảnh trong CLI. */
  screenCover: number;
  /** Ước lượng overdraw: số lưới hiệu ứng chồng nhau nhiều nhất ở một ô. */
  overdraw: number;
}

const GW = 64;
const GH = 36;
const _v = new THREE.Vector3();
const _s = new THREE.Sphere();

/** Đo ngân sách hiện thời của khung vừa vẽ. */
export function measureBudget(g: Game): LabBudget {
  const cells = new Uint8Array(GW * GH);
  let fxLive = 0;
  g.scene.traverse((o) => {
    if (!(o instanceof FxMesh) || !o.visible) return;
    fxLive++;
    const geo = o.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    _s.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld);
    _v.copy(_s.center).project(g.camera);
    if (_v.z > 1) return;
    // bán kính trên màn hình (đơn vị NDC theo chiều dọc) theo phối cảnh
    const cam = g.camera as THREE.PerspectiveCamera;
    const dist = Math.max(0.1, g.camera.position.distanceTo(_s.center));
    const rNdc = _s.radius / (dist * Math.tan((cam.fov * Math.PI) / 360));
    const x0 = Math.max(0, Math.floor(((_v.x - rNdc / cam.aspect) * 0.5 + 0.5) * GW));
    const x1 = Math.min(GW - 1, Math.floor(((_v.x + rNdc / cam.aspect) * 0.5 + 0.5) * GW));
    const y0 = Math.max(0, Math.floor((0.5 - (_v.y + rNdc) * 0.5) * GH));
    const y1 = Math.min(GH - 1, Math.floor((0.5 - (_v.y - rNdc) * 0.5) * GH));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * GW + x] = Math.min(255, cells[y * GW + x]! + 1);
  });
  let covered = 0;
  let over = 0;
  for (const c of cells) {
    if (c > 0) covered++;
    if (c > over) over = c;
  }
  const p = PARTICLES.aliveCount();
  const info = g.info();
  return {
    drawCalls: info.drawCalls,
    triangles: info.triangles,
    fxLive,
    particles: p.total,
    particleBudget: p.budget,
    screenCover: covered / (GW * GH),
    overdraw: over,
  };
}

export interface VfxLabApi {
  /** Phát hình chiêu `skill` như thể mình vừa ra: mục tiêu là quái gần nhất còn sống (nếu có). Trả true nếu có mục tiêu. */
  cast(skill: string): boolean;
  pause(on: boolean): void;
  /** Hệ số thời gian trình diễn (0,25 = chậm gấp 4). */
  scale(x: number): void;
  /** Chạy tiếp đúng `ms` mili giây trình diễn rồi dừng lại (vào chế độ tạm dừng). */
  step(ms: number): void;
  budget(): LabBudget;
  /** Chiêu có timeline FX hay đường cũ. */
  skills(): string[];
}

/** Gắn `window.__vfxlab` (gọi một lần khi tạo Game, chỉ khi `?vfxlab=1` ở bản dev). */
export function installVfxLab(g: Game): void {
  const api: VfxLabApi = {
    cast(skill) {
      const gg = g as unknown as {
        view: { monsters: Map<string, { x: number; z: number; st: number }> };
        fxArea: Map<string, { x: number; z: number; r: number }>;
        fxDst: Map<string, string>;
        skillFx: { handle(sid: string, e: object): void };
        sid: string;
      };
      const hit = [...gg.view.monsters.entries()].find(([, m]) => m.st !== 3);
      if (hit) {
        gg.fxArea.set(gg.sid, { x: hit[1].x, z: hit[1].z, r: 9 });
        gg.fxDst.set(gg.sid, hit[0]);
      }
      gg.skillFx.handle(gg.sid, { kind: 'windup', skill, combo: -1, index: 0, t: 0, kb: false });
      return !!hit;
    },
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
    budget: () => measureBudget(g),
    skills: () => [...SKILL.keys()],
  };
  (window as unknown as { __vfxlab?: VfxLabApi }).__vfxlab = api;
}
