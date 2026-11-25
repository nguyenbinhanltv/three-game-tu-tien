# archive/codex-assets

Script Codex một lần, không còn nằm trong luồng chính (Đợt C, kế hoạch tối ưu source). Không có tham chiếu từ code, CI hay `package.json`. Chuyển khỏi `tools/codex-assets/` bằng `git mv` (lịch sử còn nguyên).

| File | Dùng để | Chạy lại |
| --- | --- | --- |
| `chr-v3-gen.mjs` | concept nhân vật v3 Lạc Kiếm (front/side/back, `--variant v3b`) | `node archive/codex-assets/chr-v3-gen.mjs` (import `tools/codex-assets/outfit-data.mjs`) |
| `mon-multiview-gen.mjs` | 4 hướng cho quái/boss C6 | `node archive/codex-assets/mon-multiview-gen.mjs [--only id,id] [--jobs 3] [--force]` |
| `mon-sheet.mjs` | contact sheet 4 hướng | `node archive/codex-assets/mon-sheet.mjs --out <thư mục tuyệt đối> [--only id,id]` |
| `missing.mjs` | liệt kê icon thiếu trong atlas | `node archive/codex-assets/missing.mjs` |
| `mon-concepts.json` | mô tả từng quái cho hai script trên | (dữ liệu) |

Các script tính gốc repo bằng `../..` nên chạy được từ vị trí archive (cùng độ sâu với `tools/codex-assets`). `concepts.json` vẫn ở `tools/codex-assets/` vì `gen.mjs concepts` đọc nó.
