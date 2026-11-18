import { describe, expect, it } from 'vitest';
import { closeChapters, openChapters, pickChapter, pickNode, toggleChapters, useChapters } from './chaptersStore';

describe('chaptersStore', () => {
  it('mở/đóng/đổi chương và nút', () => {
    closeChapters();
    expect(useChapters.getState().open).toBe(false);
    toggleChapters();
    expect(useChapters.getState().open).toBe(true);
    pickChapter('ch3');
    expect(useChapters.getState()).toMatchObject({ ch: 'ch3', sel: '' });
    pickNode('ch3_kinh_nguyet');
    expect(useChapters.getState().sel).toBe('ch3_kinh_nguyet');
    openChapters();
    closeChapters();
    expect(useChapters.getState().open).toBe(false);
  });
});
