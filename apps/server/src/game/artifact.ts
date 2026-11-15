// Pháp bảo phụ và buff đan (Phase 3-8), phần không đụng tới sim: tiến độ trong `characters.meta`, buff, tin đồng bộ.
// Luật (hệ số, công thức) nằm ở packages/shared/src/artifacts.ts và alchemy.ts; sim.ts gọi các hàm này tại các điểm móc.

import {
  artifactPassive,
  artifactQiNeed,
  ARTIFACT_MAX_LEVEL,
  buffMag,
  clampArtifactLevel,
  PILL_BUFF_KINDS,
  type ArtifactDef,
  type ArtifactMsg,
  type ArtifactProgress,
  type BuffMap,
  type Equipment,
  type PillBuffKind,
} from '@dtl/shared';
import { ARTIFACT } from '@dtl/content';

export interface ArtifactMeta {
  /** id pháp bảo → cấp và linh khí (giữ cả pháp bảo đang không đeo). */
  art?: Record<string, ArtifactProgress>;
  /** Buff đan đang chạy (giờ hết hạn theo đồng hồ server). */
  buffs?: BuffMap;
}

/** Làm sạch phần pháp bảo/buff của meta khi đọc từ DB (dữ liệu hỏng/cũ: bỏ phần lạ). */
export function sanitizeArtifactMeta(meta: ArtifactMeta): void {
  const art: Record<string, ArtifactProgress> = {};
  if (meta.art && typeof meta.art === 'object') {
    for (const [id, p] of Object.entries(meta.art)) {
      if (!ARTIFACT.has(id) || !p || typeof p !== 'object') continue;
      const lv = clampArtifactLevel(p.lv);
      const need = artifactQiNeed(lv + 1);
      const qi = typeof p.qi === 'number' && Number.isFinite(p.qi) ? Math.max(0, Math.floor(p.qi)) : 0;
      art[id] = { lv, qi: need === null ? 0 : Math.min(qi, need - 1) };
    }
  }
  meta.art = art;
  const buffs: BuffMap = {};
  if (meta.buffs && typeof meta.buffs === 'object') {
    for (const k of PILL_BUFF_KINDS) {
      const b = meta.buffs[k];
      if (b && typeof b.m === 'number' && typeof b.until === 'number' && b.m > 0 && b.m <= 0.5 && Number.isFinite(b.until)) buffs[k] = { m: b.m, until: b.until };
    }
  }
  meta.buffs = buffs;
}

/** Pháp bảo đang đeo ở ô 8 (undefined nếu không). */
export function equippedArtifact(equip: Equipment): ArtifactDef | undefined {
  const id = equip.artifact?.id;
  return id ? ARTIFACT.get(id) : undefined;
}

export function progressOf(meta: ArtifactMeta, id: string): ArtifactProgress {
  const p = meta.art?.[id];
  return { lv: clampArtifactLevel(p?.lv), qi: Math.max(0, p?.qi ?? 0) };
}

/** Nội tại của pháp bảo đang đeo theo loại (0 nếu không đeo hoặc loại khác). */
export function passiveValue(equip: Equipment, meta: ArtifactMeta, kind: ArtifactDef['passive']['kind']): number {
  const def = equippedArtifact(equip);
  if (!def || def.passive.kind !== kind) return 0;
  return artifactPassive(def, progressOf(meta, def.id).lv);
}

/** Nạp linh khí. Trả về cấp mới nếu vừa lên cấp, không thì null. */
export function feedQi(meta: ArtifactMeta, id: string, n: number): number | null {
  if (!ARTIFACT.has(id) || !(n > 0)) return null;
  meta.art ??= {};
  const cur = progressOf(meta, id);
  if (cur.lv >= ARTIFACT_MAX_LEVEL) return null;
  let { lv, qi } = cur;
  qi += n;
  let up = false;
  for (;;) {
    const need = artifactQiNeed(lv + 1);
    if (need === null) {
      qi = 0;
      break;
    }
    if (qi < need) break;
    qi -= need;
    lv++;
    up = true;
  }
  meta.art[id] = { lv, qi };
  return up ? lv : null;
}

export function artifactMsg(equip: Equipment, meta: ArtifactMeta): ArtifactMsg {
  const def = equippedArtifact(equip);
  if (!def) return { id: '', lv: 1, qi: 0, need: 0 };
  const { lv, qi } = progressOf(meta, def.id);
  return { id: def.id, lv, qi, need: artifactQiNeed(lv + 1) ?? 0 };
}

/** Buff đang chạy gửi client: loại → [mức, giờ hết hạn]. */
export function buffsMsg(meta: ArtifactMeta, now: number): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const k of PILL_BUFF_KINDS) {
    const m = buffMag(meta.buffs, k, now);
    if (m > 0) out[k] = [m, meta.buffs![k]!.until];
  }
  return out;
}

/** Xóa buff đã hết hạn. Trả về true nếu có thay đổi (cần tính lại chỉ số). */
export function pruneBuffs(meta: ArtifactMeta, now: number): boolean {
  let changed = false;
  for (const k of Object.keys(meta.buffs ?? {}) as PillBuffKind[]) {
    if ((meta.buffs![k]?.until ?? 0) <= now) {
      delete meta.buffs![k];
      changed = true;
    }
  }
  return changed;
}
