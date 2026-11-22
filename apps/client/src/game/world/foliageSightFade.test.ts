import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tán cây sinh bằng code (alphaTest) phải mờ được khi che nhân vật/mục tiêu (camera chéo: một tán che kín cả khung, P3b).
 * Mọi `createWorldMaterial({... alphaTest ...})` trong game/world phải nằm trong `withSightFade(...)`/`withOccluderFade(...)`,
 * hoặc dòng đó ghi `sight-exempt: <lý do>` (vật nhỏ/không cao hơn người, hoặc được bọc ở nơi khác).
 */
describe('tán lá mờ được khi che', () => {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  it('mọi vật liệu lá alphaTest đều bọc withSightFade hoặc có sight-exempt', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!/createWorldMaterial\(/.test(l) || !/alphaTest/.test(l)) return;
        if (/with(Sight|Occluder)Fade\(/.test(l) || /sight-exempt/.test(l)) return;
        bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
