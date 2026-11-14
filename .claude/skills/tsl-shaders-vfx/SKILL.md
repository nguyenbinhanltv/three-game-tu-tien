---
name: tsl-shaders-vfx
description: Viết shader và hiệu ứng hình ảnh cho Đạp Thiên Lộ bằng TSL (Three Shading Language) — PBR cách điệu bán tả thực, chỉnh màu điện ảnh tông sương sớm, sương theo độ cao, mây, nước, kiếm khí, linh quang, thiên lôi độ kiếp, bloom. Dùng khi tạo hoặc sửa material, post-processing hay hệ particle.
---

# Shader và VFX bằng TSL

> Hiện trạng (M1-6, phong cách bán tả thực điện ảnh theo art bible v3): địa hình, cây, kiến trúc, nhân vật, quái dùng `MeshStandardNodeMaterial` cách điệu (`render/materials/world.ts`, nhám cao, không kim loại). Sương theo khoảng cách + theo độ cao và giảm bão hòa theo độ sâu là một `scene.fogNode` (`render/atmosphere.ts`), thay `FogExp2` của `env.ts`; atmosphere cũng đặt màu mặt trời/ánh trời/vòm trời và vẽ quầng sáng giả quanh đèn đá (1 draw call). Thông số chỉnh màu ở `render/grading.ts` (chép từ khối `grading` của `assets/palette.json`, preset dawn/day/night). Post-processing `render/post.ts`: bloom chọn lọc qua MRT (chỉ material đã `markBloom`, chỉ khi preset có bloom) → ACES → tách tông bóng lạnh/sáng ấm, nâng đen, đường cong S, bão hòa → `uHit` (viền đỏ + quang sai màu khi mình trúng đòn nặng) / `uFlash` → FXAA (Vừa) → vignette → hạt phim + dither. Hiệu ứng (`game/vfx.ts`, `game/telegraph.ts`, từ M1-7) lấy lưới từ `FxPool` trong `render/materials/vfx.ts`: mỗi kiểu (`glow` cộng sáng có bloom, `flat` cộng sáng không bloom cho vùng báo trước, `solid`, `shade`) chỉ có một `MeshBasicNodeMaterial` cho cả game; màu/opacity/tiến độ là uniform theo lưới (`onObjectUpdate`, đọc `fxColor`/`fxOpacity`/`fxK` của `FxMesh`). Phát hiệu ứng không tạo material, không dispose material; đỉnh màu một lớp chặn ở `FX_MAX_HDR` 2,4; material đặt `forceSinglePass` (trong suốt 2 mặt mặc định tốn 2 draw call). Hiệu ứng mới: dùng `vfx.fx(geo, màu, opacity, kind)` và `vfx.drop(m)`, đừng `new MeshBasicMaterial`. Các mục dưới đây là hướng làm tiếp; chỗ nào nói cel-shading/thủy mặc là định hướng cũ, theo art bible v3.

## Nguyên tắc

- Viết shader bằng TSL (`three/tsl`) với `NodeMaterial` để một bản chạy được cả WebGPU lẫn WebGL2. Không viết GLSL/WGSL thô trừ khi TSL không làm được.
- Mỗi material dùng chung đặt trong `apps/client/src/render/materials/`, xuất hàm tạo có tham số, không tạo material mới cho từng mesh.
- Tham số chỉnh được (màu, cường độ) đưa ra `uniform()` để chỉnh lúc chạy qua panel debug.

## Phong cách nhìn

**Nguồn chuẩn: `docs/art-bible.md`** (v3, bán tả thực điện ảnh): mục 3 (vật liệu), mục 5 (ánh sáng và chỉnh màu), mục 8 (điều cấm). Thông số số nằm trong khối `grading` của `assets/palette.json`. Khi skill này và art bible lệch nhau, art bible thắng.

- Material: PBR cách điệu bằng `MeshStandardNodeMaterial` (base color, normal, roughness/metalness của Tripo). Vải, đá, gỗ có roughness cao; kim loại có metalness. Không có bề mặt bóng như nhựa.
- **Không dùng cel-shading, toon 3 bậc hay viền mực inverted hull** (art bible mục 0.2 và 8.3). Hướng này đã bị bỏ.
- Tông sương sớm: vùng sáng ngả vàng ấm, bóng ngả ngọc lam, đen được nâng lên (không đen tuyền). Có 3 preset `dawn` / `day` / `night`; đêm dùng lam trầm cùng đèn lồng ấm, không dùng tông chàm tím.
- Màu linh quang: linh khí ngọc, kiếm khí trắng xanh, thiên lôi tím trắng, ma khí tím đen, kim quang. Tím chỉ làm điểm nhấn.
- Núi xa: giảm bão hòa theo độ sâu, hòa vào màu sương ngọc lam. Chất thủy mặc nằm ở các lớp sương và ở VFX mực.
- Sương theo độ cao (height fog) + fog theo khoảng cách, dày hơn hiện tại (`FogExp2` khoảng 0,0011 ban ngày), che luôn biên tải.
- Mây: lớp mặt phẳng nhiều tầng hoặc impostor, nhiễu trôi theo thời gian; không dùng volumetric raymarch ở preset Thấp.

## VFX skill

- Particle dùng three.quarks hoặc hệ GPU tự viết bằng compute TSL (chỉ khi WebGPU; WebGL2 lùi về số hạt ít hơn).
- Mỗi hiệu ứng là một file cấu hình trong `packages/content/vfx/*.json` (thời lượng, màu, số hạt, hình dạng) để game designer chỉnh mà không sửa code.
- Ngân sách: tối đa 20.000 hạt hoạt động trên màn hình ở preset Cao, 5.000 ở Thấp. Hiệu ứng của người khác giảm 50% số hạt.
- Kiếm khí và phi kiếm: mesh dải (trail) + additive blending + bloom.
- Thiên lôi độ kiếp: tia sét sinh thủ tục (đường gấp khúc ngẫu nhiên theo seed từ server để mọi người thấy giống nhau), chớp sáng toàn cảnh ngắn, rung camera nhẹ.

## Post-processing

- Chuỗi theo art bible mục 5.2: sương (khoảng cách + độ cao, giảm bão hòa theo độ sâu) → bloom → tone mapping ACES Filmic → chỉnh màu tách tông (sắc bóng / sắc vùng sáng, nâng đen, tương phản, bão hòa) → vignette → hạt phim + dither.
- Bloom chỉ bắt vật phát sáng (VFX, phi kiếm, linh quang): ngưỡng khoảng 1,0, cường độ thấp, đỉnh HDR dưới 2,5. Không làm cả cảnh mờ nhòe.
- Uniform hiệu ứng trúng đòn (`uHit`, `uFlash`) đi trong pass chỉnh màu.
- Preset Thấp tắt bloom và sương theo độ cao, giữ chỉnh màu. Bỏ SSAO/SSR ở preset Thấp và Vừa.
- Khi có nhiều pass: đặt `renderer.info.autoReset = false` và reset ở đầu khung, nếu không số draw call/tam giác đo được sẽ sai.

## Kiểm tra

- Xem hiệu ứng trên cả WebGPU và WebGL2 (ép bằng query `?renderer=webgl2`).
- Chạy skill `perf-budget` sau khi thêm hiệu ứng nặng.
