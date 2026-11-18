"""Hoa Trúc: đóng gói tranh Codex (nền magenta phẳng) thành WebP có alpha / nền ở apps/client/public/hoa-truc.

Chạy: python tools/hoa-truc/build.py [thư mục nguồn]   (mặc định D:/METAGRIT/dtl-asset-source/portrait/hoa_truc hoặc $DTL_ASSET_SOURCE/portrait/hoa_truc)
- nhân vật / kiếm: tách nền magenta (khoảng cách màu + làm mềm viền, khử viền hồng), cắt theo khung chữ nhật, hạ cỡ, WebP alpha.
- cảnh giới: hạ cỡ, WebP không alpha.
Ghi thêm manifest.json (kích thước + khung nhìn của từng ảnh) cho client đọc.
"""
import json, os, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get('DTL_ASSET_SOURCE', 'D:/METAGRIT/dtl-asset-source')) / 'portrait' / 'hoa_truc'
OUT = ROOT / 'apps/client/public/hoa-truc'
OUT.mkdir(parents=True, exist_ok=True)
MAG = np.array([255, 0, 255], float)


def key(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(float)
    d = np.linalg.norm(a - MAG, axis=2)
    # alpha: 0 gần magenta thuần, 1 khi xa; dải chuyển 60..140 làm mềm viền
    alpha = np.clip((d - 60) / 80, 0, 1)
    # khử viền hồng: nơi bán trong suốt, kéo màu về xa magenta (giảm kênh đỏ/xanh dương dư so với xanh lục)
    spill = np.clip(1 - alpha, 0, 1)[..., None]
    g = a[..., 1:2]
    rb = a[..., [0, 2]]
    rb = rb - spill * np.maximum(0, rb - g) * 0.9
    a[..., 0] = rb[..., 0]
    a[..., 2] = rb[..., 1]
    out = np.dstack([a.clip(0, 255), alpha * 255]).astype('uint8')
    im2 = Image.fromarray(out, 'RGBA')
    # co alpha 1 điểm ảnh để bỏ quầng
    al = im2.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    im2.putalpha(al)
    return im2


def save(im: Image.Image, name: str, q: int, alpha: bool) -> dict:
    p = OUT / f'{name}.webp'
    im.save(p, 'WEBP', quality=q, method=6, alpha_quality=90 if alpha else 100)
    print(f'{name}: {im.size} {p.stat().st_size // 1024} KB')
    return {'w': im.size[0], 'h': im.size[1], 'kb': p.stat().st_size // 1024}


man = {}
for f in sorted(SRC.glob('*.png')):
    n = f.stem
    im = Image.open(f)
    if n.startswith('canh_'):
        im = im.convert('RGB')
        im = im.resize((800, int(800 * im.size[1] / im.size[0])), Image.LANCZOS)
        man[n] = save(im, n, 70, False)
    else:
        k = key(im)
        bb = k.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        k = k.crop(bb)
        tall = 1000 if n.startswith(('lac_', 'de_')) else 900
        k = k.resize((int(k.size[0] * tall / k.size[1]), tall), Image.LANCZOS)
        man[n] = save(k, n, 82, True)
(OUT / 'manifest.json').write_text(json.dumps(man, indent=1), encoding='utf8')
