import { describe, expect, it } from 'vitest';
import { initialSkillLayout } from './skillLayoutDefault';

describe('initialSkillLayout', () => {
  it('iso mặc định thanh giữa dưới, camera cũ mặc định cung', () => {
    expect(initialSkillLayout(null, true)).toBe('bar');
    expect(initialSkillLayout(null, false)).toBe('arc');
  });
  it('lựa chọn đã lưu của người chơi luôn thắng', () => {
    expect(initialSkillLayout('arc', true)).toBe('arc');
    expect(initialSkillLayout('bar', false)).toBe('bar');
    expect(initialSkillLayout('rác', true)).toBe('bar');
  });
});
