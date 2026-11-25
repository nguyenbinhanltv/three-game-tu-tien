# Baseline cổng đo bản đồ

`iso-high.json` (sinh trên `main` 25/11, 119 dòng) là baseline gọn của `pnpm perf:iso` ở preset Cao: một dòng mỗi (điểm đo, preset) với draw call/tam giác tối đa, texture MB, heap MB, CPU p95. `pnpm perf:gate` so mỗi PR với file này (xem `tools/perf/src/gate.ts`, `tools/perf/src/lib/gate.ts`).

Sinh/cập nhật (chỉ làm trên `main` sạch, sau khi một PR cải thiện đã merge, kèm `--note "main <sha>"`):

```
pnpm perf:iso --presets high --out bench/results
pnpm perf:gate --make-baseline bench/results/iso-<ngày>.json --out tools/perf/baselines/iso-high.json --note "main <sha>"
```

Chưa có baseline thì cổng chỉ áp ngân sách vùng, mà một số điểm hiện đã vượt (ví dụ texture Vân Lam): hãy tạo baseline trước khi bật cổng bắt buộc. Baseline là "bậc thang": điểm đã vượt ngân sách chỉ bị chặn khi tệ hơn baseline quá 10%.
