# DUN-1 — thiết kế lại các bí cảnh theo phong cách B (bước 3 "Ngũ Cảnh Thiên Địa")

Mỗi bí cảnh một bảng màu + một điểm nhìn "wow" hợp chủ đề, vật liệu PBR, giữ nguyên gameplay (vùng boss, đợt quái, cơ chế, va chạm, cổng vào/ra, kịch bản kiếp). Chia PR mỗi lần 1–2 bí cảnh.

| PR | Bí cảnh | Trạng thái |
| --- | --- | --- |
| 1 | Kiếm Trủng (`kiem_trung`) | đã merge (#327) |
| 2 | Phục Mạch Quật (`phuc_mach`) | PR này |
| tiếp | Kính Nguyệt, Thần Tàng, Kim Dạ Cung, Xích Tẫn Khích, Độ Kiếp (+ Bắc Hoang) | chưa làm |

## PR 1: Kiếm Trủng — nghĩa địa kiếm cổ

- **Bảng màu**: mood `kt` (một thời điểm cố định, `assets/palette.json`): xám lam thép lạnh, nắng trắng lạnh từ cao (sườn đá xa tối hơn sàn, không phủ sáng), cặn rỉ nâu đỏ, sương lạnh thấp (`heightFog`), `fogDensity` 0,0011. `moodVariant('kt') = 'kt'`.
- **Huyệt kiếm** (`buildSwordCaveShell`, `game/world/caveShell.ts`): vòm hang cao r 170 / h 110 (một draw call, màu theo đỉnh), vỉa tầng + nhũ đá, ô trời mở ở đỉnh. Bật bằng khối `cave` trong `kiem_trung.assets.json` + `kiemTrungArt: true`. Địa hình giữ nguyên (cao nguyên phẳng `KIEM_TRUNG`, r phẳng 78), vòm chỉ che chân trời nên không đổi đi lại/va chạm.
- **Đất**: bộ texture `terrain-slate` (Poly Haven CC0), màu đỉnh `ktGroundColor` (đá xám lam, mảng tro, vệt rỉ dày dần ra vành, sàn đài chiến sẫm), `setGroundNoSnow` (không phủ tuyết ở đỉnh), vách `setGroundRedStrata` tông xám lam tối.
- **Cảnh dựng bằng Blender** `arch_kiem_trung` (`tools/blender/kiem_trung_arch.py`, bộ dựng tông môn + kit, texture thủ tục; gốc = tâm đài chiến, mỗi vật một object `kt_*` gốc ở chân, client `loadKtModel` hạ y theo `heightAt` rồi gộp mọi vật cùng lưới+vật liệu thành `InstancedMesh`, ~75 draw call): 
  - cự kiếm (4 biến thể, 18 thanh cao 14–62 m): lưỡi có sống, rãnh máu, mẻ/rỉ, phù văn xanh đứt đoạn (vật liệu `rune` phát sáng dưới ngưỡng bloom), tấm chắn ngang cong nhẹ kiểu kiếm cổ, chuôi quấn xích + vòng đồng, dải bùa chú treo, đầu chuôi vân mây; phù văn là các nét mảnh đứt đoạn chạy dọc lưỡi; chân cắm vào khối đá nứt vỡ, đất trồi, khe nứt có khí lam; bản gãy có mảnh lưỡi rơi bên chân;
  - vành 70 cụm trụ đá karst (`karst`: 3–5 trụ thẳng đứng sắc cạnh cao thấp khác nhau, thớ dọc, đỉnh vát, ba lớp xa dần ngả lam nhạt) thay cho chân trời phẳng; đá dùng texture `stone` PBR chiếu hộp theo mặt (giống vách Đoạn Mạch);
  - 44 gò mộ đất nâu xám (vật liệu `earth`, không texture, váng đất loe ra lẫn vào nền) phủ cỏ khô thưa, bia nghiêng + kiếm cắm + hương tàn, 20 bia, 16 cột gãy (kèm đoạn đổ), 4 bậc đá vỡ, 44 đống xương (lồng ngực, sọ, giáo gãy), 36 bộ giáp vụn (mũ, khiên, giáp lá), 70 cụm mảnh kiếm vụn trên sàn đài chiến, vòng 8 kiếm trận nhỏ phát khí quanh đài chiến;
  - tất cả chừa khu giữa r < 30 và lối vào, không va chạm.
- **Cảnh thủ tục** `game/world/kiemTrungArt.ts` (cờ `kiemTrungArt`): ~1.160 kiếm nhỏ cắm đất (2 `InstancedMesh`), kiếm trận khắc sàn (canvas, độ đục 0,34), 34 khe nứt lõm (shader theo ngang khe: đáy ánh lam mềm nhấp nháy, vách tối dần, gờ đá xám mảnh ở mép, mép ngoài tan mềm, không viền đen; bám địa hình, có cả trong đài chiến), ba bậc thềm đá viền vòng trận (gờ rất thấp 0,035/0,07/0,105 m ở r≈57–61,5, chỉ để nhìn, chừa khe ở lối vào phía nam), sương lạnh thấp đọng quanh vành (đĩa TSL, trong suốt ở đài chiến), `ktGroundColor` có mảng rêu, đất đỏ rỉ, ánh lam quanh vòng trận.
- **Gỡ**: kiến trúc tông môn và đảo bay Lạc Kiếm (`sect`, `arch_sect`, `lacKiemSky`) không còn dựng trong bí cảnh (không ai thấy được từ đây, tốn ~1M tam giác).
- **Ngân sách (preset Cao, `--perf 1`)**: ~240 draw call, ~0,93–0,98M tam giác (trước: 105–111 draw call, ~1,41M), khung ~8,4 ms (headless). File `arch_kiem_trung` ~9 MB (nạp lười khi vào bí cảnh).
- **Chụp**: kịch bản mới `pnpm shots dungeonart --level <id> --out <thư mục tuyệt đối> [--tag truoc|sau] [--sizes 720p,1080p] [--views a,b] [--battle 1] [--perf 1] [--video 1]`: các điểm nhìn của level (bảng `VIEWS` trong `tools/perf/src/scenarios/dungeonart.ts`, level chưa khai báo dùng bộ chung), cảnh chiến đấu boss (`--battle 1`: gọi boss cuối bằng GM, vạch báo + pha cuối), video đi một lượt. Ảnh/video để ở artifact phiên, không commit.

## Chưa làm / ghi chú

- Chưa dùng bộ đồ trang trí PROP-1 (chưa merge). Mỏm đá còn hơi "quân cờ" (chồng phiến), có thể thay bằng sculpt chi tiết hơn.
- Ô trời mở là màu đỉnh, chưa có mặt trăng/mây thật; chùm tia sáng đã đủ gợi.
- Tông ngoài sảnh giữ cho phiên bản sau: đài chiến vẫn là cao nguyên Vân Lam cũ (chỉ đổi màu/texture), chưa dựng vành đá bao.

- Vết đen loang dưới chân nhân vật ở ảnh duyệt trước là **vết mực chết của quái** (tính năng game, `render/vfx/ink.ts`, tan sau 11 s), do kịch bản chụp gọi `killall` rồi chụp ngay; `dungeonart` nay chờ 11,5 s cho vết tan trước khi chụp.
- Cổng ra Kiếm Trủng: đĩa vàng đứng cũ (cháy sáng) thay bằng vòng trận phẳng mờ (`gatesToDraw`) + vòng hoa văn viền kép/16 nét triện cộng sáng 0,5 + 36 hạt linh quang bay lên (`addExitRing`); vị trí và bán kính tương tác không đổi.

## PR 2: Phục Mạch Quật — hầm mỏ cũ của Tàng Mạch Hội

- **Bảng màu**: mood `pm` (đất son nâu tối + nắng đèn ấm từ cao + sương bụi nâu, highlight lục lam mạch tinh), một thời điểm cố định. Đất `terrain-slate` (đá phiến nứt) nhuộm nâu đỏ bởi `pmGroundColor`, vách `setGroundRedStrata` tông nâu đỏ sẫm, không phủ tuyết.
- **Vòm hầm** `buildMineCaveShell` (r 135 / h 75, ngoài vùng đi lại `bound` 90): sa thạch phân tầng ngang, nhũ đá sa xuống, ánh hắt ấm ở chân vách, mạch tinh lục lam uốn mảnh; `cave` + `phucMachArt: true` trong `phuc_mach.assets.json`. Địa hình/va chạm/cổng/boss/đợt quái giữ nguyên.
- **GLB Blender** `arch_phuc_mach` (`tools/blender/phuc_mach_arch.py`, dựng trên bộ của Kiếm Trủng; client `loadPmModel` → `loadDungeonModel`, gộp `InstancedMesh`): 10 cụm mạch tinh khổng lồ cao 16–50 m (lăng trụ lục giác, mặt xen kẽ phát sáng lục / kính sẫm), 68 cột sa thạch ba lớp (karst ngả nâu), 5 cửa hầm khung gỗ có hốc đen + ray + xe quặng, ~15 khung chống gỗ (một hàng dọc lối vào có đèn treo), đống quặng (cuốc cắm), thùng/dây thừng, mạch tinh nhỏ, xương thợ mỏ, 70 nhũ đá và 16 cụm mạch tinh treo trần (object `pm_ceil_*` đặt theo độ cao vòm).
- **Thủ tục** `game/world/phucMachArt.ts`: mạng mạch tinh khắc sàn đài chiến (canvas, phân nhánh, vòng mảnh, độ đục 0,4), và `DungeonFx` dùng chung (khe nứt lõm ánh lục, bụi hầm, vòng trận cổng ra có hạt, màu lục).
- **`DungeonFx`** (`game/world/dungeonFx.ts`, tách từ Kiếm Trủng): khe nứt nay có mặt cắt thật — gờ đá nổi hai bên (0,2 m) bắt nắng, lòng khe tối, đáy phát sáng mềm — nên khi nhìn gần không còn là dải phẳng (góp ý duyệt PR1); Kiếm Trủng dùng lại.
- **Ngân sách (preset Cao)**: ~250 draw call, ~0,72M tam giác (trước 69 draw call / 0,34M). File `arch_phuc_mach` ~8 MB (nạp lười).
- **Chụp**: `pnpm shots dungeonart --level phuc_mach ...` (bảng `VIEWS` có 6 điểm riêng). Kịch bản nay chờ 1,5 s trước khi bấm E ở cổng (vào bí cảnh qua cổng thật từ Đoạn Mạch).

### PR 2 vòng 2 (góp ý duyệt): hầm kín, tinh thể, khe nứt lõm, đường ray

- **Hầm kín**: 40 đoạn vách hang liền khối (`cave_wall`, tầng phiến sa thạch nhô lệch, khe tối giữa tầng) quanh r≈114 + phiến đá trần treo + nhũ đá; ba khe hở trên trần (`PM_OCULI`) rọi tia sáng ấm (nón cộng sáng, mờ dần xuống nền) và vũng sáng ấm trên nền; dưới mỗi đèn đá có vũng sáng (đèn mỏ); vùng xa tối dần (`fogDensity` 0,0021, `HAZE` tối). Vách/trần/nhũ không đổ bóng (nếu đổ bóng thì nắng của đèn trời bị chặn, sàn tối đen).
- **Tinh thể**: lăng trụ 7 vòng thu về mũi nhọn, màu đỉnh là gradient chân tối → lõi sáng; vật liệu client `pmMaterialFor` (emissive theo màu đỉnh + fresnel viền; mặt "kính" sẫm chỉ bắt viền), 7–12 tinh thể mỗi cụm cao thấp/dày mảnh khác nhau + 22 mảnh vụn quanh gốc; cụm nhỏ co giãn 0,5–2,0×.
- **Khe nứt lõm** (`DungeonFx`): hẹp lại (nửa rộng 0,14 + 0,3 m), chỉ đặt r 60–104, và mờ dần theo khoảng cách tới camera (14→34 m) nên không bao giờ thành dải to cắt khung hình (ảnh boss). Nguyên nhân dải lơ lửng: khe phía nam nằm ngay sau camera. Kịch bản chụp có `--hide <tên,tên>` để ẩn đối tượng cảnh khi dò lỗi hình.
- **Đường ray và đồ mỏ**: vòng ray r=72 (31 đoạn) nối các cửa hầm, 5 giá tời (khung chữ A, trống quấn dây, ròng rọc, thùng treo), 6 xe goòng trên ray, 46 cột chống gỗ dọc chân vách, đống quặng + thùng + xe; bỏ hàng khung gỗ chắn lối vào (camera sau lưng người chơi bị che).
- **Ngân sách (preset Cao)**: ~250 draw call, ~1,06M tam giác; file `arch_phuc_mach` ~10 MB.
- **Còn lại**: đống quặng còn tròn trịa như nấm đất; mạng mạch sàn hơi rộng; vách mới là phiến tròn xếp tầng (chưa triplanar).
