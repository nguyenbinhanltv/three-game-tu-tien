"""Sinh font U2 (UI Kit 2.0 "Mặc Kim Giản") ra apps/client/public/fonts: woff2, subset tiếng Việt.

Chạy: python tools/fonts/subset_u2.py <thư mục chứa TTF gốc> [thư mục giấy phép OFL]
  cần fonttools + brotli. TTF gốc lấy từ kho google/fonts (ofl/grenzegotisch, texturina, newsreader);
  mặc định đọc DTL_FONT_SRC nếu không truyền đối số.

Ba họ, đều SIL OFL 1.1 và không khai "Reserved Font Name" (đã đối chiếu từng văn bản OFL), nên cắt tập ký tự và
đổi tên tệp `dtl-*` được phép; bản quyền + giấy phép giữ nguyên trong bảng `name` và OFL-*.txt cạnh tệp.
Trục biến thiên được ghim để nhẹ: Newsreader opsz=16, wght 400–600; Texturina opsz=24, wght 600–800; Grenze wght 700.
"""

import os
import pathlib
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/client/public/fonts'

# Latin + Latin mở rộng + Latin Extended Additional (U+1E00–1EFF, toàn bộ chữ Việt) + dấu kết hợp + dấu câu.
RANGE = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x1A0, 0x1A1, 0x1AF, 0x1B0]
         + list(range(0x300, 0x370)) + list(range(0x1E00, 0x1F00))
         + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2033, 0x20AB, 0x2212, 0x00D7])

JOBS = [
    ('GrenzeGotisch[wght].ttf', 'dtl-u2-display.woff2', {'wght': 700}, 'grenzegotisch'),
    ('Texturina[opsz,wght].ttf', 'dtl-u2-head.woff2', {'opsz': 24, 'wght': (600, 800)}, 'texturina'),
    ('Newsreader[opsz,wght].ttf', 'dtl-u2-body.woff2', {'opsz': 16, 'wght': (400, 600)}, 'newsreader'),
    ('Newsreader-Italic[opsz,wght].ttf', 'dtl-u2-body-italic.woff2', {'opsz': 16, 'wght': (400, 500)}, None),
]


def build(src: pathlib.Path, out: pathlib.Path, axes: dict) -> None:
    font = TTFont(src)
    font = instancer.instantiateVariableFont(font, axes)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl', 'lnum', 'tnum', 'pnum']
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # giữ bản quyền + giấy phép
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=RANGE)
    s.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.relative_to(ROOT)}: {os.path.getsize(out)} B')


def main() -> None:
    src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else os.environ['DTL_FONT_SRC'])
    lic = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent / 'licenses'
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, dst, axes, fam in JOBS:
        build(src / name, OUT / dst, axes)
        total += os.path.getsize(OUT / dst)
        if fam and (lic / f'OFL-{fam}.txt').exists():
            shutil.copyfile(lic / f'OFL-{fam}.txt', OUT / f'OFL-{fam}.txt')
    print(f'total {total} B')


if __name__ == '__main__':
    main()
