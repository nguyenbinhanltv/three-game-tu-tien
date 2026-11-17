# VFX-V0 + V1: khung hiệu ứng theo dòng thời gian và hai chiêu mẫu

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/vfx-v1/<file>`.

Phong cách đích (đã chốt): stylized vẽ tay "2D trong 3D", ba tầng màu (lõi / thân / viền) + lớp bóng sẫm bên dưới, hiệu ứng mọc theo
đường vung, mô-típ tu tiên; mỗi nhánh một màu (Kiếm tu: lam ngọc + trắng, điểm vàng). Ảnh tham khảo chỉ để học nguyên lý, không nằm trong repo.

## V0: nền tảng

| Hạng mục | Ở đâu |
| --- | --- |
| Dòng thời gian dữ liệu hóa: mỗi chiêu một `packages/content/data/fx/<id chiêu>.json` (mesh, hạt, decal, vệt kiếm, khựng hình, rung, chớp, âm thanh) | kiểu + kiểm: `packages/shared/src/fxtimeline.ts`; chạy: `apps/client/src/game/fxTimeline.ts` (`FxRunner`) |
| Giữ tương thích chiêu cũ | chiêu có timeline thì `SkillFx.handle` giao cho `FxRunner` và `engine.onFx` bỏ hình cũ (`replaces`); chiêu khác đi đường cũ. `?fxtl=0` tắt timeline để so trước/sau |
| Khựng hình 40–80 ms + rung camera (tắt được) | sự kiện `hitstop`/`shake`; công tắc "Khựng hình" và "Rung màn hình" trong Cài đặt |
| Decal mặt đất (vết nứt phát sáng, vòng triện văn 20 ký tự tự thiết kế, vết cháy, khói toon) | kiểu `decal` |
| Vệt kiếm ribbon bám xương | sự kiện `trail` (dùng `Trails.openBlade`) |
| Hạt GPU instanced | hệ có sẵn (`render/vfx/particles.ts`, quỹ đạo tính trong vertex shader, bộ đệm vòng) nên không cần compute; sự kiện `particles` (cả kiểu "tụ khí" bay vào tâm) |
| Thư viện shader TSL | `render/vfx/stylized.ts`: `ramp3`, `jaggedCut` (mép rách), `dissolve`, `flowNoise`, `fresnelRim`; kiểu `toon`, `crystal`, `burst`, `decal`; bảng màu theo nhánh `render/vfx/palette.ts`; hình nền `render/vfx/fxShapes.ts` |
| Cài đặt "Chất lượng hiệu ứng" Thấp/Vừa/Cao | `game/fxSettings.ts`, Cài đặt → mỗi sự kiện có `tier`; chiêu người khác hạ một bậc; `?fxq=` ghi đè |
| Công cụ video | `pnpm shots:vfx --out <thư mục tuyệt đối>`: webm chậm 0,25× và tốc độ thật + dãy khung PNG, nam và nữ, luôn tắt tiếng; `--old` chụp hình cũ |

Thêm chiêu mới = viết một JSON (xem hai file mẫu) + `pnpm content:check` (kiểm ≤ 12 draw, ≤ 1.500 hạt, khựng 40–80 ms, rung ≤ 0,6, chớp ≤ 0,3).
Sự kiện neo vào `hitAt` của chiêu (`t` giây, âm = trước), nên đổi nhịp chiêu trong `skills.json` thì hiệu ứng đi theo.

## V1: hai chiêu mẫu

- **Kiếm Khí Trảm** (`skl_kiem_khi_tram`): tụ khí hút vào + vòng triện văn dưới chân, hai lưỡi liềm tông (lõi sẫm, thân lam, viền trắng, mép trong rách) bay theo đường vung, tia xẹt vàng, chớp + vạch tốc độ < 120 ms, khựng 55 ms, gai tinh thể lam trồi lần lượt, tấm khói toon, vết nứt phát sáng 2 s.
- **Phi Kiếm** (`skl_phi_kiem`, cả combo 3 đòn): kiếm hóa mũi tinh thể (viền vàng) lao kèm vòng xoắn lam, vòng ấn ở chuôi, chạm: đĩa gợn, bắn ngược tia sáng, vết nứt phát sáng 2,6–3 s; đòn cuối thêm gai, khói, nứt lớn, mũi thứ hai/ba.
- **Animation**: bộ sinh pose (`tools/poses/gen-k5.mjs`) có giọng `kx` (kiếm tu cường điệu) cho hai chiêu này: ngả người tụ khí, xoay hông 45°, hạ hông, xông tới, quá đà. Vẫn nằm trong dải đo của K-5; **`windup`/`hitAt` không đổi** (server không đổi nhịp).
- Đường nhập clip ngoài (Cascadeur): `tools/blender/ext_clip.py` + `run-ext-clip.mjs`, hướng dẫn `huong-dan-clip-ngoai.md`. Phần nối clip vào máy trạng thái chiêu để gói V4.

## Lỗi gặp và đã sửa (đáng nhớ)

`render/materials/fxBatch.ts`: three dựng UBO ma trận theo `mesh.count` ở lần vẽ đầu của mảnh và giữ nguyên. Mảnh gộp khung đầu chỉ có 1–2 instance thì instance thêm sau
mất hình hoặc lẫn ma trận (vòng ấn to bất thường, gai không hiện). Sửa: khung đầu của mảnh khai `BATCH_CHUNK` instance (phần chưa ghi là ma trận 0). Ảnh hưởng mọi kiểu gộp, không chỉ kiểu mới.

## Số đo

`pnpm shots:vfx --perf` (WebGPU, sân tông môn, một sói; draw call / khung ms trong lúc ra chiêu, cũ → mới):

| Chiêu | draw p50/max | tam giác max | khung ms p50/p95 |
| --- | --- | --- | --- |
| Kiếm Khí Trảm | 121/126 → 120–124/126–129 | 355k → 376k | 8,0–8,4/10–19 → 8,3/9,8–16 |
| Phi Kiếm (combo) | 128/132 → 128–141/130–145 | 322k → 394k | 8,4/9,6 → 8,3–8,4/9,9–10,5 |

Trong ngân sách (< 300 draw; CPU khung không đổi ở p50). Chưa đo 50 người cùng ra chiêu (V6); chiêu người khác đã hạ một bậc chất lượng.

Ảnh dãy khung (mới, nam/nữ, và hình cũ): thư mục `anh/`. Video webm: ngoài repo, `D:/claude-tmp/vfx-v1/new/` (chậm 0,25× và tốc độ thật). Video nặng ở ngoài repo (đường dẫn trong mô tả PR); ảnh dãy khung ở thư mục này.
