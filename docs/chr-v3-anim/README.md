# Nâng cấp animation nhân vật v3 (`?chr=v3`, Lạc Kiếm v3b)

Chỉ phần HIỂN THỊ ở client; không đổi luật server, không đổi mặc định của game (vẫn v1). `?v3anim=0` về hệ animation cũ để so video.
Không đụng file lò xo vạt/asset vật lý của worker -176 (`spring.ts`, `chr_v3.py`, `v3_lac_kiem_springs.json`): `mannequin.ts` chỉ thêm trường/hàm mới, các dòng liên quan tới `SpringBones` giữ nguyên.

## Đã làm

| Hạng mục | Cách làm |
| --- | --- |
| **B. Crossfade riêng từng cặp** | `mannequinAnim.ts` `xfade(từ, tới)`: chết 0,08 s, ngồi 0,35, dừng chạy 0,24 (chậm hơn xuất phát 0,14), nhảy 0,12, pose K-5 0,22 |
| **B. Trộn đi / chạy / chạy nhanh theo tốc độ thật** | `locoMix(speed)`: `Walk_Loop` (0,97 m/s), `Jog_Fwd_Loop` (5,36), `Sprint_Loop` (8,25) — tốc độ gốc **đo từ root motion của UAL1 `_RM`**. Cả ba clip dùng chung một pha (`locoPhase`, `timeScale = 0`, đặt `time` mỗi khung) với chu kỳ/giây = tốc độ ÷ độ dài chu kỳ nội suy → chân trụ khớp mặt đất ở mọi tốc độ. Chạy trong game (7 m/s) ≈ 60% chạy nhanh + 40% chạy |
| **B. Tách thân trên/dưới** | đòn UAL dự phòng (`attack()`) khi đang chạy chỉ phát nửa trên (`upperBodyOf`), chân giữ clip chạy (`lowerBodyOf`, cùng pha). Chiêu K-5 vốn đã tách từ N-7 |
| **B. Nghiêng khi rẽ, xoay tại chỗ** | `leanOf(yawRate, speed)` (kẹp ±0,13 rad) nghiêng cột sống quanh trục tiến; đứng yên mà xoay thì thân trên trễ so với chân (`turnLagOf`, ≤ 0,6 rad) |
| **C. Thở** | cộng thêm ngực ±0,012 rad, 0,28 Hz khi đứng, ±0,004 khi chạy |
| **C. Nhìn mục tiêu** | `AnimState.lookAt` (mục tiêu đang chọn của người chơi mình, `entities.ts`); `lookAngles` giới hạn đầu ±1,0 rad, ngẩng ±0,4, không nhìn khi mục tiêu ở sau lưng (> 126°); chia vào xương ngực/cổ/đầu |
| **C. Giật khi trúng đòn** | `flinchOf`: thân ngửa ra sau 0,12 (nhẹ) / 0,18 (chí mạng) / 0,26 rad (nặng), tắt theo hàm mũ trong 0,3 s, cộng lên clip `Hit_*` |
| **D. Anticipation** | đòn UAL dự phòng chạy chậm 0,55× trong 20% đầu (kéo lại), 1,7× tới điểm trúng, 1,05× phần thu về (`swingRate`). Hit-stop khi trúng đã có sẵn ở `HitReact` (K-7, trần 90 ms). Chiêu K-5 đã khớp `hitAt` của server qua sự kiện chiêu (N-7); VFX/sát thương bám đồng hồ này |
| **A. Bù vai/tay theo model** | `ARM_FIT` (rad theo asset; mặc định 5°, `?armfit=<độ>` ghi đè): sau mixer xoay `upperarm_l/r` dang ra thêm quanh trục tiến của thân, giảm còn 40% khi chiêu K-5 đang điều khiển tay, tắt khi bay/ngồi/niệm |
| **E. Clip UAL mới (CC0, chỉ thêm)** | `anim_ual_native` 37 → 49 clip: `Walk_Formal_Loop`, `Sword_Regular_A_Rec`, `Sword_Regular_B_Rec`, `Slide_Start/Loop/Exit`, `Walk_Carry_Loop` + (đã có) Sprint/Walk. Không dùng Mixamo hay dịch vụ mocap/AI. GLB 2,0 → 2,6 MB |

## Chưa làm / giới hạn (nói thẳng)

- **Giữ chân bám dốc (IK chân trên Mannequin)**: chưa làm. `SkinnedCharacter` có IK hai đốt trên xương Mixamo (`ikpose.ts`), chưa chuyển sang xương Mannequin. Việc riêng.
- ~~Đi lùi / đi ngang~~: đã làm ở NV3-A1 (mục dưới).
- **Rẽ tại chỗ bằng bước chân** (xoay chân): vẫn chỉ xoắn thân trên. Đã thử bake clip bước tại chỗ từ Walk (chân phải đi tới, chân trái đi lùi, biên độ 0,2–0,5): chân trụ trượt gấp 3–20 lần quãng cần có (xoay quanh hông bán kính ~0,1 m chỉ cần ~0,3 m/chu kỳ), nên bỏ. Làm bằng IK khóa chân trong game ở NV3-A2 (chân đứng yên trong thế giới khi thân xoay, vượt ~40° thì nhấc chân bước tới vị trí mới).
- **Đi bộ**: trong game tốc độ chạy cố định 7 m/s (`RUN_SPEED`), nên clip đi chỉ hiện khi bị làm chậm (< ~2,4 m/s); logic có test thuần, chưa có tình huống quay riêng.
- **Đồng bộ VFX với khung clip cho đòn UAL dự phòng**: đòn dự phòng không phát sự kiện `hitAt` (chỉ chiêu K-5 mới có); chưa thêm.
- **Hệ số bù tay là hằng số theo model, chỉnh bằng mắt + số đo**: chưa tính tự động theo độ rộng ống tay từng model.

## Số đo

**CPU khung** (`CROWD_QUERY='&chr=v3[&v3anim=0]' pnpm bench:crowd --bots 50 --scenes san --renderers webgpu --presets high --seconds 15`, 50 người chơi đều là v3, 2 lượt mỗi bản, WebGPU Cao). **Máy KHÔNG yên** (nhiều worker chạy song song; tick server p95 của hai lượt "mới" nhảy lên 27–33 ms so với 3,6–4,1 ms ở "cũ", không do code này), nên số chỉ để tham khảo:

| lượt | cpu p50 | p95 | p99 | draw call | tam giác |
| --- | --- | --- | --- | --- | --- |
| cũ 1 | 11,3 | 20,2 | 68,8 | 201 | 1.097k |
| mới 1 | 9,6 | 15,5 | 54,5 | 198 | 1.074k |
| cũ 2 | 11,3 | 16,6 | 63,0 | 208 | 1.145k |
| mới 2 | 12,2 | 22,8 | 84,1 | 197 | 1.064k |

Không thấy hồi quy rõ (dao động giữa hai lượt cùng bản lớn hơn chênh lệch giữa hai bản). Lớp phụ chỉ chạy ở LOD0 trong khung nhìn, không cấp phát đối tượng ngoài vài `Vector3` tạm mỗi khung; cần đo lại lúc máy yên trước khi coi là chốt. Cả hai bản đều vượt ngân sách CPU p95 8 ms trong cảnh 50 người (đã vậy từ trước).

**Tay xuyên thân** (`pnpm shots chrv3anim --nopen` tắt; mặc định ghi `pen-<giới>-<bản>.json`): trung bình số đỉnh có xương tay trội (mẫu ~900 đỉnh LOD0) nằm trong ba viên nang thân (pelvis → cổ), lấy mẫu mỗi 120 ms trong từng tình huống. Chỉ số TƯƠNG ĐỐI, rất nhỏ (cùng một cách đo cho cả ba bản): cũ (`?v3anim=0`), mới không bù tay (`?armfit=0`), mới.

| Tình huống | cũ | mới |
| --- | --- | --- |
| đứng yên (3/4 trước) (nam) | 1,89 | 0 |
| chạy (3/4 trước) (nam) | 0,09 | 0,17 |
| chạy (góc ngang) (nam) | 0,08 | 0 |
| rẽ gấp (3/4 trước) (nam) | 0,17 | 0 |
| rẽ gấp (góc ngang) (nam) | 0,61 | 0 |
| chạy + chém (3/4 trước) (nam) | 0,09 | 0 |
| chạy + chém (góc ngang) (nam) | 0 | 0 |
| chuỗi 3 chiêu (đứng) (nam) | 1,21 | 7,73 |
| trúng đòn (nhẹ rồi nặng) (nam) | 1,46 | 0,17 |
| lăn / lướt (Q) (nam) | 1,58 | 0 |
| ngã rồi dậy (nam) | 2,11 | 0,83 |
| ngồi đả tọa (nam) | 0,34 | 0 |
| đứng yên (3/4 trước) (nu) | 0,8 | 0 |
| chạy (3/4 trước) (nu) | 0 | 0 |
| chạy (góc ngang) (nu) | 0 | 0 |
| rẽ gấp (3/4 trước) (nu) | 0 | 0 |
| rẽ gấp (góc ngang) (nu) | 0,13 | 0 |
| chạy + chém (3/4 trước) (nu) | 0 | 1,36 |
| chạy + chém (góc ngang) (nu) | 0 | 3,89 |
| chuỗi 3 chiêu (đứng) (nu) | 0,49 | 3,1 |
| trúng đòn (nhẹ rồi nặng) (nu) | 0,4 | 5 |
| lăn / lướt (Q) (nu) | 0,51 | 12,14 |
| ngã rồi dậy (nu) | 0,94 | 0,31 |
| ngồi đả tọa (nu) | 0 | 0 |

Lưu ý: ở `chuỗi 3 chiêu (đứng)` nam, chỉ số "mới" (7,73) CAO hơn "cũ" (1,21): chiêu K-5 vắt tay ngang ngực nên đỉnh tay đi qua viên nang thân; chưa phân biệt được đó là xuyên thật hay tư thế hợp lệ (khung hình không thấy lỗi rõ). Chỉ số lấy mẫu ~25 lần mỗi tình huống, rất nhiễu.

Quay: `pnpm shots chrv3anim --out <thư mục tuyệt đối> [--genders m,f] [--variants old,new,noarm]` (đặt `FFMPEG=` nếu không có trong PATH): quay riêng từng bản, ghi mốc đầu từng tình huống rồi cắt cùng tình huống (3,5 s, toàn thân, 3/4 trước + góc ngang cho chạy/rẽ/chạy+chém) từ hai bản, xếp trái cũ | phải mới vào `<giới>-cu-moi.webm`.


## NV3-A1: đi lùi, đi ngang, chéo (không Mixamo, không mocap/AI)

Dựng thủ tục bằng `tools/blender/ual_loco.py` (gọi từ `anim_ual_native.py`, chạy trong `node tools/blender/run.mjs --only anim_ual_native`), từ chính ba clip `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop` của UAL1:

| Clip mới (9) | Cách dựng |
| --- | --- |
| `Walk/Jog/Sprint_Bwd_Loop` | đảo chiều thời gian chu kỳ đi tới, dịch pha 0,5 (chân trụ trùng pha với clip tới/ngang để trộn chéo), thân ngả về trước được xoay ngược |
| `*_StrafeL_Loop`, `*_StrafeR_Loop` | xoay hông (pelvis + chân) quanh trục đứng ±90°, cột sống xoay ngược để thân trên vẫn nhìn tới, bàn chân bù 40% góc (mũi chân không chĩa ngang hẳn) |

Client (`mannequinAnim.ts` `dirMix`, `mannequin.ts`): `AnimState.moveAngle` (rad, 0 = tới, +π/2 = trái, ±π = lùi; `locoAngleOf` ở `packages/shared`, liên tục) → trọng số bốn hướng (chiếu lên bốn trục rồi chuẩn hóa: chéo 45° là trộn 50/50 hai clip kề nhau) × trọng số dải tốc độ (`locoMix`). Cả 12 clip chạy chung một pha (`locoPhase`, `timeScale = 0`), chu kỳ/giây = tốc độ ÷ sải. Khi nửa trên đang đánh (đòn dự phòng, chiêu K-5) chân theo clip đi-chạy trội nhất (`lowerSrc`, có trễ 0,15). Asset cũ không có clip hướng thì chỉ chạy clip tới (như trước).

### Đo trượt chân (offline, trong Blender)

Vị trí bàn chân trụ (xương `ball_*`, lúc bàn chân thấp hơn mốc 4,5 cm) theo chân xương, mỗi chu kỳ một lần. Tốc độ chân trụ phải bằng −S·u (u = hướng đi, S = sải): S khớp bình phương tối thiểu, **trượt = RMS(|v + S·u|) / S**. Clip tới gốc làm mốc nền (đi bộ có lăn gót nên nền 23%).

| Clip | Sải S (m/chu kỳ) | Trượt / S | Ghi chú |
| --- | --- | --- | --- |
| Walk tới (mốc) | 1,24 | 23,3% | |
| Walk lùi | 1,24 | 23,3% | cùng chuyển động, đảo chiều |
| Walk ngang trái / phải | 1,20 / 1,20 | 34,8% / 34,8% | |
| Jog tới (mốc) | 5,50 | 2,7% | |
| Jog lùi | 5,50 | 2,7% | |
| Jog ngang trái / phải | 5,35 / 5,43 | 9,0% / 6,5% | |
| Jog chéo 45° (trộn 50/50 tới + trái) | 5,45 | 5,7% | đúng cách client trộn |
| Sprint tới (mốc) / lùi | 5,94 | ≈ 0% (ít mẫu tiếp đất) | |
| Sprint ngang trái / phải | 5,88 / 5,80 | 6,5% / 5,4% | |

Trong game (7 m/s, chạy ≈ 60% chạy nhanh + 40% chạy): đi lùi trượt như đi tới; đi ngang khoảng 6–9% sải ≈ 40–60 cm/s ở 7 m/s (so với 2,7% = 19 cm/s của chạy tới). Sải của clip ngang lệch dưới 3% so với clip tới nên dùng chung bảng `LOCO` mà không nhảy nhịp khi đổi hướng.

Giới hạn (nói thẳng): chạy lùi là clip chạy tới chạy ngược nên đầu gối vẫn nâng như chạy tới; chạy ngang là chân sải sang bên với mũi chân bù 40%, chưa có bước chéo chân (cross-step). Xoay chân tại chỗ chuyển sang A2 (xem trên).
