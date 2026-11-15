import { describe, expect, it } from 'vitest';
import { debugAllowed, readTestParams, showAssetId } from './testParams';

describe('tham số URL kiểm thử', () => {
  it('?god và ?at', () => {
    expect(readTestParams('?mute=1')).toEqual({});
    expect(readTestParams('?mute=1&god')).toEqual({ god: true });
    expect(readTestParams('?god=1&at=rung')).toEqual({ god: true, at: 'rung' });
    expect(readTestParams('?god=0&at=Boss')).toEqual({ at: 'boss' });
    expect(readTestParams('?at=../x')).toEqual({});
  });
  it('?at=x,z thành tọa độ, không lẫn với địa điểm đặt tên', () => {
    expect(readTestParams('?at=2300,2400')).toEqual({ pos: [2300, 2400] });
    expect(readTestParams('?at=2300.5,-12')).toEqual({ pos: [2300.5, -12] });
    expect(readTestParams('?at=2300,')).toEqual({});
    expect(readTestParams('?at=1,2,3')).toEqual({});
    expect(readTestParams('?at=1e9,2')).toEqual({});
  });
  it('?realm và ?tribulation', () => {
    expect(readTestParams('?debug=1&realm=nk15&god=1&at=2048,2088')).toEqual({ god: true, pos: [2048, 2088], realm: 15 });
    expect(readTestParams('?realm=tc')).toEqual({ realm: 16 });
    expect(readTestParams('?realm=nk16')).toEqual({});
    expect(readTestParams('?realm=kimdan')).toEqual({});
    expect(readTestParams('?tribulation=1')).toEqual({ trib: true });
    expect(readTestParams('?tribulation=0')).toEqual({});
  });
  it('bảng F3: bản dev luôn mở được, bản build cần ?debug', () => {
    expect(debugAllowed('?mute=1', true)).toBe(true);
    expect(debugAllowed('?mute=1', false)).toBe(false);
    expect(debugAllowed('?debug=1', false)).toBe(true);
    expect(debugAllowed('?debug', false)).toBe(true);
    expect(debugAllowed('?debug=0', false)).toBe(false);
  });
  it('?show=char là alias của model người chơi', () => {
    expect(showAssetId('?show=char')).toBe('chr_kiem_tu_nam');
    expect(showAssetId('?show=mon_soi_xam')).toBe('mon_soi_xam');
    expect(showAssetId('?show=../a.glb')).toBeNull();
    expect(showAssetId('?mute=1')).toBeNull();
  });
});
