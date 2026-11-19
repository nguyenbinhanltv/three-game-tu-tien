# DUN-1 — thiết kế lại các bí cảnh theo phong cách B (bước 3 "Ngũ Cảnh Thiên Địa")

Mỗi bí cảnh một bảng màu + một điểm nhìn "wow" hợp chủ đề, vật liệu PBR, giữ nguyên gameplay (vùng boss, đợt quái, cơ chế, va chạm, cổng vào/ra, kịch bản kiếp). Chia PR mỗi lần 1–2 bí cảnh.

| PR | Bí cảnh | Trạng thái |
| --- | --- | --- |
| 1 | Kiếm Trủng (`kiem_trung`) | PR này |
| tiếp | Phục Mạch, Kính Nguyệt, Thần Tàng, Kim Dạ Cung, Xích Tẫn Khích, Độ Kiếp (+ Bắc Hoang) | chưa làm |

## PR 1: Kiếm Trủng — nghĩa địa kiếm cổ

- **Bảng màu**: mood `kt` (một thời điểm cố định, `assets/palette.json`): xám lam thép lạnh, nắng trắng lạnh từ cao (sườn đá xa tối hơn sàn, không phủ sáng), cặn rỉ nâu đỏ, sương lạnh thấp (`heightFog`), `fogDensity` 0,0011. `moodVariant('kt') = 'kt'`.
- **Huyệt kiếm** (`buildSwordCaveShell`, `game/world/caveShell.ts`): vòm hang cao r 170 / h 110 (một draw call, màu theo đỉnh), vỉa tầng + nhũ đá, ô trời mở ở đỉnh. Bật bằng khối `cave` trong `kiem_trung.assets.json` + `kiemTrungArt: true`. Địa hình giữ nguyên (cao nguyên phẳng `KIEM_TRUNG`, r phẳng 78), vòm chỉ che chân trời nên không đổi đi lại/va chạm.
- **Đất**: bộ texture `terrain-slate` (Poly Haven CC0), màu đỉnh `ktGroundColor` (đá xám lam, mảng tro, vệt rỉ dày dần ra vành, sàn đài chiến sẫm), `setGroundNoSnow` (không phủ tuyết ở đỉnh), vách `setGroundRedStrata` tông xám lam tối.
- **Cảnh dựng bằng Blender** `arch_kiem_trung` (`tools/blender/kiem_trung_arch.py`, bộ dựng tông môn + kit, texture thủ tục; gốc = tâm đài chiến, mỗi vật một object `kt_*` gốc ở chân, client `loadKtModel` hạ y theo `heightAt` rồi gộp mọi vật cùng lưới+vật liệu thành `InstancedMesh`, ~75 draw call): 
  - cự kiếm (4 biến thể, 18 thanh cao 14–62 m): lưỡi có sống, rãnh máu, mẻ/rỉ, phù văn xanh đứt đoạn (vật liệu `rune` phát sáng dưới ngưỡng bloom), tấm chắn ngang cong nhẹ kiểu kiếm cổ, chuôi quấn xích + vòng đồng, dải bùa chú treo, đầu chuôi vân mây; phù văn là các nét mảnh đứt đoạn chạy dọc lưỡi; chân cắm vào khối đá nứt vỡ, đất trồi, khe nứt có khí lam; bản gãy có mảnh lưỡi rơi bên chân;
  - vành 70 cụm trụ đá karst (`karst`: 3–5 trụ thẳng đứng sắc cạnh cao thấp khác nhau, thớ dọc, đỉnh vát, ba lớp xa dần ngả lam nhạt) thay cho chân trời phẳng; đá dùng texture `stone` PBR chiếu hộp theo mặt (giống vách Đoạn Mạch);
  - 44 gò mộ đất nâu xám (vật liệu `earth`, không texture, váng đất loe ra lẫn vào nền) phủ cỏ khô thưa, bia nghiêng + kiếm cắm + hương tàn, 20 bia, 16 cột gãy (kèm đoạn đổ), 4 bậc đá vỡ, 44 đống xương (lồng ngực, sọ, giáo gãy), 36 bộ giáp vụn (mũ, khiên, giáp lá), 70 cụm mảnh kiếm vụn trên sàn đài chiến, vòng 8 kiếm trận nhỏ phát khí quanh đài chiến;
  - tất cả chừa khu giữa r < 30 và lối vào, không va chạm.
- **Cảnh thủ tục** `game/world/kiemTrungArt.ts` (cờ `kiemTrungArt`): ~1.160 kiếm nhỏ cắm đất (2 `InstancedMesh`), kiếm trận khắc sàn (canvas, độ đục 0,34), 34 khe nứt lõm (shader theo ngang khe: đáy ánh lam mềm nhấp nháy, vách tối dần, gờ đá xám mảnh ở mép, mép ngoài tan mềm, không viền đen; bám địa hình, có cả trong đài chiến), ba bậc thềm đá viền vòng trận (gờ thấp 0,12/0,24/0,36 m ở r≈57–61, không cản), sương lạnh thấp đọng quanh vành (đĩa TSL, trong suốt ở đài chiến), `ktGroundColor` có mảng rêu, đất đỏ rỉ, ánh lam quanh vòng trận.
- **Gỡ**: kiến trúc tông môn và đảo bay Lạc Kiếm (`sect`, `arch_sect`, `lacKiemSky`) không còn dựng trong bí cảnh (không ai thấy được từ đây, tốn ~1M tam giác).
- **Ngân sách (preset Cao, `--perf 1`)**: ~240 draw call, ~0,93–0,98M tam giác (trước: 105–111 draw call, ~1,41M), khung ~8,4 ms (headless). File `arch_kiem_trung` ~9 MB (nạp lười khi vào bí cảnh).
- **Chụp**: kịch bản mới `pnpm shots dungeonart --level <id> --out <thư mục tuyệt đối> [--tag truoc|sau] [--sizes 720p,1080p] [--views a,b] [--battle 1] [--perf 1] [--video 1]`: các điểm nhìn của level (bảng `VIEWS` trong `tools/perf/src/scenarios/dungeonart.ts`, level chưa khai báo dùng bộ chung), cảnh chiến đấu boss (`--battle 1`: gọi boss cuối bằng GM, vạch báo + pha cuối), video đi một lượt. Ảnh/video để ở artifact phiên, không commit.

## Chưa làm / ghi chú

- Chưa dùng bộ đồ trang trí PROP-1 (chưa merge). Mỏm đá còn hơi "quân cờ" (chồng phiến), có thể thay bằng sculpt chi tiết hơn.
- Ô trời mở là màu đỉnh, chưa có mặt trăng/mây thật; chùm tia sáng đã đủ gợi.
- Tông ngoài sảnh giữ cho phiên bản sau: đài chiến vẫn là cao nguyên Vân Lam cũ (chỉ đổi màu/texture), chưa dựng vành đá bao.

- Vết đen loang dưới chân nhân vật ở ảnh duyệt trước là **vết mực chết của quái** (tính năng game, `render/vfx/ink.ts`, tan sau 11 s), do kịch bản chụp gọi `killall` rồi chụp ngay; `dungeonart` nay chờ 11,5 s cho vết tan trước khi chụp.
- Cổng ra Kiếm Trủng: đĩa vàng đứng cũ (cháy sáng) thay bằng vòng trận phẳng mờ (`gatesToDraw`) + vòng hoa văn viền kép/16 nét triện cộng sáng 0,5 + 36 hạt linh quang bay lên (`addExitRing`); vị trí và bán kính tương tác không đổi.
