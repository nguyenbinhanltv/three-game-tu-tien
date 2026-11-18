# Nướng vải vạt (cloth bake) cho Lạc Kiếm v3b — bản thử nghiệm

Bật bằng `?chr=v3&cloth=1` (asset `chr_v3b_cloth_nam|nu`); mặc định `?chr=v3` vẫn là v3b + lò xo (`chr_v3b_lac_kiem_*`, không đổi). `?k5=0` tắt pose chiêu K-5 trên Mannequin (mọi clip là UAL) để so vạt trên cùng clip.

## Cách làm (`tools/blender/cloth_bake.py`, cấu hình `tools/blender/skins/v3_lac_kiem_cloth.json`)
1. Đầu vào: GLB thô đã dựng của `chr_v3b_lac_kiem_<giới>` + 2 thư viện UAL. `run.mjs` job `chr_v3b_cloth_<giới>` (`raw:` = đọc từ `assets/build/raw`); báo cáo JSON ở `assets/build/cloth_<giới>.json`.
2. **Vùng vạt** = đỉnh trong dải z 0,17–0,52 chiều cao nằm NGOÀI viên nang thân (đùi, cẳng, hông, ngực) hoặc có trọng số lò xo vạt cũ: nam 3.325 đỉnh. Chọn theo bán kính (cách làm đầu tiên) bỏ sót vạt sau nên bỏ. Đỉnh trùng vị trí (đường nối UV, pháp tuyến tách) được hàn lại thành một đỉnh mô phỏng (không hàn thì vạt rã thành 49 mảnh và các mảnh không ghim rơi tự do): lưới sim nam 2.414 đỉnh.
3. **Xương**: bỏ 16 xương lò xo vạt cũ, thêm 12 chuỗi × 5 xương `dtl_o_cloth_<k>_<j>` quanh hông (con của `pelvis`), trọng số vạt hoàn toàn cho chuỗi (2 chuỗi × 2 khớp = 4 ảnh hưởng). Tổng 159 xương (lớp ngân sách mới `player_v3_cloth`, trần 192; `player_v3` là 128).
4. **Mô phỏng**: Blender Cloth (khối lượng 0,25, tension/compression 25, shear 20, bending 1,2, khoảng cách va chạm 12 mm, va chạm tự thân 2 mm) trên lưới sim, ghim dải thắt lưng (10% chiều cao vùng), thân va chạm = viên nang gắn xương (hông, ngực, đùi, cẳng; tay) bán kính ×0,7, mặt đất ở đế giày; chạy đà 2 chu kỳ (clip lặp) hoặc 24 khung (clip một lần) rồi lấy chu kỳ cuối; clip lặp hòa đuôi về đầu để khép vòng. Bài học: viên nang ×1,0 làm sim nổ vì vạt ôm sát đùi; va chạm tự thân với khoảng cách 6 mm làm vạt bay lên ngực (vạt có hai lớp ngoài/lót sát nhau) nên dùng 2 mm; không có mặt đất thì vạt rủ xuyên xuống dưới thân khi nằm.
5. **Khớp xương** (từ gốc ra ngọn, từng khung, chỉ xoay, giữ độ dài): Kabsch có trọng số theo cây con của từng xương, kèm hiệu chỉnh kéo về xoay của xương cha; ghi action `cloth_<clip>` chỉ có kênh xoay xương chuỗi (15 khung/giây, nội suy). 14 clip: Idle_Loop, Sword_Idle, Jog_Fwd_Loop, Sword_Regular_A/B/C, Sword_Attack, Roll, Death01, Hit_Chest, Sitting_Idle_Loop, Jump_Loop, Spell_Simple_Idle_Loop, Crouch_Fwd_Loop. Các action nằm ngay trong GLB của model (nạp cùng nhân vật, **chưa nạp lười**).

## Client (`game/character/mannequin.ts`)
`MannequinTemplate.cloth` (clip `cloth_*` lấy từ `handle.animations`); `retargetCloth()` chọn track theo clip đang chiếm (đòn một lần nếu có track, không thì clip nền), phát đồng bộ giờ và timeScale (chạy theo tốc độ), trọng số vạt riêng (`blendCloth`, cộng/trừ cùng tốc độ để tổng bằng 1, vạt vẫn theo clip nền khi đang ra chiêu K-5). `SpringBones` của xương `dtl_o_cloth_*` (V3_SPRING) chỉ chạy khi không có track nướng (pose K-5, clip chưa nướng); tóc/tay áo vẫn lò xo như cũ. Test: `mannequinCloth.test.ts`.

## Số đo (sau khi sửa lỗi A-pose, asset dựng lại ngày 18/11 16:23–16:26)
| | Lò xo (v3b) | Nướng vải |
| --- | --- | --- |
| GLB nam / nữ (KB) | 3.498 / 3.346 | 4.007 / 3.857 (+509 / +511; track vạt 14 clip × 60 kênh xoay ≈ 388 KB giải nén) |
| Xương | 115 | 159 |
| Xuyên thân, cặp mặt chồng (12 tư thế, tổng) nam / nữ | 1.645 / 1.810 | 7.685 / 12.206 (tệ hơn ×4,7 / ×6,7) |
| Đỉnh vải trong viên nang (12 tư thế, tổng) nam / nữ | 12.491 / 17.940 | 11.160 / 15.253 (−11% / −15%) |
| CPU khung p50 / p95, 50 bot, WebGPU, Vừa (lượt 2, máy yên) | 9,8 / 16,7 ms (74 fps) | 7,1 / 12,2 ms (103 fps) |

- **Sửa lỗi A-pose**: bản đầu xuất action với `export_force_sampling`, mỗi clip `cloth_*` mang 477 kênh (297 kênh của mọi xương khác ở tư thế nghỉ) nên đè lên clip UAL và nhân vật bật A-pose, tay gấp lạ (nữ). Nay chỉ xuất 60 kênh xoay xương vạt mỗi clip (nội suy tuyến tính), xóa action `A_TPose` thừa; client lọc thêm chỉ lấy kênh `dtl_o_cloth_*`. GLB nhỏ đi 1,2 MB (5.191 → 4.007 KB nam). Các số xuyên thân đo trong Blender bằng cách đặt thẳng xoay xương nên không bị ảnh hưởng bởi lỗi này.
- Cả hai phép đo "xuyên thân" dùng cùng cách phân vùng (vạt chia trái/phải theo vị trí đỉnh, không theo trọng số) trước và sau; **không so được trực tiếp với con số 2058 của `chr_v3.py`**. "Trước" = LBS thuần (lò xo vạt chưa mô phỏng). Sai số khớp xương so với sim: 53–120 mm trung bình, vạt cứng theo hông lệch 117–403 mm.
- **CPU không phân biệt được**: lượt 1 (asset còn lỗi, máy bận) nướng vải chậm hơn (p50 15 → 18,6 ms, p95 35,8 → 39,2 ms); lượt 2 (asset đã sửa, máy yên) nướng vải lại nhanh hơn (9,8 → 7,1 ms), trong khi số draw call/tam giác của hai lượt cũng khác nhau (191/1.111k so với 173/989k): nhiễu lớn hơn chênh lệch. Mỗi nhân vật thêm 44 xương và một action vạt; chưa đo lặp đủ để kết luận. Cả hai lượt đều vượt trần 8 ms ở p95 trong môi trường này.

## Lỗi và giới hạn (nói thẳng)
- **Cặp mặt chồng tăng mạnh**: sim không biết lưới Tripo hai lớp và tay áo; va chạm tự thân 2 mm chỉ đủ để sim ổn định, vạt vẫn xuyên nhau/xuyên đùi ở quy mô nhỏ; đỉnh trong viên nang chỉ giảm 11–15%. Nặng nhất: Jog, chém, ngồi, nữ ngã (Death01 nữ 43 → 4.703).
- **Nhìn bằng mắt (video, tờ khung)**: Idle và chém xoay đẹp hơn lò xo (vạt rủ dài, bay theo đòn). Nhưng khi **chạy** (clip dùng nhiều nhất) gấu vạt có gai nhọn/mảnh cứng xanh-trắng; lăn úp và chém xoay mạnh có tấm cứng giữa hai chuỗi; ngồi thì vạt trước rủ như tấm thẳng. Xương chuỗi cứng (12 × 5 khớp, không giãn) không biểu diễn được vải co/giãn (đã thử 10 → 12 chuỗi).
- Chưa nướng: đả tọa K-5, ngự kiếm, niệm chú K-5 (lò xo như cũ); chuyển giữa track nướng và lò xo giật nhẹ.
- Track nằm trong GLB nhân vật (+~0,4 MB), chưa tách asset nạp lười.
- Nướng một lần 9–27 phút mỗi giới tùy tải máy (va chạm tự thân); mỗi bộ trang phục dài mới phải nướng lại và chỉnh lại thông số: chi phí lặp lại cao. Không nằm trong `assets:build` mặc định (job chạy khi `--only chr_v3b_cloth_<giới>` hoặc thiếu GLB thô).

## Ý kiến của worker: nên quay về lò xo + cải tiến
Nên **không tiếp hướng nướng vải** ở dạng này, quay về lò xo v3b và cải tiến: (1) xuyên thân (cặp mặt) tệ hơn 4–7 lần và lỗi nhìn thấy được ở clip chạy; (2) chi phí cố định: +44 xương mỗi nhân vật, +0,5 MB, nướng lại 10–25 phút cho mỗi giới × mỗi bộ trang phục và không phủ được K-5/ngự kiếm/đả tọa (vẫn cần lò xo làm dự phòng, tức giữ cả hai hệ); (3) lợi ích nhìn thấy chỉ ở Idle và vài đòn. Việc đáng làm với lò xo: bật viên nang tay cho vạt, thêm vài chuỗi giữa trước/sau, tăng cứng ở gấu để bớt rách khi lăn, thử `pushOutCapsule` theo tư thế ngồi (đả tọa riêng cho đồ dài). Nếu muốn giữ nướng vải thì chỉ nên làm cho vài clip cảnh điện ảnh (idle, chém xoay) chứ không thay lò xo.

## Quay
`pnpm shots chrv3 --variants v3nok5,v3cloth --genders m,f --cloth6 --out <thư mục>` (đặt `FFMPEG=` đường dẫn ffmpeg-static; `CLOTH_AT="x z"`, `CLOTH_YAW`/`CLOTH_YAW_SIDE` đổi điểm đứng/góc camera): Idle, chạy, chém, xoay chém, lăn, ngồi, ngã; mỗi đoạn hai góc (3/4 và ngang), camera sát hông–gối, nhãn tên clip thật trên khung. Mỗi biến thể quay riêng và ghi mốc đầu từng đoạn; video ghép trái/phải cắt theo mốc nên cùng clip cùng thời điểm (quay song song thì trang nặng khựng làm lệch vài giây). `v3nok5` = lò xo, `v3cloth` = nướng vải. Dựng bằng `cloth_bake.py` có `--sheet <dir>` (tờ khung trước/sau, `SHEET_POSES`/`SHEET_AZ` tùy chỉnh).
