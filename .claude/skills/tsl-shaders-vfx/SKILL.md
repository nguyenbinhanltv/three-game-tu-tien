---
name: tsl-shaders-vfx
description: Viết shader và hiệu ứng hình ảnh cho Đạp Thiên Lộ bằng TSL (Three Shading Language) — material PBR cách điệu, chỉnh màu sương sớm, VFX chiêu theo timeline JSON (stylized tương phản cao, ba tầng màu), hạt GPU, vạch báo, thiên lôi, bloom, ngân sách và cách kiểm. Dùng khi tạo hoặc sửa material, post-processing, hệ hạt hoặc hiệu ứng của chiêu/quái/boss/độ kiếp.
---

# Shader và VFX bằng TSL

Đọc theo thứ tự: nguyên tắc → phong cách → kiến trúc VFX → thêm hiệu ứng chiêu mới → đặc tả → ngân sách → bẫy → kiểm.
Chi tiết từng đợt: `docs/vfx-v1/` (nền tảng), `vfx-v2/` (Kiếm tu), `vfx-v3/` (Hộ pháp, Đan sư), `vfx-v4/` (pháp tướng, đột phá, độ kiếp), `vfx-v5/` (quái, boss), `docs/k6-vfx/` (ba pha K-6, gộp draw call).

## Nguyên tắc

- Viết bằng TSL (`three/tsl`) với `NodeMaterial`, một bản chạy cả WebGPU lẫn WebGL2. Không viết GLSL/WGSL thô.
- Material dùng chung nằm ở `apps/client/src/render/materials/`. Không tạo material mới cho từng mesh hay từng lần phát.
- Tham số chỉnh được là `uniform()`.
- Nhiễu trong shader: `vnoise`/`hash21` ở `render/vfx/common.ts`. vec2 chỉ có trường x và y: gọi `.z` làm hỏng WGSL mà TypeScript không bắt được.

## Phong cách

Hai lớp, đừng trộn.

1. **Thế giới** (địa hình, cây, nhân vật, sương, grading): bán tả thực điện ảnh, sương sớm. Nguồn chuẩn `docs/art-bible.md` v3 (mục 3 vật liệu, 5 ánh sáng/chỉnh màu, 8 điều cấm). `MeshStandardNodeMaterial` nhám, không kim loại bóng như nhựa (`render/materials/world.ts`). Sương là `scene.fogNode` ở `render/atmosphere.ts`. Chỉnh màu ở `render/grading.ts`, `render/post.ts`. Không cel-shading, không viền mực inverted hull.
2. **VFX chiêu** (đã duyệt ở V1): stylized vẽ tay "2D trong 3D", **tương phản cao**.
   - Ba tầng màu: lõi sẫm, thân, viền sáng. Dưới cùng là lớp bóng sẫm để hiệu ứng đọc được trên nền sáng.
   - Mép rách (`jaggedCut`), gai tinh thể, lưỡi liềm hai tông, triện văn nét ngang/dọc sinh theo hash (không thành chữ, art bible 8.11).
   - Hiệu ứng mọc theo đường vung rồi tan bằng `dissolve` có mép sáng. Dư âm ngắn.
   - Màu theo nhánh ở `render/vfx/palette.ts`: Kiếm tu lam ngọc + trắng, điểm vàng; Hộ pháp hổ phách/vàng kim; Đan sư ngọc lục, điểm đỏ son; sét tím trắng (`loi`).
   - Bảng "nguy hiểm" của quái tách khỏi bảng "của ta": `mon_<hệ>` và `mon_boss_<hệ>` (accent đỏ son/đỏ thẫm, viền vàng kim cho boss). Người chơi nhìn màu là biết đòn của ai.
   - Mực loang (`render/vfx/ink.ts`) và sương là phần thủy mặc còn lại.

## Kiến trúc VFX

**Pool và material** (`render/materials/vfx.ts`)
- `FxPool` cấp lưới theo `FxKind`: `glow` (cộng sáng, bloom), `flat` (cộng sáng, không bloom, vùng báo), `solid`, `shade`, `slash`, `ink`, `sigil`, `bolt`, `vortex`, `trail`, `beam`, `dome`, `inkpool`, `toon`, `crystal`, `burst`, `decal`, `card`.
- Mỗi kiểu một `MeshBasicNodeMaterial` cho cả game. Màu, opacity, tiến độ là uniform theo lưới; tham số riêng vào `fxA`/`fxB` (vec4, pool reset về 0).
- Phát qua `vfx.fx(geo, màu, opacity, kind)`, trả tay cầm bằng `vfx.drop(m)` (`game/fx/vfx.ts`). Không `new MeshBasicMaterial`.
- Đỉnh HDR chặn ở `FX_MAX_HDR` = 2,4. Material `forceSinglePass`.
- Gộp draw call (`render/materials/fxBatch.ts`, `FxBatcher`): lưới cùng hình + lớp thành một `InstancedMesh`. `FxMesh` chỉ là tay cầm; shader không đọc `positionLocal` (three gán lại theo instance), dùng `uv()`. `sigil` không gộp.

**Shader stylized** (`render/vfx/stylized.ts`): `ramp3` (ba tầng), `jaggedCut`, `dissolve`, `flowNoise`, `fresnelRim`; builder `toonNodes`, `crystalNodes`, `burstNodes`, `decalNodes` (vết nứt, vòng triện văn, vết cháy, khói), `cardNodes`. Hình nền ở `render/vfx/fxShapes.ts` (`crescentGeometry`, `crystalGeometry`, `rippleGeometry`, `helixGeometry`, `dragonGeometry`, `shapeGeometry`, `shapeKind`).

**Timeline theo chiêu** (V0)
- Mỗi chiêu một `packages/content/data/fx/<id chiêu>.json`. Kiểu và kiểm: `packages/shared/src/fxtimeline.ts` (`FxTimeline`, `validateFxTimeline`, `fxDrawCount`, `fxParticleCount`).
- Sự kiện: `mesh`, `particles`, `decal`, `trail`, `hitstop`, `shake`, `flash`, `sound`, `bolt`, `camera`. Neo `self|target|ahead|ground|area|origin`.
- `t` là giây so với `hitAt` (âm = trước); `from: "start"` tính từ lúc bấm. Đổi nhịp chiêu trong `skills.json` thì hiệu ứng đi theo.
- Mở rộng: `combo` (theo đòn), `variants` (theo biến thức A/B), `hit` (theo mốc trúng), `trigger: "fx"` + `fxKind`/`method`/`when` (chiêu không có động tác: lướt, đột phá, độ kiếp), `replaces` (bỏ hình `S.FX` cũ).
- Chạy: `FxRunner` ở `game/fx/fxTimeline.ts` (`start`, `startFx`, `startAt` cho quái/cảnh không có chiêu). Gọi từ `game/fx/skillFx.ts`, nghe `Game.onSkillEvent`. Quái: `game/fx/monFx.ts` + `fx/mon_*.json`. Chiêu bậc cao/công pháp: `game/fx/methodFx.ts`.
- Chất lượng: `game/fx/fxSettings.ts` (`fxQuality`, `particleScale`, khựng hình). Mỗi sự kiện có `tier` 0/1/2 (từ Thấp/Vừa/Cao); chiêu người khác hạ một bậc (`fxTierFor`).
- Ba pha K-6 (tụ lực → bùng nổ tại `hitAt` → tan): `render/vfx/phases.ts` (`phaseAt`, hằng `HDR_*`, `CAPS_*`, `hazardStyle`). Vệt kiếm bám xương: `render/vfx/bladeTrail.ts`. Đạn quái: `render/vfx/projectile.ts` (`BoltFx`). Tranh thẻ pháp tướng: `render/vfx/cards.ts`.
- Phần lớn file JSON được **sinh** bằng `python tools/vfx/gen-fx-kiem.py` (công thức `tools/vfx/recipes_b|c|d|e.py`), quái bằng `python tools/vfx/gen-fx-mon.py`. Sửa công thức rồi sinh lại; sửa tay chỉ cho chỉnh nhỏ (lần sinh sau ghi đè).

**Các hệ riêng**
- Hạt GPU `render/vfx/particles.ts` (`PARTICLES`): hai lớp `glow`/`dust` = 2 draw call. Quỹ đạo tính ở vertex shader; ngân sách `PARTICLE_BUDGET` 5.000/12.000/20.000 (Thấp/Vừa/Cao).
- Mưa kiếm `swordRain.ts`, thiên lôi `lightning.ts` (hình theo seed server `sd`, mọi client thấy cùng tia; chớp toàn cảnh qua `vfx.onFlash` → `PostPipeline.flash`), vệt theo nhân vật `trail.ts`, đồ rơi `loot.ts`, vết mực `ink.ts`, pháp trận/vạch báo `sigil.ts` + `game/fx/telegraph.ts`, lưỡi kiếm khí `slash.ts`.
- Vẽ ấm nhóm gộp: `warmKinds`/`warmBatches` trong `game/fx/vfx.ts` biên dịch trước để không khựng giữa trận. `?vfxwarm=0` tắt (chỉ để so số đo).
- Giảm tải đám đông: `game/fx/fxBudget.ts` (`skipOthersFx`: lưới sống ≥ `OTHERS_FX_LIVE_MAX` hoặc xa hơn `OTHERS_FX_DIST` thì bỏ phần trang trí của người khác; luôn giữ của mình, đòn nhắm mình, chiêu quái/boss, vạch báo).
- Cờ URL để so trước/sau: `?batch=0` (bỏ gộp), `?fxq=low|medium|high`, `?vfxwarm=0`.

## Thêm hiệu ứng cho chiêu mới

1. Chiêu phải có trong `skills.json`/`methods.json` với `hitAt`, `windup`, `recovery`. Chưa có pose thì xem skill `game-content` và `tools/poses/gen-k5.mjs`.
2. Viết đặc tả một đoạn theo mẫu ở mục dưới. Làm trước khi viết JSON.
3. Tạo `packages/content/data/fx/<id chiêu>.json`. Chiêu cùng họ thì thêm công thức vào `tools/vfx/recipes_*.py` rồi chạy `python tools/vfx/gen-fx-kiem.py`.
4. Dựng theo thứ tự: báo trước (nếu có) → tụ lực → bùng nổ tại `t: 0` → dư âm. Gắn `tier` cho phần trang trí (1–2) để preset Thấp chỉ còn phần đọc được.
5. Chọn `palette` đúng nhánh. Hình mới chưa có thì thêm vào `fxShapes.ts` và `shapeKind`, đừng tạo material.
6. Với chiêu lướt/đột phá/cảnh: `trigger: "fx"`, `fxKind` khớp `S.FX`, `replaces` bỏ hình cũ.
7. `pnpm content:check` (≤ 12 draw, ≤ 1.500 hạt mỗi chiêu, ≤ 400 hạt mỗi sự kiện; khựng 40–80 ms; rung ≤ 0,6; chớp ≤ 0,3; decal `dur` ≤ 8 s; ≤ 4 tia sét). Burst < 120 ms là quy ước tự kiểm, không có trong check.
8. Quay và xem: mục Kiểm tra.
9. Cập nhật `docs/vfx-<đợt>/README.md` (ngắn: bản sắc hình, số đo, hạn chế).

Chỉ là lớp hình: ai trúng, sát thương, hồi chiêu vẫn do server quyết định.

## Chuẩn "Họa Pháp Lô 2" (24/11, bắt buộc cho VFX mới và làm lại)

Chi tiết và bảng kiểm tự động: `docs/handbook/vfx-forge.md` (mục "Chuẩn Họa Pháp Lô 2"). Tóm tắt khi dựng một chiêu: concept Codex trước; mỗi chiêu một silhouette riêng (cấm sao tỏa tia, vòng rune dưới chân, lưỡi liềm trơn làm hình chính); ≥ 1 lớp chất liệu (flipbook Codex, khói/hạt, vân nứt, distort); lõi tối/ink + viền sáng để đọc được trên nền sáng ban ngày (không chỉ cộng sáng); ba nhịp báo trước → trúng (+30 ms có điểm nhấn) → dư ba; màu đúng hướng tu, không đỏ/cam; phủ ≤ 0,2 (chiêu cuối ≤ 0,35). Bật kiểm trong thẻ chiêu bằng `"standard": 2` (+ `silhouette`, `materials`).

## Mẫu đặc tả mỗi hiệu ứng

Viết ngắn, đủ các dòng sau. Thiếu dòng nào thì chưa nên viết shader.

- **Chủ và kích hoạt**: ai phát (mình, người khác, quái, boss, hệ thống), tin hay sự kiện nào kích (`onSkillEvent`, `S.FX`, `S.HAZARD`, `S.BOLT`).
- **Thời lượng**: từng pha và tổng. Mọi hiệu ứng có mốc kết thúc rõ.
- **Ý nghĩa gameplay**: người chơi cần đọc gì (né, đã trúng, chiêu thành công, bị ngắt).
- **Pha tách riêng**: báo trước, trúng, thành công, thất bại, lưu lại. Mỗi pha một hình khác nhau. Báo trước tồn tại đúng tới lúc nổ.
- **Hình khối ở khoảng cách camera**: nhìn ở 12–16 m (camera mặc định) và 24 m có đọc ra hình không. Hiệu ứng không che thân kẻ địch, vạch báo hay nhân vật mình.
- **Thứ bậc màu**: lõi / thân / viền / bóng, màu nhánh, màu nguy hiểm riêng cho quái.
- **Giới hạn sinh**: số lưới, số hạt, trần theo chất lượng, bản của người khác giảm một bậc.
- **Quy tắc dọn**: hết pha thì `drop` mọi lưới, hạt tự hết, decal có thời hạn; chết, đổi level, hủy chiêu, mất kết nối đều dọn.
- **Bản giảm chuyển động**: bỏ rung, khựng, chớp, giữ hình tĩnh và vạch báo. Hiện game chỉ có công tắc "Khựng hình" và "Rung màn hình" (`game/fx/fxSettings.ts`, Cài đặt). Công tắc "Giảm chuyển động" (`ui/u2/shell/motion.ts`) mới áp cho giao diện, **chưa** áp cho VFX trong cảnh. Nối chúng là hướng mở, chưa làm.

## Ngân sách (desktop)

- Tổng game: dưới 300 draw call, CPU dưới 8 ms/khung (skill `perf-budget`). Đo thực tế: VFX chiêu một người 120–150 draw, sân 50 người 140–180.
- Mỗi chiêu: ≤ 12 draw (đếm theo nhóm gộp), ≤ 1.500 hạt (`content:check`).
- Hạt sống toàn cảnh: 5.000 / 12.000 / 20.000 (Thấp/Vừa/Cao). Hiệu ứng người khác một nửa hạt; xa hơn 60–70 m không sinh (`monFx`, `trail`).
- Trần theo chiêu: `CAPS_MINE` 60 hạt/4 lưới, `CAPS_OTHER` 30/2; chiêu tối thượng 400/150 và 150/150.
- **HDR**: `FX_MAX_HDR` 2,4; đỉnh bùng nổ `HDR_BURST` 2,3. Bloom chỉ bắt vật đã `markBloom`, ngưỡng ~1,0. Hiệu ứng chồng nhau không được cháy sáng cả khung. `maxRadiusFor` giữ hình không chiếm quá 25% màn hình.
- Mực loang tối đa `MAX_INK` 14. Decal tối đa `DECAL_MAX` 6 cùng lúc.
- Chớp toàn cảnh < 120 ms; khựng hình ≤ 90 ms (`hitStopOf`, `game/combat/hitjuice.ts`).

## Bẫy three r178 / TSL

- `InstanceNode` dựng UBO ma trận theo `InstancedMesh.count` ở lần vẽ đầu. Đừng hạ `count` để ẩn instance; giữ `count` = sức chứa và đặt số vẽ bằng `instanceCount`. Mảnh gộp khung đầu khai `BATCH_CHUNK` instance, không thì instance thêm sau mất hình.
- Tham số theo instance dùng `InstancedBufferAttribute` + `instancedBufferAttribute()`. Không dùng `DynamicDrawUsage` (r178 upload lại cả bộ đệm; test `no-dynamic-usage` chặn).
- Cache shader (`Nodes.nodeBuilderCache`) khóa theo material, không theo MRT. Đổi preset lúc chạy lấy nhầm shader: `render/nodeCacheFix.ts` (`patchNodeCacheKey`) vá. Đừng gỡ. Kiểm bằng `pnpm bench:switch`.
- `rtt()` không tự giải phóng render target; `PostPipeline.dispose()` phải `renderTarget.dispose()`.
- Nhiều pass: `renderer.info.autoReset = false`, reset đầu khung, không thì draw call đo sai.
- Trong suốt 2 mặt tốn 2 draw call: giữ `forceSinglePass`.
- Kiểu hiệu ứng mới biên dịch lần đầu gây khựng: nhớ cho vào `warmKinds`/`warmBatches`.
- Hai backend có thể lệch nhẹ về màu texture (WebGPU không có BC7, xem `docs/ktx2/`): so ảnh cả hai.
- **`.toVar()` ngoài `Fn` chỉ được phát ở lần dùng đầu tiên, có thể nằm trong nhánh `if` của `select()`.** `select(c, a, b)` biên dịch thành `if/else`; một biến dựng ở phạm vi toàn cục (không trong `Fn`) mà lần dùng đầu nằm trong một nhánh thì chỉ được tính ở nhánh đó, nhánh kia đọc giá trị chưa tính (0): lá cỏ Họa Cảnh biến mất gần hết (chỉ nhánh "lá có đầu hạt" sống). Không có lỗi biên dịch, chỉ hình sai. Cách làm đúng: bọc toàn bộ phép tính vertex trong `Fn(() => { ... })` (trong `Fn` mỗi `.toVar()` được phát theo thứ tự câu lệnh), trả `world`, và đưa giá trị sang fragment bằng `varyingProperty('vec3')` + `.assign(...)` trong `Fn` (không dùng `.toVarying()` ngoài `Fn`). Soi mã đã sinh: `renderer.debug.getShaderAsync(scene, camera, object)` trả vertex/fragment WGSL (xem `render/painted/lab/page.ts`, `tools/painted-compare/lab-shader.mjs`).
- **Biểu thức dùng lại nhiều lần mà không `.toVar()` bị inline lặp**: đồ thị tự tham chiếu (vòng lặp `d1 = select(d < d1, d, d1)`) bùng nổ theo cấp số (shader biên dịch hàng chục giây, khung đứng ở 0 khung/s, nghi mất thiết bị GPU). Đặt `.toVar()` sau mỗi bước của chuỗi và của mọi giá trị dùng từ hai lần trở lên (kể cả `texture()` đọc `m.g`, `m.r`...).
- **Gỡ lỗi shader TSL**: thêm chế độ `?dbg=` (tô màu các giá trị trung gian, ép nhánh, bỏ phép uốn) và đọc ảnh bằng `readRenderTargetPixelsAsync` (không dùng `page.screenshot` khi khung nặng); mô phỏng CPU công thức với cùng hash/bản đồ để biết lỗi ở dữ liệu hay ở shader.

## Kiểm tra

Checklist trước khi báo xong:

- Chồng hiệu ứng: hai ba chiêu liên tiếp không cháy sáng, không che vạch báo hay thân kẻ địch.
- Nhiều mục tiêu: chiêu vùng trúng 3+ quái, mỗi quái một nhịp trúng đúng.
- Bấm liên tục: spam chiêu và đòn thường, số lưới sống không tăng mãi (`__game.info()`, bảng F3).
- Pause/resume: đổi tab, mất kết nối, hiệu ứng không đứng hình rồi bắn một loạt.
- Chết, hồi sinh, đổi level, ngắt chiêu: không còn lưới, hạt, decal sót lại.
- Preset Thấp: phần đọc được vẫn còn (báo trước, trúng).
- Cả WebGPU và WebGL2 (`?renderer=webgl2`), ghi rõ backend (`__game.info().backend`).
- Người khác ra chiêu: nhẹ hơn, không che.
- Playtest luôn `?mute=1`.

Lệnh:

- `pnpm shots vfx --out <thư mục tuyệt đối> --skills <id,...>`: webm chậm 0,25× + tốc độ thật và dãy khung, nam/nữ, tắt tiếng. Thêm `--perf` (draw call/tam giác/ms), `--crowd 50` (sân đông), `--skills mon:<loại>[:<id quái>]`, `--skills scene_<tên>`. Đặt `--out` ngoài repo hoặc ở artifacts; repo chỉ giữ tối đa 5 ảnh WebP then chốt (`pnpm docs:check`).
- `pnpm bench:client`, `pnpm bench:crowd`, `pnpm bench:switch` (skill `perf-budget`).
- `pnpm test` (có `phases.test.ts`, `fxShapes.test.ts`, `fxTimeline.test.ts`, `fxBudget.test.ts`, `fxBatch.test.ts`), `pnpm content:check`.
- Sau khi sửa VFX: gọi subagent `vfx-reviewer`.

## Họa Cảnh (`?style=painted`)

Khi viết shader cho chế độ này, theo `docs/handbook/painted.md`: hai tông sáng và tối pha tay từ một bảng chung (`cel2`, `meadowGreen`), không nhiễu hay texture ảnh chụp, chi tiết chỉ ở gần; dịch TỪNG DÒNG từ painted-valley (MIT, © 2026 Patch; dòng đầu file ghi nguồn), giữ hằng số, không "nhìn cho giống"; hậu kỳ chỉ Kuwahara (bỏ qua trời và điểm sáng HDR của VFX), không ACES hay hạt phim. VFX HPL2 giữ chuẩn riêng.
