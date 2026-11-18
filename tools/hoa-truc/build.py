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
    """Tách nền magenta KỂ CẢ vùng bán trong suốt (voan, lụa): P = a·C + (1−a)·M ⇒ a = 1 − m/255 với m = min(R,B) − G (nền magenta m=255, màu thật m≈0),
    rồi khôi phục màu thật C = (P − (1−a)·M)/a để voan không bị ám hồng."""
    p = np.asarray(im.convert('RGB')).astype(float)
    m = np.clip(np.minimum(p[..., 0], p[..., 2]) - p[..., 1], 0, 255)
    a = np.clip(1 - m / 255, 0, 1)
    a = np.clip((a - 0.03) / 0.94, 0, 1)
    af = np.maximum(a, 1e-3)[..., None]
    c = (p - (1 - a)[..., None] * MAG) / af
    c = np.clip(c, 0, 255)
    c[a < 0.02] = 0
    out = np.dstack([c, a * 255]).astype('uint8')
    im2 = Image.fromarray(out, 'RGBA')
    # viền cứng của nền phẳng: co alpha 1 điểm ảnh cho sạch quầng
    al = im2.getchannel('A').filter(ImageFilter.GaussianBlur(0.4))
    im2.putalpha(al)
    return im2


def save(im: Image.Image, name: str, q: int, alpha: bool) -> dict:
    p = OUT / f'{name}.webp'
    im.save(p, 'WEBP', quality=q, method=6, alpha_quality=90 if alpha else 100)
    print(f'{name}: {im.size} {p.stat().st_size // 1024} KB')
    return {'w': im.size[0], 'h': im.size[1], 'kb': p.stat().st_size // 1024}


man = {}
# Thiên Giai: thư mục thien_giai cạnh hoa_truc; tên ra khác tên nguồn (liet_mach_nam_pose → liet_mach_nam); bản A-pose chỉ để dựng 3D, bỏ qua.
TG = SRC.parent / 'thien_giai'
files = [(f, f.stem) for f in sorted(SRC.glob('*.png'))]
if TG.exists():
    for f in sorted(TG.glob('*.png')):
        if f.stem.endswith('_apose'):
            continue
        files.append((f, f.stem[:-5] if f.stem.endswith('_pose') else f.stem))
for f, n in files:
    im = Image.open(f)
    if n.startswith('canh_'):
        im = im.convert('RGB')
        im = im.resize((800, int(800 * im.size[1] / im.size[0])), Image.LANCZOS)
        man[n] = save(im, n, 70, False)
    else:
        k = key(im)
        bb = k.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        k = k.crop(bb)
        tall = {'phap_tuong_kiem_long': 900, 'nguyen_anh': 320, 'phi_kiem': 360}.get(n, 1000 if n.startswith(('lac_', 'de_', 'liet_')) else 900)
        k = k.resize((int(k.size[0] * tall / k.size[1]), tall), Image.LANCZOS)
        man[n] = save(k, n, 70 if n.startswith('liet_') else 82, True)
(OUT / 'manifest.json').write_text(json.dumps(man, indent=1), encoding='utf8')
