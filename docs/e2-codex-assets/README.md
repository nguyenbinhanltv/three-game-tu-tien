# E2 asset 2D Codex (Kết Đan trở đi)

Cùng quy trình PR #93–#95 (`docs/codex-assets/`): `node tools/codex-assets/gen.mjs <icons|portraits|loading>` (Codex + công cụ ảnh tích hợp, không Tripo, không API key), nguồn PNG + prompt ở `../dtl-asset-source/2d/<nhóm>/`, đóng gói `pack.mjs`, atlas `pnpm icons:build`. Không đổi logic, chỉ trường `icon` (đã có sẵn) và asset.

## Kiểm kê trên origin/main (trước khi làm)

`node tools/codex-assets/missing.mjs` (mới) liệt kê def có `icon` mà chưa có ô trong atlas. `pnpm icons:check` trước: **92/141** có tranh, 49 dùng emoji `iconFallback`; sau: **141/141**.

| Nhóm | Thiếu (trước) | Số |
| --- | --- | --- |
| Chiêu bậc 2–3 E2-G (`methods.skills`, `iconFallback` có sẵn) | 7 kiếm tu, 5 hộ pháp, 9 đan sư | 21 |
| Vật phẩm / nguyên liệu | `itm_ket_dan_dich`, `itm_ngung_dan_mach_tinh`, `itm_mach_tinh_phien`, `itm_hoang_sa_thao`, `itm_pha_canh_dan_2` | 5 |
| Đan bậc 2 | `itm_hoi_mach_dan`, `itm_{kim_cuong,bao_huyet,manh_luc}_dan_2` | 4 |
| Trang bị bậc 2 (`templates.json`) | kiếm, đạo bào, hộ uyển, ngoa, đai, ngọc bội, giới chỉ | 7 |
| 3 bộ Kết Đan (`setItems.json`) | Liệt Mạch ×4, Địa Long ×4, Phục Mạch ×4 | 12 |
| Chân dung | boss Địa Mạch Long, 3 tinh anh Đoạn Mạch (`elite_liet_cot_bao`, `elite_ho_mach_khoi_tuong`, `elite_xich_sa_ngo_cong`) | 4 |
| Màn tải | Đoạn Mạch Cổ Cốc (trước đó dùng nhầm theo biome Vân Lam) | 1 |
| Thẻ chương | chương 2 (`ch2`), Kết Đan (`ascend_kd`): chỉ có chữ trên cảnh 3D, chưa có tranh nền | 2 |

Chưa có trên main nên chưa gắn (ảnh đã vẽ, để sẵn): NPC chương 2 (Tô Vãn Ngư, Hứa lão, Khưu Hàn Sơn), boss Thôn Mạch Ngô Công Vương, Thạch Tâm Khôi Vương, màn tải Phục Mạch Quật, mảnh bộ phó bản, Ngưng Đan Lô, thần thức, ba nguyên liệu tinh anh chưa có id.

## Đã làm

- **49 icon** (`tools/codex-assets/icons.json`, 128 px/ô vào atlas, thêm hàng LICENSES): hud 467 KB (trước 342), items 535 KB (trước 376). Bảng `hud`/`items` vẫn tách như T7, `items` nạp lười. Ảnh: `icons-grid.jpg` (49 icon + 2 icon chờ ở cuối), `bag-bac2.jpg`, `method-bac2.jpg`.
- **9 chân dung** (`portraits.json`; 480×640 WebP ~45 KB/ảnh, nạp lười khi khung hiện): gắn tự động theo id quái cho boss Địa Mạch Long và 3 tinh anh Đoạn Mạch (`BossBar`, `TargetFrame`). Ảnh: `portraits-grid.jpg`, `boss-dia-mach-long.jpg`, `elite-ho-mach-khoi-tuong.jpg`.
- **6 màn tải** (`loading.json`, 1600×900 WebP): `doan_mach` gắn theo level (`bootArt.ts` `LEVEL_ART`, `rememberLevel` ở `Game.enterLevel` nên màn tải của chính lần chuyển level đã hiện tranh đích), `phuc_mach_quat` đã khai trong `LEVEL_ART` chờ level. Ảnh: `loading-grid.jpg`, `loading-doan-mach.jpg`.
- **Thẻ chương**: `chuong_2` và `ket_dan` làm tranh nền mờ (mặt nạ elip, 42%) sau chữ của thẻ `ch2` / `ascend_kd` (`Hud.tsx` `CARD_ART`, `.chapter-art`); thiếu ảnh thì như cũ. Ảnh: `chapter-ch2.jpg`.
- Ý tưởng bản đồ sau: `van_hai_phu_dao` (Nguyên Anh), `thien_khuyet_co_thanh` (Hóa Thần) trong `loading-grid.jpg`; đã đóng gói trong `art/loading/`, chưa gắn.

## Việc để lại / cách gắn id mới

- **Icon chờ id**: `tools/codex-assets/icons.pending.json` (`itm_ngung_dan_lo`, `skl_than_thuc_quet`; `gen.mjs` sinh ảnh nhưng `build.mjs` không đọc). Khi E2-E đặt id, đổi khóa cho khớp `icon` của def (PNG ở `2d/icons/`), chuyển mục sang `icons.json`, thêm hàng LICENSES, `pnpm icons:build`.
- **Chân dung NPC / boss**: ảnh đã đóng gói với khóa `npc_to_van_ngu`, `npc_hua_lao`, `npc_khuu_han_son`, `boss_thon_mach_ngo_cong_vuong`, `boss_thach_tam_khoi_vuong`. Nếu id NPC/quái thật khác, đổi tên khóa trong `portraits.json`, `gen.mjs portraits` không sinh lại (PNG đã có: đổi tên tệp ở `2d/portraits/`), rồi `pack.mjs portraits`.
- Mảnh bộ phó bản, nguyên liệu tinh anh/boss mới: gắn `icon` + chủ thể vào `icons.json` khi def có trên main; mục `missing.mjs` cho biết còn thiếu gì.

## Chạy lại

```
node tools/codex-assets/missing.mjs            # liệt kê icon thiếu
node tools/codex-assets/gen.mjs icons|portraits|loading [id…] [--jobs 4]
node tools/codex-assets/pack.mjs portraits loading
pnpm icons:build && pnpm icons:check
pnpm shots:e2codex --out <thư mục tuyệt đối>   # ảnh trong game (tắt tiếng, tự dựng/tắt server, PORT/CLIENT_PORT)
```
