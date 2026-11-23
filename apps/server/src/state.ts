import { MapSchema, Schema, type, view } from '@colyseus/schema';

// Trạng thái công khai được đồng bộ cho mọi client trong room.
// Chỉ chứa những gì người chơi khác được phép thấy.

export class PlayerS extends Schema {
  @view() @type('string') name = '';
  @view() @type('float32') x = 0;
  @view() @type('float32') y = 0;
  @view() @type('float32') z = 0;
  /** Hướng nhìn của nhân vật: atan2(dx, dz). */
  @view() @type('float32') yaw = 0;
  @view() @type('float32') vy = 0;
  /** Đang đứng trên mặt đất. */
  @view() @type('boolean') gr = true;
  /** Cờ PF_*. */
  @view() @type('uint16') fl = 0;
  @view() @type('uint8') lv = 1;
  @view() @type('int32') hp = 1;
  @view() @type('int32') mhp = 1;
  @view() @type('int32') mp = 0;
  @view() @type('int32') mmp = 0;
  /** Số thứ tự input cuối cùng server đã xử lý. */
  @view() @type('uint32') seq = 0;
  /** id vũ khí đang cầm (để hiển thị). */
  @view() @type('string') wp = '';
  /** Bậc phát sáng của vũ khí theo cường hóa: 0, 1 (+7), 2 (+10). Chỉ để hiển thị. */
  @view() @type('uint8') wg = 0;
  /** Ngoại hình (để hiển thị): giới tính 'm' | 'f' và id màu áo trong appearance.json. */
  @view() @type('string') g = 'm';
  @view() @type('string') dye = '';
  /** Nhuộm 3 kênh của tủ ngoại trang (`encodeDye3`: "a,b,c"), '' = không. Chỉ để hiển thị. */
  @view() @type('string') dye3 = '';
  /** Kiểu tóc nhân vật nền v2 ('a' | 'b'), '' = mặc định. Chỉ để hiển thị. */
  @view() @type('string') hr = '';
  /** Bộ trang bị quyết định màu áo/ánh kiếm (từ 2 món): id bộ trong sets.json, '' = không. Chỉ để hiển thị. */
  @view() @type('string') sk = '';
  /** Mã phụ kiện hình dáng của đồ bộ (mỗi ô một ký tự, xem `accessoryCode`), '' = không. Chỉ để hiển thị. */
  @view() @type('string') sa = '';
  /** id vật phẩm skin đang mặc ở ô ngoại hình (ô thứ 10), '' = không. Chỉ để hiển thị: skin không có chỉ số. */
  @view() @type('string') sn = '';
  /** id pháp bảo phụ đang đeo (P3-8), '' = không. Chỉ để hiển thị. */
  @view() @type('string') art = '';
  /** id công pháp đang tu (chọn giọng động tác của chiêu, K-5), '' = chưa chọn. Chỉ để hiển thị. */
  @view() @type('string') mt = '';
  /** Ấn đang mang (VS-2c, Mộc ấn...): gói bit `packMarks`. Chỉ để hiển thị. */
  @view() @type('uint32') mk = 0;
  /** Đang hóa hình Cổ Thần (TN-5): 1 = thân to lớn tạm thời. Chỉ để hiển thị. */
  @view() @type('uint8') hh = 0;
}

export class MonS extends Schema {
  /** id định nghĩa quái. */
  @view() @type('string') t = '';
  @view() @type('float32') x = 0;
  @view() @type('float32') y = 0;
  @view() @type('float32') z = 0;
  @view() @type('float32') yaw = 0;
  @view() @type('int32') hp = 1;
  @view() @type('int32') mhp = 1;
  @view() @type('uint8') lv = 1;
  /** Trạng thái MS_*. */
  @view() @type('uint8') st = 0;
  /** Cờ MF_* (niệm chú, choáng). */
  @view() @type('uint16') mf = 0;
  /** Thời điểm server (ms) kết thúc trạng thái trong `mf`; 0 khi không có. */
  @view() @type('float64') ce = 0;
  /** Pha boss (0 = pha đầu). */
  @view() @type('uint8') ph = 0;
  /** Thanh phá thế của boss, 0–100 (làm tròn xuống). */
  @view() @type('uint8') pz = 0;
  /** Ấn đang mang (VS-2c): gói bit `packMarks`, mỗi loại lấy số tầng cao nhất. Không lộ ai là người đặt. */
  @view() @type('uint32') mk = 0;
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
  /**
   * AOI (M-2, apps/server/src/aoi.ts): mọi trường của `PlayerS` và `MonS` có `@view()`, nên client chỉ nhận giá trị (vị trí, máu...)
   * của thực thể trong `StateView` của mình. Cả hai collection vẫn hiển thị với mọi client (bản ghi rỗng cho thực thể ngoài tầm:
   * `MonS.t` / `PlayerS.name` là rỗng hoặc undefined), vì StateView ở mức collection giải mã lỗi khi thực thể vào/ra tầm liên tục.
   * Client coi bản ghi rỗng là "ngoài tầm" (xem `visibleMon`, `visiblePlayer` ở packages/shared).
   */
  @type({ map: PlayerS }) players = new MapSchema<PlayerS>();
  @type({ map: MonS }) monsters = new MapSchema<MonS>();
  @type({ map: NodeS }) nodes = new MapSchema<NodeS>();
}
