import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { DamageNumbers, DMG_LIFE, DMG_RISE, dmgHeight, MERGE_WINDOW, pickDmgSlot, sigilGroundY, STACK_AGE, STACK_PX } from './vfx';

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
    // Số thường tuổi 0,4 s đã bay lên ~25 px; số chí mạng cao 34 px phải cách tâm nó ≥ 28 px nên lên hàng 3 (66 px), không phải hàng 1.
    expect(d.items.map((o) => o.row)).toEqual([0, 3, 0]);
    d.items[0]!.t = STACK_AGE + 0.1;
    d.items[1]!.t = STACK_AGE + 0.1;
    d.spawn('8', p, 'hit', 'm1', 8);
    expect(d.items[3]!.row).toBe(0);
  });
});

describe('pickDmgSlot (xếp chỗ số sát thương)', () => {
  const offset = (o: { row: number; t: number }) => o.row * STACK_PX + (o.t / DMG_LIFE) * DMG_RISE;
  it('không có số nào đang bay: làn giữa, hàng 0', () => {
    expect(pickDmgSlot([], dmgHeight('hit'))).toEqual({ row: 0, lane: 0 });
  });
  it('bắn dày 20 số trộn cách nhau 80 ms: không cặp số cùng làn nào chồng lên nhau theo chiều dọc', () => {
    const kinds = ['hit', 'hit', 'hit hv', 'crit', 'hit ke', 'hit', 'hit'];
    let live: { row: number; lane: number; t: number; h: number }[] = [];
    let worst = Infinity;
    const lanes = new Set<number>();
    for (let i = 0; i < 20; i++) {
      live = live.map((o) => ({ ...o, t: o.t + 0.08 })).filter((o) => o.t < DMG_LIFE);
      const h = dmgHeight(kinds[i % kinds.length]!);
      const slot = pickDmgSlot(live, h);
      lanes.add(slot.lane);
      for (const o of live) if (o.lane === slot.lane) worst = Math.min(worst, Math.abs(offset(o) - slot.row * STACK_PX) - (o.h + h) / 2);
      live.push({ ...slot, t: 0, h });
    }
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(lanes.size).toBeGreaterThan(1);
  });
  it('đòn thưa (cách nhau 0,5 s) luôn ở làn giữa, hàng thấp', () => {
    expect(pickDmgSlot([{ row: 0, lane: 0, t: 0.5, h: 22 }], 22)).toEqual({ row: 0, lane: 0 });
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
