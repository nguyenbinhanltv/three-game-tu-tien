# Lạc Kiếm Tông: bản đồ tiểu cảnh (Chân Cảnh M1+M2, pilot)

Camera chéo khóa góc (FOV 32°, pitch 52°, cách ~20 m, yaw Vân Lam 30°) chỉ thấy một khung **~20 × 12 m**. Mỗi khung phải có
**điểm nhấn** (nhìn là nhớ), **tiền cảnh** (vật gần camera, tự mờ khi che người/mục tiêu) và **đáy** (nước, sương, vực).
Người chơi nhìn khung đó ~90% thời gian, nên bản đồ được lập theo khung, không theo công trình.

Mã nguồn: `apps/client/src/game/world/lacKiemScenes.ts` (`SCENES`, tọa độ tương đối tâm tông môn). Hình chỉ dựng ở client (tắt bằng `?scenes=0`),
tất định. **Vật đặc có va chạm (COL-1)**: bố cục các vật GLB, cột cổng bài, ao, cầu nằm ở `packages/shared/src/tieucanh.ts`
(`SCENE_GLB`, `lacKiemSceneColliders`, cộng vào terrain Vân Lam trong `registerTerrain`), client và server cùng đọc. Cột cổng chừa lối 9 m;
vật dưới 0,6 m (linh thảo), ao, phiến lối men vách, sương và nước không chặn; cầu treo có va chạm riêng (ván đi được + lan can đặc, xem M2 bên dưới). Prop PBR của kit (đá rêu, đèn đá, bia, kiếm gãy, tre, cột đá đỏ) rải bằng `GlbScatter` (mỗi loại ≈ 2 draw call), phần thủ tục chỉ còn cổng, cầu, đường, ao, hác.

## Bảng tiểu cảnh

| # | Tiểu cảnh | Tâm (x, z) | Điểm nhấn | Tiền cảnh (tự mờ) | Đáy |
|---|---|---|---|---|---|
| 1 | Cổng Bài ngoài sơn môn | (0, 120) | Cổng bài sơn son hai tầng ngói, mở 9 m (đi xuyên qua được) | Hàng 10 đèn đá dọc lối, đá tảng | Lối đá + cỏ |
| 2 | Ao Sen | (−62, 66) | Ao tròn r 8,5 m, lá sen, hoa sen, bia khắc | Viền đá, đèn đá | Nước gợn |
| 3 | Kiếm Bia Viên | (66, 64) | Bia đá giữa 5 thanh kiếm đá cắm nghiêng (3–4,6 m) | Đèn đá, đá tảng | Cỏ + bóng kiếm |
| 4 | Lối Men Vách | (−92, 54) → (−140, 70) | Đường phiến đá bậc thang bám sườn, cọc + dây lan can phía dốc | Đá tảng ven đường, đèn đá | Sườn dốc xuống hác |
| 5 | Cầu Treo Vân Hác | (−146, 91), dài 44 m | Cầu treo hai tháp son, sàn ván võng, dây lan can | Chính cầu (mờ khi che người) | Hác khoét thật (đáy ~17 m dưới ván) + sương thấp |
| 6 | Thạch Lâm | (96, −8) | Cụm đá tảng + bia nghiêng | Đèn đá | Cỏ |

Điểm chụp chuẩn (`pnpm shots tieucanh`): `congbai (0,114)`, `aosen (−60,58)`, `kiembia (66,58)`, `loivach (−112,69)`, `cautreo (−136,64)`, `thachlam (96,−8)`.

## M2: chiều sâu dọc, vì sao chọn như vậy

Địa hình Lạc Kiếm là lòng chảo: sân phẳng r 95 m, quanh là đồi dâng cao dần, **không có vực thật**. Quét heightmap (độ sâu so với hai bờ cách 44 m) chỉ thấy
vài hác tự nhiên sâu 10–30 m ở vành ngoài. Chọn hác tại (−146, 91): sâu ~11 m tự nhiên, nay khoét thêm 5 m (hác 26 m sâu quá, cầu nằm ngoài khung camera 12 m).

- **Cầu treo ĐI ĐƯỢC** (PR cầu treo): hác khoét thật vào heightmap dùng chung (`TerrainDef.gorges`, `TC_GORGE` ở `tieucanh.ts`, sâu thêm 5 m, đáy ~17 m dưới mặt cầu giữa nhịp); mặt cầu là hộp `walk` dốc theo võng + hai lan can đặc cao 2,4 m (`cautreo.ts`, đăng ký va chạm trong `content/colliders.ts`), server quyết định vị trí trên ván bằng `stepMove`, client dự đoán cùng dữ liệu. Không rơi khỏi cầu (lan can cao hơn tầm nhảy, hai đầu hở); đi dưới đáy hác ngay dưới cầu không bị hút lên ván. Tiếng bước chân gỗ trên ván (`surface.ts`), chuột phải/ngắm trên ván chọn mặt cầu (`camera/pickGround.ts`). Hác có áo đá tầng phủ sườn dốc, suối và sương dưới đáy.
- **Lối men vách** bám địa hình (đi được), dẫn từ sân tới đầu cầu. Bản đầu đi thẳng theo sườn tới 30°+ rồi đứt ở vách 6 m; nay đi vòng có một điểm quặt (`TC_LOI_VACH` ở `tieucanh.ts`), dốc ≤ ~22°, đầu cầu dời lên bờ cao (`TC_BRIDGE.cx` −143,2).

## M3: sáu tiểu cảnh kể chuyện trên mặt đất

Không phủ cả bản đồ (đã thử lớp "wash" nhiễu toàn sân: đắt, nhạt, bỏ). Thay vào đó 6 tiểu cảnh đặt tay ở chỗ người chơi chắc chắn đi qua, bám prop có sẵn, đọc được trong một giây từ camera chéo
(`apps/client/src/game/world/lacKiemGround.ts`, `vignettes()`, tắt bằng `?ground=0`). Chỉ là decal dẹt bám địa hình (≤ 0,15 m, không che người/mục tiêu), client-only, tất định, không va chạm. HAI mesh = 2 draw call:
`ground` (một shader chọn mẫu theo thuộc tính `aK`: vệt chân + bánh xe, nứt, nứt tỏa tia, rễ + rêu, rêu dải, lá gom, đá vụn, ấn trận phát sáng nhẹ) và `puddle` (phản chiếu trời + lá nổi).

| # | Tiểu cảnh (điểm chụp, tương đối tâm) | Kể chuyện gì |
|---|---|---|
| 1 | Bãi tập kiếm bỏ hoang (66, 58) | kiếm gãy cắm đất, vệt chân xoáy tròn quanh bia, ấn kiếm trận cũ mờ dưới đất, đống lá, vũng đọng bên đá |
| 2 | Vũng nước sau mưa trước cổng bài (8, 106) | vũng phản chiếu trời với lá rơi nổi, rễ cỏ bên đá |
| 3 | Gốc cổ thụ bên ao (−55, 55) | rễ trồi tỏa quanh đèn đá và linh thảo cúng, rêu men theo rễ, đường mòn vòng bờ ao |
| 4 | Lối mòn đệ tử (84, 22) | vệt bánh xe đẩy + dấu chân dẫn ra thạch lâm, đá vụn rơi vãi, vũng bên đường |
| 5 | Sân luyện công (9, 46) | ấn trận khắc chìm dưới đá lát, gạch nứt tỏa tia từ chỗ một chưởng đánh xuống |
| 6 | Chân tường sơn môn (30, 85) | dải rêu men theo khe chân tường, lá gom thành đống ở góc |

Bẫy: đường lát đá trước cổng bài và phiến lối men vách là vật 3D nằm TRÊN đất nên decal ở đó bị che (cho nên không đặt). Dải tam giác phải quay mặt lên (đã gặp: mặt dưới bị cắt nên mất vết chân). Cộng sáng (additive) làm ấn trận trắng bệch giữa ngày, dùng pha trộn thường + phát sáng nhẹ. Màu decal bị ánh sáng ngày nhân lên nên phải chọn tối hơn tưởng tượng (màu đất 0,07 ra vệt nâu vừa phải). Camera chéo xoay 30°: decal đặt lệch tâm so với điểm đứng sẽ rơi ra góc khung, đặt tâm decal sát điểm đứng.
Ngân sách đo (`pnpm shots tieucanh --perf 1`, A/B `--query "&ground=0"`, 6 điểm × ngày/hoàng hôn × 720p/1080p): +2 draw call (96,5 → 98,0), +~4k tam giác (+0,5%), khung 8,35 → 8,37 ms (máy khóa nhịp 8,33 ms: chênh trung vị 0,0 ms, ≤ ~0,1 ms). Ảnh cận: `--dpr 2`.

## Sight fade (bắt buộc)

Mọi vật cao dùng `withSightFade` (đèn phát sáng cũng vậy): mờ khi nằm giữa camera và người/mục tiêu. Sương hác mềm mép theo độ sâu (`viewportLinearDepth`),
không lộ đường cắt với địa hình.

## Ngân sách

+5 draw call, ~<60k tam giác (test `lacKiemScenes.test.ts`). Số đo thật trước/sau: xem PR.

## Trần độ dốc đi bộ (mọi bản đồ)

Không có lối/đường chính nào buộc người chơi leo dốc gắt. `WALK_MAX_SLOPE_DEG = 30` (`packages/shared/src/walkslope.ts`). Dốc hơn thì làm đường vòng
thoải (điểm quặt), bậc thang hoặc bỏ lối. Đây là chuẩn kiểm khi dựng level, không chặn di chuyển lúc chơi. Test `tieucanh.test.ts` quét heightmap lối men vách,
kiểm không vật đặc nào chắn lối, và tìm đường đi bộ (Dijkstra `walkableRouteLength`) từ tâm tông môn tới mọi điểm nhấn. Bản đồ mới thêm test cùng kiểu.
