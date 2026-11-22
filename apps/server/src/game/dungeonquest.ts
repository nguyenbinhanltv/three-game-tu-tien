// Đích sự kiện nhiệm vụ `dungeon` theo level phó bản (khớp `target` của mục tiêu `dungeon` trong quests.json). Tách riêng để test import được.
export const DUNGEON_QUEST_TARGET: Readonly<Record<string, string>> = {
  phuc_mach: 'phuc_mach_quat',
  kinh_nguyet: 'kinh_nguyet_cung',
  than_tang: 'than_tang_dien',
  xich_tan_khich: 'xich_tan_khich',
  kim_da_cung: 'kim_da_cung',
  gioi_tri: 'gioi_tri',
  // Phòng cầu Cửu Kiều (TN-7): `KieuRoom` kế thừa `DungeonRoom.afterJoin` nên phát sự kiện `dungeon` kèm đích này.
  kieu_1: 'kieu_1',
  kieu_2: 'kieu_2',
  kieu_3: 'kieu_3',
  kieu_4: 'kieu_4',
  kieu_5: 'kieu_5',
  kieu_6: 'kieu_6',
  kieu_7: 'kieu_7',
  kieu_8: 'kieu_8',
  kieu_9: 'kieu_9',
};

/** Đích phó bản chương 5 đã khai trong nhiệm vụ (DV3-H) nhưng level phó bản chưa vào. Khi level có thật thì chuyển sang bảng trên (Kim Dạ Cung đã chuyển ở DV-3E). */
export const PENDING_DUNGEON_TARGET: Readonly<Record<string, string>> = {};
