# VFX Lôi tu (TN-9 PR3): 6 timeline riêng (Lôi Ấn Kích, Cửu Tiêu Thiên Lôi, Phích Lịch Tuyến, Lôi Võng, Lôi Phạt, Lôi Hải).
#   python tools/vfx/recipes_loi.py [id chiêu ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `loi_tu` (paths.json): core tím đen, body tím điện, rim trắng xanh, accent vàng chớp. SÉT BA TẦNG MÀU:
#   tầng tối (decal `scorch` + `crack` tone shadow/core: vết cháy và nứt để sét nổi trên đá sáng) → tầng thân tím điện (`body`, tia + sóng xung)
#   → tầng sáng (`rim` trắng xanh lõi tia, `accent` vàng chớp ở điểm đánh).
# Sét = tia `slash_thin` (mảnh, dài) bay theo hướng rơi/đường chém, hai ba tia lệch nhau để ra nét rẽ nhánh; điểm đánh có decal `strike`.
# Tránh che camera/nhân vật/mục tiêu (bài học Cổ Thần/Đao tu): tia rơi từ trên cao và khối đứng có `camFade`, không phủ màu lên thân, sóng xung nhỏ
# sát đất; hiệu ứng ngắn thì kéo dài đủ lâu (≥ 0,5 s sau lúc trúng) vì ảnh chụp có độ trễ.
# Chiêu của tư thế (Lôi Chích/Liên/Giáp) mượn hình chiêu nền; chiêu lướt (Thiểm Lôi Bộ) không có timeline. Ngân sách: mỗi mốc ≤ 12 draw, cả chiêu ≤ 25.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, mesh, parts, shake, slow, snd, stop, vig, write  # noqa: E402
from recipes_dao import embers  # noqa: E402
from recipes_cothan import dark_ground, ring_wave  # noqa: E402

R = {}


def bolt(t, at, dx, dz, h=9.0, dur=0.34, w=1.0, tone='rim', seed=1, y_end=0.4, cf=True, lag=0.0, alpha=1.0):
    """Một tia sét rơi từ độ cao h xuống điểm (dx, dz) quanh `at`; tia mảnh dài, mũi quay theo hướng rơi."""
    return mesh('slash_thin', t, dur, at=at, offset=[dx, h, dz], scale=[w, w, 5.5], sweep=0.15, erodeFrom=0.55, ragged=0.9, shadow=False,
                move={'to': at, 'offset': [dx + lag, y_end, dz], 'ease': 'in'}, tone=tone, alpha=alpha, camFade=cf, tier=0, seed=seed)


def forked_bolt(t, at, dx, dz, h=9.0, dur=0.34, seed=1, cf=True):
    """Ba tầng màu của sét: viền tối rộng (core, tím đen) → thân tím-lam (body) → lõi trắng xanh mảnh (rim), lệch nhau cho nét rẽ nhánh."""
    return [
        bolt(t, at, dx, dz, h, dur, 1.5, 'body', seed, cf=cf, lag=0.6),
        bolt(t + 0.01, at, dx, dz, h, dur, 1.0, 'rim', seed + 1, cf=cf),
        bolt(t - 0.005, at, dx, dz, h, dur, 2.6, 'core', seed + 2, cf=cf, lag=0.3, alpha=0.8),
    ]


def strike(t, at, r, dur=2.2, offset=None):
    """Điểm đánh: decal `strike` (vệt chớp trên đất) + vết cháy tối bên dưới."""
    o = offset or [0, 0, 0]
    return [decal('strike', t, r, dur, at=at, offset=o, grow=0.1, tone='accent', alpha=1, tier=0)]


# --------------------------------------------------------------------------------------------------------------------------------
def loi_an_kich():
    """Lôi Ấn Kích (đặc trưng, hit 0,3): tia sét lao thẳng tới mục tiêu rồi đánh xuống, khắc ấn; sóng xung + vệt chớp + nứt, giữ ≥ 0,6 s."""
    ev = [
        parts('spark', -0.3, 22, 1.4, 1, 0.28, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'cast', 0.5, 1.1),
        # ba tia lệch nhau lao tới mục tiêu
        mesh('slash_thin', -0.16, 0.3, at='ahead', offset=[0, 0.9, 0.5], rot=[0, 0, 6], scale=[1.5, 1.5, 5.0], sweep=0.2, erodeFrom=0.5, ragged=0.9, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='body', alpha=1, tier=0, seed=2),
        mesh('slash_thin', -0.15, 0.28, at='ahead', offset=[0, 0.95, 0.5], rot=[0, 0, -8], scale=[1.0, 1.0, 5.5], sweep=0.2, erodeFrom=0.5, ragged=0.8, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='rim', alpha=1, tier=0, seed=6),
        mesh('slash_thin', -0.13, 0.26, at='ahead', offset=[0, 0.85, 0.5], rot=[0, 0, 22], scale=[0.6, 0.6, 4.5], sweep=0.2, erodeFrom=0.5, ragged=1.0, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='accent', alpha=0.95, tier=1, seed=9),
        snd(-0.1, 'slash', 0.5, 1.3, 0.06),
        # sét đánh xuống ngay đầu mục tiêu (nổ ra ở mốc trúng)
        *forked_bolt(-0.08, 'target', 0.0, 0.0, h=7.0, dur=0.3, seed=11),
        snd(0.0, 'crit', 0.7, 1.0),
        mesh('slash_cross', 0.0, 0.7, at='target', offset=[0, 1.0, 0], rot=[0, 0, 12], scale=2.4, scaleTo=3.0, sweep=0.3, erodeFrom=0.5, shadow=False, tone='accent', alpha=0.95, seed=3, tier=0),
        flip('spark_burst', 0.0, 0.5, 3.4, at='target', offset=[0, 1.0, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 1.0, 0], scale=2.6, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        ring_wave(0.0, 'ground', 0.6, 4.0, 0.7, tone='body', alpha=0.9, seed=3),
        ring_wave(0.07, 'ground', 0.5, 3.0, 0.7, tone='rim', alpha=0.7, seed=4),
        mesh('crack_radial', 0.02, 1.4, at='ground', scale=3.4, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        flip('dust_kick', 0.03, 0.9, 2.8, at='ground', offset=[0, 0.5, 0], alpha=0.6, tone='core', tier=1),
    ]
    ev += strike(0.0, 'target', 3.4, 1.6)
    ev += dark_ground(0.02, 'ground', 2.8)
    ev += [parts('spark', 0.0, 70, 9, 1, 0.5, 0.09, at='target', offset=[0, 1.0, 0], tone='rim', tier=0)]
    ev += embers(0.02, 'target', n=36, y=1.0, speed=6)
    ev += feel(0.0, ms=70, sh=0.34, fl=0.2, vg=0.3, fov=2.2)
    return {'skill': 'skl_loi_an_kich', 'replaces': ['loiankich'], 'events': ev}


R['skl_loi_an_kich'] = loi_an_kich


# --------------------------------------------------------------------------------------------------------------------------------
def cuu_tieu():
    """Cửu Tiêu Thiên Lôi (tối thượng, hit 0,5): chín tầng trời giáng ba đạo thiên lôi (một chính, hai lệch) xuống mục tiêu, vòng triện tím điện,
    ba sóng xung, nứt tỏa, đá tối; làm chậm + kéo máy."""
    ev = [
        parts('spark', -0.5, 60, 2.6, 1, 0.5, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.8),
        vig(-0.45, 0.3, 500, tier=1),
        cam(-0.45, 0.2, 1.4, fov=4.0, tier=1),
        decal('rune', -0.45, 6.0, 1.4, at='target', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='target', offset=[0, 0.1, 0], scale=0.9, scaleTo=1.0, sweep=0.5, erodeFrom=0.85, alpha=1, shadow=False, tone='rim', tier=0, seed=2),
    ]
    # ba đạo thiên lôi: đạo chính trên đầu mục tiêu, hai đạo lệch hai bên (mỗi đạo ba lớp tia)
    ev += forked_bolt(-0.34, 'target', 0.0, 0.0, h=14.0, dur=0.42, seed=21)
    ev += forked_bolt(-0.28, 'target', 2.2, 1.0, h=12.0, dur=0.38, seed=31)
    ev += forked_bolt(-0.22, 'target', -2.0, -1.2, h=12.0, dur=0.36, seed=41)
    ev += [
        slow(0.0, 0.4, 260, tier=2),
        snd(-0.3, 'slash', 0.6, 0.7, 0.05),
        snd(0.0, 'impact', 1.0, 0.7, 0.04),
        snd(0.02, 'crit', 0.6, 0.9, 0.05),
        flip('spark_burst', 0.0, 0.6, 5.0, at='target', offset=[0, 1.2, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', -0.02, 0.12, at='target', offset=[0, 1.2, 0], scale=3.2, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        mesh('crack_radial', -0.02, 1.6, at='target', scale=6.0, alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        ring_wave(0.0, 'target', 1.0, 8.0, 0.8, tone='body', alpha=0.9, seed=3),
        ring_wave(0.1, 'target', 0.8, 6.8, 0.8, tone='rim', alpha=0.7, seed=4),
        ring_wave(0.2, 'target', 0.6, 5.6, 0.8, tone='accent', alpha=0.55, seed=5),
    ]
    ev += strike(0.0, 'target', 7.0, 2.4)
    ev += dark_ground(-0.02, 'target', 6.2)
    for i, a in enumerate([20, 90, 160, 230, 300]):
        ev.append(mesh('rift_line', 0.0, 1.0, at='target', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.2, 1, 7.0], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='accent' if i % 2 else 'body', tier=0 if i < 2 else 1, seed=50 + i))
    ev += [
        parts('spark', 0.0, 120, 10, 1, 0.55, 0.1, at='target', offset=[0, 1.0, 0], tone='rim', tier=0),
        parts('dust', 0.0, 50, 5, 1, 0.8, 0.28, at='target', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += embers(0.04, 'target', n=70, y=1.0, speed=7)
    ev += feel(0.0, ms=80, sh=0.55, fl=0.22, vg=0.34, fov=4.5, pull=0.2)
    return {'skill': 'skl_cuu_tieu_thien_loi', 'replaces': ['cuutieu'], 'events': ev}


R['skl_cuu_tieu_thien_loi'] = cuu_tieu


# --------------------------------------------------------------------------------------------------------------------------------
def phich_lich():
    """Phích Lịch Tuyến (nhánh 16, hit 0,4): đường sét xuyên 10 m, ba điểm sét đánh dọc đường, khe nứt cháy dọc đường chém."""
    L = 10
    ev = [
        parts('spark', -0.4, 20, 1.3, 1, 0.3, 0.06, at='self', offset=[0, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 1.1),
        mesh('slash_thin', -0.22, 0.4, at='ahead', offset=[0, 0.9, 0.6], rot=[0, 0, 4], scale=[1.6, 1.6, 6.0], sweep=0.2, erodeFrom=0.5, ragged=0.9, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='body', alpha=1, tier=0, seed=2),
        mesh('slash_thin', -0.2, 0.38, at='ahead', offset=[0, 0.95, 0.6], rot=[0, 0, -6], scale=[1.0, 1.0, 6.5], sweep=0.2, erodeFrom=0.5, ragged=0.8, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='rim', alpha=1, tier=0, seed=5),
        mesh('slash_thin', -0.18, 0.36, at='ahead', offset=[0, 0.85, 0.6], rot=[0, 0, 18], scale=[0.6, 0.6, 5.0], sweep=0.2, erodeFrom=0.5, ragged=1.0, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='accent', alpha=0.95, tier=1, seed=8),
        snd(-0.2, 'slash', 0.5, 1.3, 0.06),
        mesh('rift_line', 0.0, 1.4, at='ahead', offset=[0, 0.12, 0.4], scale=[1.6, 1, L], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='body', tier=0, seed=3),
        decal('scorch', 0.04, 3.0, 2.8, at='ahead', offset=[0, 0, 5.0], grow=0.1, tone='shadow', alpha=0.85, tier=0),
        decal('crack', 0.04, 2.6, 2.4, at='ahead', offset=[0, 0, 2.5], grow=0.12, tone='core', alpha=1, tier=1),
        snd(0.0, 'impact', 0.65, 1.0),
    ]
    for i, d in enumerate([3.0, 6.0, 9.0]):
        ev += forked_bolt(-0.1 + 0.05 * i, 'ahead', 0.0, d, h=8.0, dur=0.3, seed=60 + i * 5, cf=False)
        ev.append(decal('strike', 0.0 + 0.05 * i, 2.8, 1.8, at='ahead', offset=[0, 0, d], grow=0.1, tone='accent', alpha=1, tier=1 if i else 0))
        ev.append(flip('dust_kick', 0.02 + 0.05 * i, 0.9, 2.2, at='ahead', offset=[0, 0.45, d], alpha=0.55, tone='core', tier=1))
        ev.append(parts('spark', 0.03 + 0.05 * i, 26, 6, 1, 0.5, 0.08, at='ahead', offset=[0, 0.8, d], tone='rim', tier=1))
    ev += [
        flip('spark_burst', 0.1, 0.5, 3.0, at='ahead', offset=[0, 1.0, L - 0.5], alpha=0.95, tone='accent', tier=0),
        ring_wave(0.1, 'ahead', 0.8, 3.4, 0.7, tone='rim', alpha=0.7, seed=7),
    ]
    ev += feel(0.0, ms=70, sh=0.3, fl=0.16, vg=0.28, fov=2.0)
    return {'skill': 'skl_phich_lich', 'replaces': ['phichlich'], 'events': ev}


R['skl_phich_lich'] = phich_lich


# --------------------------------------------------------------------------------------------------------------------------------
def loi_vong():
    """Lôi Võng (nhánh 16, thủ, hit 0,4): dựng lưới lôi: vòng triện tím điện + vòng tối dưới chân, ba cung sét thấp quay quanh chân; phản đòn bật tia. Không phủ lên thân."""
    G = -1.12
    ev = [
        parts('spark', -0.4, 24, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 1.1),
        decal('scorch', -0.25, 3.8, 5.0, at='self', offset=[0, G, 0], grow=0.2, tone='shadow', alpha=0.8, tier=1),
        decal('rune', -0.2, 3.8, 5.2, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.2, 4.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.62, sweep=0.2, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', follow=True, tier=0, seed=4),
        ring_wave(0.0, 'self', 0.8, 3.6, 0.6, tone='body', alpha=0.85, camfade=True, seed=5, y=G),
        flip('spark_burst', 0.0, 0.4, 2.6, at='self', offset=[0, 0.2, 0], alpha=0.85, tone='accent', tier=0),
        snd(0.0, 'block', 0.6, 1.1, 0.05),
        parts('spark', 0.0, 44, 5, 1, 0.55, 0.08, at='self', offset=[0, 0.2, 0], tone='rim', tier=1),
        stop(0.0, 55),
        shake(0.0, 0.2),
        flash(0.0, 0.1, tier=0),
    ]
    # ba cung sét thấp (sát đất) quanh chân, cách nhau 120°, nhìn như lưới lôi
    for i, a in enumerate([0, 120, 240]):
        ev.append(mesh('slash_thin', 0.0 + 0.04 * i, 1.2, at='self', offset=[0, G + 0.35, 0], rot=[0, a, 0], scale=[0.8, 0.8, 2.4], sweep=0.3, erodeFrom=0.6, ragged=0.9, shadow=False, tone='rim' if i % 2 == 0 else 'accent', alpha=0.95, camFade=True, tier=0 if i == 0 else 1, seed=70 + i))
    return {'skill': 'skl_loi_vong', 'replaces': ['loivong'], 'events': ev}


R['skl_loi_vong'] = loi_vong


# --------------------------------------------------------------------------------------------------------------------------------
def loi_phat():
    """Lôi Phạt (nhánh 20, khống, hit 0,4): một đạo thiên lôi đánh thẳng xuống mục tiêu, vòng triện ghìm dưới chân nó ở lại trong lúc choáng."""
    ev = [
        parts('spark', -0.4, 22, 1.3, 1, 0.3, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.95),
        decal('rune', -0.25, 4.0, 2.8, at='target', grow=0.25, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.25, 2.0, at='target', offset=[0, 0.1, 0], scale=0.5, scaleTo=0.55, sweep=0.25, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=4),
    ]
    ev += forked_bolt(-0.2, 'target', 0.0, 0.0, h=11.0, dur=0.4, seed=81)
    ev += [
        snd(0.0, 'impact', 0.8, 0.9),
        snd(0.02, 'crit', 0.5, 1.0, 0.05),
        flip('spark_burst', 0.0, 0.5, 3.2, at='target', offset=[0, 1.0, 0], alpha=0.95, tone='accent', tier=0),
        mesh('slash_cross', 0.0, 0.7, at='target', offset=[0, 1.0, 0], rot=[0, 0, -10], scale=2.2, scaleTo=2.8, sweep=0.3, erodeFrom=0.5, shadow=False, tone='rim', alpha=0.9, seed=3, tier=1),
        ring_wave(0.0, 'ground', 0.6, 3.6, 0.7, tone='body', alpha=0.85, seed=3),
        mesh('crack_radial', 0.02, 1.4, at='ground', scale=3.0, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        flip('dust_kick', 0.03, 0.9, 2.6, at='ground', offset=[0, 0.5, 0], alpha=0.55, tone='core', tier=1),
    ]
    ev += strike(0.0, 'target', 3.2, 1.8)
    ev += dark_ground(0.02, 'ground', 2.6)
    ev += [parts('spark', 0.0, 60, 9, 1, 0.5, 0.09, at='target', offset=[0, 1.0, 0], tone='rim', tier=0)]
    ev += feel(0.0, ms=75, sh=0.32, fl=0.18, vg=0.3, fov=2.0)
    return {'skill': 'skl_loi_phat', 'replaces': ['loiphat'], 'events': ev}


R['skl_loi_phat'] = loi_phat


# --------------------------------------------------------------------------------------------------------------------------------
def loi_hai():
    """Lôi Hải (nhánh 20, vùng 8 m, hit 0,45): biển lôi: sáu đạo sét đánh xuống rải đều trong vùng, vòng triện lớn, hai sóng xung, nứt tỏa."""
    ev = [
        parts('spark', -0.45, 30, 1.4, 1, 0.3, 0.06, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.45, 0.85),
        decal('rune', -0.4, 8.2, 1.0, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.4, 0.9, at='area', offset=[0, 0.1, 0], scale=0.45, scaleTo=0.5, fit='area', sweep=0.4, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=2),
    ]
    import math
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        ev += [bolt(-0.3 + 0.04 * i, 'area', round(math.cos(a) * 4.6, 2), round(math.sin(a) * 4.6, 2), h=10.0, dur=0.38, w=1.1, tone='rim' if i % 2 == 0 else 'body', seed=90 + i, lag=0.5)]
        ev.append(decal('strike', -0.02 + 0.04 * i, 2.6, 1.8, at='area', offset=[round(math.cos(a) * 4.6, 2), 0, round(math.sin(a) * 4.6, 2)], grow=0.1, tone='accent', alpha=1, tier=1))
    ev += forked_bolt(-0.2, 'area', 0.0, 0.0, h=12.0, dur=0.4, seed=120)
    ev += [
        snd(0.0, 'impact', 0.95, 0.75, 0.04),
        flip('spark_burst', -0.02, 0.5, 4.0, at='area', offset=[0, 0.9, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', -0.02, 0.12, at='area', offset=[0, 0.9, 0], scale=2.8, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        ring_wave(0.0, 'area', 1.0, 8.4, 0.8, tone='body', alpha=0.8, seed=4),
        ring_wave(0.1, 'area', 0.8, 7.0, 0.8, tone='rim', alpha=0.6, seed=6),
        mesh('crack_radial', -0.03, 1.4, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
    ]
    ev += dark_ground(-0.02, 'area', 6.4, crack=False)
    for i, a in enumerate([30, 150, 270]):
        ev.append(mesh('rift_line', 0.0, 1.0, at='area', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.2, 1, 7.5], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='accent' if i % 2 else 'body', tier=0 if i == 0 else 1, seed=130 + i))
    ev += [
        parts('spark', 0.0, 90, 9, 1, 0.5, 0.1, at='area', offset=[0, 0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 40, 5, 1, 0.8, 0.28, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += feel(0.0, ms=80, sh=0.5, fl=0.18, vg=0.32, fov=3.0)
    return {'skill': 'skl_loi_hai', 'replaces': ['loihai'], 'events': ev}


R['skl_loi_hai'] = loi_hai


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
