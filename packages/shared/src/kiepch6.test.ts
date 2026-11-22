import { describe, expect, it } from 'vitest';
import { seededRng } from './items';
import {
  amInside,
  amPoolHurts,
  amPoolR,
  dapDamage,
  dapParryOk,
  gateAngle,
  gatePos,
  hoiDaoAnswer,
  hoiDaoGateAt,
  hoiDaoRound,
  packGates,
  unpackGates,
} from './kiepch6';
import { tribDef, TRIB_MECHANIC_IDS } from './tribulation';

const AM = tribDef('am_hu').phases.find((p) => p.amLan)!.amLan!;
const DD = tribDef('duong_thuc').phases.find((p) => p.duongDap)!.duongDap!;
const HD = tribDef('van_dinh').phases.find((p) => p.hoiDao)!.hoiDao!;

describe('kiếp chương 6: dữ liệu', () => {
  it('ba cơ chế có trong danh sách hợp lệ và có khối cấu hình ở đúng kiếp', () => {
    for (const id of ['hoi_dao', 'am_lan', 'duong_dap']) expect(TRIB_MECHANIC_IDS).toContain(id);
    expect(tribDef('van_dinh').phases.find((p) => p.mechanic === 'hoi_dao')?.hoiDao).toBeTruthy();
    expect(tribDef('am_hu').phases.find((p) => p.mechanic === 'am_lan')?.amLan).toBeTruthy();
    expect(tribDef('duong_thuc').phases.find((p) => p.mechanic === 'duong_dap')?.duongDap).toBeTruthy();
  });
});

describe('hoi_dao (Vấn Đỉnh)', () => {
  it('mỗi vòng ba cổng là hoán vị 1..3, dấu giữa sân 1..3, đúng một cổng đúng; tất định theo seed', () => {
    const rng = seededRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const r = hoiDaoRound(rng(), rng(), rng());
      expect([...r.gates].sort()).toEqual([1, 2, 3]);
      expect(r.mark).toBeGreaterThanOrEqual(1);
      expect(r.mark).toBeLessThanOrEqual(3);
      expect(r.gates.filter((g) => g === r.mark)).toHaveLength(1);
      expect(r.gates[hoiDaoAnswer(r)]).toBe(r.mark);
      seen.add(r.mark * 1000 + packGates(r.gates));
    }
    expect(seen.size).toBe(18); // 3 dấu × 6 hoán vị, đều xuất hiện
    const a = seededRng(7);
    const b = seededRng(7);
    expect(hoiDaoRound(a(), a(), a())).toEqual(hoiDaoRound(b(), b(), b()));
    // biên: số ngẫu nhiên sát 1 không ra ngoài khoảng
    expect(hoiDaoRound(0.999999, 0.999999, 0.999999).gates).toEqual([3, 2, 1]);
  });

  it('ba cổng cách đều, đứng giữa cổng thì nhận đúng cổng, đứng giữa sân thì không cổng nào', () => {
    const c = { x: 100, z: 200 };
    for (let i = 0; i < 3; i++) {
      const g = gatePos(c, HD.ring, i);
      expect(Math.hypot(g.x - c.x, g.z - c.z)).toBeCloseTo(HD.ring, 6);
      expect(hoiDaoGateAt(c, HD, g.x, g.z)).toBe(i);
      expect(hoiDaoGateAt(c, HD, g.x + HD.gateR + 0.5, g.z)).toBe(-1);
    }
    expect(hoiDaoGateAt(c, HD, c.x, c.z)).toBe(-1);
    expect(gateAngle(0)).toBeCloseTo(Math.PI);
    // hai cổng không chồng nhau
    const g0 = gatePos(c, HD.ring, 0);
    const g1 = gatePos(c, HD.ring, 1);
    expect(Math.hypot(g0.x - g1.x, g0.z - g1.z)).toBeGreaterThan(HD.gateR * 2);
  });

  it('mã hóa ba cổng thành số nguyên rồi giải ra như cũ', () => {
    expect(unpackGates(packGates([3, 1, 2]))).toEqual([3, 1, 2]);
  });
});

describe('am_lan (Âm Hư)', () => {
  it('bán kính: mầm r0 trong seed, lan tuyến tính tới r1, giữ, rồi tan', () => {
    expect(amPoolR(AM, -1)).toBe(0);
    expect(amPoolR(AM, 0)).toBe(AM.r0);
    expect(amPoolR(AM, AM.seed * 1000 - 1)).toBe(AM.r0);
    expect(amPoolR(AM, (AM.seed + AM.grow / 2) * 1000)).toBeCloseTo((AM.r0 + AM.r1) / 2, 6);
    expect(amPoolR(AM, (AM.seed + AM.grow) * 1000)).toBeCloseTo(AM.r1, 6);
    expect(amPoolR(AM, (AM.seed + AM.grow + AM.hold / 2) * 1000)).toBeCloseTo(AM.r1, 6);
    expect(amPoolR(AM, (AM.seed + AM.grow + AM.hold + 0.01) * 1000)).toBe(0);
    let prev = 0;
    for (let ms = 0; ms <= (AM.seed + AM.grow) * 1000; ms += 100) {
      const r = amPoolR(AM, ms);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('mầm không gây hại; vực lan gây hại; chồng nhiều vực vẫn chỉ là "trong" (không cộng dồn)', () => {
    expect(amPoolHurts(AM, 0)).toBe(false);
    expect(amPoolHurts(AM, AM.seed * 1000)).toBe(true);
    const t = (AM.seed + 1) * 1000;
    const a = { x: 0, z: 0, at: 0 };
    expect(amInside(AM, [a], t, 0, 0)).toBe(true);
    expect(amInside(AM, [a], t, 40, 0)).toBe(false);
    // mầm chưa hại
    expect(amInside(AM, [a], 100, 0, 0)).toBe(false);
    // ba vực chồng đúng một chỗ: kết quả vẫn là boolean "trong", mức hại do server áp một lần mỗi nhịp
    expect(amInside(AM, [a, { ...a }, { ...a }], t, 0, 0)).toBe(true);
    // đã tan thì không hại
    expect(amInside(AM, [a], (AM.seed + AM.grow + AM.hold + 1) * 1000, 0, 0)).toBe(false);
  });

  it('người chạy 6 m/s thoát được vực đang lan (tốc độ lan nhỏ hơn)', () => {
    expect((AM.r1 - AM.r0) / AM.grow).toBeLessThan(6);
  });
});

describe('duong_dap (Dương Thực)', () => {
  it('chỉ chiêu trong cửa sổ cuối mới là phản đòn', () => {
    const impact = 10_000;
    expect(dapParryOk(DD, impact, impact - DD.win * 1000 - 1)).toBe(false);
    expect(dapParryOk(DD, impact, impact - DD.win * 1000)).toBe(true);
    expect(dapParryOk(DD, impact, impact)).toBe(true);
    expect(dapParryOk(DD, impact, impact + 1)).toBe(false);
  });

  it('phản đòn cắt đúng phần trăm; không phản thì chịu trọn', () => {
    expect(dapDamage(DD, 1000, false)).toBe(Math.round(1000 * DD.pct));
    expect(dapDamage(DD, 1000, true)).toBe(Math.round(1000 * DD.pct * (1 - DD.cut)));
    expect(dapDamage(DD, 1000, true)).toBeLessThan(dapDamage(DD, 1000, false));
    // đòn không phản đòn không giết người đầy máu (pct < 1) nhưng hai đòn liền thì có thể
    expect(DD.pct).toBeLessThan(0.5);
  });

  it('cửa sổ phản đòn đủ rộng cho nhịp GCD 1 giây', () => {
    expect(DD.win).toBeGreaterThanOrEqual(0.8);
    expect(DD.windup).toBeGreaterThan(DD.win);
    expect(DD.every).toBeGreaterThan(DD.windup);
  });
});
