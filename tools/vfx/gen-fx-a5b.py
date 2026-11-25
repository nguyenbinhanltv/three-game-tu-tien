#!/usr/bin/env python3
"""A5 đợt 2 (Họa Pháp Lô 2): timeline riêng cho 4 boss + 6 tinh anh chương 4–5 (chuẩn HPL2: VẠCH BÁO ĐỎ chuẩn kẻ địch mỏng, THÂN hiệu ứng theo hệ, không đỏ/cam).
Boss: Tàn Hỏa Kiếm Cơ (hỏa ám), Kim Đả Ma Hầu (kim/xương), Xích Tàn Cự Khôi (thổ), Từ Nhân Ma Tướng (hỏa ám).
Tinh anh: Hồi Giác Cự Thú (thổ), Dạ Minh Lộc Vương (thủy), Cốt Kiếm Thông Linh và Tt Cốt Kiếm (kim), Thạch Tượng Đại Tướng (thổ), Huyết Giác Ma Tướng (hỏa ám).
Sprite DÙNG LẠI theo hệ, không vẽ mới (`ham_*`, `lua_*`, `cot_*`, `thuy_*`). Quy ước cỡ và độ phủ như gen-fx-a5.py (vùng tròn mul = r/4, quạt/dải mul = r/8; vùng rộng r≥8 không có màn bụi phẳng).
Chạy: python tools/vfx/gen-fx-a5b.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35

# Sprite xương trắng (`cot_*`) và nước (`thuy_*`) sáng/đặc hơn đá và lửa tím: giảm độ đậm sprite theo bảng màu để không phủ dày (độ phủ ≤ ~0,2).
GAIN = {'mon_kim': 0.35, 'mon_thuy': 0.32}
# Tinh anh trần độ phủ 0,2 (boss lớn 0,35): thu sprite của hai tinh anh thổ có dải dài.
GAIN_MON = {'elite_hoi_giac_cu_thu': 0.6, 'elite_thach_tuong_dai_tuong': 0.6}
_write = write


def write(name, events, pal):  # noqa: F811
    g = GAIN.get(pal) or next((v for k, v in GAIN_MON.items() if k in name), None)
    if g:
        for e in events:
            if e.get('type') == 'mesh' and 'alpha' in e:
                e['alpha'] = round(e['alpha'] * g, 2)
    _write(name, events, pal)

THEMES = {
    # hệ → (palette timeline, tên sprite, decal nền tối)
    'tho': (
        'mon_tho_pk',
        dict(crack='ham_crack', spikes='ham_spikes', dust='ham_dust', pillar='ham_pillar', debris='ham_debris', ridge='ham_ridge'),
        'jade_crack',
    ),
    'hoa': (
        'mon_hoa_am',
        dict(crack='lua_scar', spikes='lua_plume', dust='lua_smoke', pillar='lua_plume', debris='lua_embers', ridge='lua_lick'),
        'bolt_scorch',
    ),
    # kim/xương: sprite `cot_*` (xương trắng ngà, như A3)
    'kim': (
        'mon_kim',
        dict(crack='cot_crack', spikes='cot_claw', dust='cot_dust', pillar='cot_burst', debris='cot_frags', ridge='cot_swipe'),
        'steel_crack',
    ),
    # thủy: sprite `thuy_*` (như A2)
    'thuy': (
        'mon_thuy',
        dict(crack='thuy_whirl', spikes='thuy_jet', dust='thuy_spray', pillar='thuy_spout', debris='thuy_wave', ridge='thuy_beam'),
        'ice_crack',
    ),
}


def clip(x, lo=0.5, hi=4.0):
    return max(lo, min(hi, x))


def soft(r):
    """Độ đậm vạch báo theo cỡ vùng: viền sáng + nền đỏ trong suốt ≤ ~25% (vùng lớn mỏng hơn để không phủ kín khung)."""
    big = r >= 10
    return (0.2, 0.15) if big else (0.3, 0.22)


def warn_circle_soft(delay, r, yaw_a=35, yaw_b=-50, spark=12):
    # Vùng tròn phủ cả đĩa nên hai lớp chồng cộng lại: tổng ≤ ~0,32 (vùng lớn ≤ ~0,24), nền lấp dần chỉ thêm một chút.
    a, b = (0.16, 0.08) if r >= 10 else (0.22, 0.10)
    return [
        decal('warn_crack', 0, 4, 2, 'accent', a, 0.04, yaw=yaw_b),
        decal('warn_crack', 0, 4, 2, 'accent', b, delay, yaw=yaw_a, growUntilDelay=True),
        parts('spark', 0, spark, 1.7, 1, 0.9, 0.09, 'accent', inward=True, offset=[0, 0.2, 0]),
    ]


def warn_fan_soft(delay, half, r, spark=14):
    a, b = soft(r)
    return [
        decal('warn_crack', 0, 8, 2, 'accent', a, 0.04, sector=half),
        decal('warn_crack', 0, 8, 2, 'accent', b, delay, sector=half, growUntilDelay=True),
        parts('spark', 0, spark, 2.2, 0.5, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, 3]),
    ]


def warn_strip_soft(delay, length, width, spark=14):
    a, b = soft(8)
    return [
        decal('warn_crack', 0, 1, 2, 'accent', a, 0.04, strip=[length, width]),
        decal('warn_crack', 0, 1, 2, 'accent', b, delay, strip=[length, width], growUntilDelay=True),
        parts('spark', 0, spark, 2.2, 0.4, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, length * 0.3]),
    ]


def slam_boom(B, move, r, theme, seed, ground=False):
    pal, sp_, dec = THEMES[theme]
    mul = clip(r / 4)
    # Vùng lớn (r ≥ 8): sprite phẳng/nền co lại để độ phủ không vượt trần (chant r16 từng phủ ~0,46): đường kính sprite tối đa ~20 m, nền mờ hơn.
    cap = min(1.0, 10.0 / r) * (0.7 if theme in ('kim', 'thuy') else 1.0)  # kim/thủy: sprite phẳng nhỏ lại (đĩa đặc che cả vùng)
    fade = min(1.0, 11.0 / r)
    lite = theme in ('kim', 'thuy')  # kim/thủy: chỉ điểm nhấn (gai, mảnh vỡ, hạt) + vân nhỏ, bỏ đĩa tô đặc phủ cả vùng hitbox
    wide = r >= 8  # vùng rộng: bỏ màn bụi phẳng, bụi hạt ít và thấp (màn bụi làm mờ cả nhân vật)
    thin = theme == 'hoa' and r >= 10  # lửa ma vùng lớn: chỉ mạch/sét mảnh, không mảng đặc
    ev = [
        decal(dec, 0, 4, 2.2, 'core', round((0.12 if thin else 0.35) * fade, 2), 0.02, top=False, untilDelay=False, lift=LIFT),
        sp(sp_['crack'], 0.0, 1.1, round(8.0 * cap, 2), y=0.45, flat=True, alpha=round((0.45 if thin else 0.85) * (0.6 + 0.4 * fade), 2), erode=0.5, seed=seed),
        *([] if wide else [sp(sp_['dust'], 0.03, 1.0, round(8.2 * cap, 2), y=0.5, flat=True, alpha=round(0.3 * fade, 2), erode=0.4, seed=seed + 1)]),
        *[
            sp(sp_['spikes'], 0.03 + 0.04 * i, 0.95, 4.4, x=p[0] * r * 0.55, y=1.7, z=p[1] * r * 0.55, k=mul, alpha=1.0, erode=0.5, seed=seed + 2 + i)
            for i, p in enumerate(ring_pts(3, 1.0, 0.5))
        ],
        sp(sp_['debris'], 0.04, 0.9, 4.8, y=1.8, k=mul, alpha=0.9, erode=0.45, seed=seed + 6),
        parts('shard', 0, 22, 6, 0.9, 0.9, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
        parts('dust', 0, 6 if wide else 16, 2.0 if wide else 3.5, 0.7 if wide else 0.9, 1.0, 0.18 if wide else 0.22, 'body', offset=[0, 0.3, 0], grav=0.8),
    ]
    if lite:
        ev = [e for e in ev if not (e.get('sprite') == sp_['dust'] and e.get('type') == 'mesh')]
        for e in ev:
            if e.get('sprite') == sp_['crack']:
                e['scale'] = round(e['scale'] * 0.45, 3)
                e['scaleTo'] = round(e['scaleTo'] * 0.45, 3)
    if thin:
        ev = [e for e in ev if not (e.get('sprite') in (sp_['dust'], sp_['debris']) and e.get('type') == 'mesh')]
        for e in ev:
            if e.get('sprite') == sp_['spikes']:
                e['alpha'] = 0.6
    if ground:
        # Thân boss rất lớn che vùng nổ: lớp nổ chính là decal đất vẽ ĐÈ (top), sprite chỉ điểm nhấn.
        ev[0] = decal(dec, 0, 4, 1.6, 'body', 0.55, 0.02, top=True, untilDelay=False, lift=LIFT)
        for e in ev:
            if e.get('type') == 'mesh':
                e['alpha'] = round(e['alpha'] * 0.6, 2)
    write(f'mon_boom_circle__{B}__{move}', ev, pal)


def circle(B, move, r, delay, theme, seed, cast=False, ground=False):
    pal, _, _ = THEMES[theme]
    if cast:
        write('mon_cast__' + B, [decal('rune', 0, r, 3.6, 'accent', 0.3, 0.35, ink=True, untilDelay=False, at='self')], pal)  # viền niệm mảnh, mờ
    write(f'mon_warn__{B}__{move}', warn_circle_soft(delay, r), pal)
    slam_boom(B, move, r, theme, seed, ground)


def cone(B, move, r, half, delay, theme, seed):
    pal, sp_, dec = THEMES[theme]
    k = clip(r / 8)
    write(f'mon_warn_cone__{B}__{move}', warn_fan_soft(delay, half, r), pal)
    reach = r * 0.55
    side = math.sin(math.radians(half * 0.7)) * r * 0.55
    write(
        f'mon_boom_cone__{B}__{move}',
        [
            decal(dec, 0, 8, 2.0, 'core', 0.3, 0.04, top=False, untilDelay=False, sector=half, lift=LIFT),
            sp(sp_['crack'], 0.0, 1.0, 6.4, y=0.45, z=r * 0.4, k=k, flat=True, alpha=0.7, erode=0.45, seed=seed),
            *[
                sp(sp_['spikes'], 0.03 + 0.04 * i, 1.0, 4.0, x=px * side, y=1.6, z=r * 0.55, k=k, alpha=1.0, erode=0.5, seed=seed + 1 + i)
                for i, px in enumerate((-1, 1))
            ],
            sp(sp_['ridge'], 0.02, 1.0, 8.0, y=0.7, z=r * 0.18, k=k, aim=True, to=(0, reach), alpha=0.8, erode=0.5, seed=seed + 4),
            sp(sp_['debris'], 0.05, 0.9, 4.4, y=1.7, z=r * 0.5, k=k, alpha=0.8, erode=0.45, seed=seed + 5),
            parts('shard', 0, 22, 6, 0.5, 1.0, 0.1, 'rim', offset=[0, 0.5 / k, 3 / k], grav=8, tier=0),
            parts('dust', 0, 14, 4, 0.5, 1.2, 0.2, 'body', offset=[0, 0.3 / k, 3 / k], grav=0.8),
        ],
        pal,
    )


def line(B, move, length, width, delay, theme, seed):
    pal, sp_, dec = THEMES[theme]
    k = clip(length / 8)
    lite = theme in ('kim', 'thuy')  # kim/thủy: ít sprite lớn (1 vệt quét thay 2, vân nhỏ hơn)
    write(f'mon_warn_line__{B}__{move}', warn_strip_soft(delay, length, width), pal)
    write(
        f'mon_boom_line__{B}__{move}',
        [
            decal(dec, 0, 1, 2.2, 'core', 0.35, 0.06, top=False, untilDelay=False, strip=[length, width], lift=LIFT),
            # vệt nứt phẳng dọc dải hiện ngay lúc nổ (không chờ sprite trượt tới), cỡ theo bề rộng dải
            *[
                sp(sp_['crack'], 0.0 + 0.02 * i, 1.0, width * (1.6 if lite else 2.6), y=0.45, z=length * (0.18 + 0.32 * i), k=k, flat=True, alpha=0.7, erode=0.5, seed=seed + 8 + i)
                for i in range(3)
            ],
            *[
                sp(sp_['ridge'], 0.04 * i, 0.9, 6.5 if lite else 9.0, y=0.8, x=(i % 2 - 0.5) * 1.2, z=2.0, k=k, aim=True, to=((i % 2 - 0.5) * 1.2, length * (0.8 - 0.1 * (i % 2))), alpha=0.9, erode=0.5, seed=seed + i)
                for i in range(1 if lite else 2)
            ],
            *[
                sp(sp_['spikes'], 0.01 + 0.025 * i, 0.9, 4.0, x=(-width * 0.55 if i % 2 == 0 else width * 0.55), y=1.6, z=length * (0.22 + 0.2 * i), k=k, alpha=1.0, erode=0.45, seed=seed + 4 + i)
                for i in range(4)
            ],
            parts('shard', 0, 26, 7, 0.4, 1.0, 0.1, 'rim', offset=[0, 0.4 / k, length * 0.3 / k], grav=7, tier=0),
            parts('dust', 0, 18, 4, 0.5, 1.2, 0.22, 'body', offset=[0, 0.3 / k, length * 0.3 / k], grav=0.8),
        ],
        pal,
    )


# ================= Tàn Hỏa Kiếm Cơ (hỏa ám) =================
B = 'boss_tan_hoa_kiem_co'
cone(B, 'sweep', 9, 40, 1.2, 'hoa', 5100)
line(B, 'charge', 16, 3, 1.0, 'hoa', 5110)
line(B, 'line', 14, 3.5, 1.3, 'hoa', 5120)
circle(B, 'leap', 5, 1.2, 'hoa', 5130)

# ================= Kim Đả Ma Hầu (kim/xương) =================
B = 'boss_kim_da_ma_hau'
circle(B, 'slam', 8, 1.3, 'kim', 5200)
circle(B, 'chant', 12, 1.0, 'kim', 5210, cast=True)
line(B, 'line', 24, 4, 1.4, 'kim', 5220)

# ================= Xích Tàn Cự Khôi (thổ) =================
B = 'boss_xich_tan_cu_khoi'
circle(B, 'slam', 5, 1.4, 'tho', 5300, ground=True)

# ================= Từ Nhân Ma Tướng (hỏa ám) =================
B = 'boss_tu_nhan_ma_tuong'
line(B, 'line', 20, 3.5, 1.2, 'hoa', 5400)
line(B, 'sweep', 20, 3.5, 2.0, 'hoa', 5410)

# ================= Tinh anh =================
B = 'elite_hoi_giac_cu_thu'
circle(B, 'leap', 5, 1.5, 'tho', 5500)
line(B, 'line', 10, 4, 1.4, 'tho', 5510)

B = 'elite_da_minh_loc_vuong'
circle(B, 'caster', 6, 1.3, 'thuy', 5600)
line(B, 'charge', 14, 2, 1.0, 'thuy', 5610)

B = 'elite_cot_kiem_thong_linh'
line(B, 'line', 10, 3, 1.1, 'kim', 5700)
circle(B, 'leap', 3.5, 1.0, 'kim', 5710)

B = 'elite_thach_tuong_dai_tuong'
cone(B, 'caster', 7, 30, 1.1, 'tho', 5800)
line(B, 'line', 14, 3, 1.2, 'tho', 5810)

B = 'elite_tt_cot_kiem'
line(B, 'charge', 12, 3, 1.2, 'kim', 5900)
line(B, 'line', 12, 3, 1.2, 'kim', 5910)

B = 'elite_kd_huyet_giac_ma_tuong'
line(B, 'charge', 14, 3, 1.0, 'hoa', 6000)
line(B, 'line', 9, 3.5, 1.2, 'hoa', 6010)
print('ok')
