import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ArchBox, buildArchBoxes, type Tri } from './archcollider.js';

// Dựng lưới tam giác thủ công: hộp đặc, tường mỏng, bậc thang, mái cao.
const quad = (a: number[], b: number[], c: number[], d: number[]): Tri[] => [
  [...a, ...b, ...c] as unknown as Tri,
  [...a, ...c, ...d] as unknown as Tri,
];
/** Hộp trục [x0,y0,z0]-[x1,y1,z1]: 6 mặt, pháp tuyến hướng ra (đúng chiều quấn). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tri[] {
  return [
    ...quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]), // đỉnh (lên)
    ...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]), // đáy (xuống)
    ...quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]), // -z
    ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), // +z
    ...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]), // -x
    ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]), // +x
  ];
}
const flat = { groundAt: () => 0 };
const cover = (b: ArchBox[], x: number, z: number, y: number, walk?: 0 | 1): boolean =>
  b.some(
    (q) =>
      x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3] && y >= q[4] - 1e-6 && y <= q[5] + 1e-6 && (walk === undefined || q[6] === walk),
  );

describe('archcollider: hộp rắn, bậc thang, mái', () => {
  it('khối đặc 3 m không có thang: hộp rắn từ đất tới đỉnh phủ cả phần giữa khối', () => {
    const b = buildArchBoxes(box(10, 0, 10, 16, 3, 16), flat);
    expect(cover(b, 13, 13, 1.5, 0)).toBe(true);
    expect(cover(b, 13, 13, 3, 0)).toBe(true);
    expect(cover(b, 20, 20, 1, 0)).toBe(false);
  });

  it('bậc thang cao 0,4 m mỗi bậc: mỗi bậc là hộp walk, không chặn', () => {
    const tris: Tri[] = [];
    for (let i = 0; i < 5; i++) tris.push(...box(10, 0, 10 + i * 1, 14, 0.4 * (i + 1), 11 + i * 1));
    const b = buildArchBoxes(tris, flat);
    for (let i = 0; i < 5; i++) expect(cover(b, 12, 10.5 + i, 0.4 * (i + 1), 1), `bậc ${i}`).toBe(true);
    // đỉnh bậc cuối (2,0) đứng được, không bị coi là khối rắn
    expect(b.filter((q) => q[6] === 0 && q[5] >= 1.9 && q[0] <= 12 && q[2] >= 12 && q[1] <= 14 && q[3] >= 14)).toHaveLength(0);
  });

  it('tường mỏng 3 m: hộp rắn; mái phẳng cao 4 m phía trên sàn: đi dưới được (không hộp)', () => {
    const tris = [...box(10, 0, 10, 10.5, 3, 20), ...box(5, 4, 5, 30, 4.3, 30)];
    const b = buildArchBoxes(tris, flat);
    expect(cover(b, 10.2, 15, 1.5, 0)).toBe(true);
    expect(cover(b, 20, 25, 1, 0)).toBe(false);
    expect(cover(b, 7, 7, 1, 0)).toBe(false);
  });

  it('mái hiên thấp (đáy 1,2 m): chặn', () => {
    const b = buildArchBoxes(box(10, 1.2, 10, 14, 1.5, 14), flat);
    expect(cover(b, 12, 12, 1.3, 0)).toBe(true);
  });
});

<<<<<<< HEAD
describe('archcollider: thềm bậc sâu 0,5 m (cùng ô với mặt đứng bậc kế)', () => {
  it('8 bậc sâu 0,5 m cao 0,25 m: mọi bậc là hộp walk, leo được tới thềm trên', () => {
    const tris: Tri[] = [];
    for (let i = 0; i < 8; i++) tris.push(...box(10, 0, 10 + i * 0.5, 14, 0.25 * (i + 1), 10.5 + i * 0.5));
    // thềm 2 m x 4 m ở trên cùng, thân điện chặn phía sau
    tris.push(...box(10, 0, 14, 14, 2, 16), ...box(10, 0, 16, 14, 8, 17));
    const b = buildArchBoxes(tris, flat);
    for (let i = 0; i < 8; i++) expect(cover(b, 12, 10.25 + i * 0.5, 0.25 * (i + 1), 1), `bậc ${i}`).toBe(true);
    expect(cover(b, 12, 15, 2, 1)).toBe(true); // thềm đỉnh đứng được
    expect(cover(b, 12, 16.5, 4, 0)).toBe(true); // thân điện chặn
  });
});

=======
>>>>>>> origin/main
describe('archcollider: khối lơ lửng', () => {
  it('sàn/mái cách đất 5 m không nối với đất: đi dưới gầm được, không hộp chặn', () => {
    const b = buildArchBoxes(box(10, 5, 10, 14, 5.3, 14), flat);
    expect(cover(b, 12, 12, 1, undefined)).toBe(false);
  });

  it('đình lơ lửng không có đất mở bên dưới (đất thấp hơn 5 m, mẫu thấp nhất cao hơn tầm đầu): hộp lơ lửng từ mẫu thấp nhất', () => {
    // Cột đỡ hộp trên vách: đất nằm dưới thấp (groundAt = -10), sàn cao 5 m: mẫu thấp nhất cao hơn đất 15 m, nhưng ô có mặt đất mở → vẫn là mái.
    const b = buildArchBoxes(box(10, 5, 10, 14, 5.3, 14), { groundAt: () => 4.9 });
    // đất 4,9 sát sàn: sàn là vật đặc từ đất lên 5,3 (cao 0,4 m) → bậc đứng được (walk), đi lên được
    expect(cover(b, 12, 12, 5.3, 1)).toBe(true);
  });
});

describe('file hộp kiến trúc khớp GLB', () => {
  it('arch_sect.boxes.json không cũ so với GLB (chạy pnpm colliders:arch nếu asset đổi)', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/archcollider.cli.ts', '--id', 'arch_sect', '--origin', '2048,150,2048', '--level', 'van_lam', '--check'],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' },
    );
    expect(r.status, r.stderr).toBe(0);
  }, 60_000);
});
