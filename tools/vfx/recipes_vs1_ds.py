# VFX VS-1 cho Đan sư (Thanh Mộc Đan Kinh): ngọc lục + đỏ son. Dùng helper của recipes_vs1.py (Kiếm tu) và ngôn ngữ đã duyệt ở Hộ pháp.
#   python tools/vfx/recipes_vs1_ds.py [id chiêu ...]
# Bản sắc Đan sư: mềm và sống: VIÊN ĐAN (pill_orb) là "đạn"/hạt nhân của mọi chiêu, SEN NỞ (lotus_bloom) là cú bung tại mốc trúng,
# lá (petal_blade) và cánh hoa bay theo, khói mực mỏng. Hai gam tách vai: NGỌC LỤC (`body`, viền `rim` lục nhạt) = sinh khí/hồi/vùng của ta,
# ĐỎ SON (`accent`) = đan hỏa/sát thương; `core` (lục sẫm) cho vành ở lại và nét nứt, `shadow` chỉ cho khói và vết cháy.
# KHÔNG dùng đá vỡ/nứt gãy kiểu Hộ pháp (rubble, crack_radial), không vết chém; rung và khựng nhẹ hơn Hộ pháp.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import (  # noqa: E402
    cam, decal, flash, flip, mesh, parts, shake, snd, stop, vig, write,
)

R = {}
EDGE = 1.04  # vành ngoài của rune_ring2 ở 0,96 → scale = r × EDGE để mép vành trùng mép vùng


def wave(t, at, r0, r1, dur=0.42, tone='body', tier=0, seed=3, alpha=1, y=0.1):
    """Vành sóng sắc nét quét theo VÙNG THẬT của server (`fit: area`, r0/r1 là tỉ lệ bán kính vùng)."""
    return mesh('rune_ring2', t, dur, at=at, offset=[0, y, 0], scale=r0, scaleTo=r1, fit='area', sweep=0.04, erodeFrom=0.7, alpha=alpha, shadow=False, tone=tone, tier=tier, seed=seed)


def zone_ring(t, at, hold, tone='core', tier=0, seed=7, alpha=0.9):
    """Vành Ở LẠI đúng mép vùng trong `hold` giây."""
    return mesh('rune_ring2', t, hold, at=at, offset=[0, 0.12, 0], scale=EDGE, scaleTo=EDGE, fit='area', sweep=0.12, erodeFrom=0.75, alpha=alpha, shadow=False, tone=tone, tier=tier, seed=seed)


def dan_hoa():
    """Đan Hỏa Phong Trần (AoE r 6 quanh mục tiêu, thiêu đốt 4 s; hit 0,35 s): ngưng một VIÊN ĐAN đỏ son trước ngực, ném thẳng tới mục tiêu
    (lá ngọc bay theo), viên đan nổ BUNG ngay khung hit (lõi đan phình sáng, mảnh đan và tia lửa bắn ra) thành ĐÓA SEN LỬA nở trên mặt đất: cánh ngoài đỏ son, nhụy ngọc lục, sáu lưỡi lửa đan hỏa bốc quanh tâm (sen THẤP, cánh ngoài cao ~0,45 m, nhụy ~1 m: không che quái đứng ở tâm); vành lửa quét ra mép vùng và ở lại
    (vùng đang thiêu đốt), cánh hoa và tàn lửa bay lên."""
    HAND = [0.25, 0.25, 0.7]
    ev = [
        # tụ đan: hạt hút vào tay, viên đan lớn dần
        parts('spark', -0.35, 20, 1.4, 1, 0.24, 0.06, at='ahead', offset=[0.25, 0.25, -0.5], inward=True, tone='accent', tier=1),
        snd(-0.35, 'cast', 0.45, 1.05),
        mesh('pill_orb', -0.33, 0.13, at='ahead', offset=HAND, rot=[20, 0, 15], scale=0.22, scaleTo=0.6, sweep=0.3, erodeFrom=0.98, alpha=1, spin=500, tone='accent', tier=0, seed=1),
        # ném: viên đan bay thẳng tới mục tiêu, hai lá ngọc + khói mực theo đuôi
        mesh('pill_orb', -0.2, 0.2, at='ahead', offset=HAND, scale=0.6, scaleTo=0.75, sweep=0, erodeFrom=0.98, alpha=1, spin=900, keepUp=True,
             move={'to': 'target', 'ease': 'in', 'offset': [0, 0.2, 0]}, tone='accent', tier=0, seed=1),
        mesh('petal_blade', -0.18, 0.2, at='ahead', offset=[0.5, 0.35, 0.5], scale=1.6, sweep=0, erodeFrom=0.6, alpha=0.9,
             move={'to': 'target', 'ease': 'in', 'offset': [0.3, 0.4, 0]}, tone='body', tier=1, seed=2),
        mesh('petal_blade', -0.16, 0.2, at='ahead', offset=[0.0, 0.05, 0.5], scale=1.4, sweep=0, erodeFrom=0.6, alpha=0.9,
             move={'to': 'target', 'ease': 'in', 'offset': [-0.3, 0.0, 0]}, tone='body', tier=1, seed=3),
        flip('ink_smoke', -0.14, 0.4, 1.4, at='ahead', offset=[0.25, 0.25, 2.2], alpha=0.35, tone='shadow', tier=2),
        snd(-0.2, 'slash', 0.35, 1.25, 0.05),
        # nổ (mọi thứ bật NGAY ở khung hit, không mọc dần): lõi đan phình sáng rồi vỡ, chớp, sen lửa nở nhanh, lưỡi lửa bốc từ quanh tâm
        mesh('pill_orb', -0.02, 0.2, at='area', offset=[0, 0.9, 0], rot=[20, 30, 0], scale=0.9, scaleTo=2.3, sweep=0, erodeFrom=0.35, alpha=1, spin=300, tone='accent', tier=0, seed=8),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.9, 0], scale=2.4, billboard=True, sweep=0, tone='accent', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.36, 3.4, at='area', offset=[0, 1.0, 0], alpha=0.9, tone='accent', tier=0),
        mesh('lotus_bloom', -0.04, 1.2, at='area', offset=[0, 0.06, 0], scale=[2.9, 1.2, 2.9], sweep=0.07, erodeFrom=0.62, ragged=0.15, alpha=1, tone='accent', tier=0, seed=5),
        mesh('lotus_bloom', -0.02, 1.3, at='area', offset=[0, 0.1, 0], rot=[0, 22, 0], scale=[1.5, 1.3, 1.5], sweep=0.08, erodeFrom=0.64, ragged=0.15, alpha=1, tone='body', tier=0, seed=6),
        snd(0.0, 'fire_burst', 0.9, 1.0, 0.04),
        snd(0.0, 'impact', 0.5, 1.1, 0.05),
        # vành lửa theo vùng thật: hai vành quét ra mép + một vành đỏ son ở lại (vùng thiêu đốt)
        wave(0.0, 'area', 0.2, 1.0, dur=0.42, tone='accent', seed=3),
        wave(0.06, 'area', 0.15, 0.8, dur=0.4, tone='body', tier=1, seed=4),
        zone_ring(0.3, 'area', 1.5, tone='accent', seed=7, alpha=0.85),
        decal('scorch', 0.0, 5.0, 3.0, at='area', grow=0.08, tone='shadow', alpha=0.7, tier=0),
        decal('rune', 0.0, 5.6, 2.2, at='area', grow=0.2, tone='body', alpha=0.75, tier=1),
        # tàn lửa và cánh hoa bay lên, khói mỏng
        parts('spark', 0.0, 54, 7, 1, 0.5, 0.09, at='area', offset=[0, 0.8, 0], tone='accent', tier=0),
        parts('petal', 0.02, 26, 3.0, 1, 1.0, 0.11, at='area', offset=[0, 0.5, 0], grav=-1.2, tone='body', tier=1),
        flip('ink_smoke', 0.08, 0.9, 3.6, at='area', offset=[0.6, 1.6, 0.3], alpha=0.3, tone='shadow', tier=1),
        flip('ink_smoke', 0.16, 0.9, 3.0, at='area', offset=[-0.9, 1.3, -0.4], alpha=0.25, tone='shadow', tier=2),
    ]
    # lưỡi lửa đan hỏa: sáu ngọn quanh tâm (r 1,35 m, hở giữa để thấy mục tiêu), bốc lên rồi tan; hai ngọn ngọc lục xen giữa đỏ son
    for i in range(6):
        a = i / 6 * math.tau + 0.4
        h = 1.5 + 0.5 * ((i * 7) % 3) / 2
        ev.append(mesh('flame_tongue', -0.02 + 0.015 * i, 0.62, at='area', offset=[round(math.sin(a) * 1.35, 2), 0.05, round(math.cos(a) * 1.35, 2)], rot=[10, round(math.degrees(a), 1), 0],
                       scale=[1.3, h, 1.3], scaleTo=[1.0, h * 1.35, 1.0], sweep=0.14, erodeFrom=0.45, ragged=0.75, alpha=1, shadow=(i % 2 == 0),
                       tone='body' if i % 3 == 1 else 'accent', tier=0 if i % 2 == 0 else 1, seed=50 + i))
    # mảnh đan vỡ (viên đan nhỏ) và tia lửa có đuôi bắn tỏa NGAY ở khung hit
    for i, (dx, dy, dz) in enumerate([(2.4, 1.3, 0.3), (-2.2, 1.0, 0.9), (0.4, 2.6, -0.2), (1.5, 0.7, -1.8), (-1.3, 1.8, -1.3), (-0.6, 0.9, 2.2), (2.0, 2.0, 1.4)]):
        ev.append(mesh('spark_streak', -0.02, 0.3, at='area', offset=[0, 0.9, 0], scale=2.0, sweep=0, erodeFrom=0.5, move={'to': 'area', 'offset': [dx, 0.9 + dy, dz], 'ease': 'out'},
                       shadow=False, tone='accent', alpha=1, seed=i + 1, tier=0 if i < 4 else 1))
        if i < 6:
            ev.append(mesh('pill_orb', -0.02, 0.4, at='area', offset=[dx * 0.15, 0.9 + dy * 0.15, dz * 0.15], rot=[40 * i, 70 * i, 0], scale=0.3, scaleTo=0.18, sweep=0, erodeFrom=0.55, alpha=1, spin=700,
                           move={'to': 'area', 'offset': [dx * 0.8, 0.5 + dy * 0.9, dz * 0.8], 'ease': 'out'}, tone='accent' if i % 3 else 'body', tier=0 if i < 3 else 1, seed=70 + i))
    ev += [stop(0.0, 60), shake(0.0, 0.3), flash(0.0, 0.1, tier=0), vig(0.0, 0.3, 300, tier=1), cam(0.0, 0, 0.5, fov=2.0, tier=1)]
    return {
        'skill': 'skl_dan_hoa_phong_tran',
        'replaces': ['danhoa'],
        'events': ev,
        'variants': {
            # a = vùng rộng ×1,33: thêm một vành thứ ba quét chậm ra mép + vòng tám lá ngọc xòe quanh đóa sen
            'wide': [
                wave(0.14, 'area', 0.35, 1.02, dur=0.55, tone='accent', seed=20),
                *[mesh('petal_blade', 0.08 + 0.015 * i, 0.8, at='area', offset=[round(math.sin(i / 8 * math.tau) * 3.4, 2), 0.25, round(math.cos(i / 8 * math.tau) * 3.4, 2)],
                       rot=[-8, round(i / 8 * 360, 1), 0], scale=2.4, sweep=0.25, erodeFrom=0.6, alpha=1, tone='body', tier=0 if i % 2 == 0 else 1, seed=30 + i) for i in range(8)],
            ],
            # b = thiêu đốt lâu ×1,5: đóa sen lửa nhỏ cháy âm ỉ ở tâm + vành đỏ son ở lại lâu, ba nhịp lửa bùng lại
            'long': [
                mesh('lotus_bloom', 0.9, 2.8, at='area', offset=[0, 0.06, 0], rot=[0, 40, 0], scale=[1.7, 1.0, 1.7], sweep=0.1, erodeFrom=0.8, ragged=0.15, alpha=1, tone='accent', tier=0, seed=40),
                *[mesh('flame_tongue', t, 0.6, at='area', offset=[0.5 * math.sin(k * 2.1), 0.05, 0.5 * math.cos(k * 2.1)], scale=[0.9, 1.1, 0.9], scaleTo=[0.7, 1.5, 0.7], sweep=0.2, erodeFrom=0.45, ragged=0.75,
                       shadow=False, tone='accent', tier=1, seed=45 + k) for k, t in enumerate((1.2, 2.0, 2.8))],
                zone_ring(1.6, 'area', 2.4, tone='accent', seed=41, alpha=0.75),
                *[flip('spark_burst', t, 0.34, 1.8, at='area', offset=[0, 0.8, 0], alpha=0.6, tone='accent', tier=1) for t in (1.2, 2.0, 2.8)],
            ],
        },
    }


R['skl_dan_hoa_phong_tran'] = dan_hoa

if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
