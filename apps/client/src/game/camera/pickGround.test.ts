import { describe, expect, it } from 'vitest';
import { bridgeModel, cauTreoDeckY, VAN_LAM } from '@dtl/shared';
import { groundAt, setActiveLevel } from '../../base/levelCtx';
import { pickGround } from './pickGround';

describe('pickGround: tia chuột trên cầu treo', () => {
  setActiveLevel('van_lam');
  const m = bridgeModel(VAN_LAM.groundAt);
  const mid = { x: (m.ax + m.bx) / 2, z: (m.az + m.bz) / 2 };
  const deck = cauTreoDeckY(m, 0.5);
  it('đứng trên ván: điểm trên ván cho cao độ mặt cầu, ngoài ván cho đất', () => {
    const f = pickGround({ x: mid.x, y: deck, z: mid.z });
    expect(f(mid.x, mid.z)).toBeCloseTo(deck, 5);
    expect(f(mid.x + 8, mid.z)).toBe(groundAt(mid.x + 8, mid.z));
  });
  it('đứng dưới đáy hác hoặc xa cầu: chỉ chọn đất (không bị ván che)', () => {
    const under = pickGround({ x: mid.x, y: groundAt(mid.x, mid.z), z: mid.z });
    expect(under(mid.x, mid.z)).toBe(groundAt(mid.x, mid.z));
    const far = pickGround({ x: m.ax - 80, y: groundAt(m.ax - 80, m.az) + 3, z: m.az });
    expect(far(mid.x, mid.z)).toBe(groundAt(mid.x, mid.z));
  });
});
