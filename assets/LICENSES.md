# Giấy phép asset

## Icon UI M4-7

Sinh bởi công cụ tạo ảnh tích hợp Codex cho dự án Đạp Thiên Lộ. Không dùng tài sản hoặc khung icon của guizang. PNG gốc ở `<DTL_ASSET_SOURCE>/icons/<id>.png`; prompt tại `docs/prompts/codex.md` mục 9, chủ thể tại `tools/icons/subjects.json`. Atlas 128px/ô: `apps/client/public/assets/ui/icons.*.webp`. Manifest lưu SHA-256 và dung lượng từng PNG nguồn.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `skl_phi_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_phi_kiem.png` |
| `skl_kiem_khi_tram` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_kiem_khi_tram.png` |
| `skl_linh_khi_ho_the` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_linh_khi_ho_the.png` |
| `skl_thien_kiem_vu` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_thien_kiem_vu.png` |
| `skl_hoi_nguyen_thuat` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_hoi_nguyen_thuat.png` |
| `skl_loi_dinh_nhat_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/skl_loi_dinh_nhat_kiem.png` |
| `itm_linh_thao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_linh_thao.png` |
| `itm_huyet_linh_chi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyet_linh_chi.png` |
| `itm_nanh_soi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_nanh_soi.png` |
| `itm_yeu_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_yeu_dan.png` |
| `itm_thiet_tinh` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thiet_tinh.png` |
| `itm_han_giao_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_giao_dan.png` |
| `itm_kiem_phach` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_kiem_phach.png` |
| `itm_truc_co_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_truc_co_dan.png` |
| `itm_hoi_xuan_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_hoi_xuan_dan.png` |
| `itm_hoi_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_hoi_khi_dan.png` |
| `itm_tu_khi_dan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tu_khi_dan.png` |
| `itm_moc_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_moc_kiem.png` |
| `itm_thiet_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thiet_kiem.png` |
| `itm_thanh_phong_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_thanh_phong_kiem.png` |
| `itm_han_quang_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_quang_kiem.png` |
| `itm_tram_ta_kiem` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_tram_ta_kiem.png` |
| `itm_bo_y` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_bo_y.png` |
| `itm_dao_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_dao_bao.png` |
| `itm_linh_ti_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_linh_ti_bao.png` |
| `itm_huyen_van_bao` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyen_van_bao.png` |
| `itm_ngoc_boi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_ngoc_boi.png` |
| `itm_huyen_thiet_gioi` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_huyen_thiet_gioi.png` |
| `itm_han_giao_hoan` | Sinh bởi Codex cho dự án | dự án | 2026-11-15 | `icons/itm_han_giao_hoan.png` |


Mỗi asset đi vào game (mọi GLB trong `apps/client/public/assets/manifest.json`) phải có **đúng một dòng** trong bảng dưới. `pnpm assets:validate` báo lỗi nếu thiếu. Cột đầu ghi asset id trong dấu `` ` ``.

- **Nguồn**: Tripo (web app gói Max / API trả phí), Codex (ảnh concept), CC0 (ghi tên gói), tự sinh bằng script (ghi đường dẫn script).
- **Giấy phép**: mã SPDX nếu là giấy phép mở (`CC0-1.0`, `CC-BY-4.0`…); asset dự án tự làm hoặc sinh bằng dịch vụ trả phí ghi `dự án`.
- **Chi tiết**: task id Tripo, URL gói CC0, yêu cầu ghi công nếu có. Chi tiết đầy đủ nằm trong `assets/source/<loại>/<id>/meta.json`.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `arch_sect` | Tự sinh bằng script `tools/blender/build_sect.py` (Blender headless) | dự án | 2026-11-12 | Kiến trúc Lạc Kiếm Tông; không có texture, chỉ màu đỉnh |
| `prop_lo_dan` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `bf2c9afd-c009-472c-abb5-21b01acdc63d` |
| `prop_linh_thao` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `eec1fb46-1922-479c-95c4-939052c05a4b` |
| `prop_phi_kiem` | Tripo API (multiview→3D v3.1, chỉ lấy hình) + Codex (concept); màu tô bằng script `tools/blender/recolor_phi_kiem.py` | dự án | 2026-11-15 | task `70d2072c-c993-4c70-a8d2-82931408bcc1` |
| `mon_soi_xam` | Tripo web app (multiview H3.1 + auto rig quadruped) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_thiet_boi_tru` | Tripo web app (text-to-3D H3.1 + auto rig quadruped) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py` (đòn húc nanh) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_hoa_van_ho` | Tripo web app (text-to-3D H3.1 + auto rig quadruped, clip walk) + Codex (concept); 5 clip thủ tục `tools/blender/anim_quadruped.py`; dùng chung cho Kiếm Linh (đổi màu trong game) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `mon_thach_vien` | Tripo web app (text-to-3D H3.1 + auto rig biped, clip idle/run/slash/fall) + Codex (concept); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_kiem_tu_nam` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Thanh Phong"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_npc_chuong_mon` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Lạc Vân chân nhân"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_npc_duoc_su` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Tố Tâm"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `chr_npc_thiet_lao` | Tripo web app (text-to-3D H3.1 + auto rig Mixamo + preset animation) + Codex (concept "Thiết lão"); hit_light thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_huyet_lang_vuong` | Tripo web app (text-to-3D H3.1 + auto rig quadruped) + Codex (concept); 8 clip thủ tục `tools/blender/anim_quadruped.py` (gồm slam/sweep/stun) | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_kiem_khoi` | Tripo web app (text-to-3D H3.1 + auto rig biped + preset animation) + Codex (concept); hit_light/slam/sweep/stun thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |
| `boss_thu_mo_tuong` | Tripo web app (text-to-3D H3.1 + auto rig biped + preset animation) + Codex (concept); hit_light/slam/sweep/chant/stun thủ tục `tools/blender/anim_biped_extra.py` | dự án | 2026-11-15 | web app, không có task id; xem meta.json |

## Texture mặt đất (P2-A2)

Tám bộ texture PBR từ [Poly Haven](https://polyhaven.com/textures), giấy phép **CC0-1.0** (public domain, dùng thương mại được, không bắt buộc ghi nguồn; vẫn ghi để truy vết). Bản 1K gốc ở `../dtl-asset-source/texture/<id>/`, đóng gói bằng `pnpm assets:terrain` (`tools/asset-pipeline/src/terrain-textures.ts`) thành WebP 1024 trong `apps/client/public/terrain/`.

| Lớp | Poly Haven | Tác giả | Giấy phép |
| --- | --- | --- | --- |
| cỏ | [leafy_grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | CC0-1.0 |
| đất | [brown_mud_leaves_01](https://polyhaven.com/a/brown_mud_leaves_01) | Rob Tuytel | CC0-1.0 |
| nền rừng | [forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) | Rob Tuytel | CC0-1.0 |
| đá núi | [rocky_terrain_02](https://polyhaven.com/a/rocky_terrain_02) | Amal Kumar | CC0-1.0 |
| vách đá | [rock_face](https://polyhaven.com/a/rock_face) | Greg Zaal (chụp), Dario Barresi (xử lý) | CC0-1.0 |
| cát ven hồ | [coast_sand_rocks_02](https://polyhaven.com/a/coast_sand_rocks_02) | Rob Tuytel | CC0-1.0 |
| lát sân đá | [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | Rob Tuytel | CC0-1.0 |
| sỏi đường mòn | [gravelly_sand](https://polyhaven.com/a/gravelly_sand) | Dario Barresi | CC0-1.0 |

<!-- audio:begin (sinh bởi tools/audio/build.mjs, đừng sửa tay) -->

### Âm thanh (SFX, âm môi trường)

Tất cả nguồn là **CC0-1.0** (không bắt buộc ghi công; vẫn ghi để tra lại). File nguồn nằm ở `../dtl-asset-source/sfx/`, khai báo xử lý trong `tools/audio/sounds.json`. Bản build trong `apps/client/public/audio/`.

| Âm | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `sfx_sword` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.3.ogg, sword.4.ogg, sword.6.ogg |
| `sfx_slash` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.1.ogg, sword.5.ogg, sword.8.ogg; https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: knifeSlice.ogg, knifeSlice2.ogg |
| `sfx_rain` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.3.ogg, sword.7.ogg, sword.4.ogg, sword.6.ogg, sword.10.ogg |
| `sfx_hit` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck; OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_06.ogg, bfh1_hit_07.ogg, bfh1_hit_02.ogg; https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: knifeSlice.ogg, knifeSlice2.ogg, chop.ogg |
| `sfx_crit` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.4.ogg, sword_clash.6.ogg, sword_clash.8.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_06.ogg, bfh1_hit_02.ogg, bfh1_hit_07.ogg |
| `sfx_hurt` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_hit_02.ogg |
| `sfx_block` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_metal_hit_04.ogg, bfh1_metal_hit_05.ogg, bfh1_metal_hit_02.ogg |
| `sfx_death` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_falling_01.ogg, bfh1_falling_04.ogg, bfh1_falling_05.ogg |
| `sfx_impact` | OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck; OpenGameArt: 100 CC0 SFX #2 — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_rock_breaking_01.ogg, bfh1_rock_breaking_02.ogg, bfh1_rock_breaking_03.ogg, bfh1_hit_02.ogg; https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg |
| `sfx_thunder` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: Rain + Long Thunder — WuxiaScrub; OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_thunder_01.ogg; https://opengameart.org/content/rain-long-thunder — `oga/rain-long-thunder/`: rain-thunder.ogg; https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.1.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_rock_breaking_02.ogg |
| `sfx_trib` | OpenGameArt: Rain + Long Thunder — WuxiaScrub | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/rain-long-thunder — `oga/rain-long-thunder/`: rain-thunder.ogg |
| `sfx_shield` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_2.ogg, magical_5.ogg, magical_6_0.ogg |
| `sfx_heal` | OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure1.wav, Cure2.wav, Cure3.wav |
| `sfx_potion` | OpenGameArt: 50 RPG sound effects — Kenney; OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: metalLatch.ogg, metalClick.ogg; https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure4.wav, Cure5.wav |
| `sfx_cast` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_mcast` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_respawn` | OpenGameArt: Magic Spell SFX — JaggedStone | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_4.ogg |
| `sfx_portal` | OpenGameArt: Cure Magic — Someoneman; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure8.wav; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `sfx_ui_click` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: click_001.ogg, select_001.ogg |
| `sfx_ui_open` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: bookFlip2.ogg, bookFlip3.ogg |
| `sfx_ui_close` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: bookClose.ogg, bookPlace1.ogg |
| `sfx_ui_error` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: error_004.ogg |
| `sfx_ui_confirm` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: confirmation_001.ogg |
| `sfx_target` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: select_002.ogg |
| `sfx_loot` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: handleCoins.ogg, handleCoins2.ogg |
| `sfx_meditate` | OpenGameArt: Interface Sounds — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/interface-sounds — `oga/interface-sounds/kenney_interfaceSounds/Audio/`: bong_001.ogg |
| `sfx_levelup` | OpenGameArt: 85 Short music jingles — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA07.ogg |
| `sfx_quest` | OpenGameArt: 85 Short music jingles — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA03.ogg |
| `sfx_ascend` | OpenGameArt: 85 Short music jingles — Kenney; OpenGameArt: Magic Spell SFX — JaggedStone; OpenGameArt: Cure Magic — Someoneman | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/85-short-music-jingles — `oga/85-short-music-jingles/jingleSounds_Kenney/OGG/jingles_PIZZA/`: jingles_PIZZA12.ogg; https://opengameart.org/content/magic-spell-sfx — `oga/magic-spell-sfx/`: magical_4.ogg; https://opengameart.org/content/cure-magic — `oga/cure-magic/curemagic/`: Cure6.wav |
| `sfx_craft` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: metalPot1.ogg, metalPot2.ogg |
| `sfx_enhance` | OpenGameArt: 100 CC0 SFX #2 — rubberduck; OpenGameArt: 75 CC0 breaking / falling / hit sfx — rubberduck | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/100-cc0-sfx-2 — `oga/100-cc0-sfx-2/sfx_100_v2/`: sfx100v2_metal_hit_01.ogg; https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — `oga/75-cc0-breaking-falling-hit-sfx/sfx_breaking_and_falling/`: bfh1_metal_hit_06.ogg |
| `sfx_gather` | OpenGameArt: 50 RPG sound effects — Kenney | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/50-rpg-sound-effects — `oga/50-rpg-sound-effects/RPGsounds_Kenney/OGG/`: cloth1.ogg, cloth3.ogg |
| `sfx_fly` | OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_-_starninjas_1/sword - StarNinjas/`: sword.2.ogg; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_wind` | OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_forest` | OpenGameArt: AMB Morning Sounds (Perfect Loop) — Kresiek The Furry; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/amb-morning-sounds-perfect-loop — `oga/amb-morning-sounds-perfect-loop/`: amb_morning.wav; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_stream` | OpenGameArt: Sea and river wave sounds — RandomMind | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/sea-and-river-wave-sounds — `oga/sea-and-river-wave-sounds/`: VistulaShort_0.mp3 |
| `amb_night` | OpenGameArt: Crickets Ambient Noise - loopable — Wolfgang_; OpenGameArt: wind whoosh loop — SketchMan3 | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/crickets-ambient-noise-loopable — `oga/crickets-ambient-noise-loopable/`: crickets_1.mp3; https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg |
| `amb_cave` | OpenGameArt: wind whoosh loop — SketchMan3; OpenGameArt: 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas | CC0-1.0 | 2026-11-15 | https://opengameart.org/content/wind-whoosh-loop — `oga/wind-whoosh-loop/`: wind_20woosh_20loop.ogg; https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — `oga/20-sword-sound-effects-attacks-and-clashes/sword_clash_-_starninjas_0/`: sword_clash.9.ogg |

<!-- audio:end -->

## Font

Font web tự host trong `apps/client/public/fonts/`, subset bằng `tools/fonts/subset.py` (fonttools) từ kho [google/fonts](https://github.com/google/fonts) ghim commit `cc39c4c`. Văn bản giấy phép đầy đủ nằm cạnh file font (`OFL-*.txt`); bản quyền và giấy phép cũng giữ trong bảng `name` của từng woff2. Không font nào khai Reserved Font Name.

| File | Font gốc | Giấy phép | Ngày | Dùng cho |
| --- | --- | --- | --- | --- |
| `dtl-title.woff2` | Charm Bold, © 2018 The Charm Project Authors (Cadson Demak) | `OFL-1.1` | 2026-11-15 | Tiêu đề thư pháp trên khung hình đầu (chỉ glyph của `ui.title`), biến CSS `--font-title` |
| `dtl-display.woff2` | Alegreya SC Bold, © 2011 The Alegreya Project Authors (Huerta Tipográfica) | `OFL-1.1` | 2026-11-15 | Tên boss, biển hiệu, phụ đề màn tiêu đề (Latin + tiếng Việt), biến CSS `--font-display` |
