#!/usr/bin/env python3
"""A6: nối các timeline `data/fx/mon_*` của 14 quái A6 vào packages/content/src/fxRegistry.ts (import ở CUỐI khối import, phần tử ở CUỐI MON_FX_TIMELINES;
chạy lại an toàn: bỏ qua tên đã có). Chạy sau `python tools/vfx/gen-fx-a6.py`."""
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
FX = os.path.join(ROOT, 'packages', 'content', 'data', 'fx')
REG = os.path.join(ROOT, 'packages', 'content', 'src', 'fxRegistry.ts')
MONS = ['boss_hu_anh_chu', 'boss_dinh_linh', 'boss_phu_chu', 'boss_tu_quang_duc_chu', 'boss_kieu_thu', 'boss_ve_kieu', 'boss_thach_tuong', 'boss_dao_linh', 'boss_lo_linh',
        'elite_hu_anh_nhan', 'elite_anh_hac_vuong', 'elite_lo_thach_tuong', 'elite_sa_tuong', 'elite_may_lang_vuong']
names = sorted(f[:-5] for f in os.listdir(FX) if f.endswith('.json') and f.startswith('mon_') and any(f'__{m}' in f for m in MONS))
s = open(REG, encoding='utf8', newline='').read().replace('\r\n', '\n')
new = [n for n in names if f'fx_{n} ' not in s]
if new:
    last = [m for m in re.finditer(r'^import fx\w+ from .*;\n', s, re.M)][-1]
    imp = ''.join(f"import fx_{n} from '../data/fx/{n}.json';\n" for n in new)
    s = s[:last.end()] + imp + s[last.end():]
    tail = '] as unknown as FxTimeline[];\nexport const MON_FX = new Map('
    assert tail in s
    s = s.replace(tail, ''.join(f'  fx_{n},\n' for n in new) + tail, 1)
open(REG, 'w', encoding='utf8', newline='').write(s)
print(len(names), 'timeline A6,', len(new), 'mới đăng ký')
