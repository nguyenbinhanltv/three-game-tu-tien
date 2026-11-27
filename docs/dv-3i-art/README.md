# DV-3I: mỹ thuật Bắc Hoang Tẫn Nguyên (chương 5)

Gói mỹ thuật cho bản đồ DV-1 (#213), theo mẫu E4-I (`docs/e4i-art/`) và `docs/DIVUC_DESIGN.md` 4.2 (bảng phụ `rift_*`). Chỉ hình/âm + đổi id quái ở bộ sinh bản đồ; không đụng cân bằng chương 4 (E4-J), VFX chiêu, sim server. Ảnh/video duyệt PR ở artifacts của phiên, không commit.

## Vấn đề → cách sửa

| Trước (DV-1) | Làm gì | Ở đâu |
| --- | --- | --- |
| Đồng hoang xám phẳng, dùng bộ texture đất son | Bộ **ash** 8 lớp Poly Haven CC0 (đất cháy, bùn nứt, tảng nứt, đá núi lửa, tro bay; hạ bão hòa ngả tro than), nạp lười khi vào level. Màu đỉnh mới: tro bay + đám tro than, mạng nứt, sân phẳng ngả xương, **bên kia ngả huyết sậm/than hồng (đông, Xích Tẫn) và kim dát khô (tây, Kim Dạ)**, nóng dần gần khe | `tools/asset-pipeline/src/terrain-textures.ts --set ash`, `public/terrain-ash/`, `game/bacHoangArt.ts` (`bhGroundColor`), `game/terrain.ts`, `bac_hoang.assets.json` `ground.set` |
| 85 prop đặt tay không hiện (`trees: "none"` nên lớp prop không dựng) và không có tàn tích rải | `trees: "scatter"` bật lớp prop; rải **đá tro, cột khắc vân đổ (dát vàng ở Kim Dạ), kiếm gãy cắm nghiêng**, ô 24 m xác định, dày dần quanh miệng khe, để trống lòng khe, tránh trạm/cụm quái/điểm | `bacHoangArt.ts` (`scatterBacHoang`), `propScatter.ts` (`bhCtx`, `scatterBh`) |
| Không có cây | **Cây chết thủ tục**: 3 kiểu thân trụi cành (đệ quy, ~200 tam giác), mỗi kiểu một `InstancedMesh` (3 draw call), rừng chết dày ở Khô Lộc Lâm, thưa khắp bên này, gần như không có bên kia; trần 700 cây | `game/deadTrees.ts`, `bacHoangArt.ts` (`deadTreeSpots`) |
| Giới Khích là mảng sương nón mờ (cột linh quang) | **Vệt nứt phát sáng bám đường tâm khe**: màn dọc cao 260 m (than hồng ở chân → tím thực lên cao, vệt dọc trôi lên), 14 sườn chéo ngang khe (thấy khi nhìn dọc khe từ trạm), dải lòng khe có gân sáng như vỉa than. 3 draw call, shader TSL, cộng sáng, bỏ sương nên thấy từ xa; đứng gần mờ đi. Cột linh quang của `poi_gioi_khich` bỏ | `render/riftVeil.ts`, `engine.ts` (`buildBacHoang`) |
| Mood cố định, bầu trời nửa nam | **Mood trộn theo vị trí** giữa `ash_dawn` và `rift` quanh miệng khe (z lệch −120 → −250): sương, nắng, trời, grading chỉnh bằng uniform (`tuneAtmosphere`, không biên dịch lại shader). Preset `rift` chỉnh bớt tím/đỏ: xám ấm, nắng than hồng, bão hòa 0,62 | `render/grading.ts` (`mixPreset`), `atmosphere.ts` (`tuneAtmosphere`), `sky.ts` (`skyTopOf`), `assets/palette.json`, `engine.ts` (`updateRiftMood`) |
| Hạt môi trường là hạt Vân Lam (phấn hoa, lá, cánh đào) | Tro bay khắp nơi, tàn lửa dày dần về phía khe và bên kia (dùng hệ hạt GPU có sẵn, 0 draw call mới) | `ambient.ts` (`bhAmbient`) |
| Cả level phát nhạc `wild` | Hai bài tự soạn: **`wild_ash`** (bên này: tiêu, đàn tranh thưa, dây trầm, 52 BPM, 2:46) và **`wild_rift`** (bên kia: đàn ống, hợp xướng tối, đồng thau, timpani, thang E F A B C, 60 BPM, 2:24), chọn theo nửa bản đồ | `tools/audio/compose/wild_ash|wild_rift.mjs`, `music.json`, `musicDirector.ts` (`regionTrack(…, rift)`), `music.ts`, manifest, `LICENSES.md` |
| Quái chương 4 đứng tạm ở vùng cấp 28 | **Liệt Hỏa Ma Ngưu và U Ảnh Cốt Lộc (DV-2, #212)** thay chiến mã/Dạ Minh Lộc ở mọi vùng. Cốt Vệ Kiếm Thú vẫn đứng chỗ Giác Kiếm Trọng Binh, tinh anh vẫn tạm (DV3-B). Bộ sinh dùng cùng dãy số ngẫu nhiên nên **vị trí cụm không đổi**: mật độ 132 quái/km², độ phủ p95 61,2 m / max 82,3 m (chuẩn level ĐẠT), 0 chỗ kẹt | `tools/maps/gen-bac-hoang.mjs` (`MIX`), `levels/bac_hoang.json` |

Cờ so ảnh `?bhart=0` đã gỡ ở V4 nhóm D (28/11/2026); so với bản cũ dùng ảnh trước/sau đã lưu.

## Ngân sách (`pnpm shots points --level bac_hoang --perf`, WebGPU, Vừa, 1280×720)

Xem bảng trước/sau trong mô tả PR. Texture nạp lười: bộ ash ≈ 3,1 MB tải (WebP 1024², 8 lớp), nhạc 2,0–2,6 MB mỗi bài, chỉ tải khi vào level.

## Giới hạn / để lại

- Mặt nạ mặt đất vẫn `neutral` (một lớp nền như Đoạn Mạch/Thiên Khuyết): vệt nứt trên đất và màu từng vùng là màu đỉnh, chưa có lớp nứt thật theo mặt nạ; **mặt đất ngọc lam quanh Trấn Giới Bia (DV3-E) chưa làm**.
- Cây chết không va chạm (chỉ tô cảnh), không đổ bóng; cành trụi dùng ống 5 cạnh.
- Cột linh quang (hào quang ngọc lam) của các điểm khác vẫn là nón nhạt: cường độ bên kia hạ còn 0,55, hình dạng không thuộc gói này.
- Kiến trúc dị vực dựng bpy (cột gãy dát vàng, cổng vòm nhọn, bậc than), trạm Vọng Bắc, `boss_nguc_khuyen`/`boss_thu_khich`, tinh anh Dị Vực (DV3-B) và hai phó bản là việc sau.
- Tàn lửa chưa có hình riêng (dùng hạt `ember` của V4).
