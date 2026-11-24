# Nhạc nền bằng Suno — danh sách bài, prompt và cách đưa vào game

> **Không còn là hướng chính (2026-11-15).** Gói Suno Free không tải được bài, nên nhạc của game giờ do Claude tự soạn bằng code (MIDI + soundfont, CC0): xem [`docs/audio/music.md`](music.md). Tài liệu này giữ lại làm tùy chọn nếu sau này có gói Suno trả phí; mục 2 (bài nào phát khi nào) và mục 3 (brief âm nhạc từng bài) vẫn là brief cho bản tự soạn. Muốn dùng Suno cho một bài: bỏ `"compose": true` của bài đó trong `tools/audio/music.json` và đặt `by`/`license`/`url` của Suno (xem `music.md` mục 6).

Phiên bản 1 · 2026-11-15 · Việc M0-5 (2 bài thử) và M4-10 (đủ bộ) trong plan phát triển, mục 3.1.

Nhạc tạo bằng **Suno gói Free**: chỉ dùng **phi thương mại**, Suno giữ quyền sở hữu, **bắt buộc ghi nguồn**. Game riêng với bạn bè nên dùng được; ghi nguồn đã tự động (xem mục 5).

## 1. Hướng dẫn nhanh (bạn làm)

**Cần một lần:** ffmpeg có libopus + aac. Trên Windows: `winget install Gyan.FFmpeg` rồi mở lại terminal. Hoặc đặt biến `FFMPEG=<đường dẫn ffmpeg.exe>`.

**Mỗi bài:**

1. Vào [suno.com](https://suno.com) → **Create** → chọn chế độ **Custom**.
2. Bật **Instrumental**. Dán khối **Style** của bài (mục 3) vào ô Style. Nếu có ô **Exclude styles**, dán dòng *Loại trừ*. Ô **Title** ghi đúng id bài (ví dụ `sect`) cho dễ tìm.
3. Bấm **Create**. Mỗi lượt ra 2 bản. Nghe cả hai, chọn bản theo mục 4 (năng lượng đều, không có đoạn lặng hay đổi không khí lớn ở giữa).
4. Tải bản đã chọn: menu **⋯** → **Download** → **MP3 Audio**.
5. Đổi tên thành `<id>.mp3` và đặt vào:
   `D:\METAGRIT\dtl-asset-source\audio\nhac\<id>.mp3`
   (tức `../dtl-asset-source/audio/nhac/` cạnh thư mục repo; tạo thư mục nếu chưa có). File này **không** commit.
6. Lấy link bài: **Share** → **Copy link**, dán vào trường `url` của bài trong `tools/audio/music.json`. Suno Free bắt buộc ghi nguồn, nên đừng bỏ qua.
7. Chạy ở thư mục repo:

   ```
   pnpm music:check                          # xem bài nào đã có file, bài nào thiếu url
   pnpm music:build --only sect --preview    # hậu kỳ một bài + file nghe thử chỗ nối
   pnpm music:build                          # hậu kỳ mọi bài đã có file
   ```

   Lệnh in bảng: điểm vòng, BPM, độ giống, `nối` (≤ 1 tốt, > 2 dễ nghe ra), LUFS trước/sau. Với `--preview`, nó in đường dẫn file `<id>.seam.wav` (6 giây cuối + 6 giây đầu vòng, phát 2 lần). Nghe file này: không được nghe ra chỗ nối.
8. Nghe trong game: `pnpm dev`, mở game **bình thường** (không thêm `?mute=1`, tham số đó chỉ cho máy chạy thử). Nhạc đổi theo trạng thái (mục 2). Cài đặt → **Nguồn nhạc** phải hiện tên bài và "Suno (free, non-commercial)".
9. Nghe ổn thì nhắn Claude commit: `apps/client/public/audio/music/*`, `apps/client/public/audio/manifest.json`, `assets/LICENSES.md`, `tools/audio/music.json`.

**Chỗ nối nghe ra thì sao:** sửa bài đó trong `tools/audio/music.json` rồi chạy lại bước 7:

| Triệu chứng | Sửa |
| --- | --- |
| Lệch nhịp ở chỗ nối, cột BPM sai (gấp đôi/nửa, hoặc có dấu `?`) | thêm `"bpm": <nhịp đúng>` (đếm theo tay hoặc lấy từ prompt) |
| Vòng rơi vào đoạn không hợp (ví dụ phần mở yếu) | ép `"start": <giây>` và/hoặc `"end": <giây>` (nghe bản MP3 gốc để chọn) |
| Nghe "phụt" nhẹ ở chỗ nối | tăng `"xfade": 0.2` (mặc định 0,12 giây, tối đa 0,5) |
| Vòng quá ngắn, nghe lặp nhiều | tăng `"maxLen"`, hoặc tạo lại bài dài hơn |

**Lưu ý gói Free (chưa kiểm chứng hết):**

- Khoảng 50 credit mỗi ngày, thường cho là 10 credit mỗi lượt (2 bản), tức khoảng 5 lượt/ngày. Ưu tiên 2 bài M0-5 hôm đầu.
- Một nguồn ghi gói Free **không còn tải bài** từ tháng 9/2026. Nếu nút Download bị khóa: dừng lại và báo Claude. **Đừng** thu lại tiếng từ loa hay trình duyệt.
- Suno có thể đóng dấu âm thanh (watermark) lên bản tải về. Nghe kỹ đầu và cuối bài.
- Model của gói Free yếu hơn gói trả phí. Bài không đạt thì tạo lại, đừng cố cứu bằng hậu kỳ.

## 2. Bài nào phát khi nào

Id bài trùng với máy trạng thái nhạc (`apps/client/src/game/musicDirector.ts`). Bài chưa có file thì game phát bài giữ chỗ sinh thủ tục (ngũ cung), nên thêm dần từng bài vẫn chơi được.

| Ưu tiên | Id | Tên (ghi nguồn) | Phát khi | Vòng tối đa | Tempo |
| --- | --- | --- | --- | --- | --- |
| **M0-5** | `sect` | Lạc Kiếm Tông | Trong vùng tông môn | 2:30 | 72 |
| **M0-5** | `combat` | Giao Phong | Quái đang đuổi/đánh mình | 1:30 | 128 |
| M4-10 | `wild` | Vân Lam Sơn Mạch | Ngoài tông môn: núi, Thung lũng Thanh Khê | 3:00 | 84 |
| M4-10 | `forest` | Rừng Linh Thảo | Trong rừng | 2:30 | 80 |
| M4-10 | `lake` | Hồ Sương Mù | Ven hồ (vùng của Hàn Giao, khi chưa giao chiến) | 2:30 | 66 |
| M4-10 | `dungeon` | Kiếm Trủng | Room bí cảnh, và lòng chảo Kiếm Trủng trên bản đồ | 2:30 | 70 |
| M4-10 | `boss` | Hàn Giao | Giao chiến boss thế giới | 2:30 | 140 |
| M4-10 | `dungeon_boss` | Kiếm Trủng — Thủ Mộ | Đợt boss bí cảnh (Kiếm Khôi, Huyết Lang Vương) | 2:00 | 136 |
| M4-10 | `tribulation` | Độ Kiếp | Đang độ kiếp Trúc Cơ (khoảng 40 giây) | 1:00 | 100 |
| M4-10 | `meditate` | Đả Tọa | Đang đả tọa | 2:00 | 60 |
| sau | `title` | Vạn Tiên Lộ | Màn đăng nhập, màn tải | 1:30 | 70 |
| sau | `sting_levelup`, `sting_breakthrough`, `sting_death` | (3 nhạc ngắn) | Lên tầng, Trúc Cơ thành công, tử vong | 3–8 giây | — |

`title` (màn đăng nhập/màn tải) và ba sting (khi sự kiện là của chính mình) đã nối vào client. Thứ tự ưu tiên khi nhiều trạng thái cùng lúc: độ kiếp > boss > chiến đấu > đả tọa > vùng.

**Thử trong game** (tài khoản thử): vào/ra tông môn để nghe `sect`; đánh một con quái gần tông môn để nghe `combat`. Các bài khác: `/gm tp x z` tới vùng, `/gm spawn <id>` gọi quái, `/gm level 15` rồi độ kiếp. Khi chạy `pnpm dev`, gõ `__music.state()` trong console để xem trạng thái nhạc.

## 3. Prompt từng bài

### Quy ước chung

- **Instrumental** luôn bật. Style viết **tiếng Anh, dạng tag ngắn**, ngăn cách bằng dấu phẩy.
- Màu âm chung của game: cổ phong Đông Á, ngũ cung, núi non sương sớm (art bible v3): nắng vàng ấm xuyên sương dày, núi xa ngọc lam. Không khí **thoáng, ấm, có chiều sâu**, không u tối kiểu đêm tuyết.
- Nhạc nền nhỏ hơn SFX khoảng 3 lần trong game, nên **không cần dày**. Bài thưa, rõ nét hợp hơn bài hoành tráng.
- **Không** nêu tên nghệ sĩ, nhạc sĩ, game, phim hay bài có thật. Không viết "theo phong cách của …".
- Thêm các tag sau vào cuối mọi Style để dễ cắt vòng: `steady tempo, consistent energy, no fade out, seamless loop`.
- Dòng **Loại trừ** chung (ô Exclude styles, nếu có): `vocals, lyrics, rap, EDM drop, trap, rock guitar, piano ballad, fade out, tempo change`.
- Có thể thử thêm `dan bau` (đàn bầu) cho chất Việt ở `lake` và `meditate`. Chưa rõ model Free thể hiện đúng âm sắc này; không ra thì bỏ.

### M0-5 · `sect` — Lạc Kiếm Tông

- **Mục đích:** nhạc "nhà": người chơi ở đây lâu nhất (nhận nhiệm vụ, mua bán, luyện đan). Phải nghe lâu không mệt.
- **Độ dài:** vòng tới 2:30. **Tempo:** khoảng 72 BPM, 4/4.
- **Nhạc cụ:** cổ cầm (guqin), tiêu (xiao), chuông đồng xa, nền dây mềm; điểm xuyết cổ tranh.
- **Tâm trạng:** thanh tịnh, trang nghiêm nhưng ấm; nắng sớm trên sân đá, sương còn đọng.

```
Style: instrumental, ancient East Asian, guqin, xiao flute, distant bronze temple bell, soft warm string pad, light guzheng, pentatonic, 72 BPM, 4/4, serene misty mountain dawn, sword sect courtyard, peaceful, dignified, sparse, steady tempo, consistent energy, no fade out, seamless loop
```

### M0-5 · `combat` — Giao Phong

- **Mục đích:** bật ngay khi quái nhắm mình, tắt sau 6 giây yên. Đánh quái thường nên căng nhưng không hoành tráng như boss.
- **Độ dài:** vòng tới 1:30. **Tempo:** khoảng 128 BPM, 4/4.
- **Nhạc cụ:** trống chiến (tanggu), tỳ bà vê nhanh, nhị (erhu) giai điệu, sáo trúc điểm, dây trầm ostinato.
- **Tâm trạng:** gấp, dứt khoát, khí thế; giao đấu giữa núi sương.

```
Style: instrumental, ancient East Asian martial combat, driving tanggu war drums, fast pipa tremolo, erhu lead melody, dizi accents, low string ostinato, minor pentatonic, 128 BPM, 4/4, tense energetic duel in misty mountains, urgent, focused, steady tempo, consistent energy, no fade out, seamless loop
```

### `wild` — Vân Lam Sơn Mạch

- **Mục đích:** khám phá ngoài tông môn: đường núi, thung lũng, bay ngự kiếm. Nghe nhiều thứ hai sau `sect`.
- **Độ dài:** vòng tới 3:00. **Tempo:** khoảng 84 BPM.
- **Nhạc cụ:** sáo trúc (dizi), tỳ bà, nền dây rộng, trống tay nhẹ.
- **Tâm trạng:** khoáng đạt, phiêu lưu, gió núi, trời rộng.

```
Style: instrumental, ancient East Asian adventure, dizi bamboo flute lead, pipa, wide soaring string pad, light hand drums, pentatonic, 84 BPM, 4/4, open mountain valleys above the clouds, hopeful, wandering, airy, steady tempo, consistent energy, no fade out, seamless loop
```

### `forest` — Rừng Linh Thảo

- **Mục đích:** hái linh thảo, đánh quái trong rừng. Hơi bí ẩn, có sức sống.
- **Độ dài:** vòng tới 2:30. **Tempo:** khoảng 80 BPM.
- **Nhạc cụ:** cổ tranh, sáo trúc thấp, mõ gỗ, nền dây ấm.
- **Tâm trạng:** nắng lọt kẽ lá, thảo mộc có linh khí, tò mò.

```
Style: instrumental, ancient East Asian, guzheng arpeggios, low bamboo flute, wooden fish woodblock, soft warm strings, pentatonic, 80 BPM, 4/4, sunlit spirit herb forest, dappled light, curious, gentle mystery, lively, steady tempo, consistent energy, no fade out, seamless loop
```

### `lake` — Hồ Sương Mù

- **Mục đích:** ven hồ, nơi Hàn Giao ẩn. Đẹp nhưng lạnh, gợi điềm.
- **Độ dài:** vòng tới 2:30. **Tempo:** khoảng 66 BPM, ít nhịp.
- **Nhạc cụ:** đàn bầu (nếu được) hoặc nhị chậm, bồi âm cổ tranh như giọt nước, pad sương.
- **Tâm trạng:** mặt hồ phủ sương, lạnh, tĩnh, một chút bất an.

```
Style: instrumental, ancient East Asian ambient, dan bau monochord, slow erhu, guzheng harmonics like water drops, misty atmospheric pad, sparse low drum pulse, pentatonic minor, 66 BPM, 4/4, cold fog over a still lake, beautiful but uneasy, something lurking beneath, steady tempo, consistent energy, no fade out, seamless loop
```

### `dungeon` — Kiếm Trủng

- **Mục đích:** bí cảnh Kiếm Trủng, mộ của vạn thanh kiếm cổ. Có 4 đợt quái nên cần căng âm ỉ, không phải nhạc chiến đấu.
- **Độ dài:** vòng tới 2:30. **Tempo:** khoảng 70 BPM.
- **Nhạc cụ:** drone trầm, kim loại cọ (bowed metal), chuông xoay, cổ cầm thưa, tiếng kim khí ngân xa.
- **Tâm trạng:** u tịch, trang nghiêm, kiếm ý còn sót lại.

```
Style: instrumental, ancient East Asian dark ambient, low drone, bowed metal resonance, singing bowls, sparse guqin plucks, distant ringing blade tones, slow frame drum pulse, 70 BPM, 4/4, ancient sword tomb, solemn, eerie, lingering sword intent, steady tempo, consistent energy, no fade out, seamless loop
```

### `boss` — Hàn Giao

- **Mục đích:** giao chiến yêu giao trấn giữ Hồ Sương Mù. Trận dài nhiều pha.
- **Độ dài:** vòng tới 2:30. **Tempo:** khoảng 140 BPM.
- **Nhạc cụ:** trống lớn, đồng la, nhị gắt, dây trầm dồn dập, kim loại lạnh.
- **Tâm trạng:** lạnh buốt, đáng sợ, gấp; quái thú băng dưới hồ trỗi dậy.

```
Style: instrumental, ancient East Asian epic battle, massive war drums, crashing gongs, aggressive erhu, driving low strings, icy metallic textures, minor pentatonic, 140 BPM, 4/4, giant ice serpent rising from a frozen misty lake, dread, relentless, high intensity, steady tempo, consistent energy, no fade out, seamless loop
```

### `dungeon_boss` — Kiếm Trủng — Thủ Mộ

- **Mục đích:** đợt boss trong bí cảnh (khôi lỗi giữ cửa, sói vương). Khác `boss` ở âm sắc kim loại.
- **Độ dài:** vòng tới 2:00. **Tempo:** khoảng 136 BPM.
- **Nhạc cụ:** bộ gõ kim loại, đòn như kiếm va, đồng la, nhị, trống trầm.
- **Tâm trạng:** sắc lạnh, cơ khí, không ngừng.

```
Style: instrumental, ancient East Asian battle, metallic percussion, clashing blade hits, gong accents, fierce erhu, pounding low drums, minor pentatonic, 136 BPM, 4/4, ancient tomb guardian awakening, sharp, cold steel, relentless, steady tempo, consistent energy, no fade out, seamless loop
```

### `tribulation` — Độ Kiếp

- **Mục đích:** độ kiếp Trúc Cơ, thiên lôi giáng xuống khoảng 40 giây. Cao trào của cả MVP.
- **Độ dài:** vòng tới 1:00. **Tempo:** khoảng 100 BPM.
- **Nhạc cụ:** trống dồn, sấm (rumble), dây đi lên, đồng la cuộn, tiêu cao.
- **Tâm trạng:** trời đất nổi giận, căng tột độ, bi tráng.
- **Ghi chú lặp:** bài tăng dần thì cuối bài không khớp đầu bài. Chọn bản **giữ cường độ cao từ sớm**. Nếu muốn giữ đoạn tăng dần, ép `start` vào sau phần mở và `end` trước khi bài hạ xuống.

```
Style: instrumental, ancient East Asian cinematic, thunderous massive war drums, deep rumbling low end, rising tremolo strings, rolling gongs, piercing xiao flute, minor pentatonic, 100 BPM, 4/4, heavenly lightning tribulation, sky splitting open, intense, awe, sustained high intensity, steady tempo, consistent energy, no fade out, seamless loop
```

### `meditate` — Đả Tọa

- **Mục đích:** ngồi thiền hồi phục, có thể kéo dài. Gần như nhạc nền tĩnh.
- **Độ dài:** vòng tới 2:00. **Tempo:** khoảng 60 BPM, mạch chậm.
- **Nhạc cụ:** chuông xoay (singing bowl), drone, bồi âm cổ cầm, tiếng nước chảy nhẹ; có thể đàn bầu.
- **Tâm trạng:** tĩnh lặng, linh khí lưu chuyển.
- **Ghi chú lặp:** bài không có phách rõ thì `loop.mjs` cắt theo phách thay vì ô nhịp (BPM in kèm `?`). Nếu nghe lệch, ép `bpm: 60`.

```
Style: instrumental, ancient East Asian meditation, singing bowls, warm low drone, guqin harmonics, soft dan bau, gentle flowing water texture, pentatonic, slow 60 BPM pulse, 4/4, cultivator meditating at dawn, spiritual energy circulating, tranquil, still, steady tempo, consistent energy, no fade out, seamless loop
```

### `title` — Vạn Tiên Lộ (làm sau)

- **Mục đích:** màn đăng nhập và màn tải. Chủ đề chính của game, có giai điệu nhớ được.
- **Độ dài:** vòng tới 1:30. **Tempo:** khoảng 70 BPM.
- **Nhạc cụ:** cổ tranh, sáo trúc giai điệu, nền dây, trống trầm thưa.
- **Tâm trạng:** khoáng đạt, hy vọng, bắt đầu một con đường tu tiên.

```
Style: instrumental, ancient East Asian main theme, guzheng, memorable dizi bamboo flute melody, warm cinematic strings, sparse deep drums, pentatonic, 70 BPM, 4/4, misty mountain dawn, beginning of a long cultivation journey, hopeful, majestic but gentle, steady tempo, consistent energy, no fade out, seamless loop
```

### Sting (làm sau): `sting_levelup`, `sting_breakthrough`, `sting_death`

Suno luôn ra bài dài nên tốn credit cho một nhạc 3–8 giây. Cách rẻ hơn: cắt từ phần mở hoặc câu kết của một bài đã tạo. Đặt bài vào `sting_<…>.mp3`, ghi `start`/`end` (giây) trong `music.json`; `loop.mjs` cắt đoạn đó, bỏ lặng, fade cuối 50 ms, chuẩn hóa. Nếu cần tạo riêng:

| Id | Khi nào | Style |
| --- | --- | --- |
| `sting_levelup` | Lên tầng Ngưng Khí | `instrumental, short bright fanfare, guzheng glissando, small bronze bell, uplifting, pentatonic major, short` |
| `sting_breakthrough` | Trúc Cơ thành công | `instrumental, triumphant short cue, big gong swell, soaring dizi, warm strings, radiant, pentatonic major, short` |
| `sting_death` | Tử vong | `instrumental, short somber cue, low xiao flute, single distant gong, sorrowful, pentatonic minor, short` |

## 4. Chọn bản nào (nghe trước khi tải)

Gói Free giới hạn lượt, nên nghe kỹ 2 bản của mỗi lượt và chỉ tải bản đạt:

- **Năng lượng đều** từ khoảng giây 10 tới gần cuối. Không có đoạn ngắt, lặng giữa bài, đổi tempo hay đổi hẳn không khí.
- **Phần thân đủ dài**: ít nhất bằng cột "vòng tối đa" cộng khoảng 10 giây (để có chỗ so chỗ nối).
- **Không có giọng hát** (kể cả tiếng ngân "aah"). Hợp xướng không lời thì chỉ chấp nhận ở `boss`/`tribulation`, và chỉ khi nó không lấn SFX.
- Kết thúc có fade-out cũng **không sao**: `loop.mjs` tự bỏ phần mở và đuôi. Chỉ cần phần thân ổn.
- Không có tiếng lạ (méo, nhiễu, watermark) ở giữa bài.

## 5. Hậu kỳ tự động và ghi nguồn

`tools/audio/loop.mjs` (DSP ở `tools/audio/loopcore.mjs`, khai báo ở `tools/audio/music.json`):

1. Giải mã về 48 kHz stereo, tìm **phần thân**: bỏ lặng đầu và đuôi tắt dần.
2. Dò **nhịp** (tự tương quan đường bao onset) và pha phách. `bpm` trong `music.json` ghi đè.
3. Chọn điểm đầu vòng trên phách (bỏ ô nhịp đầu), điểm cuối = điểm đầu + n ô nhịp sao cho nhạc ngay sau điểm cuối **giống nhất** nhạc ngay sau điểm đầu (so năng lượng 4 dải), dò thêm ±1/4 phách để bù sai số nhịp.
4. **Khớp pha** điểm cuối theo dạng sóng (±21 ms), đặt điểm đầu vào **điểm qua 0**.
5. **Crossfade** 120 ms: đuôi vòng trộn với đoạn ngay trước điểm đầu, nên mẫu cuối nối liền mẫu đầu.
6. Chuẩn hóa **−16 LUFS** (EBU R128), đỉnh thực ≤ **−1 dBTP**. Đỉnh chặn trước thì bài nhỏ hơn đích một chút và bảng in "(giới hạn đỉnh)".
7. Mã hóa Opus/WebM 96 kbps + AAC/M4A 128 kbps, tên file theo hash nội dung, ghi `apps/client/public/audio/music/`.
8. Ghi mục `music` trong `apps/client/public/audio/manifest.json` (giữ nguyên SFX và âm môi trường của `pnpm audio:build`) với `credit` mỗi bài, và khối **Nhạc nền** trong `assets/LICENSES.md`.

**Ghi nguồn:** mỗi bài có `credit = { title, by: "Suno (free, non-commercial)", license: "phi thương mại, ghi nguồn", url }`. Mục **Cài đặt → Nguồn nhạc** trong game đọc trường này và hiện link "nghe gốc". Bài thiếu `url` vẫn build được nhưng lệnh sẽ cảnh báo.

Bài chưa có file nguồn giữ nguyên mục cũ trong manifest (nếu có). Xóa một bài khỏi `music.json` thì lần build sau xóa file của nó.

**Kiểm tra:** `pnpm audio:test` chạy test đơn vị DSP và một lần chạy thật `loop.mjs` trên MP3 mẫu sinh bằng ffmpeg (độ dài vòng đúng bội 2 ô nhịp, ffmpeg đo lại −16 ± 0,5 LUFS, chạy lại ra cùng file).
