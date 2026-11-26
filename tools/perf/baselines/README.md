# Baseline cổng đo bản đồ

`iso-high.json` (sinh trên `main` 25/11, 119 dòng) là baseline gọn của `pnpm perf:iso` ở preset Cao: một dòng mỗi (điểm đo, preset) với draw call/tam giác tối đa, texture MB, heap MB, CPU p95. `pnpm perf:gate` so mỗi PR với file này (xem `tools/perf/src/gate.ts`, `tools/perf/src/lib/gate.ts`).

Sinh/cập nhật (chỉ làm trên `main` sạch, sau khi một PR cải thiện đã merge, kèm `--note "main <sha>"`):

```
pnpm perf:iso --presets high --out bench/results
pnpm perf:gate --make-baseline bench/results/iso-<ngày>.json --out tools/perf/baselines/iso-high.json --note "main <sha>"
```

**Baseline gắn với backend và viewport lúc đo** (`backend`, `viewport` trong file): lần chạy khác backend/viewport (ví dụ WebGL2 trên CI) bị cổng CHẶN thay vì so chéo, vì số đếm khác thật giữa WebGPU và WebGL2. Mỗi backend một baseline riêng (`iso-high.json` = WebGPU 1280×720; runner CI dùng `iso-high-webgl2.json`, sinh từ artifact của workflow `perf-gate`). `--ignore-baseline-mismatch` bỏ qua baseline, chỉ xét ngân sách vùng.

**Phương pháp đo:** baseline hợp lệ có `method: "settled-v1"` (sinh bằng `perf:iso` có chờ cảnh nạp xong, #675). Baseline không có trường này (bản đo đầu, 25/11) đo non (Vân Lam 354k tam giác/94 MB thay vì ~821k/460–500 MB thật) nên `perf:gate` TỪ CHỐI nó với lý do `baseline lỗi thời`.

**Điều kiện đo:** phải `pnpm assets:pull` ĐỦ trước khi chạy `perf:iso`. Worktree thiếu asset vẫn chạy game (thiếu kiến trúc/prop/cây) nên số đo thấp một cách im lặng (baseline 25/11 lần đầu sai vì vậy: Vân Lam 354k tam giác/94 MB thay vì ~820k/~480 MB). Các baseline hiện có: `iso-high.json` = WebGPU 1280×720 preset Cao (25/11, sau #675/#677/#679); baseline chính cho cổng (1920×1080 Vừa) là `iso-medium-1080.json` (WebGPU, RTX 3060 Ti, 119 dòng, 26/11, chạy theo 4 nhóm `--resume` + `kieu_*` liền một trang; 0 lỗi console). Lệnh: `pnpm perf:iso --presets medium --size 1920x1080 --only <nhóm> --resume bench/results/iso-checkpoint.json`; `--recycle 99` cho nhóm `kieu_1..9` (lỗi texture mặc định của three chỉ lộ khi chạy liền nhiều phòng, vá ở #693). `heapMB` cộng dồn qua nhiều level trên cùng một trang nên KHÔNG đáng tin (chỉ cảnh báo).

**Chạy cổng với baseline Vừa:** `pnpm perf:gate bench/results/iso-<ngày>.json --baseline tools/perf/baselines/iso-medium-1080.json` (không đặt `--presets` thì cổng lấy các preset CÓ trong baseline, ở đây `medium`; không có baseline thì `high`). Đặt `--presets` không khớp điểm nào của lần chạy thì cổng CHẶN ("không điểm nào khớp preset"), không báo ĐẠT im lặng.

Chưa có baseline thì cổng chỉ áp ngân sách vùng, mà một số điểm hiện đã vượt (ví dụ texture Vân Lam): hãy tạo baseline trước khi bật cổng bắt buộc. Baseline là "bậc thang": điểm đã vượt ngân sách chỉ bị chặn khi tệ hơn baseline quá 10%.

**Cập nhật 26/11 (main 519d89f4d):** `iso-high.json` và `iso-medium-1080.json` sinh lại từ `perf:iso` đủ 119 điểm (WebGPU, RTX 3060 Ti, `settled-v1`, 0 lỗi console) sau khi B4/B6/B12 vào main. Texture MB trung vị +21 MB so với bản cũ (nội dung/asset mới của main, không do một PR đơn lẻ), nên cổng không còn chặn oan ở texture; draw call cảnh đánh giảm theo B4.
