import { type LevelAssets, registerTerrain, SECT, type TerrainDef } from '@dtl/shared';

/**
 * Level thử `thu_nghiem` (E1-D): vài đảo nổi giữa biển mây, chỉ có ở client để chứng minh `Game.enterLevel` đổi level hai chiều
 * và giải phóng đủ khi rời. Đảo chính trùng chỗ tông môn (cùng độ cao) nên người chơi đứng yên khớp địa hình Vân Lam của server.
 * Vào bằng `__game.enterLevel('thu_nghiem')` (nút trong bảng F3). Server chưa biết level này: đừng chơi lâu ở đây.
 */
export const TEST_LEVEL = 'thu_nghiem';

const TEST_TERRAIN: TerrainDef = {
  id: TEST_LEVEL,
  seed: 20261116,
  size: 4096,
  margin: 24,
  natural: { freq: 0.001, baseOct: 3, ridgeOct: 2, level: 60, baseAmp: 10, ridgeAmp: 0, maskFreq: 0.0005, maskOct: 1, maskLo: 0, maskHi: 1 },
  features: [],
  islands: [
    { x: SECT.x, z: SECT.z, r: 150, edge: 70, y: SECT.y },
    { x: SECT.x + 260, z: SECT.z - 120, r: 55, edge: 40, y: SECT.y + 25 },
    { x: SECT.x - 240, z: SECT.z + 160, r: 70, edge: 45, y: SECT.y - 18 },
    { x: SECT.x + 80, z: SECT.z + 330, r: 45, edge: 35, y: SECT.y + 8 },
  ],
  voidFloor: -40,
  colliders: [],
};

export const TEST_ASSETS: LevelAssets = {
  mood: 'night',
  glb: [],
  ground: { set: 'terrain', mask: 'neutral' },
  music: ['wild'],
  features: { sect: false, portals: false, lanterns: false, lake: false, clouds: true, grass: false, trees: 'none', beacons: false, vegetation: false },
  minimap: '',
};

let registered = false;
export function ensureTestLevel(): void {
  if (registered) return;
  registered = true;
  registerTerrain(TEST_TERRAIN);
}
