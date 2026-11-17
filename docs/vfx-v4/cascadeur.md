# Chỉnh animation chiêu tối thượng bằng Cascadeur (hướng dẫn ngắn)

Đường nhập đã có từ V0; hướng dẫn đầy đủ ở `docs/vfx-v1/huong-dan-clip-ngoai.md`. Tóm tắt cho 3 chiêu tối thượng:

1. Chiêu: Kiếm tu `skl_van_kiem_quy_tong` (hit 0,5 s), Hộ pháp `skl_kim_cuong_bat_hoai` (0,4 s), Đan sư `skl_hoi_thien_dan_lo` (0,45 s). Giữ **mốc trúng** đúng các giây này (hoặc báo mình để đổi `hitAt` trong `methods.json`; server dùng `hitAt`).
2. Trong Cascadeur dùng khung xương Mixamo/Humanoid, 30 khung/giây, nhân vật nhìn +Z, dựng đủ: tụ khí (chậm) → vung/dâng tay (rất nhanh) → theo đà → thu về. Pháp tướng xuất hiện ở `hitAt − 0,3 s` và tan sau ~2,5 s, nên giữ dáng chủ đạo (dang tay/chắp ấn) khoảng 1,5 s sau mốc trúng.
3. Xuất FBX/GLB chỉ armature + animation, chạy: `node tools/blender/run-ext-clip.mjs --in <file> --name ext_<id chiêu> [--trim a:b]` → GLB chỉ-clip ở `../dtl-asset-source/anim/ext/`.
4. Gửi file cho mình hoặc worker kế tiếp: bước còn lại là nối clip `ext_<id chiêu>` vào `SkinnedCharacter.perform` thay pose IK (chưa làm; pose IK hiện tại là mặc định) và kiểm số đo khung trúng.
5. Xem thử tạm: `?mute=1&show=chr_kiem_tu_nam&lib=1`.

Hiệu ứng pháp tướng và camera kéo xa là dữ liệu timeline (`packages/content/data/fx/<chiêu>.json`, nguồn `tools/vfx/recipes_d.py`), tách khỏi animation nên đổi clip không cần đổi hiệu ứng, chỉ cần khớp mốc trúng.
