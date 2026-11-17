# Ảnh bảng GM và lệnh thử đồ (GM-TEST)

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/gm-commands/<file>`.

Chụp bằng `pnpm --filter @dtl/perf run shots:gm --out <thư mục tuyệt đối>` (WebGPU, 1280×720, `?mute=1`, Chrome `--mute-audio`, cặp cổng riêng, tự tắt server). Bảng lệnh đầy đủ: [`../gm-commands.md`](../gm-commands.md).

## Bảng GM trong F3 (từng nhóm)

| Nhóm | Ảnh |
| --- | --- |
| Nhân vật | ![](panel-char.webp) |
| Kỹ năng | _(ảnh đã gỡ)_ |
| Trang bị (bậc / nhánh / +N / giới tính) | ![](panel-gear.webp) |
| Trang phục | _(ảnh đã gỡ)_ |
| Vũ khí | _(ảnh đã gỡ)_ |
| Bản đồ | _(ảnh đã gỡ)_ |
| Quái | _(ảnh đã gỡ)_ |

## Lệnh chạy thật

- `kit 2 kiem +10 f` bấm từ bảng (bậc 2, Kiếm tu, +10, nữ): ![](kit-bac2-kiem-tu-+10-sau.webp)
- `help kit`, `find liet mach`: _(ảnh đã gỡ)_
- `help` (đủ danh sách): ![](help-full.webp)
- `outfit set_dia_giap m`, `outfit set_phuc_mach f`: ![](outfit-set_dia_giap.webp)
- `weapon itm_liet_mach_kiem +10`: _(ảnh đã gỡ)_

Góc camera là camera chơi bình thường (nhân vật nhỏ trong khung); xem kỹ hình dạng đồ thì dùng trang xem asset `?mute=1&show=char`.
