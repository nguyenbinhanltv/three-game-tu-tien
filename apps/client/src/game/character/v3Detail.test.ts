import { describe, expect, it } from 'vitest';
import { storedQuality, type TexCap, V3TextureBudget, v3TexturePolicy } from './v3Detail';

describe('v3TexturePolicy (N-7: giới hạn nhân vật chi tiết cao)', () => {
  it('nhân vật mình giữ texture đầy đủ ở Cao/Cực cao, người khác luôn bị chặn', () => {
    expect(v3TexturePolicy('high').self.maxTexture).toBe(Infinity);
    expect(v3TexturePolicy('ultra').self.maxTexture).toBe(Infinity);
    for (const q of ['low', 'medium', 'high', 'ultra']) {
      const p = v3TexturePolicy(q);
      expect(p.crowd.maxTexture).toBeLessThanOrEqual(1024);
      expect(p.others.maxTexture).toBeLessThanOrEqual(2048);
      expect(p.crowd.maxTexture).toBeLessThanOrEqual(p.others.maxTexture);
      expect(p.crowd.maxNormal).toBeLessThanOrEqual(p.crowd.maxTexture);
    }
  });

  it('preset lạ dùng chính sách của Vừa', () => {
    expect(v3TexturePolicy('???')).toBe(v3TexturePolicy('medium'));
    expect(storedQuality()).toBe('medium'); // test node không có localStorage
  });

  it('ước tính tệ nhất (mình + 25 model khác nhau) dưới 300 MB texture', () => {
    // MB GPU của một model (WebGPU): normal RGBA8, màu và RM nén khối ≤ 8 bit/điểm; cộng 1/3 cho chuỗi mip.
    const mb = (c: TexCap) => ((Math.min(c.maxNormal, 4096) ** 2 * 4 + Math.min(c.maxTexture, 4096) ** 2 * 2) / 1048576) * (4 / 3);
    for (const q of ['low', 'medium', 'high', 'ultra']) {
      const p = v3TexturePolicy(q);
      const total = mb(p.self) + p.othersCount * mb(p.others) + (25 - p.othersCount) * mb(p.crowd);
      expect(total).toBeLessThan(300);
    }
  });
});

describe('V3TextureBudget', () => {
  const pol = v3TexturePolicy('high');
  const budget = () => new V3TextureBudget(pol);

  it('vài model đầu của người khác ở `others`, còn lại `crowd`; cùng id trả cùng trần', () => {
    const b = budget();
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => b.capOf(id, false))).toEqual([pol.others, pol.others, pol.others, pol.crowd, pol.crowd]);
    expect(b.capOf('a', false)).toBe(pol.others);
    expect(b.capOf('e', false)).toBe(pol.crowd);
  });

  it('nhân vật mình không tính vào suất của người khác', () => {
    const b = budget();
    expect(b.capOf('mine', true)).toBe(pol.self);
    expect(['a', 'b', 'c', 'd'].map((id) => b.capOf(id, false))).toEqual([pol.others, pol.others, pol.others, pol.crowd]);
  });

  it('người khác mặc cùng model với mình thì dùng chung bản của mình', () => {
    const b = budget();
    b.capOf('mine', true);
    expect(b.capOf('mine', false)).toBe(pol.self);
  });

  it('model người khác nạp trước, mình mặc sau: mình vẫn được bản đầy đủ, người khác giữ bản đã nạp', () => {
    const b = budget();
    expect(b.capOf('x', false)).toBe(pol.others);
    expect(b.capOf('x', true)).toBe(pol.self);
    expect(b.capOf('x', false)).toBe(pol.others);
  });
});
