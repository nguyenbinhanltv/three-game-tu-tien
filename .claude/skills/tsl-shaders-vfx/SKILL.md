---
name: tsl-shaders-vfx
description: Viết shader và hiệu ứng hình ảnh cho Đạp Thiên Lộ bằng TSL (Three Shading Language) — phong cách thủy mặc/cel-shading, mây, sương, nước, kiếm khí, linh quang, thiên lôi độ kiếp, bloom. Dùng khi tạo hoặc sửa material, post-processing hay hệ particle.
---

# Shader và VFX bằng TSL

> Hiện trạng (M1-6, phong cách bán tả thực điện ảnh theo art bible v3): địa hình, cây, kiến trúc, nhân vật, quái dùng `MeshStandardNodeMaterial` cách điệu (`render/materials/world.ts`, nhám cao, không kim loại). Sương theo khoảng cách + theo độ cao và giảm bão hòa theo độ sâu là một `scene.fogNode` (`render/atmosphere.ts`), thay `FogExp2` của `env.ts`; atmosphere cũng đặt màu mặt trời/ánh trời/vòm trời và vẽ quầng sáng giả quanh đèn đá (1 draw call). Thông số chỉnh màu ở `render/grading.ts` (chép từ khối `grading` của `assets/palette.json`, preset dawn/day/night). Post-processing `render/post.ts`: bloom chọn lọc qua MRT (chỉ material đã `markBloom`, chỉ khi preset có bloom) → ACES → tách tông bóng lạnh/sáng ấm, nâng đen, đường cong S, bão hòa → `uHit` (viền đỏ + quang sai màu khi mình trúng đòn nặng) / `uFlash` → FXAA (Vừa) → vignette → hạt phim + dither. Hiệu ứng trong `game/vfx.ts` vẫn là `MeshBasicMaterial` cộng sáng tạo mỗi lần phát, chưa `markBloom` (việc M1-7). Các mục dưới đây là hướng làm tiếp; chỗ nào nói cel-shading/thủy mặc là định hướng cũ, theo art bible v3.

## Nguyên tắc

- Viết shader bằng TSL (`three/tsl`) với `NodeMaterial` để một bản chạy được cả WebGPU lẫn WebGL2. Không viết GLSL/WGSL thô trừ khi TSL không làm được.
- Mỗi material dùng chung đặt trong `apps/client/src/render/materials/`, xuất hàm tạo có tham số, không tạo material mới cho từng mesh.
- Tham số chỉnh được (màu, cường độ) đưa ra `uniform()` để chỉnh lúc chạy qua panel debug.

## Phong cách nhìn

- Bảng màu theo Art Bible: núi xa xanh lam nhạt pha xám, sương trắng ngà, ánh linh khí xanh ngọc, kiếm khí trắng xanh, ma khí tím đen, thiên lôi tím trắng.
- Địa hình và kiến trúc: PBR cách điệu (nhám cao, không kim loại), chỉnh màu điện ảnh ở hậu kỳ.
- Núi xa: shader thủy mặc — giảm bão hòa theo độ sâu, thêm nhiễu nét mực ở rìa, hòa vào màu sương.
- Sương mù theo độ cao (height fog) + fog theo khoảng cách để che biên tải.
- Mây: lớp mặt phẳng nhiều tầng hoặc impostor, nhiễu trôi theo thời gian; không dùng volumetric raymarch ở preset Thấp.

## VFX skill

- Particle dùng three.quarks hoặc hệ GPU tự viết bằng compute TSL (chỉ khi WebGPU; WebGL2 lùi về số hạt ít hơn).
- Mỗi hiệu ứng là một file cấu hình trong `packages/content/vfx/*.json` (thời lượng, màu, số hạt, hình dạng) để game designer chỉnh mà không sửa code.
- Ngân sách: tối đa 20.000 hạt hoạt động trên màn hình ở preset Cao, 5.000 ở Thấp. Hiệu ứng của người khác giảm 50% số hạt.
- Kiếm khí và phi kiếm: mesh dải (trail) + additive blending + bloom.
- Thiên lôi độ kiếp: tia sét sinh thủ tục (đường gấp khúc ngẫu nhiên theo seed từ server để mọi người thấy giống nhau), chớp sáng toàn cảnh ngắn, rung camera nhẹ.

## Post-processing

- Chuỗi: bloom chọn lọc → ACES → chỉnh màu → vignette → hạt phim/dither (xem `render/post.ts`). Bỏ SSAO/SSR ở preset Thấp và Vừa.
- Bloom chỉ áp cho vật có cường độ phát sáng cao (VFX, phi kiếm), không làm cả cảnh mờ nhòe.

## Kiểm tra

- Xem hiệu ứng trên cả WebGPU và WebGL2 (ép bằng query `?renderer=webgl2`).
- Chạy skill `perf-budget` sau khi thêm hiệu ứng nặng.
