// Rooms của server (R-7): tách từ rooms.ts. Nơi khác (index.ts, test) vẫn import từ './rooms'.
export { activeRooms, GameRoom, onlineCount, roomNameOf } from './base';
export { defineWorld, WorldRoom } from './world';
export { defineDungeon, DungeonRoom } from './dungeon';
export { TribulationRoom, defineTribulation } from './tribulation';
export { ROOM_DUNGEON, ROOM_TRIBULATION, ROOM_WORLD } from '@dtl/shared';
