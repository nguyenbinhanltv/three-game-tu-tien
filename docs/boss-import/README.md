# Nhập 7 boss mở rộng (E-2 / E-3 / E-4)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/boss-import/<file>`.

Nguồn: `D:/METAGRIT/dtl-asset-source/boss/<id>/tripo/{raw_v01,rig_v01}.glb` (người dùng dựng trên Tripo web, không tốn credit).
Boss cũ (Hàn Giao, Kiếm Khôi, Huyết Lang Vương, Thủ Mộ Tướng) giữ nguyên, GLB và manifest của chúng không đổi.

Ảnh GPU thật (Chrome WebGPU, tắt tiếng): `docs/boss-import/<id>_turntable.jpg` (trước, bên, sau, chéo) và `<id>_clips.jpg`
(idle, run, attack, slam, sweep, chant, stun, hit_light, death × 5 khung). Chụp lại: `pnpm shots:boss --out <thư mục> [--only id,id]`.
Xem trực tiếp trong game client: `?mute=1&show=boss[&id=<id>]` (chọn boss, chọn clip, khung xương, lưới dây).

| Boss | Cách làm xương | Cỡ trong game | Tam giác LOD0/1/2 | Xương | GLB |
| --- | --- | --- | --- | --- | --- |
| `boss_dia_mach_long` | rig quadruped Tripo 33 xương, bảng `quadruped.layout` tường minh (chân sau treo ở xương trung gian nên dò tự động không ra), `anim_quadruped.py` | dài 9 m, cao 4,6 m | 19966 / 6987 / 2395 | 33 | 2,9 MB |
| `boss_thon_mach_ngo_cong_vuong` | bỏ rig Tripo (`serpent.dropRig`), xương chuỗi 17 đốt, đường tâm tự đo (`serpent.spine: auto`), `anim_serpent.py` | dài 14 m, cổ nâng cao 8,1 m | 19303 / 6755 / 2310 | 17 | 2,8 MB |
| `boss_thach_tam_khoi_vuong` | Tripo không rig được (rig = raw): dựng xương người + trọng số theo khoảng cách (`autoRig`, `biped_autorig.py`), cuốc đá gắn cứng vào tay phải, clip thủ tục `anim_biped_extra.py` | cao 5 m (cuốc rộng 5,7 m) | 19039 / 6664 / 2284 | 22 | 2,6 MB |
| `boss_van_hai_kinh_vuong` | như Ngô Công, kiểu `swim` (sóng dọc nhấp nhô), `amp` 0,45 để lưới dẹt vây rộng không gập | dài 18 m | 19058 / 6670 / 2286 | 17 | 2,3 MB |
| `boss_kinh_nguyet_chan_quan` | rig Tripo 35 xương (thiếu cổ và bàn chân): `rigFix` thêm bàn chân, cổ lùi về `Spine02`; clip thủ tục | cao 3,6 m | 19143 / 6691 / 2287 | 42 | 2,6 MB |
| `boss_thien_khuyet_thu_linh` | rig Mixamo Tripo 29 xương (thiếu bàn chân trái): `rigFix`; clip thủ tục | cao 8 m | 18906 / 6611 / 2267 | 38 | 2,9 MB |
| `boss_vo_dien_than_quan` | rig Mixamo Tripo 48 xương; clip thủ tục; sáu tay phụ liền lưới nên nhún theo thân | cao 4,6 m | 18928 / 6620 / 2270 | 49 | 2,7 MB |

Mọi boss: texture màu 1536 (trần mới của lớp boss sau S2-B), normal/ORM 1024, 3 mức LOD (cùng file), ≤ 80 xương, lớp ngân sách `boss`. `pnpm assets:validate` đạt cho cả 7.

## Clip (30 khung/giây, đều có trong GLB)

Chung: `idle, run, attack, hit_light, death, slam, sweep, stun`; boss có `chant` (niệm chú): Ngô Công, Kình Vương, Thạch Tâm, Kính Nguyệt, Thiên Khuyết, Vô Diện (Địa Mạch Long là thú bốn chân nên không có).
Thời điểm chạm khớp `BOSS_MOVES` hiện có (slam 1,0 s, sweep 0,9 s thú/giao và 0,85 s người) nên vạch báo của server dùng được ngay.

- **Thú bốn chân** (`anim_quadruped.py`, clip sẵn của Huyết Lang Vương): chạy phi, đớp, nện hai chân trước, quét đuôi/đầu, ngã nghiêng.
- **Rắn/ngô công/kình ngư** (`anim_serpent.py`, tổng quát hóa từ Hàn Giao): khối `import.serpent` (`spine`, `dropRig`, `bones`, `headFrom`, `rootAt`, `amp`, `style`). Ngô Công nâng ba đốt đầu rồi lao đớp/nện; Kình Vương `swim`: sóng dọc từ thân ra đuôi, nghiêng đầu khi đánh.
- **Người/khôi** (`anim_biped_extra.py`, khối `import.proc`): idle, run, attack, hit_light, death sinh bằng bộ đặt dáng IK có sẵn (hướng tay theo vector thế giới, IK chân giữ bàn chân không trượt); death quỵ gối rồi ngã úp, hông tự hạ cho xác chạm đất. Giữ tư thế tay nghỉ của model (cuốc, trượng, kích cầm trên tay) nên vũ khí đi theo bàn tay; không retarget thư viện người (rig nghỉ không phải chữ T).

## Dùng trong game (E-2 / E-3 / E-4)

1. Thêm quái cùng id vào `monsters.json` (`scale` ≈ 1: model đã có kích thước thật).
2. Skin có sẵn ở `MONSTER_SKINS` (`apps/client/src/game/character/monsterSkins.ts`): nạp lười (`lazy`), `preloadLazy(levelId)` chỉ nạp đúng màn. **id màn là dự kiến**: `doan_mach` (Địa Mạch Long), `phuc_mach` (Ngô Công, Thạch Tâm), `van_hai` (Kình Vương), `kinh_nguyet_cung`, `thien_khuyet`, `than_tang`. Đổi `level` cho khớp `LevelDef` khi có.
3. `refSpeed` tính từ sải chân clip run ở scale 1; đổi nếu tốc độ boss khác (playback tự co).
4. Điểm yếu, tinh thạch, halo, đĩa gương: dựng bằng shader/emissive theo pha ở phía client như Kiếm Khôi (`coreGlow`, `rim`); Kính Nguyệt/Thiên Khuyết chưa tách mesh rời.

## Giới hạn đã biết

- Áo choàng Kính Nguyệt và tượng Thiên Khuyết là lưới liền skin vào xương đùi: khi chạy/ngã vải bị kéo thành mảng gập; chấp nhận cho bản đầu, sẽ gọn hơn nếu tách vạt áo thành xương lò xo (`import.spring`).
- Cuốc của Thạch Tâm: phần chóp thấp có vài đỉnh còn theo chân (vệt nhỏ khi vung); nới vùng `hold` làm kéo cả chân phải.
- Ngô Công cao 8,1 m vì dựng thế ngóc đầu (spec ghi đầu cao 3 m): chỉnh bằng `size.depth` trong meta nếu muốn nhỏ hơn.
- Máy này không có `toktx`, texture chưa nén KTX2 (giống các boss cũ); build ở máy có KTX-Software sẽ nhỏ hơn.
- `pnpm assets:build` ở máy này dựng lại `boss_kiem_khoi` và `boss_thu_mo_tuong` lệch vài KB so với bản đã commit (khác phiên bản Blender), và `assets:validate` báo lỗi `boss_thu_mo_tuong` `stun@start` lệch 1,9% giữa raw dựng lại và build commit. Đã kiểm với script gốc: lỗi có sẵn, không do thay đổi này; bản commit của hai boss đó giữ nguyên.
