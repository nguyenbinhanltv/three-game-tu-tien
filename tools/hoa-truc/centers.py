"""Ghi tâm thân nhân vật (`cx`, 0–1 theo bề ngang ảnh) của từng tranh WebP có alpha vào manifest.json.
Tranh vẽ có tay áo/lụa bay lệch một phía nên tâm khung ảnh ≠ tâm người; client căn tâm thân vào giữa khoảng trống giữa hai cột ô.
cx = trung bình tâm đầu (hàng 3–13 % chiều cao) và tâm thân (hàng 25–60 %), chỉ tính điểm đặc (alpha > 200, bỏ voan/lụa mỏng).
Chạy: python tools/hoa-truc/centers.py (sau build.py; chỉ đọc file đã dựng trong apps/client/public/hoa-truc)."""
import json
import pathlib

import numpy as np
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parents[2] / 'apps/client/public/hoa-truc'


def centre(a: np.ndarray, r0: float, r1: float) -> float | None:
    h, w = a.shape
    band = (a[int(h * r0) : int(h * r1)] > 200).astype(float)
    col = band.sum(axis=0)
    if col.sum() < 1:
        return None
    return float((col * np.arange(w)).sum() / col.sum() / w)


man = json.loads((OUT / 'manifest.json').read_text(encoding='utf8'))
for name, rec in man.items():
    if not name.endswith(('_nam', '_nu')):
        continue
    im = Image.open(OUT / f'{name}.webp').convert('RGBA')
    a = np.asarray(im.getchannel('A'))
    parts = [c for c in (centre(a, 0.03, 0.13), centre(a, 0.25, 0.6)) if c is not None]
    if parts:
        rec['cx'] = round(sum(parts) / len(parts), 3)
        print(f'{name}: cx={rec["cx"]}')
(OUT / 'manifest.json').write_text(json.dumps(man, indent=1), encoding='utf8')
