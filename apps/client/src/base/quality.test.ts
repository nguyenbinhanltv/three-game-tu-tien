import { describe, expect, it } from 'vitest';
import { AutoQuality, type GpuHint, baseOf, downgradeOf, isQuality, suggestQuality } from './quality';

const GB = 1024 ** 3;
const rtx: GpuHint = { webgpu: true, vendor: 'nvidia', architecture: 'ampere', description: 'NVIDIA GeForce RTX 3060 Ti', maxTexture2D: 16384, maxBufferSize: 4 * GB };

describe('preset', () => {
  it('baseOf/downgradeOf/isQuality', () => {
    expect(baseOf('ultra')).toBe('high');
    expect(baseOf('weird')).toBe('medium');
    expect(downgradeOf('ultra')).toBe('high');
    expect(downgradeOf('high')).toBe('medium');
    expect(downgradeOf('medium')).toBeNull();
    expect(isQuality('ultra')).toBe(true);
    expect(isQuality('x')).toBe(false);
  });
});

describe('suggestQuality', () => {
  it('GPU rời mạnh → Cực cao khi RAM/luồng đủ, Cao khi không', () => {
    expect(suggestQuality(rtx, { deviceMemory: 8, cores: 16 })).toBe('ultra');
    expect(suggestQuality(rtx, { deviceMemory: 6, cores: 8 })).toBe('high');
    expect(suggestQuality(rtx, { deviceMemory: 8, cores: 6 })).toBe('high');
  });
  it('iGPU, Apple, RAM ≤ 4 GB, ≤ 4 luồng, WebGL2, không rõ → Vừa', () => {
    expect(suggestQuality({ ...rtx, vendor: 'intel', architecture: 'gen-12lp', description: 'Intel(R) Iris(R) Xe Graphics' }, { deviceMemory: 8, cores: 8 })).toBe('medium');
    expect(suggestQuality({ ...rtx, vendor: 'apple', architecture: 'metal-3', description: 'Apple M2' }, { deviceMemory: 8, cores: 8 })).toBe('medium');
    expect(suggestQuality({ ...rtx, vendor: 'amd', architecture: 'rdna-2', description: 'AMD Radeon(TM) Graphics' }, { deviceMemory: 8, cores: 8 })).toBe('medium');
    expect(suggestQuality(rtx, { deviceMemory: 4, cores: 16 })).toBe('medium');
    expect(suggestQuality(rtx, { deviceMemory: 8, cores: 4 })).toBe('medium');
    expect(suggestQuality({ ...rtx, webgpu: false }, { deviceMemory: 8, cores: 16 })).toBe('medium');
    expect(suggestQuality(null, {})).toBe('medium');
    expect(suggestQuality({ ...rtx, maxTexture2D: 8192 }, { deviceMemory: 8, cores: 16 })).toBe('medium');
  });
  it('card AMD rời nhận ra là rời', () => {
    expect(suggestQuality({ ...rtx, vendor: 'amd', architecture: 'rdna-3', description: 'AMD Radeon RX 7800 XT' }, { deviceMemory: 8, cores: 12 })).toBe('ultra');
  });
});

/** Mô phỏng khung từ `from` trong `seconds` giây với CPU `cpu(i)` ms. */
function run(a: AutoQuality, from: number, seconds: number, cpu: (i: number) => number, dt = 16.7): number {
  let now = from;
  for (let i = 0; now < from + seconds * 1000; i++) {
    a.frame(now, cpu(i));
    now += dt;
  }
  return now;
}

describe('AutoQuality', () => {
  it('đủ nhanh thì không hạ', () => {
    const a = new AutoQuality();
    const now = run(a, 0, 12, () => 5);
    expect(a.check(now, 'ultra', false)).toBeNull();
  });
  it('CPU p95 > 12 ms trong 10 s thì hạ Cực cao → Cao → Vừa, rồi dừng; có cooldown', () => {
    const a = new AutoQuality();
    let now = run(a, 0, 11, (i) => (i % 5 === 0 ? 30 : 6)); // 20% khung 30 ms → p95 30
    expect(a.check(now, 'ultra', false)).toBe('high');
    now = run(a, now, 5, () => 30);
    expect(a.check(now, 'high', false)).toBeNull(); // đang cooldown
    now = run(a, now, 27, () => 30);
    expect(a.check(now, 'high', false)).toBe('medium');
    now = run(a, now, 30, () => 30);
    expect(a.check(now, 'medium', false)).toBeNull(); // Vừa không tự hạ
  });
  it('fps < 40 thì hạ dù CPU thấp', () => {
    const a = new AutoQuality();
    const now = run(a, 0, 11, () => 4, 33); // 30 fps
    expect(a.check(now, 'high', false)).toBe('medium');
  });
  it('khóa preset thì không hạ', () => {
    const a = new AutoQuality();
    const now = run(a, 0, 11, () => 40);
    expect(a.check(now, 'ultra', true)).toBeNull();
  });
  it('khoảng trống > 1 s (tab ẩn, màn tải) làm cửa sổ bắt đầu lại, không hạ oan', () => {
    const a = new AutoQuality();
    let now = run(a, 0, 6, () => 30);
    now += 5000;
    now = run(a, now, 6, () => 30);
    expect(a.check(now, 'ultra', false)).toBeNull();
  });
  it('chưa đủ cửa sổ 10 s thì chưa xét', () => {
    const a = new AutoQuality();
    const now = run(a, 0, 5, () => 40);
    expect(a.check(now, 'ultra', false)).toBeNull();
  });
});
