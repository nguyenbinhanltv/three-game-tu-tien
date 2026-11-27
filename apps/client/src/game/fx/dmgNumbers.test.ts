import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { DamageNumbers, MERGE_WINDOW, sigilGroundY, STACK_AGE } from './vfx';

// Không có DOM trong test: giả đủ phần `DamageNumbers.spawn` dùng.
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ className: '', textContent: '', style: {}, remove() {} }),
};

describe('số sát thương: gom số nhỏ', () => {
  const layer = { appendChild() {} } as unknown as HTMLElement;
  const p = new THREE.Vector3();

  it('số thường liên tiếp lên cùng mục tiêu gom thành một số cộng dồn', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.spawn('7', p, 'hit', 'm1', 7);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.el.textContent).toBe('17');
  });
  it('mục tiêu khác, số chí mạng, số nặng không gom', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.spawn('7', p, 'hit', 'm2', 7);
    d.spawn('30!', p, 'crit', 'm1');
    d.spawn('40', p, 'hit hv', 'm1', 40);
    expect(d.items).toHaveLength(4);
  });
  it('quá cửa sổ gom thì bật số mới', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.items[0]!.t = 0.5;
    d.spawn('7', p, 'hit', 'm1', 7);
    expect(d.items).toHaveLength(2);
  });
  it('số khắc chế gom với số khắc chế và giữ chữ báo; không gom lẫn với số thường', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10 khắc', p, 'hit ke', 'm1', 10, ' khắc');
    d.spawn('7 khắc', p, 'hit ke', 'm1', 7, ' khắc');
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.el.textContent).toBe('17 khắc');
    d.spawn('5', p, 'hit', 'm1', 5);
    expect(d.items).toHaveLength(2);
  });
  it('cửa sổ gom là 0,25 giây', () => {
    expect(MERGE_WINDOW).toBe(0.25);
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.items[0]!.t = 0.24;
    d.spawn('7', p, 'hit', 'm1', 7);
    expect(d.items).toHaveLength(1);
  });
  it('số mới lên mục tiêu còn số đang bay thì xếp lên hàng trên, không chồng chữ; số đã bay lâu không tính', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.items[0]!.t = 0.4;
    d.spawn('30!', p, 'crit', 'm1');
    d.spawn('9', p, 'hit', 'm2', 9);
    expect(d.items.map((o) => o.row)).toEqual([0, 1, 0]);
    d.items[0]!.t = STACK_AGE + 0.1;
    d.items[1]!.t = STACK_AGE + 0.1;
    d.spawn('8', p, 'hit', 'm1', 8);
    expect(d.items[3]!.row).toBe(0);
  });
});

describe('sigilGroundY (pháp trận không chìm dưới nền dốc)', () => {
  it('nền phẳng: cao hơn mặt đất 0,12 m', () => {
    expect(sigilGroundY(0, 0, 8, () => 5)).toBeCloseTo(5.12, 6);
  });
  it('nền dốc: nằm trên điểm cao nhất trong bán kính, không phải trên điểm giữa', () => {
    const slope = (x: number) => 10 + x * 0.05;
    const y = sigilGroundY(0, 0, 8, slope);
    expect(y).toBeCloseTo(10 + 8 * 0.05 + 0.12, 6);
    expect(y).toBeGreaterThan(slope(0) + 0.12);
  });
});
