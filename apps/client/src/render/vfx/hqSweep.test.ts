import { beforeAll, describe, expect, it } from 'vitest';
import { refreshAuraSprites } from '../../game/fx/realmAuraRules';
import type { SpriteGroup } from './art';

// Atlas `hq` của hào quang cảnh giới (V-P10 đợt 4) không được bị `sweepSpriteGroups` giải phóng khi hào quang còn hiện: hào quang sống hàng phút nên phải
// làm mới `last` mỗi khung (`refreshAuraSprites`), nếu không sau 90 s với > 3 nhóm đang giữ thì sprite hào quang trong suốt.
let art: typeof import('./art');
beforeAll(async () => {
  // Môi trường test không có `document`/`Image`: giả lập tối thiểu để `useSpriteGroup` vào trạng thái "đang nạp" (khác 0) như trong trình duyệt.
  const g = globalThis as Record<string, unknown>;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
  g.Image = class {
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    set src(_v: string) {}
  };
  art = await import('./art');
});

describe('atlas hq và dọn nhóm sprite rỗi', () => {
  it('hào quang sống làm mới `hq` mỗi khung thì không bị giải phóng sau 90 s dù đang giữ 4 nhóm (đối chứng: không làm mới thì bị giải phóng)', () => {
    const { useSpriteGroup, sweepSpriteGroups, residentSpriteGroups, evictSpriteGroups, SPRITE_IDLE_MS, SPRITE_MAX_RESIDENT } = art;
    const t0 = 1000;
    const run = (refresh: boolean): string[] => {
      evictSpriteGroups();
      // `hq` nạp đầu tiên (rỗi lâu nhất) nên là nhóm đầu hàng bị dọn nếu không ai làm mới nó.
      for (const g of ['hq', 'kiem', 'dp', 'ngu'] as SpriteGroup[]) useSpriteGroup(g, t0);
      expect(residentSpriteGroups().length).toBe(4);
      for (let t = t0; t <= t0 + 120_000; t += 5000) {
        if (refresh) refreshAuraSprites(2, true, (g) => useSpriteGroup(g, t));
        sweepSpriteGroups(t);
      }
      return residentSpriteGroups();
    };
    expect(120_000).toBeGreaterThan(SPRITE_IDLE_MS);
    expect(run(false), 'đối chứng: không làm mới thì hq bị dọn').not.toContain('hq');
    const kept = run(true);
    expect(kept, 'hào quang còn hiện: hq còn nạp').toContain('hq');
    expect(kept.length, 'vẫn dọn về trần nhóm').toBeLessThanOrEqual(SPRITE_MAX_RESIDENT);
  });

  it('không làm mới khi tắt cờ sprite hoặc chưa tới Kết Đan', () => {
    const used: string[] = [];
    refreshAuraSprites(2, false, (g) => used.push(g));
    refreshAuraSprites(0, true, (g) => used.push(g));
    expect(used).toEqual([]);
    refreshAuraSprites(1, true, (g) => used.push(g));
    expect(used).toEqual(['hq']);
  });
});
