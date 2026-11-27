import { describe, expect, it } from 'vitest';
import { DIEN_VO_LAYOUT, dienVoSpawnAt } from '@dtl/shared';
import { FX_TIMELINE, LAB_SCENES, t } from './index';
import { applyHotData, HOT_LAYOUT_PATH, hotKind } from './hot';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('nạp lại dữ liệu tức thì (@dtl/content/hot)', () => {
  it('chỉ nhận đúng các loại file đã khai', () => {
    expect(hotKind('packages/content/data/fx/fx_blink.json')).toBe('fx');
    expect(hotKind('packages/content/data/lab/scenes.json')).toBe('lab');
    expect(hotKind('packages/content/data/i18n/vi.ui.json')).toBe('i18n');
    expect(hotKind(HOT_LAYOUT_PATH)).toBe('layout');
    // Dữ liệu luật chơi và phần thưởng KHÔNG nạp lại tức thì.
    for (const f of ['poses/kiem_thu.json', 'loot.json', 'skills.json', 'monsters.json', 'items.json', 'levels/van_lam.json', 'fx/../loot.json', 'fx/a/b.json'])
      expect(hotKind('packages/content/data/' + f), f).toBeNull();
    expect(hotKind('apps/server/src/config.ts')).toBeNull();
    expect(applyHotData('packages/content/data/loot.json', {}).ok).toBe(false);
  });

  it('fx: thay nội dung timeline tại chỗ, giữ danh tính đối tượng trong FX_TIMELINE', () => {
    const tl = FX_TIMELINE.get('fx_blink')!;
    const before = clone(tl);
    try {
      const r = applyHotData('packages/content/data/fx/fx_blink.json', { ...before, palette: 'loi', events: [] });
      expect(r).toMatchObject({ ok: true, kind: 'fx', id: 'fx_blink' });
      expect(FX_TIMELINE.get('fx_blink')).toBe(tl);
      expect(tl.palette).toBe('loi');
      expect(tl.events).toEqual([]);
    } finally {
      applyHotData('packages/content/data/fx/fx_blink.json', before);
    }
    expect(clone(tl)).toEqual(before);
  });

  it('fx: file hỏng hoặc timeline chưa khai báo thì giữ bản cũ', () => {
    const tl = FX_TIMELINE.get('fx_blink')!;
    const before = clone(tl);
    expect(applyHotData('packages/content/data/fx/fx_blink.json', { skill: 'fx_blink' }).ok).toBe(false);
    expect(applyHotData('packages/content/data/fx/fx_blink.json', null).ok).toBe(false);
    expect(applyHotData('packages/content/data/fx/moi.json', { skill: 'chua_co', events: [] }).ok).toBe(false);
    expect(clone(tl)).toEqual(before);
  });

  it('cảnh mẫu: vá tại chỗ, dữ liệu sai thì giữ bản cũ', () => {
    const arr = LAB_SCENES;
    const s0 = clone(LAB_SCENES);
    try {
      expect(applyHotData('packages/content/data/lab/scenes.json', [s0[0]]).ok).toBe(true);
      expect(LAB_SCENES).toBe(arr);
      expect(LAB_SCENES.length).toBe(1);
      expect(applyHotData('packages/content/data/lab/scenes.json', [{ id: 1 }]).ok).toBe(false);
      expect(LAB_SCENES.length).toBe(1);
    } finally {
      applyHotData('packages/content/data/lab/scenes.json', s0);
    }
    expect(clone(LAB_SCENES)).toEqual(s0);
  });

  it('i18n và bố cục phòng', () => {
    const old = t('ui.title');
    try {
      expect(applyHotData('packages/content/data/i18n/vi.ui.json', { 'ui.title': 'Thử' })).toMatchObject({ ok: true, note: '1 chuỗi đổi' });
      expect(t('ui.title')).toBe('Thử');
      expect(applyHotData('packages/content/data/i18n/vi.ui.json', { a: 1 }).ok).toBe(false);
    } finally {
      applyHotData('packages/content/data/i18n/vi.ui.json', { 'ui.title': old });
    }
    const l0 = clone(DIEN_VO_LAYOUT);
    try {
      expect(applyHotData(HOT_LAYOUT_PATH, { ...l0, spawns: { arena: [{ x: 1297, z: 984 }], boss: [] } }).ok).toBe(true);
      expect(dienVoSpawnAt(0, 3, false)).toEqual({ x: 1297, z: 984 });
      expect(applyHotData(HOT_LAYOUT_PATH, { props: 'x' })).toMatchObject({ ok: false, kind: 'layout' });
      expect(dienVoSpawnAt(0, 3, false)).toEqual({ x: 1297, z: 984 });
    } finally {
      applyHotData(HOT_LAYOUT_PATH, l0);
    }
  });
});
