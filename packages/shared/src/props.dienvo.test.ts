import { describe, expect, it } from 'vitest';
import {
  checkDienVoLayout,
  DIEN_VO_CENTER,
  DIEN_VO_HALF,
  DIEN_VO_LAYOUT,
  DIEN_VO_PROPS,
  DIEN_VO_ZONES,
  dienVoSpawnAt,
  dienVoZone,
  setDienVoLayout,
} from './props.dienvo';
import layoutJson from './props.dienvo.layout.json';

const inFloor = (x: number, z: number, pad = 0) =>
  Math.abs(x - DIEN_VO_CENTER.x) <= DIEN_VO_HALF - pad && Math.abs(z - DIEN_VO_CENTER.z) <= DIEN_VO_HALF - pad;

describe('Diễn Võ Trường: bố cục sáu khu', () => {
  it('đủ sáu khu, khu nào cũng nằm trọn trong sàn', () => {
    expect(DIEN_VO_ZONES.map((z) => z.id).sort()).toEqual(['arena', 'boss', 'fx', 'light', 'props', 'stage']);
    for (const z of DIEN_VO_ZONES) {
      const hx = z.r ?? z.hx ?? 0;
      const hz = z.r ?? z.hz ?? 0;
      expect(inFloor(z.x - hx, z.z - hz) && inFloor(z.x + hx, z.z + hz), z.id).toBe(true);
    }
  });

  it('đạo cụ nằm trong sàn và không đứng trong vòng đánh của sàn đấu hay hố boss', () => {
    for (const p of DIEN_VO_PROPS) {
      expect(inFloor(p.x, p.z), p.id).toBe(true);
      for (const id of ['arena', 'boss'] as const) {
        const z = dienVoZone(id);
        expect(Math.hypot(p.x - z.x, p.z - z.z), `${p.id} trong ${id}`).toBeGreaterThan((z.r ?? 0) - 1.6);
      }
    }
  });

  it('quái gọi ra đứng trong khu của nó, cách nhau đủ xa', () => {
    for (const boss of [false, true]) {
      const z = dienVoZone(boss ? 'boss' : 'arena');
      for (const n of [1, 3, 5, 10, 20]) {
        const pts = Array.from({ length: n }, (_, i) => dienVoSpawnAt(i, n, boss));
        for (const p of pts) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeLessThanOrEqual((z.r ?? 0) - 1);
        if (n > 1 && n <= 10) {
          const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.z - pts[1]!.z);
          expect(d).toBeGreaterThan(boss ? 1 : 1.5);
        }
      }
    }
  });
});

describe('Diễn Võ Trường: bố cục chỉnh tay (props.dienvo.layout.json)', () => {
  const snap = () => JSON.parse(JSON.stringify(DIEN_VO_LAYOUT)) as typeof DIEN_VO_LAYOUT;

  it('file bố cục hợp lệ và đã ở dạng chuẩn (lưu lại không đổi gì)', () => {
    const c = checkDienVoLayout(layoutJson);
    expect('ok' in c && c.ok).toEqual(layoutJson);
    expect(DIEN_VO_PROPS.length).toBeGreaterThan(20);
  });

  it('điểm gọi quái đặt tay được dùng theo thứ tự, hết điểm thì xếp vòng như cũ', () => {
    const before = snap();
    const ring = dienVoSpawnAt(1, 3, false);
    try {
      expect(setDienVoLayout({ ...before, spawns: { arena: [{ x: 1298, z: 983 }], boss: [{ x: 1301, z: 969 }] } })).toBeNull();
      expect(dienVoSpawnAt(0, 3, false)).toEqual({ x: 1298, z: 983 });
      expect(dienVoSpawnAt(1, 3, false)).toEqual(ring);
      expect(dienVoSpawnAt(0, 1, true)).toEqual({ x: 1301, z: 969 });
    } finally {
      setDienVoLayout(before);
    }
    expect(snap()).toEqual(before);
    expect(dienVoSpawnAt(0, 1, false)).toEqual({ x: 1300, z: 985 });
  });

  it('đổi bố cục giữ nguyên danh tính mảng (propsOf và server thấy ngay)', () => {
    const before = snap();
    const arr = DIEN_VO_PROPS;
    try {
      expect(setDienVoLayout({ props: [{ id: 'prop_den_da', x: 1300.12345, z: 990, yaw: 0, s: 1 }], spawns: { arena: [], boss: [] } })).toBeNull();
      expect(DIEN_VO_PROPS).toBe(arr);
      expect(arr).toEqual([{ id: 'prop_den_da', x: 1300.123, z: 990, yaw: 0, s: 1 }]);
    } finally {
      setDienVoLayout(before);
    }
  });

  it('bố cục sai bị từ chối và bản đang dùng không đổi', () => {
    const before = snap();
    const p = { id: 'prop_den_da', x: 1300, z: 990, yaw: 0, s: 1 };
    const bad: unknown[] = [
      null,
      {},
      { props: [{ ...p, x: 1200 }] },
      { props: [{ ...p, id: '../../etc' }] },
      { props: [{ ...p, s: 99 }] },
      { props: [{ ...p, yaw: Number.NaN }] },
      { props: [], spawns: { arena: [{ x: 1300, z: 960 }] } },
      { props: Array.from({ length: 201 }, () => p) },
    ];
    for (const b of bad) expect(setDienVoLayout(b), JSON.stringify(b)?.slice(0, 80)).not.toBeNull();
    expect(snap()).toEqual(before);
  });
});
