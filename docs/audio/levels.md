# Bảng mức chuẩn âm thanh (P2-D2)

Sinh bởi `pnpm audio:levels` (`tools/audio/levels.mjs`) từ bản build trong `apps/client/public/audio/`. Đừng sửa tay.

**Độ to hiệu dụng** = độ to file (LUFS, BS.1770-4) × mức trộn bus × `gain` của mục trong manifest, tức mức khi thanh trượt người chơi ở 100%.
SFX đo bằng độ to ngắn hạn lớn nhất (khối 100 ms, "độ to khi đánh"); nhạc và âm môi trường đo tích hợp cả bài/vòng lặp.
Các số so sánh giữa SFX và nhạc là gần đúng (hai cách đo khác nhau), dùng để giữ tỉ lệ, không phải mức tuyệt đối khi nghe.

## Mức trộn bus (`apps/client/src/game/audioMix.json`)

| Bus | Hệ số | dB |
| --- | --- | --- |
| `music` | 0.33 | -9.6 dB |
| `ambient` | 0.25 | -12.0 dB |
| `sfx` | 1 | 0.0 dB |
| `ui` | 1 | 0.0 dB |

Chuỗi tín hiệu: nguồn → (panner) → bus → master. Nhạc đi thêm hai tầng hạ nhạc: `duck()` ngắn (sấm, đột phá, sting, phá chú) và `duckHold()` giữ lâu (hội thoại NPC, lời boss, thẻ chương); hai tầng nhân với nhau.

## Quy tắc cân âm

- ✅ Nhạc vùng so với đòn đánh: -10.8 dB (mục tiêu −9,5 dB ± 2, xấp xỉ 1/3 biên độ)
- ✅ Âm môi trường so với nhạc: -6.4 dB (phải thấp hơn nhạc ít nhất 3 dB)
- ✅ Nhóm xác nhận nổi nhất: yếu nhất -11.1 LUFS, SFX khác mạnh nhất -12.2 LUFS (cần cao hơn ít nhất 0,5 dB)
- ✅ Bước chân so với đòn đánh: -11.2 dB (phải thấp hơn ít nhất 8 dB)

## Theo bus

| Nhóm | LUFS file (TB) | Hiệu dụng TB (LUFS) | Hiệu dụng lớn nhất |
| --- | --- | --- | --- |
| sfx — Đòn đánh | -14.9 | -14.9 | -12.2 |
| sfx — Xác nhận thành công | -9.9 | -9.9 | -8.6 |
| sfx — Phép, kỹ năng | -16.3 | -16.3 | -13.5 |
| sfx — Thế giới | -15.4 | -15.4 | -13.0 |
| sfx — Bước chân | -26.1 | -26.1 | -21.1 |
| ui | -21.8 | -21.8 | -17.1 |
| music — bài vùng | -16.0 | -25.6 | -25.6 |
| music — lớp giao chiến (stem) | -24.0 | -33.6 | -32.6 |
| music — sting | -16.0 | -25.6 | -25.6 |
| ambient | -19.9 | -32.0 | -29.4 |

## Chi tiết SFX (độ to ngắn hạn lớn nhất, khối 100 ms)

| Âm | Bus | File | Hiệu dụng |
| --- | --- | --- | --- |
| `sword` | sfx | -13.2 | -13.2 |
| `slash` | sfx | -12.4 | -12.4 |
| `rain` | sfx | -12.2 | -12.2 |
| `hit` | sfx | -16.2 | -16.2 |
| `crit` | sfx | -12.8 | -12.8 |
| `hurt` | sfx | -17.1 | -17.1 |
| `block` | sfx | -17.6 | -17.6 |
| `death` | sfx | -16.4 | -16.4 |
| `impact` | sfx | -17.3 | -17.3 |
| `spellbreak` | sfx | -10.0 | -10.0 |
| `thunder` | sfx | -16.8 | -16.8 |
| `shield` | sfx | -13.5 | -13.5 |
| `heal` | sfx | -14.1 | -14.1 |
| `potion` | sfx | -15.0 | -15.0 |
| `cast` | sfx | -17.2 | -17.2 |
| `mcast` | sfx | -18.7 | -18.7 |
| `rare` | sfx | -8.6 | -8.6 |
| `ui_click` | ui | -23.4 | -23.4 |
| `ui_open` | ui | -22.1 | -22.1 |
| `ui_close` | ui | -24.1 | -24.1 |
| `ui_error` | ui | -20.3 | -20.3 |
| `ui_confirm` | ui | -21.3 | -21.3 |
| `target` | ui | -25.4 | -25.4 |
| `loot` | ui | -17.1 | -17.1 |
| `meditate` | ui | -24.6 | -24.6 |
| `step_stone` | sfx | -23.7 | -23.7 |
| `step_grass` | sfx | -29.1 | -29.1 |
| `step_dirt` | sfx | -26.8 | -26.8 |
| `step_sand` | sfx | -29.5 | -29.5 |
| `step_wood` | sfx | -26.2 | -26.2 |
| `step_water` | sfx | -21.1 | -21.1 |
| `trib` | sfx | -19.0 | -19.0 |
| `respawn` | sfx | -13.0 | -13.0 |
| `portal` | sfx | -13.3 | -13.3 |
| `levelup` | sfx | -15.2 | -15.2 |
| `quest` | ui | -17.4 | -17.4 |
| `ascend` | sfx | -11.1 | -11.1 |
| `craft` | sfx | -14.0 | -14.0 |
| `enhance` | sfx | -14.8 | -14.8 |
| `gather` | sfx | -20.5 | -20.5 |
| `fly` | sfx | -14.3 | -14.3 |

## Chi tiết nhạc và âm môi trường (tích hợp)

| Id | Bus | File | Hiệu dụng |
| --- | --- | --- | --- |
| `sect` | music | -16.0 | -25.6 |
| `combat` | music | -16.0 | -25.6 |
| `wild` | music | -16.0 | -25.6 |
| `forest` | music | -16.0 | -25.6 |
| `lake` | music | -16.0 | -25.6 |
| `dungeon` | music | -16.0 | -25.6 |
| `boss` | music | -16.0 | -25.6 |
| `dungeon_boss` | music | -16.0 | -25.6 |
| `tribulation` | music | -16.0 | -25.6 |
| `meditate` | music | -16.0 | -25.6 |
| `title` | music | -16.0 | -25.6 |
| `sect_pulse` | music | -23.0 | -32.6 |
| `sect_edge` | music | -25.0 | -34.6 |
| `wild_pulse` | music | -23.0 | -32.6 |
| `wild_edge` | music | -25.0 | -34.6 |
| `dungeon_pulse` | music | -23.0 | -32.6 |
| `dungeon_edge` | music | -25.0 | -34.6 |
| `sting_levelup` | music | -16.0 | -25.6 |
| `sting_breakthrough` | music | -16.0 | -25.6 |
| `sting_death` | music | -16.0 | -25.6 |
| `wind` | ambient | -19.7 | -31.8 |
| `forest` | ambient | -20.6 | -32.7 |
| `stream` | ambient | -18.8 | -30.8 |
| `water` | ambient | -17.4 | -29.4 |
| `night` | ambient | -20.1 | -32.2 |
| `cave` | ambient | -22.9 | -35.0 |

## Cách cân lại

1. Đổi mức trộn bus trong `audioMix.json`, hoặc `level` (dB) của từng âm trong `tools/audio/sounds.json`.
2. `pnpm audio:build` (nếu đổi sounds.json), rồi `pnpm audio:levels` để ghi lại bảng này và kiểm quy tắc.
3. `pnpm audio:check` chạy lại phần kiểm quy tắc (không ghi file).

