# Lò xo vạt Lạc Kiếm v3b2 (cải tiến lò xo sau khi bỏ hướng nướng vải #241)

`?chr=v3` nay dùng `chr_v3b2_lac_kiem_nam|nu` (cùng model Tripo v3b); (các bản v3/v3b cũ và cờ `?v3model=a|b` đã gỡ ở A2; còn `?v3model=b2`). Mọi thay đổi ở client chỉ áp cho asset `chr_v3b2_*` (`isSpring2`), v3/v3b chạy y như cũ.

## Đã đổi
- **Asset**: vạt 12 chuỗi lò xo (v3b: 8; `tools/blender/skins/v3_lac_kiem_springs2.json`), phần trọng số chuyển sang lò xo `share` 0,8 (v3b: 0,35), nên va chạm viên nang chi phối phần lớn vạt. 123 xương (v3b: 115), GLB 3.585 KB nam / 3.429 KB nữ (v3b: 3.498 / 3.346).
- **Viên nang** (`colliderDefs`): thêm hai viên nang mỗi tay (cánh tay, cẳng tay; cố định bán kính) và phình viên nang hông/đùi/cẳng ×1,3 (`SPRING2.rMul`) cho vạt.
- **Gấu cứng hơn**: khớp thứ hai của chuỗi `dtl_o_skirt_<k>_1` cứng ×1,7 (`SpringDef.stiff`, `SPRING2.hemStiff`) để bớt rách khi lăn/chém xoay.
- **Ngồi/đả tọa**: viên nang thân phình thêm ×1,3 (trơn theo thời gian, `SpringBones.update(dt, world, rScale)`) khi nền là `Sitting_Idle_Loop` hoặc pose K-5 `tam_thien`, để vạt nằm lên đùi chứ không lún xuống.
- **Góc lệch vạt hẹp** (`V3_SKIRT_SPRING2`, 12°; tóc và tay áo vẫn `V3_SPRING`): đòn bẩy hiệu quả nhất. Vạt nay bám viên nang nhiều hơn nên góc rộng làm hai nửa vạt chéo nhau khi chạy (nữ Jog 149 → 615 cặp ở 30°; 12° đưa về 127).
- Chạm `mannequin.ts` chỉ ở phần lò xo (hằng số, `colliderDefs`, dựng/cập nhật `SpringBones`, tách `skirtSprings`); không đụng điều khiển animation/crossfade/retarget. `spring.ts`: `SpringDef.stiff`, `SpringCollider.fixed`, tham số `rScale`.

## Đo (cùng thước đo, lò xo mô phỏng thật trong client)
Harness `springMetrics.ts`/`springMetrics.test.ts` (`SPRING_METRICS=<file json> pnpm --filter @dtl/client exec vitest run src/game/character/springMetrics.test.ts`; `SPRING_ASSETS=id,id`; `SPRING_PAIRS=1` in từng cặp vùng; `SPRING_TUNE='{"rMul":1.3,…}'` quét tham số): chạy `MannequinCharacter` thật tới từng tư thế (chạy đà hai chu kỳ với clip lặp), lấy đỉnh đã skin rồi đếm cùng hai số như `chr_v3.py`: cặp tam giác chồng nhau giữa các vùng và đỉnh vải trong viên nang thân, đều là phần TĂNG so với tư thế nghỉ, 12 tư thế. Vùng vạt chia trái/phải theo vị trí. (Khác `chr_v3.py` đo LBS tĩnh nên số tuyệt đối khác, chỉ so cùng harness.)

| tổng 12 tư thế | v3b (cũ) | v3b2 (mới) |
| --- | --- | --- |
| Nam, cặp mặt chồng | 2.304 | 2.387 (+3,6%) |
| Nam, đỉnh trong viên nang | 13.450 | 12.855 (−4,4%) |
| Nữ, cặp mặt chồng | 1.758 | 1.640 (−6,7%) |
| Nữ, đỉnh trong viên nang | 17.927 | 16.927 (−5,6%) |
| Ngồi (Sitting_Idle_Loop) nam / nữ, cặp chồng | 880 / 453 | 875 / 432 |

Cải thiện **nhỏ** (đỉnh trong viên nang −4 đến −6%, cặp chồng −7% nữ nhưng +4% nam). Lý do: phần lớn chồng nằm ở tay×thân (150–280 cặp mỗi tư thế: tay áo rộng đâm vào thân) và ở trọng số tĩnh của vạt ôm đùi, lò xo không chạm tới. Quét tham số cho thấy hệ số cứng gấu, bật/tắt viên nang tay, độ cứng/cản chỉ đổi ±2%; chỉ `share`, bán kính viên nang và góc lệch có tác dụng. Muốn giảm tiếp phải sửa trọng số/tay áo (chr_v3.py), không phải lò xo.

**CPU**: vi đo trong một tiến trình (50 nhân vật, Jog, `update` = mixer + lò xo, 3 vòng, trung vị): nam 8,05 → 8,19 ms/khung (+1,7%), nữ 8,79 → 9,09 ms (+3,4%), trong nhiễu giữa các vòng (±1,5 ms). `bench:crowd` 50 bot, WebGPU, Vừa, 2 lượt mỗi bản trên máy yên: trước p50/p95 9,1/14,8 và 5,8/8,5 ms, sau 10/16,3 và 11,1/20,2 ms: nhiễu giữa các lượt (5,8 so với 9,1) lớn hơn chênh lệch nên không kết luận được. Thêm 8 xương lò xo + 4 viên nang mỗi nhân vật: chi phí CPU thêm ước vài phần trăm của phần lò xo.

## Video
`pnpm shots chrv3 --variants v3old,v3new --genders m,f --six --out <thư mục tuyệt đối>` (đặt `FFMPEG=` ffmpeg-static): Idle, chạy, chém, xoay chém, lăn, ngồi (đả tọa K-5), ngã; mỗi đoạn hai góc (3/4 và ngang), camera sát hông–gối, nhãn clip thật trên khung; mỗi biến thể quay riêng và ghi mốc đầu từng đoạn rồi cắt ghép trái (v3b cũ) | phải (v3b2 mới) nên cùng clip cùng thời điểm. `SIX_AT="x z"`, `SIX_YAW`, `SIX_YAW_SIDE` đổi điểm đứng/góc. Nhìn bằng mắt khác biệt nhỏ, nhất quán với số đo.
