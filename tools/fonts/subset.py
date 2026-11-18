"""Sinh font web (woff2, đã subset) cho apps/client/public/fonts.

Chạy: python tools/fonts/subset.py   (cần fonttools + brotli: pip install fonttools brotli)

- dtl-title.woff2: Charm Bold, chỉ các chữ của tiêu đề (`ui.title` trong vi.ui.json) cho
  khung hình đầu: nhẹ vài KB nên tải kịp trước khi bundle JS chạy.
- dtl-display.woff2: Alegreya SC Bold, Latin cơ bản + tiếng Việt, dùng cho tên boss,
  biển hiệu, phụ đề màn tiêu đề (biến CSS --font-display).

Font gốc tải từ kho google/fonts (giấy phép SIL OFL 1.1), ghim theo commit, lưu tạm
ngoài repo. Đổi tiêu đề trong i18n thì chạy lại script.
"""

import json
import os
import pathlib
import tempfile
import time
import urllib.error
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/client/public/fonts'
COMMIT = 'cc39c4c2c304bc368c9b7c311ea2bcc6013299fe'
SRC = f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl'

# Latin cơ bản + dấu câu hay dùng + toàn bộ chữ tiếng Việt (giống subset "vietnamese" của Google Fonts).
LATIN = list(range(0x20, 0x7F)) + [0xA0, 0xB7, 0xC0, 0xC1, 0xC2, 0xC3, 0xC8, 0xC9, 0xCA, 0xCC, 0xCD,
                                    0xD2, 0xD3, 0xD4, 0xD5, 0xD9, 0xDA, 0xDD, 0xE0, 0xE1, 0xE2, 0xE3,
                                    0xE8, 0xE9, 0xEA, 0xEC, 0xED, 0xF2, 0xF3, 0xF4, 0xF5, 0xF9, 0xFA, 0xFD,
                                    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026]
VIET = [0x102, 0x103, 0x110, 0x111, 0x128, 0x129, 0x168, 0x169, 0x1A0, 0x1A1, 0x1AF, 0x1B0,
        0x300, 0x301, 0x303, 0x309, 0x323] + list(range(0x1EA0, 0x1EFA))


def fetch(rel: str) -> pathlib.Path:
    cache = pathlib.Path(tempfile.gettempdir()) / 'dtl-fonts'
    cache.mkdir(exist_ok=True)
    dst = cache / rel.replace('/', '_')
    for attempt in range(5):
        if dst.exists():
            break
        try:
            urllib.request.urlretrieve(f'{SRC}/{rel}', dst)
        except urllib.error.HTTPError:  # raw.githubusercontent đôi khi trả 503
            if attempt == 4:
                raise
            time.sleep(2 + attempt * 2)
    return dst


def build(src: pathlib.Path, out: pathlib.Path, codepoints: list[int]) -> None:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl', 'smcp', 'c2sc']
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # giữ bản quyền + giấy phép trong file
    opts.desubroutinize = True
    font = TTFont(src)
    s = subset.Subsetter(opts)
    s.populate(unicodes=codepoints)
    s.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.relative_to(ROOT)}: {os.path.getsize(out)} B')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ui = json.loads((ROOT / 'packages/content/data/i18n/vi.ui.json').read_text(encoding='utf-8'))
    title = sorted({ord(c) for c in ui['ui.title']} | {0x20})
    build(fetch('charm/Charm-Bold.ttf'), OUT / 'dtl-title.woff2', title)
    # Thư pháp (Thiên Giai Hoa Trúc): Mansalva (nét bút lông/marker, SIL OFL) đủ Latin + tiếng Việt cho tên đạo hiệu người chơi.
    build(fetch('mansalva/Mansalva-Regular.ttf'), OUT / 'dtl-thu-phap.woff2', sorted(set(LATIN + VIET)))
    build(fetch('alegreyasc/AlegreyaSC-Bold.ttf'), OUT / 'dtl-display.woff2', sorted(set(LATIN + VIET)))
    for name in ('charm', 'alegreyasc', 'mansalva'):
        (OUT / f'OFL-{name}.txt').write_bytes(fetch(f'{name}/OFL.txt').read_bytes())


if __name__ == '__main__':
    main()
