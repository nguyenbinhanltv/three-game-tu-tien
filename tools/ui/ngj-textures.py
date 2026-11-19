"""Sinh texture lặp nhỏ cho bộ UI Ngọc Giản Kim Văn (sơn mài huyền, giấy ngà vân lụa). Dùng: python tools/ui/ngj-textures.py"""
import random
from pathlib import Path
from PIL import Image, ImageFilter, ImageChops

OUT = Path(__file__).resolve().parents[2] / 'apps/client/src/ui/u2/shell/tex'
N = 192
random.seed(1711)

def noise(sigma, size=N):
    # tileable: lát 3x3 rồi làm mờ, cắt giữa
    import os; base = Image.frombytes('L', (size, size), os.urandom(size * size))
    big = Image.new('L', (size * 3, size * 3))
    for i in range(3):
        for j in range(3):
            big.paste(base, (i * size, j * size))
    big = big.filter(ImageFilter.GaussianBlur(sigma))
    return big.crop((size, size, size * 2, size * 2))

def stretch(im, lo=0.0, hi=1.0):
    from PIL import ImageOps
    return ImageOps.autocontrast(im, cutoff=2)

def tint(gray, dark, light):
    return Image.merge('RGB', [gray.point(lambda v, a=a, b=b: int(a + (b - a) * v / 255)) for a, b in zip(dark, light)])

# sơn mài: vân rất nhẹ quanh #1E1712 (độ đổi ±6)
g = ImageChops.add(stretch(noise(1.2)), stretch(noise(5)), scale=2)
lac = tint(stretch(g), (26, 19, 14), (44, 33, 25))
lac.save(OUT / 'lacquer.webp', 'WEBP', quality=78, method=6)

# giấy ngà: sợi lụa ngang + dọc mảnh quanh #EDE3CC
fx = noise(0.6).resize((N, N))
h = stretch(noise(1.0).resize((N, 24)).resize((N, N), Image.BICUBIC))  # sợi ngang
v = stretch(noise(1.0).resize((24, N)).resize((N, N), Image.BICUBIC))  # sợi dọc
fib = ImageChops.add(h, v, scale=2)
mott = stretch(noise(14))
g = ImageChops.add(stretch(fib), mott, scale=2)
pap = tint(stretch(g), (236, 227, 206), (248, 242, 226))
pap.save(OUT / 'paper.webp', 'WEBP', quality=78, method=6)
print({p.name: p.stat().st_size for p in OUT.glob('*.webp')})
