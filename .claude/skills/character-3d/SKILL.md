---
name: character-3d
description: Quy trình làm một bộ nhân vật v3 (Tripo → Blender → game) cho Đạp Thiên Lộ từ đầu đến cuối — ảnh A-pose + multiview, Tripo Multiview do người dùng dựng, giữ nguyên lưới/UV/texture gốc, rig bind A-pose trên bộ xương UE5 Mannequin, tách lưới voan/vạt/chân, trọng số theo lớp, clip áo bào, đo rigstretch/v3views và tiêu chí đạt, bảng lỗi đã gặp. Dùng khi thêm hoặc sửa bộ nhân vật mặc đồ (kiếm tu, hộ pháp, đan sư), khi nhân vật bị xé vải/voan bung/hỏng mặt-tay, hoặc khi áp quy trình cho bộ mới.
---

# Nhân vật 3D v3: từ ảnh đến game

Quy trình đã chạy trọn vẹn cho `Tinh Khuyết Kiếm Bào` nữ (NV3-B, cách 1 = rig + trọng số, cách 2 = tách lưới, 20/11). **Mức đạt hiện tại là mức nền, chưa phải đích**: người dùng chấm "ổn hơn nhưng chưa wow". Hướng tiếp ở mục 10. Đã áp đợt 1 (Kiếm tu, 5 model) và đợt 2 (Hộ pháp, 6 model, mục 11); các đợt còn lại cần người dùng duyệt ảnh từng đợt.

Chi tiết từng chặng (lệnh, tham số, số đo): `input-tripo.md`, `rig-split.md`, `anim-verify.md`, và `weights-proportions.md` (bảng tỉ lệ đầu, bảng kiểm trọng số/twist/tư thế cực đoan, gợi ý vải; cùng thư mục `references` của skill). Lịch sử và số đo các đợt N-0…N-9: `docs/chr-v3/README.md`. Phối hợp với skill `blender-pipeline` (Blender nền, LOD, KTX2), `tsl-shaders-vfx` (vật liệu), `perf-budget`, `playtest`.

## 1. Đầu vào (người dùng làm phần Tripo, **không API, không credit**)
1. Codex sinh ảnh concept **A-pose** + **multiview 4 góc** `<bộ>_<nam|nu>_{front,left,right,back}.png` vào `2d/hoa-truc/thien_giai/` trong `dtl-asset-source` (ngoài repo, `../dtl-asset-source` hoặc `DTL_ASSET_SOURCE`).
2. Người dùng dựng trên **Tripo web → Multiview to 3D** (H3.1, PBR, chi tiết cao nhất, **không Auto Rig**, tắt tự đổi tư thế), tải GLB.
3. Đặt tên và thư mục cố định: `3d/nhan-vat/set_<bộ>/tripo/raw_v3_<bộ>_<nam|nu>.glb`. Sai đường dẫn thì job build bỏ qua với cảnh báo.
4. Kiểm trước khi nhận: **A-pose** (tay dang ~45°, chân hơi tách) bằng tỉ lệ bbox rộng/cao; **không vũ khí** (kiếm gắn rời trong game); **không bóng đổ/nền** dính chân; vạt không dính chân, tóc dài là khối riêng. Chi tiết ở `input-tripo.md`.

## 2. Nguyên tắc không phá model (bất biến)
- **LOD0 = lưới, UV, texture, pháp tuyến GỐC của Tripo** (`--keep-original`: không hàn đỉnh, không decimate, không hạ texture). Blender **chỉ thêm** xương, trọng số, và (C2) cắt cạnh + thêm thân dưới áo. Chứng minh bằng so cặp (vị trí, UV) gốc/sau: còn đủ, không đỉnh gốc nào đổi vị trí.
- **LOD1/LOD2 do `tools/asset-pipeline` sinh** theo lớp `player_v3_hi` trong `assets/budgets.json` (LOD0 tối đa 110k tam giác, LOD1 24k, LOD2 8k, texture 4096); phải bảo vệ mặt và bàn tay (trọng số đầu mềm + decimate mạnh đã làm hỏng mặt, mục 8).
- Server quyết định mọi thứ không đổi; đây chỉ là phần hiển thị. Chuỗi hiển thị qua i18n.

## 3. Rig: bind A-pose, giữ tên UE5 Mannequin
- Chạy `tools/blender/chr_v3.py` qua `node tools/blender/run.mjs --only chr_v3_<bộ>_<giới>` (job sinh từ `tools/blender/skins/v3sets/<bộ>.json`: `bindA`, `keepOriginal`, `splitCloth`, `height`, `groups`, `robe`, `sleeve`, `anatomy`).
- `--bind-a`: **không ép T-pose** (biến dạng T làm vạt/tay áo méo). Khung xương đặt theo lưới A; sau xuất, góc nghỉ cục bộ của nút xương = template UAL để clip phát trực tiếp.
- **Mốc giải phẫu đo trên lưới** (khối `anatomy`: `shoulderDz`, `ankleX`, `spine3Z`, làm mượt) thay cho ước lượng `--auto`; kiểm bằng ảnh xương chồng lên lưới (sai số vài cm). Mốc đúng giúp nhưng **không đủ** để giảm lỗi vải (mục 8).
- Tên xương giữ nguyên Mannequin (clip UAL dùng chung), thêm `dtl_sword`, `dtl_scabbard`, `dtl_head_acc`, twist, lò xo `dtl_o_*`. **Trần 128 xương** (`player_v3`); tối đa 4 xương/đỉnh.

## 4. Tách lưới (C2): script `chr_v3_c2.py`, bật bằng khối `c2` trong JSON bộ
1. **Phân vùng đỉnh**: thân/đầu/tay/giáp vai (0), voan trái/phải (1, 2), vạt váy trước/sau (3, 4), chân/ủng (5). Voan = lớp sáng-lavender ngoài trục thân (ngưỡng màu texel + `veilX`, `veilXLow`, `veilZLow`, `armKeep`) rồi lọc đa số trên đồ thị cạnh; vạt = dưới `waistZ`; chân = trong `legR` quanh xương cẳng/bàn và dưới `legZ`. **Ngưỡng là riêng từng bộ**: chỉnh và xem ảnh phân vùng trước khi chạy tiếp.
2. **Cắt**: `bmesh.ops.split_edges` mọi cạnh giữa hai mặt khác vùng: đỉnh ở đường cắt nhân đôi (cùng vị trí/UV/pháp tuyến). Mục tiêu: cạnh cầu nối voan–khác và chân–khác về 0 (trước ~1.249 và ~2.325).
3. **Viền mềm** `seamTie` 0,3: hai bản sao ở đường cắt trộn trọng số 30% về trung bình. 0 gần như vô hại số đo nhưng dễ hở mép; 0,5 kéo ủng theo hông.
4. **Thân dưới áo**: ống elip hông/thân (bán kính ≈ 0,85 × bách phân vị 10 khoảng cách đỉnh vải), UV trỏ vào một texel nền áo có sẵn (cùng vật liệu, **không thêm draw call**), trọng số cứng theo xương lõi. Ống đùi/cẳng/tay **tắt** (lòi ra ngoài vải thành "que"): `legTube`, `armTube`.
5. **Assert** trong script: không đỉnh gốc đổi vị trí; số đếm ghi vào `--report`.

## 5. Trọng số theo lớp + xương phụ
- **Voan**: phần trên bám xương tay theo độ gần trục tay, phần dưới về hông; **chuỗi xương phụ riêng** `dtl_o_sleeve_veil_<l|r>_<k>_<j>` (3 dải × 2 đốt mỗi bên) với **cha = `pelvis`** (cha = cẳng tay làm gấu văng theo tay). Tên `dtl_o_sleeve_*` để client áp nhóm lò xo "tay áo" (cứng, góc hẹp).
- **Vạt**: `skirtThighK` 0,5 bớt phần bám đùi/cẳng/bàn chân (hai nửa váy ăn hai chân nên xé khi bước), dồn về hông; **chân/ủng** chỉ ăn xương chân cùng phía; **mặt nạ phía** (đỉnh trái không ăn xương phải).
- **Làm mượt theo vùng** (12 vòng, chỉ trên cạnh cùng vùng) rồi giới hạn 4 xương. Đầu và bàn tay cứng.
- Ngân sách: 115 xương (C4) + 12 = **127**; 4 dải × 3 đốt = 139 vượt trần 128 (validate báo lỗi).

## 6. Clip áo bào: script `anim_robe.py` → asset `anim_robe`
- Giữ **tên clip và tên xương** UAL; client chỉ dùng cho asset giữ gốc (`KEEP_ORIGINAL_ASSETS` trong `apps/client/src/game/character/mannequin.ts`; `?norobeanim` để so).
- **Giữ tư thế trung bình của clip, chỉ thu biên độ quanh nó**: `q' = slerp(1, q̄, base) · slerp(1, q̄⁻¹·q, amp)`, tay `base` = 1,0. **Không** slerp về quaternion đơn vị (= T-pose): Idle UAL gốc buông tay ~23°, bind A 26°; kéo về T giang tay 36° (Jog 75°) và voan bung như cánh.
- Hệ số: tay `amp` 0,5–0,65, chân 0,55–0,8, thân 0,5–0,85 (Roll nhỏ nhất). 15 clip: Idle, Spell_Simple_Idle, Sitting_Idle, Sword_Idle, Walk, Jog_Fwd, Sprint, Jump_Loop, Sword_Attack, Sword_Regular_A/B/C, Roll, Hit_Chest, Hit_Knockback. Jog lùi/đi ngang (K-3) nằm ở thư viện khác, chưa có bản áo bào.

## 7. Đo và tiêu chí đạt
Chạy với **`?mute=1`/`--mute-audio`** (skill `playtest`). Một vòng build + tối ưu + đo ~2 phút:
- `node tools/blender/run.mjs --only chr_v3_<bộ>_<giới> --force`. **Kiểm log không có `Traceback`: run.mjs vẫn trả 0 khi script Python lỗi và giữ asset cũ.**
- `pnpm --filter @dtl/asset-pipeline exec tsx src/cli.ts optimize --only <id> --force` (thêm `--no-ktx` khi lặp nhanh; bản cuối phải có KTX2).
- `pnpm shots rigstretch --out <dir>` (cạnh giãn/nén theo 15 clip), `pnpm shots v3views --out <dir> --sets <bộ> --genders f` (4 góc + tờ chuyển động 15 khung), `pnpm assets:validate --only <id>`.

| Tiêu chí | Ngưỡng | C2 Tinh Khuyết nữ |
|---|---|---|
| Idle cạnh sai (giãn >1,8× hoặc nén <0,55×) | < 1% | 0,4% (gốc 3,9%) |
| Jog, chém giảm so gốc | ≥ 70% | −85%, −79% |
| p99 tỉ lệ cạnh (max theo khung) | < 3 | 1,4–2,5 (15 clip) |
| Roll | không tệ hơn gốc | −79% |
| Mảnh nhọn ở 15 khung | không còn | gần hết; còn mảnh trắng nhỏ ở mép |
| Xương / LOD0 | ≤ 128 / `player_v3_hi` | 127 / 99.518 |
| Console, validate | 0 lỗi | đạt |

Ảnh nộp: 4 góc 1080p, 15 khung, heatmap cạnh (Idle, Jog, chém, Roll), **ba cột gốc / bản trước / bản mới**; ảnh trước-sau chi tiết mặt, bàn tay, hoa văn. **Phép đo cạnh không thấy khe hở ở đường cắt** (cạnh đã bị cắt): luôn xem ảnh.

## 8. Lỗi đã gặp và cách tránh
| Lỗi | Hậu quả | Cách tránh |
|---|---|---|
| Ép model về T-pose để rig | vạt/tay áo méo, "cánh" đôi | `--bind-a`, giữ A-pose |
| Decimate 99k → 23k + trọng số đầu mềm | hỏng mặt, bàn tay | LOD0 giữ gốc; LOD1/2 do optimize, đầu/tay cứng |
| Clip UAL Idle cúi đầu ~13° | nhìn xuống | ngửa đầu bù (cổ 40%, đầu 60%) cho model giữ gốc |
| Look-at theo sai tên xương (`Head` hoa/thường) | đầu không quay | dùng đúng `Head`, `neck_01` của Mannequin |
| Vật liệu Tripo metallic = 1 (thiếu hệ số), tóc roughness thấp | da/tóc bóng như nhựa | ép metallic/roughness da và tóc trong `mannequin.ts` |
| Chuôi kiếm trên lưng (`dtl_scabbard`) xuyên đầu | kiếm cắt qua đầu | hạ chuôi (`posScab`) cho model giữ gốc |
| Chỉ sửa mốc giải phẫu | Idle chỉ giảm 3,3% → 1,6%, Jog/chém không đủ | mốc + trọng số mặt nạ + **tách lưới** mới đủ |
| Clip kéo tay về T (slerp từ quaternion đơn vị) | voan bung như cánh khi đứng | giữ tư thế trung bình (mục 6) |
| Chuỗi voan có cha = cẳng tay | gấu voan văng theo tay | cha = `pelvis` |
| Thêm ống tay/chân vào thân dưới áo | que xanh đậm lòi ra | chỉ ống thân/hông |
| 4 dải × 3 đốt voan | 139 xương > 128 | 3 × 2 (127) |
| `run.mjs` trả 0 khi Python lỗi | đo trên asset cũ, tưởng thay đổi vô tác dụng | grep `Traceback` mỗi lần build |
| Tripo Segment "Auto Detailed" (78 mảnh `tripo_part_N`) | mảnh vô nghĩa, không tách được vải | không dùng; tách vùng bằng hình học + màu |
| Thiên Y: dựng lại vải bằng mô phỏng, vai dừng lại | khối vuông, CPU ×8 | giữ lưới gốc, chỉ rig; mô phỏng vải (`?cloth`) chỉ để thử |
| Phép đo "xuyên thân" cũ xếp nhầm cột twist/lò xo | số ảo (−73%) | dùng `rigstretch` trong game |

## 9. Checklist áp cho bộ mới
Ước thời gian: ~0,5–1 ngày/model nếu cấu hình có sẵn, 2–3 ngày với bộ có vải lạ.
1. **[người dùng]** Ảnh multiview đã duyệt → dựng Tripo → GLB đúng tên/thư mục.
2. Đo A-pose; tạo `tools/blender/skins/v3sets/<bộ>.json` từ mẫu `_template_ao_dai.json` hoặc `_template_giap.json`; `node tools/blender/v3-newset.mjs <bộ>`.
3. Đặt `bindA`, `keepOriginal`, `anatomy`; build; xem ảnh xương chồng lưới.
4. Bật `c2`; chỉnh ngưỡng; xem ảnh phân vùng; build; kiểm 0 cạnh cầu nối.
5. Thêm/kiểm `anim_robe` cho bộ (tên asset thuộc `KEEP_ORIGINAL_ASSETS`).
6. Đo mục 7, lặp đến đạt; nộp ảnh gốc/trước/sau. **[người dùng duyệt ảnh]** trước khi PR.
7. `assets:validate`, `pnpm lint`, `pnpm typecheck`; PR nhỏ theo bộ.

## 10. Hướng tới mức "wow" (chưa làm)
Cạnh sai giảm 80–90% mà người dùng vẫn chưa thấy "wow" ⇒ điểm nghẽn chuyển từ biến dạng sang **hình ảnh**. Xếp theo tác động/chi phí (đề xuất, chưa kiểm chứng); luôn so với ảnh multiview Thiên Giải và để người dùng chấm.

| # | Hạng mục | Vì sao | Cách đo |
|---|---|---|---|
| 1 | Ánh sáng nhân vật (key/rim riêng, độ phơi sáng; cả trong bảng nhân vật/xem trước) | khác biệt lớn nhất giữa ảnh duyệt và trong game | ảnh 4 góc ở 3 mood + bảng nhân vật cạnh multiview; người dùng chấm |
| 2 | Chất liệu da/tóc: SSS giả (wrap-light ở tai/mũi), sheen vải (voan, lụa), tóc anisotropic | da nhựa, vải phẳng | ảnh cận mặt/vai ở 3 mood; `bench:client` không tăng quá ~0,3 ms CPU/nhân vật |
| 3 | Voan mép trắng khi chém/lướt | mảnh sáng nhỏ làm "rách" | ảnh 15 khung (chém 1–3, lướt); đếm đỉnh viền alpha; chỉnh lò xo nhóm `sleeve` và mép |
| 4 | Clip áo bào lùi/đi ngang (K-3: Jog_Bwd, Strafe) | đang dùng clip gốc biên độ lớn | `rigstretch` thêm các clip này, tiêu chí như mục 7 |
| 5 | Tóc dài: lò xo cho phần tóc rũ (5–10% cạnh sai ở `lo_xo_toc`) | tóc cứng/xé | dòng `lo_xo_toc` trong rigstretch; video chạy/xoay |
| 6 | Đẩy vạt theo bước chân (lực theo hướng bước) | vạt chỉ lắc thụ động | video chạy thẳng/ngang; so độ lệch vạt với hướng bước |

Mỗi hạng mục: một PR nhỏ, ảnh gốc/trước/sau, ngân sách (`perf-budget`) và 0 lỗi console.

## 11. Hộ pháp / giáp (NV3-ROLL đợt 2): khác Kiếm tu ở đâu
Áp cho Cổ Thành, Địa Long, Vạn Kinh (nam + nữ; cấu hình `v3sets/{co_thanh,dia_long,van_kinh}.json`, cùng `c2` với Kiếm tu). Giáp thật ra là áo bào có voan + vai giáp + hộ uyển, nên dùng chung `chr_v3_c2.py`, nhưng có ba chỗ phải chỉnh riêng:
| Triệu chứng (rigstretch) | Nguyên nhân thật | Cách sửa (khóa cấu hình) |
|---|---|---|
| p99 > 3 ở chém/ngã, số cạnh sai tổng đã giảm tốt (nghèo p99, không nghèo %) | Voan tay áo rủ ngang tầm bàn tay/hông: đỉnh cách tay 6–12 cm bám `pelvis`, đỉnh sát tay bám `hand` → trọng số đổi trong vài cm, tay giơ làm cạnh giãn >4× (đo: ~640 đỉnh `pelvis` quanh mỗi bàn tay) | **Ảnh hưởng tay giảm theo khoảng cách dọc vải (Dijkstra trên cạnh nội vùng voan), không theo Euclid**: `c2.armFall` `"geo"`, `armGeoR` 0,5, `geoSeed` 0,08 (đơn vị phần chiều cao 1,7 m). Euclid + Gaussian hẹp, tăng `smooth`, đổi `veilChain/veilArmR`, `headR`, `headBandLow` chỉ giảm số cạnh, p99 gần như không đổi (4,34 → 4,14); geodesic đưa Vạn Kinh nam về 2,2–3,2 trong một bước |
| Bàn tay cứng bị kéo, 63–66% đỉnh `hand_*` có tỉ lệ cạnh >3 | Hộ uyển nằm sát cổ tay: bàn tay cứng bắt đầu ngay tại cổ tay nên cạnh hộ uyển ↔ bàn tay gánh cả góc xoay cổ tay | `anatomy.handBlend` (m, ≈0,025): bàn tay cứng chỉ từ +hb, trong ±hb trộn tuyến tính từ trọng số tay |
| Tưởng do cổ áo cao/vai rồng | Sai: cạnh `Head | clavicle` chỉ là cặp trội, nới dải cổ (`anatomy.headBandLow`) và giới hạn đầu cứng theo x (`headR`) không đổi số đo | giữ mặc định; chỉ dùng khi ảnh thấy cổ xé |
Đo đúng chỗ trước khi chỉnh: chạy `pnpm shots rigstretch … --clips Idle_Loop,Sword_Attack` rồi gom `rigstretch-worst-*.json` + `rest.json` theo xương trội và độ cao (đỉnh xấu tập ở xương/độ cao nào), thay vì đoán. `ANAT_JSON='{"handBlend":0.025}'` và `C2_JSON='{"armFall":"geo"}'` thử nhanh không sửa file; `V3_NO_C2=1` dựng bản C4 để lấy số "gốc".
Khác khi nhập bộ mới: `v3-newset.mjs` tạo `meta.json` nhưng đổi tay `budgetClass` sang `player_v3_hi` (110k tam giác, texture 4096); thêm id vào `V3_OWN_SETS` (bộ `set_dia_giap` → `dia_long`; id bộ ≠ tên asset), `KEEP_ORIGINAL_ASSETS`, `SKIRT_TUNE`, `ARM_FIT` ở `mannequin.ts`; script đo phải truyền đúng id bộ (đo nhầm sang `set_dia_long` sẽ rơi về model mặc định và cho số ảo). Model nam cao 1,84 m: mốc giải phẫu tính lại (`anatomy.nam`), `handKeep` cho tay buông dưới eo, ghi đè theo giới `c2.nam|nu`, `anatomy.nam|nu`. LOD2 vượt trần khi tối ưu (Vạn Kinh nữ 8.489): ngưỡng chấp nhận LOD trong `optimize.ts` là 1,04× mục tiêu (từng 1,10× nên lọt qua `validate` 1,05×).

## 12. Chuẩn "Thân Pháp" (animation nhân vật cho camera chéo; giống HPL2 của VFX)
Kế hoạch gốc: pha TP-0..TP-6 (artifact "nhan-vat-animation" của phiên Chân Cảnh). Camera chéo đặt nhân vật xa và nhỏ: thứ đọc được là **bóng dáng, nhịp, màu**, không phải mặt và họa tiết. Mọi PR animation phải qua sáu cổng:
1. **Bóng dáng đọc được ở góc chéo 720p**: ảnh khung đỉnh đòn ở camera chéo (cắt giữa khung) vẫn thấy rõ tay, kiếm, hướng đòn.
2. **Ba tư thế khóa + khung giữ**: dồn lực (anticipation) → đỉnh đòn GIỮ 2–4 khung kiểu anime (key `ease: "linear"` hai khung liền cùng tư thế, hoặc `stepped`) → thu đòn. Giữa các tư thế chuyển nhanh. Dữ liệu ở `packages/content/data/poses/<id>.json` (key IK), không viết cứng trong code.
3. **Không trượt chân, không xuyên vũ khí vào thân** (IK chân `mannequinFeet`, `rigstretch`, ảnh cận).
4. **Chuyển động phụ có mặt**: tóc, tua kiếm, dải lụa chạy lò xo (`spring.ts`), chung với Thiên Y (`?cloth=1`) chứ không thay thế.
5. **Khớp nhịp VFX và hit-stop**: khung đỉnh đòn trùng `hit[0]` của pose, `hitAt` của chiêu và mốc 0 của timeline FX; nét kéo (smear)/tàn ảnh đồng bộ.
6. **Trong ngân sách**: CPU tổng < 8 ms/khung, mục `anim` của `FrameBudget` đo trước/sau (đứng và chạy); LOD animation cho nhân vật xa (xương thưa 15–30 Hz, spring bone chỉ LOD0); lớp mới nằm sau cờ `?thanphap=1` cho tới khi người dùng duyệt.

Công cụ: phòng thử **`?animlab=1`** (chỉ dev; `window.__animlab`: `pause/step/scale`, `cam('iso'|'close'|'front'|'side')`, `perform(pose)`, `moments(pose)`, `cpu()`, `fx({...})`) và `pnpm shots animlab --out <thư mục> [--pose a,b] [--cams iso,close] [--sizes 720p,1080p] [--thanphap 0|1] [--ref <ảnh>] [--clip 1] [--cpu 1] [--gender m|f]`: tự chụp bốn khung khóa (dồn lực / đỉnh / +30 ms / thu), dải so sánh, đo CPU xương lúc đứng và lúc chạy, quay clip thật. Ảnh nộp: bốn khung ở camera chéo + cận, 720p và 1080p, trước (`--thanphap 0`) và sau (`1`), bảng CPU. Ảnh tham chiếu/video mẫu để ở artifact phiên, không commit.
Lớp cường điệu T1 (`apps/client/src/game/character/animFx.ts`): khuếch đại độ lệch so với tư thế nghỉ của tay/vai/hông +15–30% (`EXAG_GAIN`, chỉ khi chạy), nảy bước (`bobOf`), nghiêng khi rẽ mạnh hơn (`leanBoost`).
