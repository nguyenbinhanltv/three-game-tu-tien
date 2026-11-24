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

## M3: mặt đất kể chuyện

Người chơi nhìn mặt đất ~90% thời gian, nên thêm lớp decal dẹt bám địa hình (`apps/client/src/game/world/lacKiemGround.ts`, tắt bằng `?ground=0`).
Client-only, tất định, không va chạm; dẹt ≤ 0,15 m nên không bao giờ che người/mục tiêu của camera chéo (không cần sight fade). Mỗi loại gộp MỘT mesh (6 draw call), thủ tục hoàn toàn (không texture mới).

| Loại | Chỗ đặt | Ghi chú |
|---|---|---|
| Vệt mòn + vết chân (`foot`) | đường đất ra kiếm bia, ra thạch lâm, từ sân tới đầu lối men vách | dải theo đường gấp khúc, dấu chân so le trái/phải (mũi + gót), mòn dần theo nhiễu |
| Vũng nước (`puddle`) | quanh ao, trước cổng, quanh kiếm bia, thạch lâm | chỉ chỗ gần phẳng (dốc ≤ ~5°), không đè mặt ao; roughness thấp phản chiếu trời |
| Gạch vỡ + đá vụn (`crack`) | sân lát phía đông đại lộ | đường nứt đen + mảnh đá sáng, nâng 0,14 m trên mặt sân lát |
| Ấn trận (`seal`) | kiếm bia, thạch lâm, đầu cầu, thoáng dưới cổng bài | vòng + vạch khắc + sao tám cánh, mòn theo nhiễu, nhịp thở; vàng/ngọc |
| Lớp "wash" (`wash`) | cả sân (lưới thưa 3 m, mật độ `groundWeight`: đậm ở điểm kể chuyện + rìa, sạch ở đại lộ) | lá rụng gom đống, rêu loang, mảng đất trọc, vẽ bằng nhiễu thế giới trong shader; đây là lớp khiến mặt đất "khác ngay" khi nhìn |
| Rễ cây (`root`) | ven ao, bờ hác, chân đồi thạch lâm, hai bên cổng | tám nhánh tỏa mảnh dần, bỏ ngẫu nhiên vài nhánh |

Bẫy: đường lát đá trước cổng bài và phiến lối men vách là vật 3D nằm TRÊN mặt đất, decal bị che nên không đặt ở đó. Dải tam giác phải quay mặt lên (đã gặp: bị cắt mặt sau nên mất vết chân). Cộng sáng (additive) làm ấn trận trắng bệch giữa ngày, dùng pha trộn thường.
Ngân sách đo (`pnpm shots tieucanh --perf 1`, A/B `--query "&ground=0"` chạy liền nhau, 720p ngày, 6 điểm): đúng +6 draw call (107→113, 80→86, 72→78 ở các điểm không bị streaming xen vào), ~+15k tam giác (+2%: lớp wash chỉ dựng quanh điểm kể chuyện và rìa, bỏ ô dốc/hác), khung 8,35 → 8,45 ms trung bình (máy khóa ở nhịp 8,33 ms nên chênh thật ≤ ~0,3 ms, trong nhiễu đo). Shader wash 4 lần lấy nhiễu/điểm ảnh (đã bỏ sàn mật độ và 4 lần lấy nhiễu thừa). Ảnh cận: `--dpr 2`.

## Sight fade (bắt buộc)

Mọi vật cao dùng `withSightFade` (đèn phát sáng cũng vậy): mờ khi nằm giữa camera và người/mục tiêu. Sương hác mềm mép theo độ sâu (`viewportLinearDepth`),
không lộ đường cắt với địa hình.

## Ngân sách

+5 draw call, ~<60k tam giác (test `lacKiemScenes.test.ts`). Số đo thật trước/sau: xem PR.

## Trần độ dốc đi bộ (mọi bản đồ)

Không có lối/đường chính nào buộc người chơi leo dốc gắt. `WALK_MAX_SLOPE_DEG = 30` (`packages/shared/src/walkslope.ts`). Dốc hơn thì làm đường vòng
thoải (điểm quặt), bậc thang hoặc bỏ lối. Đây là chuẩn kiểm khi dựng level, không chặn di chuyển lúc chơi. Test `tieucanh.test.ts` quét heightmap lối men vách,
kiểm không vật đặc nào chắn lối, và tìm đường đi bộ (Dijkstra `walkableRouteLength`) từ tâm tông môn tới mọi điểm nhấn. Bản đồ mới thêm test cùng kiểu.
