#!/usr/bin/env python3
"""A5 (Họa Pháp Lô 2): timeline riêng cho các chiêu của boss chương 4–5 (chuẩn HPL2: VẠCH BÁO ĐỎ chuẩn kẻ địch, THÂN hiệu ứng theo hệ, không đỏ/cam).
Đợt 1 (Thiên Khuyết): boss_thien_khuyet_thu_linh (thổ: line 20×4, slam r8, sweep quạt r14/40°, chant r16), boss_vo_dien_than_quan (thổ: sweep quạt r12/50°),
boss_tam_thu_nguc_khuyen (hỏa ám: sweep quạt r11/70°, chant r14, slam r7, line 26×4), boss_thu_khich_duc_chu (thổ: line 22×4, slam r4,5, sweep quạt r14/45°).
Sprite DÙNG LẠI theo hệ, không vẽ mới: thổ = nhóm `ham_*` (đá + khe hổ phách; KHÔNG dùng `tho_crack/tho_jade` vì ngọc lam lẫn hệ Lôi), hỏa ám = `lua_*` (lửa ma tím).
Quy ước cỡ như gen-fx-a2/a3/a4: vùng tròn `mul` = r/4, quạt/dải `mul` = r/8 (kẹp 0,5..4); sprite phẳng của vùng tròn viết cạnh 8 (k=1) để ra đường kính 2r; sprite dọc/quay mặt camera chia `k`.
Giữ độ phủ thấp (≤ 0,2 theo mặt nạ màu): ít sprite, đặt ở mép vùng, dư ba mỏng.
Chạy: python tools/vfx/gen-fx-a5.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35

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


def slam_boom(B, move, r, theme, seed):
    pal, sp_, dec = THEMES[theme]
    mul = clip(r / 4)
    # Vùng lớn (r ≥ 8): sprite phẳng/nền co lại để độ phủ không vượt trần (chant r16 từng phủ ~0,46): đường kính sprite tối đa ~20 m, nền mờ hơn.
    cap = min(1.0, 10.0 / r)
    fade = min(1.0, 11.0 / r)
    thin = theme == 'hoa' and r >= 10  # lửa ma vùng lớn: chỉ mạch/sét mảnh, không mảng đặc
    ev = [
        decal(dec, 0, 4, 2.2, 'core', round((0.12 if thin else 0.35) * fade, 2), 0.02, top=False, untilDelay=False, lift=LIFT),
        sp(sp_['crack'], 0.0, 1.1, round(8.0 * cap, 2), y=0.45, flat=True, alpha=round((0.45 if thin else 0.85) * (0.6 + 0.4 * fade), 2), erode=0.5, seed=seed),
        sp(sp_['dust'], 0.03, 1.0, round(8.2 * cap, 2), y=0.5, flat=True, alpha=round(0.3 * fade, 2), erode=0.4, seed=seed + 1),
        *[
            sp(sp_['spikes'], 0.03 + 0.04 * i, 0.95, 4.4, x=p[0] * r * 0.55, y=1.7, z=p[1] * r * 0.55, k=mul, alpha=1.0, erode=0.5, seed=seed + 2 + i)
            for i, p in enumerate(ring_pts(3, 1.0, 0.5))
        ],
        sp(sp_['debris'], 0.04, 0.9, 4.8, y=1.8, k=mul, alpha=0.9, erode=0.45, seed=seed + 6),
        parts('shard', 0, 22, 6, 0.9, 0.9, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
        parts('dust', 0, 16, 3.5, 0.9, 1.0, 0.22, 'body', offset=[0, 0.3, 0], grav=0.8),
    ]
    if thin:
        ev = [e for e in ev if not (e.get('sprite') in (sp_['dust'], sp_['debris']) and e.get('type') == 'mesh')]
        for e in ev:
            if e.get('sprite') == sp_['spikes']:
                e['alpha'] = 0.6
    write(f'mon_boom_circle__{B}__{move}', ev, pal)


def circle(B, move, r, delay, theme, seed, cast=False):
    pal, _, _ = THEMES[theme]
    if cast:
        write('mon_cast__' + B, [decal('rune', 0, r, 3.6, 'accent', 0.3, 0.35, ink=True, untilDelay=False, at='self')], pal)  # viền niệm mảnh, mờ
    write(f'mon_warn__{B}__{move}', warn_circle_soft(delay, r), pal)
    slam_boom(B, move, r, theme, seed)


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
    write(f'mon_warn_line__{B}__{move}', warn_strip_soft(delay, length, width), pal)
    write(
        f'mon_boom_line__{B}__{move}',
        [
            decal(dec, 0, 1, 2.2, 'core', 0.35, 0.06, top=False, untilDelay=False, strip=[length, width], lift=LIFT),
            # vệt nứt phẳng dọc dải hiện ngay lúc nổ (không chờ sprite trượt tới), cỡ theo bề rộng dải
            *[
                sp(sp_['crack'], 0.0 + 0.02 * i, 1.0, width * 2.6, y=0.45, z=length * (0.18 + 0.32 * i), k=k, flat=True, alpha=0.7, erode=0.5, seed=seed + 8 + i)
                for i in range(3)
            ],
            *[
                sp(sp_['ridge'], 0.04 * i, 0.9, 9.0, y=0.8, x=(i % 2 - 0.5) * 1.2, z=2.0, k=k, aim=True, to=((i % 2 - 0.5) * 1.2, length * (0.8 - 0.1 * (i % 2))), alpha=0.9, erode=0.5, seed=seed + i)
                for i in range(2)
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


# ================= Thiên Khuyết Thú Linh (thổ) =================
B = 'boss_thien_khuyet_thu_linh'
line(B, 'line', 20, 4, 1.8, 'tho', 4100)
circle(B, 'slam', 8, 1.5, 'tho', 4110)
cone(B, 'sweep', 14, 40, 1.5, 'tho', 4120)
circle(B, 'chant', 16, 1.2, 'tho', 4130, cast=True)

# ================= Vô Diện Thần Quân (thổ) =================
B = 'boss_vo_dien_than_quan'
cone(B, 'sweep', 12, 50, 1.5, 'tho', 4200)

# ================= Tam Thủ Ngục Khuyển (hỏa ám) =================
B = 'boss_tam_thu_nguc_khuyen'
cone(B, 'sweep', 11, 70, 1.2, 'hoa', 4300)
circle(B, 'chant', 14, 0.9, 'hoa', 4310, cast=True)
circle(B, 'slam', 7, 1.5, 'hoa', 4320)
line(B, 'line', 26, 4, 1.6, 'hoa', 4330)

# ================= Thử Khích Dục Chủ (thổ) =================
B = 'boss_thu_khich_duc_chu'
line(B, 'line', 22, 4, 1.3, 'tho', 4400)
circle(B, 'slam', 4.5, 1.3, 'tho', 4410)
cone(B, 'sweep', 14, 45, 1.3, 'tho', 4420)
print('ok')
