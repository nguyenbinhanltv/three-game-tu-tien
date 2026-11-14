# Mẫu prompt Codex (sinh ảnh concept)

Dùng trong Codex với công cụ sinh ảnh (GPT-Image-2 theo bảng giá hiện tại). Mỗi prompt ghép từ 3 khối: **khối đối tượng** (thay theo asset) + **khối phong cách** + **khối cấm**. Hai khối sau giữ nguyên văn.

Kích thước ảnh: nhân vật và quái dùng khổ dọc `1024×1536` (quái bốn chân dùng khổ ngang `1536×1024`), prop dùng `1024×1024`. Chất lượng cao nhất có thể ở ảnh mặt trước; ảnh sửa (bên, sau) để cùng chất lượng.

---

## 1. Khối phong cách (giữ nguyên văn)

```text
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
proportions about 6 heads tall for humans, big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise,
limited palette: ivory paper white (#EDE6D6), warm ink greys (#B9B6AE, #8A8782, #5F5D5C, #48464B, #2B2B2E),
slate blue (#7F9AAE), sect blue (#3B6EA8), deep navy (#1F3A5A), dark teal (#2F5D62), cinnabar red (#A8322D),
dark wood brown (#5A3D2A), wood brown (#8A6B3C), bronze gold (#B8913F), earth beige (#CDBF96), skin (#F0CFA8),
pine green (#275C3F, #3A7A4C), jade green (#7FE3D0) used only as a small painted accent.
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
```

Chỉ giữ trong danh sách màu những màu thật sự cần cho đối tượng (bớt danh sách giúp ảnh ít lạc màu hơn), nhưng **không thêm** màu ngoài bảng. Mã màu đầy đủ ở `assets/palette.json`.

## 2. Khối cấm (giữ nguyên văn)

```text
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog,
no magic effects, no motion lines, no speed lines, no aura, no reflections, no specular highlights, no metallic shine,
no realistic skin pores, no fabric weave, no individual hair strands, no photorealism, no chibi,
no background scenery, no props on the floor, no second character, no cropped body parts.
```

---

## 3. Nhân vật người: concept 3 góc

Làm tuần tự: sinh **mặt trước** (3–4 phương án), người dùng chọn 1, rồi **sửa ảnh** (giữ ảnh trước làm tham chiếu) để ra góc bên và góc sau. Không sinh 3 góc độc lập vì trang phục sẽ lệch nhau.

### 3.1 Mặt trước

```text
SUBJECT: full body character turnaround reference, FRONT VIEW, <đối tượng, ví dụ: young male sword cultivator, disciple of a mountain sword sect>,
<khuôn mặt và tóc>, <trang phục: màu chính, viền, đai, giày>,
standing in a neutral A-pose: arms straight and lowered about 45 degrees away from the body, palms facing the thighs,
clear gap between the wide sleeves and the torso, feet shoulder-width apart, looking straight at the camera, calm neutral expression,
empty hands, no weapon, no scabbard, no backpack.
<khối phong cách>
<khối cấm>
```

### 3.2 Góc bên (sửa từ ảnh mặt trước đã duyệt)

Đính kèm ảnh mặt trước đã chọn, rồi:

```text
Using the attached image as the exact design reference, draw the SAME character from a strict SIDE PROFILE VIEW,
camera rotated exactly 90 degrees, the character faces the RIGHT edge of the image so that the character's LEFT side is visible.
Same A-pose, same proportions, same height in the frame, same outfit, same colors, same hairstyle, nothing added or removed.
Strict orthographic profile: only one eye visible, shoulders seen edge-on, both feet overlapping.
<khối phong cách>
<khối cấm>
```

Kiểm ảnh bên trước khi dùng (`assets.md` mục 3): chỉ thấy một mắt, hai vai chồng lên nhau, hai bàn chân chồng lên nhau. Nếu thấy cả hai mắt hay ngực hướng ra camera là góc 3/4, sinh lại.

### 3.3 Góc sau (sửa từ ảnh mặt trước đã duyệt)

```text
Using the attached image as the exact design reference, draw the SAME character from directly BEHIND (BACK VIEW),
camera rotated exactly 180 degrees. Same A-pose, same proportions, same height in the frame, same outfit, same colors,
same hairstyle seen from the back, nothing added or removed. The face is not visible.
<khối phong cách>
<khối cấm>
```

### 3.4 T-pose (dự phòng)

Chỉ dùng khi Tripo Auto Rig báo lỗi hoặc tay áo dính vào thân ở A-pose. Thay câu tư thế bằng:

```text
standing in a T-pose: arms straight out horizontally to the sides, palms facing down, wide sleeves hanging below the arms,
feet shoulder-width apart, looking straight at the camera.
```

---

## 4. Quái bốn chân: concept 3 góc

Quái cũng cần nhiều góc (multiview). Thứ tự giống nhân vật: sinh **góc bên** trước (góc này đọc hình rõ nhất với thú bốn chân), duyệt, rồi sửa ra góc trước và sau.

```text
SUBJECT: full body creature turnaround reference, SIDE PROFILE VIEW facing the RIGHT edge of the image,
<giống loài và đặc điểm: lean grey mountain wolf, long muzzle, ...>,
standing in a neutral pose: all four legs straight and visible, weight even, head level, mouth closed, tail held straight back and slightly down,
strict orthographic profile.
<khối phong cách>
<khối cấm>
```

Góc trước và sau: dùng mẫu 3.2/3.3 nhưng thay "character" bằng "creature", "A-pose" bằng "neutral standing pose", và câu góc nhìn thành `FRONT VIEW, the creature faces the camera` hoặc `BACK VIEW, seen from directly behind`.

## 5. Quái hai chân và boss

Như nhân vật người (mục 3) nhưng đổi tư thế thành `neutral standing pose, arms slightly away from the body` và bỏ câu về tay áo. Boss thêm `massive, imposing silhouette` và ghi chiều cao tương đối, ví dụ `about 2.5 times the height of a human`.

---

## 6. Prop, vũ khí, đồ rơi (một ảnh)

Prop dựng bằng Image→3D một ảnh, nên dùng **góc 3/4 nhìn hơi từ trên xuống** để Tripo thấy được cả mặt trước, mặt bên và mặt trên.

```text
SUBJECT: single game prop, <đối tượng và vật liệu>, <kích thước tương đối: about 1.2 meters tall>,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame, standing upright on nothing,
simple solid construction, no loose small parts.
<khối phong cách>
<khối cấm>
```

Vũ khí dài (kiếm, phi kiếm): thay câu góc nhìn bằng `three-quarter view, the blade pointing to the upper right at 45 degrees, the whole sword complete in frame`. Nếu Tripo dựng lưỡi kiếm bị dày hoặc cong, chuyển sang Multiview với 3 ảnh: mặt phẳng lưỡi, cạnh lưỡi, nhìn từ mũi kiếm.

## 7. Moodboard (không đưa vào Tripo)

Moodboard là ảnh cảnh để chốt không khí, không dùng để dựng. Ở đây được phép có cảnh nền và ánh sáng, nhưng vẫn cấm chữ và tên tác phẩm có thật:

```text
Wide establishing shot concept painting for a stylized low-poly cel-shaded game, ink-wash inspired Chinese fantasy cultivation world:
<cảnh: a sword sect courtyard on a misty mountain, ivory stone plaza, dark teal tiled roofs, cinnabar red pillars, pink peach blossom trees, distant layered blue-grey mountains fading into mist>,
bright airy daylight, soft blue-grey shadows, flat colors, limited palette (ivory, ink greys, slate blue, dark teal, cinnabar red, bronze gold, pine green),
no text, no watermark, no characters in the foreground.
```

Danh sách moodboard đề xuất (10–15 ảnh): núi Vân Lam Sơn Mạch lúc sáng sớm; sân Lạc Kiếm Tông; sơn môn Lạc Kiếm Tông (cổng đá hoặc cổng gỗ son đỏ); hồ sương mù; rừng linh thảo; Kiếm Trủng; đệ tử luyện kiếm; trưởng lão; Sói Xám trong rừng tùng; Yêu Lang dưới trăng (không phát sáng); Hàn Giao trên hồ; lò đan trong đan phòng; ngự kiếm trên biển mây.

## 8. Icon (sau M0)

```text
A row of 6 round game skill icons in the same style on a pure black background, evenly spaced, each icon a simple bold symbol:
<1: ..., 2: ..., 3: ..., 4: ..., 5: ..., 6: ...>,
ink-wash inspired flat colors, limited palette (ivory, ink grey, sect blue, cinnabar red, bronze gold, jade green), thin bronze ring border,
no text, no letters, no watermark.
```

Cắt ra từng icon. Khi bổ sung icon mới, dùng lại nguyên văn câu phong cách.
