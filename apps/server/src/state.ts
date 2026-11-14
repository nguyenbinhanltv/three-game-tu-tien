import { MapSchema, Schema, type } from '@colyseus/schema';

// Trạng thái công khai được đồng bộ cho mọi client trong room.
// Chỉ chứa những gì người chơi khác được phép thấy.

export class PlayerS extends Schema {
  @type('string') name = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  /** Hướng nhìn của nhân vật: atan2(dx, dz). */
  @type('float32') yaw = 0;
  @type('float32') vy = 0;
  /** Đang đứng trên mặt đất. */
  @type('boolean') gr = true;
  /** Cờ PF_*. */
  @type('uint8') fl = 0;
  @type('uint8') lv = 1;
  @type('int32') hp = 1;
  @type('int32') mhp = 1;
  @type('int32') mp = 0;
  @type('int32') mmp = 0;
  /** Số thứ tự input cuối cùng server đã xử lý. */
  @type('uint32') seq = 0;
  /** id vũ khí đang cầm (để hiển thị). */
  @type('string') wp = '';
}

export class MonS extends Schema {
  /** id định nghĩa quái. */
  @type('string') t = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') yaw = 0;
  @type('int32') hp = 1;
  @type('int32') mhp = 1;
  @type('uint8') lv = 1;
  /** Trạng thái MS_*. */
  @type('uint8') st = 0;
  /** Cờ MF_* (niệm chú, choáng). */
  @type('uint8') mf = 0;
  /** Thời điểm server (ms) kết thúc trạng thái trong `mf`; 0 khi không có. */
  @type('float64') ce = 0;
}

export class NodeS extends Schema {
  /** id vật phẩm hái được. */
  @type('string') t = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('boolean') on = true;
}

export class WorldState extends Schema {
  @type('string') level = '';
  @type({ map: PlayerS }) players = new MapSchema<PlayerS>();
  @type({ map: MonS }) monsters = new MapSchema<MonS>();
  @type({ map: NodeS }) nodes = new MapSchema<NodeS>();
}
