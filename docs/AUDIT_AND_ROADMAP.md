# Kiểm toán và lộ trình: nâng cấp core loop

Ngày đo: 2026-11-16 · bản `main` tại `59f0051` · đi kèm `docs/GAME_DESIGN_CORE.md`.

Tài liệu này trả lời ba câu: game đang yếu ở đâu (có số đo và ảnh), việc nào làm trước, và **ai làm**. Ảnh bằng chứng ở `docs/audit/`.

## 0. Tóm tắt

- **Hiệu năng một người chơi đạt ngân sách** ở mọi preset trừ một điểm sát ngưỡng (rừng, WebGPU, Cao: CPU p95 8,1 ms). Draw call tối đa 168/300, tam giác tối đa 968 nghìn/2 triệu, tải đầu 2,82 MB/30 MB.
- **Ba chỉ số xấu đi rõ so với báo cáo M6-3 (2026-11-15)** khi có 50 người:
  1. **Texture 328–478 MB** (ngưỡng 512). Nguyên nhân: mọi texture trên GPU là RGBA8 không nén, 5,3 MB mỗi tấm 1024².
  2. **Tick server p95 9–12 ms ở rừng/boss** (trước 1,5–2,4 ms; ngưỡng 25 ms). Bản đồ M-1 có 367 quái sống cùng lúc.
  3. **Băng thông ~80 KB/s mỗi client** (trước ~27–32). Cả kênh nhận trạng thái của 367 quái.
  Hai mục sau thuộc phạm vi **M-2** (sinh quái theo cụm, AOI) đang làm.
- **Không tìm thấy rò tài nguyên GPU** khi đổi room: 4 vòng vào/ra bí cảnh, số geometry/texture đứng yên.
- **Lỗi UI nặng nhất**: ở 1280×720 hàng nút Đả tọa/Ngự kiếm/Túi/… co còn **3×3 px mỗi nút**, không bấm được. Ở 2560×1440 toàn bộ UI không phóng theo màn hình (chữ ~12 px).
- **Lỗi logic UI**: thanh máu boss ở đầu màn hình **không tắt** khi người chơi đã cách boss 448 m.
- **Gameplay**: độ kiếp Trúc Cơ chạy trọn 40 giây và thành công trong lượt soát (dùng lệnh GM để tới tầng 15 và bật `god`, nên chưa đo độ khó; chơi tay từ tầng 1 là việc của PR D). Điểm yếu là *cảm giác* (ba công pháp dùng chung động tác và 6/9 chiêu), *áp lực* (từ tầng 4 quái thường gần như không làm mất máu) và *nghi thức* (dẫn khí, bay lần đầu, độ kiếp một kiểu chơi). Chi tiết ở `GAME_DESIGN_CORE.md`.

---

## 1. Cách đo

| Thứ | Giá trị |
| --- | --- |
| Máy | Intel i5-12400F (12 luồng), GPU NVIDIA (Chrome báo `nvidia / ampere`), Windows 11 |
| Trình duyệt | Chrome headless qua Playwright, `--mute-audio`, URL luôn có `?mute=1`, 1280×720, dpr 1 |
| Server | `pnpm dev` (Vite dev, React dev) ở cặp cổng riêng 2598/5198, DB tạm |
| Lệnh | `pnpm build`, `pnpm size`, `pnpm bench:client`, `pnpm bench:crowd --bots 50 --scenes san,rung,boss --presets medium`, `pnpm sim:progress` |
| Điều kiện | Máy dùng chung: các worktree khác cũng đang chạy server và trình duyệt. Số tuyệt đối dao động ±1–2 ms giữa các lượt; p99 và fps của một lượt đơn không đáng tin |
| Ảnh | Script Playwright riêng (không vào repo), lệnh GM để dựng cảnh, 0 lỗi console trong mọi lượt chụp |

Chưa đo: GPU tích hợp (máy mục tiêu Iris Xe / Radeon 680M), Safari thật, 100 người một kênh, `bench:load`.

---

## 2. Số đo gốc

### 2.1 Tải đầu (`pnpm size`)

| Nhóm | Trên dây |
| --- | ---: |
| JS (1 file, gzip) | 564,8 KB |
| CSS | 13,6 KB |
| Font (2) | 26,1 KB |
| `arch_sect` + manifest | 180,8 KB |
| Bảng icon UI (`icons.webp` 695 KB + json) | 702,1 KB |
| Âm thanh nạp đầu (5 sprite + nhạc tiêu đề) | 1,36 MB |
| **Tổng (m4a)** | **2,82 MB / 30 MB** |

So với M6-2 (1,25 MB) và M6-3 (2,21 MB, cùng ngày 2026-11-15) tải đầu tiếp tục tăng: JS 437 → 565 KB, icon 143 → 702 KB, thêm nhạc tiêu đề 822 KB. Vẫn dưới ngân sách 10 lần, nhưng **bảng icon 695 KB là một tệp chặn màn tải** và sẽ tăng tiếp theo mỗi đợt icon.

### 2.2 Một người chơi (`pnpm bench:client`, xoay camera một vòng 8 giây)

| Backend | Preset | Điểm | fps | CPU p50 / p95 (ms) | Draw max | Tam giác max | Texture MB | Heap MB | Ngân sách |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| WebGPU | Thấp | sân / rừng / hồ | 115–119 | 2,8–3,8 / 3,8–4,9 | 79 / 113 / 114 | 257k / 315k / 269k | 241 / 311 / 368 | 182–225 | đạt |
| WebGPU | Vừa | sân / rừng / hồ | 115–117 | 3,2–4,1 / 4,0–5,7 | 110 / 139 / 138 | 367k / 684k / 350k | 334 / 373 / 445 | 184–220 | đạt |
| WebGPU | Cao | sân / rừng / hồ | 106–112 | 4,0–5,7 / 5,6–**8,1** | 134 / 166 / 166 | 438k / 968k / 484k | 382 / 422 / **478** | 180–251 | rừng **vượt CPU** 0,1 ms |
| WebGL2 | Thấp | sân / rừng / hồ | 112–116 | 2,7–3,8 / 3,9–4,9 | 79 / 109 / 118 | 257k / 310k / 296k | 228 / 298 / 355 | 195–255 | đạt |
| WebGL2 | Vừa | sân / rừng / hồ | 101–111 | 3,8–4,6 / 5,2–5,8 | 110 / 135 / 131 | 367k / 683k / 345k | 311 / 350 / 422 | 179–218 | đạt |
| WebGL2 | Cao | sân / rừng / hồ | **39** / 73 / 90 | 3,2–4,3 / 4,3–5,5 | 131 / 168 / 163 | 414k / 960k / 458k | 327 / 365 / 422 | 191–217 | đạt (xem ghi chú) |

Ghi chú: WebGL2 Cao ở sân chỉ 39 fps trong khi CPU `frame()` p95 4,3 ms, tức là **nghẽn GPU** (hoặc GPU đang bị worktree khác dùng). Một lượt đơn nên chưa kết luận; cần đo lại bằng `bench:crowd` (có đo GPU) khi máy rảnh. Rừng và hồ đều trên 60 fps ở mọi tổ hợp.

### 2.3 Đám đông 50 người (`pnpm bench:crowd`, preset Vừa)

| Cảnh | Backend | fps | CPU p50 / p95 / p99 (ms) | GPU p50 / p95 (ms) | Draw | Tam giác | Texture MB | Heap MB | ↓ KB/s | Tick p95 (ms) | Ngân sách |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Sân tông môn | WebGPU | 114 | 5,3 / 7,0 / 14,7 | 0,47 / 0,86 | 164 | 761k | 350 | 219 | 83,9 | 1,73 | đạt |
| Sân tông môn | WebGL2 | 105 | 5,5 / 7,6 / 54,4 | 3,16 / 3,78 | 169 | 782k | 328 | 195 | 79,5 | 1,74 | đạt |
| Rừng (bot đánh quái) | WebGPU | 91 | 8,1 / **10,7** / 20,6 | 0,41 / 0,76 | 229 | 1147k | 370 | 213 | 78,5 | **11,44** | **vượt CPU** |
| Rừng | WebGL2 | 99 | 6,3 / **9,0** / 51,5 | 3,07 / 4,20 | 233 | 1193k | 340 | 223 | 83,2 | **12,47** | **vượt CPU** |
| Kiếm Trủng (boss) | WebGPU | 102 | 6,5 / **8,6** / 13,7 | 0,39 / 0,61 | 209 | 862k | 388 | 198 | 83,5 | 9,15 | **vượt CPU** |
| Kiếm Trủng (boss) | WebGL2 | 100 | 5,4 / 8,0 / 52,9 | 3,00 / 4,14 | 216 | 879k | 430 | 227 | 86,1 | 12,29 | đạt |

So với cùng cảnh trong `docs/perf-report.md` (2026-11-15, lượt sau khi sửa):

| Chỉ số (rừng, 50 người, WebGPU Vừa) | M6-3 | Hôm nay | Thay đổi |
| --- | ---: | ---: | --- |
| CPU p95 | 7,0 ms | 10,7 ms | +53% |
| Tick server p95 | 1,51 ms | 11,44 ms | **×7,6** |
| Băng thông xuống | 32,3 KB/s | 78,5 KB/s | **×2,4** |
| Texture | 208 MB | 370 MB | +78% |
| Draw call | 214 | 229 | +7% |

Phần CPU ở rừng: `render` trung bình 5,9 ms, `ents` 1,25 ms, `matrix` 0,8 ms. Mỗi lượt có 11–14 pipeline tạo mới và 10 khung dài hơn 12 ms (khựng do biên dịch lần đầu, đã ghi ở M6-3, chưa sửa).

### 2.4 Rò bộ nhớ khi đổi room

Vào/ra bí cảnh Kiếm Trủng 4 vòng qua cổng, đọc `__game.info()` sau 4 giây mỗi lần:

| Lần | Room | Geometry | Texture | JS heap (MB, không ép GC) |
| --- | --- | ---: | ---: | ---: |
| 0 | world | 113 | 66 | 162 |
| 1 | dungeon → world | 103 → 108 | 68 → 68 | 192 → 189 |
| 2 | dungeon → world | 106 → 110 | 68 → 68 | 187 → 198 |
| 3 | dungeon → world | 106 → 110 | 68 → 68 | 205 → 196 |
| 4 | dungeon → world | 106 → 110 | 68 → 68 | 196 → 204 |

Geometry và texture **đứng yên từ vòng 2**. Heap dao động 187–205 MB, không có xu hướng tăng rõ trong 4 vòng (chưa ép GC nên chưa loại trừ rò chậm). DOM tăng 2 node mỗi lần đổi room: đó là dòng chat mới, nhật ký chat đã có trần 120 dòng (`pushLog`).

### 2.5 Nhịp chơi (`pnpm sim:progress`)

- Ngưng Khí 1 → viên mãn tầng 15: **2,2 giờ** chơi một mình (mục tiêu 3–4 giờ thực tế; sim chưa tính đi lại, boss, bí cảnh).
- Ngưng Khí 3 (ngự kiếm): sau ~10 con sói và 2 lần trả nhiệm vụ, khoảng phút thứ 6–8.
- Cột "mất máu mỗi lần hạ quái sau khiên + hồi nguyên": **0–2% từ tầng 4 trở đi** (trừ tầng 6: 12%). Quái thường không tạo áp lực.
- Tâm ma ở bình cảnh: hạ trong 64–71 giây trên hạn 150 giây.

---

## 3. Lỗ hổng kỹ thuật và hiệu năng

| # | Phát hiện | Bằng chứng | Mức | Ai làm |
| --- | --- | --- | --- | --- |
| T1 | **Texture không nén trên GPU.** Mọi texture asset là `RGBAFormat` + `UnsignedByte` có mip: 5,3 MB mỗi tấm 1024², 21,3 MB cho `boss_han_giao_color` 2048². Một prop Tripo tốn 16 MB (color + normal + ORM). Mảng texture mặt đất 1024²×8 lớp: 42,7 MB | `bench:client` với danh sách 60 texture lớn nhất, hồ, Vừa: 348 MB / 100 texture; 45 tấm đầu đều là `f1023 t1009` | **P0** (còn 34 MB tới trần ở Cao) | Việc mới **PERF-TEX** (pipeline asset): xuất KTX2 nén khối (BC7/ASTC ≈ 1 B/px) hoặc hạ normal/ORM của prop xuống 512². Ước giảm 3–4 lần. Không thuộc PR B/C/D |
| T2 | **Tick server tăng 7 lần khi 50 người đánh ở rừng**: 367 quái sống cùng lúc, mỗi tick duyệt hết | Bảng 2.3 | P0 | **M-2** (đang làm, session -92) |
| T3 | **Băng thông 80 KB/s mỗi client**: chưa có AOI, cả kênh nhận 367 quái. 50 client ≈ 4 MB/s ra từ server | Bảng 2.3 | P0 | **M-2** |
| T4 | CPU khung p95 9–10,7 ms ở rừng 50 người; `render` 5,9 ms với ~230 draw | Bảng 2.3 | P1 | Một phần tự hết khi M-2 giảm số quái vẽ. Phần còn lại: gộp lưới VFX cùng kiểu thành `InstancedMesh` → **K-6** (đang đụng `render/vfx/*`) |
| T5 | Khựng 12–33 ms khi boss có xương hoặc một mức LOD hiện lần đầu (11–14 pipeline mới mỗi lượt) | `bench:crowd`: "10 khung > 12 ms" ở mọi cảnh | P1 | Sprint 2 (nạp trước GLB boss khi tới gần + `compileAsync` lưới ẩn). Ràng buộc: không vẽ khi pipeline WebGPU còn dở (M6-1) |
| T6 | WebGL2 Cao ở sân 39 fps (nghẽn GPU), một lượt | Bảng 2.2 | P1, cần đo lại | **PR D** đo lại bằng `bench:crowd --presets high` trước/sau khi chỉnh ánh sáng |
| T7 | Bảng icon UI 695 KB nạp trước khi vào game, tăng theo mỗi đợt icon | `pnpm size` | P1 | Sprint 2: tách bảng icon HUD (thanh chiêu, nút) khỏi bảng icon vật phẩm, bảng sau nạp lười khi mở Túi |
| T8 | Nhãn tên: mỗi thực thể một `CanvasTexture` + một `Sprite` (một draw call mỗi nhãn, tối đa `LABEL_MAX`) | `models.ts` `makeLabel`, `entities.ts` | P1 | Sprint 2: atlas chữ + một lưới instanced như `HeadBars`. PR C chỉ sửa nội dung và độ mờ, không đổi kỹ thuật vẽ |
| T9 | `SkillBar` đăng ký `x`, `y`, `z` của store và có `useNow(100)`: cả 9 ô và tooltip dựng lại 10 lần/giây chỉ để biết đang lơ lửng hay không | `ui/Hud.tsx` `SkillBar` | P1 | **PR C**: thay bằng một cờ `airborne` trong store |
| T10 | `syncHud` gọi `set({...})` ~20 trường mỗi 100 ms, trong đó chuỗi `perf` nối mới mỗi lần khi `?debug=1`; số liệu overlay viết cứng tiếng Việt (`quái`, `người`, `ô`, `hạt`) | `engine.ts:2131` | P1 | **PR B**: chuyển số liệu vào bảng F3 dạng số, nhãn qua i18n |
| T11 | Thanh máu boss và mục tiêu không bị bỏ khi đi xa (xem U3) | Ảnh 07 | P0 | **PR C** |
| T12 | Không rò GPU khi đổi room | Bảng 2.4 | Đạt | |
| T13 | Dispose: `Game.dispose()` gọi dispose của entities, vfx, terrain, ground, lanterns, grass, props, post, renderer. `PARTICLES`/`RAIN` là singleton cấp module, chỉ `detach` (đúng thiết kế) | Đọc `engine.ts:2546`, `vfx.ts:897` | Đạt | |
| T14 | Cấp phát trong vòng lặp: `DamageNumbers.spawn` `pos.clone()` mỗi số; `setTimeout` mỗi đòn có giữ nhịp (`onDmg`, `onFx`) | `vfx.ts:918`, `engine.ts:1370/1648` | Nhỏ | **K-7** khi làm lại nhịp đòn: thay `setTimeout` bằng hàng đợi theo thời gian game (đúng khuyến nghị của guizang: bước khung tay không kích `setTimeout`) |
| T15 | Chuỗi hiển thị trong `ui/` đã qua i18n hết. Quét literal có dấu trong `apps/client/src`: 105 chỗ, tất cả là log console, ghi chú clip và overlay debug (T10) | Script quét | Đạt | |

---

## 4. Điểm yếu UI/UX (có ảnh)

| # | Phát hiện | Ảnh | Mức | Ai làm |
| --- | --- | --- | --- | --- |
| U1 | **Hàng nút hành động co còn 3×3 px ở 1280×720.** `.action-row` đo được 75×3 px, mỗi `.k-btn` 3×3 px: Đả tọa, Ngự kiếm, Túi, Nhân vật, Công pháp, Tổ đội, Nhiệm vụ, Trợ giúp, Cài đặt chỉ còn là chín chấm. Ở 1920×1080 hiện bình thường | `audit/13-hang-nut-3px-1280.png`, so với `audit/10-hud-san-1920.jpg` | **P0** | **PR C** |
| U2 | **UI không phóng theo màn hình.** Ở 2560×1440 chữ bảng ~12 px, khung nhân vật 270 px; ở 1280×720 bảng Nhân vật cao hơn khung nhìn và bị thanh chiêu đè phần dưới | `audit/12-tui-2560.jpg`, `audit/04-nhan-vat-1280.jpg` | **P0** | **PR C**: hệ số phóng theo chiều cao khung nhìn (720 → 1, 1440 → ~1,6), bảng có chiều cao tối đa và cuộn trong |
| U3 | **Thanh máu boss kẹt lại.** Chọn Hàn Giao rồi rời đi (dịch chuyển, chết và hồi sinh ở tông môn): thanh boss, chân dung và chỉ báo "448 m" vẫn ở trên màn hình. `bossFor` trả boss đang chọn bất kể khoảng cách; mục tiêu là quái không tự bỏ khi ra xa | `audit/07-thanh-boss-ket-448m.jpg` | **P0** | **PR C** |
| U4 | **Bảng tên 3D của boss lộ sau thanh máu boss** (lỗi đã biết): nhãn boss phóng 1,8 lần, khi boss cao và camera thấp thì nhãn nằm đúng vùng thanh boss của HUD | Tái hiện lại trong PR C | **P0** | **PR C**: ẩn nhãn 3D của boss đang có thanh HUD |
| U5 | **Bảng tên của chính mình** lúc quá nhỏ (dòng cảnh giới không đọc được ở camera xa), lúc quá to (chiếm giữa màn hình khi camera gần). Nhãn quái sát camera to gấp 3 lần chữ HUD | `audit/01-hud-san-1280.jpg`, `audit/06-boss-han-giao-1280.jpg`, `audit/11-canh-ho-1920.jpg` | P1 | **PR C**: dạng `[Ngưng Khí tầng 9]`, kẹp cỡ chữ theo px, mờ dần theo khoảng cách |
| U6 | **Không có nút Đột Phá trên HUD.** Phải mở bảng Nhân vật, cuộn xuống cuối mới thấy nút độ kiếp; bình cảnh chỉ hiện huy hiệu nhỏ | `audit/04-nhan-vat-1280.jpg` | P1 | **PR C** |
| U7 | **Số sát thương chưa phân cấp đủ**: thường (trắng 20 px), bạo kích (vàng 28 px + "!"), mình trúng (đỏ). Chưa có "khắc chế"; số của người khác màu cam mờ khó đọc trên cỏ | `audit/05-chien-dau-rung-1280.jpg` | P1 | **PR C** phần hình (cỡ, viền, hoạt ảnh bạo kích). Cờ khắc chế cần server gửi trong `DmgMsg`: ghi vào **3-10** |
| U8 | **HUD độ kiếp** là một hộp tím có emoji tia sét, khác ngôn ngữ bộ khung; dòng chữ dùng gạch dài | `audit/09-do-kiep-tim-ca-khung.jpg` | P1 | **PR C** |
| U9 | **Tên chưa thống nhất**: bảng ghi "Túi đồ" (đầu đề yêu cầu "Túi trữ vật", glossary chưa có mục này); `ui.zone.valley` = "Thung lũng Thanh Khê" trong khi vùng là `zone.thung_lung` = "Thung Lũng Thanh Phong" và Thanh Khê là tên con suối | `audit/03-tui-tooltip-1280.jpg` | P1 | **PR C** (i18n + glossary; không đụng code minimap) |
| U10 | **Phẩm chất**: viền ô theo phẩm có nhưng màu Linh/Huyền/Địa gần nhau ở cỡ ô 48 px; tên phẩm đúng glossary (Phàm/Linh/Huyền/Địa/Thiên phẩm) | `audit/03-tui-tooltip-1280.jpg`, `audit/12-tui-2560.jpg` | P1 | **PR C** |
| U11 | **Tooltip** không tràn ra ngoài ở 1280 và 2560, nhưng tooltip dài che thanh chiêu và có thể chạm mép dưới | `audit/03-tui-tooltip-1280.jpg` | P1 | **PR C**: kiểm ở 1280×720, 1920×1080, 2560×1440 |
| U12 | **Bảng F3** chỉ có phím, trạng thái, ping; FPS và draw call nằm ở dòng chữ 11 px góc phải, bị thanh chiêu che ở 1920 | `audit/02-f3-1280.jpg` | P1 | **PR B** |
| U13 | Gợi ý "Bấm vào màn hình để nhìn bằng chuột" nằm giữa màn hình suốt lúc chưa khóa chuột, che nhân vật | Mọi ảnh | P1 | **PR C**: tự ẩn sau vài giây, dời xuống trên thanh chiêu |
| U14 | **HUD chiếm ~17% màn hình ở 1280×720** (mục tiêu dưới 15%): khung nhân vật 240×100, bản đồ nhỏ 190×205, thanh chiêu 588×83, chat 320×151 = 160 nghìn px² trên 922 nghìn. Chat là khối lớn nhất mà phần lớn thời gian trống | DOM đo ở 1280 | P1 | **PR C**: chat thu gọn khi không gõ, đo lại sau khi thêm nút Đột Phá |

Không đụng: bản đồ nhỏ, bản đồ lớn (M-4, session -94); ảnh nền bảng và màn tải (#95, session -95). PR C chờ #95 merge rồi mới đổi chất liệu.

---

## 5. Điểm yếu hình ảnh và gameplay

| # | Phát hiện | Ảnh | Mức | Ai làm |
| --- | --- | --- | --- | --- |
| G1 | **Sân tông môn phẳng và vàng**: đá lát lặp ô, gần như không có bóng đổ đọc được, núi sau điện là hai khối xanh mép cứng, không có lớp sương giữa. Trái với art bible mục 1 ("cảnh có lớp gần, giữa, xa") | `audit/01-hud-san-1280.jpg`, `audit/10-hud-san-1920.jpg` | P1 | **PR D** (sương, ánh sáng, hậu kỳ) |
| G2 | **Cảnh hồ đã đúng hướng**: núi tan vào sương, nắng xuyên sương. Dùng làm mốc cho các vùng khác | `audit/11-canh-ho-1920.jpg` | Đạt | |
| G3 | **Nhân vật chìm vào nền** ở sân và rừng: áo lam trên nền vàng/xanh không có viền sáng tách khối | `audit/01`, `audit/05` | P1 | **PR D**: rim-light yếu sắc `air_sun_dawn` (art bible 5.3: không rim trắng gắt) |
| G4 | **Độ kiếp nhuộm tím cả khung**: trái art bible mục 1 ("tím dưới 5% khung hình, không làm tông nền") | `audit/09-do-kiep-tim-ca-khung.jpg` | P1 | **PR D**: nền chuyển lam đêm, tím chỉ ở tia sét và vùng báo |
| G5 | **Mưa kiếm của boss che kín nhân vật** khi camera thấp | `audit/06-boss-han-giao-1280.jpg` | P1 | **K-6** |
| G6 | **Camera chui vào thân boss** khi đứng sát Hàn Giao | Ảnh chụp lúc soát (không đưa vào repo) | P1 | **K-7** (camera: khoảng cách tối thiểu tới boss khi chiến đấu; đã có `minBossDist` cho cảnh điện ảnh) |
| G7 | **Cỏ rừng** là bụi nhọn sẫm, thưa và lặp | `audit/05-chien-dau-rung-1280.jpg` | CUT/DEFER | Sau Sprint 2 |
| G8 | **Ba công pháp dùng chung động tác và 6/9 chiêu** | `GAME_DESIGN_CORE.md` mục 6 | P0 về thiết kế | **K-5** (động tác), **K-6** (VFX), **3-10** (số) |
| G9 | **Quái thường không tạo áp lực** từ tầng 4 | Mục 2.5 | P1 | **3-10** |
| G10 | **Tuyến tân thủ thiếu nghi thức** (dẫn khí, bay lần đầu, nhắc Trúc Cơ) | `GAME_DESIGN_CORE.md` mục 3 | P1 | PR C (gợi ý UI), Sprint 2 (nhiệm vụ) |
| G11 | **Độ kiếp chỉ có một cách chơi** (chạy vòng) | `GAME_DESIGN_CORE.md` mục 5 | P1 | Sprint 2 (server), số ở **3-10** |
| G12 | **Tinh anh còn dựng bằng khối** | CLAUDE.md | CUT/DEFER | Cần credit Tripo: chờ người dùng |
| G13 | Nội suy người chơi khác khi đông | Chưa soát | Chưa biết | **PR D** soát bằng `pnpm bots --count 30`; nếu giật mà nguyên nhân ở lọc state thì chuyển **M-2** |

---

## 6. Danh sách ưu tiên

### [P0] Phải xong trong đợt này hoặc đang có người làm

| Mã | Việc | Ai làm |
| --- | --- | --- |
| P0-1 | Hàng nút hành động 3 px ở 1280×720 (U1) | **PR C** |
| P0-2 | UI phóng theo màn hình 1280×720 → 2560×1440, bảng không vượt khung nhìn (U2) | **PR C** |
| P0-3 | Thanh boss kẹt, mục tiêu không bỏ khi đi xa (U3) | **PR C** |
| P0-4 | Bảng tên 3D của boss lộ sau thanh máu boss (U4) | **PR C** |
| P0-5 | Bảng F3 có FPS, thời gian khung, draw call, tam giác, thực thể, VFX, ping; nút test qua lệnh GM; `?realm=`, `?tribulation=1`, `?at=x,z` | **PR B** |
| P0-6 | Tick server và băng thông với 367 quái (T2, T3) | **M-2** (-92) |
| P0-7 | Texture GPU không nén (T1) | **PERF-TEX**, việc mới, cần Orchestrator giao |
| P0-8 | Máy trạng thái animation windup → hitAt → recovery, cửa sổ hủy | **K-4** (-96) |

### [P1] Nên làm, đã có chủ

| Mã | Việc | Ai làm |
| --- | --- | --- |
| P1-1 | Nút Đột Phá trên HUD, mốc kế tiếp trên thanh tu vi (U6) | **PR C** |
| P1-2 | Bảng tên `[Ngưng Khí tầng 9]`, kẹp cỡ, mờ theo khoảng cách (U5) | **PR C** |
| P1-3 | Số sát thương phân cấp; HUD độ kiếp theo bộ khung (U7, U8) | **PR C** |
| P1-4 | Tên "Túi trữ vật", tên vùng, phẩm chất rõ hơn, tooltip ở 3 độ phân giải (U9–U11) | **PR C** |
| P1-5 | Hồi chiêu dạng vòng linh văn; `SkillBar` không dựng lại 10 lần/giây (T9) | **PR C** |
| P1-6 | Sương có lớp, rim-light, bloom chọn lọc, độ kiếp bớt tím (G1, G3, G4) | **PR D** |
| P1-7 | Chơi trọn NK1 → độ kiếp, sửa lỗi logic nhỏ; soát nội suy 30 bot (G13) | **PR D** |
| P1-8 | Chiêu IK, ba ngôn ngữ động tác | **K-5** (spec mục 7.1) |
| P1-9 | VFX theo công pháp, vạch báo của quái, gộp draw call VFX (T4, G5) | **K-6** (spec mục 7.2) |
| P1-10 | Camera và âm thanh đòn (G6, T14) | **K-7** (spec mục 7.3) |
| P1-11 | Bản đồ lớn, Truyền Tống Trận | **M-4** (-94) |
| P1-12 | Điểm đáng chú ý trên bản đồ, nhiệm vụ dạy hệ thống | **M-5** (ghi chú mục 7.4) |
| P1-13 | Cân bằng: nhịp 3–4 giờ, áp lực quái thường, bản sắc số của ba công pháp, cờ khắc chế | **3-10** (ghi chú mục 7.5) |
| P1-14 | Khựng biên dịch pipeline lần đầu (T5); tách bảng icon (T7); nhãn tên instanced (T8) | Sprint 2, chưa có chủ |
| P1-15 | Tuyến tân thủ: nhiệm vụ dẫn khí, nghi thức bay lần đầu; độ kiếp ba pha | Sprint 2, chưa có chủ |

### [CUT/DEFER]

| Việc | Lý do |
| --- | --- |
| Bang hội, kết hôn, gia viên, phó bản mới, bản đồ mới | Ngoài vòng lõi |
| Kết Đan, Nguyên Anh trong code | MVP dừng ở Trúc Cơ; chỉ thiết kế |
| Model tinh anh, làm lại cỏ rừng (G7, G12) | Cần credit Tripo hoặc việc asset lớn |
| ECS, Rapier, VAT, Web Worker | CLAUDE.md đã chấp nhận không dùng; số đo chưa đòi |
| 100 người một kênh dưới 8 ms | Server tách kênh ở 50 |
| P2-F phát hành, Safari thật, mời bạn bè, `apps/admin` | Bị cấm trong đợt này |
| Giao dịch giữa người chơi, mobile, soft-lock | Quyết định đã chốt |

---

## 7. Spec cho việc đã xếp hàng

Các spec dưới đây viết trên **hiện trạng code**, để worker nhận việc dùng ngay. Mọi thứ chỉ là lớp trình diễn ở client: server vẫn quyết định trúng đòn và sát thương tại `hitAt` (K-2).

### 7.1 K-5: chiêu IK, ba ngôn ngữ động tác

Hiện trạng: 19 pose trong `packages/content/data/poses/*.json`, mỗi pose 3–5 khung khóa (`keys[]` gồm `hips`, `spine`, `head`, `handR/L`, `elbowR/L`, `sword`, `edge`, `footR/L`, `ease`), `hit: [bắt đầu, kết thúc]`. Ba công pháp dùng chung một giọng động tác.

**Cấu trúc 7–9 khung khóa** cho mỗi chiêu tấn công (thời gian tính theo `windup`/`hitAt`/`recovery` của chiêu trong `skills.json`; `hitAt[0]` phải trùng `hit[0]` ±0,03 giây, `content:check` đã kiểm):

| # | Khung | Thời điểm | Yêu cầu |
| --- | --- | --- | --- |
| 1 | Thủ thế | 0 | Trùng tư thế chiến đấu chờ (`kiem_thu`) để liên chiêu không giật |
| 2 | Vào thế | 35% `windup` | Trọng tâm bắt đầu dồn về chân sau |
| 3 | **Tụ lực** | 80% `windup` | Sâu hơn khung 2; hông xoay ngược hướng vung ≥ 20° |
| 4 | **Giữ** | `windup` − 0,06 s → `windup` | Đứng hình 0,05–0,08 s (2 khung khóa gần như trùng nhau) |
| 5 | **Trúng** | `hitAt[0]` | Từ 4 sang 5 dùng ease-out bậc 4; mũi kiếm đi ≥ 1,2 m trong ≤ 0,08 s |
| 6 | Quá đà | `hitAt` + 0,06 s | Vượt quá khung 5 thêm 10–15% biên độ |
| 7 | Hãm | `hitAt` + 35% `recovery` | Trọng tâm về giữa |
| 8 | Thu kiếm | `hitAt` + 75% `recovery` | Nằm trong cửa sổ `cancel.move`: sau mốc này di chuyển được cắt |
| 9 | Về thủ thế | `hitAt` + `recovery` | Trùng khung 1 |

Chiêu niệm (`cast > 0`) và chiêu hộ thể/hồi phục dùng 7 khung (bỏ 6 và 8).

**Ba ngôn ngữ động tác** (đo được bằng đầu dò số của trang `?show=skill`):

| | Kiếm tu (Lạc Kiếm Quyết) | Hộ pháp (Bất Động Kim Thân) | Đan sư (Thanh Mộc Đan Kinh) |
| --- | --- | --- | --- |
| Từ khóa | Nhanh, thẳng, xa | Nặng, thấp, gần | Tròn, mềm, tay áo |
| Hạ hông khi tụ lực | 0,06–0,10 m | 0,16–0,22 m | 0,02–0,05 m |
| Xoay hông tối đa | 35–45° | 15–25° | 20–30° |
| Tầm tay phải ở khung trúng | ≥ 0,75 m trước ngực | 0,45–0,6 m, ngang hông | 0,5–0,65 m, cao ngang vai |
| Thời gian giữ (khung 4) | 0,05 s | 0,08 s | 0,06 s |
| Quá đà | 15% | 5% (dừng gắt) | 10%, theo cung tròn |
| Chân | Bước tới 0,3–0,45 m ở khung trúng | Hai chân bám đất, rộng hơn vai 0,15 m | Chân sau lùi 0,2 m, mũi chân xoay |
| Tay trái | Kiếm chỉ, đối trọng sau lưng | Nắm quyền che ngực | Ấn quyết trước ngực, tay áo vung trễ 0,08 s (xương `sleeve_l`) |

Chiêu cần làm: 6 chiêu gốc × 3 giọng cho 2 chiêu dùng nhiều nhất (đòn thường 3 đòn và Kiếm Khí Trảm), cộng 9 chiêu công pháp (mỗi công pháp 3). Tổng 15 pose mới hoặc viết lại. Chọn pose theo công pháp qua `pose` của biến thể chiêu; không đổi luật.

Kiểm: `pnpm content:check`; ảnh ba giọng cạnh nhau ở khung 3 và khung 5 (`pnpm shots:k1`); không pose nào để kiếm xuyên thân (đầu dò `sword` so với `spine`).

Phụ thuộc: **K-4** xong trước (máy trạng thái và chia lớp thân trên/dưới).

### 7.2 K-6: VFX theo công pháp

Hiện trạng: pool `FxPool` (kiểu `glow`, `flat`, `solid`, `shade`, `slash`, `ink`, `sigil`, `trail`, `bolt`, `beam`, `vortex`, `inkpool`), mỗi kiểu một material; hạt GPU 2 draw call với ngân sách 5.000/12.000/20.000 (Thấp/Vừa/Cao); trần `FX_MAX_HDR` 2,4; `fxBudget.ts` bỏ hiệu ứng trang trí của người khác khi pool ≥ 30 lưới hoặc xa hơn 45 m. Ở rừng 50 người đo được 400–770 hạt sống (dưới 7% ngân sách Vừa) và ~230 draw call.

**Nhịp ba pha cho mọi chiêu** (thời lượng tính theo chiêu):

| Pha | Thời điểm | Hình | Độ sáng đỉnh (HDR) |
| --- | --- | --- | --- |
| Tụ lực | 0 → `hitAt` − 0,05 s | Hạt hút vào tay/kiếm, vòng nhỏ dưới chân thu vào | ≤ 1,2 |
| Bùng nổ | `hitAt` ± 0,05 s, dài 0,10–0,16 s | Lõi sáng nhỏ + mép mềm; một vòng chấn động | 2,0–2,4 (đúng trần hiện có) |
| Tan | 0,35–0,7 s sau bùng nổ | Ăn mòn theo nhiễu (ngưỡng tăng dần), lớp mực nền sống lâu hơn lớp sáng 0,3 s | ≤ 0,8 |

**Vệt kiếm bám mũi kiếm**: dải 12–16 đoạn lấy mẫu vị trí hai điểm trên lưỡi kiếm (gốc và mũi, từ xương `dtl_sword`) mỗi khung trong cửa sổ `[hitAt − 0,10, hitAt + 0,08]`; sống 0,18–0,25 s; hình nét bút (dày giữa, thon hai đầu) như `slash` hiện có. Dùng lại kiểu `trail` (tối đa 8 dải toàn cảnh hiện nay; nâng lên 12, người khác chỉ vẽ khi trong 25 m). Không thêm material.

**Ngân sách**:

| Thứ | Của mình | Của người khác |
| --- | --- | --- |
| Hạt mỗi chiêu thường | ≤ 60 | ≤ 30 |
| Hạt chiêu tối thượng | ≤ 400 | ≤ 150 |
| Lưới pool sống mỗi chiêu | ≤ 4 | ≤ 2 |
| Draw call thêm khi 50 người cùng đánh | 0 so với hôm nay; mục tiêu **giảm ≥ 40** nhờ gộp `fx-glow`/`fx-slash`/`fx-inkpool` thành `InstancedMesh` (T4) | |
| Diện tích màn hình một hiệu ứng che | ≤ 25% trong ≤ 0,2 s; không che thân mục tiêu và vùng báo trước | |

**Màu theo công pháp** (art bible mục 4, nhóm linh quang): kiếm tu `spirit_sword` #CFF3FF; hộ pháp `spirit_gold` #FFDE96; đan sư `spirit_jade` #7FE3D0. Tím chỉ cho thiên lôi và ma khí.

**Vạch báo của quái** (dùng kiểu `sigil` sẵn có, hình 0 tròn / 1 chữ nhật / 2 quạt): mép ngoài hiện ngay, một vạch sáng chạy từ tâm ra mép đúng bằng thời gian báo trước; quạt có sọc chảy ra ngoài; đường thẳng thon đầu như lưỡi kiếm; 80 ms cuối nháy sáng một lần. Màu `wood_cinnabar` cho quái thường, `spirit_demonic` cho boss. Độ mờ nền ≤ 0,35 để vẫn đọc được chân nhân vật.

**Linh quang hộ thể Trúc Cơ** (`GAME_DESIGN_CORE.md` 4.3): một lưới `sigil` bán kính 0,9 m dưới chân, chỉ khi đứng yên ngoài chiến đấu, độ mờ ≤ 0,25.

Sửa kèm: mưa kiếm của boss che nhân vật khi camera thấp (G5): giảm độ mờ mảnh kiếm trong 6 m quanh camera.

Kiểm: `pnpm bench:client` và `pnpm bench:switch` (bắt lỗi cache shader khi đổi preset), `pnpm bench:crowd --scenes rung,boss`; ảnh trước/sau từng công pháp ở ba pha.

### 7.3 K-7: camera và âm thanh đòn

Hiện trạng: hit-stop theo từng thực thể đã có (`hitreact.ts`: thường 70 ms, nặng 100 ms, bạo kích 120 ms, tối đa 150 ms; nhân hệ số hạng thân 0,75–1); rung camera một biến mức (`shake.ts`: bạo kích 0,3, trúng đòn nặng 0,5, sấm 0,8, boss đập đất 1,1; giảm 2,2/giây; biên độ 0,22 m ở mức 1); SFX có `pitch` ngẫu nhiên theo từng tiếng (`audio.ts:579`); nhịp đòn giữ bằng `setTimeout`.

**Hit-stop** (đầu đề yêu cầu 40–70 ms; hiện dài hơn và người đánh cũng khựng bằng mục tiêu):

| Đòn | Mục tiêu | Người đánh (mình) | Ghi chú |
| --- | ---: | ---: | --- |
| Thường (đòn 1, 2 của liên hoàn) | 40 ms | 0 | Đánh liên tục không được dính |
| Đòn thứ ba của liên hoàn, chiêu có `power` ≥ 2 | 55 ms | 30 ms | |
| Bạo kích | 70 ms | 40 ms | |
| Bạo kích + đòn nặng, chiêu tối thượng | 90 ms (trần) | 50 ms | Chỉ mức này được vượt 70 ms |
| Mình trúng đòn nặng (`hv`) | | 60 ms | |

Nhân hệ số hạng thân như hiện nay. Hit-stop của người khác: bỏ (`noStop`, đã có). Trong lúc khựng, lệnh bấm vẫn vào hàng đợi chiêu (`skillQueue.ts`), không mất phím.

**Rung** (mức của `CameraShake`, giữ quy tắc lấy max, không cộng dồn):

| Sự kiện | Mức | Thời gian tắt |
| --- | ---: | --- |
| Đòn thường của mình trúng | 0 | |
| Đòn thứ ba liên hoàn | 0,12 | ~0,05 s |
| Bạo kích của mình | 0,3 (giữ) | ~0,14 s |
| Chiêu tối thượng của mình trúng | 0,6 | ~0,27 s |
| Mình trúng đòn nặng | 0,5 (giữ) | |
| Sấm độ kiếp, boss đập đất | 0,8 / 1,1 (giữ) | |

Thêm rung **có hướng**: 60% biên độ theo hướng đòn (nguồn → đích) ở khung đầu. Tôn trọng công tắc "Rung camera" trong Cài đặt.

**Camera**:

- Khoảng cách tối thiểu tới boss đang giao chiến: không để camera vào trong bán kính thân boss + 1,5 m (dùng lại `minBossDist`), sửa G6.
- Đẩy FOV +1,5° trong 80 ms rồi về trong 200 ms khi tung chiêu tối thượng. Không zoom theo từng đòn thường.
- Tiêu điểm: lệch tối đa 3 m về phía mục tiêu khi giao chiến, nhân vật luôn trong 1/3 giữa khung.

**Âm thanh**:

- Tiếng trúng phát **đúng `hitAt`** (đồng hồ `AudioContext`, không phải `setTimeout`): lên lịch bằng `src.start(ctx.currentTime + trễ)` ngay khi nhận `FxMsg`. Sai số mục tiêu < 15 ms so với khung trúng của animation.
- Pitch ngẫu nhiên **0,92–1,08** cho mọi tiếng đòn (`pitch: 0,08` trong `sounds.json`; hiện mỗi tiếng một giá trị riêng). Đòn thứ ba liên hoàn cao hơn một bậc (+6%).
- Tiếng vung (whoosh) ở `hitAt − 0,08 s`, nhỏ hơn tiếng trúng 6 dB.
- Bạo kích: chồng thêm một lớp kim khí; không tăng âm lượng tổng quá +3 dB (giữ quy tắc `audio:check`: nhạc ≈ 1/3 đòn đánh).
- Hạ nhạc 20% trong 120 ms khi chiêu tối thượng trúng (`duck()` sẵn có).

Kỹ thuật: thay `setTimeout` trong `onDmg`/`onFx` bằng hàng đợi theo thời gian game xử lý trong `frame()` (T14), để bước khung tay và tab ẩn không lệch nhịp.

Kiểm: test đơn vị cho bảng hit-stop và hàng đợi; `__sound` log thời điểm phát so với `hitAt`; ảnh/GIF một liên hoàn 3 đòn.

### 7.4 M-5: điểm đáng chú ý trên bản đồ (ghi chú thêm từ đợt kiểm toán)

- Mỗi vùng săn một điểm có **cơ duyên nhìn thấy từ xa** (cột linh quang yếu ban ngày, rõ ban đêm): gắn với nền truyện linh mạch (`GAME_DESIGN_CORE.md` 2.2).
- Ba nhiệm vụ dạy hệ thống (cường hóa +3, vào Kiếm Trủng, tỉ thí) đặt người giao ở các điểm này.
- Tên điểm mới phải vào `glossary.json` và qua `lore-keeper`.
- Sửa `ui.zone.valley` nằm ở PR C; M-5 không cần làm lại.

### 7.5 3-10: cân bằng (ghi chú thêm từ đợt kiểm toán)

Đợt này **không đổi số nào**. Các việc dồn về 3-10:

1. Nhịp 2,2 giờ (sim) so với mục tiêu 3–4 giờ thực tế: đo lại sau M-2 (số quái và cách hồi sinh đổi).
2. Áp lực quái thường: cột "mất/lần" 0% từ tầng 4.
3. Bản sắc số của ba công pháp: kiếm tu thiếu tốc độ/bạo kích, hộ pháp thiếu cận chiến và khống chế, đan sư thiếu sát thương riêng (`GAME_DESIGN_CORE.md` 6.1).
4. Cờ "khắc chế" ngũ hành trong `DmgMsg` để số sát thương hiện được (PR C chỉ chuẩn bị kiểu hiển thị).
5. Độ kiếp ba pha: số sát thương tia cuối, giới hạn đan, hoàn Trúc Cơ Đan.
6. Trúc Cơ cần một thứ chỉ Trúc Cơ làm được.

---

## 7.6 Phát hiện thêm khi làm PR C (2026-11-16)

| Phát hiện | Mức | Ai làm |
| --- | --- | --- |
| **Thiên lôi độ kiếp đánh mọi người chơi đứng trong vùng** (24% khí huyết tối đa mỗi tia, `tickHazards` không phân biệt chủ kiếp), kể cả khi người độ kiếp đã ngắt kết nối và đang được giữ chỗ 60 giây. Người mới ở sân tông môn có thể bị giết oan và mất 5% tu vi. Tái hiện: nhân vật thử cấp 9 vào sân lúc một nhân vật khác đang độ kiếp, chết sau vài giây | **P0** | **PR D** (sửa luật ở server + test) |
| Sau M-2 (AOI) quái ra khỏi tầm nhìn thì client còn giữ `targetId` trỏ vào quái không còn trong state | P1 | Đã sửa ở PR C (bỏ mục tiêu khi quái rời state hoặc quá 90 m / boss 140 m) |

## 8. Kế hoạch bốn PR của đợt này

| PR | Phạm vi | Vùng code | Không đụng |
| --- | --- | --- | --- |
| **A** (tài liệu này) | Kiểm toán, Game Bible, ảnh | `docs/` | Code |
| **B** | Bảng F3 mở rộng, nút test qua lệnh GM, tham số URL | `ui/DebugPanel.tsx`, `ui/store.ts`, `game/testParams.ts`, phần `debugInfo` của `engine.ts`, `server/testflags.ts`, lệnh GM trong `sim.ts` (chỉ khối `gm()`), i18n | Sinh quái trong `sim.ts`, `rooms.ts` phần lọc state |
| **C** | UI/UX | `ui/Hud.tsx`, `ui/Panels.tsx`, `ui/*.css`, `ui/kit/*`, `game/models.ts` (`makeLabel`), phần nhãn trong `entities.ts`, `DamageNumbers`, i18n, glossary | `ui/minimap/*`, MapPanel, ảnh nền bảng và màn tải (#95), animation trong `entities.ts` |
| **D** | Ánh sáng, không khí, soát core loop | `render/post.ts`, `render/atmosphere.ts`, `render/grading.ts`, `render/materials/world.ts`, `assets/palette.json` (khối `grading`) + art bible 5.1 | `render/vfx/*`, `game/vfx.ts` (K-6), `game/character/*` (K-4) |

Mỗi PR: `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm build`, `pnpm size`, `pnpm bench:client`; PR có sửa server thêm bộ `security`, `pnpm bots --count 100 --duration 120`, `pnpm ledger:check`.
