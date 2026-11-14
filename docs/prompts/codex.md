# Mẫu prompt Codex (sinh ảnh concept)

Phiên bản 3 (2026-11-15): hướng bán tả thực điện ảnh, xem `docs/art-bible.md`.

Dùng trong Codex với công cụ sinh ảnh (GPT-Image-2 theo bảng giá hiện tại). Mỗi prompt ghép từ 4 khối: **khối đối tượng** (thay theo asset) + **khối phong cách** + **khối chụp** + **khối cấm**. Ba khối sau giữ nguyên văn.

Có hai loại ảnh, đừng lẫn:

| Loại | Dùng để | Ánh sáng |
| --- | --- | --- |
| **Concept để dựng** (nhân vật, quái, prop) | đưa vào Tripo | **phẳng, trung tính, đều**, nền xám trơn. Ánh sáng kịch tính sẽ bị Tripo nướng vào texture và xung đột với nắng trong game |
| **Moodboard** (cảnh) | chốt không khí, tham chiếu chỉnh màu | điện ảnh: nắng sớm, sương dày, ngọc lam và vàng ấm (mục 7) |

Kích thước ảnh: nhân vật dùng khổ dọc `1024×1536`, quái bốn chân khổ ngang `1536×1024`, prop `1024×1024`, moodboard `1536×1024`. Chất lượng cao nhất có thể.

---

## 1. Khối phong cách (giữ nguyên văn)

```text
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
realistic human proportions about 7 heads tall, idealized but believable features,
believable materials with hand-painted detail: woven cloth with soft folds, leather, bronze, polished steel, weathered stone, wood grain, fur,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): ivory cloth (#E6DDCB), sect blue (#3B6584), deep navy (#22364E), dark teal (#2B5552),
cinnabar red (#9D392E), bronze (#AE8B49), dark wood (#4D3324), wood (#8A6944), stone greys (#BDB6A4, #7D786C, #464540),
pine green (#23503F), leaf green (#3E7552), dry grass (#B7AC74), skin (#E6BF9C), ink black hair (#29292C),
jade green (#7FE3D0) only as a small painted accent.
```

Chỉ giữ trong danh sách màu những màu thật sự cần cho đối tượng. Mã màu đầy đủ ở `assets/palette.json`.

## 2. Khối chụp cho concept để dựng (giữ nguyên văn)

```text
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
```

## 3. Khối cấm (giữ nguyên văn)

```text
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog, no snow,
no magic effects, no motion lines, no aura,
no cel shading, no toon outlines, no black contour lines, no flat cartoon colors, no anime style, no chibi,
no photograph, no photorealistic skin pores, no oily shiny skin, no plastic look,
no baked dramatic shadows, no night scene,
no background scenery, no props on the floor, no second character, no cropped body parts.
```

---

## 4. Nhân vật người: concept 3 góc

Làm tuần tự: sinh **mặt trước** (3–4 phương án), người dùng chọn 1, rồi **sửa ảnh** (giữ ảnh trước làm tham chiếu) để ra góc bên và góc sau. Không sinh 3 góc độc lập vì trang phục sẽ lệch nhau.

### 4.1 Mặt trước

```text
SUBJECT: full body character turnaround reference, FRONT VIEW, <đối tượng>,
<khuôn mặt và tóc>, <trang phục: chất liệu, màu chính, viền, đai, giày>,
standing in a neutral A-pose: arms straight and lowered about 45 degrees away from the body, palms facing the thighs,
clear gap between the wide sleeves and the torso, feet shoulder-width apart, looking straight at the camera, calm neutral expression,
empty hands, no weapon, no scabbard, no backpack.
<khối phong cách>
<khối chụp>
<khối cấm>
```

### 4.2 Góc bên (sửa từ ảnh mặt trước đã duyệt)

Đính kèm ảnh mặt trước đã chọn, rồi:

```text
Using the attached image as the exact design reference, draw the SAME character from a strict SIDE PROFILE VIEW,
camera rotated exactly 90 degrees, the character faces the RIGHT edge of the image so that the character's LEFT side is visible.
Same A-pose, same proportions, same height in the frame, same outfit, same materials, same colors, same hairstyle, nothing added or removed.
Strict orthographic profile: only one eye visible, shoulders seen edge-on, both feet overlapping.
<khối phong cách>
<khối chụp>
<khối cấm>
```

Kiểm ảnh bên trước khi dùng: chỉ thấy một mắt, hai vai chồng nhau, hai bàn chân chồng nhau. Thấy cả hai mắt là góc 3/4, sinh lại.

### 4.3 Góc sau (sửa từ ảnh mặt trước đã duyệt)

```text
Using the attached image as the exact design reference, draw the SAME character from directly BEHIND (BACK VIEW),
camera rotated exactly 180 degrees. Same A-pose, same proportions, same height in the frame, same outfit, same materials, same colors,
same hairstyle seen from the back, nothing added or removed. The face is not visible.
<khối phong cách>
<khối chụp>
<khối cấm>
```

### 4.4 T-pose (dự phòng)

Chỉ dùng khi Tripo Auto Rig báo lỗi hoặc tay áo dính thân ở A-pose. Thay câu tư thế bằng:

```text
standing in a T-pose: arms straight out horizontally to the sides, palms facing down, wide sleeves hanging below the arms,
feet shoulder-width apart, looking straight at the camera.
```

---

## 5. Quái: concept 3 góc

Quái bốn chân: sinh **góc bên** trước (đọc hình rõ nhất), duyệt, rồi sửa ra góc trước và sau.

```text
SUBJECT: full body creature turnaround reference, SIDE PROFILE VIEW facing the RIGHT edge of the image,
<giống loài, kích thước, lông/vảy/giáp, màu>,
standing in a neutral pose: all four legs straight and visible, weight even, head level, mouth closed, tail held straight back and slightly down,
strict orthographic profile.
<khối phong cách>
<khối chụp>
<khối cấm>
```

Góc trước và sau: dùng mẫu 4.2/4.3, thay "character" bằng "creature", "A-pose" bằng "neutral standing pose", câu góc nhìn thành `FRONT VIEW, the creature faces the camera` hoặc `BACK VIEW, seen from directly behind`.

Quái hai chân và boss: như nhân vật người, đổi tư thế thành `neutral standing pose, arms slightly away from the body`, bỏ câu tay áo. Boss thêm `massive imposing silhouette, about <2.5> times the height of a human`.

---

## 6. Prop, vũ khí, đồ rơi (một ảnh)

Prop dựng bằng Image→3D một ảnh, nên dùng **góc 3/4 nhìn hơi từ trên xuống** để Tripo thấy mặt trước, mặt bên và mặt trên.

```text
SUBJECT: single game prop, <đối tượng, chất liệu, màu>, <kích thước tương đối: about 1.2 meters tall>,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame, standing upright on nothing,
solid construction, no loose small parts.
<khối phong cách>
<khối chụp>
<khối cấm>
```

Vũ khí dài: thay câu góc nhìn bằng `three-quarter view, the blade pointing to the upper right at 45 degrees, the whole sword complete in frame`. Nếu Tripo dựng lưỡi bị dày hoặc cong, chuyển sang Multiview với 3 ảnh: mặt phẳng lưỡi, cạnh lưỡi, nhìn từ mũi kiếm.

---

## 7. Moodboard (không đưa vào Tripo)

Moodboard chốt không khí và làm mốc cho chỉnh màu (art bible mục 5). Được phép có cảnh, ánh sáng điện ảnh và sương; vẫn cấm chữ và tên tác phẩm có thật. **Không** dùng đêm tuyết hay tông chàm tím.

```text
Wide establishing shot concept painting for a semi-realistic cinematic 3D game set in a Chinese fantasy cultivation world:
<cảnh>,
early morning, warm golden sunlight breaking through thick layered mist, jade-teal atmosphere, distant mountains fading into teal mist,
cool teal shadows and warm gold highlights, soft volumetric light, believable materials, painterly detail,
no text, no watermark, no snow, no purple tint.
```

Cảnh đêm: thay vế `early morning, warm golden sunlight ... warm gold highlights` bằng `night, deep blue moonlight, warm lantern light, cool blue shadows, light mist`. Cảnh có nhân vật hoặc quái: nhân vật nhỏ, đứng ở lớp giữa, không chiếm khung hình.

Ví dụ phần `<cảnh>`: `a sword sect courtyard on a misty mountain, pale stone plaza, dark teal tiled roofs, cinnabar red pillars, pink peach blossom trees, pine forest on the slopes`.

Danh sách moodboard đề xuất (10–15 ảnh): Vân Lam Sơn Mạch lúc bình minh; sân Lạc Kiếm Tông buổi sáng; sơn môn Lạc Kiếm Tông trong sương; Hồ Sương Mù lúc sớm; rừng linh thảo có nắng xuyên tán; Kiếm Trủng; đệ tử luyện kiếm trên sân đá; trưởng lão trên bậc đá; Sói Xám trong rừng tùng sương sớm; Yêu Lang ở bìa rừng lúc chiều muộn; Hàn Giao trên mặt hồ; lò đan trong Đan Phòng có nắng qua cửa sổ; ngự kiếm trên biển mây lúc bình minh; sân tông môn ban đêm có đèn lồng (mốc cho preset đêm, lam trầm và vàng ấm, không tuyết, không tím).

## 8. Icon (sau M0)

```text
A row of 6 round game skill icons in the same style on a pure black background, evenly spaced, each icon a bold readable symbol:
<1: ..., 2: ..., 3: ..., 4: ..., 5: ..., 6: ...>,
semi-realistic painterly rendering, warm gold and jade-teal color scheme with ivory and bronze accents, thin bronze ring border,
no text, no letters, no watermark.
```

Cắt ra từng icon. Khi bổ sung icon, dùng lại nguyên văn câu phong cách. Hình dáng và bố cục icon tự thiết kế, không theo icon của game khác.

## 9. Họ icon M4-7: khung vuông vát góc

Icon UI là tranh hoàn chỉnh, không đưa vào Tripo. Mẫu này thay mẫu vòng tròn mục 8 cho M4-7. Chủ thể từng ID nằm trong `tools/icons/subjects.json` (6 skill, 23 vật phẩm).

```text
Use case: stylized-concept. ONE square original cultivation fantasy inventory/ability icon.
Subject: <subject from tools/icons/subjects.json>.
Same family: thin bronze chamfered SQUARE border inset 5%, dark jade teal mist gradient background,
warm dawn gold upper-left light, cool teal shadows. Semi-realistic cinematic painterly material rendering,
subject fills 75%, bold silhouette readable at 48px, restrained fine detail.
Palette #2B5552 #123B45 #AE8B49 #F2C47E #DCE6DF #7FE3D0 plus subject material color.
No text, letters, watermark, circular borders, ink brush ring, cartoon, purple background, scenery.
Entire object inside frame. Purple only as a tiny accent under 5%.
```

Sinh bằng công cụ ảnh tích hợp Codex, mỗi icon một lần gọi riêng. Phi Kiếm đầu tiên dùng cùng bảng màu/khung/ánh sáng, có núi sương mờ phía sau. PNG gốc ở `<DTL_ASSET_SOURCE>/icons/<id>.png`; atlas 128px/ô phục vụ UI 48–64px. `pnpm icons:build` tái đóng gói; `pnpm icons:check` kiểm atlas và manifest. Trang duyệt trình bày 48px, 64px, 128px.
