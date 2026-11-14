# Nguồn gốc

- Repo: https://github.com/op7418/guizang-game-skill (tác giả: 歸藏 / Guizang)
- Commit: `6001e56e1eaa60be49e5aa4ef81d08b746a1b4e2` (2026-11-12 01:57 +08:00), lấy ngày 2026-11-14
- Giấy phép: GNU AGPL-3.0, toàn văn trong `LICENSE`. Nội dung game demo (nhánh `gh-pages`) không thuộc giấy phép này và không được chép.

## Thay đổi so với bản gốc

- `SKILL.md`: thay `description` trong frontmatter cho hợp phạm vi dự án, thêm khối ghi chú ở đầu. Thân bài giữ nguyên.
  - `description` gốc: "用 AI 生成素材（Tripo 等 3D 模型、即梦等图片与配音、Suno 等配乐）加 three.js，做一个能在浏览器里跑、最后打包成单个 HTML 的 3D 动作游戏的完整流程和踩坑清单。……Build a polished browser 3D action game (three.js / WebGL, isometric soulslike, boss fight) with AI-generated assets and ship it as one HTML file."
- `references/*.md`, `LICENSE`: chép nguyên văn.
- Không chép: `scripts/` (build_single_html.mjs, build_minitool.mjs, input.js, serve.mjs: build/serve cho game một file, không hợp kiến trúc client–server và sẽ kéo code AGPL vào game), `media/`, `README*.md`.

## Soát an toàn trước khi chép

Đã đọc toàn bộ SKILL.md, references, scripts, README; quét ký tự Unicode ẩn/bidi và comment HTML. Không thấy prompt injection, hook, lệnh gửi dữ liệu ra ngoài hay script tự chạy. Script gốc chỉ đọc/ghi `assets/`, `dist/` và gọi `ffmpeg`/`zip`; `serve.mjs` chỉ nghe 127.0.0.1. Không chạy script nào.
