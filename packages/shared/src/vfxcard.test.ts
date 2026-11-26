import { describe, expect, it } from 'vitest';
import { checkStandard2, isRedOrange, validateVfxCard, type VfxCard } from './vfxcard';

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
const v = (c: Partial<VfxCard>) =>
  validateVfxCard(
    { ...ok, ...c },
    () => true,
    () => true,
  );

describe('validateVfxCard', () => {
  it('thẻ hợp lệ không lỗi', () => expect(v({})).toEqual([]));
  it('chặn vượt trần ngân sách', () => expect(v({ budget: { ...ok.budget, drawCalls: 40 } }).join()).toMatch(/drawCalls/));
  it('chiêu người chơi không được xin warn (kể cả có telegraph)', () => {
    expect(v({ colorRole: 'warn' }).join()).toMatch(/warn/);
    expect(v({ colorRole: 'warn', telegraph: true }).join()).toMatch(/warn/);
  });
  it('chiêu không tồn tại', () =>
    expect(
      validateVfxCard(
        ok,
        () => false,
        () => true,
      ).join(),
    ).toMatch(/không tồn tại/));
  it('texture trùng', () => expect(v({ textures: [ok.textures[0]!, ok.textures[0]!] }).join()).toMatch(/trùng/));
});

describe('checkStandard2 (chuẩn Họa Pháp Lô 2)', () => {
  const card: VfxCard = { ...ok, standard: 2, silhouette: 'sợi khói tím cuộn quanh mục tiêu', materials: ['smoke'] };
  const evs = [
    { type: 'mesh', t: -0.2, shape: 'flip', flip: 'ink_smoke' },
    { type: 'mesh', t: 0, shape: 'ribbon' },
    { type: 'particles', t: 0.3 },
  ];
  const ctx = { redTones: new Set<string>() };
  it('thẻ cũ (không standard) không bị kiểm', () => expect(checkStandard2({ ...card, standard: undefined }, [], false, ctx)).toEqual([]));
  it('thẻ đạt chuẩn không lỗi', () => expect(checkStandard2(card, evs, false, ctx)).toEqual([]));
  it('bắt khuôn chung, thiếu chất liệu, thiếu ba nhịp, phủ quá 0,2', () => {
    const bad = checkStandard2(
      { ...card, budget: { ...card.budget, screenCover: 0.3 } },
      [{ type: 'mesh', t: 0, shape: 'rune_ring2' }],
      false,
      ctx,
    ).join('|');
    expect(bad).toMatch(/khuôn chung/);
    expect(bad).toMatch(/materials "smoke"/);
    expect(bad).toMatch(/dư ba/);
    expect(bad).toMatch(/screenCover 0.3 > 0.2/);
  });
  it('chiêu cuối được phủ tới 0,35', () =>
    expect(checkStandard2({ ...card, budget: { ...card.budget, screenCover: 0.3 } }, evs, true, ctx)).toEqual([]));
  it('bắt tông đỏ/cam của bảng hướng tu', () => {
    expect(
      checkStandard2(card, [...evs, { type: 'mesh', t: 0, shape: 'ribbon', tone: 'accent' }], false, {
        redTones: new Set(['accent']),
      }).join('|'),
    ).toMatch(/đỏ\/cam/);
  });
  it('sự kiện không khai tone mặc định là body: bắt khi body đỏ', () => {
    expect(checkStandard2(card, evs, false, { redTones: new Set(['body']) }).join('|')).toMatch(/tông body.*mặc định/);
    expect(checkStandard2(card, [...evs, { type: 'impact', t: 0 }], false, { redTones: new Set() })).toEqual([]);
  });
  it('from: "start" quy về mốc trúng bằng hitAt', () => {
    const c0 = { redTones: new Set<string>(), hitAt: 0.4 };
    // t=0.4 từ lúc bấm = đúng mốc trúng; t=0 từ lúc bấm = báo trước; t=0.7 từ lúc bấm = dư ba (+0,3 s)
    const ok2 = [
      { type: 'mesh', from: 'start' as const, t: 0, shape: 'flip', flip: 'ink_smoke' },
      { type: 'mesh', from: 'start' as const, t: 0.4, shape: 'ribbon' },
      { type: 'particles', from: 'start' as const, t: 0.7 },
    ];
    expect(checkStandard2(card, ok2, false, c0)).toEqual([]);
    // cùng dữ liệu nhưng không quy đổi: t=0 bị tính là điểm nhấn, không còn nhịp báo trước/dư ba đúng
    expect(checkStandard2(card, ok2, false, { redTones: new Set() }).join('|')).toMatch(/báo trước/);
  });
  it('isRedOrange nhận đỏ/cam, bỏ qua lam/vàng nhạt', () => {
    expect(isRedOrange('e4452f')).toBe(true);
    expect(isRedOrange('ff9a4a')).toBe(true);
    expect(isRedOrange('2cc7dc')).toBe(false);
    expect(isRedOrange('f2d86b')).toBe(false);
  });
});

describe('thẻ cảnh (V-P10: hiệu ứng fx_* không thuộc chiêu/hướng tu)', () => {
  const scene: VfxCard = {
    ...ok,
    skillId: 'fx_x',
    path: '',
    textures: [],
    scene: { palette: { core: '453a08', body: 'e6c84a', rim: 'fff4c8', accent: '3fb8d8' }, impactAt: 0.5 },
  };
  const vs = (c: VfxCard, isScene = true) =>
    validateVfxCard(
      c,
      () => false,
      () => false,
      () => isScene,
    );
  it('hợp lệ khi có timeline fx_* cùng id, không cần chiêu hay hướng tu', () => expect(vs(scene)).toEqual([]));
  it('chặn khi không có timeline, khi khai path, khi bảng màu không phải hex, khi impactAt ngoài khoảng', () => {
    expect(vs(scene, false).join()).toMatch(/không có timeline/);
    expect(vs({ ...scene, path: 'kiem_tu' }).join()).toMatch(/path phải rỗng/);
    expect(vs({ ...scene, scene: { ...scene.scene!, palette: { ...scene.scene!.palette, body: '#e6c84a' } } }).join()).toMatch(/hex/);
    expect(vs({ ...scene, scene: { ...scene.scene!, impactAt: 9 } }).join()).toMatch(/impactAt/);
  });
  it('ba nhịp của chuẩn 2 tính quanh impactAt (mọi t ≥ 0)', () => {
    const c: VfxCard = { ...scene, standard: 2, silhouette: 'bốn phiến đá mực trồi nghiêng', materials: ['sprite'] };
    const evs = [
      { type: 'mesh', shape: 'sprite', t: 0 },
      { type: 'mesh', shape: 'sprite', t: 0.53 },
      { type: 'mesh', shape: 'sprite', t: 1 },
    ];
    const ctx = { redTones: new Set<string>(), impactAt: 0.5 };
    expect(checkStandard2(c, evs, false, ctx)).toEqual([]);
    // Không truyền impactAt: mốc nhấn tính ở 0 nên thiếu báo trước.
    expect(checkStandard2(c, evs, false, { redTones: new Set<string>() }).join()).toMatch(/báo trước/);
  });
});
