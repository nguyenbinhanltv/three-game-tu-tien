import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bakeLevel, bakeLevels, serialize } from './colliderBake';

const DIR = path.resolve(__dirname, '../../../../../packages/content/data/colliders');
const BAKE = process.env.DTL_BAKE_COLLIDERS === '1';

describe('bake collider từ hàm rải prop (COL-1 / C-2)', () => {
  for (const level of bakeLevels()) {
    it(`${level}: ${BAKE ? 'ghi' : 'khớp'} data/colliders/${level}.inst.json`, () => {
      const text = serialize(bakeLevel(level));
      const file = path.join(DIR, `${level}.inst.json`);
      if (BAKE) {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(file, text);
        return;
      }
      expect(fs.existsSync(file), `thiếu ${level}.inst.json: chạy pnpm colliders:bake`).toBe(true);
      expect(fs.readFileSync(file, 'utf8').replace(/\r/g, ''), `hàm rải đổi, chạy pnpm colliders:bake`).toBe(text);
    });
  }
});
