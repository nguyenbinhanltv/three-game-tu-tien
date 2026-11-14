---
name: tsl-shaders-vfx
description: Viết shader và hiệu ứng hình ảnh cho Đạp Thiên Lộ bằng TSL (Three Shading Language) — PBR cách điệu bán tả thực, chỉnh màu điện ảnh tông sương sớm, sương theo độ cao, mây, nước, kiếm khí, linh quang, thiên lôi độ kiếp, bloom. Dùng khi tạo hoặc sửa material, post-processing hay hệ particle.
---

# Shader và VFX bằng TSL

> Hiện trạng (M1-6, phong cách bán tả thực điện ảnh theo art bible v3): địa hình, cây, kiến trúc, nhân vật, quái dùng `MeshStandardNodeMaterial` cách điệu (`render/materials/world.ts`, nhám cao, không kim loại). Sương theo khoảng cách + theo độ cao và giảm bão hòa theo độ sâu là một `scene.fogNode` (`render/atmosphere.ts`), thay `FogExp2` của `env.ts`; atmosphere cũng đặt màu mặt trời/ánh trời/vòm trời và vẽ quầng sáng giả quanh đèn đá (1 draw call). Thông số chỉnh màu ở `render/grading.ts` (chép từ khối `grading` của `assets/palette.json`, preset dawn/day/night). Post-processing `render/post.ts`: bloom chọn lọc qua MRT (chỉ material đã `markBloom`, chỉ khi preset có bloom) → ACES → tách tông bóng lạnh/sáng ấm, nâng đen, đường cong S, bão hòa → `uHit` (viền đỏ + quang sai màu khi mình trúng đòn nặng) / `uFlash` → FXAA (Vừa) → vignette → hạt phim + dither. Hiệu ứng (`game/vfx.ts`, `game/telegraph.ts`, từ M1-7) lấy lưới từ `FxPool` trong `render/materials/vfx.ts`: mỗi kiểu (`glow` cộng sáng có bloom, `flat` cộng sáng không bloom cho vùng báo trước, `solid`, `shade`) chỉ có một `MeshBasicNodeMaterial` cho cả game; màu/opacity/tiến độ là uniform theo lưới (`onObjectUpdate`, đọc `fxColor`/`fxOpacity`/`fxK` của `FxMesh`). Phát hiệu ứng không tạo material, không dispose material; đỉnh màu một lớp chặn ở `FX_MAX_HDR` 2,4; material đặt `forceSinglePass` (trong suốt 2 mặt mặc định tốn 2 draw call). Hiệu ứng mới: dùng `vfx.fx(geo, màu, opacity, kind)` và `vfx.drop(m)`, đừng `new MeshBasicMaterial`. Từ M4-1/M4-3 có thêm 3 kiểu có shader riêng (builder trong `render/vfx/`, nhận uniform qua `FxUniforms` để tránh vòng import), tham số riêng đặt vào `fxA`/`fxB` (vec4 theo lưới, pool reset về 0): `slash` (lớp sáng kiếm khí, cộng sáng, bloom) và `ink` (lớp mực nền, hòa trộn thường, có sương) dùng lưới cung `SLASH_GEO` (`render/vfx/slash.ts`: `fxA` = đầu quét, ngưỡng ăn mòn, seed; nhịp lấy từ `slashPhase`); `sigil` (`render/vfx/sigil.ts`: pháp trận/vùng báo trước, một tấm phẳng, mọi chi tiết vẽ trong fragment; `fxA` = tiến độ, hình 0 tròn/1 chữ nhật/2 quạt, _, seed; `fxB` = r, w, cỡ tấm). Dùng qua `vfx.slash` (bay), `vfx.slashMark`/`vfx.slashVertical` (dấu chém đứng quay về camera), `vfx.sigil`, `vfx.castSigil`, `vfx.hazard`, `telegraph()`. Pháp trận dùng hòa trộn thường (không cộng sáng) để có nền mực tối, nhờ vậy vẫn đọc được trên đá/sương sáng. Phù văn là hoa văn nét ngang/dọc sinh theo hash, không thành chữ (art bible 8.11). Nhiễu trong shader là `vnoise`/`hash21` (`render/vfx/common.ts`), chạy như nhau trên WebGPU và WebGL2; chú ý vec2 chỉ có `.x/.y` (gọi `.z` trên vec2 làm hỏng shader WGSL mà TypeScript không bắt được).
>
> Từ M4-2/M4-4/M4-5:
> - **Hệ hạt GPU** `render/vfx/particles.ts` (`PARTICLES`, dùng chung qua `vfx.particles`): hai `Sprite` instanced (`glow` cộng sáng có bloom, `dust` hòa trộn thường có sương) = 2 draw call cho mọi hạt. Quỹ đạo tính trong vertex shader từ dữ liệu lúc sinh, CPU chỉ ghi khi `emit`. Bộ đệm vòng theo ngân sách preset (`PARTICLE_BUDGET`: 5.000 Thấp, 12.000 Vừa, 20.000 Cao) nên số hạt sống không thể vượt; engine gọi `particles.setQuality`. Overlay `?debug=1` hiện `sống/ngân sách hạt`.
> - **Mưa kiếm** `render/vfx/swordRain.ts`: 4 `InstancedMesh` dùng chung (kiếm `prop_phi_kiem` qua AssetCache, vệt sao chổi, vết nứt, vòng chấn động) = 4 draw call bất kể số trận. Tham số theo instance là `InstancedBufferAttribute` vec4 đọc bằng `instancedBufferAttribute()`. **Bẫy three r178**: `InstanceNode` cấp UBO ma trận theo `InstancedMesh.count` lúc dựng node; đừng hạ `count` để ẩn instance (mọi instance sẽ dùng chung một ma trận). Giữ `count` = sức chứa và đặt số vẽ bằng `InstancedBufferGeometry.instanceCount` (`instancedGeometry()`).
> - **Thiên lôi** `render/vfx/lightning.ts`: hình tia theo seed server (`FxMsg.sd`/`HazardMsg.sd`, `seededRandom`) nên mọi client thấy cùng một tia; dải quay về camera dựng lại mỗi khung trong bộ đệm cấp sẵn (kiểu `bolt`); chớp toàn cảnh qua `vfx.onFlash` → `PostPipeline.flash` (`uFlash`); mây kiếp xoáy là một đĩa vẽ trong fragment (kiểu `vortex`).
> - **Vệt theo nhân vật** `render/vfx/trail.ts` (`vfx.trails.update` mỗi khung): dải vệt phi kiếm khi ngự kiếm (kiểu `trail`, tối đa 8 dải), linh quang quanh kiếm khi cầm kiếm, bụi mỗi bước chạy, sương dưới chân khi bay. Người khác một nửa số hạt, xa hơn 70 m không sinh.
>
> Từ M4-6/M4-14:
> - **Đồ rơi** `render/vfx/loot.ts` + `vfx.lootDrop`/`vfx.goldDrop`: chỉ là lớp hình khi `S.SYS` loại `loot` có `src` (id quái/điểm hái) và `i` (id vật phẩm; không có = vàng); đồ đã vào túi ở server. Viên đồ nảy (`lootHop`), cột sáng kiểu `beam` (ống hở `BEAM_GEO`, `fxA.x` = độ dâng, `fxA.w` = seed) theo 3 bậc `lootTier(rarity)`: sương sớm / linh khí ngọc / kim quang `spirit_gold` (không tím), chuông nhiều bồi âm `lootChime` (`game/lootBell.ts`), icon bay vào nút `[data-bag]` bằng DOM (`game/lootFly.ts`, không thêm draw call). Đồ bậc cao nằm ngoài khung nhìn có chỉ báo M4-15 (`OffKind` `loot`).
> - **Vết mực** `render/vfx/ink.ts` + `vfx.inkSplat`/`inkStreak`/`inkBurst`: kiểu `inkpool` (hòa trộn thường, có sương) trên `SIGIL_GEO` áp nghiêng theo mặt đất; `fxA` = độ loang, độ tan, độ đậm mép, seed; tan theo nhiễu (`inkPhase`). Tối đa `MAX_INK` 14 vết, vượt thì vết cũ nhất tan nhanh (`inkEvict`). Quái chết: `EntityManager.onMonsterDeath` (chỉ khi thấy quái chuyển sống → chết); đòn nặng (`DmgMsg.hv`): vệt nhỏ kéo dài theo hướng đòn, tối đa một vệt mỗi 0,4 giây mỗi nạn nhân. Màu `INK_POOL` (mực ngả lam ngọc, không đen tuyền).
>
> Các mục dưới đây là hướng làm tiếp; chỗ nào nói cel-shading/thủy mặc là định hướng cũ, theo art bible v3.

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
- **Bẫy three r178 khi đổi preset lúc chạy**: cache shader (`Nodes.nodeBuilderCache`) khóa theo material + môi trường, không theo MRT/số đích. Pass cảnh đổi giữa có MRT bloom (Vừa/Cao) và không MRT (Thấp) thì render object mới lấy nhầm shader của cấu hình kia: WebGPU báo `Attachment state … is not compatible`, WebGL2 im lặng ghi sai draw buffer. `render/nodeCacheFix.ts` (`patchNodeCacheKey`, gọi sau `renderer.init()`) thêm chữ ký đích vào khóa; đừng gỡ. Node `rtt()` không tự giải phóng render target: `PostPipeline.dispose()` phải `renderTarget.dispose()`. Kiểm bằng `pnpm bench:switch`.

## Kiểm tra

- Xem hiệu ứng trên cả WebGPU và WebGL2 (ép bằng query `?renderer=webgl2`).
- Chạy skill `perf-budget` sau khi thêm hiệu ứng nặng.
