import { describe, expect, it } from 'vitest';
import { windupWarp } from './mannequin';
import { NET_LAG_MAX, netLagOf } from '../combat/skillPose';

describe('windupWarp (bù trễ mạng cho khung trúng của đòn dự đoán)', () => {
  it('không bù thì tốc độ thật', () => {
    expect(windupWarp(0.2, 0, 0)).toBe(1);
    expect(windupWarp(0.2, 0, undefined)).toBe(1);
    expect(windupWarp(undefined, 0, 0.1)).toBe(1);
  });

  it('khung trúng 0,2 giây, bù 0,1 giây: nhịp vào thế chạy 2/3 tốc độ nên khung trúng tới sau đúng 0,3 giây thật', () => {
    const k = windupWarp(0.2, 0, 0.1);
    expect(k).toBeCloseTo(2 / 3, 6);
    // Mô phỏng đồng hồ chiêu: mỗi khung cộng dt × k cho tới khi qua mốc trúng.
    let t = 0;
    let real = 0;
    const dt = 1 / 240;
    while (t < 0.2) {
      t += dt * k;
      real += dt;
    }
    expect(real).toBeGreaterThan(0.295);
    expect(real).toBeLessThan(0.31);
  });

  it('bắt đầu giữa clip (`from`) thì chỉ kéo phần còn lại; còn dưới 50 ms thì thôi', () => {
    expect(windupWarp(0.3, 0.1, 0.1)).toBeCloseTo(0.2 / 0.3, 6);
    expect(windupWarp(0.3, 0.27, 0.1)).toBe(1);
    expect(windupWarp(0.1, 0.2, 0.1)).toBe(1);
  });
});

describe('netLagOf (độ bù theo ping engine ước)', () => {
  it('mạng nội bộ không bù, ping cao bù có trần', () => {
    expect(netLagOf(0)).toBe(0);
    expect(netLagOf(30)).toBe(0);
    expect(netLagOf(140)).toBeGreaterThan(0.05);
    expect(netLagOf(140)).toBeLessThan(NET_LAG_MAX);
    expect(netLagOf(900)).toBe(NET_LAG_MAX);
    expect(netLagOf(NaN)).toBe(0);
  });
});
