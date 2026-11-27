# VFX Cổ tu (Dưỡng Cổ Kinh): 6 timeline chiêu (Thả Cổ, Cổ Triều, Hút Máu Cổ, Cổ Bạo, Thu Cổ, Hóa Cổ Vương) + 4 timeline tại điểm
# (nhịp bầy cổ cắn, Cổ Vương cắn, bầy cổ đứng quanh người, Cổ Vương đứng) theo ngôn ngữ hình VS-1.
#   python tools/vfx/recipes_co.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `co_tu` (paths.json): core rêu đen, body lục độc, rim lục vàng nhạt, accent xương. Bản sắc hình: cổ là
# CỤC ĐỘC (viên tròn lục) và KHÓI/BỤI lục bay lên, không phải lưỡi chém; ấn là vòng triện lục trên đất.
# Tránh che (bài học #424/#432/#444/#451): hình cao/đứng đều `camFade`, bầy cổ đứng quanh người ở thấp (< 1,2 m) và lệch bên, đá ≤ 2,2 m.
# Ngân sách: chiêu ≤ 12 draw cả chiêu, hitstop ≤ 80 ms; hiệu ứng tại điểm: nhịp cắn ≤ 3 draw ≤ 30 hạt, không khựng/rung/chớp.
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, impact, mesh, parts, shake, slow, snd, stop, vig, write, OUT  # noqa: E402

R = {}
PALETTE = 'duong_co_kinh'


def write_point(name, events):
    """Timeline tại điểm (client phát bằng FxRunner.startAt): có khóa `palette`."""
    path = os.path.join(OUT, name + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'skill': name, 'palette': PALETTE, 'events': events}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('ghi', os.path.relpath(path))


def glob(t, dur, frm, to, scale=0.9, seed=1, tone='body', alpha=1.0, tier=0):
    """Cục cổ (viên tròn lục) bay từ `frm` tới `to` (hệ cục bộ `at`)."""
    return mesh('pill_orb', t, dur, at='ahead', offset=frm, scale=scale, sweep=0, erodeFrom=0.9, alpha=alpha, tone=tone, tier=tier, seed=seed,
                move={'to': 'target', 'ease': 'in', 'offset': to})


def smoke(t, at, y=0.6, scale=3.0, tone='core', alpha=0.45, tier=1):
    return flip('ink_smoke', t, 0.9, scale, at=at, offset=[0, y, 0], alpha=alpha, tone=tone, tier=tier)


# --------------------------------------------------------------------------------------------------------------------------------
def tha_co():
    """Thả Cổ (đặc trưng, hit 0,3): một cục cổ lục bay vút tới mục tiêu, vỡ thành bụi độc, vòng triện lục dưới chân nó."""
    ev = [
        parts('spark', -0.3, 18, 1.3, 1, 0.26, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'cast', 0.45, 1.15),
        glob(-0.2, 0.2, [0.2, 0.9, 0.6], [0, 2.3, 0], scale=0.9, seed=3),
        mesh('spark_streak', -0.17, 0.2, at='ahead', offset=[0.1, 0.9, 0.4], scale=1.8, shadow=False, tone='rim', alpha=0.9, tier=1, seed=2,
             move={'to': 'target', 'ease': 'in', 'offset': [0, 2.3, 0]}),
        snd(-0.15, 'slash', 0.4, 1.2, 0.06),
        # Điểm nổ đặt trên đầu mục tiêu (2,4 m) và tắt nhanh để thân nó vẫn đọc được (cổng duyệt che thân).
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 2.4, 0], scale=2.0, camFade=True, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', 0.0, 0.22, 2.4, at='target', offset=[0, 2.5, 0], camFade=True, alpha=0.85, tone='rim', tier=0),
        parts('dust', 0.0, 20, 3.5, 1, 0.4, 0.13, at='target', offset=[0, 2.2, 0], tone='body', grav=-0.6, tier=0),
        parts('spark', 0.0, 30, 6, 1, 0.4, 0.08, at='target', offset=[0, 2.3, 0], tone='rim', tier=1),
        decal('rune', 0.02, 2.6, 2.4, at='ground', grow=0.2, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', 0.02, 1.2, at='ground', offset=[0, 0.1, 0], scale=0.4, scaleTo=0.55, sweep=0.2, erodeFrom=0.8, alpha=0.9, shadow=False, tone='rim', tier=0, seed=5),
        smoke(0.03, 'ground', y=1.9, scale=2.0, tone='body', alpha=0.3),
        snd(0.0, 'impact', 0.5, 1.1),
    ]
    ev += feel(0.0, ms=70, sh=0.22, fl=0.1, vg=0.28, fov=1.6)
    return {'skill': 'skl_tha_co', 'replaces': ['thaco'], 'events': ev}


R['skl_tha_co'] = tha_co


# --------------------------------------------------------------------------------------------------------------------------------
def co_trieu():
    """Cổ Triều (tối thượng, hit 0,5): hũ cổ mở nắp, bầy cổ ùa ra quanh người thành vòng xoáy; ba tầng màu (lõi rêu đen có bóng đổ, thân lục, viền vàng chanh) để nổi trên nền đá sáng; slowmo + kéo máy nhẹ."""
    ev = [
        parts('spark', -0.5, 30, 2.0, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.85),
        vig(-0.45, 0.25, 500, tone='dark', tier=1),
        cam(-0.45, 0.15, 1.2, fov=3.5, tier=1),
        # vòng triện đậm: lõi tối (decal core) + vành sáng
        decal('scorch', -0.4, 7.0, 2.2, at='self', offset=[0, -1.12, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
        decal('rune', -0.4, 6.5, 1.8, at='self', offset=[0, -1.12, 0], grow=0.3, tone='rim', alpha=1, tier=0),
        mesh('rune_ring2', -0.4, 1.0, at='self', offset=[0, -1.0, 0], scale=0.5, scaleTo=1.0, sweep=0.3, erodeFrom=0.8, alpha=1, tone='core', tier=0, seed=2),
        slow(0.0, 0.45, 220, tier=2),
        snd(0.0, 'impact', 0.7, 0.75),
        flip('spark_burst', 0.0, 0.4, 4.0, at='self', offset=[0, 0.4, 0], alpha=0.7, tone='rim', tier=0),
        # sóng chấn hai lớp: thân lục có bóng + viền vàng chanh
        mesh('shock_cone', 0.02, 0.5, at='self', offset=[0, -1.0, 0], scale=[1.0] * 3, scaleTo=[7.0] * 3, alpha=0.85, sweep=0.3, erodeFrom=0.3, tone='body', tier=0, seed=3),
        mesh('shock_cone', 0.06, 0.5, at='self', offset=[0, -0.98, 0], scale=[0.8] * 3, scaleTo=[6.0] * 3, alpha=0.9, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1, seed=4),
        parts('dust', 0.0, 90, 6, 1, 1.0, 0.24, at='self', offset=[0, -0.6, 0], tone='core', grav=-0.4, tier=0),
        parts('dust', 0.0, 70, 5, 1, 0.9, 0.2, at='self', offset=[0, -0.5, 0], tone='body', grav=-0.4, tier=0),
        parts('spark', 0.0, 80, 8, 1, 0.6, 0.09, at='self', offset=[0, 0.7, 0], tone='rim', tier=0),
        smoke(0.05, 'self', y=-0.6, scale=5.0, tone='core', alpha=0.6, tier=1),
    ]
    # bầy cổ xoáy: sáu cục cổ có bóng, bay vòng quanh người ở thấp rồi tản ra (camFade để không che người)
    for i in range(6):
        a = i / 6 * math.tau
        x, z = round(math.cos(a) * 1.6, 2), round(math.sin(a) * 1.6, 2)
        x2, z2 = round(math.cos(a + 1.6) * 3.2, 2), round(math.sin(a + 1.6) * 3.2, 2)
        ev.append(mesh('pill_orb', 0.02 + 0.02 * i, 0.9, at='self', offset=[x, -0.6, z], scale=0.55, sweep=0, erodeFrom=0.9, alpha=1, tone='body' if i % 2 else 'core', camFade=True, tier=0 if i < 3 else 1, seed=30 + i,
                       move={'to': 'self', 'ease': 'out', 'offset': [x2, -0.4, z2]}))
    ev += feel(0.0, ms=60, sh=0.3, fl=0.08, vg=0.34, fov=3.5, pull=0.12)
    return {'skill': 'skl_co_trieu', 'replaces': ['cotrieu'], 'events': ev}


R['skl_co_trieu'] = co_trieu


# --------------------------------------------------------------------------------------------------------------------------------
def hut_mau_co():
    """Hút Máu Cổ (nhánh 16, hit 0,2): cổ cắn vào mục tiêu, dải đỏ-lục bị hút ngược về người ra chiêu."""
    ev = [
        parts('spark', -0.2, 16, 1.2, 1, 0.22, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.2, 'cast', 0.4, 1.3),
        glob(-0.12, 0.14, [0.1, 0.9, 0.5], [0, 1.0, 0], scale=0.8, seed=4),
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 1.0, 0], scale=1.8, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        parts('dust', 0.0, 28, 3, 1, 0.6, 0.18, at='target', offset=[0, 0.9, 0], tone='core', grav=-0.4, tier=0),
        snd(0.0, 'impact', 0.5, 1.2),
    ]
    # dải hút ngược: ba vệt sáng bay từ mục tiêu về người ra chiêu
    for i, (dx, dy) in enumerate([(0.0, 1.2), (0.5, 0.9), (-0.5, 1.5)]):
        ev.append(mesh('spark_streak', 0.02 + 0.03 * i, 0.32, at='target', offset=[dx, dy, 0], scale=1.6, shadow=False, tone='rim', alpha=0.95, tier=0 if i == 0 else 1, seed=10 + i,
                       move={'to': 'self', 'ease': 'in', 'offset': [0, 1.0, 0]}))
    ev += [
        flip('spark_burst', 0.2, 0.3, 1.8, at='self', offset=[0, 1.0, 0], alpha=0.6, tone='rim', tier=1),
        decal('rune', 0.02, 2.2, 1.8, at='ground', grow=0.2, tone='core', alpha=0.9, tier=1),
    ]
    ev += feel(0.0, ms=65, sh=0.24, fl=0.1, vg=0.28, fov=1.6)
    return {'skill': 'skl_hut_mau_co', 'replaces': ['hutmau'], 'events': ev}


R['skl_hut_mau_co'] = hut_mau_co


# --------------------------------------------------------------------------------------------------------------------------------
def co_bao():
    """Cổ Bạo (nhánh 16, vùng 7 m, hit 0,45): cổ nổ tung ở tâm vùng, điểm nổ lớn, cục cổ văng tứ phía (≤ 2,2 m), vòng bụi độc lan ra rìa, vết loang trên đất."""
    ev = [
        parts('spark', -0.45, 20, 1.4, 1, 0.3, 0.06, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.45, 0.9),
        decal('rune', -0.4, 7.0, 0.9, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.4, 0.4, at='area', offset=[0, 0.08, 0], scale=0.45, scaleTo=1.2, fit='area', sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='rim', tier=0, seed=3),
        glob(-0.2, 0.2, [0.2, 1.0, 0.6], [0, 2.6, 0], scale=1.0, seed=5),
        snd(0.0, 'impact', 0.9, 0.75, 0.04),
        mesh('burst', 0.0, 0.12, at='area', offset=[0, 3.4, 0], scale=2.6, camFade=True, billboard=True, sweep=0, tone='core', cross=True, tier=0),
        mesh('ripple', 0.0, 0.5, at='area', offset=[0, 0.12, 0], scale=0.6, scaleTo=3.2, sweep=0.4, erodeFrom=0.4, tone='rim', alpha=0.9, tier=0, seed=9),
        mesh('shock_cone', 0.02, 0.3, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[8.0] * 3, alpha=0.4, sweep=0.3, erodeFrom=0.2, tone='body', tier=1),
        decal('scorch', 0.0, 5.5, 3.0, at='area', grow=0.1, tone='core', alpha=0.85, tier=0),
        parts('dust', 0.0, 36, 6, 1, 0.5, 0.14, at='area', offset=[0, 0.6, 0], tone='body', grav=-0.4, tier=0),
        parts('spark', 0.0, 24, 8, 1, 0.5, 0.09, at='area', offset=[0, 2.6, 0], tone='rim', tier=0),
        smoke(0.04, 'area', y=0.6, scale=3.6, tone='core', alpha=0.25),
    ]
    # mảnh cổ văng: tám cục cổ bay ra rồi rơi lại, cao tối đa 2,2 m
    for i in range(8):
        a = i / 8 * math.tau + 0.3
        x, z = round(math.cos(a) * 3.4, 2), round(math.sin(a) * 3.4, 2)
        h = round(2.2 * (0.7 + 0.3 * ((i * 37) % 10) / 10), 2)
        ev.append(mesh('pill_orb', 0.0, 0.5, at='area', offset=[0, 0.5, 0], scale=0.7, sweep=0, erodeFrom=0.9, alpha=1, tone='body' if i % 2 else 'core', camFade=True, tier=0 if i < 4 else 1, seed=40 + i,
                       move={'to': 'area', 'ease': 'out', 'offset': [x, h, z]}))
    ev += feel(0.0, ms=75, sh=0.45, fl=0.0, vg=0.32, fov=2.8)
    return {'skill': 'skl_co_bao', 'replaces': ['cobao'], 'events': ev}


R['skl_co_bao'] = co_bao


# --------------------------------------------------------------------------------------------------------------------------------
def thu_co():
    """Thu Cổ (nhánh 20, quanh thân 10 m, hit 0,4): thổi sáo, vòng triện co lại, bụi và đốm sáng bị hút về người."""
    ev = [
        snd(-0.4, 'cast', 0.5, 1.2),
        parts('spark', -0.4, 24, 2.0, 1, 0.4, 0.06, at='self', offset=[0, 0.9, 0.3], inward=True, tone='rim', tier=1),
        decal('rune', -0.3, 9.5, 1.2, at='self', offset=[0, -1.12, 0], grow=0.15, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', -0.3, 0.7, at='self', offset=[0, -1.05, 0], scale=1.0, scaleTo=0.2, sweep=0.2, erodeFrom=0.8, alpha=1, shadow=False, tone='rim', tier=0, seed=6),
        mesh('ripple', -0.2, 0.6, at='self', offset=[0, -1.05, 0], scale=2.4, scaleTo=0.4, sweep=0.5, erodeFrom=0.4, alpha=0.8, shadow=False, tone='body', tier=0, seed=7),
        parts('dust', -0.2, 60, 5, 1, 0.7, 0.18, at='self', offset=[0, 0.5, 0], inward=True, tone='body', tier=0),
        snd(0.0, 'impact', 0.5, 1.1),
        flip('spark_burst', 0.0, 0.34, 2.8, at='self', offset=[0, 0.8, 0], alpha=0.7, tone='rim', tier=0),
        mesh('shock_cone', 0.02, 0.5, at='self', offset=[0, -1.0, 0], scale=[1.0] * 3, scaleTo=[5.0] * 3, alpha=0.5, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1),
        parts('spark', 0.0, 36, 5, 1, 0.45, 0.08, at='self', offset=[0, 0.8, 0], tone='rim', tier=1),
    ]
    ev += feel(0.0, ms=60, sh=0.2, fl=0.08, vg=0.24, fov=1.6)
    return {'skill': 'skl_thu_co', 'replaces': ['thuco'], 'events': ev}


R['skl_thu_co'] = thu_co


# --------------------------------------------------------------------------------------------------------------------------------
def hoa_co_vuong():
    """Hóa Cổ Vương (nhánh 20, triệu hồi, hit 0,5): cổ dồn thành một vòng sáng + sóng chấn dưới chân; bản thân CỔ VƯƠNG (con cổ khổng lồ) là hình ở lại suốt 12 giây
    của timeline tại điểm `co_vuong_stand`, client phát theo khung "xa camera" (awayFromCamera) nên luôn ở sau-trên người chơi, không nằm giữa camera và nhân vật."""
    ev = [
        parts('spark', -0.5, 32, 2.4, 1, 0.5, 0.07, at='self', offset=[0, 0.9, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.8),
        decal('scorch', -0.4, 5.5, 2.0, at='self', offset=[0, -1.12, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
        decal('rune', -0.4, 5.0, 1.8, at='self', offset=[0, -1.12, 0], grow=0.3, tone='rim', alpha=1, tier=0),
        snd(0.0, 'impact', 0.8, 0.7),
    ]

    ev += [
        mesh('burst', 0.0, 0.12, at='self', offset=[0, 0.9, 0.4], scale=2.4, billboard=True, sweep=0, tone='rim', cross=True, camFade=True, tier=0),
        # bầy cổ nhỏ xoáy quanh Cổ Vương
        parts('dust', 0.0, 26, 2.6, 1, 0.9, 0.16, at='self', offset=[0, 1.6, 0.4], tone='body', tier=0),
        # sóng chấn trên đất
        mesh('shock_cone', 0.02, 0.6, at='self', offset=[0, -1.0, 0], scale=[1.0] * 3, scaleTo=[8.0] * 3, alpha=0.85, sweep=0.3, erodeFrom=0.3, tone='body', tier=0, seed=5),
        mesh('crack_radial', 0.02, 0.9, at='self', offset=[0, -1.08, 0], scale=3.0, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=1, seed=2),
        parts('dust', 0.0, 80, 5, 1, 1.0, 0.24, at='self', offset=[0, -0.6, 0], tone='core', grav=-0.4, tier=0),
        smoke(0.05, 'self', y=-0.5, scale=4.0, tone='core', alpha=0.6),
    ]
    ev += feel(0.0, ms=60, sh=0.32, fl=0.04, vg=0.3, fov=3.0)
    return {'skill': 'skl_hoa_co_vuong', 'replaces': ['covuong'], 'events': ev}


R['skl_hoa_co_vuong'] = hoa_co_vuong


# --------------------------------------------------------------------------------------------------------------------------------
# Hiệu ứng tại điểm (rất nhẹ: nhịp cắn phát tới 4 lần mỗi giây): ≤ 3 draw, ≤ 30 hạt, không khựng/rung/chớp.
def co_bay_hit():
    return [
        mesh('burst', 0.0, 0.1, at='self', offset=[0, 1.0, 0], scale=1.1, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        parts('dust', 0.0, 10, 2.2, 1, 0.4, 0.12, at='self', offset=[0, 1.0, 0], tone='body', grav=-0.6, tier=1),
    ]


def co_vuong_hit():
    return [
        mesh('burst', 0.0, 0.12, at='self', offset=[0, 1.0, 0], scale=1.8, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        flip('spark_burst', 0.0, 0.3, 1.8, at='self', offset=[0, 1.0, 0], alpha=0.7, tone='body', tier=0),
        parts('dust', 0.0, 14, 2.6, 1, 0.5, 0.14, at='self', offset=[0, 1.0, 0], tone='core', grav=-0.6, tier=1),
    ]


def co_bay_stand():
    """Bầy cổ đứng quanh người gọi (một đoạn 3,3 s phát nối tiếp): bốn cục cổ nhỏ trôi qua lại ở thấp + bụi lục."""
    ev = []
    for i, (x, z) in enumerate([(-2.0, 0.8), (2.0, 0.8), (-1.2, 2.2), (1.2, 2.2)]):
        ev.append(mesh('pill_orb', 0.04 * i, 3.6, at='self', offset=[x, -0.45, z], scale=0.4, sweep=0.1, erodeFrom=0.9, tone='body', alpha=1, follow=True, tier=0 if i < 2 else 1, seed=60 + i,
                       move={'to': 'self', 'ease': 'inOut', 'offset': [-x * 0.7, -0.6, z * 0.9]}))
    ev.append(parts('dust', 0.0, 14, 1.2, 1, 0.9, 0.12, at='self', offset=[0, -0.6, 1.2], tone='body', grav=-1.0, tier=1))
    return ev


def co_vuong_stand():
    """Cổ Vương đứng sau-trên người gọi (khung xa camera, +z = xa camera hơn người gọi): con cổ khổng lồ có lõi tối + lớp lục sáng viền, camFade; vài hạt bụi."""
    def part(sc, tone, tier, seed, alpha=1.0, shadow=True, dy=0.0):
        k = dict(at='self', offset=[2.6, 3.6 + dy, 3.4], rot=[12, 0, 0], scale=sc, sweep=0, erodeFrom=0.98, alpha=alpha, tone=tone, camFade=True, follow=True, tier=tier, seed=seed)
        if not shadow:
            k['shadow'] = False
        return mesh('co_vuong', 0.0, 3.6, **k)

    return [
        part(2.4, 'core', 0, 70),
        part(2.2, 'body', 0, 71, 0.9, False, 0.05),
        parts('dust', 0.0, 14, 1.2, 1, 0.9, 0.14, at='self', offset=[2.6, 3.0, 3.4], tone='core', grav=-1.0, tier=1),
    ]


POINTS = {'co_bay_hit': co_bay_hit, 'co_vuong_hit': co_vuong_hit, 'co_bay_stand': co_bay_stand, 'co_vuong_stand': co_vuong_stand}


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R) + list(POINTS)
    for i in ids:
        if i in R:
            write(R[i]())
        else:
            write_point(i, POINTS[i]())
