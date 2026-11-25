# Baseline cổng đo bản đồ

`iso-high.json` (sinh trên `main` 25/11, 119 dòng) là baseline gọn của `pnpm perf:iso` ở preset Cao: một dòng mỗi (điểm đo, preset) với draw call/tam giác tối đa, texture MB, heap MB, CPU p95. `pnpm perf:gate` so mỗi PR với file này (xem `tools/perf/src/gate.ts`, `tools/perf/src/lib/gate.ts`).

Sinh/cập nhật (chỉ làm trên `main` sạch, sau khi một PR cải thiện đã merge, kèm `--note "main <sha>"`):

```
pnpm perf:iso --presets high --out bench/results
pnpm perf:gate --make-baseline bench/results/iso-<ngày>.json --out tools/perf/baselines/iso-high.json --note "main <sha>"
```

**Baseline gắn với backend và viewport lúc đo** (`backend`, `viewport` trong file): lần chạy khác backend/viewport (ví dụ WebGL2 trên CI) bị cổng CHẶN thay vì so chéo, vì số đếm khác thật giữa WebGPU và WebGL2. Mỗi backend một baseline riêng (`iso-high.json` = WebGPU 1280×720; runner CI dùng `iso-high-webgl2.json`, sinh từ artifact của workflow `perf-gate`). `--ignore-baseline-mismatch` bỏ qua baseline, chỉ xét ngân sách vùng.

**Phương pháp đo:** baseline hợp lệ có `method: "settled-v1"` (sinh bằng `perf:iso` có chờ cảnh nạp xong, #675). Baseline không có trường này (bản đo đầu, 25/11) đo non (Vân Lam 354k tam giác/94 MB thay vì ~821k/460–500 MB thật) nên `perf:gate` TỪ CHỐI nó với lý do `baseline lỗi thời`.

Chưa có baseline thì cổng chỉ áp ngân sách vùng, mà một số điểm hiện đã vượt (ví dụ texture Vân Lam): hãy tạo baseline trước khi bật cổng bắt buộc. Baseline là "bậc thang": điểm đã vượt ngân sách chỉ bị chặn khi tệ hơn baseline quá 10%.
