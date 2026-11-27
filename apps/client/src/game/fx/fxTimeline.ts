// Bộ chạy dòng thời gian hiệu ứng (VFX-V0): đọc `FxTimeline` (JSON trong packages/content/data/fx/) và phát mesh vẽ tay, hạt,
// decal, vệt kiếm, khựng hình, rung camera, chớp, âm thanh theo mốc thời gian neo vào `windup`/`hitAt` của chiêu.
// Thay cho sáu kiểu fx chung cho chiêu nào có timeline; chiêu chưa có vẫn đi đường cũ (skillFx.ts, vfx.ts, methodFx.ts).
// Chỉ là lớp hình: server vẫn quyết định chiêu, mục tiêu, sát thương.

import * as THREE from 'three/webgpu';
import {
  FLIP_ATLASES,
  FORGE_DECALS,
  FORGE_FLIPS,
  fxAwayFromCam,
  fxCamFade,
  fxEventsFor,
  fxHierarchy,
  fxTierFor,
  skillTiming,
  type FxAnchor,
  type FxDecalEvent,
  type FxEvent,
  type FxMeshEvent,
  type FxParticleEvent,
  type FxQuality,
  type FxTimeline,
  type SkillDef,
} from '@dtl/shared';
import type { FxMesh } from '../../render/materials/vfx';
import { paletteOf, toneOf, type FxPalette } from '../../render/vfx/palette';
import { FLAGS } from '../../base/flags';
import { BOLT_HEIGHT } from '../../render/vfx/lightning';
import { SIGIL_CIRCLE } from '../../render/vfx/sigil';
import {
  ISO_BOLT_FOOT_LIFE,
  ISO_BOLT_HEIGHT,
  isBoltGroundHit,
  isoBehind,
  isoBoltFootRadius,
  ISO_CARD_ALPHA,
  ISO_CARD_SCALE,
  isoFxScaleY,
} from '../../render/vfx/isoFx';
import { forgeDecalIndex, forgeFlipIndex } from '../../render/vfx/forgeTex';
import { shapeGeometry, shapeKind, QUAD_XZ } from '../../render/vfx/fxShapes';
import { spriteCell, useSpriteGroup } from '../../render/vfx/art';
import {
  DECAL_CRACK,
  DECAL_CRACK_INK,
  DECAL_RUNE,
  DECAL_RUNE_INK,
  DECAL_SCORCH,
  DECAL_SMOKE,
  DECAL_STRIKE,
} from '../../render/vfx/stylized';
import { bladeVisible } from '../../render/vfx/bladeTrail';
import type { SkillEvent } from '../character/view';
import { emitCount } from './fxSettings';
import { densitySize } from '../../render/vfx/particles';
import type { Vfx } from './vfx';
import { sigilGroundY } from './groundLift';
import { presentDt } from './vfxParts/common';

/** Kiểu tô sprite theo tiền tố tên (`fxA.x`, xem `spriteNodes` ở render/vfx/stylized.ts). */
export const SPRITE_STYLE: Record<string, number> = {
  loi_: 1,
  kiem_: 2,
  hp_: 3,
  thuy_: 4,
  nguyet_: 5,
  cot_: 6,
  tho_: 7,
  doc_: 7,
  tim_: 8,
  lua_: 8,
  ham_: 8,
  dao_: 9,
  cth_: 11,
  dan_: 10,
  // A6: gương/bóng ngọc lam (kiểu kiếm teal), nét cọ mực `mac_` (nguyệt, bạc), đồng đỉnh + cát (vàng đất hue 46–50), hai mặt/ngà/mây (màu thật). `tuq_` (tím Tử Quang) KHÔNG khai: kiểu 0
  // (bảng tím theo độ sáng) bỏ quầng teal do nền chroma để lại ở mép sương.
  guong_: 2,
  mac_: 5,
  dong_: 3,
  phu_: 8,
  kieu_: 8,
  sa_: 3,
  may_: 8,
  // V-P10 đột phá: tranh đơn sắc, tô theo bảng màu của timeline (màu sự kiện = thân, `rim` của bảng = viền).
  dp_: 12,
  hq_: 12,
  // Trúng đòn chung: cũng tranh đơn sắc tô theo bảng màu lúc phát (hướng tu người đánh / hệ của quái).
  chung_: 12,
  ngu_: 12,
  kiep_: 12,
  // Môi trường (cổng, linh thảo, hồi sinh): tranh đơn sắc tô theo bảng màu timeline.
  canh_: 12,
};

export interface FxTarget {
  /** Chân mục tiêu (y = mặt đất dưới chân). */
  x: number;
  y: number;
  z: number;
  /** Cao tới ngực (m). */
  chest: number;
}

export interface FxCaster {
  x: number;
  y: number;
  z: number;
  yaw: number;
  model: {
    bladePoints?(b: THREE.Vector3, t: THREE.Vector3): boolean;
    performClock?(): { t: number; skill: string } | null;
    hit?: { hitStop(sec: number, delay?: number): void };
  };
}

export interface FxRunnerEnv {
  camera(): THREE.PerspectiveCamera;
  /** Mục tiêu của người ra chiêu `sid` (mình: mục tiêu đang chọn; người khác: đích của `S.FX` gần nhất). */
  targetOf(sid: string): FxTarget | null;
  quality(): FxQuality;
  hitStopOn(): boolean;
  shake(level: number, dir?: { x: number; z: number }): void;
  flash(amount: number): void;
  /** Khung va chạm (V-P0): 1–2 khung tương phản cao ám màu. */
  impact(frames: number, tint: 'ink' | 'warm' | 'cool'): void;
  /** Công tắc khung va chạm trong Cài đặt. */
  impactOn(): boolean;
  /** Chế độ tĩnh (giảm hiệu ứng người khác mạnh hơn, bỏ khung va chạm). */
  staticOn(): boolean;
  /** `sid` là đối thủ đấu pháp của mình (chiêu của địch phải đọc rõ, không bị giảm theo luật thứ bậc). */
  hostile(sid: string): boolean;
  /** Kéo camera ra xa nhẹ (pháp tướng): hệ số khoảng cách thêm và thời lượng (giây). */
  camPull(pull: number, dur: number): void;
  /** Đẩy góc nhìn thêm `deg` độ cùng nhịp `camPull` (VS-1). */
  camFov(deg: number, dur: number): void;
  /** Chậm thời gian trình diễn `scale`× trong `ms` mili giây (VS-1; không đụng luật/di chuyển). */
  slowmo(scale: number, ms: number): void;
  /** Chớp tối/sáng ở viền khung hình (VS-1). */
  vignette(amount: number, tone: 'dark' | 'light', ms: number): void;
  /** Âm có chỉnh tốc độ phát (VS-1, `soundAt`). */
  soundRate(id: string, gain: number, sid: string, rate: number): void;
  sound(id: string, gain: number, sid: string): void;
  /** Vùng của chiêu diện rộng gần nhất của `sid` (S.FX x, z, r). */
  areaOf(sid: string): { x: number; z: number; r: number } | null;
  /** Điểm xuất phát của thuấn di (S.FX ox, oz) gần nhất của `sid`. */
  originOf(sid: string): { x: number; z: number } | null;
  /** Biến thức (`fx` của SkillVariant) của chiêu gần nhất của `sid`. */
  variantOf(sid: string, skillId: string): string | undefined;
}

interface Queued {
  at: number;
  ev: FxEvent;
  hit: number;
  idx: number;
  done: boolean;
}

interface Cast {
  sid: string;
  actor: FxCaster;
  def: SkillDef;
  mine: boolean;
  tier: 0 | 1 | 2;
  pal: FxPalette;
  q: Queued[];
  /** Đồng hồ dự phòng (giây từ windup) khi model không có đồng hồ animation. */
  clock: number;
  seed: number;
  dist: number;
  /** Số hạt đã phát của chiêu này (trần `CAST_PARTICLE_CAP`). */
  emitted: number;
  /** Mốc trúng đầu tiên (giây từ bấm): hủy trước mốc này thì đòn không trúng, bỏ các sự kiện chưa phát. */
  firstHit: number;
  /** FX của quái (V5): mục tiêu/vùng cố định, hệ số cỡ, thời gian báo trước, biến thức ép. */
  tgt?: FxTarget | null;
  area?: { x: number; z: number; r: number };
  mul: number;
  /** Hệ số độ sáng theo luật thứ bậc (`fxHierarchy`): 1 cho chiêu của mình. */
  amul: number;
  delay?: number;
  variant?: string;
}

/** Tùy chọn phát một timeline tại điểm bất kỳ (FX của quái, V5). */
interface FxAtOpts {
  actor: FxCaster;
  palette: string;
  tgt?: FxTarget | null;
  area?: { x: number; z: number; r: number };
  /** Nhân cỡ hình, bán kính decal, khoảng dịch, hạt (mặc định 1). */
  mul?: number;
  /** Thời gian báo trước (giây) cho sự kiện `untilDelay`. */
  delay?: number;
  variant?: string;
  /** Mốc trúng (giây từ lúc phát), mặc định 0. */
  hitAt?: number;
  /** Hiệu ứng của chính người xem (ải Ngũ Suy của mình, TN-4): không hạ bậc chất lượng, có rung/chớp theo cài đặt. Mặc định false (FX quái). */
  mine?: boolean;
}

interface BladeJob {
  sid: string;
  actor: FxCaster;
  t: number;
  end: number;
  rib: ReturnType<Vfx['trails']['openBlade']>;
  color: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _col = new THREE.Color();
const DEG = Math.PI / 180;

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Số decal sống tối đa cùng lúc (mỗi decal một lưới; chiêu của người khác chỉ khi còn chỗ). */
const DECAL_MAX = 6;

/**
 * Xưởng VFX (Diễn Võ Trường V2b): chỉ số các LỚP (vị trí trong `events` của timeline) đang bị tắt để soi từng lớp. Rỗng = phát đủ. Chỉ công cụ dev
 * đổi tập này (`window.__fxLayerOff`, `pnpm shots dienvo --layersoff 0,3`); áp cho mọi timeline phát sau đó.
 */
export const FX_LAYER_OFF = new Set<number>();

/** Mốc (giây từ bấm) của từng sự kiện trong một đòn: mỗi mốc trúng một bản cho sự kiện neo `hit`. */
export function scheduleEvents(
  events: readonly FxEvent[],
  hitAt: readonly number[],
  tier: 0 | 1 | 2,
): { at: number; ev: FxEvent; hit: number }[] {
  const out: { at: number; ev: FxEvent; hit: number }[] = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx]!;
    if ((ev.tier ?? 0) > tier) continue;
    if (FX_LAYER_OFF.size && FX_LAYER_OFF.has(idx)) continue;
    if (ev.from === 'start') out.push({ at: ev.t, ev, hit: 0 });
    else {
      const only = ev.hit === undefined ? null : Array.isArray(ev.hit) ? ev.hit : [ev.hit];
      hitAt.forEach((h, i) => {
        if (!only || only.includes(i)) out.push({ at: h + ev.t, ev, hit: i });
      });
    }
  }
  out.sort((x, y) => x.at - y.at);
  return out;
}

/** Bán kính quanh mục tiêu (m) trong đó khối `camFade` còn được xét che mục tiêu. */
const CAM_FADE_TGT = 4;

/** Hủy ở giây `t` có làm đòn không trúng được không (chưa tới mốc trúng đầu). */
export function cancelDropsCast(t: number, firstHit: number): boolean {
  return t < firstHit - 1e-3;
}

/**
 * Biến thức (`fx` của SkillVariant) đang dùng cho chiêu `skillId` của một người ra chiêu.
 * Của mình: theo lựa chọn trong trạng thái công pháp cục bộ (khóa theo chiêu; windup dự đoán tới trước S.FX của server nên không được đọc từ S.FX).
 * Của người khác: biến thức của S.FX gần nhất CÙNG loại hiệu ứng (`fxKind` của chiêu), không lẫn từ chiêu khác.
 */
export function variantFor(opts: {
  mine: boolean;
  skillId: string;
  chosen?: 'a' | 'b';
  variants?: { a?: { fx?: string }; b?: { fx?: string } };
  lastFx?: string;
}): string | undefined {
  if (opts.mine) return opts.chosen ? opts.variants?.[opts.chosen]?.fx : undefined;
  return opts.lastFx;
}

export class FxRunner {
  private casts = new Map<string, Cast>();
  private jobs: BladeJob[] = [];
  private decals = 0;
  /** Còn bao nhiêu chỗ decal (trần `DECAL_MAX` dùng chung cả runner): vạch báo riêng của quái cần đủ chỗ cho mọi decal của nó, không thì giữ vạch cũ. */
  decalSlots(): number {
    return Math.max(0, DECAL_MAX - this.decals);
  }
  private serial = 0;
  /** Nhật ký dev: sự kiện đã phát (`__game.skillFx.runner.log`). */
  readonly log: { skill: string; type: string; at: number; real: number }[] = [];

  constructor(
    private v: Vfx,
    private env: FxRunnerEnv,
  ) {}

  /** Bắt đầu một đòn (sự kiện `windup`). */
  start(
    sid: string,
    actor: FxCaster,
    def: SkillDef,
    tl: FxTimeline,
    e: SkillEvent,
    mine: boolean,
    dist: number,
    method: string | undefined,
  ): void {
    this.drop(sid);
    const tm = skillTiming(def, e.combo >= 0 ? e.combo : undefined);
    const tier = fxTierFor(this.env.quality(), mine);
    const pal = paletteOf(tl.palette ?? def.method ?? (mine ? method : undefined));
    const events = fxEventsFor(tl, e.combo, this.env.variantOf(sid, def.id));
    const q = scheduleEvents(events, tm.hitAt, tier).map((s, idx) => ({ ...s, idx, done: false }));
    this.casts.set(sid, {
      sid,
      actor,
      def,
      mine,
      tier,
      pal,
      q,
      clock: e.t,
      seed: ++this.serial * 7.31,
      dist,
      firstHit: Math.min(...tm.hitAt),
      mul: 1,
      amul: fxHierarchy(mine, this.env.staticOn(), this.env.hostile(sid)).alpha,
      emitted: 0,
    });
    this.pump(this.casts.get(sid)!, e.t);
  }

  /** Chiêu kích hoạt theo `S.FX` (lướt...): mọi sự kiện neo vào lúc nhận (hitAt = 0). */
  startFx(
    sid: string,
    actor: FxCaster,
    def: SkillDef | undefined,
    tl: FxTimeline,
    mine: boolean,
    dist: number,
    method: string | undefined,
  ): void {
    this.drop(sid);
    const tier = fxTierFor(this.env.quality(), mine);
    const pal = paletteOf(tl.palette ?? def?.method ?? (mine ? method : undefined));
    const events = fxEventsFor(tl, -1, this.env.variantOf(sid, def?.id ?? tl.skill));
    // Cảnh kích theo S.FX (đột phá...): nạp atlas sprite ngay lúc nhận tin, để nhịp tụ đầu timeline đủ thời gian cho ảnh về trước mốc vỡ.
    for (const e of events) if (e.type === 'mesh' && e.shape === 'sprite' && e.sprite) useSpriteGroup(spriteCell(e.sprite).group);
    const q = scheduleEvents(events, [0], tier).map((s, idx) => ({ ...s, idx, done: false }));
    const cast: Cast = {
      sid,
      actor,
      def: def ?? ({ id: tl.skill } as SkillDef),
      mine,
      tier,
      pal,
      q,
      clock: 0,
      seed: ++this.serial * 7.31,
      dist,
      firstHit: Infinity,
      mul: 1,
      amul: fxHierarchy(mine, this.env.staticOn(), this.env.hostile(sid)).alpha,
      emitted: 0,
    };
    // Không có đồng hồ animation của chiêu: chạy theo dt (đồng hồ dự phòng).
    this.casts.set(sid, cast);
    this.pump(cast, 0);
  }

  /**
   * Phát một timeline tại điểm bất kỳ (V5: FX quái, không phải chiêu người chơi). Luôn tính như của người khác (hạ một bậc chất lượng,
   * không khựng hình/rung/chớp). Mỗi lần phát một khóa riêng nên nhiều hiệu ứng chồng nhau không đè nhau.
   */
  startAt(tl: FxTimeline, o: FxAtOpts): void {
    const sid = `~mon${++this.serial}`;
    const tier = fxTierFor(this.env.quality(), !!o.mine);
    // Timeline RIÊNG của một quái/chiêu (`mon_*__<quái>…`) được chọn bảng màu riêng (vd. lôi tím cho Thú Mộ Tướng); timeline chung theo hệ của quái.
    const pal = paletteOf(tl.palette && tl.skill.includes('__') ? tl.palette : o.palette);
    const events = fxEventsFor(tl, -1, o.variant);
    const q = scheduleEvents(events, [o.hitAt ?? 0], tier).map((s, idx) => ({ ...s, idx, done: false }));
    const cast: Cast = {
      sid,
      actor: o.actor,
      def: { id: tl.skill } as SkillDef,
      mine: !!o.mine,
      tier,
      pal,
      q,
      clock: 0,
      seed: this.serial * 7.31,
      dist: 0,
      firstHit: Infinity,
      tgt: o.tgt,
      area: o.area,
      mul: o.mul ?? 1,
      amul: 1,
      delay: o.delay,
      variant: o.variant,
      emitted: 0,
    };
    this.casts.set(sid, cast);
    this.pump(cast, 0);
  }

  private tgtOf(c: Cast): FxTarget | null {
    return c.tgt !== undefined ? c.tgt : this.env.targetOf(c.sid);
  }

  private areaOf(c: Cast): { x: number; z: number; r: number } | null {
    return c.area ?? this.env.areaOf(c.sid);
  }

  /**
   * Động tác bị hủy (`cancel`) ở giây `t` của đồng hồ animation: chưa tới mốc trúng đầu thì bỏ cả đòn (không phát lưỡi liềm, khựng, rung,
   * chớp, âm cho cú trúng không xảy ra); hủy sau khi đã trúng (cắt phần thu về) thì giữ phần đuôi sau trúng. Trả true nếu đã bỏ.
   */
  cancel(sid: string, t: number): boolean {
    const c = this.casts.get(sid);
    if (!c || !cancelDropsCast(t, c.firstHit)) return false;
    this.casts.delete(sid);
    return true;
  }

  /** Bỏ các sự kiện chưa phát của `sid` (đòn kết thúc/bị hủy). Hiệu ứng đã phát tự tan. */
  drop(sid: string): void {
    this.casts.delete(sid);
  }

  /** `mineScale` (VS-1 `slowmo`): chỉ nhân cho đồng hồ chiêu của MÌNH; chiêu người khác và vạch báo/chiêu quái luôn `dt` thật. */
  update(dt: number, mineScale = 1): void {
    for (const c of this.casts.values()) {
      const clk = c.actor.model.performClock?.();
      if (clk && clk.skill === c.def.id) c.clock = clk.t;
      else c.clock += presentDt(c.mine, dt, mineScale);
      this.pump(c, c.clock);
      if (c.q.every((x) => x.done)) this.casts.delete(c.sid);
    }
    this.updateBlades(dt);
  }

  private pump(c: Cast, now: number): void {
    for (const s of c.q) {
      if (s.done || s.at > now) continue;
      s.done = true;
      this.play(c, s);
    }
  }

  // ---- hình học ----

  /** Hướng nhìn (yaw) của đòn: về phía mục tiêu nếu có, không thì theo mặt người ra chiêu. */
  private aim(c: Cast, tgt: FxTarget | null): number {
    return tgt ? Math.atan2(tgt.x - c.actor.x, tgt.z - c.actor.z) : c.actor.yaw;
  }

  /** Điểm neo (thế giới) với dịch cục bộ theo hướng `yaw`. */
  private anchor(
    c: Cast,
    at: FxAnchor,
    off: readonly number[] | undefined,
    yaw: number,
    tgt: FxTarget | null,
    out: THREE.Vector3,
    ahead = 1.2,
  ): THREE.Vector3 {
    const a = c.actor;
    if (at === 'target')
      out.set(tgt?.x ?? a.x + Math.sin(yaw) * 5, (tgt?.y ?? a.y) + (tgt?.chest ?? 1.1), tgt?.z ?? a.z + Math.cos(yaw) * 5);
    else if (at === 'area' && this.areaOf(c)) {
      const ar = this.areaOf(c)!;
      out.set(ar.x, (tgt?.y ?? a.y) + 0.03, ar.z);
    } else if (at === 'ground' || at === 'area')
      out.set(tgt?.x ?? a.x + Math.sin(yaw) * 5, (tgt?.y ?? a.y) + 0.03, tgt?.z ?? a.z + Math.cos(yaw) * 5);
    else if (at === 'origin' && this.env.originOf(c.sid)) {
      const o = this.env.originOf(c.sid)!;
      out.set(o.x, a.y + 1.15, o.z);
    } else if (at === 'ahead') out.set(a.x + Math.sin(yaw) * ahead, a.y + 1.15, a.z + Math.cos(yaw) * ahead);
    else out.set(a.x, a.y + 1.15, a.z);
    if (off) {
      const sx = Math.cos(yaw);
      const sz = -Math.sin(yaw);
      const m = c.mul;
      out.x += (sx * off[0]! + Math.sin(yaw) * off[2]!) * m;
      out.y += off[1]! * m;
      out.z += (sz * off[0]! + Math.cos(yaw) * off[2]!) * m;
    }
    return out;
  }

  private play(c: Cast, s: Queued): void {
    const ev = s.ev;
    if (import.meta.env.DEV) {
      this.log.push({
        skill: c.def.id,
        type: ev.type + (ev.type === 'mesh' ? ':' + ev.shape : ev.type === 'decal' ? ':' + ev.tex : ''),
        at: s.at,
        real: performance.now(),
      });
      if (this.log.length > 300) this.log.shift();
    }
    const tgt = this.tgtOf(c);
    switch (ev.type) {
      case 'mesh':
        this.mesh(c, ev, tgt, s.idx);
        break;
      case 'particles':
        this.particles(c, ev, tgt);
        break;
      case 'decal':
        this.decal(c, ev, tgt, s.idx);
        break;
      case 'trail':
        this.trail(c, ev);
        break;
      case 'hitstop':
        if (c.mine && this.env.hitStopOn()) c.actor.model.hit?.hitStop(ev.ms / 1000, 0);
        break;
      case 'shake':
        if (c.mine) {
          const yaw = this.aim(c, tgt);
          this.env.shake(ev.level, { x: Math.sin(yaw), z: Math.cos(yaw) });
        }
        break;
      case 'bolt': {
        const p = this.anchor(c, ev.at ?? 'ground', ev.offset, this.aim(c, tgt), tgt, _a);
        this.v.lightning(
          p.x,
          p.y,
          p.z,
          toneOf(c.pal, ev.tone ?? 'rim'),
          ev.scale ?? 1,
          ev.seed ?? Math.floor(c.seed * 100 + s.idx),
          0,
          ev.thick ?? 1,
          FLAGS.isoFxCompress ? BOLT_HEIGHT * ISO_BOLT_HEIGHT : BOLT_HEIGHT,
          !!ev.ink,
        );
        break;
      }
      case 'camera':
        if (c.mine) {
          this.env.camPull(ev.pull, ev.dur);
          if (ev.fov) this.env.camFov(ev.fov, ev.dur);
        }
        break;
      case 'slowmo':
        if (c.mine) this.env.slowmo(ev.scale, ev.ms);
        break;
      case 'vignette':
        if (c.mine && !this.env.staticOn()) this.env.vignette(ev.amount, ev.tone ?? 'dark', ev.ms);
        break;
      case 'soundAt':
        this.env.soundRate(ev.id, ev.gain ?? 1, c.sid, (ev.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (ev.jitter ?? 0)));
        break;
      case 'flash':
        if (c.mine && !this.env.staticOn()) this.env.flash(Math.min(0.3, ev.amount));
        break;
      case 'impact':
        if (c.mine && this.env.impactOn() && !this.env.staticOn()) this.env.impact(ev.frames, ev.tint ?? 'ink');
        break;
      case 'sound':
        this.env.sound(ev.id, ev.gain ?? 1, c.sid);
        break;
    }
  }

  // ---- mesh ----

  /** Camera chéo: dấu vòng sét ở chân tia (gộp các tia chồng nhau cùng điểm trong 0,15 s) để thấy điểm rơi từ trên xuống. `ink`: vòng theo tông thân (đọc được trên nền sáng) thay vì viền gần trắng. */
  private boltFoot(c: Cast, ev: FxMeshEvent, p: THREE.Vector3): void {
    const key = `${c.sid}:${Math.round(p.x * 2)},${Math.round(p.z * 2)}`;
    const now = performance.now();
    if (now - (this.footAt.get(key) ?? -1e9) < 150) return;
    this.footAt.set(key, now);
    if (this.footAt.size > 64) this.footAt.clear();
    const w = Array.isArray(ev.scale) ? ev.scale[0]! : (ev.scale ?? 1);
    const m = this.v.sigil(SIGIL_CIRCLE, p.x, p.z, 0, isoBoltFootRadius(w), 0, toneOf(c.pal, ev.ink ? 'body' : 'rim'), p.y + 0.16);
    m.fxA.x = 1;
    this.v.add(
      ISO_BOLT_FOOT_LIFE,
      (k) => {
        m.fxA.z = k < 0.2 ? 1 : 0;
        m.fxOpacity = Math.min(1, (1 - k) * 1.6) * (ev.ink ? 0.5 : 0.85);
      },
      () => this.v.drop(m),
    );
  }

  private footAt = new Map<string, number>();

  private mesh(c: Cast, ev: FxMeshEvent, tgt: FxTarget | null, idx: number): void {
    const yaw = this.aim(c, tgt);
    const geo = shapeGeometry(ev.shape);
    const kind0 = ev.shape === 'flip' && ev.flip && (FORGE_FLIPS as readonly string[]).includes(ev.flip) ? 'mapFlip' : shapeKind(ev.shape);
    // Sprite vẽ tay: mỗi nhóm atlas hướng tu một kind riêng (`sprite`, `sprite_loi`...); nạp atlas của nhóm khi lần đầu có chiêu của hướng đó hiện ra.
    const cell = kind0 === 'sprite' ? spriteCell(ev.sprite ?? 'hon_hand_claw') : null;
    const kind = cell
      ? cell.group === 'hon'
        ? 'sprite'
        : (`sprite_${cell.group}` as
            | 'sprite_loi'
            | 'sprite_kiem'
            | 'sprite_hp'
            | 'sprite_dao'
            | 'sprite_cth'
            | 'sprite_hai'
            | 'sprite_tinh'
            | 'sprite_lam'
            | 'sprite_dan'
            | 'sprite_guong'
            | 'sprite_dong'
            | 'sprite_kieu'
            | 'sprite_dp'
            | 'sprite_hq'
            | 'sprite_chung'
            | 'sprite_ngu'
            | 'sprite_canh'
            | 'sprite_kiep')
      : kind0;
    const isSprite = cell !== null;
    if (cell) useSpriteGroup(cell.group);
    const start = this.anchor(c, ev.at ?? 'self', ev.offset, yaw, tgt, new THREE.Vector3());
    if (FLAGS.isoFxCompress && isBoltGroundHit(ev.shape, ev.at)) this.boltFoot(c, ev, start);
    if (FLAGS.isoFxCompress && kind === 'card' && (ev.at ?? 'self') === 'self') {
      // Thẻ pháp tướng của người ra chiêu: đứng phía xa camera (trên người trên màn hình), không lệch sang bên đè lên đường/vật khác.
      const cp = this.env.camera().position;
      const b = isoBehind(cp.x, cp.z, c.actor.x, c.actor.z);
      start.x = b.x;
      start.z = b.z;
    }
    const end = ev.move ? this.anchor(c, ev.move.to, ev.move.offset ?? ev.offset, yaw, tgt, new THREE.Vector3(), ev.move.ahead ?? 8) : null;
    if (ev.awayFromCam) {
      // Phía xa camera so với người ra chiêu (hướng nhìn không biết trước): đối xứng qua người nếu đang ở phía camera.
      const cp = this.env.camera().position;
      const [sx, sz] = fxAwayFromCam(c.actor.x, c.actor.z, cp.x, cp.z, start.x, start.z);
      start.x = sx;
      start.z = sz;
      if (end) {
        const [ex, ez] = fxAwayFromCam(c.actor.x, c.actor.z, cp.x, cp.z, end.x, end.z);
        end.x = ex;
        end.z = ez;
      }
    }
    const s0 = Array.isArray(ev.scale) ? ev.scale : [ev.scale ?? 1, ev.scale ?? 1, ev.scale ?? 1];
    const sT0 = ev.scaleTo === undefined ? s0 : Array.isArray(ev.scaleTo) ? ev.scaleTo : [ev.scaleTo, ev.scaleTo, ev.scaleTo];
    // `fit: 'area'`: kích thước theo mét tính bằng bán kính vùng của chiêu (x, z).
    const fitR = ev.fit === 'area' ? (this.areaOf(c)?.r ?? 8) : 1;
    const gm = ev.fit === 'area' ? 1 : c.mul;
    const fitS = (v: number[]) => [v[0]! * fitR * gm, v[1]! * gm, v[2]! * fitR * gm];
    const dur = ev.untilDelay && c.delay ? c.delay : ev.dur;
    const s0f = fitS(s0);
    const sT = fitS(sT0);
    const seed = ((ev.seed ?? c.seed + idx * 1.7) % 50) + 0.37;
    const color = toneOf(c.pal, ev.tone);
    const alpha = (ev.alpha ?? 0.95) * c.amul * (FLAGS.isoFxCompress && kind === 'card' ? ISO_CARD_ALPHA : 1);
    const sweep = ev.sweep ?? 0.35;
    const erodeFrom = ev.erodeFrom ?? 0.5;
    const spin = (ev.spin ?? 0) * DEG;
    // Hướng thân hình: theo hướng bay nếu có `move` (mũi dài +Z hướng về đích), không thì theo hướng nhìn.
    const baseQ = new THREE.Quaternion();
    if (end && !ev.keepUp) {
      _a.subVectors(end, start);
      if (_a.lengthSq() > 1e-4) baseQ.setFromUnitVectors(AXIS_Z, _a.normalize());
    } else baseQ.setFromAxisAngle(UP, yaw);
    const rotQ = new THREE.Quaternion().setFromEuler(
      _e.set((ev.rot?.[0] ?? 0) * DEG, (ev.rot?.[1] ?? 0) * DEG, (ev.rot?.[2] ?? 0) * DEG, 'YXZ'),
    );
    baseQ.multiply(rotQ);

    const main = this.v.fx(geo, color, alpha, kind);
    this.style(main, c.pal, ev, kind);
    // Tấm nằm trên đất (khói) vẽ trước mọi hình đứng để không phủ lên gai/lưỡi liềm.
    if (kind === 'decal') main.renderOrder = -1;
    else if (kind === 'crystal') main.renderOrder = 1;
    const shade = kind === 'toon' && ev.shadow !== false ? this.v.fx(geo, c.pal.shadow, alpha, 'toon') : null;
    if (shade) {
      shade.fxA.w = 1;
      shade.renderOrder = -2;
    }
    const cam = this.env.camera();
    // `align: 'aim'`: góc trên màn hình của hướng ngắm (trục +x của tranh dọc theo hướng đó).
    let alignAng = 0;
    if (ev.align === 'aim') {
      const camR = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const camU = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      alignAng = Math.atan2(dx * camU.x + dz * camU.z, dx * camR.x + dz * camR.z);
    }
    // Camera chéo: nén chiều cao thật (mét) của hình đứng cao; chiều cao gốc đo từ bounding box y của lưới.
    const isoK = FLAGS.isoFxCompress;
    if (isoK && !geo.boundingBox) geo.computeBoundingBox();
    const baseH = isoK && geo.boundingBox ? geo.boundingBox.max.y - geo.boundingBox.min.y : 1;
    const cardK = isoK && kind === 'card' ? ISO_CARD_SCALE : 1;
    const lift = { x: NaN, z: NaN, r: 0, y: -Infinity };
    const place = (m: FxMesh, k: number, grow: number, off: number) => {
      const e = easeOut(k);
      const lerpS = (i: number) => s0f[i]! + (sT[i]! - s0f[i]!) * e;
      m.scale.set(
        lerpS(0) * grow * cardK,
        (isoK ? isoFxScaleY(ev.shape, lerpS(1) * grow, baseH) : lerpS(1) * grow) * cardK,
        lerpS(2) * grow,
      );
      if (end) {
        const ek = ev.move!.ease === 'in' ? easeIn(k) : ev.move!.ease === 'linear' ? k : easeOut(k);
        m.position.lerpVectors(start, end, ek);
      } else if (ev.follow) {
        this.anchor(c, ev.at ?? 'self', ev.offset, yaw, this.tgtOf(c) ?? tgt, m.position);
      } else m.position.copy(start);
      if (ev.orbit) {
        const a = (ev.orbit.phase ?? 0) + ev.orbit.w * k * dur;
        m.position.x += Math.cos(a) * ev.orbit.r;
        m.position.z += Math.sin(a) * ev.orbit.r;
      }
      if (ev.billboard ?? (kind === 'flip' || kind === 'mapFlip' || ev.shape === 'sprite')) {
        // Quay mặt về camera; `rot[2]` xoay thêm trong mặt phẳng hình (nét chém chéo).
        m.quaternion.copy(cam.quaternion);
        if (alignAng || ev.rot?.[2]) m.quaternion.multiply(_q.setFromAxisAngle(AXIS_Z, alignAng + (ev.rot?.[2] ?? 0) * DEG));
      } else {
        m.quaternion.copy(baseQ);
        if (spin) m.quaternion.multiply(_q.setFromAxisAngle(AXIS_Z, spin * k * dur));
      }
      if (off) m.position.addScaledVector(_c.set(0, -1, 0), off);
      // Tấm nằm trên đất nâng lên chút để không chìm vào nền sân lát đá (cao hơn địa hình vài cm). Tấm LỚN trên nền dốc nhẹ thì nửa phía cao vẫn chìm
      // (Diễn Võ Trường: vòng pháp trận vàng mất nửa phải) nên nâng tiếp lên trên điểm cao nhất quanh nó; tính lại chỉ khi tấm dời quá 1 m hoặc lớn thêm 25%.
      if (kind === 'decal') {
        m.position.y += 0.11;
        const r = Math.max(m.scale.x, m.scale.z) * 0.5;
        if (r > 1.5) {
          if (Math.abs(m.position.x - lift.x) > 1 || Math.abs(m.position.z - lift.z) > 1 || r > lift.r * 1.25) {
            lift.x = m.position.x;
            lift.z = m.position.z;
            lift.r = r;
            lift.y = sigilGroundY(lift.x, lift.z, r);
          }
          // Chỉ nâng tấm đang nằm sát đất (pháp trận lơ lửng trên cao giữ nguyên).
          if (m.position.y < lift.y && lift.y - m.position.y < 1.5) m.position.y = lift.y;
        }
      }
    };
    this.v.track(
      dur,
      (k) => {
        const head = sweep > 0 ? Math.min(1, k / sweep) * 1.06 : 1.06;
        const erode = sstep(erodeFrom, 1, k) * 1.1;
        for (const [m, isShade] of [
          [main, false],
          [shade, true],
        ] as const) {
          if (!m) continue;
          const lag = isShade ? 0.04 : 0;
          if (kind === 'toon') {
            m.fxA.x = Math.min(1.06, Math.max(0, (k - lag) / Math.max(sweep, 1e-3)) * 1.06);
            m.fxA.y = sstep(erodeFrom, 1, k - lag) * 1.1;
          } else if (kind === 'crystal') {
            m.fxA.x = Math.min(1.2, (k / Math.max(sweep, 1e-3)) * 1.2);
            m.fxA.y = erode;
          } else if (kind === 'card') {
            m.fxA.x = Math.min(1.2, (k / Math.max(sweep, 1e-3)) * 1.2);
            m.fxA.y = erode;
          } else if (isSprite) {
            // Sprite vẽ tay: hiện cả hình ngay, tan DẦN theo tuyến tính (khói mỏng đi từ `erodeFrom`), không dùng smoothstep nên khung +150 ms đã thấy thưa.
            m.fxA.y = Math.min(1.1, Math.max(0, (k - erodeFrom) / Math.max(1e-3, 1 - erodeFrom)) * 1.1);
          } else if (kind === 'burst') {
            m.fxA.x = easeOut(Math.min(1, k * 1.2));
            m.fxA.y = Math.min(1, k * k * 1.4);
          } else if (kind === 'decal') {
            m.fxA.x = easeOut(Math.min(1, k / Math.max(sweep, 0.2)));
            m.fxA.y = sstep(erodeFrom, 1, k);
          } else if (kind === 'flip') {
            m.fxA.x = Math.max(0, (FLIP_ATLASES as readonly string[]).indexOf(ev.flip ?? 'ink_smoke'));
          } else if (kind === 'mapFlip') {
            m.fxA.x = forgeFlipIndex(ev.flip ?? 'ice_flip');
          }
          m.fxK = k;
          place(m, k, isShade ? 1.08 : 1, isShade ? 0.03 * (s0[0]! + 0.5) : 0);
          if (ev.camFade) m.fxOpacity = alpha * this.camClear(c, cam, m.position);
        }
        void head;
      },
      () => {
        this.v.drop(main);
        if (shade) this.v.drop(shade);
      },
      c.mine,
    );
    main.fxA.z = seed;
    // Tấm flipbook Codex: chọn đúng tấm ngay khung đầu (trước lần cập nhật đầu `fxA.x` còn 0 = tấm đầu tiên).
    if (kind === 'mapFlip') main.fxA.x = forgeFlipIndex(ev.flip ?? 'ice_flip');
    if (shade) shade.fxA.z = seed;
    // Khung đầu: đặt ngay để không lóe một khung ở gốc.
    place(main, 0, 1, 0);
    if (shade) place(shade, 0, 1.08, 0.03);
    if (ev.camFade) main.fxOpacity = alpha * this.camClear(c, cam, main.position);
  }

  /**
   * Độ hiện của khối `camFade`: ẩn khi nằm giữa camera và NGƯỜI RA CHIÊU, hoặc giữa camera và MỤC TIÊU của đòn (chỉ xét khối trong
   * `CAM_FADE_TGT` m quanh mục tiêu, để mục tiêu cũ ở xa không làm ẩn nhầm). Lấy mức ẩn nhiều hơn.
   */
  private camClear(c: Cast, cam: THREE.Camera, p: THREE.Vector3): number {
    let f = fxCamFade(cam.position.x - c.actor.x, cam.position.z - c.actor.z, p.x - c.actor.x, p.z - c.actor.z);
    const tgt = this.tgtOf(c);
    if (tgt && Math.hypot(p.x - tgt.x, p.z - tgt.z) < CAM_FADE_TGT)
      f = Math.min(f, fxCamFade(cam.position.x - tgt.x, cam.position.z - tgt.z, p.x - tgt.x, p.z - tgt.z));
    return f;
  }

  /** Ghi màu viền, độ rách và bảng màu vào tham số của lưới. */
  private style(m: FxMesh, pal: FxPalette, ev: FxMeshEvent, kind: string): void {
    const isSprite = kind.startsWith('sprite');
    const cell = isSprite ? spriteCell(ev.sprite ?? 'hon_hand_claw') : null;
    _col.setHex(pal.rim);
    m.fxB.set(_col.r, _col.g, _col.b, ev.ragged ?? 0.5);
    m.fxA.w =
      kind === 'toon' && ev.ink
        ? 2
        : kind === 'decal'
          ? DECAL_SMOKE
          : kind === 'card'
            ? ev.card === 'phoenix'
              ? 1
              : ev.card === 'ghost'
                ? 2
                : ev.card === 'colossus'
                  ? 6
                  : ev.card === 'fist'
                    ? 7
                    : 0
            : isSprite
              ? (cell?.idx ?? 0)
              : kind === 'burst' && ev.cross
                ? 1
                : 0;
    m.fxA.z = ev.seed ?? 0;
    // Sprite: `fxA.x` chọn kiểu tô theo tiền tố tên: 0 = âm hồn tím mực, 1 = lôi (viền mực chàm, lõi trắng xanh), 2 = kiếm (viền mực lam lục, thân xanh ngọc, viền bạc),
    // 3 = hộ pháp (vàng đất), 4 = thủy (chàm → xanh biển → bọt trắng), 5 = nguyệt (thép sẫm → bạc → trắng), 6 = xương cot_ (bảng kim lạnh),
    // 7 = đất/đá/độc tho_/doc_ (bảng nâu, giữ phần ngả lục), 8 = sét tím tim_ (nguyên màu), 9 = đao dao_ (than thép), 10 = đan dan_ (lục), 11 = cổ thần cth_ (nâu sẫm + hổ phách).
    if (isSprite) {
      const sn = ev.sprite ?? '';
      m.fxA.x = ev.spriteStyle ?? SPRITE_STYLE[sn.slice(0, sn.indexOf('_') + 1)] ?? 0;
    }
  }

  // ---- hạt ----

  private particles(c: Cast, ev: FxParticleEvent, tgt: FxTarget | null): void {
    const yaw = this.aim(c, tgt);
    const p = this.anchor(c, ev.at ?? 'target', ev.offset, yaw, tgt, _a);
    // Preset đồ họa cao hơn: thêm hạt cho chiêu của mình (Cao hiệu ứng), hạt nhỏ lại để không lóa; trần 1.500 hạt cho cả chiêu.
    const q = this.env.quality();
    const dens = q === 'high' && c.mine ? this.v.particles.density : 1;
    const n = emitCount(ev.n, q, c.mine, this.v.particles.density, c.emitted);
    c.emitted += n;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const color = toneOf(c.pal, ev.tone ?? (ev.kind === 'shard' ? 'core' : ev.kind === 'dust' ? 'body' : 'rim'));
    const layer = ev.kind === 'dust' ? 'dust' : 'glow';
    const dir = ev.back ? -1 : 1;
    const pm = Math.sqrt(c.mul);
    const psz = ev.size * pm * densitySize(dens);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.35) * Math.PI * 0.5;
      const rnd = ev.speed * pm * (0.45 + Math.random() * 0.75);
      // Hướng: nón quanh hướng tiến, độ tỏa `spread` 0 (thẳng) → 1 (mọi hướng).
      const rx = Math.cos(ang) * Math.cos(el);
      const ry = Math.sin(el) * 0.9 + 0.2;
      const rz = Math.sin(ang) * Math.cos(el);
      const sp = ev.spread;
      const vx = (fx * dir * (1 - sp) + rx * sp) * rnd;
      const vz = (fz * dir * (1 - sp) + rz * sp) * rnd;
      const vy = ry * sp * rnd;
      const col = i % 5 === 0 ? c.pal.rim : color;
      const grav = ev.grav ?? (ev.kind === 'shard' ? 9 : ev.kind === 'petal' ? 0.6 : 2);
      const life = ev.life * (0.7 + Math.random() * 0.5);
      if (ev.inward) {
        // Tụ khí: sinh quanh gốc rồi bay vào tâm, tới nơi đúng lúc hết tuổi.
        const r = ev.speed * pm * life;
        const ox = rx * r;
        const oy = ry * r * 0.8;
        const oz = rz * r;
        this.v.particles.emit(
          layer,
          p.x + ox,
          p.y + oy,
          p.z + oz,
          -ox / life,
          -oy / life,
          -oz / life,
          life,
          psz,
          psz * 0.2,
          col,
          0.9,
          0,
          0.001,
        );
        continue;
      }
      this.v.particles.emit(layer, p.x, p.y, p.z, vx, vy, vz, life, psz, psz * 0.15, col, 0.95, grav, 1.4);
    }
  }

  // ---- decal ----

  private decal(c: Cast, ev: FxDecalEvent, tgt: FxTarget | null, idx: number): void {
    if (this.decals >= DECAL_MAX) return;
    const yaw = this.aim(c, tgt);
    const gnd = ev.at === 'target' || ev.at === 'ground' ? tgt : null;
    const at = this.anchor(c, ev.at ?? 'target', ev.offset, yaw, tgt, new THREE.Vector3());
    at.y = (gnd ? gnd.y : c.actor.y) + 0.14 + Math.min(0.5, Math.max(0, ev.lift ?? 0));
    // Decal lớn trên nền dốc nhẹ: tấm phẳng ở độ cao người ra chiêu thì phần phía đất cao bị chìm (Diễn Võ Trường: vòng phù văn 6,3 m của Thiên Kiếm Vũ
    // khuyết một múi). Nâng lên trên điểm cao nhất quanh nó.
    if (ev.r * c.mul > 1.5) at.y = Math.max(at.y, sigilGroundY(at.x, at.z, ev.r * c.mul));
    const kind =
      ev.tex === 'crack'
        ? ev.ink
          ? DECAL_CRACK_INK
          : DECAL_CRACK
        : ev.tex === 'rune'
          ? ev.ink
            ? DECAL_RUNE_INK
            : DECAL_RUNE
          : ev.tex === 'strike'
            ? DECAL_STRIKE
            : DECAL_SCORCH;
    const mapped = (FORGE_DECALS as readonly string[]).includes(ev.tex);
    const m = this.v.fx(
      QUAD_XZ,
      toneOf(c.pal, ev.tone),
      ev.alpha ?? 0.95,
      mapped ? (ev.top ? 'mapDecalTop' : 'mapDecal') : ev.top ? 'decalTop' : 'decal',
    );
    _col.setHex(c.pal.rim);
    m.fxB.set(_col.r, _col.g, _col.b, mapped && ev.strip ? -(ev.strip[0] / ev.strip[1]) : mapped && ev.sector ? ev.sector * DEG : 0);
    m.fxA.z = (c.seed + idx * 3.3) % 40;
    m.fxA.w = mapped ? forgeDecalIndex(ev.tex) : kind;
    m.renderOrder = -3;
    const aimed = ev.sector || ev.strip;
    const baseYaw = aimed ? yaw + (ev.yaw ?? 0) * DEG : (ev.yaw ?? (c.seed * 57) % 360) * DEG;
    m.position.copy(at);
    m.quaternion.setFromAxisAngle(UP, baseYaw);
    if (mapped && ev.strip) {
      // Dải chữ nhật: quad phủ đúng dài × rộng (mét thật), tâm dịch tới giữa dải theo hướng vùng.
      m.position.x += Math.sin(baseYaw) * ev.strip[0] * 0.5;
      m.position.z += Math.cos(baseYaw) * ev.strip[0] * 0.5;
      m.scale.set(ev.strip[1] * 0.5, 1, ev.strip[0] * 0.5);
    } else m.scale.setScalar(ev.r * c.mul);
    const dur = ev.untilDelay && c.delay ? c.delay : ev.dur;
    const grow = Math.max(0.05, ev.growUntilDelay && c.delay ? c.delay : (ev.grow ?? 0.15));
    const swing = ev.sector && ev.swing ? ev.swing : null;
    const swingYaw = yaw;
    const swingDur = Math.max(0.05, ev.swingDur ?? 0.3);
    // Khung đầu (trước lần cập nhật đầu): đã mọc gần xong nếu `grow` ngắn, để vùng nổ hiện ngay lúc trúng (+0 ms) thay vì trống.
    m.fxA.x = easeOut(Math.min(1, 0.016 / grow));
    m.fxK = 1;
    this.decals++;
    this.v.track(
      dur,
      (k) => {
        const t = k * dur;
        m.fxA.x = easeOut(Math.min(1, t / grow));
        m.fxA.y = sstep(0.55, 1, k);
        m.fxK = Math.max(0, 1 - k * 1.15);
        // Tia quét: một decal hẹp xoay từ `swing[0]` sang `swing[1]` độ trong `swingDur` giây (thay nhiều decal, vì trần DECAL_MAX).
        if (swing)
          m.quaternion.setFromAxisAngle(UP, swingYaw + (swing[0] + (swing[1] - swing[0]) * easeOut(Math.min(1, t / swingDur))) * DEG);
      },
      () => {
        this.decals--;
        this.v.drop(m);
      },
      c.mine,
    );
  }

  // ---- vệt kiếm bám xương ----

  private trail(c: Cast, ev: Extract<FxEvent, { type: 'trail' }>): void {
    if (!c.actor.model.bladePoints || !bladeVisible(c.mine, c.dist)) return;
    const color = toneOf(c.pal, ev.tone);
    const rib = this.v.trails.openBlade(c.sid, color);
    if (!rib) return;
    this.jobs.push({ sid: c.sid, actor: c.actor, t: 0, end: ev.dur, rib, color });
  }

  private updateBlades(dt: number): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i]!;
      j.t += dt;
      if (j.t > j.end || !j.rib) {
        if (j.rib) j.rib.sampling = false;
        this.jobs.splice(i, 1);
        continue;
      }
      if (j.actor.model.bladePoints?.(_b, _c)) j.rib.push(_b, _c);
    }
  }

  dispose(): void {
    for (const j of this.jobs) if (j.rib) j.rib.sampling = false;
    this.jobs.length = 0;
    this.casts.clear();
  }
}
