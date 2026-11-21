# VFX Đao tu: 6 timeline riêng (Bạo Nhận, Trảm Sơn Đao, Hoành Đao, Tâm Đao, Đoạn Lưu, Liệt Địa Trảm) theo ngôn ngữ hình VS-1.
#   python tools/vfx/recipes_dao.py [id chiêu ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `dao_tu` (paths.json): core huyết dụ, body son thẫm, rim vàng tàn lửa, accent thép.
# Tránh che camera/nhân vật/mục tiêu (bài học #424/#432/#444): mọi khối đứng hoặc rơi cao có `camFade`, tảng đá có trần 2,2 m,
# không khối cộng sáng lớn gần camera. Ngân sách: mỗi mốc ≤ 12 draw, cả chiêu ≤ 25, hạt ≤ 1.500 (validateFxTimeline).
# Chiêu tư thế (Đoạn Nhận, Quét Ngang, Hộ Đao) mượn hình của chiêu nền nên không có timeline riêng.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, ground, impact, mesh, parts, shake, slow, snd, stop, vig, write  # noqa: E402

R = {}


def chips(t, at, n, r, up, scale, seed0=1.0, cap=2.2, shapes=('rubble_a', 'rubble_c')):
    """n mảnh đá tối bung lên rồi rơi lại; trần độ cao `cap`, mọi mảnh `camFade`."""
    ev = []
    for i in range(n):
        a = i / n * math.tau + seed0
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        h = min(up, cap) * (0.7 + 0.3 * ((i * 37) % 10) / 10)
        shp = shapes[i % len(shapes)]
        rot = [35 * i, 70 * i, 15 * i]
        tier = 0 if i < 5 else 1
        ev.append(mesh(shp, t, 0.2, at=at, offset=[x, 0.1, z], rot=rot, scale=scale, sweep=0, erodeFrom=0.98, alpha=1, move={'to': at, 'offset': [x * 1.15, h, z * 1.15], 'ease': 'out'}, tone='shadow', tier=tier, seed=seed0 + i, camFade=True))
        ev.append(mesh(shp, t + 0.2, 0.28, at=at, offset=[x * 1.15, h, z * 1.15], rot=rot, scale=scale, scaleTo=scale * 0.8, sweep=0, erodeFrom=0.7, alpha=1, move={'to': at, 'offset': [x * 1.3, 0.1, z * 1.3], 'ease': 'in'}, tone='shadow', tier=tier, seed=seed0 + i, camFade=True))
    return ev


def embers(t, at, n=40, y=0.9, speed=6):
    """Tàn lửa vàng bay lên từ điểm chém."""
    return [parts('spark', t, n, speed, 1, 0.5, 0.08, at=at, offset=[0, y, 0], tone='rim', tier=1)]


# --------------------------------------------------------------------------------------------------------------------------------
def bao_nhan():
    """Bạo Nhận (đặc trưng, hit 0,3): một nhát chém chéo nặng lao tới mục tiêu rồi bùng thành vết chéo chữ X + tàn lửa."""
    ev = [
        parts('spark', -0.3, 22, 1.4, 1, 0.26, 0.07, at='self', offset=[0.2, 0, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'sword', 0.5, 0.78),
        mesh('slash_thick', -0.16, 0.3, at='ahead', offset=[0, 0.2, 0.5], rot=[0, 0, -48], scale=2.0, scaleTo=3.4, spin=300, sweep=0.4, erodeFrom=0.5, ragged=0.6, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='body', alpha=1, tier=0),
        mesh('slash_thick', -0.14, 0.28, at='ahead', offset=[0, 0.2, 0.5], rot=[0, 0, -48], scale=1.4, scaleTo=2.4, spin=300, sweep=0.4, erodeFrom=0.45, ragged=0.4, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='rim', alpha=0.95, seed=4, tier=0),
        mesh('slash_thin', -0.13, 0.32, at='ahead', offset=[0, -0.05, 0.2], rot=[0, 0, -66], scale=2.4, scaleTo=4.0, spin=260, sweep=0.35, erodeFrom=0.35, ragged=0.8, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='core', alpha=0.9, seed=9, tier=1),
        snd(-0.1, 'slash', 0.55, 0.9, 0.06),
        # vết chéo chữ X bùng ở mục tiêu
        mesh('slash_cross', 0.0, 0.3, at='target', offset=[0, 1.0, 0], rot=[0, 0, 12], scale=2.4, scaleTo=3.2, sweep=0.3, erodeFrom=0.4, shadow=False, tone='rim', alpha=0.9, seed=3, tier=0),
        snd(0.0, 'impact', 0.7, 0.85),
    ]
    ev += impact(0.0, burst=2.6)
    ev += ground(0.0, at='ground', r=3.2, cone=3.2, crackscale=3.4, dust=False)
    ev += embers(0.02, 'target')
    ev += chips(0.03, 'ground', 4, 1.6, 1.6, 0.5, seed0=1.0, shapes=('rubble_a',))
    ev += feel(0.0, ms=80, sh=0.34, fl=0.16, vg=0.34, fov=2.2)
    return {'skill': 'skl_bao_nhan', 'replaces': ['baonhan'], 'events': ev}


R['skl_bao_nhan'] = bao_nhan


# --------------------------------------------------------------------------------------------------------------------------------
def tram_son_dao():
    """Trảm Sơn Đao (tối thượng, hit 0,5): đao khổng lồ bổ từ trên cao xuống mục tiêu, cắm xuống, nứt đất tỏa; slowmo + kéo máy."""
    ev = [
        parts('spark', -0.55, 44, 2.4, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.55, 'sword', 0.6, 0.7),
        vig(-0.5, 0.3, 500, tier=1),
        cam(-0.5, 0.2, 1.4, fov=4.0, tier=1),
        decal('rune', -0.5, 4.8, 1.4, at='ground', grow=0.3, tone='rim', alpha=1, tier=0),
        mesh('rune_ring2', -0.5, 1.0, at='ground', offset=[0, 0.1, 0], scale=1.0, scaleTo=1.02, fit='area', alpha=1, sweep=0.5, erodeFrom=0.85, shadow=False, tone='rim', tier=0, seed=2),
        # đao khổng lồ rơi (tự xoay mũi theo hướng rơi) + bóng đuôi, rồi cắm xuống
        mesh('blade_flying', -0.3, 0.3, at='target', offset=[1.6, 9, 0], scale=[3.6, 3.6, 5.2], sweep=0, erodeFrom=0.95, move={'to': 'target', 'ease': 'in', 'offset': [1.6, 0.5, 0]}, tone='body', alpha=1, tier=0, seed=1),
        mesh('blade_ghost', -0.32, 0.34, at='target', offset=[1.6, 14, 0], scale=[3.0, 3.0, 5.6], sweep=0, erodeFrom=0.7, move={'to': 'target', 'ease': 'in', 'offset': [1.6, 5.5, 0]}, tone='rim', alpha=0.5, tier=1, seed=101),
        snd(-0.3, 'slash', 0.65, 0.7, 0.05),
        mesh('blade_stuck', 0.0, 1.0, at='target', offset=[1.6, 0.5, 0], rot=[90, 0, 0], scale=[3.6, 3.6, 5.2], sweep=0, erodeFrom=0.6, alpha=1, tone='body', camFade=True, tier=0, seed=1),
        slow(0.0, 0.4, 260, tier=2),
        snd(0.0, 'impact', 0.95, 0.7, 0.04),
        snd(0.02, 'crit', 0.5, 0.85, 0.05),
        flip('spark_burst', 0.0, 0.4, 4.4, at='target', offset=[0, 1.4, 0], alpha=0.7, tone='accent', tier=0),
        parts('spark', 0.0, 100, 10, 1, 0.5, 0.1, at='target', offset=[0, 1.2, 0], tone='rim', tier=0),
    ]
    ev += ground(0.0, at='ground', r=6.5, cone=8.0, crackscale=7.0)
    ev += chips(0.03, 'ground', 8, 2.6, 2.2, 0.9, seed0=2.0)
    ev += embers(0.04, 'target', n=70, y=1.2, speed=7)
    ev += feel(0.0, ms=80, sh=0.5, fl=0.12, vg=0.42, fov=4.5, pull=0.2)
    return {'skill': 'skl_tram_son_dao', 'replaces': ['tramson'], 'events': ev}


R['skl_tram_son_dao'] = tram_son_dao


# --------------------------------------------------------------------------------------------------------------------------------
def hoanh_dao():
    """Hoành Đao (nhánh 16, hit 0,4): nhát chém ngang dày xuyên 10 m, xé khe nứt dọc đường, tàn lửa bay theo."""
    L = 10
    ev = [
        parts('spark', -0.4, 20, 1.3, 1, 0.3, 0.06, at='self', offset=[0, 0.1, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'sword', 0.5, 0.78),
        mesh('slash_thick', -0.22, 0.34, at='ahead', offset=[0, 0.5, 0.6], rot=[0, 0, -6], scale=2.2, scaleTo=3.6, sweep=0.35, erodeFrom=0.55, ragged=0.55, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='body', alpha=1, tier=0),
        mesh('slash_thick', -0.2, 0.32, at='ahead', offset=[0, 0.5, 0.6], rot=[0, 0, -6], scale=1.6, scaleTo=2.8, sweep=0.35, erodeFrom=0.5, ragged=0.4, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='rim', alpha=0.95, seed=4, tier=0),
        mesh('slash_thin', -0.18, 0.36, at='ahead', offset=[0, 0.3, 0.2], rot=[0, 0, 4], scale=2.4, scaleTo=4.0, sweep=0.3, erodeFrom=0.35, ragged=0.8, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='core', alpha=0.9, seed=9, tier=1),
        snd(-0.2, 'slash', 0.55, 0.85, 0.06),
        mesh('rift_line', 0.0, 0.9, at='ahead', offset=[0, 0.12, 0.4], scale=[1.6, 1, L], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=3),
        decal('crack', 0.05, 2.2, 2.6, at='ahead', offset=[0, 0, 3.0], grow=0.12, tone='core', alpha=1, tier=1),
        decal('scorch', 0.05, 2.2, 3.0, at='ahead', offset=[0, 0, 7.0], grow=0.1, tone='shadow', alpha=0.75, tier=1),
        snd(0.0, 'impact', 0.65, 0.85),
    ]
    for i, d in enumerate([3.0, 6.0, 9.0]):
        ev.append(flip('dust_kick', 0.02 + 0.05 * i, 0.6, 2.4, at='ahead', offset=[0, 0.45, d], alpha=0.5, tone='body', tier=1))
        ev.append(parts('spark', 0.03 + 0.05 * i, 26, 6, 1, 0.5, 0.08, at='ahead', offset=[0, 0.8, d], tone='rim', tier=1))
    ev += [
        flip('spark_burst', 0.1, 0.36, 3.0, at='ahead', offset=[0, 1.0, L - 0.5], alpha=0.9, tone='accent', tier=0),
        mesh('shock_cone', 0.1, 0.34, at='ahead', offset=[0, 0.05, L - 0.5], scale=[1.0] * 3, scaleTo=[2.8] * 3, alpha=0.75, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1),
    ]
    ev += feel(0.0, ms=70, sh=0.3, fl=0.12, vg=0.3, fov=2.0)
    return {'skill': 'skl_hoanh_dao', 'replaces': ['hoanhdao'], 'events': ev}


R['skl_hoanh_dao'] = hoanh_dao


# --------------------------------------------------------------------------------------------------------------------------------
def tam_dao():
    """Tâm Đao (nhánh 16, thủ, hit 0,4): đứng thế, một vành đao xoay quanh thân và vành triện son dưới chân; phản đòn bật tia."""
    G = -1.12
    ev = [
        parts('spark', -0.35, 18, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=1),
        snd(-0.35, 'cast', 0.5, 0.75),
        decal('rune', -0.2, 3.2, 5.2, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', -0.2, 4.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.62, sweep=0.2, erodeFrom=0.8, alpha=0.9, shadow=False, tone='rim', follow=True, tier=0, seed=4),
        # vành đao xoay quanh thân (thấp, mờ dần khi nằm giữa camera và người)
        mesh('sword_halo', 0.0, 4.0, at='self', offset=[0, G + 0.9, 0], scale=1.6, spin=90, sweep=0.15, erodeFrom=0.85, alpha=0.8, shadow=False, tone='rim', follow=True, camFade=True, tier=0, seed=6),
        flip('spark_burst', 0.0, 0.34, 2.6, at='self', offset=[0, 0.2, 0], alpha=0.7, tone='body', tier=0),
        mesh('slash_cross', 0.0, 0.28, at='self', offset=[0, 0.1, 0], scale=2.4, scaleTo=3.2, sweep=0.3, erodeFrom=0.45, shadow=False, tone='rim', alpha=0.85, camFade=True, tier=1, seed=7),
        snd(0.0, 'block', 0.6, 0.8, 0.05),
        parts('spark', 0.0, 40, 5, 1, 0.5, 0.08, at='self', offset=[0, 0.2, 0], tone='rim', tier=1),
        stop(0.0, 55),
        shake(0.0, 0.2),
        flash(0.0, 0.08, tier=0),
    ]
    return {'skill': 'skl_tam_dao', 'replaces': ['tamdao'], 'events': ev}


R['skl_tam_dao'] = tam_dao


# --------------------------------------------------------------------------------------------------------------------------------
def doan_luu():
    """Đoạn Lưu (nhánh 20, khống, hit 0,4): hai nhát chéo cắt dòng thế của mục tiêu, vành triện ghìm dưới chân nó."""
    ev = [
        parts('spark', -0.3, 18, 1.3, 1, 0.26, 0.06, at='self', offset=[0.2, 0, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'sword', 0.5, 0.95),
        mesh('slash_thick', -0.16, 0.26, at='ahead', offset=[0, 0.3, 0.4], rot=[0, 0, 40], scale=1.8, scaleTo=3.2, spin=-300, sweep=0.4, erodeFrom=0.5, ragged=0.5, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='body', alpha=1, tier=0),
        mesh('slash_thick', -0.1, 0.26, at='ahead', offset=[0, 0.3, 0.4], rot=[0, 0, -40], scale=1.5, scaleTo=2.8, spin=300, sweep=0.4, erodeFrom=0.5, ragged=0.5, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='rim', alpha=0.95, seed=5, tier=0),
        snd(-0.1, 'slash', 0.5, 1.05, 0.06),
        mesh('slash_cross', 0.0, 0.3, at='target', offset=[0, 1.0, 0], rot=[0, 0, -10], scale=2.2, scaleTo=3.0, sweep=0.3, erodeFrom=0.4, shadow=False, tone='accent', alpha=0.9, seed=3, tier=0),
        # vành triện ghìm dưới chân mục tiêu, ở lại trong lúc choáng
        decal('rune', 0.05, 2.6, 1.8, at='ground', grow=0.2, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', 0.05, 1.5, at='ground', offset=[0, 0.1, 0], scale=0.45, scaleTo=0.5, sweep=0.2, erodeFrom=0.8, alpha=0.9, shadow=False, tone='rim', tier=0, seed=8),
        snd(0.0, 'impact', 0.6, 1.0),
    ]
    ev += impact(0.0, burst=2.2, sparks=48)
    ev += ground(0.0, at='ground', r=2.6, cone=2.4, crackscale=2.6)
    ev += feel(0.0, ms=75, sh=0.28, fl=0.14, vg=0.3, fov=1.8)
    return {'skill': 'skl_doan_luu', 'replaces': ['doanluu'], 'events': ev}


R['skl_doan_luu'] = doan_luu


# --------------------------------------------------------------------------------------------------------------------------------
def liet_dia_tram():
    """Liệt Địa Trảm (nhánh 20, vùng 7 m, hit 0,45): bổ đao xuống đất, ba khe nứt tỏa ra rìa vùng, đá bắn lên, tàn lửa."""
    ev = [
        parts('spark', -0.45, 22, 1.4, 1, 0.3, 0.06, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.45, 0.75),
        decal('rune', -0.4, 7.2, 0.9, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('blade_flying', -0.25, 0.26, at='area', offset=[0, 8, 0], scale=[3.2, 3.2, 4.4], sweep=0, erodeFrom=0.95, move={'to': 'area', 'ease': 'in', 'offset': [0, 0.4, 0]}, tone='body', alpha=1, camFade=True, tier=0, seed=1),
        mesh('blade_stuck', 0.0, 0.9, at='area', offset=[0, 0.4, 0], rot=[90, 0, 0], scale=[3.2, 3.2, 4.4], sweep=0, erodeFrom=0.6, alpha=1, tone='body', camFade=True, tier=0, seed=1),
        snd(0.0, 'impact', 0.95, 0.65, 0.04),
        snd(0.0, 'block', 0.55, 0.62, 0.05),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.4, 0], scale=2.6, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.34, 3.4, at='area', offset=[0, 0.7, 0], alpha=0.8, tone='accent', tier=0),
        mesh('crack_radial', -0.03, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        decal('crack', -0.03, 7.0, 2.8, at='area', grow=0.05, tone='core', alpha=1, tier=1),
        decal('scorch', -0.03, 5.4, 3.0, at='area', grow=0.05, tone='shadow', alpha=0.85, tier=0),
        mesh('rune_ring2', -0.03, 0.4, at='area', offset=[0, 0.08, 0], scale=0.45, scaleTo=1.25, fit='area', sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='rim', tier=0, seed=3),
    ]
    for i, a in enumerate([20, 140, 260]):
        ev.append(mesh('rift_line', 0.0, 0.9, at='area', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.4, 1, 7.0], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='core', tier=0 if i == 0 else 1, seed=10 + i))
    ev += [
        flip('dust_kick', 0.0, 0.8, 4.6, at='area', offset=[0, 0.7, 0], alpha=0.65, tone='core', tier=0),
        parts('spark', 0.0, 54, 8, 1, 0.45, 0.1, at='area', offset=[0, 0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 50, 5, 1, 0.8, 0.28, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += chips(-0.02, 'area', 8, 2.4, 2.2, 1.0, seed0=0.5)
    ev += embers(0.04, 'area', n=50, y=0.8, speed=6)
    ev += feel(0.0, ms=80, sh=0.5, fl=0.14, vg=0.35, fov=3.0)
    return {'skill': 'skl_liet_dia_tram', 'replaces': ['lietdia'], 'events': ev}


R['skl_liet_dia_tram'] = liet_dia_tram


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
