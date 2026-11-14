# Giấy phép asset

Mỗi asset đi vào game (mọi GLB trong `apps/client/public/assets/manifest.json`) phải có **đúng một dòng** trong bảng dưới. `pnpm assets:validate` báo lỗi nếu thiếu. Cột đầu ghi asset id trong dấu `` ` ``.

- **Nguồn**: Tripo (web app gói Max / API trả phí), Codex (ảnh concept), CC0 (ghi tên gói), tự sinh bằng script (ghi đường dẫn script).
- **Giấy phép**: mã SPDX nếu là giấy phép mở (`CC0-1.0`, `CC-BY-4.0`…); asset dự án tự làm hoặc sinh bằng dịch vụ trả phí ghi `dự án`.
- **Chi tiết**: task id Tripo, URL gói CC0, yêu cầu ghi công nếu có. Chi tiết đầy đủ nằm trong `assets/source/<loại>/<id>/meta.json`.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `arch_sect` | Tự sinh bằng script `tools/blender/build_sect.py` (Blender headless) | dự án | 2026-11-12 | Kiến trúc Lạc Kiếm Tông; không có texture, chỉ màu đỉnh |

<!-- audio:begin (sinh bởi tools/audio/build.mjs, đừng sửa tay) -->

### Âm thanh (SFX, âm môi trường)

Tất cả nguồn là **CC0-1.0** (không bắt buộc ghi công; vẫn ghi để tra lại). File nguồn nằm ở `../dtl-asset-source/sfx/`, khai báo xử lý trong `tools/audio/sounds.json`. Bản build trong `apps/client/public/audio/`.

| Âm | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `sfx_sword` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword.3.ogg, sword.4.ogg, sword.6.ogg |
| `sfx_slash` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword.1.ogg, sword.5.ogg, sword.8.ogg; 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: knifeSlice.ogg, knifeSlice2.ogg |
| `sfx_rain` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword.3.ogg, sword.7.ogg, sword.4.ogg, sword.6.ogg, sword.10.ogg |
| `sfx_hit` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_hit_06.ogg, bfh1_hit_07.ogg, bfh1_hit_02.ogg; 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: knifeSlice.ogg, knifeSlice2.ogg, chop.ogg |
| `sfx_crit` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword_clash.4.ogg, sword_clash.6.ogg, sword_clash.8.ogg; 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_hit_06.ogg, bfh1_hit_02.ogg, bfh1_hit_07.ogg |
| `sfx_hurt` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 100 CC0 SFX #2 — rubberduck — https://opengameart.org/content/100-cc0-sfx-2 — file: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg; 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_hit_02.ogg |
| `sfx_block` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_metal_hit_04.ogg, bfh1_metal_hit_05.ogg, bfh1_metal_hit_02.ogg |
| `sfx_death` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_falling_01.ogg, bfh1_falling_04.ogg, bfh1_falling_05.ogg |
| `sfx_impact` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_rock_breaking_01.ogg, bfh1_rock_breaking_02.ogg, bfh1_rock_breaking_03.ogg, bfh1_hit_02.ogg; 100 CC0 SFX #2 — rubberduck — https://opengameart.org/content/100-cc0-sfx-2 — file: sfx100v2_hit_01.ogg, sfx100v2_hit_02.ogg |
| `sfx_thunder` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 100 CC0 SFX #2 — rubberduck — https://opengameart.org/content/100-cc0-sfx-2 — file: sfx100v2_thunder_01.ogg; Rain + Long Thunder — WuxiaScrub — https://opengameart.org/content/rain-long-thunder — file: rain-thunder.ogg; 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword_clash.1.ogg; 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_rock_breaking_02.ogg |
| `sfx_trib` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Rain + Long Thunder — WuxiaScrub — https://opengameart.org/content/rain-long-thunder — file: rain-thunder.ogg |
| `sfx_shield` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Magic Spell SFX — JaggedStone — https://opengameart.org/content/magic-spell-sfx — file: magical_2.ogg, magical_5.ogg, magical_6_0.ogg |
| `sfx_heal` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Cure Magic — Someoneman — https://opengameart.org/content/cure-magic — file: Cure1.wav, Cure2.wav, Cure3.wav |
| `sfx_potion` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: metalLatch.ogg, metalClick.ogg; Cure Magic — Someoneman — https://opengameart.org/content/cure-magic — file: Cure4.wav, Cure5.wav |
| `sfx_cast` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Magic Spell SFX — JaggedStone — https://opengameart.org/content/magic-spell-sfx — file: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_mcast` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Magic Spell SFX — JaggedStone — https://opengameart.org/content/magic-spell-sfx — file: magical_1_0.ogg, magical_3.ogg, magical_7_0.ogg |
| `sfx_respawn` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Magic Spell SFX — JaggedStone — https://opengameart.org/content/magic-spell-sfx — file: magical_4.ogg |
| `sfx_portal` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Cure Magic — Someoneman — https://opengameart.org/content/cure-magic — file: Cure8.wav; wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg |
| `sfx_ui_click` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Interface Sounds — Kenney — https://opengameart.org/content/interface-sounds — file: click_001.ogg, select_001.ogg |
| `sfx_ui_open` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: bookFlip2.ogg, bookFlip3.ogg |
| `sfx_ui_close` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: bookClose.ogg, bookPlace1.ogg |
| `sfx_ui_error` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Interface Sounds — Kenney — https://opengameart.org/content/interface-sounds — file: error_004.ogg |
| `sfx_ui_confirm` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Interface Sounds — Kenney — https://opengameart.org/content/interface-sounds — file: confirmation_001.ogg |
| `sfx_target` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Interface Sounds — Kenney — https://opengameart.org/content/interface-sounds — file: select_002.ogg |
| `sfx_loot` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: handleCoins.ogg, handleCoins2.ogg |
| `sfx_meditate` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Interface Sounds — Kenney — https://opengameart.org/content/interface-sounds — file: bong_001.ogg |
| `sfx_levelup` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 85 Short music jingles — Kenney — https://opengameart.org/content/85-short-music-jingles — file: jingles_PIZZA07.ogg |
| `sfx_quest` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 85 Short music jingles — Kenney — https://opengameart.org/content/85-short-music-jingles — file: jingles_PIZZA03.ogg |
| `sfx_ascend` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 85 Short music jingles — Kenney — https://opengameart.org/content/85-short-music-jingles — file: jingles_PIZZA12.ogg; Magic Spell SFX — JaggedStone — https://opengameart.org/content/magic-spell-sfx — file: magical_4.ogg; Cure Magic — Someoneman — https://opengameart.org/content/cure-magic — file: Cure6.wav |
| `sfx_craft` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: metalPot1.ogg, metalPot2.ogg |
| `sfx_enhance` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 100 CC0 SFX #2 — rubberduck — https://opengameart.org/content/100-cc0-sfx-2 — file: sfx100v2_metal_hit_01.ogg; 75 CC0 breaking / falling / hit sfx — rubberduck — https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx — file: bfh1_metal_hit_06.ogg |
| `sfx_gather` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 50 RPG sound effects — Kenney — https://opengameart.org/content/50-rpg-sound-effects — file: cloth1.ogg, cloth3.ogg |
| `sfx_fly` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword.2.ogg; wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg |
| `amb_wind` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg |
| `amb_forest` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | AMB Morning Sounds (Perfect Loop) — Kresiek The Furry — https://opengameart.org/content/amb-morning-sounds-perfect-loop — file: amb_morning.wav; wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg |
| `amb_stream` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Sea and river wave sounds — RandomMind — https://opengameart.org/content/sea-and-river-wave-sounds — file: VistulaShort_0.mp3 |
| `amb_night` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | Crickets Ambient Noise - loopable — Wolfgang_ — https://opengameart.org/content/crickets-ambient-noise-loopable — file: crickets_1.mp3; wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg |
| `amb_cave` | OpenGameArt (CC0) | CC0-1.0 | 2026-11-14 | wind whoosh loop — SketchMan3 — https://opengameart.org/content/wind-whoosh-loop — file: wind_20woosh_20loop.ogg; 20 Sword Sound Effects (Attacks and Clashes) — StarNinjas — https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes — file: sword_clash.9.ogg |

<!-- audio:end -->
