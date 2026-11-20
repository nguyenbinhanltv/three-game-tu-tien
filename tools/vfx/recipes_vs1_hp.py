# VFX VS-1 cho Hộ pháp (Bất Động Kim Thân): vàng đồng, đá vỡ, sóng xung. Dùng helper và ngôn ngữ của recipes_vs1.py (Kiếm tu, đã duyệt).
#   python tools/vfx/recipes_vs1_hp.py [id chiêu ...]
# Bản sắc Hộ pháp: nặng, chắc, nổ dưới đất: sóng xung nón rộng, nứt tỏa, cột/đá văng, bụi nhiều, khựng lâu hơn kiếm (70-90 ms), rung mạnh,
# KHÔNG vết chém mảnh; hình chính là khối (đá, ấn, chuông). Màu theo bảng `bat_dong_kim_than` (đồng vàng, viền kem, bóng nâu).
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import (  # noqa: E402
    cam, decal, feel, flip, mesh, parts, snd, write,
)

R = {}


def debris(t, at, n, r, up, scale, seed0=1, tone='core'):
    """n tảng đá 3D tối màu bung lên từ vòng bán kính r rồi RƠI LẠI mặt đất (hai pha: bay lên ease-out, rơi xuống ease-in)."""
    ev = []
    for i in range(n):
        a = i / n * math.tau + seed0
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        h = up * (0.7 + 0.3 * ((i * 37) % 10) / 10)
        shp = 'rubble_a' if i % 2 == 0 else 'rubble_c'
        rot = [35 * i, 70 * i, 15 * i]
        ev.append(mesh(shp, t, 0.22, at=at, offset=[x, 0.1, z], rot=rot, scale=scale, sweep=0, erodeFrom=0.98, alpha=1,
                       move={'to': at, 'offset': [x * 1.15, h, z * 1.15], 'ease': 'out'}, tone=tone, tier=0 if i < 6 else 1, seed=seed0 + i))
        ev.append(mesh(shp, t + 0.22, 0.3, at=at, offset=[x * 1.15, h, z * 1.15], rot=rot, scale=scale, scaleTo=scale * 0.8, sweep=0, erodeFrom=0.7, alpha=1,
                       move={'to': at, 'offset': [x * 1.3, 0.1, z * 1.3], 'ease': 'in'}, tone=tone, tier=0 if i < 6 else 1, seed=seed0 + i))
    return ev


def thiet_quyen():
    """Thiết Quyền Chấn Địa (AoE r 6, hit 0,45 s): nắm đấm giáng xuống đất: vòng nứt tỏa tối + viền sáng, vòng sóng xung SẮC NÉT đồng-vàng đậm (không phủ mờ), tảng đá tối bung lên rồi rơi lại, bụi nâu ở chân. Màu đồng (body/core), KHÔNG dùng accent/rim (vàng chanh/kem)."""
    ev = [
        parts('dust', -0.45, 22, 1.4, 1, 0.38, 0.18, at='self', offset=[0.3, 0, 0.5], inward=True, tone='core', tier=1),
        parts('spark', -0.45, 16, 1.4, 1, 0.3, 0.07, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='body', tier=1),
        snd(-0.45, 'cast', 0.45, 0.8),
        decal('rune', -0.4, 5.5, 0.9, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        # giáng (t = 0 là khung hit; mọi thứ bật NGAY, không mọc dần): chớp + khựng + rung + âm nặng
        snd(0.0, 'impact', 0.95, 0.65, 0.04),
        snd(0.0, 'block', 0.55, 0.62, 0.05),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.4, 0], scale=2.6, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.34, 3.4, at='area', offset=[0, 0.7, 0], alpha=0.8, tone='body', tier=0),
        # vòng nứt tỏa (hiện đủ ngay) tối + viền sáng; decal nứt/cháy lưu lại
        mesh('crack_radial', -0.03, 1.0, at='area', scale=6.2, alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        mesh('crack_radial', -0.03, 0.7, at='area', offset=[0, 0.03, 0], scale=6.2, alpha=0.9, sweep=0.02, erodeFrom=0.5, shadow=False, tone='body', tier=0, seed=2),
        decal('crack', -0.03, 6.8, 2.8, at='area', grow=0.05, tone='core', alpha=1, tier=1),
        decal('scorch', -0.03, 5.4, 3.0, at='area', grow=0.05, tone='shadow', alpha=0.85, tier=0),
        # vòng sóng xung sắc nét: hai vành mảnh (rune_ring2) mở rộng nhanh, màu đồng đậm, không phủ mờ
        mesh('rune_ring2', -0.03, 0.4, at='area', offset=[0, 0.08, 0], scale=2.4, scaleTo=7.4, sweep=0.04, erodeFrom=0.55, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.04, 0.36, at='area', offset=[0, 0.1, 0], scale=1.8, scaleTo=6.0, sweep=0.04, erodeFrom=0.5, alpha=0.9, shadow=False, tone='core', tier=1, seed=4),
        # bụi nâu ở chân (thấp, dày) + hạt
        flip('dust_kick', 0.0, 0.8, 5.0, at='area', offset=[0, 0.7, 0], alpha=0.7, tone='core', tier=0),
        flip('dust_kick', 0.1, 0.8, 3.8, at='area', offset=[2.0, 0.6, 1.4], alpha=0.6, tone='core', tier=1),
        flip('dust_kick', 0.14, 0.8, 3.8, at='area', offset=[-2.0, 0.6, -1.2], alpha=0.6, tone='core', tier=2),
        parts('spark', 0.0, 50, 8, 1, 0.45, 0.1, at='area', offset=[0, 0.8, 0], tone='body', tier=0),
        parts('dust', 0.0, 60, 5, 1, 0.8, 0.3, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += debris(-0.02, 'area', 10, 2.4, 3.4, 1.3, seed0=0.5)
    ev += feel(0.0, ms=80, sh=0.55, fl=0.16, vg=0.4, fov=3.0)
    return {'skill': 'skl_thiet_quyen_chan_dia', 'replaces': ['thietquyen'], 'events': ev}


R['skl_thiet_quyen_chan_dia'] = thiet_quyen

if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
