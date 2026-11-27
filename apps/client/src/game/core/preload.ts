import { APPEARANCE, SWORD_MODEL_DEFAULT } from '@dtl/content';
import { genderEnabled, SECT, SPAWN_POINT } from '@dtl/shared';
import { type AssetCache, assets } from './assets';
import { HUMAN_ANIM_LIB } from '../character/animLib';
import { MONSTER_SKINS } from '../character/monsterSkins';
import { playerPrefetchIds } from '../character/playerSkins';
import { legacyModelsRequested } from '../character/view';

/**
 * Thứ tự tải "khung hình đầu trước" (M6-1):
 *   1. HTML: tiêu đề + nền sương (index.html), hiện trước khi JS chạy.
 *   2. JS → thế giới dựng bằng code (trời, địa hình, kiến trúc thủ tục), không chờ file nào.
 *   3. GLB tải song song với bước 2 theo ưu tiên gần người chơi trước (hàm dưới đây); về tới đâu
 *      thay model khối/kiến trúc thủ tục tới đó, không chặn vào game.
 *   4. Nhạc/âm môi trường chỉ tải sau thao tác đầu tiên (AudioContext mở khóa, xem audio.ts).
 *
 * Ưu tiên tính như khoảng cách (mét) tới người chơi: nhân vật mình 0; kiến trúc tông môn theo vị trí
 * thật (sân hồi sinh nằm trong sơn môn); quái ở bãi săn quanh đó; phi kiếm chỉ dùng cho chiêu mưa kiếm.
 */
export const PREFETCH_PRIORITY = { player: 0, monster: 120, vfx: 400 } as const;

/**
 * Hỏi manifest ngay khi trang chạy (1 KB): lúc bắt đầu kết nối thì đã biết tên file GLB, khỏi đợi một
 * vòng mạng trong lúc luồng chính bận dựng thế giới.
 */
export function prefetchManifest(cache: AssetCache = assets): void {
  cache.getManifest().catch(() => undefined);
}

/**
 * Bắt đầu tải byte các GLB cần sớm, gọi ngay khi bắt đầu kết nối: mạng chạy trong lúc chờ server và
 * lúc CPU dựng thế giới thủ tục. Các nơi dùng (`PlayerSkins`, `MonsterSkins`, `Game.loadSectModel`,
 * `Vfx`) vẫn `acquire` như cũ và nhận bản đã tải. Gọi nhiều lần không sao.
 */
export function prefetchWorldAssets(cache: AssetCache = assets, legacy = legacyModelsRequested(), gender?: string): string[] {
  const ids: [string, { pos?: { x: number; z: number }; priority?: number }][] = [];
  if (!legacy) {
    // Chỉ model của giới tính đang chọn (gợi ý từ màn đăng nhập); giới tính kia nạp khi có người chơi đó xuất hiện (PlayerSkins.create).
    const g =
      APPEARANCE.genders.find((x) => x.id === gender && genderEnabled(APPEARANCE, x.id)) ??
      APPEARANCE.genders.find((x) => x.id === APPEARANCE.defaultGender);
    // Mặc định: model v3 khởi đầu của giới tính + thư viện clip UAL (N-7).
    for (const id of g ? playerPrefetchIds(g.id) : []) ids.push([id, { priority: PREFETCH_PRIORITY.player }]);
  }
  // Thư viện clip Tripo (`anim_human_base`): người chơi v3 không dùng, chỉ còn NPC ở sân tông môn cần (xếp sau nhân vật mình).
  if (!legacy) ids.push([HUMAN_ANIM_LIB, { priority: PREFETCH_PRIORITY.monster }]);
  // Kiếm mặc định (~370 KB): mẫu nhân vật chờ nó mới cắt kiếm cũ khỏi lưới, nên tải cùng nhân vật thay vì nối tiếp sau.
  if (!legacy) ids.push([SWORD_MODEL_DEFAULT, { priority: PREFETCH_PRIORITY.player }]);
  ids.push(['arch_sect', { pos: { x: SECT.x, z: SECT.z } }]);
  if (!legacy) {
    // Boss (skin `lazy`) chỉ có trong bí cảnh: nạp khi gặp, không tải trước ở thế giới mở.
    const eager = Object.values(MONSTER_SKINS).filter((s) => !s.lazy);
    for (const asset of new Set(eager.map((s) => s.asset))) ids.push([asset, { priority: PREFETCH_PRIORITY.monster }]);
  }
  ids.push(['prop_phi_kiem', { priority: PREFETCH_PRIORITY.vfx }]);
  cache.setViewer(SPAWN_POINT.x, SPAWN_POINT.z);
  for (const [id, o] of ids) cache.prefetch(id, o);
  return ids.map(([id]) => id);
}
