import { describe, expect, it } from 'vitest';
import type { LevelDef } from '@dtl/shared';
import { ensureLevel, FIXTURE_FREE, FIXTURE_ID, FIXTURE_PADS, FIXTURE_PROPS } from './fixtures';
import { LEVELS } from './index';
import { checkLevel, type LevelCheckOpts } from './levelcheck';

import { at } from '@dtl/shared';
const base = (): LevelDef => structuredClone(ensureLevel(FIXTURE_ID)!);
const OPTS: LevelCheckOpts = {
  strings: false,
  assets: false,
  pads: FIXTURE_PADS,
  free: FIXTURE_FREE,
  props: FIXTURE_PROPS,
  coverage: false,
};
const run = (lv: LevelDef, o: LevelCheckOpts = {}) => checkLevel(lv, { ...OPTS, ...o });

describe('checkLevel: mọi level', () => {
  it('Vân Lam và Kiếm Trủng đạt (ngưỡng cũ giữ nguyên)', () => {
    expect(checkLevel(at(LEVELS, 'van_lam'))).toEqual([]);
    expect(checkLevel(at(LEVELS, 'kiem_trung'))).toEqual([]);
  });

  it('level thử nhỏ đạt: mật độ trong 100–140/km², tinh anh 2 mỗi vùng', () => {
    expect(run(base())).toEqual([]);
  });
});

describe('checkLevel: bắt lỗi trên level thử', () => {
  const bad = (mut: (lv: LevelDef) => void, o?: LevelCheckOpts) => {
    const lv = base();
    mut(lv);
    return run(lv, o).join('\n');
  };

  it('camp ngoài đa giác vùng / lệch cấp / sai count', () => {
    expect(bad((l) => Object.assign(at(l.camps!, 0), { x: 100 }))).toMatch(/camp tn_a1 nằm ngoài đa giác/);
    expect(bad((l) => Object.assign(at(l.camps!, 0), { levelMax: 30 }))).toMatch(/camp tn_a1 cấp .* lệch khoảng cấp/);
    expect(bad((l) => Object.assign(at(l.camps!, 0), { count: 6 }))).toMatch(/count 6 phải 3–4/);
  });

  it('camp đè collider và đè prop', () => {
    expect(bad((l) => Object.assign(at(l.camps!, 2), { x: 380, z: 640 }))).toMatch(/camp tn_a3 đè collider/);
    expect(bad((l) => Object.assign(at(l.camps!, 0), { x: 500, z: 620 }), { props: FIXTURE_PROPS })).toMatch(
      /camp tn_a1 đè prop prop_bia_da/,
    );
  });

  it('mật độ ngoài 100–140/km²', () => {
    expect(bad((l) => l.camps!.splice(0, 3))).toMatch(/mật độ \d+ quái\/km²/);
    expect(
      bad((l) =>
        l.camps!.push({ ...at(l.camps!, 0), id: 'tn_a9' }, { ...at(l.camps!, 1), id: 'tn_a8' }, { ...at(l.camps!, 2), id: 'tn_a7' }),
      ),
    ).toMatch(/mật độ \d+ quái\/km²/);
  });

  it('id quái không tồn tại, cấp vượt thang, spawn ngoài vùng chơi', () => {
    expect(bad((l) => Object.assign(at(l.camps!, 0), { mon: 'mon_khong_co' }))).toMatch(/quái không tồn tại mon_khong_co/);
    expect(bad((l) => Object.assign(at(l.zones!, 1), { lvMax: 33 }))).toMatch(/khoảng cấp 20–33 không hợp lệ/);
    expect(bad((l) => Object.assign(at(l.spawns, 0), { x: 5 }))).toMatch(/ngoài vùng chơi/);
    expect(bad((l) => Object.assign(at(l.spawns, 0), { levelMax: 40 }))).toMatch(/cấp 16–40 không hợp lệ/);
  });

  it('thiếu tinh anh trong vùng', () => {
    expect(bad((l) => l.spawns.splice(0, 1))).toMatch(/zone tn_a: 1 tinh anh/);
  });

  it('trận truyền tống: sai vùng, đè collider, thiếu trận mở sẵn, vùng thiếu trận', () => {
    expect(run(base(), { pads: [{ ...at(FIXTURE_PADS, 0), x: 600 }, at(FIXTURE_PADS, 1)] }).join('\n')).toMatch(
      /trận tn_tp_a: không nằm trong vùng tn_a/,
    );
    expect(run(base(), { pads: [{ ...at(FIXTURE_PADS, 0), x: 382, z: 640 }, at(FIXTURE_PADS, 1)] }).join('\n')).toMatch(
      /trận tn_tp_a: đè collider/,
    );
    expect(run(base(), { free: [] }).join('\n')).toMatch(/cần ít nhất một trận mở sẵn/);
    expect(run(base(), { pads: [at(FIXTURE_PADS, 0)] }).join('\n')).toMatch(/vùng tn_b cần đúng một Truyền Tống Trận/);
  });

  it('level mới bắt buộc có asset nguồn của quái (assets/source/mon/<id>)', () => {
    const lv = base();
    expect(run(lv, { assets: true })).toEqual([]);
    at(lv.camps!, 0).mon = 'mon_yeu_lang'; // dùng chung model sói, chưa có asset riêng
    expect(run(lv, { assets: true }).join('\n')).toMatch(/camp tn_a1 quái mon_yeu_lang chưa có asset nguồn/);
    expect(run(lv, { assets: true, props: [{ id: 'prop_khong_co', x: 450, z: 400, yaw: 0, s: 1 }] }).join('\n')).toMatch(
      /prop prop_khong_co chưa có asset nguồn/,
    );
  });
});

describe('checkLevel: độ phủ cụm (bản đồ mở rộng)', () => {
  it('bắt vùng săn có điểm quá xa mép cụm gần nhất', () => {
    const errs = run(base(), { coverage: true });
    expect(errs.some((e) => e.includes('độ phủ cụm'))).toBe(true);
  });
});
