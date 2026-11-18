// Máy trạng thái nhạc nền: chỉ quyết định "bài nào nên phát và crossfade bao lâu".
// Thuần logic, không đụng Web Audio/DOM để test đơn vị được (music.ts lo phần phát).
//
// Ưu tiên (cao xuống thấp): độ kiếp > boss > chiến đấu > đả tọa > vùng.
// Chống giật qua lại (hysteresis):
// - Vào combat: tín hiệu phải giữ liền COMBAT_ENTER giây, hoặc vào ngay khi có đòn đánh thật (engage).
// - Ra combat: hết tín hiệu COMBAT_EXIT giây mới về nhạc vùng. Boss tương tự với BOSS_EXIT dài hơn.
// - Đổi vùng: vùng mới phải giữ REGION_DWELL giây (đi dọc ranh giới không đổi bài liên tục).
// - Đổi bài xong thì giữ ít nhất MIN_HOLD giây trước khi hạ ưu tiên (lên ưu tiên thì đổi ngay).
import type { Biome } from '@dtl/shared';

export type MusicTrack =
  | 'sect'
  | 'wild'
  | 'wild_ochre'
  | 'wild_cloud'
  | 'wild_night'
  | 'wild_ash'
  | 'wild_rift'
  | 'forest'
  | 'lake'
  | 'dungeon'
  | 'combat'
  | 'boss'
  | 'dungeon_boss'
  | 'tribulation'
  | 'meditate';

export const MUSIC_TRACKS: readonly MusicTrack[] = ['sect', 'wild', 'wild_ochre', 'wild_cloud', 'wild_night', 'wild_ash', 'wild_rift', 'forest', 'lake', 'dungeon', 'combat', 'boss', 'dungeon_boss', 'tribulation', 'meditate'];

export interface MusicInput {
  /** Đang ở room bí cảnh (Kiếm Trủng) thay vì bản đồ thế giới. */
  dungeon: boolean;
  biome: Biome;
  /** Level đang hiển thị: Đoạn Mạch (`doan_mach`) có bài vùng riêng (E2-I). */
  level?: string;
  /** Đứng ở bên kia vết nứt (Bắc Hoang): chọn `wild_rift` thay `wild_ash`. */
  rift?: boolean;
  /** Có quái đang đuổi/đánh ở gần mình. */
  combat: boolean;
  /** Như `combat` nhưng là boss. Boss luôn kéo theo combat. */
  boss: boolean;
  tribulation: boolean;
  meditating: boolean;
  dead: boolean;
}

export interface MusicChange {
  from: MusicTrack | null;
  to: MusicTrack;
  /** Thời gian crossfade (giây). */
  fade: number;
  reason: string;
}

export const COMBAT_ENTER = 0.6;
export const COMBAT_EXIT = 6;
export const BOSS_ENTER = 0.3;
export const BOSS_EXIT = 9;
export const REGION_DWELL = 2.5;
export const MIN_HOLD = 3;
/** Có đòn đánh thật trong chừng này giây thì mức giao chiến là "đang đánh" (2), không thì chỉ "bị nhắm" (1). */
export const ENGAGE_HOLD = 7;

// ---------- nhạc chiến đấu phân lớp (M4-13) ----------

/**
 * Vùng có bộ lớp (stem) cùng tempo với bài vùng: vào/ra giao tranh chỉ tăng/giảm âm lượng lớp, không đổi bài.
 * Rừng và hồ chưa có (tempo 80 và 66 không hợp nhịp trống/giai điệu căng viết cho vùng khác): vẫn đổi sang `combat`.
 */
export const STEM_ZONES = ['sect', 'wild', 'dungeon'] as const;
export type StemZone = (typeof STEM_ZONES)[number];

export function isStemZone(t: MusicTrack | null): t is StemZone {
  return t !== null && (STEM_ZONES as readonly string[]).includes(t);
}

/** Mức giao chiến: 0 yên, 1 bị quái nhắm tới, 2 đang đánh nhau, 3 boss (boss vẫn đổi sang bài boss riêng, xem docs/audio/music.md). */
export type CombatLevel = 0 | 1 | 2 | 3;

export interface StemMix {
  base: number;
  pulse: number;
  edge: number;
}

/** Âm lượng từng lớp theo mức giao chiến. Nền hạ nhẹ để tổng độ to gần như không đổi (xem tools/audio/stems.test.mjs). */
export const STEM_MIX: Record<CombatLevel, StemMix> = {
  0: { base: 1, pulse: 0, edge: 0 },
  1: { base: 1, pulse: 0.6, edge: 0 },
  2: { base: 0.85, pulse: 1, edge: 0.7 },
  3: { base: 0.85, pulse: 1, edge: 0.7 },
};

const PRIORITY: Record<MusicTrack, number> = {
  sect: 0,
  wild: 0,
  wild_ochre: 0,
  wild_cloud: 0,
  wild_night: 0,
  wild_ash: 0,
  wild_rift: 0,
  forest: 0,
  lake: 0,
  dungeon: 0,
  meditate: 1,
  combat: 2,
  boss: 3,
  dungeon_boss: 3,
  tribulation: 4,
};

export function regionTrack(dungeon: boolean, biome: Biome, level?: string, rift?: boolean): MusicTrack {
  if (dungeon) return 'dungeon';
  if (level === 'doan_mach' && biome === 'wild') return 'wild_ochre';
  if (level === 'van_hai' && biome === 'wild') return 'wild_cloud';
  if (level === 'thien_khuyet' && biome === 'wild') return 'wild_night';
  if (level === 'bac_hoang') return rift ? 'wild_rift' : 'wild_ash'; // Bắc Hoang (DV-3I): hai bài theo nửa bản đồ
  switch (biome) {
    case 'sect':
      return 'sect';
    case 'forest':
      return 'forest';
    case 'lake':
      return 'lake';
    case 'dungeon':
      // Lòng chảo Kiếm Trủng trên bản đồ thế giới: báo trước không khí bí cảnh.
      return 'dungeon';
    default:
      return 'wild';
  }
}

/** Cờ có độ trễ vào/ra: bật khi tín hiệu giữ liền `enter` giây, tắt khi mất tín hiệu `exit` giây. */
class Latch {
  on = false;
  private since = -1;
  private lastSeen = -Infinity;
  constructor(
    private enter: number,
    private exit: number,
  ) {}
  update(now: number, signal: boolean): void {
    if (signal) {
      this.lastSeen = now;
      if (this.since < 0) this.since = now;
      if (!this.on && now - this.since >= this.enter) this.on = true;
    } else {
      this.since = -1;
      if (this.on && now - this.lastSeen >= this.exit) this.on = false;
    }
  }
  /** Bật ngay (đòn đánh thật đã xảy ra). */
  force(now: number): void {
    this.on = true;
    this.lastSeen = now;
    if (this.since < 0) this.since = now;
  }
  clear(): void {
    this.on = false;
    this.since = -1;
    this.lastSeen = -Infinity;
  }
}

export class MusicDirector {
  track: MusicTrack | null = null;
  private changedAt = -Infinity;
  private region: MusicTrack | null = null;
  private regionCand: MusicTrack | null = null;
  private regionCandSince = 0;
  private wasDungeon: boolean | null = null;
  private combat = new Latch(COMBAT_ENTER, COMBAT_EXIT);
  private boss = new Latch(BOSS_ENTER, BOSS_EXIT);
  private lastEngage = -Infinity;

  /** Bài vùng đang áp dụng (đã qua chống giật ở ranh giới), null trước lần update đầu. */
  get regionNow(): MusicTrack | null {
    return this.region;
  }

  /** Mức giao chiến hiện tại cho nhạc phân lớp. */
  level(now: number): CombatLevel {
    if (this.boss.on) return 3;
    if (!this.combat.on) return 0;
    return now - this.lastEngage < ENGAGE_HOLD ? 2 : 1;
  }

  /** Đòn đánh thật giữa mình và quái (gây hoặc nhận sát thương): vào nhạc chiến đấu ngay. */
  engage(now: number, boss: boolean): void {
    this.lastEngage = now;
    this.combat.force(now);
    if (boss) this.boss.force(now);
  }

  get inCombat(): boolean {
    return this.combat.on;
  }

  get inBoss(): boolean {
    return this.boss.on;
  }

  /** Gọi định kỳ (khoảng 10 lần/giây). `now` tính bằng giây. Trả về thay đổi nếu cần đổi bài. */
  update(now: number, inp: MusicInput): MusicChange | null {
    // Vùng: lần đầu hoặc vừa đổi room thì nhận ngay, còn lại phải giữ đủ REGION_DWELL.
    const want = regionTrack(inp.dungeon, inp.biome, inp.level, inp.rift);
    if (this.region === null || this.wasDungeon !== inp.dungeon) {
      this.region = want;
      this.regionCand = null;
    } else if (want === this.region) {
      this.regionCand = null;
    } else if (want !== this.regionCand) {
      this.regionCand = want;
      this.regionCandSince = now;
    } else if (now - this.regionCandSince >= REGION_DWELL) {
      this.region = want;
      this.regionCand = null;
    }
    if (this.wasDungeon !== null && this.wasDungeon !== inp.dungeon) {
      // Đổi room: trận cũ không còn liên quan.
      this.combat.clear();
      this.boss.clear();
    }
    this.wasDungeon = inp.dungeon;

    if (inp.dead) {
      this.combat.clear();
      this.boss.clear();
    } else {
      this.combat.update(now, inp.combat || inp.boss);
      this.boss.update(now, inp.boss);
    }

    let next: MusicTrack;
    let reason: string;
    if (inp.tribulation) {
      next = 'tribulation';
      reason = 'độ kiếp';
    } else if (this.boss.on) {
      next = inp.dungeon ? 'dungeon_boss' : 'boss';
      reason = 'giao chiến boss';
    } else if (this.combat.on) {
      next = 'combat';
      reason = 'chiến đấu';
    } else if (inp.meditating && !inp.dead) {
      next = 'meditate';
      reason = 'đả tọa';
    } else {
      next = this.region;
      reason = inp.dead ? 'tử vong, về nhạc vùng' : 'vùng';
    }

    if (next === this.track) return null;
    const from = this.track;
    // Hạ ưu tiên (ví dụ boss → vùng) phải chờ hết MIN_HOLD để không nhảy bài liên tục.
    if (from !== null && PRIORITY[next] < PRIORITY[from] && now - this.changedAt < MIN_HOLD) return null;
    this.track = next;
    this.changedAt = now;
    return { from, to: next, fade: fadeFor(from, next), reason };
  }

  reset(): void {
    this.track = null;
    this.changedAt = -Infinity;
    this.region = null;
    this.regionCand = null;
    this.wasDungeon = null;
    this.lastEngage = -Infinity;
    this.combat.clear();
    this.boss.clear();
  }
}

/** Crossfade: vào giao tranh nhanh, rời giao tranh và đổi vùng chậm. */
export function fadeFor(from: MusicTrack | null, to: MusicTrack): number {
  if (from === null) return 2;
  if (to === 'tribulation') return 1;
  if (PRIORITY[to] > PRIORITY[from] && PRIORITY[to] >= 2) return 1.2;
  if (to === 'meditate' || from === 'meditate') return 2.5;
  return 4;
}

// ---------- âm môi trường theo vùng (M4-12) ----------

/** Id âm môi trường trong manifest.ambient (tools/audio/sounds.json). */
export type AmbientId = 'wind' | 'forest' | 'stream' | 'night' | 'cave';
export const AMBIENT_IDS: readonly AmbientId[] = ['wind', 'forest', 'stream', 'night', 'cave'];

/**
 * Âm môi trường cho vùng: Kiếm Trủng/bí cảnh là gió hang; ven hồ luôn có nước vỗ (kể cả đêm);
 * còn lại ban đêm là dế, ban ngày rừng và tông môn có chim, đồng hoang và thung lũng là gió núi.
 */
export function ambientFor(dungeon: boolean, biome: Biome, night: boolean): AmbientId {
  if (dungeon || biome === 'dungeon') return 'cave';
  if (biome === 'lake') return 'stream';
  if (night) return 'night';
  if (biome === 'forest' || biome === 'sect') return 'forest';
  return 'wind';
}

/** Đêm theo giờ máy người chơi (game chưa có chu kỳ ngày/đêm): 19h–5h. */
export function isNightHour(hour: number): boolean {
  return hour >= 19 || hour < 5;
}

/** Chống đổi qua lại ở ranh giới vùng: ứng viên mới phải giữ đủ REGION_DWELL giây mới đổi (lần đầu đổi ngay). */
export class AmbientPicker {
  current: AmbientId | null = null;
  private cand: AmbientId | null = null;
  private candSince = 0;

  update(now: number, want: AmbientId): AmbientId | null {
    if (this.current === null) {
      this.current = want;
      return want;
    }
    if (want === this.current) {
      this.cand = null;
      return null;
    }
    if (want !== this.cand) {
      this.cand = want;
      this.candSince = now;
      return null;
    }
    if (now - this.candSince < REGION_DWELL) return null;
    this.current = want;
    this.cand = null;
    return want;
  }

  reset(): void {
    this.current = null;
    this.cand = null;
  }
}
