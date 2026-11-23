import { describe, expect, it } from 'vitest';
import { parseBotLines } from './aoiparse';

describe('parseBotLines', () => {
  it('lấy KB/s và tick p95 từ dòng log bot', () => {
    const r = parseBotLines([
      'online=100 world: 100 người, tick p95 5ms | cấp TB bot 15.0 | nhận 12.3 KB/s mỗi bot',
      'không liên quan',
      'online=100 world: 100 người, tick p95 7.5ms | cấp TB bot 15.0 | nhận 9 KB/s mỗi bot',
    ]);
    expect(r.kbps).toEqual([12.3, 9]);
    expect(r.tick).toEqual([5, 7.5]);
  });
});
