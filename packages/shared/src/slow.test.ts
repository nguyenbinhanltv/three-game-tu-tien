import { describe, expect, it } from 'vitest';
import { mergeSlow } from './slow';

describe('mergeSlow', () => {
  it('không có hoặc đã hết hạn thì lấy cái mới', () => {
    expect(mergeSlow(undefined, { until: 5000, mul: 0.5 }, 0)).toEqual({ until: 5000, mul: 0.5 });
    expect(mergeSlow({ until: 900, mul: 0.1 }, { until: 5000, mul: 0.5 }, 1000)).toEqual({ until: 5000, mul: 0.5 });
  });
  it('đang chậm thì giữ hạn lớn hơn và hệ số nhỏ hơn (không bị nguồn ngắn/yếu cắt)', () => {
    expect(mergeSlow({ until: 60000, mul: 0.3 }, { until: 2000, mul: 0.4 }, 1000)).toEqual({ until: 60000, mul: 0.3 });
    expect(mergeSlow({ until: 2000, mul: 0.9 }, { until: 9000, mul: 0.4 }, 1000)).toEqual({ until: 9000, mul: 0.4 });
    expect(mergeSlow({ until: 9000, mul: 0.9 }, { until: 2000, mul: 0.4 }, 1000)).toEqual({ until: 9000, mul: 0.4 });
  });
});
