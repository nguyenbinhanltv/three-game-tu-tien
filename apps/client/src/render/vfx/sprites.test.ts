import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_SPRITES } from '@dtl/shared';
import { SPRITE_COLS, SPRITE_ROWS } from './art';
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

  it('atlas WebP có đủ ô và đúng kích thước lưới (ô vuông 512)', () => {
    const f = path.resolve(import.meta.dirname, '../../../public/hoa-truc/vfx_sprites.webp');
    const b = fs.readFileSync(f);
    // WebP: "RIFF" + size + "WEBP" + chunk "VP8X"; rộng/cao − 1 là 24 bit little-endian ở byte 24 và 27.
    expect(b.subarray(0, 4).toString()).toBe('RIFF');
    expect(b.subarray(8, 12).toString()).toBe('WEBP');
    expect(b.subarray(12, 16).toString()).toBe('VP8X');
    const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    expect(w).toBe(SPRITE_COLS * 512);
    expect(h).toBe(SPRITE_ROWS * 512);
  });
});
