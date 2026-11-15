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

## Sửa sau soát PR #90

- Vỏ kiếm đeo lưng: kiểm trọng số trong GLB, vỏ và nút `dtl_sword` đều gắn xương `mixamorig_spine2` (ngực), không theo đầu. Kiếm chĩa ngang khi cúi gập ~90° là hệ quả hình học của clip; thêm `lean` (giới hạn độ cúi thân, `limit_lean` trong `anim_human_k3.py`) 50° cho `heavy_chop` và các clip `hit_*`.
- `attack` đổi tên `heavy_chop` (đòn dự phòng, không phải đòn kiếm chính); `chop` trùng nên bỏ. Map clip của người chơi/NPC trỏ `attack: 'heavy_chop'`.
- `dodge_back` phát nhanh 2,7×: 3,0 s → 1,1 s. `dodge_f/l/r` (2,4 s) giữ nguyên.
- Bỏ `cheer`, `greet`, `bow` khỏi thư viện (file nguồn còn trong `tripo_lib`). Thư viện K-3 còn 26 clip (cộng 5 clip nền = 31).

## Tách thư viện và sửa đối xứng (review PR #90)

- **Tách:** 26 clip K-3 nằm ở asset riêng `anim_human_k3` (`assets/source/anim/anim_human_k3/meta.json`, 1,34 MB, nạp lười: trang xem `lib=1` và K-4 dùng `HUMAN_K3_LIB`; `preload.ts` và `PlayerSkins` không nạp). `anim_human_base` chỉ còn 5 clip của M2-3 (`idle, run, heavy_chop` (trước là `attack`), `hit_light, death`), **286 KB** (trước K-3: 382 KB; nhỏ hơn nhờ dung sai lấy mẫu lại 1e-3 cho lớp `anim`). `humanClips.ts` ghi clip thuộc thư viện nào (`lib`).
- **Đo (`pnpm size`, `pnpm bench:load --runs 1`, 20 Mbps, WebGPU):** tải đầu 2,38 MB / 30 MB đạt; `anim_human_base` 286 KB về lúc 0,81 s, `chr_kiem_tu_nam` xong 1,63 s, vào game 4,63 s, `anim_human_k3` không tải. Khi gộp chung (bản trước khi tách) thư viện nền là ~1,99 MB, tức thêm ~1,6 MB ≈ 0,65 s ở 20 Mbps trước khi model thật thay khối, và mỗi mẫu nhân vật retarget 35 clip thay vì 5: đã tránh được. Retarget K-3 chỉ diễn ra khi nạp lười (trang xem, K-4), chưa đo cú khựng vì chưa nối vào game: K-4 cần retarget từng clip khi dùng lần đầu hoặc trong lúc rảnh.
- **Đối xứng:** `mirror_name` trước đây tìm `Left/Right` nhưng tên xương đã hạ chữ thường (`mixamorig_leftarm`) nên không đổi cặp, `hit_r` bị méo. Sửa tìm `left/right`; `hit_r.yawShoulder0` −156° → +17,1° (đối của `hit_l` −18,6°). Test `humanClips.test.ts` kiểm tay/chân/đầu của `hit_r` bằng `hit_l` lật X trên cả hai nhân vật.

## Vỏ kiếm lưng (review lần 2)

- **Gắn xương:** vỏ và nút `dtl_sword` là con của `mixamorig_spine2` (ngực) ở cả nam lẫn nữ; clip thư viện không có track `dtl_*` (exporter đã bỏ). Test `swordBack.test.ts` đo ở mọi clip của cả hai thư viện (31 clip × 2 nhân vật, mỗi 0,1 s): hướng vỏ so với spine2 lệch < 0,5° so với lúc nghỉ, nên vỏ **đi theo ngực chứ không theo đầu**.
- **Nguyên nhân thấy "ngang qua đầu":** ngực cúi sâu. Đo trước khi sửa: `dodge_f` cúi 50–70° suốt lúc ngồi thấp và 137° ở đỉnh lộn, `heavy_chop` 95°, `getup` 76°. Vỏ cố định chéo lưng nên cúi 60°+ thì nhìn như nằm ngang qua đầu.
- **Sửa:** `limit_lean` đo ngực (spine2 → cổ) so với phương đứng, chặn/nén phần vượt ngưỡng: `heavy_chop` 95° → 56°, `hit_*` ≤ 45°, `getup` 76° → 49°, `dodge_f/l/r` ngồi thấp 50–70° → 38–51° (đỉnh lộn 137° → 81°), `dodge_back` 152° → 87°. Clip thủ tục `combat_idle`/`guard` không đổi. Test giữ trần cúi (`LEAN_MAX`). `heavy_chop` ở thư viện nền nay đi qua `anim_human_k3.py` (cấu hình `import.k3` trong `anim_human_base/meta.json`, số đo ở `clips-base.json`).
- **Còn lại, cố ý:** `death` và `knockdown` giữ nguyên vì thân nằm; đỉnh lộn của `dodge_*` (~0,4 s, ngực 80°+) vỏ vẫn gần ngang vì thân đang lộn. Muốn hết hẳn thì phải tháo vỏ khỏi lưng lúc lộn (đổi chỗ socket), đó là việc của K-4.
