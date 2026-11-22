# VFX trận của Cấm chế sư (TN-8): hình trận đứng trên đất (4 kiểu: sát, khốn, hộ, sinh tử) + nhịp trận. Hiệu ứng tại điểm, client phát bằng
# FxRunner.startAt với `area` = {x, z, r} của trận (hình vẽ theo bán kính thật: `fit: 'area'`, decal nhân `mul = r`).
#   python tools/vfx/recipes_tran.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng `cam_che_kinh`: core chàm đen, body chàm tím, rim vàng nhạt, accent vàng ấn. Mỗi kiểu một dáng để phân biệt từ xa:
# sát = vết nứt tỏa + vòng đôi, khốn = sóng co vào, hộ = vòng sáng đầy + hạt bay lên, sinh tử = hai vòng ngược chiều.
# Hình thấp sát đất (không che nhân vật), đoạn đứng 1,7 s phát nối tiếp (≤ 5 draw), nhịp ≤ 3 draw ≤ 30 hạt, không khựng/rung/chớp.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import decal, flip, mesh, parts, OUT  # noqa: E402

PALETTE = 'cam_che_kinh'


def write_point(name, events):
    path = os.path.join(OUT, name + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'skill': name, 'palette': PALETTE, 'events': events}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('ghi', os.path.relpath(path))


def base(tone_ring='rim'):
    """Nền chung của mọi trận: triện đậm (lõi) + vành sáng, `mul` = bán kính trận."""
    return [
        decal('scorch', 0.0, 1.0, 1.9, at='area', grow=0.05, tone='core', alpha=0.85, tier=0),
        decal('rune', 0.0, 1.0, 1.9, at='area', grow=0.05, tone=tone_ring, alpha=0.95, tier=0),
    ]


def sat_stand():
    return base() + [
        mesh('crack_radial', 0.0, 1.9, at='area', offset=[0, 0.05, 0], scale=1.0, fit='area', alpha=0.8, sweep=0.1, erodeFrom=0.95, shadow=False, tone='accent', tier=1, seed=11),
        mesh('rune_ring2', 0.0, 1.9, at='area', offset=[0, 0.1, 0], scale=0.98, scaleTo=1.02, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.95, shadow=False, tone='rim', tier=0, seed=12),
        parts('spark', 0.0, 16, 1.4, 1, 1.2, 0.07, at='area', offset=[0, 0.3, 0], tone='accent', grav=-0.8, tier=1),
    ]


def khon_stand():
    return base('body') + [
        mesh('ripple', 0.0, 1.0, at='area', offset=[0, 0.08, 0], scale=1.0, scaleTo=0.25, fit='area', alpha=0.7, sweep=0.5, erodeFrom=0.4, shadow=False, tone='body', tier=0, seed=21),
        mesh('ripple', 0.85, 1.0, at='area', offset=[0, 0.08, 0], scale=1.0, scaleTo=0.25, fit='area', alpha=0.7, sweep=0.5, erodeFrom=0.4, shadow=False, tone='rim', tier=1, seed=22),
        parts('dust', 0.0, 14, 0.9, 1, 1.6, 0.14, at='area', offset=[0, 0.2, 0], tone='body', grav=-0.3, tier=1),
    ]


def ho_stand():
    return base('accent') + [
        mesh('rune_ring2', 0.0, 1.9, at='area', offset=[0, 0.1, 0], scale=0.98, scaleTo=1.02, fit='area', alpha=0.8, sweep=0.5, erodeFrom=0.95, shadow=False, tone='accent', tier=0, seed=31),
        parts('spark', 0.0, 22, 1.0, 1, 1.8, 0.08, at='area', offset=[0, 0.1, 0], tone='rim', grav=1.0, tier=1),
    ]


def sinhtu_stand():
    return base('accent') + [
        mesh('rune_ring2', 0.0, 1.9, at='area', offset=[0, 0.1, 0], scale=1.0, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.95, shadow=False, tone='rim', tier=0, seed=41),
        mesh('rune_ring2', 0.0, 1.9, at='area', offset=[0, 0.12, 0], rot=[0, 0, 0], scale=0.6, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.95, shadow=False, tone='accent', tier=1, seed=42),
        parts('spark', 0.0, 18, 1.0, 1, 1.8, 0.08, at='area', offset=[0, 0.1, 0], tone='accent', grav=0.6, tier=1),
    ]


def tick(shape, tone, seed, n=12):
    """Nhịp trận: một sóng mỏng lan ra rìa + vài hạt (phát mỗi `every` giây nên rất nhẹ)."""
    return [
        mesh(shape, 0.0, 0.5, at='area', offset=[0, 0.1, 0], scale=0.15, scaleTo=1.0, fit='area', alpha=0.8, sweep=0.4, erodeFrom=0.4, shadow=False, tone=tone, tier=0, seed=seed),
        parts('spark', 0.0, n, 2.0, 1, 0.5, 0.07, at='area', offset=[0, 0.3, 0], tone=tone, grav=-0.5, tier=1),
    ]


POINTS = {
    'tran_sat_stand': sat_stand,
    'tran_khon_stand': khon_stand,
    'tran_ho_stand': ho_stand,
    'tran_sinhtu_stand': sinhtu_stand,
    'tran_sat_tick': lambda: tick('ripple', 'accent', 51),
    'tran_khon_tick': lambda: tick('ripple', 'body', 52),
    'tran_ho_tick': lambda: tick('rune_ring2', 'rim', 53, 16),
    'tran_sinhtu_tick': lambda: tick('rune_ring2', 'accent', 54, 16),
}

if __name__ == '__main__':
    for i in sys.argv[1:] or list(POINTS):
        write_point(i, POINTS[i]())
