import { describe, expect, it } from 'vitest';
import { checkDienVoLayout, DIEN_VO_LAYOUT, dienVoZone, type DienVoLayout } from '@dtl/shared';
import {
  addProp,
  addSpawn,
  cloneLayout,
  moveItem,
  pickItem,
  removeItem,
  rotateItem,
  sameLayout,
  scaleItem,
  toggleCollide,
  YAW_STEP,
} from './roomLayout';

const base = (): DienVoLayout => cloneLayout(DIEN_VO_LAYOUT);
const valid = (l: DienVoLayout) => {
  const c = checkDienVoLayout(l);
  // Bản làm việc phải LUÔN ở dạng chuẩn: lưu rồi đọc lại không lệch (nếu lệch, bảng sẽ báo "có thay đổi chưa lưu" mãi).
  expect('ok' in c && sameLayout(c.ok, l), 'err' in c ? c.err : 'không ở dạng chuẩn').toBe(true);
};

describe('chỉnh phòng: phép sửa bố cục', () => {
  it('bắt chuột đúng đạo cụ gần nhất; điểm trống thì không bắt', () => {
    const l = base();
    const p = l.props[0]!;
    expect(pickItem(l, p.x + 0.3, p.z - 0.2)).toEqual({ kind: 'prop', i: 0 });
    expect(pickItem(l, 1300, 985)).toBeNull();
  });

  it('dời có bám lưới 0,25 m và kẹp trong sàn; Alt (snap 0) giữ số lẻ', () => {
    const l = base();
    const s = { kind: 'prop', i: 0 } as const;
    expect(moveItem(l, s, 1290.13, 980.38)).toBe(true);
    expect(l.props[0]).toMatchObject({ x: 1290.25, z: 980.5 });
    expect(moveItem(l, s, 1290.25, 980.5)).toBe(false);
    moveItem(l, s, 1290.1234, 980.5, 0);
    expect(l.props[0]!.x).toBe(1290.123);
    moveItem(l, s, 5000, -5000);
    expect(l.props[0]).toMatchObject({ x: 1323.5, z: 961.5 });
    valid(l);
  });

  it('xoay, phóng (va chạm phóng theo), bật tắt va chạm, xóa', () => {
    const l = base();
    const s = { kind: 'prop', i: 0 } as const;
    for (let k = 0; k < 30; k++) rotateItem(l, s, YAW_STEP);
    expect(Math.abs(l.props[0]!.yaw)).toBeLessThanOrEqual(Math.PI + 1e-3);
    const r0 = l.props[0]!.r!;
    expect(scaleItem(l, s, 2)).toBe(true);
    expect(l.props[0]).toMatchObject({ s: 2, r: r0 * 2 });
    for (let k = 0; k < 20; k++) scaleItem(l, s, 2);
    expect(l.props[0]!.s).toBe(5);
    expect(toggleCollide(l, s)).toBe(true);
    expect(l.props[0]!.r).toBeUndefined();
    toggleCollide(l, s);
    expect(l.props[0]!.r).toBeGreaterThan(0);
    valid(l);
    const n = l.props.length;
    expect(removeItem(l, s)).toBe(true);
    expect(l.props.length).toBe(n - 1);
    expect(removeItem(l, { kind: 'prop', i: 999 })).toBe(false);
    valid(l);
  });

  it('thêm đạo cụ và đèn; đèn có va chạm sẵn', () => {
    const l = base();
    const a = addProp(l, 'prop_da_dung', 1301.1, 990.2, { id: 'prop_da_dung', x: 0, z: 0, yaw: 0, s: 0.45, r: 0.7 });
    expect(l.props[a.i]).toEqual({ id: 'prop_da_dung', x: 1301, z: 990.25, yaw: 0, s: 0.45, r: 0.7 });
    const b = addProp(l, 'prop_den_da', 1302, 991);
    expect(l.props[b.i]).toMatchObject({ id: 'prop_den_da', r: 0.5, s: 1 });
    valid(l);
  });

  it('điểm gọi quái luôn nằm trong khu của nó, kể cả khi kéo ra ngoài', () => {
    const l = base();
    const arena = dienVoZone('arena');
    const s = addSpawn(l, 'arena', 0, 0);
    expect(s).toEqual({ kind: 'spawn', zone: 'arena', i: 0 });
    const far = l.spawns.arena[0]!;
    expect(Math.hypot(far.x - arena.x, far.z - arena.z)).toBeLessThanOrEqual(arena.r! - 1);
    addSpawn(l, 'boss', 1300, 968);
    moveItem(l, { kind: 'spawn', zone: 'boss', i: 0 }, 1300, 1200);
    const boss = dienVoZone('boss');
    const b = l.spawns.boss[0]!;
    expect(Math.hypot(b.x - boss.x, b.z - boss.z)).toBeLessThanOrEqual(boss.r! - 1);
    valid(l);
    // Điểm gọi quái được ưu tiên khi nằm chồng lên đạo cụ.
    const p = l.props[0]!;
    l.spawns.arena[0] = { x: arena.x + 1, z: arena.z };
    expect(pickItem(l, arena.x + 1.2, arena.z)).toEqual({ kind: 'spawn', zone: 'arena', i: 0 });
    expect(pickItem(l, p.x, p.z)).toEqual({ kind: 'prop', i: 0 });
  });
});
