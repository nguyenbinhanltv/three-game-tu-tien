import { describe, expect, it } from 'vitest';
import { readTestParams, showAssetId } from './testParams';

describe('tham số URL kiểm thử', () => {
  it('?god và ?at', () => {
    expect(readTestParams('?mute=1')).toEqual({});
    expect(readTestParams('?mute=1&god')).toEqual({ god: true });
    expect(readTestParams('?god=1&at=rung')).toEqual({ god: true, at: 'rung' });
    expect(readTestParams('?god=0&at=Boss')).toEqual({ at: 'boss' });
    expect(readTestParams('?at=../x')).toEqual({});
  });
  it('?show=char là alias của model người chơi', () => {
    expect(showAssetId('?show=char')).toBe('chr_kiem_tu_nam');
    expect(showAssetId('?show=mon_soi_xam')).toBe('mon_soi_xam');
    expect(showAssetId('?show=../a.glb')).toBeNull();
    expect(showAssetId('?mute=1')).toBeNull();
  });
});
