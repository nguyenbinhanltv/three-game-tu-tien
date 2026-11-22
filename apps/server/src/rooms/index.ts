// Rooms của server (R-7): tách từ rooms.ts. Nơi khác (index.ts, test) vẫn import từ './rooms'.
export { activeRooms, GameRoom, onlineCount, roomNameOf } from './base';
export { defineWorld, WorldRoom } from './world';
import { kieuOfLevel } from '@dtl/shared';
import { defineDungeon as defineDungeonBase, DungeonRoom } from './dungeon';
import { defineKieu, KieuRoom } from './kieu';
export { DungeonRoom, KieuRoom };

/** Lớp room cho một bí cảnh: phòng cầu Cửu Kiều (`kieu_<n>`) có luật riêng, còn lại là bí cảnh thường. */
export function defineDungeon(levelId: string): typeof DungeonRoom {
  return kieuOfLevel(levelId) !== null ? defineKieu(levelId) : defineDungeonBase(levelId);
}
export { TribulationRoom, defineTribulation } from './tribulation';
export { ROOM_DUNGEON, ROOM_TRIBULATION, ROOM_WORLD } from '@dtl/shared';
