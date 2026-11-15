# K-3: clip chung của thư viện `anim_human_base`

Nguồn: 24 clip tải từ thư viện animation Tripo web (`../dtl-asset-source/anim/tripo_lib/anim_<tên>_v01.glb`, 2026-11-16) + clip thủ tục bằng Blender. Dùng chung cho Thanh Phong (nam) và Lam Chi (nữ): cùng bộ xương Mixamo 54 khớp, client retarget theo tên xương (`animLib.ts`). K-3 **chưa nối vào máy trạng thái game** (đó là K-4); bộ cũ `idle, run, attack, hit_light, death` giữ nguyên.

Bảng clip, loại, tốc độ nền: `apps/client/src/game/character/humanClips.ts` (test `humanClips.test.ts` giữ khớp GLB). Số đo từng clip: `clips.json`.

## Quy trình

`assets/source/anim/anim_human_base/meta.json` (`import.clips`, `import.extra`, `import.k3`) → `tools/blender/anim_biped_extra.py` ghép clip và dựng clip thủ tục IK → `tools/blender/anim_human_k3.py` hậu xử lý → `export_anim_lib.py` bỏ mesh → `pnpm assets:build`.

`anim_human_k3.py` lấy mẫu 30 khung/giây ở không gian armature (= mô hình: +Z lên, mặt trước −Y), biến đổi ma trận xương rồi đổi lại quay/vị trí cục bộ từng xương:

| Việc | Cách làm | Kết quả đo |
| --- | --- | --- |
| Trôi gốc | `pin`: tịnh tiến cả cơ thể để thành phần **ngang** của hông cố định (bằng khung đầu `idle`), giữ nguyên nhấp nhô theo chiều đứng. Clip Tripo xuất "in place" nên hông chỉ lệch vài cm | hông ngang cố định ở mọi clip |
| Lệch hướng 90° | Đo góc đảo trục hông (trái→phải) và trục vai ở khung đầu so với tư thế nghỉ, bù nếu cả hai lệch > 20° | Cả 24 clip đều quay mặt đúng (không có clip lệch 90°); chỉ `kick_1/2` có thế mở đầu lệch 34° nên bị bù −34° (cột `yawFixed` trong `clips.json`) |
| Trượt chân | `lock`: tìm pha chân trụ (cổ chân trong 2,5 cm trên điểm thấp nhất), hồi quy vận tốc nền chung, đưa cổ chân đi đúng đường thẳng đều rồi IK hai đốt (giữ độ cao cổ chân và hướng bàn chân), hòa dần ở hai đầu pha; pha nối qua chỗ lặp tính là một | `walk`: trượt tối đa 19 cm → **1,7 cm** |
| Vòng lặp | `loop`: dồn chênh lệch cuối-đầu đều dọc clip (slerp/tuyến tính ở không gian basis) | `walk, back, strafe_*`: lệch vòng ≤ 1 mm |
| Dẫn xuất | `strafe_l/r` = walk, hông xoay ±90°, ba đốt sống vặn ngược 30° mỗi đốt để ngực vẫn quay về trước; `back` = walk đảo thời gian; `hit_r` = `hit_l` đối xứng (Δ = M·rest⁻¹ lật trục X); `dodge_l/r` = `dodge_f` xoay cả thân theo sin² (0 → 90° → 0) nên lăn sang bên rồi trả mặt về trước; `cast_walk` = thân dưới `walk` + thân trên `cast_stand` (ping-pong, ghép ở không gian basis); `getup` | xem dưới |
| Đứng dậy | `knockdown` khung cuối (nằm sấp) → ngồi xổm (khung của `dodge_f` sau đáy lăn) → thủ thế `combat_idle`. Mỗi nhóm xương nội suy với độ trễ riêng: pha 1 (0,95 s) đầu dẫn, tay, cột sống, hông, **chân vào sau**; pha 2 (0,7 s) **chân đẩy trước**, hông, thân trên, đầu theo sau; nâng cả thân để bàn chân/tay/đầu không chui xuống đất | 1,63 s, không gập-mở đồng loạt |
| Thủ tục IK | `combat_idle` (bước chân so le, hạ trọng tâm 5%, vai phải ra trước, tay phải cầm kiếm thấp, tay trái trước ngực), `guard` (hai cẳng tay vắt chéo trước ngực), `hit_back` (lưng ưỡn, chân vọt tới, hai tay văng ra sau), `roar` | khung 0 = dáng nghỉ |

Bỏ clip không hợp tu tiên hoặc không dùng: `sit` (ngồi ghế, đả tọa vẫn dùng pose `tam_thien`), `turn`, `look_around`, `standing_relax` (idle sẵn đã đủ, 15–17 s nặng), `defeat` (đứng gục đầu, không ngã), `angry_01` (động tác dang tay, thay bằng `roar` thủ tục). Chưa có `sit_meditate`: không có clip ngồi xếp bằng phù hợp.

## Ảnh (GPU thật, Chrome, tắt tiếng)

Tạo lại: `pnpm dev` hoặc chỉ Vite (`CLIENT_PORT=5195`), rồi `CLIENT_PORT=5195 pnpm shots:k3 --out <đường dẫn tuyệt đối> [--models nam,nu] [--mode sheets|slip|all]`. Xem clip ở trang xem: `?mute=1&show=chr_kiem_tu_nam&lib=1` (hoặc `chr_kiem_tu_nu`), chọn clip trong danh sách.

- `nam-clips-0N.jpg`, `nu-clips-0N.jpg`: mỗi clip một hàng 6 ảnh đều theo thời gian.
- `nam-slip-<clip>.jpg`, `nu-slip-<clip>.jpg`: clip đi lại chạy với model tịnh tiến đúng tốc độ nền; đĩa đỏ = chỗ chân trụ chạm đất, chân phải đứng đúng đĩa trong cả pha trụ. Số đo ở `slip.json` (độ trượt tối đa của cổ chân trong pha trụ):

| Clip | Thanh Phong | Lam Chi | Tốc độ nền (m/s) |
| --- | --- | --- | --- |
| `walk` | 1,7 cm | 2,4 cm | 0,98 |
| `back` | 2,0 cm | 2,5 cm | 0,97 |
| `strafe_l` | 1,7 cm | 2,3 cm | 0,97 |
| `strafe_r` | 1,6 cm | 2,3 cm | 0,98 |
| `run` (cũ, không đổi) | 3,0 cm | 3,5 cm | 3,09 (Lam Chi khớp nhất ở 3,34) |

Lam Chi cao 1,68 m nhưng bước dài hơn ~6% so với tỉ lệ hông (nhân tốc độ nền ≈ 1,06 khi K-4 gắn tốc độ phát clip).

## Ghi chú cho K-4

- Clip Tripo dài vì có đoạn nghỉ hai đầu: `cast_stand` 5,3 s, `chop` 3,9 s, `dodge_back` 3,0 s, hit 1,3–1,8 s. Máy trạng thái nên phát nhanh (`timeScale`) và/hoặc cắt theo mốc; cần chọn mốc `hitAt` theo từng clip.
- Clip `hit_*` bắt đầu và kết thúc ở thế thủ tay quyền (hai nắm tay trước mặt), nên khớp `combat_idle` hơn `idle`.
- Kiếm vẫn đeo lưng trong mọi clip của thư viện; chuyển kiếm sang tay vẫn do `placeSword`/pose IK lo.
- Dung lượng thư viện: 382 KB → ~1,9 MB (thêm 30 clip, dung sai lấy mẫu lại 1e-3 cho lớp `anim`).
