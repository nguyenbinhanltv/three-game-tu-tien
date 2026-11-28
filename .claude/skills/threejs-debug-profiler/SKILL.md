---
name: threejs-debug-profiler
description: "Debug and profile Three.js browser games: blank canvases, HDR bloom NaN blackouts, composer/depth feedback bugs, render and runtime errors, asset and audio loading, animation/retargeting bugs, resize, mobile input, plus performance profiling of draw calls, triangles, textures, memory, shader/VFX/post-processing cost, and bundle size. Use when diagnosing defects or optimizing frame times; not for greenfield feature authoring."
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
- Số đo dùng `pnpm bench:client`, `pnpm shots … --fxperf 1`, `roomperf`; chẩn đoán NaN/đen bloom nhớ rằng hậu kỳ của dự án ở `render/post.ts`. Bảng lỗi liên quan Mixamo/Blender chỉ để tham khảo (dự án dùng UE5 Mannequin, xem `character-3d`).

# Three.js Debug Profiler

Find root causes and optimize measured bottlenecks without breaking playability.

Resolve `<this-skill-dir>` from the actual loaded skill file; resolve sibling skills beside it before runner-discovered alternatives.

Follow the changed behavior's scope. Reuse the lead's existing reproduction and evidence; verify the affected path after a fix. A passing focused check only needs broader testing when shared behavior changed or an unresolved risk warrants it. Return measurements and defects to the lead for the consolidated verification pass.

## Reference

`references/debug-playbook.md` — ordered triage for blank canvas, asset and audio loading, loop/animation/physics, input and mobile, the profiling sequence, and the `__THREE_GAME_DIAGNOSTICS__` shape. Read it when debugging or profiling anything non-obvious.

## Debug

Reproduce first, with the same command and URL the user had, and read the console, page, and network errors. Find the module that owns the failure (renderer, loop, camera, scene, assets, audio, input, physics, UI, or base path), fix the root cause there, and retest the exact broken path. The playbook's triage order covers the common causes, such as more than one active loop, a canvas whose display size doesn't match its drawing buffer, and wrong delta units.

## Profile

Profile the production preview when user-facing performance matters. Baseline one fixed scenario, classify the bottleneck (CPU, GPU draw, fragment, vertex, memory, or network), change one thing, and re-measure the same scenario, confirming visuals and playability held. The playbook lists the metrics to baseline and the optimizations in order of payoff.

## Report

Lead with the root cause or the measured bottleneck. Then files changed, baseline and post metrics, commands, screenshots, the broken path retested, and residual risks.
