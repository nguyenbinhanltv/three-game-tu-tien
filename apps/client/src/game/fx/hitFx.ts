// Hiệu ứng TRÚNG ĐÒN CHUNG (Họa Pháp Lô 2): vết va theo kiểu vũ khí của người đánh, chí mạng, chặn/hấp thụ, quái đánh trúng người, ngắt chú/mất thế,
// nhịp hồi máu. Phát timeline `data/fx/fx_hit_*.json`, `fx_break`, `fx_heal*` (sinh bởi `tools/vfx-forge/trung-don.mjs`) bằng `FxRunner.startAt` tại nạn nhân.
// Màu: vết va tô theo HƯỚNG TU của người đánh; đòn của quái tô theo HỆ của quái (không đỏ/cam: đỏ chỉ dành cho vạch báo); chặn/hồi có bảng riêng.
// Chỉ là lớp hình (ai trúng, bao nhiêu máu do server quyết định). Hiệu ứng nhỏ, lặp rất nhiều nên có giãn cách theo nạn nhân và bỏ khi xa/đông.

import { FX_TIMELINE, pathOf } from '@dtl/content';
import type { FxTimeline } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import type { FxRunner, FxTarget } from './fxTimeline';
import { OTHERS_FX_LIVE_MAX } from './fxBudget';

/** Xa hơn mức này (m, tới camera) thì không phát. */
export const HIT_FX_DIST = 55;
/** Giãn cách tối thiểu (giây) giữa hai lần cùng loại trên cùng một nạn nhân. */
export const HIT_GAP = { debris: 0.35, hit: 0.12, crit: 0.25, block: 0.3, mon: 0.3, brk: 0.5, evade: 0.4, heal: 1.2, tick: 0.9 } as const;
/** Số lưới FX đang sống từ mức này trở lên thì bỏ mảnh vụn (kể cả của mình). */
export const DEBRIS_LIVE_MAX = 20;
/** Lượng hồi từ chừng này phần máu tối đa trở lên thì nở búp sen (`fx_heal`); nhỏ hơn chỉ là chùm cánh sen (`fx_heal_tick`). */
export const HEAL_BIG_FRAC = 0.08;

export type HitKind = 'cut' | 'smash' | 'stab';

/** Kiểu vết va theo hướng tu của người đánh: kiếm/đao xẻ, thể tu/cổ thần đập, còn lại (pháp, hồn, cổ, lôi, trận, đan) xuyên. */
export function hitKindOf(method: string | undefined): HitKind {
  const id = pathOf(method)?.id;
  if (id === 'kiem_tu' || id === 'dao_tu') return 'cut';
  if (id === 'the_tu' || id === 'co_than') return 'smash';
  return method ? 'stab' : 'cut';
}

/** Bảng màu thân hiệu ứng của quái theo hệ, KHÔNG đỏ/cam (hệ hỏa dùng bảng lửa ma tím; đỏ chỉ dành cho vạch báo). */
export function monHitPalette(elem: string | undefined): string {
  if (elem === 'hoa') return 'mon_hoa_am';
  return elem && FX_PALETTE['mon_' + elem] ? 'mon_' + elem : 'hit_dich';
}

export interface HitPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Cao tới ngực (m). */
  chest: number;
  /** Hệ số cỡ theo thân (người = 1, boss tới 1,6). */
  scale?: number;
}

interface HitFxEnv {
  camera(): { position: { x: number; z: number } };
  live(): number;
}

export class HitFx {
  private last = new Map<string, number>();
  /** Phòng thử (`?vfxlab=1` đang bật `monLab`): bỏ hiệu ứng do tin server kích, chỉ lời gọi có `force` mới vẽ. */
  lab = false;
  /** Nhật ký dev: `__game.hitFx.log`. */
  readonly log: { key: string; id: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: HitFxEnv,
  ) {}

  private ok(key: string, v: HitPoint, gap: number, mine: boolean, force: boolean): FxTimeline | undefined {
    const tl = FX_TIMELINE.get(key);
    if (!tl) return undefined;
    if (force) return tl;
    if (this.lab) return undefined;
    const c = this.env.camera().position;
    if (Math.hypot(v.x - c.x, v.z - c.z) > HIT_FX_DIST) return undefined;
    // Đám đông: bỏ phần của người khác trước; đòn dính tới mình luôn giữ.
    if (!mine && this.env.live() >= OTHERS_FX_LIVE_MAX) return undefined;
    const k = key + v.id;
    const now = performance.now() / 1000;
    const prev = this.last.get(k);
    if (prev !== undefined && now - prev < gap) return undefined;
    this.last.set(k, now);
    if (this.last.size > 256) for (const [kk, at] of this.last) if (now - at > 5) this.last.delete(kk);
    return tl;
  }

  private play(tl: FxTimeline, v: HitPoint, from: { x: number; z: number } | null, palette: string, mine: boolean): void {
    const tgt: FxTarget = { x: v.x, y: v.y, z: v.z, chest: v.chest };
    // Hướng đòn = người đánh → nạn nhân (sprite `align: aim` nằm dọc hướng này); không rõ người đánh thì theo hướng camera nhìn tới.
    const c = this.env.camera().position;
    const src = from ?? c;
    const yaw = Math.atan2(v.x - src.x, v.z - src.z);
    this.runner.startAt(tl, {
      actor: { x: from?.x ?? v.x - Math.sin(yaw), y: v.y, z: from?.z ?? v.z - Math.cos(yaw), yaw, model: {} },
      palette,
      tgt,
      mul: Math.min(1.6, Math.max(0.8, v.scale ?? 1)),
      mine,
    });
    if (import.meta.env.DEV) {
      this.log.push({ key: tl.skill, id: v.id, at: performance.now() });
      if (this.log.length > 200) this.log.shift();
    }
  }

  /**
   * Phòng thử (`__vfxlab.cast('fx_hit_*')`): phát thẳng một timeline của nhóm qua đúng đường `play`, bỏ giãn cách/khoảng cách.
   * `palette` = id công pháp (tô theo hướng tu) hoặc khóa `FX_PALETTE`.
   */
  labPlay(key: string, v: HitPoint, from: { x: number; z: number } | null, palette: string): boolean {
    const tl = FX_TIMELINE.get(key);
    if (tl) this.play(tl, v, from, palette, true);
    return !!tl;
  }

  /** Đòn của NGƯỜI CHƠI trúng `v`: vết va theo hướng tu (`method`) của người đánh; `crit` thêm khe nứt chí mạng. `mine` = đòn của mình hoặc mình là nạn nhân. */
  hit(v: HitPoint, from: { x: number; z: number } | null, method: string | undefined, crit: boolean, mine: boolean, force = false): void {
    const pal = method ?? 'hit_chung';
    const tl = this.ok('fx_hit_' + hitKindOf(method), v, HIT_GAP.hit, mine, force);
    if (tl) this.play(tl, v, from, pal, mine);
    if (!crit) return;
    const ct = this.ok('fx_hit_crit', v, HIT_GAP.crit, mine, force);
    if (ct) this.play(ct, v, from, pal, mine);
  }

  /**
   * Mảnh vụn theo CHẤT LIỆU thân quái (thịt: vệt mực; đá: mảnh đá + bụi; kim: tia lửa thép), văng theo hướng đòn. Lớp phụ của vết va:
   * chỉ phát cho đòn dính tới mình (`mine`), giãn 0,35 s mỗi quái.
   */
  debris(v: HitPoint, from: { x: number; z: number } | null, material: 'flesh' | 'stone' | 'metal', mine: boolean, force = false): void {
    if (!mine && !force) return;
    // Lớp trang trí: chiêu vùng của mình trúng nhiều quái thì bỏ trước, để không đẩy số lưới sống qua ngưỡng tắt hình quái (`OTHERS_FX_LIVE_MAX`).
    if (!force && this.env.live() >= DEBRIS_LIVE_MAX) return;
    const tl = this.ok('fx_debris_' + material, v, HIT_GAP.debris, mine, force);
    if (tl) this.play(tl, v, from, 'deb_' + material, mine);
  }

  /** Đòn bị chặn/hấp thụ hết (sát thương 0): tấm khiên nứt trước ngực nạn nhân. */
  block(v: HitPoint, from: { x: number; z: number } | null, mine: boolean, force = false): void {
    const tl = this.ok('fx_hit_block', v, HIT_GAP.block, mine, force);
    if (tl) this.play(tl, v, from, 'hit_guard', mine);
  }

  /** QUÁI đánh trúng người: vệt cào (hoặc dấu cắn) tô theo hệ của quái. */
  monStrike(
    v: HitPoint,
    from: { x: number; z: number } | null,
    elem: string | undefined,
    bite: boolean,
    mine: boolean,
    force = false,
  ): void {
    const tl = this.ok(bite ? 'fx_hit_bite' : 'fx_hit_mon', v, HIT_GAP.mon, mine, force);
    if (tl) this.play(tl, v, from, monHitPalette(elem), mine);
  }

  /** Nạn nhân vừa NÉ trúng (server báo đòn bị khung bất tử bỏ qua): tàn ảnh mực mờ. */
  evade(v: HitPoint, mine: boolean, force = false): void {
    const tl = this.ok('fx_evade', v, HIT_GAP.evade, mine, force);
    if (tl) this.play(tl, v, null, 'hit_chung', mine);
  }

  /** Ngắt chú / mất thế: sợi xích chú đứt trước ngực boss, tô theo hướng tu của người phá (không biết thì bảng chung). */
  brk(v: HitPoint, method: string | undefined, mine: boolean, force = false): void {
    const tl = this.ok('fx_break', v, HIT_GAP.brk, mine, force);
    if (tl) this.play(tl, v, null, method ?? 'hit_chung', mine);
  }

  /** Uống đan / nhận hồi từ vật phẩm (`FxMsg` `potion`): sen mực nhỏ nở ở chân, nhịp riêng với hồi theo chiêu. */
  potion(v: HitPoint, mine: boolean, force = false): void {
    const tl = this.ok('fx_potion', v, HIT_GAP.heal, mine, force);
    if (tl) this.play(tl, v, null, 'hit_heal', mine);
  }

  /** `v` vừa được đan hồi LINH LỰC (`FxMsg` `potion` có `v: 'mp'`): xoáy linh khí thu về đan điền rồi chùm giọt lam bật lên; khác hồi máu cả hình lẫn màu. */
  mana(v: HitPoint, mine: boolean, force = false): void {
    const tl = this.ok('fx_mana', v, HIT_GAP.heal, mine, force);
    if (tl) this.play(tl, v, null, 'hit_mana', mine);
  }

  /** `v` vừa nhận hồi máu: lượng lớn nở búp sen (mốc nhấn 0,15 s), nhỏ chỉ chùm cánh sen. */
  heal(v: HitPoint, big: boolean, mine: boolean, force = false): void {
    const tl = big ? this.ok('fx_heal', v, HIT_GAP.heal, mine, force) : this.ok('fx_heal_tick', v, HIT_GAP.tick, mine, force);
    if (tl) this.play(tl, v, null, 'hit_heal', mine);
  }
}
