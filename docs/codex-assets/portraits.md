# PR2 Chân dung (10 ảnh)

- Sinh: `node tools/codex-assets/gen.mjs portraits`; đóng gói: `node tools/codex-assets/pack.mjs portraits` → `apps/client/public/assets/art/portraits/<id>.<hash>.webp` (480×640, tổng 0,37 MB) + `art.json`.
- 3 NPC (`npc_chuong_mon`, `npc_duoc_su`, `npc_thiet_lao`), 4 boss, 3 tinh anh.
- Client: `ui/Art.tsx` (`Portrait`, `useArtUrl`) nạp `art.json` rồi từng ảnh khi chỗ dùng xuất hiện, thiếu ảnh thì không vẽ. Không nằm trong tải đầu.
- Nối vào: hội thoại NPC (`NpcDialog`, tab Trò chuyện), thanh boss (`BossBar`), khung mục tiêu (`TargetFrame`, quái/NPC; `TargetInfo.def` mới).
- Ảnh UI thật: `boss-portrait.webp`, `npc-portrait.webp`.
