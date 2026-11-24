#!/usr/bin/env python3
"""A2 (Họa Pháp Lô 2): timeline riêng cho 7 chiêu của 2 boss chương 3 Vân Hải (concept đã duyệt, chỉ lấy HIỆU ỨNG, không vẽ hình cá voi):
Vân Hải Kình Vương (thủy: xoáy nước, sóng trắng viền bạc, xanh thẫm) — slam r7, sweep quạt r18/40°, line dải 40×6, chant r8;
Kính Nguyệt Chân Quân (kim: trăng khuyết bạc, mảnh gương/băng) — slam r5, sweep quạt r14/35°, line dải 20×3.
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo đỏ đặc vân nứt tô dần theo `delay`, đúng hitbox) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo hệ, KHÔNG đỏ/cam).
Chiêu niệm (chant) thêm `mon_cast__<quái>`. Không thêm nhị phân: nước/trăng dựng bằng hình thủ tục (ribbon/helix xoáy phẳng, ripple, crescent, kite, gust, decal scorch/rune/steel_crack tối) + hạt bọt/giọt.
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


def swirl(t, r, tone, seed, spin=260, rise=0.05, alpha=0.9, kind='ribbon', dur=1.1, scale_z=0.5):
    """Xoáy nước nằm phẳng trên mặt đất quay quanh tâm (ribbon/helix nằm ngang + spin)."""
    return mesh(kind, t, dur, tone, alpha, seed, offset=[0, rise, 0], rot=[-90, 0, 0], scale=[r, r, scale_z if kind == 'ribbon' else 2.8], sweep=0.6, erodeFrom=0.6,
                ragged=0.5, spin=spin, tier=0)


def foam_rings(n, t0, step, base, tone='rim', alpha=0.95, seed=300):
    """Vòng bọt trắng nở ra liên tiếp từ tâm (ripple, theo vùng)."""
    return [mesh('ripple', t0 + i * step, 0.55, tone if i % 2 == 0 else 'body', alpha, seed + i, scale=base + i * 0.06, scaleTo=1.04, fit='area', sweep=0.1, erodeFrom=0.5, ragged=0.5)
            for i in range(n)]


def jets(n, rad, h, t0, seed, tone='rim', step=0.025, w=0.45):
    """Tia nước bắn thẳng lên ở mép vùng (kite dựng đứng, nhọn hai đầu)."""
    out = []
    for i in range(n):
        a = i / n * math.tau + 0.2
        out.append(mesh('kite', t0 + i * step, 0.7, tone, 0.9, seed + i, offset=[round(math.cos(a) * rad, 2), 0.0, round(math.sin(a) * rad, 2)],
                        rot=[0, 0, 0], scale=[w, h * (0.8 + 0.4 * ((i * 7) % 3) / 2), w], sweep=0.15, erodeFrom=0.5, tier=0 if i % 2 == 0 else 1))
    return out


def moon_sweep(n, r, half, k, tone_a='rim', tone_b='body', seed=900, t0=0.0, size=5.0, spread=0.7):
    """Lưỡi trăng khuyết bạc quét ra theo cung (nằm phẳng, trượt từ chân boss tới ~r, hai lớp: lõi sáng + viền). `k` = hệ số `unmul` của vùng."""
    out = []
    for i in range(n):
        a = math.radians((i - (n - 1) / 2) * half * spread / max(1, n - 1) * 2)
        d0, d1 = 1.5, r * 0.85
        for j, tone in enumerate((tone_a, tone_b)):
            out.append(mesh('crescent', t0 + i * 0.05, 0.9, tone, 1.0 if j == 0 else 0.85, seed + i * 2 + j,
                            offset=[round(math.sin(a) * d0 / k, 3), round(0.35 / k, 3), round(math.cos(a) * d0 / k, 3)], rot=[-90, round(math.degrees(a), 1), 0],
                            scale=round((size - j * 0.7) * (0.8 + 0.2 * (i % 3)) / k, 3), sweep=0.15, erodeFrom=0.55,
                            move={'to': 'area', 'offset': [round(math.sin(a) * d1 / k, 3), round(0.35 / k, 3), round(math.cos(a) * d1 / k, 3)], 'ease': 'out'}, tier=0))
    return out


def ice_shards(n, r, t0, seed, k=1.0, h=0.9):
    """Mảnh băng/gương nhỏ nhô thẳng quanh vùng (spike nhỏ, nhọn)."""
    out = []
    for i in range(n):
        a = i / n * math.tau + 0.3
        d = r * (0.3 + 0.7 * ((i * 5) % 7) / 6)
        out.append(mesh('spike', t0 + i * 0.015, 0.8, 'rim', 1.0, seed + i, offset=[round(math.cos(a) * d / k, 3), 0, round(math.sin(a) * d / k, 3)], rot=[0, 0, 0],
                        scale=round(h * (0.5 + 0.5 * ((i * 3) % 4) / 3) / k, 3), sweep=0.15, erodeFrom=0.55, tier=0 if i % 2 == 0 else 1))
    return out


# ================= Vân Hải Kình Vương (thủy): XOÁY NƯỚC phẳng, vòng bọt trắng, tia nước bắn mép =================
B = 'boss_van_hai_kinh_vuong'
PW = 'mon_boss_thuy'
cast_ring(B, 8, PW)
write(f'mon_warn__{B}__slam', warn_circle(1.5, 35, -50), PW)
write(f'mon_boom_circle__{B}__slam', [  # r7: mul 1,75 (viết theo r=4)
    mesh('burst', 0, 0.16, 'rim', 0.34, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('scorch', 0, 4, 2.6, 'core', 0.95, 0.02, top=False, untilDelay=False, lift=LIFT),  # vũng nước sẫm
    decal('rune', 0, 3.6, 2.2, 'rim', 0.8, 0.25, top=False, untilDelay=False, ink=True, lift=0.36),  # vòng triện xoáy trắng
    swirl(0.0, 3.4, 'rim', 600, spin=260),
    swirl(0.05, 2.4, 'body', 610, spin=-300, rise=0.15),
    *foam_rings(4, 0.0, 0.07, 0.55, seed=620),
    *jets(10, 3.3, 2.2, 0.02, 640),
    parts('dust', 0, 40, 4, 0.9, 1.0, 0.26, 'rim', offset=[0, 0.3, 0], grav=0.8),  # bọt trắng
    parts('shard', 0, 34, 7, 0.9, 0.8, 0.1, 'body', offset=[0, 0.3, 0], grav=10, tier=0),  # giọt nước bắn
], PW)

write(f'mon_warn_cone__{B}__sweep', warn_fan(1.5, 40), PW)
write(f'mon_boom_cone__{B}__sweep', [  # r18, mul 2,25
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.6, 0.8], scale=1.5, billboard=True, sweep=0),
    decal('steel_crack', 0, 8, 2.4, 'core', 0.75, 0.04, top=False, untilDelay=False, sector=40, lift=LIFT),  # nền đá ướt sẫm (không vân băng)
    *unmul([
        *moon_sweep(5, 18, 40, 1.0, seed=660, size=6.5),  # đầu sóng cuộn trắng quét theo cung (crescent làm lưỡi sóng)
        *jets(8, 12, 2.6, 0.05, 680),
        parts('dust', 0, 46, 6, 0.5, 1.0, 0.3, 'rim', offset=[0, 0.3, 3], grav=0.8),
        parts('shard', 0.02, 38, 8, 0.5, 0.8, 0.1, 'body', offset=[0, 0.5, 5], grav=9, tier=0),
    ], 2.25),
], PW)

write(f'mon_warn_line__{B}__line', warn_strip(2.0, 40, 6, spark=30), PW)
write(f'mon_boom_line__{B}__line', [  # r40 w6, mul 4 (kẹp)
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.6, 1.0], scale=1.5, billboard=True, sweep=0),
    decal('steel_crack', 0, 1, 2.6, 'core', 0.8, 0.1, top=False, untilDelay=False, strip=[40, 6], lift=LIFT),
    *unmul([
        *[mesh('gust', 0.0 + i * 0.06, 0.8, at='area', offset=[round((i - 1) * 1.6, 3), 0.9, 2], scale=[2.4, 1.6, 14],
               tone='rim', alpha=0.9, seed=700 + i, move={'to': 'area', 'offset': [round((i - 1) * 1.6 / 4, 3), round(0.9 / 4, 3), round(36 / 4, 3)], 'ease': 'out'}, tier=0) for i in range(3)],  # tia nước nén lao dọc dải
        *moon_sweep(5, 40, 0, 4.0, seed=720, size=4.0, spread=0.0),
        parts('dust', 0, 60, 5, 0.5, 1.0, 0.3, 'rim', offset=[0, 0.3, 10], grav=0.8, tier=0),
        parts('shard', 0, 44, 8, 0.5, 0.8, 0.1, 'body', offset=[0, 0.4, 14], grav=9, tier=0),
    ], 4),
], PW)

write(f'mon_warn__{B}__chant', warn_circle(1.2, 70, -20, spark=24), PW)
write(f'mon_boom_circle__{B}__chant', [  # r8, mul 2
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.7, 0], scale=1.4, billboard=True, sweep=0),
    decal('scorch', 0, 4, 2.8, 'core', 0.95, 0.03, top=False, untilDelay=False, lift=LIFT),
    decal('rune', 0, 3.8, 2.4, 'rim', 0.8, 0.25, top=False, untilDelay=False, ink=True, lift=0.36),
    swirl(0.0, 3.6, 'rim', 740, spin=-260, dur=1.3),  # xoáy hút vào tâm
    swirl(0.05, 2.5, 'body', 750, spin=320, rise=0.15, dur=1.3),
    swirl(0.1, 1.4, 'rim', 760, spin=-380, rise=0.25, dur=1.3),
    *foam_rings(4, 0.0, 0.08, 0.5, seed=770),
    *jets(12, 3.4, 2.4, 0.03, 790),
    parts('dust', 0, 44, 4, 1, 1.0, 0.26, 'rim', offset=[0, 0.3, 0], grav=0.8),
    parts('shard', 0, 36, 5, 1, 0.9, 0.1, 'body', offset=[0, 0.3, 0], grav=8, tier=0),
], PW)

# ================= Kính Nguyệt Chân Quân (kim): LƯỠI TRĂNG khuyết bạc, vệt trăng, mảnh băng nhỏ =================
B = 'boss_kinh_nguyet_chan_quan'
PK = 'mon_boss_kim'
write(f'mon_warn__{B}__slam', warn_circle(1.6, 35, -50), PK)
write(f'mon_boom_circle__{B}__slam', [  # r5, mul 1,25
    mesh('burst', 0, 0.16, 'rim', 0.36, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('steel_crack', 0, 4, 2.4, 'core', 0.85, 0.02, top=False, untilDelay=False, lift=LIFT),  # mặt gương tối
    decal('rune', 0, 3.4, 2.2, 'rim', 0.85, 0.2, top=False, untilDelay=False, ink=True, lift=0.36),  # vết trăng trên đất
    *[mesh('crescent', 0.0 + i * 0.04, 1.0, 'rim' if i % 2 == 0 else 'body', 1.0, 760 + i, offset=[0, 0.3 + i * 0.05, 0], rot=[-90, i * 120, 0], scale=3.4 - i * 0.2, sweep=0.15,
           erodeFrom=0.6, spin=220 if i % 2 == 0 else -220, tier=0) for i in range(3)],  # ba lưỡi trăng khuyết xoay quanh tâm
    ripple(0, 'rim', 0.95, 2),
    *ice_shards(12, 3.0, 0.02, 780, h=1.0),
    parts('shard', 0, 34, 6, 0.9, 0.8, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('spark', 0, 24, 5, 0.9, 0.8, 0.08, 'rim', offset=[0, 0.4, 0], grav=2, tier=0),
], PK)

write(f'mon_warn_cone__{B}__sweep', warn_fan(1.4, 35), PK)
write(f'mon_boom_cone__{B}__sweep', [  # r14, mul 1,75
    mesh('burst', 0, 0.14, 'rim', 0.34, 0, offset=[0, 0.6, 0.8], scale=1.4, billboard=True, sweep=0),
    decal('steel_crack', 0, 8, 2.2, 'core', 0.85, 0.04, top=False, untilDelay=False, sector=35, lift=LIFT),
    decal('steel_crack', 0, 8, 1.6, 'rim', 0.3, 0.04, top=False, untilDelay=False, sector=35, lift=0.36),  # vệt trăng sáng mờ trên đất
    *unmul([
        *moon_sweep(4, 14, 35, 1.75, seed=800, size=6.0),  # lưỡi trăng khuyết bạc to quét ra theo cung
        *ice_shards(14, 11, 0.05, 820, k=1.75, h=1.0),
        parts('shard', 0, 34, 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.5, 0.8], grav=4, tier=0),
        parts('spark', 0.04, 24, 4, 0.7, 0.8, 0.08, 'rim', offset=[0, 0.3, 4], grav=1.5, tier=0),
    ], 1.75),
], PK)

write(f'mon_warn_line__{B}__line', warn_strip(1.2, 20, 3), PK)
write(f'mon_boom_line__{B}__line', [  # r20 w3, mul 2,5
    mesh('burst', 0, 0.14, 'rim', 0.34, 0, offset=[0, 0.6, 1.0], scale=1.4, billboard=True, sweep=0),
    decal('steel_crack', 0, 1, 2.4, 'core', 0.85, 0.04, top=False, untilDelay=False, strip=[20, 3], lift=LIFT),
    decal('steel_crack', 0, 1, 1.8, 'rim', 0.3, 0.04, top=False, untilDelay=False, strip=[20, 3], lift=0.36),
    *unmul([
        *moon_sweep(4, 20, 0, 2.5, seed=840, size=3.4, spread=0.0),  # lưỡi trăng bạc lao dọc dải
        *ice_shards(12, 8, 0.05, 860, k=2.5, h=0.9),
        parts('shard', 0, 36, 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.4, 7], grav=6, tier=0),
        parts('spark', 0, 24, 5, 0.5, 0.8, 0.08, 'rim', offset=[0, 0.3, 8], grav=1.5, tier=0),
    ], 2.5),
], PK)
print('ok')
