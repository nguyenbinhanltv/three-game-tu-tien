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
    cam, decal, flash, flip, mesh, parts, shake, slow, snd, stop, vig, write,
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
        mesh('lotus_bloom', -0.02, 1.3, at='area', offset=[0, 0.1, 0], rot=[0, 22, 0], scale=[1.5, 0.7, 1.5], sweep=0.08, erodeFrom=0.64, ragged=0.15, alpha=1, tone='body', tier=0, seed=6),
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
                       scale=[1.3, h, 1.3], scaleTo=[1.0, h * 1.35, 1.0], sweep=0.14, erodeFrom=0.45, ragged=0.75, alpha=1, shadow=(i % 2 == 0), camFade=True,
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


# --------------------------------------------------------------------------------------------------------------------------------
# VS-1 Đan sư phần 2: 5 chiêu hồi/hộ (ngôn ngữ đã duyệt ở Đan Hỏa Phong Trần). Chiêu hồi dùng NGỌC LỤC là chính (`body`, điểm `rim`),
# đỏ son chỉ xuất hiện ở phần gây hại (độc, lửa lò). Sen dưới chân người/đồng đội luôn THẤP (scale y ≤ 0,5) và không có nhụy dựng ở chỗ có
# người đứng. Chiêu hồi theo vùng (hot/revive) có S.FX x, z, r nên dùng `at: area` + `fit: area`; Ngưng Đan (khiên) neo `self`.
# Cảm giác nhẹ: khựng ≤ 60 ms, rung ≤ 0,35, chớp ≤ 0,1; không vignette ở chiêu hồi thường.
G = -1.12  # mặt đất dưới chân tính từ neo `self` (ngực)


def ring(n, r, a0=0.0):
    """n điểm quanh vòng bán kính r: (x, z, góc độ)."""
    return [(round(math.sin(a0 + i / n * math.tau) * r, 2), round(math.cos(a0 + i / n * math.tau) * r, 2), round(math.degrees(a0 + i / n * math.tau), 1)) for i in range(n)]


def lotus(t, at, r, h=0.45, dur=1.6, tone='body', tier=0, seed=5, off=(0, 0.06, 0), sweep=0.1, rot=0, **k):
    """Sen thấp nở từ tâm ra: bán kính r m, cánh ngoài cao ~0,4 × h m. Sen to được nâng thêm 0,04 m mỗi mét bán kính: lòng cánh võng xuống,
    không nâng thì chìm dưới nền lát (cánh trông rỗng)."""
    off = (off[0], round(off[1] + 0.04 * r, 3), off[2])
    return mesh('lotus_bloom', t, dur, at=at, offset=list(off), rot=[0, rot, 0], scale=[r, h, r], sweep=sweep, erodeFrom=0.62, ragged=0.15, alpha=1, tone=tone, tier=tier, seed=seed, **k)


def soft(t, ms=40, sh=0.12, fl=0.05, fov=1.0):
    """Cảm giác của chiêu hồi: khựng rất ngắn (chỉ từ Vừa), rung nhẹ, chớp mờ, đẩy góc nhìn nhẹ."""
    return [stop(t, ms, tier=1), shake(t, sh), flash(t, fl, tier=1), cam(t, 0, 0.5, fov=fov, tier=1)]


def hoi_xuan():
    """Hồi Xuân Quyết (hồi dần 6 s cho đồng đội trong r 10 + độc lên quái; hit 0,4 s): viên đan ngọc bay lên đỉnh đầu rồi vỡ thành mưa xuân,
    mảnh đan rơi vòng quanh, sen ngọc thấp nở dưới chân, tám lá ngọc lướt sát đất tỏa ra, vành sóng tới mép vùng và ở lại 3 s."""
    TOP = [0, 2.7, 0]
    ev = [
        parts('petal', -0.4, 16, 1.4, 1, 0.3, 0.08, at='ahead', offset=[0.2, 0.2, -0.4], inward=True, tone='body', tier=1),
        snd(-0.4, 'cast', 0.4, 1.15),
        mesh('pill_orb', -0.36, 0.16, at='ahead', offset=[0.2, 0.2, 0.6], scale=0.2, scaleTo=0.5, sweep=0.3, erodeFrom=0.98, alpha=1, spin=500, tone='body', tier=0, seed=1),
        mesh('pill_orb', -0.2, 0.2, at='ahead', offset=[0.2, 0.2, 0.6], scale=0.5, scaleTo=0.6, sweep=0, erodeFrom=0.98, alpha=1, spin=800, keepUp=True,
             move={'to': 'self', 'offset': TOP, 'ease': 'out'}, tone='body', tier=0, seed=1),
        # vỡ trên đỉnh đầu
        mesh('pill_orb', -0.02, 0.2, at='self', offset=TOP, rot=[20, 30, 0], scale=0.6, scaleTo=1.7, sweep=0, erodeFrom=0.35, alpha=1, spin=300, tone='body', tier=0, seed=2),
        mesh('burst', -0.02, 0.11, at='self', offset=TOP, scale=1.9, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.36, 2.6, at='self', offset=TOP, alpha=0.75, tone='body', tier=0),
        snd(0.0, 'heal', 0.85, 1.0, 0.04),
        snd(0.02, 'shield', 0.3, 1.3, 0.05),
        # sen ngọc thấp dưới chân + sóng theo vùng thật + vành ở lại
        lotus(-0.04, 'area', 2.6, h=0.42, dur=1.7, tone='body', seed=5),
        wave(0.0, 'area', 0.12, 1.0, dur=0.5, tone='body', seed=3),
        wave(0.08, 'area', 0.1, 0.8, dur=0.46, tone='accent', tier=1, seed=4, alpha=0.7),
        zone_ring(0.32, 'area', 3.0, tone='body', seed=7),
        decal('rune', 0.0, 5.0, 2.4, at='area', grow=0.25, tone='body', alpha=0.6, tier=1),
        parts('petal', 0.0, 44, 2.6, 1, 1.3, 0.11, at='self', offset=TOP, grav=1.4, tone='body', tier=0),
        parts('spark', 0.0, 30, 4.5, 1, 0.5, 0.07, at='self', offset=TOP, tone='rim', tier=1),
    ]
    # sáu mảnh đan rơi xuống quanh người
    for i, (x, z, _a) in enumerate(ring(6, 2.3, 0.3)):
        ev.append(mesh('pill_orb', -0.02, 0.32, at='self', offset=TOP, rot=[40 * i, 70 * i, 0], scale=0.28, scaleTo=0.2, sweep=0, erodeFrom=0.7, alpha=1, spin=600,
                       move={'to': 'self', 'offset': [x, G + 0.2, z], 'ease': 'in'}, tone='body', tier=0 if i % 2 == 0 else 1, seed=20 + i))
    # tám lá ngọc lướt sát đất từ tâm ra
    for i, (x, z, _a) in enumerate(ring(8, 1.0, 0.2)):
        ev.append(mesh('petal_blade', 0.02 + 0.012 * i, 0.5, at='area', offset=[x, 0.25, z], scale=2.2, sweep=0, erodeFrom=0.55, alpha=1,
                       move={'to': 'area', 'offset': [round(x * 5.6, 2), 0.25, round(z * 5.6, 2)], 'ease': 'out'}, tone='body' if i % 2 == 0 else 'rim', tier=0 if i % 2 == 0 else 1, seed=30 + i))
    ev += soft(0.0)
    return {
        'skill': 'skl_hoi_xuan_quyet',
        'replaces': ['xuanphong'],
        'events': ev,
        'variants': {
            # a = vùng hồi rộng ×1,4: thêm một vành thứ ba quét chậm + vòng lá thứ hai bay xa hơn
            'wide': [
                wave(0.16, 'area', 0.3, 1.02, dur=0.6, tone='body', seed=40),
                *[mesh('petal_blade', 0.12 + 0.012 * i, 0.6, at='area', offset=[round(x * 3.0, 2), 0.25, round(z * 3.0, 2)], scale=2.6, sweep=0, erodeFrom=0.55, alpha=1,
                       move={'to': 'area', 'offset': [round(x * 9.5, 2), 0.25, round(z * 9.5, 2)], 'ease': 'out'}, tone='rim', tier=1, seed=41 + i) for i, (x, z, _a) in enumerate(ring(8, 1.0, 0.6))],
            ],
            # b = dồn vào thân: ba viên đan ngọc treo quanh ngực + ba nhịp vành nhỏ dưới chân
            'self': [
                *[mesh('pill_orb', 0.1 + 0.05 * i, 2.6, at='self', offset=[x, 0.2, z], rot=[30 * i, 0, 0], scale=0.34, sweep=0.2, erodeFrom=0.8, alpha=1, spin=260, follow=True, tone='body', tier=0, seed=50 + i)
                  for i, (x, z, _a) in enumerate(ring(3, 0.95, 0.5))],
                *[mesh('rune_ring2', t, 0.7, at='self', offset=[0, G + 0.14, 0], scale=1.9, scaleTo=1.1, sweep=0.1, erodeFrom=0.5, alpha=0.85, shadow=False, follow=True, tone='body', tier=1, seed=55 + k)
                  for k, t in enumerate([0.5, 1.3, 2.1])],
            ],
        },
    }


R['skl_hoi_xuan_quyet'] = hoi_xuan


def moc_linh():
    """Mộc Linh Trận (trận hồi 8 s trong r 8 + độc lên quái; hit 0,4 s): sáu LÁ NGỌC lớn mọc thẳng đứng thành vòng trận, TRẬN NHÃN là một viên
    đan ngọc treo ở tâm, sen thấp dưới trận nhãn; vành mép vùng + vành trong ở lại 3,6 s (trận đang chạy)."""
    RL = 5.2  # vòng lá (m): nằm trong cả vùng thường (8 m) lẫn vùng dày (6 m)
    ev = [
        parts('petal', -0.4, 18, 1.5, 1, 0.3, 0.08, at='self', inward=True, tone='body', tier=1),
        snd(-0.4, 'cast', 0.4, 1.0),
        decal('rune', -0.36, 5.4, 2.6, at='area', grow=0.3, tone='body', alpha=0.75, tier=0),
        # trận nhãn: viên đan treo ở tâm, sen thấp bên dưới
        mesh('pill_orb', -0.02, 3.8, at='area', offset=[0, 2.6, 0], scale=0.4, scaleTo=0.75, sweep=0.06, erodeFrom=0.85, alpha=1, spin=160, tone='body', tier=0, seed=1),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 2.6, 0], scale=1.6, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        lotus(-0.04, 'area', 2.2, h=0.4, dur=2.2, tone='body', seed=5),
        snd(0.0, 'heal', 0.7, 0.9, 0.04),
        snd(0.0, 'impact', 0.35, 1.2, 0.05),
        wave(0.0, 'area', 0.12, 1.0, dur=0.46, tone='body', seed=3),
        wave(0.08, 'area', 0.1, 0.7, dur=0.42, tone='accent', tier=1, seed=4, alpha=0.7),
        zone_ring(0.3, 'area', 3.6, tone='body', seed=7),
        mesh('rune_ring2', 0.36, 3.5, at='area', offset=[0, 0.14, 0], scale=0.5, scaleTo=0.5, fit='area', sweep=0.12, erodeFrom=0.8, alpha=0.85, shadow=False, tone='core', tier=1, seed=8),
        parts('petal', 0.0, 40, 3.0, 1, 1.2, 0.11, at='area', offset=[0, 0.5, 0], grav=-1.1, tone='body', tier=0),
        parts('spark', 0.0, 26, 5, 1, 0.45, 0.07, at='area', offset=[0, 2.6, 0], tone='rim', tier=1),
    ]
    # sáu lá ngọc lớn mọc đứng quanh vòng trận (mọc lần lượt), lá to bản (rộng ×2), mặt lá xoay tiếp tuyến với vòng trận
    for i, (x, z, a) in enumerate(ring(6, RL, 0.3)):
        ev.append(mesh('petal_blade', -0.02 + 0.035 * i, 3.7 - 0.035 * i, at='area', offset=[x, 0.05, z], rot=[-90, a + 90, 0], scale=[7.0, 3.4, 3.4], sweep=0.07, erodeFrom=0.82, alpha=1,
                       tone='body' if i % 2 == 0 else 'rim', tier=0 if i % 2 == 0 else 1, seed=20 + i))
    ev += soft(0.0, ms=45, sh=0.16, fl=0.06, fov=1.2)
    return {
        'skill': 'skl_moc_linh_tran',
        'replaces': ['moclinh'],
        'events': ev,
        'variants': {
            # a = trận dày (vùng ×0,75, hồi mạnh hơn): thêm vòng sen trong + sáu lá thấp vòng trong
            'dense': [
                lotus(0.06, 'area', 3.6, h=0.4, dur=2.4, tone='rim', tier=0, seed=40, rot=22),
                *[mesh('petal_blade', 0.1 + 0.03 * i, 3.0, at='area', offset=[x, 0.05, z], rot=[-90, a + 90, 0], scale=[4.5, 2.0, 2.0], sweep=0.08, erodeFrom=0.8, alpha=1, tone='body', tier=1, seed=41 + i)
                  for i, (x, z, a) in enumerate(ring(6, 2.9, 0.8))],
            ],
            # b = độc mạnh ×2: lửa độc đỏ son bốc ở chân các lá + vành đỏ son ở lại
            'venom': [
                *[mesh('flame_tongue', 0.1 + 0.04 * i, 0.9, at='area', offset=[x, 0.05, z], rot=[8, a, 0], scale=[1.0, 1.2, 1.0], scaleTo=[0.8, 1.7, 0.8], sweep=0.16, erodeFrom=0.45, ragged=0.75,
                       shadow=False, tone='accent', tier=0 if i % 2 == 0 else 1, seed=50 + i) for i, (x, z, a) in enumerate(ring(6, RL - 0.9, 0.82))],
                mesh('rune_ring2', 0.4, 3.0, at='area', offset=[0, 0.16, 0], scale=0.8, scaleTo=0.8, fit='area', sweep=0.12, erodeFrom=0.78, alpha=0.85, shadow=False, tone='accent', tier=0, seed=57),
            ],
        },
    }


R['skl_moc_linh_tran'] = moc_linh


def ngung_dan():
    """Ngưng Đan Hộ Thể (khiên 10 s cho mình và đồng đội trong 12 m; hit 0,5 s): một viên đan ngọc lớn NGƯNG trên đỉnh đầu, vỡ thành NĂM viên
    đan hộ thể rơi xuống treo quanh ngực (bám theo người 3,8 s), vành dưới chân; sóng quét tới mép 12 m (đồng đội trong vòng cũng nhận khiên)."""
    TOP = [0, 2.5, 0]
    orbs = ring(5, 1.05, 0.3)
    ev = [
        parts('spark', -0.5, 26, 2.0, 1, 0.4, 0.07, at='self', offset=TOP, inward=True, tone='body', tier=1),
        snd(-0.5, 'cast', 0.4, 0.95),
        mesh('pill_orb', -0.48, 0.48, at='self', offset=TOP, scale=0.15, scaleTo=0.95, sweep=0.2, erodeFrom=0.98, alpha=1, spin=420, follow=True, tone='body', tier=0, seed=1),
        decal('rune', -0.4, 1.8, 1.6, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.85, tier=0),
        # vỡ: lõi phình rồi tan, năm viên rơi xuống chỗ treo
        mesh('pill_orb', -0.02, 0.18, at='self', offset=TOP, rot=[20, 30, 0], scale=0.95, scaleTo=1.8, sweep=0, erodeFrom=0.35, alpha=1, tone='body', tier=0, seed=2),
        mesh('burst', -0.02, 0.11, at='self', offset=TOP, scale=1.8, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.34, 2.4, at='self', offset=TOP, alpha=0.7, tone='body', tier=0),
        snd(0.0, 'shield', 0.85, 1.0, 0.03),
        snd(0.0, 'heal', 0.45, 1.15, 0.04),
        snd(0.03, 'block', 0.3, 1.2, 0.05),
        lotus(-0.04, 'self', 1.9, h=0.36, dur=1.5, tone='body', seed=5, off=(0, G + 0.06, 0)),
        mesh('rune_ring2', 0.05, 3.7, at='self', offset=[0, G + 0.14, 0], scale=1.35, scaleTo=1.35, sweep=0.08, erodeFrom=0.85, alpha=0.95, shadow=False, follow=True, tone='body', tier=0, seed=6),
        # sóng tới mép 12 m (đồng đội trong vòng nhận khiên) + vành ở lại ngắn
        mesh('rune_ring2', 0.0, 0.6, at='self', offset=[0, G + 0.1, 0], scale=1.4, scaleTo=round(12 * EDGE, 2), sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.45, 1.8, at='self', offset=[0, G + 0.12, 0], scale=round(12 * EDGE, 2), scaleTo=round(12 * EDGE, 2), sweep=0.12, erodeFrom=0.7, alpha=0.8, shadow=False, tone='core', tier=1, seed=7),
        parts('spark', 0.0, 34, 5, 1, 0.45, 0.08, at='self', offset=TOP, tone='rim', tier=0),
        parts('petal', 0.0, 20, 2.2, 1, 1.0, 0.1, at='self', offset=[0, G + 0.4, 0], grav=-1.0, tone='body', tier=1),
    ]
    for i, (x, z, _a) in enumerate(orbs):
        y = 0.1 + 0.3 * (i % 2)
        ev.append(mesh('pill_orb', -0.02, 0.18, at='self', offset=TOP, scale=0.42, sweep=0, erodeFrom=0.98, alpha=1, spin=700,
                       move={'to': 'self', 'offset': [x, y, z], 'ease': 'out'}, tone='body', tier=0, seed=20 + i))
        ev.append(mesh('pill_orb', 0.16, 3.6, at='self', offset=[x, y, z], rot=[25 * i, 0, 15], scale=0.42, sweep=0, erodeFrom=0.85, alpha=1, spin=140, follow=True,
                       tone='body' if i % 2 == 0 else 'rim', tier=0, seed=20 + i))
    ev += soft(0.0, ms=45, sh=0.15, fl=0.06, fov=1.2)
    return {
        'skill': 'skl_ngung_dan_ho_the',
        'events': ev,
        'variants': {
            # a = khiên dày hơn (ngắn hơn): thêm vòng ngoài năm viên đan LỚN, tan sớm hơn
            'big': [
                mesh('pill_orb', 0.2 + 0.03 * i, 2.8, at='self', offset=[x, 0.5, z], rot=[0, 30 * i, 20], scale=0.62, sweep=0.15, erodeFrom=0.75, alpha=1, spin=-110, follow=True, tone='body', tier=0, seed=40 + i)
                for i, (x, z, _a) in enumerate(ring(5, 1.6, 0.9))
            ],
            # b = hồi máu mỗi giây: ba nhịp vành nhỏ dâng + cánh hoa bay lên quanh thân
            'regen': [
                e
                for k, t in enumerate([0.5, 1.4, 2.3])
                for e in (
                    mesh('rune_ring2', t, 0.7, at='self', offset=[0, G + 0.2, 0], scale=1.9, scaleTo=1.2, sweep=0.1, erodeFrom=0.5, alpha=0.85, shadow=False, follow=True, tone='rim', tier=0, seed=50 + k),
                    parts('petal', t, 14, 1.6, 1, 1.1, 0.1, at='self', offset=[0, G + 0.4, 0], grav=-1.2, tone='body', tier=0),
                )
            ],
        },
    }


R['skl_ngung_dan_ho_the'] = ngung_dan


def phap_gioi():
    """Thiên Đan Pháp Giới (cấp 28, hồi 12 s trong r 14; hit 0,6 s): một viên THIÊN ĐAN lớn hiện trên cao rồi treo giữa trời 3,8 s, tám lá ngọc
    từ thiên đan rơi xuống, mỗi lá nở một đóa sen nhỏ quanh một đóa sen lớn thấp ở tâm (biển sen); hai vành ở lại (mép vùng và nửa vùng)."""
    SKY = [0, 5.6, 0]
    spots = ring(8, 6.4, 0.2)
    ev = [
        parts('spark', -0.6, 40, 2.6, 1, 0.5, 0.08, at='self', offset=SKY, inward=True, tone='body', tier=1),
        snd(-0.6, 'cast', 0.5, 0.75),
        decal('rune', -0.55, 6.0, 2.8, at='area', grow=0.4, tone='body', alpha=0.8, tier=0),
        mesh('pill_orb', -0.58, 0.58, at='area', offset=SKY, scale=0.2, scaleTo=1.5, sweep=0.2, erodeFrom=0.98, alpha=1, spin=260, tone='body', tier=0, seed=1),
        # thiên đan treo giữa trời
        mesh('pill_orb', 0.0, 3.8, at='area', offset=SKY, rot=[10, 0, 12], scale=1.5, scaleTo=1.6, sweep=0, erodeFrom=0.85, alpha=1, spin=90, tone='body', tier=0, seed=1),
        mesh('burst', -0.02, 0.12, at='area', offset=SKY, scale=3.0, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.38, 4.0, at='area', offset=SKY, alpha=0.7, tone='body', tier=0),
        snd(0.0, 'heal', 0.9, 0.85, 0.04),
        snd(0.0, 'impact', 0.5, 0.9, 0.05),
        snd(0.3, 'shield', 0.4, 1.1, 0.05),
        # sen lớn thấp ở tâm + sóng theo vùng thật + hai vành ở lại
        lotus(-0.04, 'area', 4.4, h=0.42, dur=2.6, tone='body', seed=5, sweep=0.08),
        wave(0.0, 'area', 0.1, 1.0, dur=0.56, tone='body', seed=3),
        wave(0.1, 'area', 0.1, 0.75, dur=0.5, tone='rim', tier=1, seed=4),
        zone_ring(0.36, 'area', 3.6, tone='body', seed=7),
        mesh('rune_ring2', 0.42, 3.4, at='area', offset=[0, 0.14, 0], scale=0.5, scaleTo=0.5, fit='area', sweep=0.12, erodeFrom=0.8, alpha=0.85, shadow=False, tone='core', tier=1, seed=8),
        parts('petal', 0.0, 70, 3.4, 1, 1.9, 0.12, at='area', offset=SKY, grav=1.6, tone='body', tier=0),
        parts('petal', 0.3, 40, 3.0, 1, 1.6, 0.11, at='area', offset=SKY, grav=1.5, tone='rim', tier=1),
    ]
    # tám lá ngọc rơi từ thiên đan xuống, mỗi lá nở một đóa sen nhỏ
    for i, (x, z, _a) in enumerate(spots):
        t0 = 0.0 + 0.04 * i
        ev.append(mesh('petal_blade', t0, 0.26, at='area', offset=SKY, scale=2.6, sweep=0, erodeFrom=0.7, alpha=1,
                       move={'to': 'area', 'offset': [x, 0.3, z], 'ease': 'in'}, tone='rim', tier=0 if i % 2 == 0 else 1, seed=20 + i))
        ev.append(lotus(t0 + 0.24, 'area', 1.5, h=0.5, dur=2.3, tone='body' if i % 2 == 0 else 'rim', tier=0 if i % 2 == 0 else 1, seed=30 + i, off=(x, 0.06, z), rot=20 * i))
    ev += [stop(0.0, 50, tier=1), shake(0.0, 0.25), flash(0.0, 0.08, tier=1), cam(0.0, 0.12, 1.6, fov=3.0, tier=1)]
    return {
        'skill': 'skl_thien_dan_phap_gioi',
        'events': ev,
        'variants': {
            # a = tăng công cho tổ đội: lửa đan hỏa đỏ son bốc ở tám đóa sen + một vành đỏ son quét ra
            'atk': [
                *[mesh('flame_tongue', 0.34 + 0.04 * i, 0.9, at='area', offset=[x, 0.1, z], rot=[0, 45 * i, 0], scale=[1.1, 1.3, 1.1], scaleTo=[0.9, 1.9, 0.9], sweep=0.16, erodeFrom=0.45, ragged=0.75,
                       shadow=False, tone='accent', tier=0 if i % 2 == 0 else 1, seed=50 + i) for i, (x, z, _a) in enumerate(spots)],
                wave(0.2, 'area', 0.2, 1.0, dur=0.55, tone='accent', seed=58),
            ],
            # b = tăng thủ cho tổ đội: tám viên đan ngọc lớn treo trên tám đóa sen + vành lõi sẫm ở lại
            'def': [
                *[mesh('pill_orb', 0.34 + 0.04 * i, 3.0, at='area', offset=[x, 1.3, z], rot=[0, 30 * i, 15], scale=0.6, sweep=0.15, erodeFrom=0.8, alpha=1, spin=120, tone='body', tier=0 if i % 2 == 0 else 1, seed=60 + i)
                  for i, (x, z, _a) in enumerate(spots)],
                mesh('rune_ring2', 0.5, 3.0, at='area', offset=[0, 0.16, 0], scale=0.78, scaleTo=0.78, fit='area', sweep=0.12, erodeFrom=0.8, alpha=0.85, shadow=False, tone='core', tier=0, seed=68),
            ],
        },
    }


R['skl_thien_dan_phap_gioi'] = phap_gioi


def hoi_thien():
    """Hồi Thiên Đan Lô (tối thượng, hồi sinh đồng đội trong r 14; hit 0,45 s): một chiếc ĐAN LÔ ngọc trồi lên trước mặt, lửa lò đỏ son liếm dưới
    chân lò; tới mốc trúng nắp lò bật, CHÍN viên đan phun ra rơi quanh vùng, mỗi viên nở một đóa sen; một thẻ Phượng nhỏ bay lên từ miệng lò ≤ 1,3 s.
    Tối thượng nên có slowmo + kéo camera."""
    LO = [0, G, 2.6]
    MOUTH = [0, G + 3.0, 2.6]
    spots = ring(9, 4.6, 0.35)
    w, hh = 9.5 * 0.42, 7.9 * 0.42
    ev = [
        parts('spark', -0.45, 36, 2.2, 1, 0.4, 0.07, at='self', offset=[0, 0.4, 2.6], inward=True, tone='body', tier=1),
        snd(-0.45, 'cast', 0.55, 0.78),
        vig(-0.42, 0.3, 450, tier=1),
        cam(-0.4, 0.15, 2.0, fov=4.0, tier=1),
        decal('rune', -0.42, 6.0, 2.4, at='self', offset=[0, G, 0], grow=0.35, tone='body', alpha=0.8, tier=0),
        # đan lô trồi lên trước mặt, lửa lò dưới chân
        mesh('dan_lo', -0.42, 1.9, at='self', offset=LO, rot=[0, 20, 0], scale=2.1, sweep=0.2, erodeFrom=0.72, alpha=1, tone='body', tier=0, seed=1),
        *[mesh('flame_tongue', -0.3 + 0.05 * i, 0.9, at='self', offset=[round(LO[0] + math.sin(i * 2.1) * 0.75, 2), G + 0.05, round(LO[2] + math.cos(i * 2.1) * 0.75, 2)], rot=[0, 60 * i, 0],
               scale=[0.9, 1.0, 0.9], scaleTo=[0.8, 1.5, 0.8], sweep=0.2, erodeFrom=0.45, ragged=0.75, shadow=False, tone='accent', tier=0 if i == 0 else 1, seed=10 + i) for i in range(3)],
        snd(-0.25, 'fire_burst', 0.4, 0.8, 0.05),
        # nắp lò bật: chớp ở miệng lò
        mesh('burst', -0.02, 0.12, at='self', offset=MOUTH, scale=2.8, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.4, 4.0, at='self', offset=MOUTH, alpha=0.8, tone='body', tier=0),
        mesh('pill_orb', -0.02, 0.2, at='self', offset=MOUTH, rot=[20, 30, 0], scale=0.7, scaleTo=2.0, sweep=0, erodeFrom=0.35, alpha=1, tone='body', tier=0, seed=2),
        slow(0.0, 0.4, 250, tier=2),
        snd(0.0, 'heal', 0.95, 0.8, 0.04),
        snd(0.0, 'impact', 0.7, 0.8, 0.04),
        snd(0.05, 'shield', 0.45, 1.0, 0.05),
        # sóng ra mép vùng hồi sinh 14 m + vành ở lại (neo `self`: tâm vùng của server chính là người ra chiêu)
        mesh('rune_ring2', 0.0, 0.56, at='self', offset=[0, G + 0.1, 0], scale=1.4, scaleTo=round(14 * EDGE, 2), sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.1, 0.5, at='self', offset=[0, G + 0.1, 0], scale=1.2, scaleTo=10.0, sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='rim', tier=1, seed=4),
        mesh('rune_ring2', 0.36, 2.4, at='self', offset=[0, G + 0.12, 0], scale=round(14 * EDGE, 2), scaleTo=round(14 * EDGE, 2), sweep=0.12, erodeFrom=0.75, alpha=0.9, shadow=False, follow=True, tone='body', tier=0, seed=7),
        # thẻ Phượng NHỎ bay lên từ miệng lò (cao hơn đầu người, không đứng cạnh pháp tướng hào quang), mọc rồi tan trong 1,3 s
        mesh('card', 0.0, 1.3, card='phoenix', at='self', offset=[0, G + 3.4 + hh / 2, 2.6], move={'to': 'self', 'offset': [0, G + 5.2 + hh / 2, 2.6], 'ease': 'out'}, keepUp=True, billboard=True, scale=[round(w / 2, 2), round(hh / 2, 2), 1], sweep=0.3, erodeFrom=0.6,
             alpha=0.9, tone='body', seed=980, tier=0),
        parts('petal', 0.0, 70, 3.0, 1, 1.8, 0.12, at='self', offset=MOUTH, grav=1.2, tone='body', tier=0),
        parts('spark', 0.0, 50, 6, 1, 0.5, 0.09, at='self', offset=MOUTH, tone='rim', tier=1),
    ]
    # chín viên đan phun ra, rơi quanh vùng, mỗi viên nở một đóa sen
    for i, (x, z, _a) in enumerate(spots):
        t0 = 0.0 + 0.025 * i
        tier = 0 if i % 3 == 0 else (1 if i % 3 == 1 else 2)
        ev.append(mesh('pill_orb', t0, 0.34, at='self', offset=MOUTH, scale=0.45, sweep=0, erodeFrom=0.9, alpha=1, spin=700,
                       move={'to': 'self', 'offset': [x, G + 0.35, z], 'ease': 'in'}, tone='body', tier=tier, seed=20 + i))
        ev.append(lotus(t0 + 0.32, 'self', 1.4, h=0.5, dur=1.8, tone='body' if i % 2 == 0 else 'rim', tier=tier, seed=30 + i, off=(x, G + 0.06, z), rot=25 * i))
    ev += [stop(0.0, 60), shake(0.0, 0.35), flash(0.0, 0.1, tier=0), vig(0.0, 0.4, 320, tier=1)]
    return {'skill': 'skl_hoi_thien_dan_lo', 'replaces': ['hoithien'], 'events': ev}


R['skl_hoi_thien_dan_lo'] = hoi_thien


# --------------------------------------------------------------------------------------------------------------------------------
# VS-1 Đan sư phần 3: 4 chiêu cuối. Lưu Hương Bộ là lướt LÙI kích theo S.FX (t = 0 lúc nhận tin, người đã ở đích; chỗ cũ nằm TRƯỚC mặt,
# `self` offset z dương). Thuấn Di Cứu Viện và Ảnh Dược neo `self` (S.FX không cho biết chắc đồng đội nào; sau thuấn di người đứng cách đồng
# đội 1,8 m nên hình đặt ở 1,8 m trước mặt).
def luu_huong():
    """Lưu Hương Bộ (lướt lùi 8 m, không gây hại): chỗ vừa rời nở một đóa sen nhỏ rồi tan thành cánh hoa, dọc đường lùi bảy lá ngọc lần lượt
    bật lên rồi rơi (vệt hương), tới đích một vành nhỏ dưới chân. Không khựng, không rung."""
    D = 8.0
    ev = [
        snd(0.0, 'cast', 0.3, 1.4, 0.05),
        lotus(0.0, 'self', 1.3, h=0.45, dur=0.9, tone='body', seed=5, off=(0, G + 0.06, D), sweep=0.12),
        mesh('burst', 0.0, 0.1, at='self', offset=[0, 0, D], scale=1.2, billboard=True, sweep=0, tone='body', tier=0),
        parts('petal', 0.0, 26, 2.4, 1, 0.9, 0.1, at='self', offset=[0, 0, D], grav=0.6, tone='body', tier=0),
        flip('ink_smoke', 0.02, 0.6, 1.8, at='self', offset=[0, 0.1, D - 0.6], alpha=0.25, tone='shadow', tier=2),
        # tới đích: sen nhỏ thấp dưới chân
        lotus(0.2, 'self', 1.1, h=0.4, dur=0.8, tone='rim', tier=1, seed=6, off=(0, G + 0.06, 0), sweep=0.12),
        mesh('rune_ring2', 0.22, 0.5, at='self', offset=[0, G + 0.12, 0], scale=0.5, scaleTo=1.6, sweep=0.06, erodeFrom=0.55, alpha=0.9, shadow=False, tone='body', tier=0, seed=3),
        parts('petal', 0.22, 12, 1.6, 1, 0.7, 0.09, at='self', offset=[0, G + 0.3, 0], grav=-0.8, tone='rim', tier=1),
        snd(0.22, 'heal', 0.25, 1.5, 0.05),
    ]
    # vệt hương: bảy lá ngọc dọc đường, bật lên lần lượt từ chỗ cũ về phía mình
    for i in range(7):
        z = round(D - 1.0 - 1.1 * i, 2)
        x = round(0.35 * (1 if i % 2 else -1), 2)
        ev.append(mesh('petal_blade', 0.02 + 0.028 * i, 0.6, at='self', offset=[x, G + 0.1, z], rot=[-70, 30 * i, 0], scale=2.6, sweep=0.2, erodeFrom=0.45, alpha=1,
                       move={'to': 'self', 'offset': [x * 1.6, G + 1.3, z - 0.5], 'ease': 'out'}, tone='body' if i % 2 == 0 else 'rim', tier=0 if i % 2 == 0 else 1, seed=20 + i))
    return {'skill': 'skl_luu_huong_bo', 'trigger': 'fx', 'fxKind': 'dash', 'method': 'thanh_moc_dan_kinh', 'events': ev}


R['skl_luu_huong_bo'] = luu_huong


def duoc_vu():
    """Dược Vũ (mưa thuốc hồi 4 s trong r 10; hit 0,4 s): ném viên đan lên trời, vỡ thành MƯA THUỐC: mười hai giọt đan rơi lần lượt khắp vùng,
    mỗi giọt chạm đất gợn một vành nhỏ; vành mép vùng ở lại 2,6 s."""
    SKY = [0, 6.0, 0]
    drops = [(round(math.sin(i * 2.399) * (1.6 + 0.62 * i), 2), round(math.cos(i * 2.399) * (1.6 + 0.62 * i), 2), round(0.0 + 0.045 * i, 3)) for i in range(12)]
    ev = [
        parts('petal', -0.4, 14, 1.4, 1, 0.3, 0.08, at='ahead', offset=[0.2, 0.2, -0.4], inward=True, tone='body', tier=1),
        snd(-0.4, 'cast', 0.4, 1.2),
        mesh('pill_orb', -0.3, 0.3, at='ahead', offset=[0.2, 0.3, 0.6], scale=0.4, scaleTo=0.6, sweep=0, erodeFrom=0.98, alpha=1, spin=800, keepUp=True,
             move={'to': 'area', 'offset': SKY, 'ease': 'out'}, tone='body', tier=0, seed=1),
        # vỡ trên trời
        mesh('pill_orb', -0.02, 0.2, at='area', offset=SKY, rot=[20, 30, 0], scale=0.6, scaleTo=2.0, sweep=0, erodeFrom=0.35, alpha=1, tone='body', tier=0, seed=2),
        mesh('burst', -0.02, 0.11, at='area', offset=SKY, scale=2.4, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.36, 3.2, at='area', offset=SKY, alpha=0.7, tone='body', tier=0),
        snd(0.0, 'heal', 0.75, 1.1, 0.04),
        snd(0.05, 'rain', 0.4, 1.2, 0.05),
        wave(0.0, 'area', 0.1, 1.0, dur=0.5, tone='body', seed=3),
        zone_ring(0.3, 'area', 2.6, tone='body', seed=7),
        decal('rune', 0.0, 5.0, 2.2, at='area', grow=0.25, tone='body', alpha=0.55, tier=1),
        parts('petal', 0.0, 60, 4.0, 1, 1.6, 0.1, at='area', offset=SKY, grav=2.2, tone='body', tier=0),
        parts('spark', 0.1, 40, 4.5, 1, 1.2, 0.07, at='area', offset=SKY, grav=3.0, tone='rim', tier=1),
    ]
    for i, (x, z, t0) in enumerate(drops):
        tier = 0 if i % 3 == 0 else (1 if i % 3 == 1 else 2)
        ev.append(mesh('pill_orb', t0, 0.22, at='area', offset=[round(x * 0.5, 2), 6.0, round(z * 0.5, 2)], scale=[0.4, 1.2, 0.4], sweep=0, erodeFrom=0.9, alpha=1, keepUp=True,
                       move={'to': 'area', 'offset': [x, 0.5, z], 'ease': 'in'}, tone='body' if i % 2 == 0 else 'rim', tier=tier, seed=20 + i))
        ev.append(mesh('rune_ring2', t0 + 0.22, 0.5, at='area', offset=[x, 0.12, z], scale=0.4, scaleTo=1.7, sweep=0.06, erodeFrom=0.5, alpha=0.95, shadow=False, tone='body', tier=tier, seed=40 + i))
    ev += soft(0.0)
    return {
        'skill': 'skl_duoc_vu',
        'replaces': ['duocvu'],
        'events': ev,
        'variants': {
            # a = thêm khiên nhỏ cho mình: ba viên đan treo quanh ngực + vành chân bám theo
            'ward': [
                *[mesh('pill_orb', 0.1 + 0.05 * i, 2.4, at='self', offset=[x, 0.2, z], rot=[30 * i, 0, 0], scale=0.34, sweep=0.2, erodeFrom=0.8, alpha=1, spin=260, follow=True, tone='body', tier=0, seed=60 + i)
                  for i, (x, z, _a) in enumerate(ring(3, 0.95, 0.5))],
                mesh('rune_ring2', 0.15, 2.4, at='self', offset=[0, G + 0.14, 0], scale=1.3, scaleTo=1.3, sweep=0.1, erodeFrom=0.8, alpha=0.9, shadow=False, follow=True, tone='rim', tier=0, seed=65),
            ],
            # b = vùng rộng ×1,5: thêm một vành thứ hai quét chậm + sáu giọt rơi ở vòng ngoài
            'wide': [
                wave(0.16, 'area', 0.3, 1.02, dur=0.6, tone='body', seed=70),
                *[mesh('pill_orb', 0.3 + 0.08 * i, 0.3, at='area', offset=[round(x * 0.5, 2), 6.0, round(z * 0.5, 2)], scale=[0.4, 1.2, 0.4], sweep=0, erodeFrom=0.9, alpha=1, keepUp=True,
                       move={'to': 'area', 'offset': [x, 0.5, z], 'ease': 'in'}, tone='rim', tier=0 if i % 2 == 0 else 1, seed=71 + i) for i, (x, z, _a) in enumerate(ring(6, 11.5, 0.4))],
            ],
        },
    }


R['skl_duoc_vu'] = duoc_vu


def anh_duoc():
    """Ảnh Dược Hóa Thân (hồi 4 s cho mình và đồng đội mất máu nhiều nhất; hit 0,4 s): một BÓNG DƯỢC (thẻ bóng người màu ngọc) tách khỏi thân bước
    ra trước mặt, nâng một viên đan rồi tan thành cánh hoa; sen thấp dưới chân mình, vành nhỏ bám theo người."""
    GH = [0.95, 1.9, 1]
    OUT = [0.6, 0.1, 2.4]
    ev = [
        parts('petal', -0.4, 16, 1.5, 1, 0.3, 0.08, at='self', inward=True, tone='body', tier=1),
        snd(-0.4, 'cast', 0.4, 1.1),
        decal('rune', -0.36, 1.7, 1.4, at='self', offset=[0, G, 0], grow=0.2, tone='body', alpha=0.8, tier=0),
        # bóng dược tách ra, bước tới trước mặt
        mesh('card', -0.3, 0.3, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=GH, sweep=0.15, erodeFrom=0.9, alpha=0.8,
             move={'to': 'self', 'offset': OUT, 'ease': 'out'}, tone='body', tier=0, seed=11),
        mesh('card', 0.0, 1.5, card='ghost', at='self', offset=OUT, billboard=True, scale=GH, sweep=0, erodeFrom=0.55, alpha=0.8, tone='body', tier=0, seed=11),
        # viên đan bóng dược nâng lên rồi vỡ
        mesh('pill_orb', -0.02, 0.9, at='self', offset=[OUT[0], 1.0, OUT[2] + 0.5], scale=0.3, scaleTo=0.55, sweep=0.08, erodeFrom=0.7, alpha=1, spin=300, tone='body', tier=0, seed=2),
        mesh('burst', -0.02, 0.11, at='self', offset=[OUT[0], 1.0, OUT[2] + 0.5], scale=1.5, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.34, 2.0, at='self', offset=[OUT[0], 1.0, OUT[2] + 0.5], alpha=0.7, tone='body', tier=0),
        snd(0.0, 'heal', 0.8, 1.05, 0.04),
        snd(0.02, 'shield', 0.3, 1.3, 0.05),
        lotus(-0.04, 'self', 1.8, h=0.38, dur=1.6, tone='body', seed=5, off=(0, G + 0.06, 0)),
        lotus(0.02, 'self', 1.3, h=0.38, dur=1.5, tone='rim', tier=1, seed=6, off=(OUT[0], G + 0.06, OUT[2]), rot=20),
        mesh('rune_ring2', 0.0, 0.42, at='self', offset=[0, G + 0.1, 0], scale=0.8, scaleTo=3.6, sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.1, 2.6, at='self', offset=[0, G + 0.14, 0], scale=1.3, scaleTo=1.3, sweep=0.1, erodeFrom=0.82, alpha=0.9, shadow=False, follow=True, tone='body', tier=0, seed=7),
        parts('petal', 0.0, 34, 2.4, 1, 1.2, 0.11, at='self', offset=[OUT[0], 0.6, OUT[2]], grav=-0.9, tone='body', tier=0),
        parts('spark', 0.0, 22, 4, 1, 0.45, 0.07, at='self', offset=[OUT[0], 1.0, OUT[2] + 0.5], tone='rim', tier=1),
    ]
    ev += soft(0.0)
    return {
        'skill': 'skl_anh_duoc_hoa_than',
        'events': ev,
        'variants': {
            # a = chữa hai đồng đội: bóng dược thứ hai bước ra phía bên kia, cũng nâng một viên đan
            'two': [
                mesh('card', -0.26, 0.3, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=GH, sweep=0.15, erodeFrom=0.9, alpha=0.8,
                     move={'to': 'self', 'offset': [-OUT[0] - 1.2, 0.1, OUT[2] - 0.4], 'ease': 'out'}, tone='rim', tier=0, seed=31),
                mesh('card', 0.04, 1.5, card='ghost', at='self', offset=[-OUT[0] - 1.2, 0.1, OUT[2] - 0.4], billboard=True, scale=GH, sweep=0, erodeFrom=0.55, alpha=0.8, tone='rim', tier=0, seed=31),
                mesh('pill_orb', 0.02, 0.9, at='self', offset=[-OUT[0] - 1.2, 1.0, OUT[2] + 0.1], scale=0.3, scaleTo=0.55, sweep=0.08, erodeFrom=0.7, alpha=1, spin=300, tone='body', tier=0, seed=32),
            ],
            # b = thêm khiên nhỏ cho mình: ba viên đan treo quanh ngực
            'ward': [
                mesh('pill_orb', 0.1 + 0.05 * i, 2.4, at='self', offset=[x, 0.2, z], rot=[30 * i, 0, 0], scale=0.34, sweep=0.2, erodeFrom=0.8, alpha=1, spin=260, follow=True, tone='body', tier=0, seed=40 + i)
                for i, (x, z, _a) in enumerate(ring(3, 0.95, 0.5))
            ],
        },
    }


R['skl_anh_duoc_hoa_than'] = anh_duoc


def cuu_vien():
    """Thuấn Di Cứu Viện (thuấn di tới đồng đội tử vong và hồi sinh; hit 0,2 s): đáp xuống, một viên đan hồi sinh từ trên cao rơi vào chỗ đồng
    đội (1,8 m trước mặt), sen lớn thấp nở tại đó, sáu lá ngọc xoáy bay lên, vành r 3 m ở lại."""
    AT = [0, G, 1.8]
    ev = [
        parts('spark', -0.2, 16, 2.0, 1, 0.2, 0.06, at='self', inward=True, tone='body', tier=1),
        snd(-0.2, 'cast', 0.45, 1.2),
        mesh('burst', -0.06, 0.1, at='self', offset=[0, 0.2, 0], scale=1.2, billboard=True, sweep=0, tone='body', tier=0),
        # viên đan hồi sinh rơi xuống chỗ đồng đội
        mesh('pill_orb', -0.18, 0.18, at='self', offset=[0, 6.0, 1.8], scale=0.7, sweep=0, erodeFrom=0.98, alpha=1, spin=600, keepUp=True,
             move={'to': 'self', 'offset': [0, G + 0.6, 1.8], 'ease': 'in'}, tone='body', tier=0, seed=1),
        mesh('pill_orb', -0.02, 0.2, at='self', offset=[0, G + 0.6, 1.8], rot=[20, 30, 0], scale=0.7, scaleTo=2.0, sweep=0, erodeFrom=0.35, alpha=1, tone='body', tier=0, seed=2),
        mesh('burst', -0.02, 0.11, at='self', offset=[0, G + 0.8, 1.8], scale=2.2, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.36, 3.0, at='self', offset=[0, G + 1.0, 1.8], alpha=0.75, tone='body', tier=0),
        snd(0.0, 'heal', 0.9, 0.95, 0.04),
        snd(0.0, 'impact', 0.45, 1.1, 0.05),
        snd(0.04, 'shield', 0.35, 1.2, 0.05),
        lotus(-0.04, 'self', 2.6, h=0.42, dur=1.9, tone='body', seed=5, off=tuple([AT[0], G + 0.06, AT[2]])),
        mesh('rune_ring2', 0.0, 0.42, at='self', offset=[0, G + 0.1, 1.8], scale=0.6, scaleTo=round(3 * EDGE, 2), sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.3, 2.6, at='self', offset=[0, G + 0.12, 1.8], scale=round(3 * EDGE, 2), scaleTo=round(3 * EDGE, 2), sweep=0.12, erodeFrom=0.78, alpha=0.9, shadow=False, tone='body', tier=0, seed=7),
        decal('rune', 0.0, 2.8, 2.4, at='self', offset=[0, G, 1.8], grow=0.2, tone='body', alpha=0.6, tier=1),
        parts('petal', 0.0, 50, 2.6, 1, 1.5, 0.11, at='self', offset=[0, G + 0.4, 1.8], grav=-1.4, tone='body', tier=0),
        parts('spark', 0.0, 30, 5, 1, 0.5, 0.08, at='self', offset=[0, G + 0.8, 1.8], tone='rim', tier=1),
    ]
    # sáu lá ngọc xoáy bay lên quanh chỗ đồng đội
    for i, (x, z, a) in enumerate(ring(6, 1.5, 0.3)):
        ev.append(mesh('petal_blade', 0.02 + 0.03 * i, 0.8, at='self', offset=[x, G + 0.15, round(1.8 + z, 2)], rot=[-60, a + 70, 0], scale=2.0, sweep=0.15, erodeFrom=0.5, alpha=1,
                       move={'to': 'self', 'offset': [round(x * 0.5, 2), G + 3.0, round(1.8 + z * 0.5, 2)], 'ease': 'out'}, tone='body' if i % 2 == 0 else 'rim', tier=0 if i % 2 == 0 else 1, seed=20 + i))
    ev += soft(0.0, ms=50, sh=0.2, fl=0.08, fov=1.5)
    return {
        'skill': 'skl_thuan_di_cuu_vien',
        'events': ev,
        'variants': {
            # a = hồi sinh với nhiều máu hơn: vòng sen thứ hai rộng hơn + sáu viên đan nhỏ dâng lên
            'strong': [
                lotus(0.08, 'self', 3.8, h=0.4, dur=1.8, tone='rim', seed=40, off=(0, G + 0.06, 1.8), rot=22),
                *[mesh('pill_orb', 0.12 + 0.03 * i, 0.9, at='self', offset=[x, G + 0.3, round(1.8 + z, 2)], scale=0.28, sweep=0.1, erodeFrom=0.6, alpha=1, spin=400,
                       move={'to': 'self', 'offset': [x, G + 2.2, round(1.8 + z, 2)], 'ease': 'out'}, tone='body', tier=0 if i % 2 == 0 else 1, seed=41 + i) for i, (x, z, _a) in enumerate(ring(6, 2.2, 0.8))],
            ],
            # b = hồi sinh hai người: viên đan thứ hai rơi xuống bên cạnh + sen thứ hai
            'two': [
                mesh('pill_orb', -0.1, 0.18, at='self', offset=[2.6, 6.0, 0.6], scale=0.6, sweep=0, erodeFrom=0.98, alpha=1, spin=600, keepUp=True,
                     move={'to': 'self', 'offset': [2.6, G + 0.6, 0.6], 'ease': 'in'}, tone='body', tier=0, seed=50),
                lotus(0.06, 'self', 2.0, h=0.42, dur=1.8, tone='body', seed=51, off=(2.6, G + 0.06, 0.6), rot=30),
                mesh('rune_ring2', 0.1, 0.4, at='self', offset=[2.6, G + 0.1, 0.6], scale=0.5, scaleTo=2.4, sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=52),
            ],
        },
    }


R['skl_thuan_di_cuu_vien'] = cuu_vien

if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
