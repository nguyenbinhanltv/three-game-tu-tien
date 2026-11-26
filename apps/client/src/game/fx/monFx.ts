// Hiệu ứng của quái / tinh anh / boss (VFX-V5): phát dòng thời gian `data/fx/mon_*.json` bằng `FxRunner.startAt` tại điểm đúng
// (chân quái, người bị đánh, tâm vùng nổ). Màu theo ngũ hành của quái (`mon_<elem>` ở render/vfx/palette.ts), bảng "nguy hiểm"
// tách khỏi bảng "của ta". Chỉ là lớp hình: ai trúng, sát thương, hồi chiêu vẫn do server quyết định (HazardMsg/DmgMsg/BoltMsg không đổi).
// Ngân sách: bỏ qua khi xa (> MON_FX_DIST) hoặc khi lưới FX sống quá nhiều (đám đông).

import { MON_FX, MONSTER } from '@dtl/content';
import type { FxTimeline, HazardMsg } from '@dtl/shared';
import { forgeTexLoaded } from '../../render/vfx/forgeTex';
import { monPaletteKey } from '../../render/vfx/palette';
import { groundAt } from '../../base/levelCtx';
import type { FxCaster, FxRunner, FxTarget } from './fxTimeline';
import { OTHERS_FX_LIVE_MAX } from './fxBudget';
import { moveOfHazard } from './monMove';

/** Xa hơn mức này (m, tới camera) thì không phát FX quái. */
const MON_FX_DIST = 60;
/** Hệ ngũ hành theo loại vùng khi không biết quái thả vùng. */
const ELEM_OF_KIND: Record<string, string> = { fire: 'hoa', frost: 'thuy', lightning: 'kim', spirit: 'moc' };

/** Hệ số cỡ theo chiều cao quái (m): thằn lằn nhỏ ≈ 0,8, người ≈ 1, boss 2–3. */
export function monScale(height: number): number {
  return Number.isFinite(height) ? Math.min(3, Math.max(0.7, height / 1.7)) : 1;
}

/** Hệ số cỡ của vùng nổ theo bán kính: tính cho `mon_boom_circle`/`mon_warn` (cỡ gốc 4 m) và đường/nón (cỡ gốc 8 m). */
export function hazardMul(r: number, base: number): number {
  return Math.min(4, Math.max(0.5, r / base));
}

interface MonLike {
  id: string;
  s: { t: string };
  x: number;
  y: number;
  z: number;
  yaw: number;
  model: { height: number };
}

interface MonFxEnv {
  camera(): { position: { x: number; z: number } };
  live(): number;
}

export class MonFx {
  private last = new Map<string, number>();
  /** Phòng quay (dev, `tools/perf shots:vfx`): bỏ FX/đạn/vùng thật từ server để cảnh quay sạch; lời gọi tổng hợp đặt `bypass`. */
  lab = false;
  bypass = false;
  /** Nhật ký dev: `__game.monFx.log`. */
  readonly log: { key: string; id: string; at: number }[] = [];

  constructor(
    private runner: FxRunner,
    private env: MonFxEnv,
  ) {}

  private near(x: number, z: number): boolean {
    if (this.lab && !this.bypass) return false;
    const c = this.env.camera().position;
    return Math.hypot(x - c.x, z - c.z) <= MON_FX_DIST && this.env.live() < OTHERS_FX_LIVE_MAX;
  }

  private gap(key: string, id: string, gap: number): boolean {
    const k = key + id;
    const now = performance.now() / 1000;
    const prev = this.last.get(k);
    if (prev !== undefined && now - prev < gap) return false;
    this.last.set(k, now);
    if (this.last.size > 256) for (const [kk, at] of this.last) if (now - at > 5) this.last.delete(kk);
    return true;
  }

  private tl(key: string): FxTimeline | undefined {
    return MON_FX.get(key);
  }

  /**
   * Timeline riêng của một chiêu quái (V-P9): thử `<khóa>__<quái>__<chiêu>`, rồi `<khóa>__<quái>`, rồi khóa chung. Chiêu đoán từ hình + bán kính + thời gian báo
   * của vạch (`moveOfHazard`) vì HazardMsg không mang tên chiêu. Không có timeline riêng thì giữ đúng hành vi cũ.
   */
  private tlFor(key: string, src: MonLike | undefined, h?: Pick<HazardMsg, 'r' | 'delay' | 'sh'>): FxTimeline | undefined {
    if (src) {
      const mv = h ? moveOfHazard(MONSTER.get(src.s.t), h) : undefined;
      const own = (mv ? this.tl(`${key}__${src.s.t}__${mv}`) : undefined) ?? this.tl(`${key}__${src.s.t}`);
      if (own) return own;
    }
    return this.tl(key);
  }

  /** Chiêu này có timeline vạch báo RIÊNG (không phải timeline chung theo hệ)? Khi có, `room.ts` bỏ pháp trận cũ (V-P9). */
  ownWarn(h: Pick<HazardMsg, 'r' | 'delay' | 'sh'>, src: MonLike | undefined): boolean {
    if (!src || !(h.r > 0) || !(h.delay > 0)) return false;
    const key = !h.sh ? 'mon_warn' : h.sh === 'rect' ? 'mon_warn_line' : 'mon_warn_cone';
    const mv = moveOfHazard(MONSTER.get(src.s.t), h);
    return !!((mv ? this.tl(`${key}__${src.s.t}__${mv}`) : undefined) ?? this.tl(`${key}__${src.s.t}`));
  }

  private note(key: string, id: string): void {
    if (!import.meta.env.DEV) return;
    this.log.push({ key, id, at: performance.now() });
    if (this.log.length > 200) this.log.shift();
  }

  private actorOf(m: { x: number; y: number; z: number; yaw: number }): FxCaster {
    return { x: m.x, y: m.y, z: m.z, yaw: m.yaw, model: {} };
  }

  private bossOf(m: MonLike | undefined): boolean {
    return !!m && !!MONSTER.get(m.s.t)?.boss;
  }

  /** Bảng màu theo hệ của quái; boss dùng bảng ma khí (viền vàng kim, accent đỏ thẫm). */
  private elemOf(m: MonLike): string {
    return monPaletteKey(MONSTER.get(m.s.t)?.elem, this.bossOf(m));
  }

  /** Biến thức `boss` của timeline (sự kiện thêm cho boss). */
  private variantOf(m: MonLike | undefined): string | undefined {
    return this.bossOf(m) ? 'boss' : undefined;
  }

  /** Quái niệm/tụ lực (cờ chant bật). */
  cast(m: MonLike): void {
    // Timeline niệm riêng của quái (`mon_cast__<loại>`, kích thước theo mét, không nhân cỡ quái) thay timeline chung.
    const own = this.tl(`mon_cast__${m.s.t}`);
    const tl = own ?? this.tl('mon_cast');
    if (!tl || !this.near(m.x, m.z) || !this.gap('cast', m.id, 0.5)) return;
    this.runner.startAt(tl, {
      actor: this.actorOf({ ...m, y: m.y }),
      palette: this.elemOf(m),
      tgt: null,
      mul: own ? 1 : monScale(m.model.height),
      variant: this.variantOf(m),
    });
    this.note('mon_cast', m.id);
  }

  /**
   * Boss hai mặt (TN-3, Phủ Chủ) lật mặt (`warn` = false, FX `face`) hoặc sắp lật (`warn` = true, FX `face_warn`, siết vòng trong `d` giây).
   * `face` là mặt MỚI: chọn bảng màu `face_am`/`face_duong`. Mọi khối cao của timeline có `camFade` để không che người chơi/boss.
   */
  face(m: MonLike, face: 'am' | 'duong', warn: boolean): void {
    const key = warn ? 'mon_face_warn' : 'mon_face';
    const tl = this.tl(key);
    if (!tl || !this.near(m.x, m.z) || !this.gap(key, m.id, 0.5)) return;
    this.runner.startAt(tl, {
      actor: this.actorOf(m),
      palette: 'face_' + face,
      tgt: null,
      mul: Math.min(2.6, monScale(m.model.height)),
    });
    this.note(key, m.id);
  }

  /** Quái gục: tan thành hạt. */
  death(m: MonLike): void {
    const tl = this.tl('mon_death');
    if (!tl || !this.near(m.x, m.z)) return;
    const h = m.model.height;
    const a = this.actorOf({ ...m, y: m.y + h * 0.5 });
    this.runner.startAt(tl, {
      actor: { ...a, y: m.y + h * 0.5 },
      palette: this.elemOf(m),
      tgt: null,
      mul: Math.min(this.bossOf(m) ? 2.2 : 1.5, monScale(h)),
      variant: this.variantOf(m),
    });
    this.note('mon_death', m.id);
  }

  /** Hệ của vùng: theo quái thả vùng, không có thì theo loại vùng. */
  private hazardPalette(h: HazardMsg, src: MonLike | undefined): string {
    return src ? this.elemOf(src) : monPaletteKey(ELEM_OF_KIND[h.kind]);
  }

  /**
   * Vạch báo vùng tròn của quái: triện văn đỏ tồn tại đúng tới lúc nổ. Chỉ khi quái thả vùng (không phải thiên kiếp).
   * Trả `true` khi timeline đã thật sự phát VÀ texture của nó đã nạp (`forgeTexLoaded`): chiêu có timeline riêng (`ownWarn`) chỉ được bỏ pháp trận cũ khi vạch riêng đã phát,
   * nếu không (xa quá 60 m, FX quá nhiều, đang ở phòng thử) người chơi sẽ mất vạch báo gây sát thương.
   */
  warn(h: HazardMsg, src: MonLike | undefined): boolean {
    if (!src || !(h.r > 0) || !(h.delay > 0) || !this.near(h.x, h.z)) return false;
    const boss = this.bossOf(src);
    // Vùng tròn: mọi quái; đường/nón: chỉ boss (nhấp nháy dọc vạch, vạch pháp trận cũ vẫn chạy).
    // Quạt/dải: boss luôn; quái khác (tinh anh) chỉ khi chiêu có timeline RIÊNG (không dùng timeline chung để khỏi đổi hành vi quái thường).
    const key = !h.sh ? 'mon_warn' : h.sh === 'rect' ? 'mon_warn_line' : 'mon_warn_cone';
    let tl: FxTimeline | undefined;
    if (!h.sh || boss) tl = this.tlFor(key, src, h);
    else {
      const mv = moveOfHazard(MONSTER.get(src.s.t), h);
      tl = (mv ? this.tl(`${key}__${src.s.t}__${mv}`) : undefined) ?? this.tl(`${key}__${src.s.t}`);
    }
    if (!tl || !key) return false;
    const y = groundAt(h.x, h.z);
    this.runner.startAt(tl, {
      actor: { x: h.x, y, z: h.z, yaw: h.yaw ?? 0, model: {} },
      palette: this.hazardPalette(h, src),
      tgt: null,
      area: { x: h.x, z: h.z, r: h.r },
      mul: hazardMul(h.r, key === 'mon_warn' ? 4 : 8),
      delay: h.delay,
      variant: this.variantOf(src),
    });
    this.note(key, src.id);
    // Vạch riêng dựa vào texture Codex (`warn_crack`, nạp nền): chưa nạp xong thì nó vô hình, giữ vòng cũ để người chơi vẫn thấy hitbox.
    return forgeTexLoaded('decal_atlas');
  }

  /** Vùng nổ (đúng lúc hết `delay`). Tròn → gai + vết nứt; chữ nhật → gai nối tiếp; nón → lưỡi liềm quét. */
  boom(h: HazardMsg, src: MonLike | undefined): boolean {
    if (!src || h.mv === 'pull' || h.mv === 'pool' || h.mv === 'trail' || h.mv === 'summon') return false;
    const key = h.sh === 'rect' ? 'mon_boom_line' : h.sh === 'cone' ? 'mon_boom_cone' : 'mon_boom_circle';
    const tl = this.tlFor(key, src, h);
    if (!tl || !this.near(h.x, h.z)) return false;
    const y = groundAt(h.x, h.z);
    this.runner.startAt(tl, {
      actor: { x: h.x, y, z: h.z, yaw: h.yaw ?? 0, model: {} },
      palette: this.hazardPalette(h, src),
      tgt: null,
      area: { x: h.x, z: h.z, r: h.r },
      mul: hazardMul(h.r, key === 'mon_boom_circle' ? 4 : 8),
      variant: this.variantOf(src),
    });
    this.note(key, src.id);
    return true;
  }

  /** Đạn bắn ra (quanh miệng quái) hoặc tan (va chạm tại x, z). */
  bolt(kind: string, x: number, y: number, z: number, yaw: number, end: boolean): void {
    const tl = this.tl(end ? 'mon_bolt_impact' : 'mon_bolt_muzzle');
    if (!tl || !this.near(x, z)) return;
    const tgt: FxTarget | null = end ? { x, y, z, chest: 0.5 } : null;
    this.runner.startAt(tl, { actor: { x, y, z, yaw, model: {} }, palette: monPaletteKey(ELEM_OF_KIND[kind]), tgt });
  }
}
