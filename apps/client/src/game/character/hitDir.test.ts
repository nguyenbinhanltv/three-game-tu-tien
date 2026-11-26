import { describe, expect, it } from 'vitest';
import {
  FLINCH_BY_TIER,
  KNOCK_COOLDOWN_S,
  dashClipOf,
  holdHipsInPlace,
  deathYawOffset,
  flinchAmpOf,
  hitClipOf,
  hitSideOf,
  knockdownWanted,
} from './hitDir';

// Người bị đánh nhìn về +z (yaw 0).
describe('trúng đòn theo hướng (C3b)', () => {
  it('đòn từ phía trước (người đánh ở +z, đẩy về −z), sau, trái, phải', () => {
    expect(hitSideOf(0, 0, -1)).toBe('front');
    expect(hitSideOf(0, 0, 1)).toBe('back');
    expect(hitSideOf(0, 1, 0)).toBe('left');
    expect(hitSideOf(0, -1, 0)).toBe('right');
  });
  it('không có hướng thì như từ phía trước; xoay thân đổi phía theo yaw', () => {
    expect(hitSideOf(0, 0, 0)).toBe('front');
    expect(hitSideOf(Math.PI, 0, -1)).toBe('back');
  });
  it('clip: nặng ngã lùi ở mọi phía; nhẹ sau gáy giật đầu, còn lại chạm ngực', () => {
    for (const s of ['front', 'back', 'left', 'right'] as const) expect(hitClipOf(s, true)).toBe('Hit_Knockback');
    expect(hitClipOf('back', false)).toBe('Hit_Head');
    expect(hitClipOf('front', false)).toBe('Hit_Chest');
    expect(hitClipOf('left', false)).toBe('Hit_Chest');
  });
});

describe('biên độ giật theo cấp đòn', () => {
  it('tăng dần theo cấp; bạo kích nâng sàn; không có cấp thì theo cờ cũ', () => {
    for (let i = 1; i < FLINCH_BY_TIER.length; i++) expect(FLINCH_BY_TIER[i]).toBeGreaterThan(FLINCH_BY_TIER[i - 1]!);
    expect(flinchAmpOf(0, false, false)).toBe(0.1);
    expect(flinchAmpOf(0, true, false)).toBe(0.18);
    expect(flinchAmpOf(3, false, false)).toBe(0.36);
    expect(flinchAmpOf(undefined, false, true)).toBe(0.26);
    expect(flinchAmpOf(undefined, false, false)).toBe(0.12);
  });
});

describe('ngã chết ra xa người hạ gục', () => {
  it('Death01 ngã ngửa: thân phải quay mặt về phía người đánh', () => {
    // Người đánh ở −z so với nạn nhân (đẩy về +z), nạn nhân nhìn +z (yaw 0): phải quay mặt về −z (π).
    expect(Math.abs(deathYawOffset(0, 0, 1))).toBeCloseTo(Math.PI, 5);
    // Đã nhìn về phía người đánh (người đánh ở +z, đẩy về −z): không cần xoay.
    expect(deathYawOffset(0, 0, -1)).toBeCloseTo(0, 5);
  });
  it('độ lệch kẹp trong [−π, π]; không có hướng thì 0', () => {
    for (const yaw of [-7, -3, 0, 2, 9]) {
      const d = deathYawOffset(yaw, 0.3, -0.8);
      expect(d).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
      expect(d).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    expect(deathYawOffset(1, 0, 0)).toBe(0);
  });
});

describe('clip lướt theo loại chiêu (C3e)', () => {
  it('lướt có sát thương dùng Sword_Dash khi có clip; lướt thuần, hoặc thiếu clip, thì lăn', () => {
    const all = () => true;
    expect(dashClipOf(true, all)).toBe('Sword_Dash');
    expect(dashClipOf(false, all)).toBe('Roll');
    expect(dashClipOf(true, (n) => n === 'Roll')).toBe('Roll');
  });
});

describe('holdHipsInPlace', () => {
  it('giữ độ cao hông, khóa hai trục ngang ở khung đầu', () => {
    const v = new Float32Array([0.1, 1, 0.2, 0.5, 1.1, 0.9, 1.5, 0.95, 1.4]);
    holdHipsInPlace(v);
    expect([v[3], v[5], v[6], v[8]]).toEqual([0.1, 0.2, 0.1, 0.2].map(Math.fround));
    expect([v[1], v[4], v[7]]).toEqual([1, Math.fround(1.1), Math.fround(0.95)]);
  });
});

describe('knockdownWanted (TP-2: ngã + đứng dậy)', () => {
  it('chỉ chiêu cuối (cấp ≥ 3), không phải mình, và đã nghỉ đủ', () => {
    expect(knockdownWanted(3, { self: false }, 99)).toBe(true);
    expect(knockdownWanted(2, { self: false }, 99)).toBe(false);
    expect(knockdownWanted(undefined, { self: false }, 99)).toBe(false);
    expect(knockdownWanted(3, { self: true }, 99)).toBe(false);
    expect(knockdownWanted(3, { self: false }, KNOCK_COOLDOWN_S - 0.1)).toBe(false);
    expect(knockdownWanted(3, { self: false }, KNOCK_COOLDOWN_S)).toBe(true);
  });
  it('quái nhỏ/vừa ngã, quái lớn và boss đứng vững', () => {
    expect(knockdownWanted(3, { self: false, body: 'small' }, 99)).toBe(true);
    expect(knockdownWanted(3, { self: false, body: 'medium' }, 99)).toBe(true);
    expect(knockdownWanted(3, { self: false, body: 'large' }, 99)).toBe(false);
    expect(knockdownWanted(3, { self: false, body: 'boss' }, 99)).toBe(false);
  });
});
