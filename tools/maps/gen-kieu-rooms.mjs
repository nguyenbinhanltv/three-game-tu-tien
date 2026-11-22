// Sinh level phòng cầu Cửu Kiều (TN-7): packages/content/data/levels/kieu_<n>.json + kieu_<n>.assets.json, tất định.
//   node tools/maps/gen-kieu-rooms.mjs   (rồi pnpm content:check)
// Mỗi cầu là một level phó bản riêng (room `dungeon-kieu_<n>`, vé một lần do Dẫn Kiều Nhân cấp, KHÔNG có cổng trong bản đồ thế giới).
// Mặt đất mượn địa hình `cuu_kieu` ở một bãi phẳng trong vùng chơi (không level nào khác vào đó: mỗi cầu là room riêng, không quái thế giới).
// Va chạm của cuu_kieu bị bỏ (OWN_COLLIDERS ở packages/shared/src/terrain.ts), bán kính `bound` giữ người chơi trong sàn cầu.
// Thêm cầu mới = thêm một mục vào BRIDGES (cầu 3–9 ở các PR sau).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Bãi phẳng (độ cao 70–74 m trong bán kính 75 m) ở đông bản đồ Thiên Lộ Giới; sàn cầu hình tròn quanh tâm.
const CENTER = { x: 1300, z: 985 };
const SPAWN = { x: 1300, z: 1040 };
const EXIT = { x: 1300, z: 1048 };
// Về Kiều Đầu, đứng cạnh Dẫn Kiều Nhân (1024, 1488).
const RETURN = { x: 1024, z: 1500 };

const common = {
  terrain: 'cuu_kieu',
  spawns: [],
  nodes: [],
};

// Ba cột công tắc của cầu 4 (tam giác quanh tâm sàn, bán kính ~22 m).
const SWITCHES = [
  { x: CENTER.x, z: CENTER.z - 22 },
  { x: CENTER.x + 19, z: CENTER.z + 11 },
  { x: CENTER.x - 19, z: CENTER.z + 11 },
];

const dungeon = (o) => ({
  spawn: SPAWN,
  exit: EXIT,
  center: CENTER,
  minLevel: o.minLevel,
  returnLevel: 'cuu_kieu',
  returnSpawn: RETURN,
  bound: 70,
  private: true,
  ...(o.waves.length ? { lockAt: 1 } : {}),
  maxRevives: 2,
  ...(o.timeLimit ? { timeLimit: o.timeLimit } : {}),
  waves: o.waves,
});

const BRIDGES = [
  {
    n: 1,
    minLevel: 44,
    mood: 'ck_day',
    waves: [
      {
        delay: 8,
        title: true,
        mons: [
          { id: 'mon_lo_thach_ve', level: 44, n: 6 },
          { id: 'mon_may_lang', level: 44, n: 2 },
        ],
      },
      {
        title: true,
        mons: [
          { id: 'mon_bia_linh', level: 44, n: 4 },
          { id: 'mon_lo_xa', level: 44, n: 4 },
          { id: 'mon_may_ho', level: 44, n: 2 },
        ],
      },
      { title: true, delay: 8, mons: [{ id: 'boss_kieu_thu', level: 45, n: 1 }] },
    ],
  },
  {
    n: 2,
    minLevel: 44,
    mood: 'ck_dusk',
    waves: [
      // Một đợt duy nhất: mỗi người một Kiếm Ảnh (bóng của chính mình). Mọi thứ do server dựng theo chỉ số người chơi.
      // hpMul 2,5 (thiết kế gốc 1,0): `sim:progress` cho thấy bóng 1,0× chỉ ~8 s, dưới `KIEU_MIN_CLEAR_SEC` (20 s) nên người giỏi bị coi là bất thường.
      { delay: 6, title: true, mons: [], shadow: { hpMul: 2.5, atkMul: 1.5, strikeEvery: 6, r: 4.5, mul: 1.6 } },
    ],
  },
  {
    // Cầu 3 Suy: Thiên Nhân Ngũ Suy chạy trong room kiếp (level kiếp, `tribulations.json` ngu_suy.level = kieu_3), không có đợt quái.
    n: 3,
    trib: true,
    minLevel: 44,
    mood: 'ck_dusk',
    waves: [],
  },
  {
    // Cầu 4 Giới: ba cột công tắc (đố gương: chạm đúng thứ tự, sai thì quái phạt, đúng thì boss yếu đi) rồi ba Vệ Kiều lật mặt Âm/Dương.
    n: 4,
    minLevel: 45,
    mood: 'ck_dawn',
    waves: [
      {
        delay: 6,
        title: true,
        mons: [],
        puzzle: { points: SWITCHES, secs: 40, wrong: { mon: 'mon_lo_thach_ve', level: 45, n: 3 }, bossCut: 0.1 },
      },
      { title: true, delay: 6, mons: [{ id: 'boss_ve_kieu', level: 46, n: 3 }] },
    ],
  },
  {
    // Cầu 5 Thân: boss giáp phá theo chu kỳ (30 s, cửa sổ 8 s), giới hạn 240 s.
    n: 5,
    minLevel: 45,
    mood: 'ck_day',
    timeLimit: 240,
    waves: [{ title: true, delay: 8, mons: [{ id: 'boss_thach_tuong', level: 46, n: 1 }] }],
  },
  {
    // Cầu 6 Đạo: boss kháng theo Bản Nguyên của người đánh, ba hình thái.
    n: 6,
    minLevel: 45,
    mood: 'ck_night',
    waves: [{ title: true, delay: 8, mons: [{ id: 'boss_dao_linh', level: 47, n: 1 }] }],
  },
];

const assets = (b) => ({
  mood: b.mood,
  glb: [],
  ground: { set: 'terrain-ck', mask: 'neutral' },
  music: ['dungeon', 'dungeon_boss'],
  // Nền minimap: bản đồ Thiên Lộ Giới (phòng cầu nằm trong khung của nó).
  minimap: 'cuu_kieu',
  features: {
    sect: false,
    portals: false,
    lanterns: true,
    lake: false,
    clouds: true,
    grass: false,
    trees: 'none',
    beacons: false,
    vegetation: false,
  },
});

for (const b of BRIDGES) {
  const level = { id: `kieu_${b.n}`, ...common, ...(b.trib ? { tribulation: true } : {}), dungeon: dungeon(b) };
  fs.writeFileSync(path.join(ROOT, `packages/content/data/levels/kieu_${b.n}.json`), JSON.stringify(level, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, `packages/content/data/levels/kieu_${b.n}.assets.json`), JSON.stringify(assets(b), null, 2) + '\n');
}
console.log(`kieu rooms: ${BRIDGES.length} cầu`);
