---
name: threejs-aaa-graphics-builder
description: "Upgrade Three.js games from prototype visuals to premium browser graphics: art-direction critique, procedural hero/world model kits, PBR material and texture libraries, lighting and shadows, surface shaders (onBeforeCompile, skies, HDR bloom), LOD/instancing, render budgets, and the 10-category visual scorecard. Use when scenes look basic or need authored geometry, materials, lighting, or scoring; delegate complex combat, ability, spell, explosion, trail, and optical impact VFX to threejs-aaa-vfx-builder."
---

> Nguồn: https://github.com/majidmanzarpour/threejs-game-skills (MIT, © 2026 Majid Manzarpour; giấy phép ở `LICENSE` cạnh file này). Chép về 28/11/2026, đã bỏ các phần gọi API ngoài/đọc khóa.

## Áp dụng cho Đạp Thiên Lộ

Quy ước dự án THẮNG mọi chỗ xung đột với bên dưới (bản gốc viết cho game Three.js một file, WebGLRenderer + GLSL):

- Renderer là `WebGPURenderer` (tự lùi WebGL2), shader viết bằng **TSL** (`three/tsl`), KHÔNG `ShaderMaterial`/GLSL thuần. Mã GLSL trong `assets/vfx-kit/` chỉ để THAM KHẢO kỹ thuật; cần thì port sang TSL vào module của mình (`apps/client/src/render/vfx/`), không import nguyên. Shader không đọc `positionLocal` (lưới gộp instanced).
- **HPL2:** đỏ/cam CHỈ dành cho vạch báo đòn của quái; thân VFX quái và chiêu người chơi dùng màu theo nguyên tố/bảng màu nhánh (`render/vfx/palette.ts`).
- Ngân sách hiệu năng desktop của dự án (CLAUDE.md: dưới 300 draw call, CPU dưới 8 ms/khung) thay các con số "VFX budget" của bản gốc. Không dùng EffectComposer/UnrealBloomPass của bản gốc: hậu kỳ có sẵn ở `render/post.ts` (bloom chọn lọc, mặt nạ VFX).
- Chuỗi hiển thị qua i18n, server quyết định mọi thứ; VFX chỉ là hiển thị.
- Cổng kiểm VFX: `pnpm shots dienvo --out <thư mục> --query style=dahoa --fx <id|tiền_tố*> --gate 1 [--floor light] [--repeat 3]` (độ đọc, che thân, nổi) và `--fxperf 1 --repeat 3` (khung/draw call từng chiêu); xem `docs/handbook/dien-vo-truong.md`. Playtest luôn `?mute=1`.
- Không dùng `threejs-3d-generator`, `threejs-audio-generator`, `threejs-image-generator`, `probe_asset_credentials.sh` và mọi thứ gọi API ngoài/đọc khóa (không có credit); skill cùng tên không được chép vào repo. Tham chiếu tới `threejs-qa-release`, `threejs-gameplay-systems`, `threejs-game-director` trong tài liệu gốc: dùng skill `playtest`, `perf-budget`, `threejs-client` của dự án.
- Cùng việc có skill dự án `tsl-shaders-vfx` (phong cách VFX đã duyệt, timeline JSON, kiểm): đọc nó trước, skill này bổ sung kỹ thuật.
- Chỉ dùng phần `shader-cookbook.md` (kỹ thuật vật liệu/texture thủ tục, port sang TSL), `technical-art.md` (ngân sách, instancing) và `visual-scorecard.md` (chấm 10 hạng mục). Ảnh mốc chấm điểm (`assets/scorecard-anchors/*.jpg`) KHÔNG chép vào repo (luật không commit nhị phân); chấm bằng ảnh `pnpm shots` của mình.

# Three.js AAA Graphics Builder

Own the production graphics pass: turn basic screenshots into authored, high-density, performance-aware visuals.

Resolve `<this-skill-dir>` from the actual loaded skill file; resolve sibling skills beside it before runner-discovered alternatives.

## References

Load each reference when entering that sub-task — do not load all four before forms exist:

| File | Read it when |
| --- | --- |
| `references/authoring-recipes.md` | building hero, obstacle, reward, world-kit, or prop models; setting up lighting, tone mapping, shadows, fog, or graphics architecture |
| `references/technical-art.md` | setting render budgets, shared material kits, instancing/LOD, or cleaning up imported GLB/FBX assets |
| `references/shader-cookbook.md` | writing PBR materials, `onBeforeCompile` surface shaders, skies, or `HalfFloatType` bloom post-processing (`three ^0.184`) |
| `references/visual-scorecard.md` | scoring active-play screenshots or making any premium/AAA/showcase claim |

For a broad graphics pass, start with `authoring-recipes.md` + `technical-art.md`, load `shader-cookbook.md` during material/post authoring, and load `visual-scorecard.md` when scoring. A narrow edit loads only its relevant reference; user style and scope always override recipe defaults.

## Core rule

Glow does not make primitives look AAA. Build authored forms first, then materials, then lighting, then effects — in that order.

## Workflow

1. Capture or inspect active-play screenshots on the target viewports when a playable scene exists.
2. For an existing game, score the affected views and pick the weakest surfaces. For a new game, establish art direction, camera scale, material roles, and the hero target first; do not invent a before screenshot.
3. Add the graphics architecture the game is missing: material library, procedural textures and decals, model factories, world prop kit, render pipeline, diagnostics.
4. Choose a source per high-value surface: procedural Three.js/TSL (the only source in this project; no external generators).
5. Upgrade every weak visible surface, not only the hero: hazards, rewards, ground and track, foreground props, background layers, telegraphs, material variation.
6. Add lighting, `RoomEnvironment` IBL, tone mapping, and selective `HalfFloatType` HDR render polish once authored forms exist.
7. Delegate event-driven combat, ability, spell, weapon, shield, explosion, trail, and optical impact VFX to `threejs-aaa-vfx-builder` (keep lightweight pickup/state cues within budget for small arcade games).
8. Re-score against the calibration anchors, citing the inspector's measured metrics. Keep going until every premium category is at least 2, or name the exact blocker.

## Asset sourcing

Procedural code only (see "Áp dụng cho Đạp Thiên Lộ"): no external generation, no credential probe. Asset binaries come from the project's own pipeline (`tools/asset-pipeline`, R2).

## Report

Score before and after with one line of evidence per category, the surfaces you upgraded, files changed, screenshots, renderer diagnostics against the budget table, generated asset paths and task IDs, and what is still weak. Include imported-asset diagnostics (scale, bounds, collision proxy, clips) when generated 3D was used.
