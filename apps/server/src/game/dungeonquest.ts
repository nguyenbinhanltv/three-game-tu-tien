// Đích sự kiện nhiệm vụ `dungeon` theo level phó bản (khớp `target` của mục tiêu `dungeon` trong quests.json). Tách riêng để test import được.
export const DUNGEON_QUEST_TARGET: Readonly<Record<string, string>> = { phuc_mach: 'phuc_mach_quat', kinh_nguyet: 'kinh_nguyet_cung', than_tang: 'than_tang_dien', xich_tan_khich: 'xich_tan_khich' };

/** Đích phó bản chương 5 đã khai trong nhiệm vụ (DV3-H) nhưng level phó bản chưa vào (DV3-E). Khi level có thật thì chuyển sang bảng trên. */
export const PENDING_DUNGEON_TARGET: Readonly<Record<string, string>> = { kim_da_cung: 'kim_da_cung' };
