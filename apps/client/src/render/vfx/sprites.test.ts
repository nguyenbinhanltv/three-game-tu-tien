import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_SPRITES } from '@dtl/shared';
import { SPRITE_ATLAS_FILE, SPRITE_CELL_PX, SPRITE_COLS, SPRITE_MAX_SIDE_PX, SPRITE_ROWS } from './art';
import { shapeGeometry, shapeKind } from './fxShapes';

describe('sprite vẽ tay (Họa Pháp Lô 2)', () => {
  it('atlas sprite không vượt giới hạn texture mặc định của WebGPU (8192 px mỗi cạnh)', () => {
    expect(SPRITE_COLS * SPRITE_CELL_PX).toBeLessThanOrEqual(SPRITE_MAX_SIDE_PX);
    expect(SPRITE_ROWS * SPRITE_CELL_PX).toBeLessThanOrEqual(SPRITE_MAX_SIDE_PX);
  });

  it('mọi sprite có một ô trong atlas, không trùng tên', () => {
    expect(FX_SPRITES.length).toBeLessThanOrEqual(SPRITE_COLS * SPRITE_ROWS);
    // WebGPU mặc định chỉ cho cạnh texture ≤ 8192 px (quá thì mất thiết bị GPU, màn đen): atlas ô 512 px không được vượt.
    expect(SPRITE_COLS * 512).toBeLessThanOrEqual(8192);
    expect(SPRITE_ROWS * 512).toBeLessThanOrEqual(8192);
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
    // R2 bất biến: tên mới phải chứa hash nội dung; tên cố định chỉ được nếu là file cũ trong danh sách ân hạn
    const grace = new Set(
      (
        JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../../assets/asset-fixed-names.json'), 'utf8')) as {
          files: string[];
        }
      ).files,
    );
    const hashed = SPRITE_ATLAS_FILE.includes(`.${e!.sha256.slice(0, 10)}.webp`);
    expect(hashed || grace.has(SPRITE_ATLAS_FILE), 'atlas mới phải đặt tên theo hash (xem docs/handbook/vfx-forge.md)').toBe(true);
  });
});
