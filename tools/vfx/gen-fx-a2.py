#!/usr/bin/env python3
"""A2 (Họa Pháp Lô 2): timeline riêng cho 7 chiêu của 2 boss chương 3 Vân Hải (concept đã duyệt, chỉ lấy HIỆU ỨNG, không vẽ hình cá voi):
Vân Hải Kình Vương (thủy: xoáy nước, sóng trắng viền bạc, xanh thẫm) — slam r7, sweep quạt r18/40°, line dải 40×6, chant r8;
Kính Nguyệt Chân Quân (kim: trăng khuyết bạc, mảnh gương/băng) — slam r5, sweep quạt r14/35°, line dải 20×3.
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo đỏ đặc vân nứt tô dần theo `delay`, đúng hitbox) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo hệ, KHÔNG đỏ/cam).
Chiêu niệm (chant) thêm `mon_cast__<quái>`. Chỉ dùng texture đã có trong decal_atlas/flip_atlas (ice_*, steel_*), không thêm nhị phân.
Hệ số `mul` của runner: vùng tròn = r/4 (decal r4, vị trí/cỡ viết theo r=4); quạt/dải = r/8 (kẹp 0,5..4) nên mesh/hạt dùng `unmul` để đúng mét thật.
Chạy: python tools/vfx/gen-fx-a2.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35


def fan_flips(tex, n, r, half, t0, seed0, scale, h=0.9):
    """Flipbook rải theo quạt (mét thật) từ chân boss ra tới ~r, lệch góc ±half·0,45."""
    out = []
    for i in range(n):
        d = 2.2 + (r - 3.5) * i / max(1, n - 1)
        a = math.radians((i % 3 - 1) * half * 0.45)
        out.append(flip(tex, t0 + i * 0.03, math.sin(a) * d, math.cos(a) * d, scale + (i % 3) * 0.2, seed0 + i, h=h, tier=0 if i % 2 == 0 else 1))
    return out


def crescents(n, r, half, tone, seed, t0=0.0, step=0.04, scale=1.4):
    """Vệt trăng khuyết nằm trên đất, nối nhau ra xa theo quạt (mét thật)."""
    out = []
    for i in range(n):
        d = 3.0 + (r - 4.5) * i / max(1, n - 1)
        a = math.radians((i % 3 - 1) * half * 0.3)
        out.append(mesh('crescent', t0 + i * step, 0.8, tone, 0.95, seed + i, offset=[round(math.sin(a) * d, 2), 0.3, round(math.cos(a) * d, 2)],
                        rot=[-90, 0, 0], scale=scale + (i % 3) * 0.25, sweep=0.2, erodeFrom=0.55, tier=0 if i % 2 == 0 else 1))
    return out


# ================= Vân Hải Kình Vương (thủy): xoáy nước, sóng trắng, xanh thẫm =================
B = 'boss_van_hai_kinh_vuong'
PW = 'mon_boss_thuy'
cast_ring(B, 8, PW)
write(f'mon_warn__{B}__slam', warn_circle(1.5, 35, -50), PW)
write(f'mon_boom_circle__{B}__slam', [  # r7: mul 1,75 (viết theo r=4)
    mesh('burst', 0, 0.16, 'rim', 0.34, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('ice_crack', 0, 4, 2.4, 'core', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),  # mặt nước tối, lõi xoáy
    ripple(0, 'rim', 0.95, 2),
    ripple(0.06, 'body', 0.85, 3, s0=0.5, s1=0.85),
    mesh('helix', 0, 0.9, 'rim', 0.9, 5, offset=[0, 0, 0], scale=1.1, sweep=0.2, erodeFrom=0.55),  # cột nước xoáy giữa vùng
    *flip_ring('ice_flip', 7, 2.7, 0.0, 1.8, 600),
    flip('ice_flip', 0.0, 0, 0, 2.2, 609, h=1.1),
    parts('dust', 0, 26, 3.5, 0.9, 1.0, 0.24, 'rim', offset=[0, 0.3, 0], grav=0.8),  # bọt trắng
    parts('shard', 0, 22, 6, 0.9, 0.7, 0.1, 'body', offset=[0, 0.3, 0], grav=9, tier=0),  # giọt nước xanh
], PW)

write(f'mon_warn_cone__{B}__sweep', warn_fan(1.5, 40), PW)
write(f'mon_boom_cone__{B}__sweep', [  # r18, mul 2,25
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.6, 0.8], scale=1.5, billboard=True, sweep=0),
    decal('ice_crack', 0, 8, 2.4, 'core', 1.0, 0.04, top=False, untilDelay=False, sector=40, lift=LIFT),
    *unmul([
        *fan_flips('ice_flip', 9, 18, 40, 0.0, 620, 1.9),
        *crescents(6, 18, 40, 'rim', 640),  # đầu sóng trắng bạc quét theo quạt
        parts('dust', 0, 30, 6, 0.5, 1.0, 0.26, 'rim', offset=[0, 0.3, 3], grav=0.8),
        parts('shard', 0.02, 30, 7, 0.5, 0.7, 0.1, 'body', offset=[0, 0.5, 5], grav=8, tier=0),
    ], 2.25),
], PW)

write(f'mon_warn_line__{B}__line', warn_strip(2.0, 40, 6, spark=30), PW)
write(f'mon_boom_line__{B}__line', [  # r40 w6, mul 4 (kẹp)
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.6, 1.0], scale=1.5, billboard=True, sweep=0),
    decal('ice_crack', 0, 1, 2.6, 'core', 1.0, 0.1, top=False, untilDelay=False, strip=[40, 6], lift=LIFT),
    decal('ice_crack', 0, 1, 2.6, 'body', 0.9, 0.1, top=False, untilDelay=False, strip=[40, 6], lift=0.36),
    *unmul([
        *flip_line('ice_flip', 14, 40, 0.0, 1.5, 660, step=0.02, jitter=1.4),
        rift(40, 1.2, tone='rim', seed=80),  # tia nước nén: khe sáng viền trắng dọc dải
        *crescents(6, 40, 0, 'rim', 680, step=0.03, scale=1.6),
        parts('dust', 0, 50, 5, 0.5, 1.0, 0.3, 'rim', offset=[0, 0.3, 10], grav=0.8, tier=0),
        parts('shard', 0, 36, 8, 0.5, 0.7, 0.1, 'body', offset=[0, 0.4, 14], grav=8, tier=0),
    ], 4),
], PW)

write(f'mon_warn__{B}__chant', warn_circle(1.2, 70, -20, spark=24), PW)
write(f'mon_boom_circle__{B}__chant', [  # r8, mul 2
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.7, 0], scale=1.4, billboard=True, sweep=0),
    decal('ice_crack', 0, 4, 2.8, 'core', 1.0, 0.03, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'rim', 0.95, 2),
    mesh('helix', 0, 1.0, 'rim', 0.9, 7, offset=[0, 0, 0], scale=1.2, sweep=0.2, erodeFrom=0.55),  # xoáy hút vào tâm
    *flip_ring('ice_flip', 9, 3.2, 0.0, 2.0, 700),
    *flip_ring('ice_flip', 5, 1.5, 0.05, 1.7, 710),
    parts('dust', 0, 32, 4, 1, 1.0, 0.26, 'rim', offset=[0, 0.3, 0], grav=0.8),
    parts('shard', 0, 28, 5, 1, 0.8, 0.1, 'body', offset=[0, 0.3, 0], grav=6, tier=0),
], PW)

# ================= Kính Nguyệt Chân Quân (kim): trăng khuyết bạc, mảnh gương/băng =================
B = 'boss_kinh_nguyet_chan_quan'
PK = 'mon_boss_kim'
write(f'mon_warn__{B}__slam', warn_circle(1.6, 35, -50), PK)
write(f'mon_boom_circle__{B}__slam', [  # r5, mul 1,25
    mesh('burst', 0, 0.16, 'rim', 0.36, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('steel_crack', 0, 4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),  # mặt gương nứt tỏa từ tâm
    ripple(0, 'rim', 0.95, 2),
    *flip_ring('steel_flip', 7, 2.6, 0.0, 1.8, 720),
    *ring_mesh('spike', 10, 3.1, 740, 0.6, tone='rim'),  # trăm mảnh gương/băng nhô quanh vùng
    mesh('crescent', 0.02, 0.8, 'rim', 0.95, 760, offset=[0, 0.3, 0], rot=[-90, 0, 0], scale=2.2, sweep=0.2, erodeFrom=0.55),
    parts('shard', 0, 30, 6, 0.9, 0.7, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('spark', 0, 22, 5, 0.9, 0.8, 0.08, 'rim', offset=[0, 0.4, 0], grav=2, tier=0),
], PK)

write(f'mon_warn_cone__{B}__sweep', warn_fan(1.4, 35), PK)
write(f'mon_boom_cone__{B}__sweep', [  # r14, mul 1,75
    mesh('burst', 0, 0.14, 'rim', 0.34, 0, offset=[0, 0.6, 0.8], scale=1.4, billboard=True, sweep=0),
    decal('steel_crack', 0, 8, 2.2, 'body', 1.0, 0.04, top=False, untilDelay=False, sector=35, lift=LIFT),
    *unmul([
        *crescents(7, 14, 35, 'rim', 780, scale=1.5),  # vệt trăng khuyết bạc quét ra
        *fan_flips('steel_flip', 6, 14, 35, 0.0, 800, 1.6),
        parts('shard', 0, 30, 8, 0.4, 0.6, 0.1, 'rim', offset=[0, 0.5, 0.8], grav=4, tier=0),
        parts('spark', 0.04, 20, 4, 0.7, 0.8, 0.08, 'rim', offset=[0, 0.3, 4], grav=1.5, tier=0),
    ], 1.75),
], PK)

write(f'mon_warn_line__{B}__line', warn_strip(1.2, 20, 3), PK)
write(f'mon_boom_line__{B}__line', [  # r20 w3, mul 2,5
    mesh('burst', 0, 0.14, 'rim', 0.34, 0, offset=[0, 0.6, 1.0], scale=1.4, billboard=True, sweep=0),
    decal('steel_crack', 0, 1, 2.4, 'body', 1.0, 0.04, top=False, untilDelay=False, strip=[20, 3], lift=LIFT),
    decal('steel_crack', 0, 1, 2.4, 'rim', 0.8, 0.04, top=False, untilDelay=False, strip=[20, 3], lift=0.36),
    *unmul([
        rift(20, 0.8, tone='rim', seed=90),  # tia phản chiếu bạc-xanh cắt thẳng
        *flip_line('steel_flip', 9, 20, 0.0, 1.2, 820, step=0.025, jitter=0.9),
        *crescents(5, 20, 0, 'rim', 840, step=0.03, scale=1.2),
        parts('shard', 0, 34, 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.4, 7], grav=6, tier=0),
        parts('spark', 0, 22, 5, 0.5, 0.8, 0.08, 'rim', offset=[0, 0.3, 8], grav=1.5, tier=0),
    ], 2.5),
], PK)
print('ok')
