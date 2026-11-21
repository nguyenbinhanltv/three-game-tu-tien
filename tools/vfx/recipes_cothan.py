# VFX Cổ Thần (TN-5 PR3): 4 timeline riêng (Thái Cổ Quyền, Tinh Bạo, Huyết Cự Hộ, Cổ Thần Nhất Kích) + cảnh Hóa Hình (`fx_co_hoa_hinh`).
#   python tools/vfx/recipes_cothan.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `co_than` (paths.json): core đỏ sẫm, body huyết đồng, rim vàng ngà, accent vàng cổ.
# Chiêu tư thế (Hình Quyền/Hình Chấn/Hình Giáp) mượn hình của chiêu nền nên không có timeline riêng; Hóa Hình (tư thế) mượn fx `sonnhac`,
# nên cảnh biến hình là timeline `trigger: fx` (`fxKind: hoahinh`) do server phát thêm một `S.FX` lúc vào tư thế.
# Tránh che camera/nhân vật/mục tiêu (bài học #424/#432/#444): khối cao hoặc đứng có `camFade`, đá có trần 2,2 m, không khối cộng sáng
# lớn gần camera, không phủ màu lên thân nhân vật (chỉ viền sáng + vân + hạt). Ngân sách: mỗi mốc ≤ 12 draw, cả chiêu ≤ 25, hạt ≤ 1.500.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, ground, impact, mesh, parts, shake, slow, snd, stop, vig, write  # noqa: E402
from recipes_dao import chips, embers  # noqa: E402

R = {}


def ring_wave(t, at, r0, r1, dur, tone='rim', alpha=0.8, seed=1, camfade=False, y=0.0):
    """Sóng xung nằm sát đất nở từ r0 tới r1 (m)."""
    return mesh('shock_cone', t, dur, at=at, offset=[0, y, 0], scale=[r0] * 3, scaleTo=[r1] * 3, alpha=alpha, sweep=0.3, erodeFrom=0.3, shadow=False, tone=tone, tier=1, seed=seed, camFade=camfade)


# --------------------------------------------------------------------------------------------------------------------------------
def thai_co_quyen():
    """Thái Cổ Quyền (đặc trưng, hit 0,4): một quyền nặng đẩy sóng khí thẳng tới mục tiêu, vỡ thành sóng xung + nứt đất + tàn lửa."""
    ev = [
        parts('spark', -0.4, 24, 1.4, 1, 0.3, 0.07, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.7),
        # sóng khí đầu quyền lao tới mục tiêu
        mesh('shock_cone', -0.12, 0.26, at='ahead', offset=[0, 0.95, 0.7], scale=[0.7] * 3, scaleTo=[1.8] * 3, alpha=0.85, sweep=0.25, erodeFrom=0.4, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='body', tier=0, seed=2),
        mesh('slash_thick', -0.1, 0.22, at='ahead', offset=[0, 0.95, 0.6], rot=[0, 0, 90], scale=1.3, scaleTo=2.2, sweep=0.35, erodeFrom=0.45, ragged=0.5, shadow=False, move={'to': 'target', 'ahead': 9, 'ease': 'out'}, tone='rim', alpha=0.9, seed=5, tier=1),
        snd(-0.1, 'slash', 0.45, 0.6, 0.06),
        snd(0.0, 'impact', 0.8, 0.75),
    ]
    ev += impact(0.0, burst=2.3)
    ev += ground(0.0, at='ground', r=3.0, cone=3.4, crackscale=3.4, dust=False)
    ev.append(ring_wave(0.02, 'ground', 0.6, 3.2, 0.4, seed=3))
    ev += embers(0.02, 'target', n=40, y=1.0, speed=6)
    ev += chips(0.03, 'ground', 4, 1.6, 1.6, 0.5, seed0=1.0, shapes=('rubble_a',))
    ev += feel(0.0, ms=80, sh=0.38, fl=0.14, vg=0.34, fov=2.4)
    return {'skill': 'skl_thai_co_quyen', 'replaces': ['cothaiquyen'], 'events': ev}


R['skl_thai_co_quyen'] = thai_co_quyen


# --------------------------------------------------------------------------------------------------------------------------------
def tinh_bao():
    """Tinh Bạo (nhánh 16, vùng 8 m quanh mình, hit 0,6): dồn huyết rồi nổ thành chín tia sao tỏa ra rìa vùng, sóng xung hai lớp."""
    ev = [
        parts('spark', -0.6, 50, 2.4, 1, 0.55, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.6, 'cast', 0.5, 0.65),
        decal('rune', -0.55, 8.2, 1.1, at='area', grow=0.3, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', -0.55, 0.8, at='area', offset=[0, 0.1, 0], scale=0.45, scaleTo=0.5, fit='area', sweep=0.4, erodeFrom=0.8, alpha=0.9, shadow=False, tone='rim', tier=0, seed=2),
        snd(0.0, 'impact', 0.9, 0.7, 0.04),
        flip('spark_burst', -0.02, 0.4, 3.6, at='area', offset=[0, 0.9, 0], alpha=0.85, tone='accent', tier=0),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.9, 0], scale=2.4, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        ring_wave(0.0, 'area', 1.0, 8.4, 0.5, alpha=0.85, seed=4),
        ring_wave(0.08, 'area', 0.8, 7.2, 0.5, tone='body', alpha=0.7, seed=6),
        mesh('crack_radial', 0.0, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        decal('scorch', 0.0, 5.6, 3.0, at='area', grow=0.05, tone='shadow', alpha=0.8, tier=1),
    ]
    # chín tia sao tỏa đều ra rìa vùng (thấp, sát đất)
    for i in range(9):
        a = i / 9 * 360
        ev.append(mesh('rift_line', 0.0, 0.8, at='area', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.0, 1, 8.0], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='accent' if i % 2 else 'core', tier=0 if i < 3 else 1, seed=20 + i))
    ev += [
        parts('spark', 0.0, 80, 9, 1, 0.5, 0.1, at='area', offset=[0, 0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 40, 5, 1, 0.8, 0.28, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += feel(0.0, ms=75, sh=0.4, fl=0.14, vg=0.32, fov=2.8)
    return {'skill': 'skl_tinh_bao', 'replaces': ['cotinhbao'], 'events': ev}


R['skl_tinh_bao'] = tinh_bao


# --------------------------------------------------------------------------------------------------------------------------------
def huyet_cu_ho():
    """Huyết Cự Hộ (nhánh 16, thủ, hit 0,4): dựng thế, vành triện huyết đồng dưới chân; phản đòn bật tia sáng. Không phủ màu lên thân."""
    G = -1.12
    ev = [
        parts('spark', -0.4, 22, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.7),
        decal('rune', -0.2, 3.4, 5.2, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.9, tier=0),
        mesh('rune_ring2', -0.2, 4.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.6, sweep=0.2, erodeFrom=0.8, alpha=0.85, shadow=False, tone='rim', follow=True, tier=0, seed=4),
        ring_wave(0.0, 'self', 0.8, 3.2, 0.4, camfade=True, seed=5, y=G),
        flip('spark_burst', 0.0, 0.34, 2.4, at='self', offset=[0, 0.2, 0], alpha=0.7, tone='body', tier=0),
        snd(0.0, 'block', 0.6, 0.7, 0.05),
        parts('spark', 0.0, 36, 5, 1, 0.5, 0.08, at='self', offset=[0, 0.2, 0], tone='rim', tier=1),
        stop(0.0, 55),
        shake(0.0, 0.2),
        flash(0.0, 0.08, tier=0),
    ]
    return {'skill': 'skl_huyet_cu_ho', 'replaces': ['cohuyetcu'], 'events': ev}


R['skl_huyet_cu_ho'] = huyet_cu_ho


# --------------------------------------------------------------------------------------------------------------------------------
def nhat_kich():
    """Cổ Thần Nhất Kích (tối thượng, vùng 9 m quanh mình, hit 0,45): dồn huyết rồi giáng xuống đất, hố chấn + ba sóng xung + nứt đất."""
    ev = [
        parts('spark', -0.5, 60, 2.6, 1, 0.5, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.62),
        vig(-0.45, 0.3, 500, tier=1),
        cam(-0.45, 0.2, 1.4, fov=4.0, tier=1),
        decal('rune', -0.45, 9.2, 1.3, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='area', offset=[0, 0.1, 0], scale=1.0, scaleTo=1.02, fit='area', alpha=1, sweep=0.5, erodeFrom=0.85, shadow=False, tone='rim', tier=0, seed=2),
        snd(-0.3, 'slash', 0.6, 0.62, 0.05),
        slow(0.0, 0.4, 260, tier=2),
        snd(0.0, 'impact', 1.0, 0.6, 0.04),
        snd(0.02, 'crit', 0.5, 0.8, 0.05),
        flip('spark_burst', 0.0, 0.4, 4.8, at='area', offset=[0, 1.2, 0], alpha=0.8, tone='accent', tier=0),
        mesh('burst', -0.02, 0.12, at='area', offset=[0, 1.2, 0], scale=3.0, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        mesh('crack_radial', -0.02, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        decal('crack', -0.02, 9.0, 3.0, at='area', grow=0.05, tone='core', alpha=1, tier=1),
        decal('scorch', -0.02, 6.4, 3.2, at='area', grow=0.05, tone='shadow', alpha=0.85, tier=0),
        ring_wave(0.0, 'area', 1.0, 9.6, 0.55, alpha=0.9, seed=3),
        ring_wave(0.1, 'area', 0.8, 8.4, 0.55, tone='body', alpha=0.75, seed=4),
        ring_wave(0.2, 'area', 0.6, 7.0, 0.55, tone='accent', alpha=0.6, seed=5),
    ]
    for i, a in enumerate([20, 90, 160, 230, 300]):
        ev.append(mesh('rift_line', 0.0, 0.9, at='area', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.4, 1, 9.0], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='core', tier=0 if i == 0 else 1, seed=10 + i))
    ev += [
        parts('spark', 0.0, 110, 10, 1, 0.5, 0.1, at='area', offset=[0, 1.0, 0], tone='rim', tier=0),
        parts('dust', 0.0, 60, 5, 1, 0.8, 0.28, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += chips(-0.02, 'area', 8, 3.0, 2.2, 1.0, seed0=0.5)
    ev += embers(0.04, 'area', n=70, y=1.0, speed=7)
    ev += feel(0.0, ms=80, sh=0.55, fl=0.14, vg=0.4, fov=4.5, pull=0.2)
    return {'skill': 'skl_co_than_nhat_kich', 'replaces': ['conhatkich'], 'events': ev}


R['skl_co_than_nhat_kich'] = nhat_kich


# --------------------------------------------------------------------------------------------------------------------------------
def hoa_hinh():
    """Hóa Hình (cảnh biến hình, t=0 lúc vào tư thế): sóng chấn mặt đất, bóng Cổ Thần khổng lồ thoáng qua phía sau, vành triện + hạt.
    Không phủ màu lên thân: chỉ viền sáng dưới chân, vân triện, hạt tàn lửa bay lên theo thân đang to ra (0,45 s)."""
    G = -1.12
    ev = [
        parts('spark', -0.3, 40, 2.2, 1, 0.45, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.3, 'cast', 0.55, 0.62),
        # thân to ra: khựng ngắn + kéo máy + co hình vignette nhẹ
        stop(0.0, 70),
        slow(0.0, 0.35, 300, tier=2),
        cam(0.0, 0.4, 1.2, fov=4.5, tier=1),
        vig(0.0, 0.3, 700, tier=1),
        shake(0.0, 0.5),
        flash(0.0, 0.16, tier=0),
        snd(0.0, 'impact', 1.0, 0.62, 0.04),
        snd(0.04, 'crit', 0.5, 0.7, 0.05),
        # vành triện lớn dưới chân + sóng chấn mặt đất hai lớp
        decal('rune', 0.0, 6.0, 2.4, at='self', offset=[0, G, 0], grow=0.2, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', 0.0, 1.4, at='self', offset=[0, G + 0.1, 0], scale=0.5, scaleTo=0.75, sweep=0.3, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=3),
        ring_wave(0.0, 'self', 1.0, 7.5, 0.55, tone='body', alpha=1.0, seed=4, camfade=True, y=G),
        ring_wave(0.1, 'self', 0.8, 6.0, 0.55, tone='rim', alpha=0.85, seed=5, camfade=True, y=G),
        decal('crack', 0.02, 5.4, 2.4, at='self', offset=[0, G, 0], grow=0.1, tone='core', alpha=1, tier=1),
        mesh('crack_radial', 0.02, 1.0, at='self', offset=[0, G, 0], scale=5.0, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        # bóng Cổ Thần khổng lồ: thẻ `ghost` (hình người) đứng phía sau người chơi, thoáng qua rồi tan; `camFade` để không che camera
        mesh('card', 0.0, 1.0, card='ghost', at='self', offset=[0, 5.0, 5.0], billboard=True, scale=[8.0, 16.0, 1], sweep=0.1, erodeFrom=0.25, alpha=0.95, shadow=False, tone='body', camFade=True, tier=0, seed=31),
        mesh('card', 0.05, 0.8, card='ghost', at='self', offset=[-5.0, 3.8, 4.0], billboard=True, scale=[5.2, 10.4, 1], sweep=0.1, erodeFrom=0.25, alpha=0.6, shadow=False, tone='core', camFade=True, tier=1, seed=32),
        mesh('card', 0.05, 0.8, card='ghost', at='self', offset=[5.0, 3.8, 4.0], billboard=True, scale=[5.2, 10.4, 1], sweep=0.1, erodeFrom=0.25, alpha=0.6, shadow=False, tone='core', camFade=True, tier=1, seed=33),
        flip('spark_burst', 0.02, 0.4, 3.4, at='self', offset=[0, 0.4, 0], alpha=0.7, tone='accent', tier=0),
        parts('spark', 0.0, 90, 9, 1, 0.55, 0.1, at='self', offset=[0, -0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 50, 4, 1, 0.9, 0.3, at='self', offset=[0, -1.0, 0], tone='core', tier=1),
    ]
    ev += embers(0.05, 'self', n=60, y=0.6, speed=6)
    return {'skill': 'fx_co_hoa_hinh', 'trigger': 'fx', 'fxKind': 'hoahinh', 'method': 'co_than_quyet', 'events': ev}


R['fx_co_hoa_hinh'] = hoa_hinh


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
