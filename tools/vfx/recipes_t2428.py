# VFX nhánh công pháp mốc 24/28 của Đao tu, Cổ tu, Cấm chế sư: 9 timeline chiêu (mỗi hướng hai chiêu mốc 24 và một chiêu thần thông mốc 28).
#   python tools/vfx/recipes_t2428.py [id chiêu ...]      → ghi packages/content/data/fx/<id>.json
# Dùng lại ngôn ngữ hình của từng hướng (recipes_dao / recipes_co / recipes_cam): đao là vết chém dày + nứt đất, cổ là cục cổ lục + bụi/khói độc,
# cấm chế là triện đậm trên đất + vòng ấn. Chiêu thần thông (mốc 28) có slowmo + kéo máy nhẹ như chiêu tối thượng; chiêu thường thì không.
# Tránh che (bài học #424/#432/#444/#451/#473): mọi khối đứng/rơi cao có `camFade`, đá ≤ 2,2 m, không khối cộng sáng lớn gần camera.
# Ngân sách: mỗi mốc ≤ 12 draw, cả chiêu ≤ 25, hạt ≤ 1.500, hitstop ≤ 80 ms (validateFxTimeline).
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flip, ground, impact, mesh, parts, slow, snd, vig, write  # noqa: E402
from recipes_dao import chips, embers  # noqa: E402
from recipes_cam import link, seal, smoke  # noqa: E402

R = {}


def orb(t, dur, frm, to, scale=0.9, seed=1, tone='body', at='ahead'):
    """Cục cổ (viên tròn lục) bay từ `frm` tới `to`."""
    return mesh('pill_orb', t, dur, at=at, offset=frm, scale=scale, sweep=0, erodeFrom=0.9, alpha=1, tone=tone, tier=0, seed=seed,
                move={'to': 'target', 'ease': 'in', 'offset': to})


# ================================================================================================================================
# ĐAO TU
# ================================================================================================================================
def thuan_dao_tram():
    """Thuấn Đao Trảm (nhánh 24, thuấn di rồi chém, hit 0,2): vệt đỏ xé từ chỗ đứng tới mục tiêu, nhát chéo chữ X nổ sát đích."""
    ev = [
        parts('spark', -0.2, 16, 1.2, 1, 0.22, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.2, 'sword', 0.5, 1.1),
        mesh('slash_thin', -0.18, 0.2, at='self', offset=[0, 0.3, 0.3], rot=[0, 0, -20], scale=3.0, shadow=False, tone='core', alpha=0.9, tier=1, seed=2,
             move={'to': 'target', 'ease': 'in', 'offset': [0, 0.8, 0]}),
        mesh('slash_thick', -0.04, 0.3, at='target', offset=[0, 1.0, 0], rot=[0, 0, -44], scale=2.0, scaleTo=3.2, spin=280, sweep=0.4, erodeFrom=0.5, ragged=0.6, tone='body', alpha=1, tier=0, seed=5),
        mesh('slash_thick', -0.02, 0.28, at='target', offset=[0, 1.0, 0], rot=[0, 0, 44], scale=1.4, scaleTo=2.4, spin=-280, sweep=0.4, erodeFrom=0.45, ragged=0.4, shadow=False, tone='rim', alpha=0.95, tier=0, seed=6),
        snd(0.0, 'impact', 0.7, 0.9),
        mesh('slash_cross', 0.0, 0.3, at='target', offset=[0, 1.0, 0], rot=[0, 0, 10], scale=2.4, scaleTo=3.2, sweep=0.3, erodeFrom=0.4, shadow=False, tone='accent', alpha=0.9, tier=0, seed=3),
    ]
    ev += impact(0.0, burst=2.4)
    ev += ground(0.0, at='ground', r=2.8, cone=3.0, crackscale=3.0, dust=False)
    ev += embers(0.02, 'target', n=36)
    ev += feel(0.0, ms=75, sh=0.3, fl=0.14, vg=0.3, fov=2.0)
    return {'skill': 'skl_thuan_dao_tram', 'replaces': ['thuandaotram'], 'events': ev}


R['skl_thuan_dao_tram'] = thuan_dao_tram


def huyet_chien_the():
    """Huyết Chiến Thể (nhánh 24, thế giậm đất, hit 0,35): vòng triện son dưới chân phồng ra, thân bốc khí đỏ thấp; không che người."""
    G = -1.1
    ev = [
        parts('spark', -0.35, 18, 1.3, 1, 0.3, 0.06, at='self', offset=[0, 0.5, 0], inward=True, tone='rim', tier=1),
        snd(-0.35, 'cast', 0.5, 0.7),
        decal('rune', -0.25, 4.6, 3.0, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.95, tier=0),
        decal('scorch', -0.25, 4.0, 3.0, at='self', offset=[0, G, 0], grow=0.2, tone='shadow', alpha=0.8, tier=0),
        mesh('rune_ring2', -0.25, 1.2, at='self', offset=[0, G + 0.08, 0], scale=0.3, scaleTo=0.9, sweep=0.3, erodeFrom=0.8, alpha=1, shadow=False, tone='rim', tier=0, seed=11),
        snd(0.0, 'impact', 0.7, 0.7, 0.04),
        mesh('shock_cone', 0.0, 0.45, at='self', offset=[0, G + 0.1, 0], scale=[1.0] * 3, scaleTo=[5.0] * 3, alpha=0.85, sweep=0.3, erodeFrom=0.3, shadow=False, tone='body', tier=0, seed=12),
        flip('spark_burst', 0.0, 0.36, 2.6, at='self', offset=[0, 0.2, 0], alpha=0.65, tone='body', camFade=True, tier=0),
        parts('spark', 0.0, 50, 4, 1, 1.0, 0.1, at='self', offset=[0, G + 0.2, 0], tone='rim', grav=1.0, tier=1),
        parts('dust', 0.0, 50, 4, 1, 0.8, 0.2, at='self', offset=[0, G + 0.3, 0], tone='shadow', grav=-0.3, tier=1),
    ]
    ev += feel(0.0, ms=55, sh=0.26, fl=0.08, vg=0.28, fov=1.8)
    return {'skill': 'skl_huyet_chien_the', 'replaces': ['huyetchien'], 'events': ev}


R['skl_huyet_chien_the'] = huyet_chien_the


def doan_thien_dao():
    """Đoạn Thiên Đao (thần thông 28, vùng 12 m, hit 0,5): đao khổng lồ bổ xuống tâm vùng, nứt đất tỏa tới rìa; slowmo + kéo máy."""
    ev = [
        parts('spark', -0.5, 36, 2.2, 1, 0.42, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'sword', 0.6, 0.65),
        vig(-0.45, 0.3, 500, tier=1),
        cam(-0.45, 0.18, 1.3, fov=3.6, tier=1),
        decal('rune', -0.45, 12.0, 1.2, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='area', offset=[0, 0.1, 0], scale=0.3, scaleTo=1.03, fit='area', alpha=1, sweep=0.4, erodeFrom=0.85, shadow=False, tone='rim', tier=0, seed=2),
        mesh('blade_flying', -0.28, 0.28, at='area', offset=[0, 10, 0], scale=[3.8, 3.8, 5.4], sweep=0, erodeFrom=0.95, move={'to': 'area', 'ease': 'in', 'offset': [0, 0.5, 0]}, tone='body', alpha=1, camFade=True, tier=0, seed=1),
        snd(-0.28, 'slash', 0.65, 0.7, 0.05),
        mesh('blade_stuck', 0.0, 1.0, at='area', offset=[0, 0.5, 0], rot=[90, 0, 0], scale=[3.8, 3.8, 5.4], sweep=0, erodeFrom=0.6, alpha=1, tone='body', camFade=True, tier=0, seed=1),
        slow(0.0, 0.45, 240, tier=2),
        snd(0.0, 'impact', 0.95, 0.65, 0.04),
        snd(0.02, 'crit', 0.5, 0.85, 0.05),
        flip('spark_burst', 0.0, 0.4, 4.6, at='area', offset=[0, 1.4, 0], alpha=0.75, tone='accent', tier=0),
        parts('spark', 0.0, 90, 10, 1, 0.5, 0.1, at='area', offset=[0, 1.2, 0], tone='rim', tier=0),
        mesh('crack_radial', 0.0, 1.2, at='area', scale=1.0, fit='area', alpha=1, sweep=0.2, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=4),
        decal('crack', 0.0, 11.0, 3.0, at='area', grow=0.08, tone='core', alpha=1, tier=1),
        decal('scorch', 0.0, 8.0, 3.2, at='area', grow=0.08, tone='shadow', alpha=0.85, tier=1),
    ]
    ev += chips(0.03, 'area', 8, 3.0, 2.2, 0.9, seed0=3.0)
    ev += embers(0.04, 'area', n=60, y=1.2, speed=7)
    ev += feel(0.0, ms=80, sh=0.5, fl=0.12, vg=0.4, fov=4.2, pull=0.2)
    return {'skill': 'skl_doan_thien_dao', 'replaces': ['doanthiendao'], 'events': ev}


R['skl_doan_thien_dao'] = doan_thien_dao


# ================================================================================================================================
# CỔ TU
# ================================================================================================================================
def phan_co_thuat():
    """Phân Cổ Thuật (nhánh 24, vùng 8 m, hit 0,45): một cục cổ bay tới tâm vùng rồi tách thành nhiều cục văng ra các phía (≤ 2,2 m), bụi độc lan."""
    ev = [
        parts('spark', -0.45, 18, 1.4, 1, 0.3, 0.06, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.45, 1.0),
        decal('rune', -0.4, 8.0, 0.9, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        orb(-0.2, 0.2, [0.2, 1.0, 0.6], [0, 1.0, 0], scale=1.0, seed=5),
        snd(0.0, 'impact', 0.8, 0.85, 0.04),
        mesh('burst', 0.0, 0.12, at='area', offset=[0, 1.4, 0], scale=2.4, billboard=True, sweep=0, tone='core', cross=True, tier=0),
        mesh('ripple', 0.0, 0.5, at='area', offset=[0, 0.12, 0], scale=0.6, scaleTo=3.6, sweep=0.4, erodeFrom=0.4, tone='rim', alpha=0.9, tier=0, seed=9),
        decal('scorch', 0.0, 6.0, 3.0, at='area', grow=0.1, tone='core', alpha=0.85, tier=0),
        parts('dust', 0.0, 80, 6, 1, 0.9, 0.22, at='area', offset=[0, 0.6, 0], tone='body', grav=-0.4, tier=0),
        smoke(0.04, 'area', y=0.6, scale=5.0, tone='core', alpha=0.6),
    ]
    for i in range(10):
        a = i / 10 * math.tau + 0.5
        r = 2.4 + 1.8 * ((i * 53) % 10) / 10
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        ev.append(mesh('pill_orb', 0.0, 0.5, at='area', offset=[0, 0.5, 0], scale=0.6, sweep=0, erodeFrom=0.9, alpha=1, tone='body' if i % 2 else 'core', camFade=True,
                       tier=0 if i < 4 else 1, seed=60 + i, move={'to': 'area', 'ease': 'out', 'offset': [x, 1.6 + 0.6 * (i % 2), z]}))
    ev += feel(0.0, ms=70, sh=0.35, fl=0.0, vg=0.3, fov=2.4)
    return {'skill': 'skl_phan_co_thuat', 'replaces': ['phancothuat'], 'events': ev}


R['skl_phan_co_thuat'] = phan_co_thuat


def kim_thien_co():
    """Kim Thiền Cổ (nhánh 24, giáp vàng, hit 0,4): vỏ cổ vàng lục khép quanh thân thành vòng thấp, triện lục dưới chân; không che mặt người."""
    G = -1.1
    ev = [
        parts('spark', -0.4, 18, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.5, 0], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.9),
        decal('rune', -0.3, 3.6, 3.0, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', -0.3, 3.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.6, sweep=0.2, erodeFrom=0.8, alpha=0.9, shadow=False, tone='rim', follow=True, tier=0, seed=21),
        mesh('ripple', -0.2, 0.7, at='self', offset=[0, G + 0.15, 0], scale=1.6, scaleTo=0.5, sweep=0.5, erodeFrom=0.4, shadow=False, tone='accent', alpha=0.9, tier=0, seed=22),
        flip('spark_burst', 0.0, 0.34, 2.4, at='self', offset=[0, 0.2, 0], alpha=0.7, tone='accent', camFade=True, tier=0),
        snd(0.0, 'block', 0.6, 0.85, 0.05),
        parts('spark', 0.0, 36, 4, 1, 0.8, 0.09, at='self', offset=[0, G + 0.2, 0], tone='accent', grav=1.0, tier=1),
        smoke(0.02, 'self', y=G + 0.4, scale=3.2, tone='body', alpha=0.4),
    ]
    for i in range(6):
        a = i / 6 * math.tau
        ev.append(mesh('pill_orb', -0.1 + 0.02 * i, 0.4, at='self', offset=[round(math.cos(a) * 2.2, 2), G + 0.7, round(math.sin(a) * 2.2, 2)], scale=0.5, sweep=0, erodeFrom=0.9,
                       alpha=1, tone='accent', camFade=True, tier=0 if i < 3 else 1, seed=80 + i, move={'to': 'self', 'ease': 'in', 'offset': [0, G + 0.9, 0]}))
    return {'skill': 'skl_kim_thien_co', 'replaces': ['kimthienco'], 'events': ev}


R['skl_kim_thien_co'] = kim_thien_co


def van_co_phe_the():
    """Vạn Cổ Phệ Thể (thần thông 28, vùng 12 m, hit 0,5): bầy cổ lục tràn từ trời xuống tâm vùng, khói độc cuộn ra rìa; slowmo + kéo máy nhẹ."""
    ev = [
        parts('spark', -0.5, 30, 2.0, 1, 0.42, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.8),
        vig(-0.45, 0.25, 500, tone='dark', tier=1),
        cam(-0.45, 0.15, 1.2, fov=3.4, tier=1),
        decal('rune', -0.45, 12.0, 1.3, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='area', offset=[0, 0.1, 0], scale=0.3, scaleTo=1.03, fit='area', alpha=1, sweep=0.4, erodeFrom=0.85, shadow=False, tone='rim', tier=0, seed=2),
        slow(0.0, 0.45, 220, tier=2),
        snd(0.0, 'impact', 0.85, 0.7, 0.04),
        mesh('burst', 0.0, 0.12, at='area', offset=[0, 1.6, 0], scale=3.2, billboard=True, sweep=0, tone='core', cross=True, tier=0),
        mesh('ripple', 0.0, 0.6, at='area', offset=[0, 0.12, 0], scale=0.6, scaleTo=6.0, sweep=0.4, erodeFrom=0.4, tone='rim', alpha=0.9, tier=0, seed=9),
        mesh('shock_cone', 0.02, 0.6, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[12.0] * 3, alpha=0.8, sweep=0.3, erodeFrom=0.3, tone='body', tier=1),
        decal('scorch', 0.0, 9.0, 3.2, at='area', grow=0.1, tone='core', alpha=0.85, tier=0),
        parts('dust', 0.0, 120, 7, 1, 1.0, 0.26, at='area', offset=[0, 0.6, 0], tone='body', grav=-0.4, tier=0),
        smoke(0.04, 'area', y=0.6, scale=8.0, tone='core', alpha=0.7),
    ]
    for i in range(12):
        a = i / 12 * math.tau + 0.2
        r = 1.5 + 4.0 * ((i * 37) % 10) / 10
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        ev.append(mesh('pill_orb', -0.25 + 0.01 * i, 0.25, at='area', offset=[x, 6.0, z], scale=0.7, sweep=0, erodeFrom=0.9, alpha=1, tone='body' if i % 2 else 'core', camFade=True,
                       tier=0 if i < 5 else 1, seed=100 + i, move={'to': 'area', 'ease': 'in', 'offset': [x, 0.5, z]}))
    ev += feel(0.0, ms=70, sh=0.4, fl=0.0, vg=0.34, fov=3.4, pull=0.15)
    return {'skill': 'skl_van_co_phe_the', 'replaces': ['vancophethe'], 'events': ev}


R['skl_van_co_phe_the'] = van_co_phe_the


# ================================================================================================================================
# CẤM CHẾ SƯ (bảng màu theo kiểu trận: sát đỏ tía, hộ lục ngọc)
# ================================================================================================================================
def dia_sat_tran():
    """Địa Sát Trận (nhánh 24, trận Sát 8 m phía trước, hit 0,45): vết nứt nối chân người tới tâm trận, triện đậm bung rộng; trận đứng do `tran_sat_*` vẽ tiếp."""
    ev = [
        parts('spark', -0.45, 20, 1.5, 1, 0.34, 0.06, at='self', offset=[0, 0.9, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.5, 0.9),
        link(-0.4, 0.4, to='area', tone='accent', seed=31),
        *seal(-0.35, 'area', 8.0, 3.2),
        mesh('rune_ring2', -0.35, 0.9, at='area', offset=[0, 0.1, 0], scale=0.2, scaleTo=1.03, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=32),
        mesh('rune_ring2', -0.3, 0.9, at='area', offset=[0, 0.12, 0], scale=0.2, scaleTo=0.97, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='rim', tier=0, seed=33),
        snd(0.0, 'impact', 0.6, 0.8),
        mesh('crack_radial', 0.02, 1.0, at='area', offset=[0, 0.1, 0], scale=1.0, fit='area', alpha=0.85, sweep=0.15, erodeFrom=0.8, shadow=False, tone='accent', tier=0, seed=34),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[7.0] * 3, alpha=0.85, sweep=0.3, erodeFrom=0.3, tone='body', tier=1, seed=35),
        parts('dust', 0.0, 60, 5, 1, 0.9, 0.2, at='area', offset=[0, 0.4, 0], tone='core', grav=-0.3, tier=0),
        smoke(0.05, 'area', y=0.5, scale=4.5, tone='core', alpha=0.5),
    ]
    ev += feel(0.0, ms=60, sh=0.24, fl=0.06, vg=0.28, fov=2.0)
    return {'skill': 'skl_dia_sat_tran', 'palette': 'tran_sat', 'replaces': ['diasattran'], 'events': ev}


R['skl_dia_sat_tran'] = dia_sat_tran


def thai_hu_ho_tran():
    """Thái Hư Hộ Trận (nhánh 24, trận Hộ 8 m dưới chân, hit 0,5): vòng ngọc nở ra từ chân người, hạt vàng bay lên chậm; không chớp, không rung."""
    ev = [
        parts('spark', -0.5, 24, 1.8, 1, 0.4, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.5, 1.1),
        *seal(-0.4, 'area', 8.0, 3.2),
        mesh('rune_ring2', -0.4, 0.9, at='area', offset=[0, 0.1, 0], scale=0.2, scaleTo=1.0, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='accent', tier=0, seed=41),
        mesh('rune_ring2', -0.35, 0.9, at='area', offset=[0, 0.12, 0], scale=0.2, scaleTo=0.9, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='rim', tier=0, seed=42),
        mesh('ripple', -0.2, 0.8, at='area', offset=[0, 0.12, 0], scale=0.3, scaleTo=1.0, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.4, shadow=False, tone='body', tier=0, seed=43),
        snd(0.0, 'impact', 0.5, 1.0),
        flip('spark_burst', 0.0, 0.4, 3.0, at='self', offset=[0, 0.4, 0], alpha=0.6, tone='accent', camFade=True, tier=0),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[7.0] * 3, alpha=0.7, sweep=0.3, erodeFrom=0.3, tone='body', tier=1, seed=44),
        parts('spark', 0.0, 60, 3, 1, 1.2, 0.1, at='self', offset=[0, -0.6, 0], tone='accent', grav=1.2, tier=0),
        smoke(0.05, 'area', y=0.4, scale=4.5, tone='body', alpha=0.35),
    ]
    return {'skill': 'skl_thai_hu_ho_tran', 'palette': 'tran_ho', 'replaces': ['thaihuhotran'], 'events': ev}


R['skl_thai_hu_ho_tran'] = thai_hu_ho_tran


def lac_thu_dai_tran():
    """Lạc Thư Đại Trận (thần thông 28, trận Sát 11 m dưới chân, hit 0,5): chín ô triện (vòng lớn + hai vòng nhỏ lệch pha) nở từ chân, nứt tỏa tới rìa; slowmo + kéo máy nhẹ."""
    ev = [
        parts('spark', -0.5, 34, 2.2, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.8),
        vig(-0.45, 0.25, 500, tone='dark', tier=1),
        cam(-0.45, 0.15, 1.2, fov=3.4, tier=1),
        *seal(-0.4, 'area', 11.0, 3.8),
        mesh('rune_ring2', -0.4, 1.0, at='area', offset=[0, 0.06, 0], scale=0.2, scaleTo=1.03, fit='area', sweep=0.3, erodeFrom=0.85, alpha=1, shadow=False, tone='core', tier=0, seed=51),
        mesh('rune_ring2', -0.35, 1.0, at='area', offset=[0, 0.1, 0], scale=0.2, scaleTo=0.8, fit='area', sweep=0.3, erodeFrom=0.85, alpha=1, shadow=False, tone='rim', tier=0, seed=52),
        mesh('rune_ring2', -0.3, 1.0, at='area', offset=[0, 0.14, 0], scale=0.2, scaleTo=0.55, fit='area', sweep=0.3, erodeFrom=0.85, alpha=1, shadow=False, tone='accent', tier=0, seed=53),
        slow(0.0, 0.45, 220, tier=2),
        snd(0.0, 'impact', 0.7, 0.75),
        flip('spark_burst', 0.0, 0.4, 2.4, at='self', offset=[0, -0.6, 0], alpha=0.45, tone='rim', tier=0),
        mesh('crack_radial', 0.02, 1.2, at='area', offset=[0, 0.12, 0], scale=1.0, fit='area', alpha=0.85, sweep=0.15, erodeFrom=0.8, shadow=False, tone='body', tier=0, seed=54),
        mesh('shock_cone', 0.02, 0.55, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[11.0] * 3, alpha=0.9, sweep=0.3, erodeFrom=0.3, tone='body', tier=0, seed=55),
        parts('dust', 0.0, 100, 7, 1, 1.0, 0.22, at='self', offset=[0, -0.6, 0], tone='core', grav=-0.4, tier=0),
        parts('spark', 0.0, 50, 9, 1, 0.6, 0.08, at='self', offset=[0, -0.4, 0], tone='accent', tier=0),
        smoke(0.05, 'self', y=-0.6, scale=6.0, tone='core', alpha=0.6, tier=1),
    ]
    ev += feel(0.0, ms=60, sh=0.32, fl=0.08, vg=0.34, fov=3.4, pull=0.12)
    return {'skill': 'skl_lac_thu_dai_tran', 'palette': 'tran_sat', 'replaces': ['lacthudaitran'], 'events': ev}


R['skl_lac_thu_dai_tran'] = lac_thu_dai_tran


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
