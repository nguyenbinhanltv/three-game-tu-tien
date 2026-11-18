import { describe, expect, it } from 'vitest';
import { canTeleTo, chapterProgress, chapterState, hintNode, nodeState, type ChapterCtx, type ChapterDef } from './chapters';

const CH: ChapterDef = {
  id: 'cx',
  level: 'van_lam',
  art: 'tong_mon',
  levels: [1, 15],
  closeQuest: 'q_chot',
  featured: [],
  nodes: [
    { id: 'w', kind: 'world', ref: 'van_lam', x: 10, y: 10, minLevel: 1, tele: 'tp_tong_mon' },
    { id: 'd', kind: 'dungeon', ref: 'kiem_trung', x: 40, y: 40, minLevel: 8 },
    { id: 'b', kind: 'boss', ref: 'boss_x', x: 60, y: 60, minLevel: 12 },
    { id: 't', kind: 'trib', ref: 'truc_co', x: 80, y: 20, minLevel: 15, tele: 'tp_khong_mo' },
  ],
};
const ctx = (o: Partial<ChapterCtx> = {}): ChapterCtx => ({ level: 10, currentLevel: 'van_lam', questsDone: [], teleOpen: [], ...o });

describe('chapters (hàm thuần)', () => {
  it('chương: ở đây / mở / khóa / đã qua', () => {
    expect(chapterState(CH, ctx())).toBe('here');
    expect(chapterState(CH, ctx({ currentLevel: 'doan_mach' }))).toBe('open');
    expect(chapterState({ ...CH, levels: [16, 19] }, ctx({ currentLevel: '' }))).toBe('lock');
    expect(chapterState(CH, ctx({ questsDone: ['q_chot'] }))).toBe('done');
    expect(chapterState(CH, ctx({ level: 16 }))).toBe('done');
  });
  it('nút: khóa theo cấp, ở đây cho nút thế giới, gợi ý đúng một nút', () => {
    expect(nodeState(CH, CH.nodes[0]!, ctx())).toBe('here');
    expect(nodeState(CH, CH.nodes[1]!, ctx())).toBe('hint');
    expect(nodeState(CH, CH.nodes[2]!, ctx())).toBe('lock');
    expect(nodeState(CH, CH.nodes[1]!, ctx({ level: 12 }))).toBe('hint');
    expect(nodeState(CH, CH.nodes[2]!, ctx({ level: 12 }))).toBe('open');
    expect(hintNode(CH, ctx({ level: 3 }))).toBeNull();
    expect(CH.nodes.filter((n) => nodeState(CH, n, ctx({ level: 15 })) === 'hint')).toHaveLength(1);
  });
  it('đã qua cả nút khi chương xong', () => {
    const c = ctx({ questsDone: ['q_chot'] });
    expect(CH.nodes.every((n) => nodeState(CH, n, c) === 'done')).toBe(true);
    expect(chapterProgress(CH, c)).toEqual({ done: 4, total: 4 });
    expect(hintNode(CH, c)).toBeNull();
  });
  it('truyền tống: trận mở sẵn hoặc đã mở, đủ cấp', () => {
    expect(canTeleTo(CH.nodes[0]!, ctx())).toBe(true);
    expect(canTeleTo(CH.nodes[3]!, ctx({ level: 15 }))).toBe(false);
    expect(canTeleTo(CH.nodes[3]!, ctx({ level: 15, teleOpen: ['tp_khong_mo'] }))).toBe(true);
    expect(canTeleTo(CH.nodes[1]!, ctx())).toBe(false);
  });
});
