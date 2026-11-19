# DUN-1 — thiết kế lại các bí cảnh theo phong cách B (bước 3 "Ngũ Cảnh Thiên Địa")

Mỗi bí cảnh một bảng màu + một điểm nhìn "wow" hợp chủ đề, vật liệu PBR, giữ nguyên gameplay (vùng boss, đợt quái, cơ chế, va chạm, cổng vào/ra, kịch bản kiếp). Chia PR mỗi lần 1–2 bí cảnh.

| PR | Bí cảnh | Trạng thái |
| --- | --- | --- |
| 1 | Kiếm Trủng (`kiem_trung`) | đã merge (#327) |
| 2 | Phục Mạch Quật (`phuc_mach`) | đã duyệt hình (#328) |
| 3 | Kính Nguyệt Cung (`kinh_nguyet`) | đã duyệt hình (#330) |
| 4 | Thần Tàng Điện (`than_tang`) | đã duyệt hình (#336) |
| 5 | Kim Dạ Cung (`kim_da_cung`) | đã duyệt hình (#341) |
| 6 | Xích Tẫn Khích (`xich_tan_khich`) | PR này |
| tiếp | Độ Kiếp (+ Bắc Hoang) | chưa làm |

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

## PR 3: Kính Nguyệt Cung — điện gương trăng bạc

- **Bảng màu** `kn` (chàm sâu, trăng bạc lạnh, một thời điểm cố định). Vòm `buildMoonDomeShell` (r 135 / h 80, ngoài vùng đi lại 90): chàm tối dần lên cao, trăng sáng + quầng ở phía bắc cao ~50°, 520 sao li ti (`Points` cộng sáng), quầng quanh hai khe hở trần; hai tia trăng rọi qua khe hở.
- **Sàn gương** (`buildMirrorFloorKn`, shader TSL, thay sàn canvas cũ): nền chàm đen, vệt phản chiếu trăng kéo dài (lệch theo gợn), gợn nước nhiễu trôi, khảm bạc (hai vòng quanh đài chiến r 57/59,5, vòng r 20 và r 40, 9 cánh hoa); đĩa r 112 bám địa hình (phẳng ±3 m).
- **GLB Blender** `arch_kinh_nguyet` (`tools/blender/kinh_nguyet_arch.py`, dựng trên bộ Kiếm Trủng; client `loadKnModel` → `loadDungeonModel`): 17 nhịp hàng cột ngọc sáo + đầu cột cánh sen + vòm nhọn + khung bạc + gương treo (r 100, cao ~44), vòng gương trăng khổng lồ phía bắc (đường kính 26 m trên bệ bậc), 34 mảnh gương cắm nghiêng + 44 mảnh lơ lửng, 48 dây chuông gương treo trần, 70 cụm mảnh gương vỡ, 2 chậu sen. Vật liệu gương `knMaterialFor`: phát sáng theo màu đỉnh (vệt chéo) + fresnel viền.
- `DungeonFx` dùng lại (sương bạc thấp). Sàn/hall/vỏ cũ của cung gương (`buildMirrorFloor`, `buildPalaceHall`) chỉ còn dùng cho Thần Tàng.
- **Ngân sách (preset Cao)**: ~110 draw call, ~0,39M tam giác (trước 61 / 0,29M). File `arch_kinh_nguyet` ~6 MB.
- **Còn lại**: gương còn giống tinh thể phẳng xanh (chưa có phản chiếu giả theo hướng nhìn); tổng thể còn một tông xanh chàm, thiếu điểm ấm; hàng cột còn lộ phần cột texture gạch đá.

### PR 3 vòng 2 (góp ý duyệt): bỏ navy phẳng, cung điện bạc trắng

- **Bảng màu** `kn` đổi sang bạc/trắng ngà/lam nhạt, độ bão hòa 0,62, sương xám lam; không phủ navy toàn khung.
- **Bầu trời** (`skyColor`, hàm TSL dùng chung): chân trời bạc xám → thiên đỉnh chàm, trăng tròn lớn + quầng ở phía bắc (cao ~29° từ tâm), mây mỏng trôi chậm, sao. Cả vòm, sàn, hồ và gương đều dùng hàm này.
- **Sàn cẩm thạch** (`reflectiveSurface('marble')`): vân đá (nhiễu), nhám thấp, soi bầu trời theo Fresnel (hướng phản xạ lật qua mặt phẳng ngang) — là phản chiếu bầu trời, không phản chiếu vật thể (không SSR/planar); vũng sáng trăng; tối dần ra góc. **Vòng trận mảnh**: vạch bạc 0,16 m + quầng mềm, 72 vạch chia, 9 cánh hoa mảnh. Ba **hồ nước tĩnh** (`buildPond`) soi bầu trời + gợn.
- **Gương** (`knMaterialFor`): phản chiếu bầu trời theo pháp tuyến lắc nhẹ (gương đồng mài tay) + vệt sáng chéo theo toạ độ thế giới + fresnel; khung bạc, hoa văn mây cuộn và trăng khuyết trên vòm; mảnh gương vỡ có cạnh nhọn (6–8 cạnh, gai xen kẽ).
- **Tường/hàng cột** ngọc trắng xám (vật liệu `jade` có texture cẩm thạch), tường sau + trụ ốp + gờ, mái cong ngói lam bạc (hai đầu vút), rèm lụa bạc có nếp sóng. Cột thấp lại (24 m + vòm 10 m) để thấy bầu trời trên mái.
- **Bỏ đá trôi xám đen** (`prop_da_troi`) khỏi cảnh Kính Nguyệt (lọc ở `levelLoad`, prop chỉ để nhìn).
- **Còn lại**: gương chưa phản chiếu vật thể thật (chỉ bầu trời); tường còn khá phẳng/đơn điệu; chưa thấy rõ trăng và mây từ góc nhìn chiến đấu (bị mái che); tương phản sáng-tối mới ở vũng sáng và góc tối của sàn.

### PR 3 vòng 3 (góp ý duyệt): mở trời, sàn phản chiếu gương, điểm nóng vàng

- **Sửa lỗi hướng nhịp cột**: mọi nhịp (gương, rèm, đèn, huy hiệu) trước đây quay lưng vào tâm nên chỉ thấy mặt sau tường; nay quay mặt vào trong. Hàng cột thấp lại (17 m + vòm 8 m) để thấy bầu trời và trăng trên mái; trăng hạ xuống ngay trên vòng gương.
- **Sàn phản chiếu**: ngoài soi bầu trời, sàn và hồ nước còn soi **vòng gương trăng** (cắt tia phản xạ với mặt phẳng z = −92, trúng đĩa/vành thì lấy màu gương bạc có vệt sáng + vành vàng nhạt); trăng trong phản chiếu giảm còn 35%.
- **Điểm nóng màu**: đèn cung vàng ấm (vật liệu `lamp` phát sáng) treo hai bên mỗi vòm, quầng đèn đá vàng ấm (0xffc47a) thay xanh lạnh, viền vàng nhạt trên cột (4 vòng), huy hiệu trăng-mây ở vai vòm, tua vàng chân rèm lụa bạc, vành vàng quanh vòng gương trăng.
- **Khung gương**: khung bạc/đồng mảnh (0,07 m) bằng vật liệu `frame` (phát sáng nhẹ) thay nét đen dày; mặt bên mảnh vỡ sáng bạc.
- **Tia trăng volumetric nhẹ** từ hai khe hở trần (mờ, mép mềm); vũng sáng trăng ở tâm trận làm bằng shader sàn (nón volumetric ở giữa bị cắt cạnh khi nhìn từ trên xuống nên không dùng).
- **Còn lại**: phản chiếu vòng gương trên sàn đọc như một vòng sáng khá rõ; tường vẫn chưa có phù điêu mây-trăng lớn (chỉ huy hiệu nhỏ); rèm lụa còn hơi răng cưa ở nếp.

## PR 4: Thần Tàng Điện — điện tàng cổ đen tím nạm vàng

- **Bảng màu** `tt` (đen tím + vàng nhạt, exposure 0,85, bão hòa 0,88, một thời điểm). Vòm nan vàng `buildVaultDome` (shader TSL: 16 nan, 4 vành, ô hộp tối, giếng sáng vàng ở đỉnh, tối ở chân vòm).
- **Sàn obsidian khảm vàng** `buildVaultFloor` (shader TSL, bám `heightAt + 0,08`): vân đá, soi tím vàng theo Fresnel, bốn vòng vàng mảnh (r 20/46/64/90), sao tám cánh trong r 20, **ba đường vàng toả ra đúng ba hướng cửa phong ấn** (200°/270°/340°), vũng sáng vàng ở tâm và trước ba điểm chạm cửa; tối dần ra góc.
- **GLB Blender** `arch_than_tang` (`tools/blender/than_tang_arch.py`; nhịp tường quay vào trong, `yaw = a + π/2`): 16 nhịp tường (cột sáo cẩm thạch đen tím đai vàng, hốc vòm viền vàng có đèn dầu, diềm vàng, mái cong, hai phướn tím thêu vàng có mặt nạ trống), **ba cửa phong ấn khổng lồ** (khung đá, lanh tô vòm, đĩa ấn vàng nhiều vòng + tám nan + chữ phát sáng tím, xích) ở r 76 đúng ba hướng `seals.doors`, mặt nạ vô diện khổng lồ phía bắc, 13 tượng võ sĩ không mặt cầm đại kiếm (hai hàng dọc lối vào + vành), 18 đống kim ngân + rương + bình ngọc tím, 7 đèn chùm vàng treo trần. Bỏ vòng cột đá khắc vân cũ (r 76–80) đè lên cửa; tượng võ sĩ và bia đá canh cửa có sẵn (props) giữ nguyên.
- `DungeonFx`: sương tím vàng thấp. Sàn/hall cũ của cung gương không còn dùng ở bí cảnh này.
- **Ngân sách (preset Cao)**: ~120 draw call, ~0,44M tam giác.
- **Còn lại**: tượng võ sĩ còn thô (khối), đống kim ngân phẳng một màu vàng, tấm cửa phong ấn đen phẳng, vạch báo boss tím trên sàn tím kém tương phản (vạch báo là của game, không đổi); chưa khai báo va chạm cho vật rắn (đợi API COL-1).

### PR 4 vòng 2 (góp ý duyệt): bỏ sàn tím phẳng, vàng PBR, tượng chạm khắc, chiều sâu ánh sáng

- **Sàn đá đen bóng**: nền gần đen, vân tím + vân vàng mảnh (ba họ vân), vết mòn (xước dài + mảng nhám), phản chiếu ấm vàng quanh vũng sáng và lạnh tím ở xa theo Fresnel; vòng trận **mảnh** (0,06–0,1 m) phát sáng vàng mềm, vạch chia nhỏ, chấm, sao tám cánh, ba đường có hạt dọc tới ba cửa; vũng sáng dưới 11 lư lửa, ở tâm và trước ba cửa; góc tối thật (tối dần từ r 26).
- **Vàng PBR cổ** (`ttMaterialFor` thay `arch_sect_gold`): metalness 1, roughness 0,3 (tăng ở rãnh khắc), loang theo vị trí, khắc chìm hai họ đường, phản chiếu môi trường giả (tím sẫm ↔ vàng ấm) + viền Fresnel. Áp cho mọi vật vàng (bánh xe pháp luân, khung, đai, kim ngân).
- **Thần tướng chạm khắc** (viết lại `statue`): bệ ba tầng có dải phù văn tím phát sáng, giáp ống + che gối, váy giáp năm tấm, ngực giáp có sống vàng + đai khóa, giáp vai ba lớp có gai, ống tay đai vàng, mũ trụ liền mặt nạ trơn có mào vàng + hai sừng cong, áo choàng, đại kiếm có rãnh phù văn, chắn vàng đầu thú.
- **Kim ngân**: gò tiền khắc, thỏi vàng xếp chồng, chén, ngọc đỏ/tím/lục, rương đai vàng, cuộn lụa. **Lư lửa** đồng vàng ba chân với ngọn lửa tím-vàng (14 cái vòng r 90). **Tường**: dải huy chương tròn khắc hoa sen, tấm ốp phù điêu hai bên hốc, chuỗi đèn lồng giăng giữa cột, đinh tán và viền khung trên cửa phong ấn.
- **Ánh sáng**: ba tia sáng vàng nhạt từ giếng sáng vòm, sương tím thấp đậm hơn, exposure 0,82.
- **Ngân sách (preset Cao)**: ~158 draw call, ~0,85M tam giác.
- **Còn lại**: tượng vẫn thô ở độ phân giải khối (chưa có normal map hoa văn thật); bệ tượng nhìn từ trên còn "bàn cờ" vàng; vòng trận r 64 vạch chia còn đọc như đoạn rời ở góc nhìn lướt; sàn vẫn thiên tím xanh ở vùng xa.

### PR 4 vòng 3 (review code): vạch báo boss đọc rõ trên sàn

- Sàn trong vùng đánh (r < ~64, chuyển dần tới r 72) đổi sang **đá xám đen ánh vàng ấm**, sáng hơn (nền 0,075–0,15 thay 0,008–0,026), gần như bỏ vân tím; vành ngoài giữ đen tím. Không đổi vạch báo của game.
- Kiểm bằng `pnpm shots dungeonart --level than_tang --battle 1 --perf 1`: ảnh `90-boss-chieu` và `91-boss-pha-cuoi` (1080p). **Kết quả**: vạch báo tím/hồng (hình quạt, vòng chữ triện) nay tách rõ khỏi nền xám ấm — mép, vành chữ và các dải đồng tâm đều đọc được, không còn chìm vào nền tím như trước. Hạn chế: bloom/sương tím của hậu kỳ vẫn ngả nền hơi hồng-tím nên độ tương phản màu (không phải độ sáng) chưa tối đa; nền vẫn thiên lạnh ở các góc xa trong vùng đánh.

## PR 6: Xích Tẫn Khích — hẻm núi lửa tàn đỏ-đen (áp chuẩn từ vòng 1)

- **Bảng màu** `xk` (mặt trời đỏ cam thấp ~34°, trời khói nâu xám, sương tro; bão hòa 0,78, exposure 0,95). Màu đất `xichGroundColor` viết lại: bazan đen ấm + mảng tro xám + đất nung gạch ở gần vết nứt, vách bazan đen có tầng gỉ đỏ; **không còn tím**.
- **Vết nứt dung nham LÕM** thay màn đỏ dày của `riftVeil` (`levelLoad.buildXich` bỏ veil khi `xichTanArt`): ba đường chính (`xichCracks`) + 16 khe nhánh, nửa rộng 0,3–0,9 m, gờ đá nổi hai bên bắt sáng, đáy than hồng nhấp nháy mềm; mờ dần theo khoảng cách camera (24→52 m) nên không thành dải chắn khung hình. `DungeonFx` nay nhận `cracks.paths` (đường cho trước) và `cracks.fade`.
- **GLB Blender** `arch_xich_tan` (`tools/blender/xich_tan_arch.py`): 17 cụm cột bazan lục giác (7–11 cột cao 3–11 m, đỉnh vát, khe than hồng ở chân và dọc khe), 22 cụm obsidian nhọn, 16 mảng vỏ dung nham nguội nứt (phiến đen, khe nung đỏ), 9 miệng phun than, 14 cây cháy xém, 8 cột cờ gãy cờ đỏ rách, 14 đống xương + mũ giáp + khiên, 8 lò sắt than hồng (quầng `createLanternHalos`). Chừa quanh bia giữ, ba khe mạch và lối nam. Mỗi vật đặt theo `heightAt` tại chỗ.
- Giữ nguyên: bia giữ, ba khe mạch ngọc lam (đúng chỗ khe của boss cuối), quầng than hồng, ngọn lửa trên cột prop, hạt tro, địa hình `canyon`.
- **Kiểm tra vạch báo**: `pnpm shots dungeonart --level xich_tan_khich --battle 1` — vạch tím/hồng của boss đọc rõ trên nền nâu đen (ảnh `90-boss-chieu`).
- **Ngân sách (preset Cao)**: ~157 draw call, ~0,48M tam giác (trước 70 / 0,33M).
- **Còn lại**: mặt đất vẫn là texture `terrain-ash` ngả nâu đỏ như rơm (chưa có bộ texture đá bazan riêng); mảng vỏ dung nham còn hình "hoa" tỏa khe; cột bazan còn sắc cạnh một khối; quầng sáng lớn ở góc dưới ảnh boss là quầng ngọn lửa cột prop cũ (không đổi); chưa va chạm (đợi COL-1).
## PR 5: Kim Dạ Cung — cung dát vàng đêm lồng đèn (áp chuẩn từ vòng 1)

- **Bảng màu** `kd` (đen than ấm + vàng đồng + cam đèn lồng, bão hòa 0,82, exposure 0,9; KHÔNG tím). Trời đêm vàng (`buildGildedSky`/`goldenSky`): chân trời hổ phách tối, trăng vàng nhạt lớn + quầng, mây hổ phách, sao.
- **Sàn đá bazan đen bóng** (`buildGildedFloor`, shader TSL, bám `heightAt + 0,08`): nền đen ấm trung tính, vân nâu vàng mảnh, xước + mảng mòn; **vùng đánh (r < ~64) sáng hơn, xám ấm** để vạch báo của game đọc rõ (ảnh boss kiểm: vạch tím/hồng tách rõ khỏi nền); khảm vàng MẢNH (0,06–0,1 m) phát sáng mềm: 4 vòng, vạch chia, hoa sen 16 cánh, tia mảnh; vũng sáng ấm dưới mỗi cột đèn, bốn đèn đố, giữa sảnh và ngai; phản chiếu ấm Fresnel.
- **GLB Blender** `arch_kim_da` (`tools/blender/kim_da_arch.py`; nhịp quay vào trong): 16 nhịp tường (cột sơn đen đai vàng + cánh sen, cửa sổ hoa cách khung vàng phát sáng ấm, mái cong ngói đen sống vàng hai đầu vút, hàng 11 đèn lồng cam/son treo hiên, rèm lụa son viền vàng), ngai vàng ở bắc (bệ ba tầng + bậc, ngai tay vịn đầu thú, bình phong đen khắc mặt trời vàng 24 tia, chân đèn), 20 cột đèn nhiều tầng quanh sảnh (r 84) có dây đèn lồng giăng giữa các cột, 8 đỉnh đồng ba chân có than đỏ, 12 cây vàng chết (vườn chết). Vàng dùng vật liệu PBR cổ của Thần Tàng (`ttMaterialFor`: metalness 1, nhám 0,3, khắc chìm, loang). Bỏ hàng cột đá khắc vân cũ (r 70–74) đè nhịp tường mới.
- **Ánh sáng**: quầng đèn lồng (`createLanternHalos`) cho 20 cột + 4 đèn đố, hai tia trăng vàng nhạt, sương hổ phách thấp; vật phát sáng (đèn lồng, cửa sổ) vật liệu emissive.
- **Ngân sách (preset Cao)**: ~110 draw call, ~0,67M tam giác.
- **Còn lại**: tượng võ sĩ/bia đá là prop cũ (thô); đỉnh đồng nhìn từ xa hơi giống nồi; chưa có normal map hoa văn thật; cây vàng chết còn đơn giản; chưa khai báo va chạm (đợi API COL-1).

### PR 5 vòng 2 (góp ý duyệt): sân có lát đá, điểm nhấn, tượng chạm khắc

- **Sân lát đá**: phiến bazan 3,2 m xếp so le, mạch đá tối mảnh, mỗi phiến một sắc; **vũng nước mưa** (mảng đen bóng không đều, soi ánh đèn), **cánh hoa/lá vàng rơi** (chấm nhỏ theo ô 1,3 m), **thảm đỏ viền vàng** từ cửa nam tới thềm ngai (chỉ ngoài vùng đánh r > ~46–58). Vòng trận chỉ còn hai vòng liền MẢNH (r 46, 64) + hoa sen ngắn ở tâm; **bỏ các vạch thẳng trắng dài và vòng vạch chia đứt nét**.
- **Điểm nhấn trong sân** (GLB, ngoài vùng đánh, chừa hành lang nam): hai hồ nước (vành đá 30 phiến, lá sen, mặt nước soi trời hổ phách) có **cầu vòm đá lan can son** bắc qua; hai **bệ hương** (nền ba bậc, lư hương than đỏ + hương, hai chân đèn) hai bên ngai; bốn **cây quế kim tuyết** (thân đen xoắn, tán lá sẫm lốm đốm hoa vàng, năm đèn lồng treo cành) ở bốn góc; mười **đèn đá thấp** thành vòng r 32 và hai hàng dọc thảm.
- **Tượng**: bỏ tượng võ sĩ prop cũ, dùng lại **thần tướng chạm khắc của Thần Tàng** (giáp, mũ trụ, đại kiếm; đổi bảng màu bazan ấm + chữ hổ phách) đứng trước thềm ngai và hai bên lối vào.
- **Ngân sách (preset Cao)**: ~172 draw call, ~0,79M tam giác.
- **Còn lại**: vũng nước còn là các vệt tối nhỏ (phản chiếu yếu), mặt hồ hơi tối; tượng nhìn từ trên còn "cột đen"; chưa va chạm (đợi COL-1).

### PR 6 vòng 2 (góp ý duyệt): cột bazan, phiến dung nham, khe rộng, lửa xanh

- **Cột bazan** viết lại: 4–8 cột lục giác cao thấp lệch (2–13 m), đỉnh vỡ (mặt cắt xiên + răng cưa), cột gãy kèm mảnh vỡ nằm cạnh; cụm đặt lệch ngẫu nhiên dọc chân vách (không còn tường đều), cỡ 0,5–1,55×, thêm vài cụm lẻ trên sàn. Vật liệu client `xkMaterialFor` cho `_obs`: đá đen nhám có thớ (nhiễu kéo dọc), vết nứt mảnh phát sáng đỏ than ở chân cột, tro xám phủ mặt hướng lên.
- **Phiến vỏ dung nham** thay bục bát giác: sáu bảy phiến dày 0,35 m có mép bo, khe 0,2–0,4 m nhìn xuống lớp dung nham **gradient phát sáng** (lõi vàng cam → mép đỏ thẫm, màu đỉnh bake ở Blender, vật liệu `_ember` thay bằng emissive nhấp nháy), viền đá vỡ nhô lên. Bục tâm màu đất đổi từ xương trắng sang tro xám.
- **Khe dung nham** thành rãnh rộng (nửa rộng 0,3–1,5 m, gờ đá cao ×2,2): lõi vàng-cam phát sáng (`DungeonFx` `core`) mờ ra mép đỏ thẫm; 150 hạt than/tro bốc lên từ các khe (`PointsMaterial` cộng sáng).
- **Quả cầu xanh lam** (khe mạch ngọc lam của boss cuối) đổi thành quầng lửa xanh nhạt nhỏ hơn (chỉ tầng sát đất). Vòng trắng ở bục tâm của địa hình đã bỏ.
- Vòng trắng xám lớn trong ảnh chụp là **vòng thần thức/lãnh vực của nhân vật thử cảnh giới Hóa Thần** (VFX của game, `game/fx`), không thuộc cảnh bí cảnh; để nguyên.
- Chưa làm: sương nóng gợn (heat haze) — cần hậu kỳ biến dạng khung, ngoài phạm vi PR này.
- **Ngân sách (preset Cao)**: ~158 draw call, ~0,49M tam giác.
