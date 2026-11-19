# Nhạc nền tự soạn (MIDI + soundfont)

Phiên bản 1 · 2026-11-15 · Thay hướng Suno (gói Free không tải được bài). Việc M0-5 (2 bài đầu) và M4-10 (đủ bộ).

Toàn bộ nhạc của game do Claude **soạn bằng code**: mỗi bài là một script `tools/audio/compose/<id>.mjs` viết giai điệu, hợp âm, nhịp trống theo ngũ cung, xuất MIDI, rồi render bằng **soundfont GeneralUser GS v2.0.3** ra âm thanh. Nhạc phát hành **CC0**; soundfont cho phép dùng tự do để tạo nhạc (xem mục 5). Mọi bài sửa lại được bằng cách sửa script rồi build lại.

## 1. Lệnh

```
pnpm install                              # một lần: spessasynth_core + ffmpeg-static trong @dtl/audio, không cần cài gì hệ thống
pnpm music:build                          # render + hậu kỳ mọi bài (khoảng 25 s mỗi bài)
pnpm music:build --only sect,combat       # chỉ vài bài (bài khác giữ nguyên trong manifest)
pnpm music:check                          # liệt kê bài đã có/thiếu
pnpm audio:test                           # test hậu kỳ + thư viện soạn nhạc + chỗ nối vòng
```

Lần build đầu tự tải soundfont (32 MB) về `../dtl-asset-source/audio/nhac/sf2/GeneralUser-GS-v2.0.3.sf2` từ commit ghim của repo gốc và kiểm SHA-256; sai checksum thì dừng. Bản WAV (float 32-bit, trước chuẩn hóa) và MIDI một vòng của mỗi bài được ghi vào `../dtl-asset-source/audio/nhac/compose/` để nghe hoặc mở bằng phần mềm soạn nhạc (MuseScore, Reaper…). Các file này không commit.

Sau khi build, commit: `apps/client/public/audio/music/*`, `apps/client/public/audio/manifest.json`, `assets/LICENSES.md`, script trong `tools/audio/compose/` và `tools/audio/music.json` nếu có đổi.

## 2. Danh sách bài

Id bài lặp trùng máy trạng thái nhạc (`apps/client/src/game/musicDirector.ts`). Thứ tự ưu tiên khi nhiều trạng thái cùng lúc: độ kiếp > boss > chiến đấu > đả tọa > vùng. `title` phát ở màn đăng nhập/màn tải (`apps/client/src/ui/App.tsx`); ba sting phát qua `playSting` (`apps/client/src/game/audio.ts`) khi sự kiện là của chính mình (`engine.ts`, `STINGS`).

| Id | Tên (ghi nguồn) | Phát khi | Tempo, điệu | Vòng | Phần | Nhạc cụ (preset GM của GeneralUser GS) |
| --- | --- | --- | --- | --- | --- | --- |
| `sect` | Lạc Kiếm Tông | Trong tông môn | 72, cung D | 40 ô, 2:13 | A B C D B' | Koto (cổ tranh), Shakuhachi (tiêu), Warm Pad, Cello, Tubular Bells, Harp, Slow Strings, Pan Flute, Concert Bass Drum |
| `combat` | Giao Phong | Quái đuổi/đánh mình | 128, vũ B | 40 ô, 1:15 | A B C D E | Taiko, Concert Bass Drum, Fast Strings ostinato 3-3-2, Contrabass, Shamisen (tỳ bà vê), Violin (nhị), Piccolo (sáo), Tremolo Strings, kit, Wood Block |
| `wild` | Vân Lam Sơn Mạch | Ngoài tông môn | 84, cung E | 48 ô, 2:17 | A B C D E F | Taisho Koto, Flute (sáo trúc), Slow Strings, Warm Pad, Cello, Melodic Tom (trống tay), Harp, Pan Flute |
| `forest` | Rừng Linh Thảo | Trong rừng | 80, vũ E / cung G | 40 ô, 2:00 | A B C D A' | Koto, Pan Flute, Pizzicato, Slow Strings, Wood Block, Crystal, Acoustic Bass |
| `lake` | Hồ Sương Mù | Ven hồ | 66, vũ C | 32 ô, 1:56 | A B C D | Halo Pad, Bowed Glass, Crystal (giọt nước), Koto, Fiddle (nhị vuốt kiểu đàn bầu), Cello, Timpani, Shakuhachi |
| `dungeon` | Kiếm Trủng | Bí cảnh, lòng chảo Kiếm Trủng | 70, vũ A | 32 ô, 1:50 | A B C D | Slow Strings drone, Bowed Glass, Church Bells, Koto thưa, Tubular Bells (lưỡi kiếm), Taiko, Tremolo Strings, Shakuhachi, Contrabass |
| `boss` | Hàn Giao | Giao chiến boss thế giới | 140, vũ G | 48 ô, 1:22 | A B C D E F | Taiko, Concert Bass Drum, Timpani, Fast Strings 16 nốt, Brass Section, Violin, Ice Rain (kim loại lạnh), Tremolo Strings, Shamisen, kit, Piccolo |
| `dungeon_boss` | Kiếm Trủng — Thủ Mộ | Đợt boss bí cảnh | 136, vũ F# | 48 ô, 1:25 | A B C D E F | Taiko, Melodic Tom, Agogo + Wood Block (bánh răng 3-3-2), Fast Strings, Fiddle, Tubular Bells, Shamisen, kit, Contrabass |
| `tribulation` | Độ Kiếp | Đang độ kiếp | 100, vũ D | 24 ô, 0:58 | A B C | Taiko, Concert Bass Drum, Timpani cuộn, Thunder, Tremolo Strings đi lên, Brass, Fast Strings, Piccolo, Contrabass, kit |
| `meditate` | Đả Tọa | Đang đả tọa | 60, cung A | 28 ô, 1:52 | A B C D | Warm Pad drone, Slow Strings, Tubular Bells (bát chuông), Stream (suối), Koto bồi âm, Harp, Shakuhachi |
| `title` | Đạp Thiên Lộ | Màn đăng nhập, màn tải | 70, cung D | 24 ô, 1:22 | A B C | Koto, Flute (chủ đề), Slow Strings, Warm Pad, Cello, Concert Bass Drum, Harp, Tubular Bells |
| `sting_levelup` | Tu Vi Tinh Tiến | Mình lên tầng (thay jingle SFX) | 96 | 3,7 s | — | Harp lướt, Koto, Glockenspiel, Slow Strings |
| `sting_breakthrough` | Trúc Cơ Thành | Mình đột phá/độ kiếp thành công (thay jingle SFX) | 80 | 8 s | — | Timpani cuộn, chũm chọe, Church Bells (chiêng), Fast Strings, Brass, Flute (motif `title`), Harp |
| `sting_death` | Thân Tử Đạo Tiêu | Mình tử vong (thêm vào tiếng ngã) | 60 | 6,8 s | — | Shakuhachi đi xuống, Church Bells trầm, Slow Strings, Koto |

Không có soundfont miễn phí nào có tiếng nhị, cổ cầm hay đàn bầu thật. Bản thay gần nhất: nhị dùng Violin/Fiddle có vuốt (pitch bend) và rung; cổ cầm/cổ tranh dùng Koto; tỳ bà vê dùng Shamisen lặp 1/8 phách; tiêu dùng Shakuhachi; sáo trúc dùng Flute/Piccolo/Pan Flute.

Số đo build 2026-11-15 (trên file webm trong game): mọi bài −16,0 LUFS, đỉnh thực −1,5…−5 dBTP, 0 mẫu clip, không có đoạn lặng giữa bài, chỉ số nối 0,3–1,4 (≤ 1 tốt, > 2 dễ nghe ra). Chromium giải mã webm ra đúng số mẫu của vòng (ví dụ `sect` 6.400.000 mẫu), không có lặng đầu/cuối. Tổng nhạc ≈ 19 MB (m4a). Riêng `title` phát ở màn đăng nhập/màn tải (sau thao tác đầu tiên) nên tính vào **tải đầu**: `pnpm size` xếp nó vào phần trước khi vào game (`PRE_GAME_MUSIC` trong `tools/perf/src/size.ts`), và bài này mã hóa bitrate thấp hơn (`"bitrate": { "webm": "64k", "m4a": "80k" }` trong `music.json`: 750 KB webm / 822 KB m4a). Tải đầu sau khi thêm: 2,09 MB / 30 MB. Các bài còn lại nạp dần sau khi vào game.

## 2b. Nhạc chiến đấu phân lớp (M4-13)

Ở ba vùng **sect, wild, dungeon** vào/ra giao tranh không đổi bài mà bật/tắt lớp: mỗi vùng có thêm hai stem cùng tempo, cùng khóa, cùng số ô nhịp và cùng phần A/B/C… với bài vùng (nên cùng độ dài vòng tới từng mẫu):

| Stem | Nội dung | Mức khi bật hết (LUFS riêng) |
| --- | --- | --- |
| `<vùng>` (nền) | bài vùng như cũ | −16 |
| `<vùng>_pulse` | trống chiến 3-3-2 (taiko, trống bass, trống tay ở wild), dây trầm ostinato, mõ gỗ, chũm chọe đầu phần | −23 (đỉnh ≤ −6 dBTP) |
| `<vùng>_edge` | dây vê dâng theo hợp âm, nhị đi câu ngắn gấp, nốt sáo cao đầu phần | −25 |

Soạn ở `tools/audio/compose/stems.mjs` (bảng `ZONES` sao chép hợp âm của bài vùng: đổi hợp âm bài vùng thì sửa cả hai). Khai báo ở `music.json` với `"stem": { "of": "<vùng>", "role": "pulse" | "edge" }`, `loop.mjs` ghi `stem` vào manifest. Stem mã hóa 64k/80k, nạp dần (≈ 7 MB webm cho cả sáu), không vào tải đầu.

**Mức giao chiến** (`MusicDirector.level`) và âm lượng lớp (`STEM_MIX` ở `musicDirector.ts`):

| Mức | Khi | nền | nhịp | căng |
| --- | --- | --- | --- | --- |
| 0 | yên | 1 | 0 | 0 |
| 1 | quái nhắm/đuổi mình (chưa đánh) | 1 | 0,6 | 0 |
| 2 | có đòn đánh thật trong 7 s qua (`ENGAGE_HOLD`) | 0,85 | 1 | 0,7 |
| 3 | boss | — | — | — |

Boss (`boss`, `dungeon_boss`) và độ kiếp vẫn đổi sang bài riêng (nhịp 136–140, khác tempo vùng), nên mức 3 chỉ để log. Rừng (80 BPM) và hồ (66 BPM) chưa có stem: vẫn crossfade sang `combat`.

Phát (`stemMusic.ts`): cả ba lớp là `AudioBufferSourceNode` `loop`, `start(cùng thời điểm ctx, cùng offset)` nên đồng bộ mẫu; lớp lên trong 0,35 s, xuống trong 3 s (`ATTACK`/`RELEASE`). Bài vùng stream bằng thẻ audio không đồng bộ mẫu được, nên khi stem nạp xong client **tiếp quản** bài đang phát: bắt đầu stem ở `currentTime` của thẻ audio rồi crossfade (sai pha cỡ vài chục ms, nghe như không). Trước lúc đó, hoặc khi thiếu/lỗi file (độ dài ba lớp lệch), vẫn là đường cũ: stream bài vùng và crossfade sang `combat`. Mỗi bộ chiếm khoảng 50 MB bộ nhớ giải mã cho mỗi lớp (150 MB một vùng), chỉ giữ bộ của vùng hiện tại.

Kiểm: `pnpm audio:test` (`tools/audio/stems.test.mjs`: ba lớp bằng nhau từng mẫu, độ to sau trộn mức 0/1/2 trong ±1,5 dB quanh −16 LUFS, đỉnh mẫu < 1 và đỉnh thực < 0 dBTP; bảng trộn đọc thẳng từ code client). Trong game: `__music.state().layers` (vùng, mức, âm lượng từng lớp, `stemPlaying`, `stemPos`) và `__music.layerLog`; log `[music] lớp …` khi đổi mức. Nghe thử: `node tools/audio/stems-preview.mjs <vùng> <file.mp3>` ra MP3 khám phá → bị nhắm → đánh → khám phá.

## 3. Sửa một bài

Mở `tools/audio/compose/<id>.mjs`. Mỗi bài là một hàm trả `Song`:

```js
const s = new Song({ id: 'sect', bpm: 72, bars: 40, seed: 72, reverb: { macro: 4, time: 92 } });
const D = new Scale('D4', 'gong');                    // ngũ cung: gong (cung), shang, jue, zhi, yu (vũ)
const xiao = s.track('xiao', { ch: 1, program: 77, vol: 92, pan: 0.1, reverb: 88 });
s.section('A', 0, 8).section('B', 8, 16) /* … */;     // ít nhất 3 phần, phần cuối kết ở ô cuối (test kiểm)
xiao.phrase(s.bar(8), D, '3:2 4:1 5:1 | 4~:3 3:1', { vel: 84, vib: 1.5 });
```

- **Giai điệu** (`phrase`): token `bậc:độ dài`, độ dài tính bằng phách (viết được `1/2`, `3/2`). `r:1` là lặng, `|` chỉ để dễ đọc. Hậu tố: `>` nhấn, `~` vuốt lên từ dưới một cung, `*` vê (tremolo), `'` ngắt, `#`/`b` thăng/giáng nửa cung.
- **Nốt lẻ, hợp âm, mẫu nhịp**: `note(phách, cao độ, độ dài, vel)`, `chord(phách, [cao độ…], độ dài, vel, rải)`, `pattern(từ, tới, bước, [vel…], cao độ)`.
- **Biểu cảm**: `swell(từ, tới, cc11 từ, cc11 tới)`, `slide`, `vibrato`, `bend`. Có `swell` thì trả CC11 về 127 trước cuối vòng (xem `combat.mjs`, `dungeon.mjs`) để chỗ nối không hụt âm lượng.
- **Nhạc cụ**: `program` theo số GM (0–127), `bank` để chọn biến thể (ví dụ `bank: 8, program: 116` là Concert Bass Drum, `bank: 8, program: 14` là Church Bells, `bank: 2, program: 122` là Thunder, `bank: 4, program: 122` là Stream). Kênh 9 là bộ trống (`program: 0` Standard: 49 crash, 52 chũm chọe Tàu, 57 crash 2).
- **Độ dài vòng**: `bars` × 4 phách. `music.json` có `maxLen` (giây) cho mỗi bài; test báo lỗi nếu vượt.
- Nhạc có humanize (lệch thời gian/lực nhẹ) theo `seed` cố định, nên build lại ra cùng bản.
- Bài mới: thêm script, thêm mục `"compose": true` trong `tools/audio/music.json`, thêm id vào máy trạng thái nếu là bài vùng/trạng thái.

Nghe nhanh một bài sau khi build: mở `../dtl-asset-source/audio/nhac/compose/<id>.wav`, hoặc trong game (`pnpm dev`, mở **không** có `?mute=1`) và gõ `__music.state()` trong console. `?music=<id>` (chỉ khi chạy dev) phát thẳng một bài sau thao tác đầu tiên.

## 4. Vòng lặp và hậu kỳ

`tools/audio/compose/render.mjs`:

1. Dựng dòng sự kiện MIDI (`Song.timeline`): một phách dạo đầu (GS reset, reverb, chọn nhạc cụ), rồi bài lặp 3 lần, rồi đuôi lặng. Nốt nào dài quá cuối vòng bị cắt đúng ở cuối vòng (đuôi ngân vẫn chảy sang vòng sau).
2. Render bằng spessasynth_core, **tự lập lịch theo mẫu**: chạy synth tới đúng mẫu của sự kiện rồi mới gửi, nên phần khô của các vòng giống nhau tới từng mẫu.
3. Lấy **vòng thứ hai**: đầu vòng đã có đuôi ngân/reverb của cuối vòng trước, đúng như khi phát lặp. Reverb GS có điều biến chạy tự do nên phần vang lệch chút ít giữa các vòng; vì vậy 0,2 s đầu vòng được trộn từ đầu vòng thứ ba (âm thanh nối tiếp thật của cuối vòng hai) sang chính đầu vòng hai. Mẫu đầu vòng liền mẫu cuối, và hai tín hiệu trộn gần như trùng nhau.
4. `loop.mjs`: đưa về gần −16 LUFS, **giới hạn đỉnh mềm** (`loopcore.limitPeaks`: nhìn trước 5 ms, nhả 120 ms, đường bao tính vòng tròn để đầu/cuối vòng khớp), rồi chuẩn hóa −16 LUFS / ≤ −1 dBTP như cũ, mã hóa Opus/WebM 96 kbps + AAC/M4A 128 kbps (đổi theo bài bằng `bitrate`). Bảng in thêm mức giới hạn đỉnh lớn nhất của mỗi bài.
5. Sting (`loop: false`): render một lần + đuôi, bỏ lặng cuối, fade 50 ms.

## 5. Giấy phép

- **Nhạc** (nốt, hợp âm, cấu trúc trong `tools/audio/compose/`): Claude soạn cho dự án, phát hành CC0-1.0.
- **Soundfont GeneralUser GS v2.0.3** của S. Christian Collins ([trang gốc](https://www.schristiancollins.com/generaluser.php), [repo](https://github.com/mrbumpy409/GeneralUser-GS), commit `684543d`), *GeneralUser GS License v2.0*: “You may use GeneralUser GS without restriction for your own music creation, private or commercial … Please feel free to use it in your software projects”. Game chỉ phân phối bản âm thanh đã render, không phân phối file soundfont.
- **Công cụ** (chỉ chạy lúc build, không vào game): spessasynth_core (Apache-2.0), ffmpeg-static (GPL-3.0, bản ffmpeg nhị phân).

`loop.mjs` tự ghi khối **Nhạc nền** trong `assets/LICENSES.md` và `credit` từng bài trong manifest (Cài đặt → Nguồn nhạc).

## 6. Suno (tùy chọn, nếu sau này có gói trả phí)

Đường hậu kỳ nhạc từ file vẫn còn: bỏ `"compose": true` của một bài, đặt `<id>.mp3` vào `../dtl-asset-source/audio/nhac/`, đặt `by`/`license`/`url` của Suno cho bài đó trong `music.json`, rồi `pnpm music:build --only <id> --preview`. `loop.mjs` dò nhịp và điểm vòng, crossfade, chuẩn hóa như trước. Prompt từng bài và cách chọn bản: `docs/audio/suno-prompts.md`.
