# Texture tải dần (đánh giá đồ họa, hạng mục 4)

Vừa/Thấp giữ nguyên (texture trong GLB). Cao/Cực cao tải thêm bậc texture cao **sau khi vào game**.

## Pipeline
`pnpm assets:hires [--only id,id] [--dry]` (sau `assets:build`): với asset lớp `monster*`, `elite*`, `boss*` (KHÔNG gồm nhân vật `player*`: texture nhân vật trong GLB đã bị chỉnh sau khi nhập nên bậc cao từ nguồn gốc làm lệch màu, đã thấy ở `chr_kiem_tu_nam`) có `import.source`
trong `../dtl-asset-source`, lấy texture gốc, ghép vật liệu (theo tên, hoặc theo thứ tự khi cùng số vật liệu vì Blender đổi tên thành `<id>_mat`),
nén KTX2 (cùng tham số `encodeArgs`), cỡ = min(2× ngân sách lớp, 4096 màu / 2048 normal-ORM, cỡ nguồn), ghi `public/assets/hi/<id>.<slot>.<hash>.ktx2`
và mục `hires` trong `manifest.json` (`mat`, `slots`, `file`, `width`, `bytes`, `gpuBytes`). Không xóa/đổi nguồn và GLB build.
`assets:build` ghi lại manifest nên làm mất mục `hires`: chạy lại `assets:hires`.

**Thu hẹp (sau PR giảm tải):** chỉ texture **màu** của boss và tinh anh (`hiresWanted` ở `tools/asset-pipeline/src/hires.ts`); quái thường, normal và ORM không làm bậc cao (bản trong GLB đủ ở khoảng cách chơi; normal 2048 của boss riêng 19 MB). Kết quả: 24 asset (12 boss, 12 tinh anh), **15 MB** tệp rời (trước: 42 asset, 66 MB), không vào tải đầu. Trần 4096 cho màu vẫn còn trong `hiresSide` nhưng boss/tinh anh hiện đều 2048 (ngân sách lớp ×2); nâng lên 4096 sẽ thêm khoảng +19 MB nên chưa làm.

## Client (`apps/client/src/game/hires/`)
- `policy.ts` (thuần, có test): Cao → cạnh ≤ 2048, 1 MB/s, GPU thêm ≤ 128 MB; Cực cao → ≤ 4096, 1,5 MB/s, ≤ 180 MB; `deviceMemory` ≤ 6 → 96 MB, ≤ 4 → tắt;
  tắt khi Save-Data, 2G/3G hoặc `downlink` < 0,7 Mbps.
- `streamer.ts`: mỗi 0,5 s chọn một tệp (gần camera nhất, `AssetCache.hiresCandidates`), qua xô byte; tải < 200 KB/s thì dừng 30 s; hạ preset → `revertHires()` trả về texture GLB và giải phóng bộ nhớ.
- `index.ts`: `startHires()` ở `main.tsx`; chỉ chạy khi đã vào game 8 s và trung bình 30 khung gần nhất ≤ 22 ms. `?hires=0` tắt, `__hires()` đọc `{tier, loaded, memMB}`.
- `AssetCache` (`game/assets.ts`): `applyHires` thay `material[slot]` cho vật liệu cùng tên (mọi bản sao dùng chung vật liệu nên đổi một lần), giữ texture cũ để trả lại; `release()` cuối cùng tự trả và dispose.

Đo ảnh: `pnpm shots hires [--ids a,b|all] --out <thư mục>`: trang xem asset, clip dừng khung 0, cùng camera, `__viewer.setHires(id, bật/tắt)`; `--ids all` quét 42 asset (lệch màu trung bình ≤ 0,5/255). Preset `ultra` (Cực cao) chưa có ở PR này (làm sau chuỗi tách `engine.ts`); chính sách đã sẵn bậc 2 cho khi có.

## Giới hạn đã biết
- Thứ tự "gần camera" dùng vị trí các bản sao do `AssetCache.acquire` cấp; nhân vật/quái dùng một bản mẫu rồi tự clone lưới nên với nhóm đó khoảng cách có thể lệch (chưa ưu tiên chính xác theo thực thể).
- `gpuBytes` đếm cộng dồn (texture GLB cũ được giữ để trả lại khi hạ preset); normal map giải ra RGBA8 trên WebGPU còn giữ thêm bản trong RAM JS, chưa tính vào trần.
- Chưa đo khung dài nhất quanh lúc áp dụng (`mat.needsUpdate`, upload 2048–4096): `pnpm shots hires --perf` là việc tiếp theo.
- `assets:build` ghi lại manifest và làm mất mục `hires`: chạy lại `pnpm assets:hires`.
