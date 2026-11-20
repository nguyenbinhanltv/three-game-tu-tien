# VFX VS-1 cho Hộ pháp (Bất Động Kim Thân): vàng đồng, đá vỡ, sóng xung. Dùng helper và ngôn ngữ của recipes_vs1.py (Kiếm tu, đã duyệt).
#   python tools/vfx/recipes_vs1_hp.py [id chiêu ...]
# Bản sắc Hộ pháp: nặng, chắc, nổ dưới đất: sóng xung nón rộng, nứt tỏa, cột/đá văng, bụi nhiều, khựng lâu hơn kiếm (70-90 ms), rung mạnh,
# KHÔNG vết chém mảnh; hình chính là khối (đá, ấn, chuông). Màu theo bảng `bat_dong_kim_than` (đồng vàng, viền kem, bóng nâu).
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import (  # noqa: E402
    cam, decal, feel, flip, ground, mesh, parts, rubble, snd, stop, shake, flash, vig, write,
)

R = {}


def pillars(t, n, r, at='area', h=3.2, w=1.5, tier=1, seed=1, fit=False):
    """n cột đá vàng trồi lên theo vòng bán kính r (rubble_c kéo cao = cột đá), lệch nhịp nhẹ."""
    ev = []
    for i in range(n):
        a = i / n * math.tau + seed
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        ev.append(mesh('rubble_c', t + 0.02 * i, 0.7, at=at, offset=[x, -0.6, z], rot=[0, 40 * i, 0], scale=[w, h, w], scaleTo=[w, h * 1.05, w], sweep=0.25, erodeFrom=0.6, alpha=1,
                       move={'to': at, 'offset': [x, h * 0.35, z], 'ease': 'out'}, tone='body', tier=tier if i >= 4 else 0, seed=seed + i))
    return ev


def thiet_quyen():
    """Thiết Quyền Chấn Địa (AoE r 6, hit 0,45 s): tụ lực vào nắm đấm, giáng xuống: sóng xung vàng, nứt tỏa, 8 cột đá trồi vòng ngoài, đá văng, bụi."""
    ev = [
        parts('dust', -0.45, 22, 1.4, 1, 0.38, 0.18, at='self', offset=[0.3, 0, 0.5], inward=True, tone='core', tier=1),
        parts('spark', -0.45, 16, 1.4, 1, 0.3, 0.07, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='accent', tier=1),
        snd(-0.45, 'cast', 0.45, 0.8),
        decal('rune', -0.4, 5.5, 0.9, at='area', grow=0.3, tone='accent', alpha=1, tier=0),
        # giáng: chớp + khựng + sóng xung nón vàng lan ra bán kính 6
        snd(0.0, 'impact', 0.9, 0.7, 0.04),
        snd(0.0, 'block', 0.5, 0.6, 0.05),
        mesh('burst', 0.0, 0.11, at='area', offset=[0, 0.5, 0], scale=2.4, billboard=True, sweep=0, tone='accent', cross=True, tier=0),
        flip('spark_burst', 0.0, 0.36, 3.6, at='area', offset=[0, 0.8, 0], alpha=0.8, tone='accent', tier=0),
        mesh('shock_cone', 0.0, 0.42, at='area', scale=[1.6] * 3, scaleTo=[6.8] * 3, alpha=0.85, sweep=0.3, erodeFrom=0.3, shadow=False, tone='accent', tier=0),
        mesh('shock_cone', 0.06, 0.38, at='area', scale=[1.2] * 3, scaleTo=[5.2] * 3, alpha=0.7, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1),
        mesh('crack_radial', 0.02, 0.9, at='area', scale=6.0, alpha=1, sweep=0.2, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=2),
        decal('crack', 0.02, 6.5, 2.8, at='area', grow=0.14, tone='core', alpha=1, tier=1),
        decal('scorch', 0.02, 5.2, 3.0, at='area', grow=0.1, tone='shadow', alpha=0.8, tier=0),
        flip('dust_kick', 0.05, 0.7, 4.4, at='area', offset=[0, 0.8, 0], alpha=0.55, tone='body', tier=1),
        flip('dust_kick', 0.12, 0.7, 3.4, at='area', offset=[1.8, 0.6, 1.2], alpha=0.45, tone='body', tier=2),
        parts('spark', 0.0, 50, 8, 1, 0.45, 0.1, at='area', offset=[0, 0.8, 0], tone='accent', tier=0),
        parts('dust', 0.0, 40, 5, 1, 0.7, 0.28, at='area', offset=[0, 0.3, 0], tone='body', tier=1),
    ]
    ev += pillars(0.03, 8, 4.4, h=3.4, w=1.4, seed=0.3)
    ev += rubble(0.03, 'area', 6, 3.0, 2.4, 0.9, seed0=2)
    ev += feel(0.0, ms=80, sh=0.42, fl=0.12, vg=0.35, fov=2.6)
    return {'skill': 'skl_thiet_quyen_chan_dia', 'replaces': ['thietquyen'], 'events': ev}


R['skl_thiet_quyen_chan_dia'] = thiet_quyen

if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
