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

## Số đo (nam; nữ ở phần sau)
| | Lò xo (v3b) | Nướng vải |
| --- | --- | --- |
| GLB (KB) | 3.498 | 5.191 (+1.693: track vạt ~830 KB giải nén, thêm xương, trọng số) |
| Xương | 115 | 159 |
| Xuyên thân, cặp mặt chồng (12 tư thế, tổng) | 1.645 | 7.685 (tệ hơn) |
| Đỉnh vải trong viên nang (12 tư thế, tổng) | 12.491 | 11.160 (−11%) |
| CPU khung p50 / p95, 50 bot, WebGPU, Vừa | 15 / 35,8 ms (45,1 fps) | 18,6 / 39,2 ms (38,9 fps) |

Nữ: cặp mặt chồng 1.810 → 12.206, đỉnh trong viên nang 17.940 → 15.253 (−15%).
Cả hai phép đo "xuyên thân" dùng cùng cách phân vùng (vạt chia trái/phải theo vị trí đỉnh, không theo trọng số) trước và sau; **không so được trực tiếp với con số 2058 của `chr_v3.py`** (cách phân vùng khác). "Trước" = LBS thuần (lò xo vạt chưa mô phỏng). Sai số khớp xương so với sim: 53–120 mm trung bình (nam) nhưng vạt cứng theo hông lệch 117–403 mm, nên khớp giảm sai số 2–3 lần mà chưa đủ sát.

CPU: một lần đo mỗi bản trên máy đang chạy nhiều phiên khác (số nhiễu), chưa đo v1/v2 để so; cả hai bản đều vượt trần 8 ms của môi trường này. Chênh lệch +3,6 ms p50 tới từ 12 chuỗi × 5 xương (+44 xương/nhân vật) và `AnimationMixer` thêm một action vạt.

## Lỗi và giới hạn (nói thẳng)
- **Cặp mặt chồng tăng mạnh** (nam ×4,7, nữ ×6,7): sim không biết lưới Tripo hai lớp và tay áo, va chạm tự thân 2 mm chỉ đủ để sim ổn định, vạt vẫn xuyên nhau/xuyên đùi ở quy mô nhỏ; đỉnh nằm trong viên nang chỉ giảm 11–15%. Mức xuyên nặng nhất: Jog, chém, ngồi, nữ ngã (Death01 nữ 43 → 4.703).
- Xương chuỗi cứng (12 chuỗi × 5 khớp, không giãn) không biểu diễn được vải co/giãn: khi lăn úp hoặc chém xoay mạnh thấy gai nhọn/tấm cứng giữa hai chuỗi (đã thử 10 → 12 chuỗi). Ngồi: vạt trước rủ như tấm thẳng trước ống chân.
- Chưa nướng: đả tọa K-5, ngự kiếm, niệm chú K-5 (lò xo như cũ); không có nút chuyển mượt giữa track nướng và lò xo (xương về tư thế nghỉ rồi lò xo chạy tiếp, giật nhẹ).
- Track nướng nằm trong GLB nhân vật (+~0,8 MB), chưa tách asset nạp lười.
- Nướng một lần tốn 20–27 phút mỗi giới (va chạm tự thân; không có tự thân chỉ ~4 phút nhưng sim kém ổn), nên không đưa vào `assets:build` mặc định (job chỉ chạy khi `--only chr_v3b_cloth_<giới>` hoặc thiếu GLB thô).

## Quay
`pnpm shots chrv3 --variants v3nok5,v3cloth --genders m,f --cloth6 --out <thư mục>` (đặt `FFMPEG=` đường dẫn ffmpeg-static): 6 clip UAL liên tiếp — đứng, chạy, chém A/B/C, lăn ×2, ngồi, ngã — camera thấp chếch sau; `v3nok5` = lò xo, `v3cloth` = nướng vải. Dựng bằng `cloth_bake.py` có `--sheet <dir>` (tờ khung trước/sau, `SHEET_POSES`/`SHEET_AZ` tùy chỉnh).
