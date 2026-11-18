// Level thử nhỏ cho công cụ đa level (E1-G): địa hình phẳng 1 km, hai vùng cấp 16–24, camp + tinh anh + trận truyền tống.
// KHÔNG nằm trong `LEVELS` của game; công cụ (`map:report`, `minimap:build`, `shots`) và test gọi `ensureLevel('thu_nho')`
// để đăng ký địa hình + level trước khi đọc. Bản đồ thật do E2-A làm; fixture này chỉ để kiểm công cụ chạy đúng với level thứ hai.

import { registerTerrain, type HandProp, type LevelDef, type TelePad, type TerrainDef } from '@dtl/shared';
import { LEVELS } from './index';

export const FIXTURE_ID = 'thu_nho';

export const FIXTURE_TERRAIN: TerrainDef = {
  id: FIXTURE_ID,
  seed: 4242,
  size: 1024,
  margin: 8,
  // Nền phẳng 60 m (biên độ 0), không nước; chỉ có vách quanh vùng chơi.
  natural: { freq: 0.002, baseOct: 2, ridgeOct: 1, level: 60, baseAmp: 0, ridgeAmp: 0, maskFreq: 0.001, maskOct: 1, maskLo: 0, maskHi: 1 },
  features: [],
  play: { cx: 512, cz: 512, half: 400, wallH: 120 },
  colliders: [{ x: 380, z: 640, r: 6 }],
};

export const FIXTURE_LEVEL: LevelDef = {
  id: FIXTURE_ID,
  spawns: [
    { mon: 'elite_huyet_nha_lang', count: 1, x: 440, z: 330, radius: 10, levelMin: 16, levelMax: 20, respawn: 300 },
    { mon: 'elite_xich_dien_ho', count: 1, x: 300, z: 680, radius: 10, levelMin: 16, levelMax: 20, respawn: 300 },
    { mon: 'elite_cu_nham_vien', count: 1, x: 700, z: 330, radius: 10, levelMin: 20, levelMax: 24, respawn: 300 },
    { mon: 'elite_huyet_nha_lang', count: 1, x: 560, z: 690, radius: 10, levelMin: 20, levelMax: 24, respawn: 300 },
    { mon: 'boss_han_giao', count: 1, x: 640, z: 520, radius: 6, levelMin: 24, levelMax: 24, respawn: 1800 },
  ],
  nodes: [],
  zones: [
    {
      id: 'tn_a',
      lvMin: 16,
      lvMax: 20,
      color: '#6a8f4a',
      music: 'wild',
      poly: [
        [280, 300],
        [480, 300],
        [480, 700],
        [280, 700],
      ],
    },
    {
      id: 'tn_b',
      lvMin: 20,
      lvMax: 24,
      color: '#8f6a4a',
      music: 'wild',
      poly: [
        [540, 300],
        [740, 300],
        [740, 700],
        [540, 700],
      ],
    },
  ],
  camps: [
    { id: 'tn_a1', zone: 'tn_a', mon: 'mon_thach_vien', x: 340, z: 380, count: 4, radius: 20, levelMin: 16, levelMax: 18, respawn: 60 },
    { id: 'tn_a2', zone: 'tn_a', mon: 'mon_thach_vien', x: 430, z: 460, count: 4, radius: 20, levelMin: 17, levelMax: 19, respawn: 60 },
    { id: 'tn_a3', zone: 'tn_a', mon: 'mon_thach_vien', x: 340, z: 560, count: 3, radius: 20, levelMin: 18, levelMax: 20, respawn: 60 },
    { id: 'tn_b1', zone: 'tn_b', mon: 'mon_thach_vien', x: 600, z: 380, count: 4, radius: 20, levelMin: 20, levelMax: 22, respawn: 60 },
    { id: 'tn_b2', zone: 'tn_b', mon: 'mon_thach_vien', x: 690, z: 460, count: 3, radius: 20, levelMin: 21, levelMax: 23, respawn: 60 },
    { id: 'tn_b3', zone: 'tn_b', mon: 'mon_thach_vien', x: 600, z: 580, count: 3, radius: 20, levelMin: 22, levelMax: 24, respawn: 60 },
  ],
};

/** Truyền Tống Trận của fixture: mỗi vùng một trận, cộng một trận mở sẵn ở rìa. */
export const FIXTURE_PADS: TelePad[] = [
  { id: 'tn_tp_a', level: FIXTURE_ID, zone: 'tn_a', x: 300, z: 330 },
  { id: 'tn_tp_b', level: FIXTURE_ID, zone: 'tn_b', x: 560, z: 330 },
];
export const FIXTURE_FREE = ['tn_tp_a'];
/** Prop thử (đủ để test "camp không đè prop"). */
export const FIXTURE_PROPS: HandProp[] = [{ id: 'prop_bia_da', x: 500, z: 620, yaw: 0, s: 1, r: 1 }];

/** Đăng ký level thử (idempotent). Trả LevelDef; id khác thì trả level thật hoặc undefined. */
export function ensureLevel(id: string): LevelDef | undefined {
  if (id === FIXTURE_ID && !LEVELS[FIXTURE_ID]) {
    registerTerrain(FIXTURE_TERRAIN);
    LEVELS[FIXTURE_ID] = FIXTURE_LEVEL;
  }
  return LEVELS[id];
}
