// Đích sự kiện nhiệm vụ `dungeon` theo level phó bản (khớp `target` của mục tiêu `dungeon` trong quests.json). Tách riêng để test import được.
export const DUNGEON_QUEST_TARGET: Readonly<Record<string, string>> = { phuc_mach: 'phuc_mach_quat', kinh_nguyet: 'kinh_nguyet_cung', than_tang: 'than_tang_dien' };
