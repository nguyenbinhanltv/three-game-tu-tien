# CPU p95 mỗi khung (ngân sách 8 ms): đo và kết quả

Đo: `pnpm bench:crowd --bots 50 --scenes san,rung,boss --renderers webgpu --presets medium --profile` (Chrome headless 1280x720, Vite dev, cổng 2677/5177).

| Cảnh (50 bot, WebGPU Vừa) | CPU p50 / p95 / p99 (ms) | draw |
| --- | --- | --- |
| Sân tông môn | 4,6 / 6,3 / 17,6 | 168 |
| Rừng (bot đánh quái, nhiều VFX) | 5,6 / **9,1** / 13,7 | 193 |
| Kiếm Trủng (boss) | 5,1 / 7,3 / 18,2 | 169 |

Chỉ cảnh rừng vượt 8 ms. Profile cảnh rừng (6,2 s mẫu): `Game.frame` 100%; `render` (three, theo draw call: `updateForRender`/`updateBinding` 20%, `draw`, `_projectObject`) 67%; `EntityManager.update` 17%; `updateMatrixWorld` 10% (xương người chơi). GPU chỉ 0,7–1,7 ms nên điểm nghẽn là CPU theo số draw call/đối tượng, không phải đổ bóng hay fragment.

## Thay đổi
- `treeImpostor.ts`: bật frustum culling cho 24 siêu ô impostor (trước đây `frustumCulled = false`, luôn vẽ cả phía sau camera), bounding sphere tính từ đúng các instance. Hình không đổi (ô trong khung nhìn vẫn vẽ như cũ).

## Số trước/sau (cảnh rừng, 3 lượt xen kẽ mỗi bên, p95 ms)
- Trước: 9,0 / 8,0 / 7,9 (và 9,1 lần đo đầu)
- Sau: 7,4 / 8,0 / 8,6 (và 7,5 / 10,5 hai lần đầu)
- Draw call tối đa: trước 198/212/189, sau 180/192/177 (giảm ~8%).

Kết luận trung thực: nhiễu giữa các lượt (±1,5 ms, phụ thuộc tick server và số quái/VFX lúc đó) lớn hơn tác dụng, nên chưa chứng minh được p95 < 8 ms ổn định. Việc còn lại để ăn chắc: giảm số đối tượng vẽ (gộp skin quái LOD2, gộp pool prop theo vật liệu) và chia nhỏ cập nhật uniform theo đối tượng của three; cần phiên riêng với bench lặp nhiều lượt hơn (`--seconds 20`, 5+ lượt).

## Vòng 2: đo lặp và thử giảm chi phí (không đạt)

Công cụ: `pnpm --filter @dtl/perf crowd:repeat --runs N` (chạy `bench:crowd` N lượt, in trung vị p95; mặc định 50 bot, cảnh rừng, WebGPU Vừa, 12 s). Camera đã xác định (xoay đều), phần ngẫu nhiên là hành vi bot/quái; tick server dao động 3,4–6,2 ms giữa các lượt nên p95 nhiễu theo.

- Nền (đã có impostor culling), 5 lượt: p95 = 9,0 / 8,1 / 8,2 / 9,7 / 7,7, **trung vị 8,2**, p50 5,8, draw ~180.
- Thử: bỏ thật cả cây xương ngoài khung khỏi `scene.updateMatrixWorld` (code cũ đặt `matrixWorldAutoUpdate = false` ở `inner` nhưng three 0.178 vẫn nhân ma trận con cháu vì `force` truyền từ gốc). Đo xen kẽ 6 lượt mỗi bên: trước 8,4 / 8 / 8,8 / 7,7 / 7,2 / 8,6 (trung vị 8,2), sau 7,9 / 8,6 / 11,2 / 7,2 / 8 / 7,3 (trung vị 7,95). Không khác biệt ngoài nhiễu, **đã hoàn lại** (không đáng rủi ro).
- Profile cảnh rừng: mã game tự nó chỉ ~11% khung (entities, footsteps, vfx, skinned đều dưới 1,5%); phần lớn là nội bộ three theo từng đối tượng vẽ (`updateForRender/updateBinding`, `draw`, `_projectObject`) và mixer. Vi tối ưu mã game không đủ kéo p95 xuống dưới 8 ms; cần giảm số đối tượng vẽ rõ rệt (>20%: gộp skin quái LOD2, gộp pool prop theo vật liệu, hạ LOD0 quái/người) và có thể đổi hình.
