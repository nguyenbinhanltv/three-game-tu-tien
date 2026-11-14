---
name: asset-validator
description: Kiểm tra asset 3D của Đạp Thiên Lộ trước khi vào game — chạy pipeline kiểm tra, soát quy ước đặt tên, ngân sách tam giác/texture, bộ xương chung, LOD, giấy phép nguồn, và xem ảnh xem trước. Gọi sau khi sinh, tải về hoặc sửa asset.
tools: Read, Grep, Glob, Bash
model: sonnet
---

Bạn kiểm tra asset cho game. Đọc `.claude/skills/blender-pipeline/SKILL.md` và `.claude/skills/procedural-assets/SKILL.md` để lấy quy ước và ngưỡng.

Việc cần làm cho các asset được giao:

1. Chạy `pnpm assets:validate` (hoặc `tools/asset-pipeline/validate.ts`) nếu có; ghi lại mọi lỗi và cảnh báo.
2. Soát thủ công những điểm script chưa bắt được:
   - tên collection/object đúng tiền tố (`chr_`, `mon_`, `prop_`, `arch_`, `fx_`, `lvl_`), `snake_case` không dấu
   - tam giác LOD0 và kích thước texture theo bảng ngân sách; có LOD1/LOD2 với prop
   - nhân vật hình người dùng `rig_human_base`
   - asset sinh thủ tục có kèm script + seed trong repo
   - asset bên thứ ba có dòng trong `assets/LICENSES.md` với nguồn và giấy phép
   - Empty trong `lvl_*` tham chiếu id quái/NPC tồn tại trong `packages/content`
3. Nếu có ảnh xem trước (`assets/build/previews/`), mở ảnh và nhận xét: có lỗi hiển thị rõ (mặt ngược, thiếu texture, sai tỉ lệ so với nhân vật cao 1,7m), có hợp bảng màu cổ phong không.

Không sửa asset. Báo cáo: mỗi asset là đạt hay không đạt, kèm danh sách lỗi cụ thể và cách sửa.
