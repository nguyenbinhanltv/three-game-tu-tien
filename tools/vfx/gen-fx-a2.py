#!/usr/bin/env python3
"""A2 (Họa Pháp Lô 2): timeline riêng cho 7 chiêu của 2 boss chương 3 Vân Hải (concept đã duyệt, chỉ lấy HIỆU ỨNG, không vẽ hình cá voi):
Vân Hải Kình Vương (thủy: xoáy nước, vòng bọt trắng, tia nước, sóng cuộn) — slam r7, sweep quạt r18/40°, line dải 40×6, chant r8;
Kính Nguyệt Chân Quân (kim: lưỡi trăng khuyết bạc, vết trăng, mảnh băng/gương) — slam r5, sweep quạt r14/35°, line dải 20×3.
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo đỏ đặc vân nứt tô dần theo `delay`, đúng hitbox) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo hệ, KHÔNG đỏ/cam).
Chiêu niệm (chant) thêm `mon_cast__<quái>`.
Hình vùng nổ là SPRITE Codex vẽ (ô `thuy_*`, `nguyet_*` của `vfx_sprites.<hash>.webp`, kiểu tô "thủy"/"nguyệt" ở `spriteNodes`) + decal tối làm nền + hạt bọt/giọt/mảnh.
Hệ số `mul` của runner: vùng tròn = r/4 (decal r4, vị trí/cỡ viết theo r=4); quạt/dải = r/8 (kẹp 0,5..4) nên sprite/hạt viết bằng mét thật rồi chia `k`.
Sprite phẳng (nhìn từ trên: xoáy, vòng bọt, vết trăng...) dùng `billboard: false` + rot -90; sprite dọc (tia nước, sóng, lưỡi trăng...) quay mặt về camera; `aim` xoay trục +x của tranh dọc hướng ngắm.
Chạy: python tools/vfx/gen-fx-a2.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35


def sp(name, t, dur, size, x=0.0, y=0.0, z=0.0, k=1.0, alpha=0.95, erode=0.35, flat=False, aim=False, to=None, size_to=None, seed=0, tone='body'):
    """Một sprite: `size` = cạnh ô vuông bằng mét thật (scale của mesh là NỬA cạnh vì ô rộng 2 đơn vị); `k` = hệ số mul của vùng để chia ngược. `to` = (x, z) đích trượt tới (mét thật)."""
    e = mesh('sprite', t, dur, tone, alpha, seed, sprite=name, scale=round(size / 2 / k, 3), scaleTo=round((size_to or size) / 2 / k, 3),
             offset=[round(x / k, 3), round(y / k, 3), round(z / k, 3)], erodeFrom=erode, sweep=0, ragged=0.5, tier=0)
    if flat:
        e['billboard'] = False
        e['rot'] = [-90, 0, 0]
    if aim:
        e['aim'] = True
    if to is not None:
        e['move'] = {'to': 'area', 'offset': [round(to[0] / k, 3), round(y / k, 3), round(to[1] / k, 3)], 'ease': 'out'}
    return e


def ring_pts(n, rad, a0=0.3):
    return [(math.cos(a0 + i / n * math.tau) * rad, math.sin(a0 + i / n * math.tau) * rad) for i in range(n)]


# ================= Vân Hải Kình Vương (thủy): xoáy nước phẳng, vòng bọt, tia nước, sóng =================
B = 'boss_van_hai_kinh_vuong'
PW = 'mon_boss_thuy'
cast_ring(B, 8, PW)
write(f'mon_warn__{B}__slam', warn_circle(1.5, 35, -50), PW)
write(f'mon_boom_circle__{B}__slam', [  # r7: mul 1,75 (viết theo r=4)
    decal('scorch', 0, 4, 2.6, 'core', 0.95, 0.02, top=False, untilDelay=False, lift=LIFT),  # vũng nước sẫm
    sp('thuy_whirl', 0.0, 0.9, 8.0, y=0.4, flat=True, alpha=0.8, erode=0.3, seed=1100),
    sp('thuy_foam_ring', 0.03, 0.8, 8.4, y=0.45, flat=True, alpha=0.7, erode=0.3, seed=1101),
    sp('thuy_spray', 0.02, 0.5, 5.0, y=0.5, flat=True, alpha=0.75, erode=0.15, seed=1102),
    sp('thuy_spout', 0.03, 0.7, 5.0, y=2.5, k=1.75, alpha=0.9, erode=0.3, seed=1103),
    *[sp('thuy_jet', 0.02 + i * 0.03, 0.6, 3.6, x=p[0], y=1.8, z=p[1], k=1.75, alpha=0.9, erode=0.3, seed=1104 + i) for i, p in enumerate(ring_pts(4, 4.6))],
    parts('dust', 0, 40, 4, 0.9, 1.0, 0.26, 'rim', offset=[0, 0.3, 0], grav=0.8),  # bọt trắng
    parts('shard', 0, 34, 7, 0.9, 0.8, 0.1, 'body', offset=[0, 0.3, 0], grav=10, tier=0),  # giọt nước bắn
], PW)

K = 2.25
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.5, 40), PW)
write(f'mon_boom_cone__{B}__sweep', [  # r18, mul 2,25
    decal('steel_crack', 0, 8, 2.4, 'core', 0.75, 0.04, top=False, untilDelay=False, sector=40, lift=LIFT),  # nền đá ướt sẫm
    *[sp('thuy_arc', 0.06 * i, 0.85, 9.5 + i, y=0.5, z=3.0, k=K, aim=True, to=(0, 14.5), erode=0.4, seed=1200 + i) for i in range(3)],  # lưỡi sóng quét ra theo quạt
    *[sp('thuy_wave', 0.04 + 0.03 * i, 0.8, 5.6, x=px, y=2.4, z=pz, k=K, alpha=0.95, erode=0.4, seed=1210 + i) for i, (px, pz) in enumerate([(-5.5, 10.5), (0.0, 13.5), (5.5, 10.5)])],
    sp('thuy_spray', 0.05, 0.5, 7.0, y=0.5, z=12.5, k=K, flat=True, erode=0.2, seed=1220),
    parts('dust', 0, 46, 6, 0.5, 1.0, 0.3, 'rim', offset=[0, 0.3 / K, 3 / K], grav=0.8),
    parts('shard', 0.02, 38, 8, 0.5, 0.8, 0.1, 'body', offset=[0, 0.5 / K, 5 / K], grav=9, tier=0),
], PW)

K = 4.0
write(f'mon_warn_line__{B}__line', warn_strip(2.0, 40, 6, spark=30), PW)
write(f'mon_boom_line__{B}__line', [  # r40 w6, mul 4 (kẹp)
    decal('steel_crack', 0, 1, 2.6, 'core', 0.8, 0.1, top=False, untilDelay=False, strip=[40, 6], lift=LIFT),
    *[sp('thuy_beam', 0.05 * i, 0.8, 13.0, y=1.0, x=(i % 2 - 0.5) * 1.5, z=4.0, k=K, aim=True, to=((i % 2 - 0.5) * 1.5, 34 - 3 * (i % 2)), erode=0.45, seed=1300 + i) for i in range(4)],
    *[sp('thuy_jet', 0.08 + 0.05 * i, 0.7, 3.6, x=(-3.2 if i % 2 == 0 else 3.2), y=1.6, z=8 + 8 * i, k=K, erode=0.35, seed=1310 + i) for i in range(4)],
    sp('thuy_spray', 0.2, 0.5, 8.0, y=0.5, z=36, k=K, flat=True, erode=0.2, seed=1320),
    parts('dust', 0, 60, 5, 0.5, 1.0, 0.3, 'rim', offset=[0, 0.3 / K, 10 / K], grav=0.8, tier=0),
    parts('shard', 0, 44, 8, 0.5, 0.8, 0.1, 'body', offset=[0, 0.4 / K, 14 / K], grav=9, tier=0),
], PW)

K = 1.0
write(f'mon_warn__{B}__chant', warn_circle(1.2, 70, -20, spark=24), PW)
write(f'mon_boom_circle__{B}__chant', [  # r8, mul 2
    decal('scorch', 0, 4, 2.8, 'core', 0.95, 0.03, top=False, untilDelay=False, lift=LIFT),
    sp('thuy_whirl', 0.0, 1.1, 8.0, y=0.4, flat=True, alpha=0.8, erode=0.4, seed=1400),  # xoáy hút vào tâm
    sp('thuy_foam_ring', 0.04, 0.95, 8.4, y=0.45, flat=True, alpha=0.7, erode=0.35, seed=1401),
    sp('thuy_spray', 0.02, 0.55, 5.4, y=0.5, flat=True, alpha=0.75, erode=0.15, seed=1402),
    sp('thuy_spout', 0.03, 0.85, 5.6, y=2.7, k=2.0, alpha=0.9, erode=0.4, seed=1403),
    *[sp('thuy_jet', 0.02 + i * 0.03, 0.65, 3.8, x=p[0], y=1.9, z=p[1], k=2.0, alpha=0.9, erode=0.3, seed=1404 + i) for i, p in enumerate(ring_pts(5, 5.4))],
    parts('dust', 0, 44, 4, 1, 1.0, 0.26, 'rim', offset=[0, 0.3, 0], grav=0.8),
    parts('shard', 0, 36, 5, 1, 0.9, 0.1, 'body', offset=[0, 0.3, 0], grav=8, tier=0),
], PW)

# ================= Kính Nguyệt Chân Quân (kim): lưỡi trăng khuyết bạc, vết trăng, mảnh băng nhỏ =================
B = 'boss_kinh_nguyet_chan_quan'
PK = 'mon_boss_kim'
write(f'mon_warn__{B}__slam', warn_circle(1.6, 35, -50), PK)
write(f'mon_boom_circle__{B}__slam', [  # r5, mul 1,25
    decal('steel_crack', 0, 4, 2.4, 'core', 0.85, 0.02, top=False, untilDelay=False, lift=LIFT),  # mặt gương tối
    sp('nguyet_scar', 0.0, 1.1, 7.6, y=0.4, flat=True, alpha=0.85, erode=0.4, seed=1500),  # vết trăng trên đất
    sp('nguyet_ring', 0.03, 0.9, 7.2, y=0.45, flat=True, alpha=0.75, erode=0.35, seed=1501),
    sp('nguyet_burst', 0.02, 0.6, 6.4, y=0.5, flat=True, alpha=0.85, erode=0.25, seed=1502),
    *[sp('nguyet_blade', 0.05 * i, 0.8, 5.6, x=p[0], y=1.5, z=p[1], k=1.25, alpha=1.0, erode=0.35, seed=1503 + i) for i, p in enumerate(ring_pts(3, 2.6, 0.9))],
    *[sp('nguyet_shards', 0.03 + 0.04 * i, 0.75, 3.8, x=p[0], y=1.2, z=p[1], k=1.25, alpha=0.95, erode=0.35, seed=1510 + i) for i, p in enumerate(ring_pts(2, 3.6, 2.2))],
    parts('shard', 0, 34, 6, 0.9, 0.8, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('spark', 0, 24, 5, 0.9, 0.8, 0.08, 'rim', offset=[0, 0.4, 0], grav=2, tier=0),
], PK)

K = 1.75
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.4, 35), PK)
write(f'mon_boom_cone__{B}__sweep', [  # r14, mul 1,75
    decal('steel_crack', 0, 8, 2.2, 'core', 0.85, 0.04, top=False, untilDelay=False, sector=35, lift=LIFT),
    *[sp('nguyet_blade', 0.06 * i, 0.85, 9.0 + i, y=0.8, z=2.5, k=K, aim=True, alpha=1.0, to=(0, 11.5), erode=0.4, seed=1600 + i) for i in range(3)],  # lưỡi trăng quét ra theo cung
    *[sp('nguyet_slash', 0.03 + 0.06 * i, 0.8, 11.0, y=0.6, z=2.0, k=K, aim=True, to=(0, 12.0), erode=0.4, seed=1610 + i) for i in range(2)],
    *[sp('nguyet_shards', 0.05 + 0.03 * i, 0.8, 3.4, x=px, y=1.1, z=pz, k=K, erode=0.4, seed=1620 + i) for i, (px, pz) in enumerate([(-4.5, 9.5), (0.0, 11.5), (4.5, 9.5)])],
    parts('shard', 0, 34, 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.5 / K, 0.8 / K], grav=4, tier=0),
    parts('spark', 0.04, 24, 4, 0.7, 0.8, 0.08, 'rim', offset=[0, 0.3 / K, 4 / K], grav=1.5, tier=0),
], PK)

K = 2.5
write(f'mon_warn_line__{B}__line', warn_strip(1.2, 20, 3), PK)
write(f'mon_boom_line__{B}__line', [  # r20 w3, mul 2,5
    decal('steel_crack', 0, 1, 2.4, 'core', 0.85, 0.04, top=False, untilDelay=False, strip=[20, 3], lift=LIFT),
    *[sp('nguyet_beam', 0.05 * i, 0.8, 9.0, y=0.9, z=3.0, k=K, aim=True, to=(0, 16.5 - i), alpha=1.0, erode=0.45, seed=1700 + i) for i in range(3)],
    *[sp('nguyet_slash', 0.04 + 0.06 * i, 0.8, 7.0, y=0.7, z=2.5, k=K, aim=True, to=(0, 15 - 2 * i), erode=0.4, seed=1710 + i) for i in range(2)],
    *[sp('nguyet_shards', 0.05 + 0.04 * i, 0.8, 3.0, x=(-1.6 if i % 2 == 0 else 1.6), y=1.0, z=6 + 5 * i, k=K, erode=0.4, seed=1720 + i) for i in range(3)],
    parts('shard', 0, 36, 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.4 / K, 7 / K], grav=6, tier=0),
    parts('spark', 0, 24, 5, 0.5, 0.8, 0.08, 'rim', offset=[0, 0.3 / K, 8 / K], grav=1.5, tier=0),
], PK)
print('ok')
