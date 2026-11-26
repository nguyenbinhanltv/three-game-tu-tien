// Phòng thử VFX (V-P0, `?vfxlab=1`, chỉ bản dev): điều khiển thời gian và đồng hồ ngân sách cho `pnpm shots vfxlab`.
// Dùng game thật (camera chéo, nhân vật, quái làm hình nộm bằng lệnh GM `spawn`), nên ảnh chụp đúng phối cảnh người chơi thấy.
// Không đổi luật chơi: chỉ nhân dt trình diễn, phát hình chiêu qua `skillFx.handle` và đo số liệu dựng hình.

import * as THREE from 'three/webgpu';
import { FX_TIMELINE, MONSTER, SKILL } from '@dtl/content';
import type { HazardMsg } from '@dtl/shared';
import { movesOf } from '../fx/monMove';
import { LABELS } from '../entities/labelBatch';
import { monScale } from '../fx/monFx';
import { monHitPalette } from '../fx/hitFx';
import { FxMesh } from '../../render/materials/vfx';
import { PARTICLES } from '../../render/vfx/particles';
import { evictSpriteGroups, residentSpriteGroups } from '../../render/vfx/art';
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
  /** Ước lượng phủ màn hình (0..1) từ khối bao các lưới hiệu ứng KHÔNG gộp (các kiểu gộp instanced không có trong cảnh nên chưa tính) trên lưới 64×36. Cận trên; số thật đo bằng so ảnh trong CLI. */
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
  const seen = new Set<FxMesh>();
  const visit = (o: THREE.Object3D) => {
    if (!(o instanceof FxMesh) || !o.visible || seen.has(o)) return;
    seen.add(o);
    fxLive++;
    const geo = o.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    o.updateWorldMatrix(true, false);
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
  };
  g.scene.traverse(visit);
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
  /**
   * V-P9: phát vạch báo + vùng nổ của chiêu `mv` (slam/chant/sweep/line/...) của quái đứng trong cảnh (spawn bằng GM `spawn`), đi đúng đường S.HAZARD của game
   * (`onHazard`): vòng báo cũ, `monFx.warn/boom` riêng từng chiêu, rung, âm. Vùng tròn đặt dưới chân người chơi (nện) hoặc dưới chân boss (niệm); nón/chữ nhật từ boss
   * hướng về người chơi. Trả false nếu không có quái hoặc chiêu.
   */
  castMon(mon: string, mv: string): boolean;
  /** Phòng thử quái: bật thì bỏ vạch báo/FX do server gửi (quái thật vẫn đánh nhưng không vẽ) và dùng đồng hồ trình diễn; chỉ `castMon` mới vẽ. */
  monLab(on: boolean): void;
  /** Hiện/ẩn bảng tên và thanh máu (chụp ảnh duyệt không bị che điểm trúng). */
  tags(show: boolean): void;
  pause(on: boolean): void;
  /** Hệ số thời gian trình diễn (0,25 = chậm gấp 4). */
  scale(x: number): void;
  /** Chạy tiếp đúng `ms` mili giây trình diễn rồi dừng lại (vào chế độ tạm dừng). */
  step(ms: number): void;
  budget(): LabBudget;
  /** Giải phóng mọi atlas sprite đang giữ (kiểm vòng nạp lại lười); trả tên nhóm đã giải phóng. */
  evictSprites(): string[];
  /** Các nhóm atlas sprite đang nằm trong GPU. */
  residentSprites(): string[];
  /** Chiêu có timeline FX hay đường cũ. */
  skills(): string[];
}

/** Timeline trúng đòn chung phát được trong phòng thử: `mon` = ở quái, tô theo hướng tu của mình; `me` = ở mình, tô theo hệ của quái; còn lại = khóa bảng màu cố định. */
const LAB_HIT: Record<string, string> = {
  fx_hit_cut: 'mon',
  fx_hit_smash: 'mon',
  fx_hit_stab: 'mon',
  fx_hit_crit: 'mon',
  fx_break: 'mon',
  fx_evade: 'hit_chung',
  fx_hit_block: 'hit_guard',
  fx_hit_mon: 'me',
  fx_hit_bite: 'me',
  fx_heal: 'hit_heal',
  fx_heal_tick: 'hit_heal',
};

/** `MonsterBurrow` rút gọn: các trường phòng thử cần. */
interface BurrowCfg {
  r: number;
  hide: number;
  mul: number;
  kind: HazardMsg['kind'];
  cone: { r: number; w: number; delay: number; mul: number };
}

/**
 * Cảnh thử độ kiếp (V-P10): không phải chiêu hay timeline mà là đường vẽ của game phát theo tin server. `delay` = giây từ lúc phát tới lúc sét đánh
 * (kịch bản `pnpm shots vfxlab --skill lab_loi` dùng làm mốc 0).
 */
export const LAB_SCENES = {
  /** Thiên lôi nhắm (`aim` của kiếp Trúc Cơ: r 4,2, báo 1,25 s), rơi lệch 3 m sang phải màn hình để không che người. */
  lab_loi: { delay: 1.25 },
  /** Thiên lôi pha lôi hỏa (Đan Hỏa Kiếp). */
  lab_loi_hot: { delay: 1.25 },
  /** Tia khóa mệnh cuối kiếp (r 9, báo 3 s), tâm tại người. */
  lab_loi_big: { delay: 3 },
  /** Kiếp vân trên đầu, giữ 12 s. */
  lab_kiep_van: { delay: 0 },
} as const;

function labScene(g: Game, id: keyof typeof LAB_SCENES, onHazard?: (g: Game, m: HazardMsg) => void): boolean {
  const gg = g as unknown as {
    cur: { x: number; y: number; z: number };
    sid: string;
    camYaw: number;
    monFx: { bypass: boolean } | null;
    vfx: {
      tribulationCloud(
        pos: (out: { set(x: number, y: number, z: number): unknown }) => boolean,
        dur: number,
        on: () => boolean,
        seed?: number,
      ): void;
    };
  };
  if (id === 'lab_kiep_van') {
    gg.vfx.tribulationCloud(
      (out) => (out.set(gg.cur.x, gg.cur.y + 1.15, gg.cur.z), true),
      12,
      () => true,
      20261126,
    );
    return true;
  }
  if (!onHazard) return false;
  if (gg.monFx) gg.monFx.bypass = true;
  const big = id === 'lab_loi_big';
  // Phải màn hình = vuông góc hướng nhìn của camera.
  const off = big ? 0 : 3;
  onHazard(g, {
    x: gg.cur.x + Math.cos(gg.camYaw) * off,
    z: gg.cur.z - Math.sin(gg.camYaw) * off,
    r: big ? 9 : 4.2,
    delay: LAB_SCENES[id].delay,
    kind: 'lightning',
    src: gg.sid,
    sd: 20261126,
    ...(big ? { big: true } : {}),
    ...(id === 'lab_loi_hot' ? { hot: true } : {}),
  });
  return true;
}

/** Gắn `window.__vfxlab` (gọi một lần khi tạo Game, chỉ khi `?vfxlab=1` ở bản dev). */
export function installVfxLab(g: Game, onHazard?: (g: Game, m: HazardMsg) => void): void {
  const api: VfxLabApi = {
    cast(skill) {
      if (skill in LAB_SCENES) return labScene(g, skill as keyof typeof LAB_SCENES, onHazard);
      const gg = g as unknown as {
        view: { monsters: Map<string, { x: number; z: number; st: number }> };
        fxArea: Map<string, { x: number; z: number; r: number }>;
        fxDst: Map<string, string>;
        skillFx: { handle(sid: string, e: object): void; startFromFx(sid: string, tl: object): void };
        sid: string;
      };
      const hit = [...gg.view.monsters.entries()].find(([, m]) => m.st !== 3);
      if (hit) {
        gg.fxArea.set(gg.sid, { x: hit[1].x, z: hit[1].z, r: 9 });
        gg.fxDst.set(gg.sid, hit[0]);
      }
      // Hình trúng đòn chung (HPL2): phát qua `HitFx` như lúc chơi. Vết va/chí mạng/chặn/ngắt chú đặt ở quái (tô theo hướng tu của mình, chặn có bảng riêng);
      // quái đánh người và nhịp hồi đặt ở mình (tô theo hệ của quái / bảng hồi).
      const labHit = LAB_HIT[skill];
      if (labHit) {
        const h = g as unknown as {
          hitFx: { labPlay(k: string, v: object, from: object | null, pal: string): boolean } | null;
          ents: {
            monsters: Map<string, { x: number; y: number; z: number; s: { t: string }; model: { height: number } }>;
            players: Map<string, { x: number; y: number; z: number }>;
          };
          methodOfPlayer(id: string): string | undefined;
        };
        const mon = hit ? h.ents.monsters.get(hit[0]) : undefined;
        const me = h.ents.players.get(gg.sid);
        if (!h.hitFx || !mon || !me) return false;
        const monPt = { id: hit![0], x: mon.x, y: mon.y, z: mon.z, chest: mon.model.height * 0.55, scale: monScale(mon.model.height) };
        const mePt = { id: gg.sid, x: me.x, y: me.y, z: me.z, chest: 1.15 };
        const onMe = labHit === 'me';
        const pal =
          labHit === 'mon'
            ? (h.methodOfPlayer(gg.sid) ?? 'hit_chung')
            : labHit === 'me'
              ? monHitPalette(MONSTER.get(mon.s.t)?.elem)
              : labHit;
        return h.hitFx.labPlay(skill, onMe || labHit === 'hit_heal' ? mePt : monPt, onMe ? mon : labHit === 'hit_heal' ? null : me, pal);
      }
      // Timeline kích theo S.FX (lướt, thuấn di...): chạy đường `startFromFx` như khi nhận tin từ server; còn lại phát từ sự kiện `windup`.
      const tl = FX_TIMELINE.get(skill);
      if (tl?.trigger === 'fx') gg.skillFx.startFromFx(gg.sid, tl);
      else gg.skillFx.handle(gg.sid, { kind: 'windup', skill, combo: -1, index: 0, t: 0, kb: false });
      return !!hit;
    },
    tags(show) {
      const e = (g as unknown as { ents: { bars: { hidden: boolean } } }).ents;
      e.bars.hidden = !show;
      LABELS.hidden = !show;
    },
    monLab(on) {
      const mf = (g as unknown as { monFx: { lab: boolean; bypass: boolean } | null }).monFx;
      if (mf) {
        mf.lab = on;
        mf.bypass = on;
      }
      // Hình trúng đòn chung cũng do tin server kích: phòng thử chỉ vẽ lời gọi `cast('fx_hit_*')`.
      const hf = (g as unknown as { hitFx: { lab: boolean } | null }).hitFx;
      if (hf) hf.lab = on;
    },
    castMon(mon, mv) {
      const gg = g as unknown as {
        view: { monsters: Map<string, { t: string; x: number; z: number; st: number }> };
        cur: { x: number; z: number };
        monFx: { bypass: boolean } | null;
      };
      const def = MONSTER.get(mon);
      const hit = [...gg.view.monsters.entries()].find(([, m]) => m.t === mon && m.st !== 3);
      const ai = def?.ai as
        | Record<
            string,
            | {
                r: number;
                delay: number;
                mul?: number;
                kind?: HazardMsg['kind'];
                shape?: string;
                w?: number;
                cast?: number;
                cone?: { r: number; w: number; delay: number };
              }
            | undefined
          >
        | undefined;
      // Chui đất: `burrow` = vòng tròn quanh người (báo `hide` giây), `emerge` = quạt `cone` từ chỗ boss trồi lên (ở phòng thử: chỗ boss đang đứng).
      const bu = (
        mv === 'burrow' || mv === 'emerge'
          ? [def?.ai, ...(def?.phases?.map((p) => p.ai) ?? [])].map((x) => (x as { burrow?: BurrowCfg } | undefined)?.burrow).find(Boolean)
          : undefined
      ) as BurrowCfg | undefined;
      const cfg = bu
        ? mv === 'burrow'
          ? { r: bu.r, delay: bu.hide, mul: bu.mul, kind: bu.kind }
          : { r: bu.cone.r, delay: bu.cone.delay, mul: bu.cone.mul, kind: bu.kind, w: bu.cone.w }
        : (ai?.[mv] ?? def?.phases?.map((p) => (p.ai as typeof ai)?.[mv]).find(Boolean));
      if (!def || !hit || !cfg || !gg.monFx || !onHazard) return false;
      gg.monFx.bypass = true; // phòng thử: FX do `onHazard` phát, bỏ chặn của `lab`
      const [id, hitView] = hit;
      const b = { x: hitView.x, z: hitView.z }; // bản sao: phòng thử dời gốc vùng mà không đụng trạng thái quái
      // Quái spawn ngay dưới chân người (hướng quạt/dải không xác định) hoặc đã đi xa khỏi khung: đặt gốc lùi về phía camera và hướng vào cảnh để quạt/dải trải qua người, nằm trong khung.
      const camYaw = (g as unknown as { camYaw: number }).camYaw;
      const dist = Math.hypot(gg.cur.x - b.x, gg.cur.z - b.z);
      const near = dist < 2 || dist > 14; // quái ở dưới chân hoặc xa khỏi khung
      const yaw = near ? camYaw + Math.PI : Math.atan2(gg.cur.x - b.x, gg.cur.z - b.z);
      if (near) {
        b.x = gg.cur.x + Math.sin(camYaw) * 4;
        b.z = gg.cur.z + Math.cos(camYaw) * 4;
      }
      const kind = cfg.kind ?? 'frost';
      const known = movesOf(def).some((m) => m.move === mv);
      if (!known) return false;
      const base: Partial<HazardMsg> = { delay: cfg.delay, kind, src: id, r: cfg.r };
      let m: HazardMsg;
      if (mv === 'caster' && cfg.shape === 'cone') {
        // Đòn niệm quạt của tinh anh: niệm `cast` giây rồi quạt từ chỗ quái đứng về phía người.
        m = { ...base, x: b.x, z: b.z, yaw, sh: 'cone', w: ((cfg.w ?? 30) * Math.PI) / 180 } as HazardMsg;
      } else if (mv === 'emerge') {
        m = { ...base, mv, x: b.x, z: b.z, yaw, sh: 'cone', w: ((cfg as { w: number }).w * Math.PI) / 180 } as HazardMsg;
      } else if (mv === 'sweep' || mv === 'line' || mv === 'charge') {
        const rect = cfg.shape === 'rect' || mv !== 'sweep';
        // Server gửi `w` quạt là NỬA GÓC bằng radian (độ trong monsters.json); chữ nhật là bề rộng (m).
        m = { ...base, x: b.x, z: b.z, yaw, sh: rect ? 'rect' : 'cone', w: !rect && cfg.w ? (cfg.w * Math.PI) / 180 : cfg.w } as HazardMsg;
      } else if (mv === 'chant') m = { ...base, x: b.x, z: b.z } as HazardMsg;
      else m = { ...base, x: gg.cur.x, z: gg.cur.z } as HazardMsg;
      if (mv === 'chant') {
        // Như server: niệm `cast` giây (FX niệm riêng của quái) rồi mới thả vạch báo.
        const mon = (g as unknown as { ents?: { monsters: Map<string, unknown> } }).ents?.monsters.get(id);
        if (mon) (gg.monFx as unknown as { cast(m: unknown): void }).cast(mon);
        const wait = cfg.cast ?? 0;
        if (wait > 0)
          (g as unknown as { vfx: { add(t: number, f: () => void, e: () => void): void } }).vfx.add(
            wait,
            () => {},
            () => onHazard(g, m),
          );
        else onHazard(g, m);
        return true;
      }
      // Chui đất ở phòng thử không có cờ MF_BURROW của server: tự dựng hình như game thật (thân thụt xuống, ụ đất chạy sang bên, trồi lên).
      if (mv === 'burrow' || mv === 'emerge') {
        const fx = (g as unknown as { burrowFx: import('../fx/burrowFx').BurrowFx }).burrowFx;
        const to = { x: gg.cur.x + 3.5, z: gg.cur.z - 3.5 };
        if (mv === 'burrow') fx.start(id, b.x, b.z, Date.now(), { move: true, auto: true, to, hide: cfg.delay });
        else {
          fx.start(id, b.x, b.z, Date.now(), { move: true, to: { x: b.x, z: b.z }, hide: 0 });
          fx.finish(id);
        }
      }
      onHazard(g, m);
      return true;
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
    evictSprites: () => evictSpriteGroups(),
    residentSprites: () => residentSpriteGroups(),
    skills: () => [...SKILL.keys()],
  };
  (window as unknown as { __vfxlab?: VfxLabApi }).__vfxlab = api;
}
