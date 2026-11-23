import { describe, expect, it } from 'vitest';
import { validateVfxCard, type VfxCard } from './vfxcard';

const ok: VfxCard = {
  skillId: 'a',
  idea: 'một vệt kiếm khí lam ngọc',
  element: 'kim',
  path: 'kiem_tu',
  shapeLang: ['arc'],
  timing: { anticipationMs: 200, impactMs: 60, lingerMs: 300 },
  footprint: { lengthM: 8, widthM: 2, heightM: 2 },
  colorRole: 'own',
  telegraph: false,
  budget: { drawCalls: 6, particles: 100, screenCover: 0.1, overdraw: 3 },
  textures: [{ id: 'x_a', kind: 'slash' }],
};
const v = (c: Partial<VfxCard>) => validateVfxCard({ ...ok, ...c }, () => true, () => true);

describe('validateVfxCard', () => {
  it('thẻ hợp lệ không lỗi', () => expect(v({})).toEqual([]));
  it('chặn vượt trần ngân sách', () => expect(v({ budget: { ...ok.budget, drawCalls: 40 } }).join()).toMatch(/drawCalls/));
  it('warn cần telegraph', () => expect(v({ colorRole: 'warn' }).join()).toMatch(/warn/));
  it('chiêu không tồn tại', () => expect(validateVfxCard(ok, () => false, () => true).join()).toMatch(/không tồn tại/));
  it('texture trùng', () => expect(v({ textures: [ok.textures[0]!, ok.textures[0]!] }).join()).toMatch(/trùng/));
});
