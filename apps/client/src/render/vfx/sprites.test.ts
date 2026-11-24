import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_SPRITES } from '@dtl/shared';
import { SPRITE_ATLAS_FILE, SPRITE_COLS, SPRITE_ROWS } from './art';
import { shapeGeometry, shapeKind } from './fxShapes';

describe('sprite vẽ tay (Họa Pháp Lô 2)', () => {
  it('mọi sprite có một ô trong atlas, không trùng tên', () => {
    expect(FX_SPRITES.length).toBeLessThanOrEqual(SPRITE_COLS * SPRITE_ROWS);
    expect(new Set(FX_SPRITES).size).toBe(FX_SPRITES.length);
  });

  it('hình sprite là tấm quay mặt về camera, kiểu vật liệu riêng không gộp instance', () => {
    expect(shapeKind('sprite')).toBe('sprite');
    expect(shapeGeometry('sprite').getAttribute('position').count).toBeGreaterThanOrEqual(4);
  });

  it('atlas nằm trong sổ khóa asset (nhị phân ở R2, không commit)', () => {
    const lock = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../../assets/asset-lock.json'), 'utf8')) as {
      files: Record<string, { sha256: string; bytes: number }>;
    };
    const e = lock.files[SPRITE_ATLAS_FILE];
    expect(e, 'chạy `pnpm assets:push` sau khi đổi atlas').toBeTruthy();
    expect(e!.bytes).toBeGreaterThan(100_000);
    // R2 bất biến: tên file phải chứa 10 ký tự đầu của sha256 nội dung (đổi nội dung = tên mới, không ghi đè)
    expect(SPRITE_ATLAS_FILE).toContain(`.${e!.sha256.slice(0, 10)}.webp`);
  });
});
