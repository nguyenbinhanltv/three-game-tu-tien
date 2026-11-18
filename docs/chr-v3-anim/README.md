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
- **Đi lùi / đi ngang**: UAL không có clip lùi/ngang (đã soát cả UAL1 và UAL2), nên chưa có; cần clip ngoài hoặc dựng thủ tục.
- **Rẽ tại chỗ bằng bước chân** (xoay chân): chỉ xoắn thân trên; chân không bước xoay vì không có clip xoay tại chỗ.
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
