# SFX, bước chân và nguồn âm theo vị trí

Phần nhạc nền xem `music.md`; bảng mức chuẩn (đo bằng LUFS) xem `levels.md` (sinh tự động bởi `pnpm audio:levels`).

## Cân âm lượng (P2-D2)

- Nhạc khoảng 1/3 biên độ của đòn đánh (≈ −9,5 dB), âm môi trường thấp hơn nhạc ≥ 3 dB. Mức trộn bus ở `apps/client/src/game/audioMix.json`
  (`music 0.33`, `ambient 0.25`, `sfx 1`, `ui 1`); `audio.ts` và `tools/audio/levels.mjs` cùng đọc file này.
- Nhóm "xác nhận thành công" là nhóm to và giòn nhất: `ascend` (đột phá), `spellbreak` (phá chú: ngắt niệm chú hoặc boss mất thế), `rare` (đồ quý rơi,
  đi cùng chuông đồ rơi). Mỗi âm gồm hai lớp mẫu CC0 và một lớp kim loại tổng hợp (`"synth": "metal"` trong `tools/audio/sounds.json`: tổng sin lệch hài,
  vào gắt 1,5 ms, tắt theo hàm mũ). `spellbreak` và `rare` có `"sat"`: bão hòa mềm (tanh) trước chuẩn hóa để hạ đỉnh, đạt độ to mục tiêu dưới trần −1 dBFS và giòn hơn.
- Hạ nhạc có hai tầng nhân với nhau: `duck(amount, hold, release)` ngắn (sấm, đột phá, sting, phá chú, đồ quý), và `duckHold(key, amount, seconds?)` giữ lâu
  (`chapter` 0,5 theo thời lượng thẻ chương; `boss` 0,4 trong lúc lời boss; `npc` 0,35 suốt hội thoại NPC). Mức hạ là mức sâu nhất trong các khóa đang giữ.
- Đổi mức: sửa `audioMix.json` hoặc `level` (dB) của âm trong `sounds.json`, `pnpm audio:build` rồi `pnpm audio:levels` để ghi lại bảng. `pnpm audio:check` fail nếu lệch quy tắc.

## Bước chân theo chất liệu (P2-D3)

| Chất liệu | Nguồn (CC0) | Khi nào |
| --- | --- | --- |
| `step_stone` | rubberduck 100 CC0 SFX #2 `footstep_01/02` | sân tông môn, bệ cổng, bậc thang, sườn dốc/đỉnh núi, nền bí cảnh |
| `step_grass` | Kenney 50 RPG `footstep03/05/09` lọc thông thấp + vải khẽ | cỏ, thảm lá |
| `step_dirt` | Kenney 50 RPG `footstep00/02/07` | đường mòn |
| `step_sand` | Kenney 50 RPG `footstep01/04/08` hạ cao độ, lọc + hạt cát | cát ven hồ (dải 3–5 m) |
| `step_wood` | rubberduck `footstep_wood_01..04` | sàn gỗ (chưa có kiến trúc gỗ đi được: `WOOD_ZONES` trong `surface.ts` đang rỗng) |
| `step_water` | rubberduck `footstep_wet_01..03` | lội nước nông trong hồ |

- `game/surface.ts` suy chất liệu từ cùng dữ liệu với mặt nạ vùng của shader mặt đất (`render/groundMask.ts`: sân lát đá, cát, đường mòn; độ dốc/độ cao như lớp rock),
  nên tiếng khớp với thứ người chơi nhìn thấy. Thứ tự: nước > gỗ > đá lát/bậc thang > cát > dốc/đỉnh cao (đá) > đường đất > cỏ.
- `game/footsteps.ts`: nhịp theo quãng đường (sải 1,5 m + 0,1 m mỗi m/s), không bước khi bay, thiền, chết, trên không hay đứng yên. Mình luôn được phát;
  người và quái khác chỉ trong 26 m, âm lượng bình phương theo khoảng cách, tối đa 3 bước/khung và 5 bước mỗi 120 ms (nguồn gần được ưu tiên).
  Mọi quyết định (kể cả khi `?mute=1`) ghi ở `__sound.steps()`: số bước theo chất liệu, số bị bỏ, bước cuối.

## Nguồn âm theo vị trí (P2-D3)

`game/soundscape.ts`, phát qua `PannerNode` (mô hình nghịch đảo, pan theo hướng camera nhờ `setListener`) vào bus môi trường (thanh trượt "Môi trường").

| Nguồn | Chỗ đặt | Âm | Tầm / tối đa cùng lúc |
| --- | --- | --- | --- |
| Đèn lồng đá | 16 đèn dọc lối vào tông môn (`SECT_LANTERNS`) | lách tách lửa dựng bằng code (`makeCrackle`, tất định) | 22 m / 3 |
| Nước ven hồ | 16 điểm bờ hồ (`shorePoints`, theo `heightAt`) | `amb/water` (30 CC0 SFX Loops `water_flowing`, dựng vòng dài 24 s, nạp lười lần đầu cần) | 70 m / 2 |
| Chuông chùa | chính điện Lạc Kiếm Tông (2048, 2004) | bồi âm chuông trầm 220 Hz, thông thấp 2,8 kHz; lần đầu sau 10–22 s khi vào tầm, sau đó 40–70 s một tiếng | 280 m / 1 |

Chỉ nguồn gần nhất của mỗi loại được dựng; ra khỏi tầm thì tắt dần 0,8 s. Chưa mở khóa âm thanh hoặc tắt tiếng thì chỉ ghi nhận trạng thái (`__sound.scape()`), không phát.
Bản đồ chưa có thác hay suối thật: khi có model thì thêm điểm vào `buildSources` (loại `water`).

## Nghe thử không cần mở game

`node tools/audio/walkthrough/walkthrough.mjs --out nghe-thu.mp3`: chạy code thật của game (chất liệu đất, nhịp bước, chọn nguồn, lịch chuông) trên một lộ trình
(sân đá có đèn và chuông → đường đất → cỏ → cát → lội nước), trộn lại bằng công thức giống client (mức bus, suy giảm khoảng cách, pan) rồi nâng tổng mức lên −20 LUFS.
Gần đúng chứ không phải ghi âm từ trình duyệt.
