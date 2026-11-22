# VFX trận của Cấm chế sư (TN-8): hình trận đứng trên đất (4 kiểu: sát, khốn, hộ, sinh tử) + nhịp trận. Hiệu ứng tại điểm, client phát bằng
# FxRunner.startAt với `area` = {x, z, r} của trận (hình vẽ theo bán kính thật: `fit: 'area'`, decal nhân `mul = r`).
#   python tools/vfx/recipes_tran.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Mỗi kiểu một bảng màu riêng (client/render/vfx/palette.ts `tran_<kiểu>`): sát đỏ tía, khốn lam, hộ ngọc lục, sinh tử tím + vàng; ba tầng:
# lõi rất đậm (decal tối + vòng viền tối bên ngoài), thân đậm màu, viền sáng/vàng, để không chìm trên nền đá trắng (ghi chú duyệt PR2).
# Dáng riêng: sát = vết nứt tỏa; khốn = sóng co vào; hộ = vòng đầy + hạt bay lên; sinh tử = hai vòng ngược chiều + hạt.
# Hình thấp sát đất (không che nhân vật), đoạn đứng 1,7 s phát nối tiếp (≤ 6 draw), nhịp ≤ 3 draw ≤ 30 hạt, không khựng/rung/chớp.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import decal, mesh, parts, OUT  # noqa: E402

D = 1.9  # độ dài một đoạn đứng (client nối mỗi 1,7 s)


def write_point(name, palette, events):
    path = os.path.join(OUT, name + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'skill': name, 'palette': palette, 'events': events}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('ghi', os.path.relpath(path))


def base(ring_tone='rim', fill=0.9):
    """Nền chung: lõi tối đậm phủ vùng + triện thân màu + vòng viền tối ngoài cùng + vòng sáng bên trong (5 draw → còn 1 cho dáng riêng)."""
    return [
        decal('scorch', 0.0, 1.0, D, at='area', grow=0.05, tone='core', alpha=fill, tier=0, lift=0.26),
        decal('rune', 0.0, 1.0, D, at='area', grow=0.05, tone='body', alpha=1.0, tier=0, lift=0.26),
        mesh('rune_ring2', 0.0, D, at='area', offset=[0, 0.06, 0], scale=1.03, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.97, shadow=False, tone='core', tier=0, seed=61),
        mesh('rune_ring2', 0.0, D, at='area', offset=[0, 0.1, 0], scale=0.97, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.97, shadow=False, tone=ring_tone, tier=0, seed=62),
    ]


def sat_stand():
    return base('rim') + [
        mesh('crack_radial', 0.0, D, at='area', offset=[0, 0.12, 0], scale=1.0, fit='area', alpha=0.75, sweep=0.1, erodeFrom=0.95, shadow=False, tone='body', tier=0, seed=11),
        parts('spark', 0.0, 14, 1.4, 1, 1.0, 0.07, at='area', offset=[0, 0.3, 0], tone='accent', grav=-0.8, tier=1),
    ]


def khon_stand():
    return base('rim') + [
        mesh('ripple', 0.0, 1.0, at='area', offset=[0, 0.12, 0], scale=1.0, scaleTo=0.2, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.4, shadow=False, tone='accent', tier=0, seed=21),
        mesh('ripple', 0.85, 1.0, at='area', offset=[0, 0.12, 0], scale=1.0, scaleTo=0.2, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.4, shadow=False, tone='rim', tier=1, seed=22),
    ]


def ho_stand():
    return base('accent') + [
        mesh('rune_ring2', 0.0, D, at='area', offset=[0, 0.12, 0], scale=0.6, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.97, shadow=False, tone='accent', tier=0, seed=31),
        parts('spark', 0.0, 22, 1.0, 1, 1.8, 0.08, at='area', offset=[0, 0.1, 0], tone='accent', grav=1.0, tier=1),
    ]


def sinhtu_stand():
    return base('accent') + [
        mesh('rune_ring2', 0.0, D, at='area', offset=[0, 0.12, 0], scale=0.55, fit='area', alpha=1.0, sweep=0.5, erodeFrom=0.97, shadow=False, tone='rim', tier=0, seed=42),
        parts('spark', 0.0, 18, 1.0, 1, 1.8, 0.08, at='area', offset=[0, 0.1, 0], tone='accent', grav=0.6, tier=1),
    ]


def tick(shape, seed, n=12):
    """Nhịp trận: một sóng lan ra rìa (thân màu, tương phản) + vài hạt (phát mỗi `every` giây nên rất nhẹ)."""
    return [
        mesh(shape, 0.0, 0.5, at='area', offset=[0, 0.14, 0], scale=0.15, scaleTo=1.0, fit='area', alpha=1.0, sweep=0.4, erodeFrom=0.4, shadow=False, tone='accent', tier=0, seed=seed),
        parts('spark', 0.0, n, 2.0, 1, 0.5, 0.07, at='area', offset=[0, 0.3, 0], tone='rim', grav=-0.5, tier=1),
    ]


POINTS = {
    'tran_sat_stand': ('tran_sat', sat_stand),
    'tran_khon_stand': ('tran_khon', khon_stand),
    'tran_ho_stand': ('tran_ho', ho_stand),
    'tran_sinhtu_stand': ('tran_sinhtu', sinhtu_stand),
    'tran_sat_tick': ('tran_sat', lambda: tick('ripple', 51)),
    'tran_khon_tick': ('tran_khon', lambda: tick('ripple', 52)),
    'tran_ho_tick': ('tran_ho', lambda: tick('rune_ring2', 53, 16)),
    'tran_sinhtu_tick': ('tran_sinhtu', lambda: tick('rune_ring2', 54, 16)),
}

if __name__ == '__main__':
    for i in sys.argv[1:] or list(POINTS):
        pal, fn = POINTS[i]
        write_point(i, pal, fn())
