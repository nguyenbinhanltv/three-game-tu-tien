# VFX Cổ Thần (TN-5 PR3): 5 timeline riêng (Thái Cổ Quyền, Tinh Bạo, Huyết Cự Hộ, Cổ Thần Nhất Kích, Hóa Hình).
#   python tools/vfx/recipes_cothan.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `co_than` (paths.json): core đỏ sẫm, body huyết đồng, rim vàng ngà, accent vàng cổ. Ba tầng màu trên cỏ sáng:
# lớp tối (decal cháy `shadow`, nứt `core`), lớp thân đỏ (`body`), lớp sáng (`rim`/`accent`).
# Hóa Hình có fx + pose RIÊNG (`cohoahinh`, `hoa_hinh`), nên timeline của chính chiêu `skl_hoa_hinh` tự chạy (không mượn Sơn Nhạc).
# Hai thẻ vẽ riêng cho Cổ Thần (render/vfx/cards.ts): `colossus` (Cổ Thần khổng lồ nửa thân: đầu sừng, vai, hai tay gập, viền sáng, kim văn)
# và `fist` (cự quyền). Thẻ quay mặt về camera; camera mặc định ở sau lưng người chơi nên đặt thẻ PHÍA TRƯỚC người, không nằm giữa camera và người.
# Hướng nhìn của người chơi so với camera không biết trước (chiêu không mục tiêu thì quay mặt về camera), nên thẻ lớn đặt thành CẶP đối xứng
# trước/sau người, cùng `camFade`: thẻ nằm giữa camera và người tự mờ, thẻ còn lại hiện.
# Tránh che camera/nhân vật/mục tiêu (bài học #424/#432/#444): khối đứng/cao dùng `camFade`, đá có trần 2,2 m, không phủ màu lên thân, sóng
# chấn nhỏ sát đất. Ngân sách: mỗi mốc ≤ 12 draw, cả chiêu ≤ 25, hạt ≤ 1.500.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, ground, impact, mesh, parts, shake, slow, snd, stop, vig, write  # noqa: E402
from recipes_dao import chips, embers  # noqa: E402

R = {}


def ring_wave(t, at, r0, r1, dur, tone='body', alpha=0.6, seed=1, camfade=False, y=0.0):
    """Sóng xung nằm sát đất nở từ r0 tới r1 (m); mảnh và mờ để không che thân."""
    return mesh('shock_cone', t, dur, at=at, offset=[0, y, 0], scale=[r0] * 3, scaleTo=[r1] * 3, alpha=alpha, sweep=0.3, erodeFrom=0.3, shadow=False, tone=tone, tier=1, seed=seed, camFade=camfade)


def dark_ground(t, at, r, y=0.0, crack=True):
    """Lớp tối dưới chân hiệu ứng: vết cháy + nứt sẫm để hiệu ứng nổi trên cỏ sáng."""
    ev = [decal('scorch', t, r, 3.0, at=at, offset=[0, y, 0], grow=0.08, tone='shadow', alpha=0.85, tier=0)]
    if crack:
        ev.append(decal('crack', t, r * 1.05, 2.6, at=at, offset=[0, y, 0], grow=0.1, tone='core', alpha=1, tier=1))
    return ev


# --------------------------------------------------------------------------------------------------------------------------------
def thai_co_quyen():
    """Thái Cổ Quyền (đặc trưng, hit 0,4): cự quyền huyết đồng giáng từ trên cao xuống mục tiêu (dừng trên đầu nó), sóng chấn + bụi + nứt đất."""
    ev = [
        parts('spark', -0.4, 24, 1.4, 1, 0.3, 0.07, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.7),
        # tàn ảnh quyền rơi trước, rồi cự quyền chính (viền sáng + kim văn), dừng ngay trên mục tiêu lúc trúng
        mesh('card', -0.2, 0.3, card='fist', at='target', offset=[0, 6.0, 0], move={'to': 'target', 'offset': [0, 3.0, 0], 'ease': 'in'}, billboard=True, scale=[1.9, 1.9, 1], sweep=0, erodeFrom=0.8, alpha=0.4, shadow=False, tone='core', tier=1, seed=3),
        mesh('card', -0.14, 0.5, card='fist', at='target', offset=[0, 5.4, 0], move={'to': 'target', 'offset': [0, 2.6, 0], 'ease': 'in'}, billboard=True, scale=[2.4, 2.4, 1], sweep=0, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=5),
        snd(-0.14, 'slash', 0.5, 0.65, 0.06),
        snd(0.0, 'impact', 0.9, 0.7),
        flip('spark_burst', 0.0, 0.36, 3.2, at='target', offset=[0, 1.0, 0], alpha=0.9, tone='accent', tier=0),
        ring_wave(0.0, 'ground', 0.6, 4.2, 0.4, alpha=0.85, seed=3),
        ring_wave(0.07, 'ground', 0.5, 3.2, 0.4, tone='rim', alpha=0.6, seed=4),
        flip('dust_kick', 0.02, 0.7, 3.4, at='ground', offset=[0, 0.6, 0], alpha=0.75, tone='body', tier=0),
        flip('dust_kick', 0.06, 0.7, 2.6, at='ground', offset=[0.8, 0.5, 0.4], rot=[0, 0, 30], alpha=0.55, tone='core', tier=1),
        mesh('crack_radial', 0.02, 0.9, at='ground', scale=3.6, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
    ]
    ev += dark_ground(0.02, 'ground', 3.0)
    ev += [parts('spark', 0.0, 60, 9, 1, 0.45, 0.1, at='target', offset=[0, 1.0, 0], tone='rim', tier=0)]
    ev += embers(0.02, 'target', n=40, y=1.0, speed=6)
    ev += chips(0.03, 'ground', 4, 1.6, 1.6, 0.5, seed0=1.0, shapes=('rubble_a',))
    ev += feel(0.0, ms=80, sh=0.42, fl=0.14, vg=0.34, fov=2.4)
    return {'skill': 'skl_thai_co_quyen', 'replaces': ['cothaiquyen'], 'events': ev}


R['skl_thai_co_quyen'] = thai_co_quyen


# --------------------------------------------------------------------------------------------------------------------------------
def tinh_bao():
    """Tinh Bạo (nhánh 16, vùng 8 m quanh mình, hit 0,6): dồn huyết rồi nổ thành chín tia sao tỏa ra rìa vùng, sóng xung hai lớp, lớp tối dưới đất."""
    ev = [
        parts('spark', -0.6, 50, 2.4, 1, 0.55, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.6, 'cast', 0.5, 0.65),
        decal('rune', -0.55, 8.2, 1.1, at='area', grow=0.3, tone='body', alpha=0.95, tier=0),
        mesh('rune_ring2', -0.55, 0.8, at='area', offset=[0, 0.1, 0], scale=0.45, scaleTo=0.5, fit='area', sweep=0.4, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=2),
        snd(0.0, 'impact', 0.9, 0.7, 0.04),
        flip('spark_burst', -0.02, 0.4, 3.8, at='area', offset=[0, 0.9, 0], alpha=0.9, tone='accent', tier=0),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.9, 0], scale=2.6, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        ring_wave(0.0, 'area', 1.0, 8.4, 0.5, alpha=0.7, seed=4),
        ring_wave(0.08, 'area', 0.8, 7.0, 0.5, tone='rim', alpha=0.55, seed=6),
        mesh('crack_radial', 0.0, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
    ]
    ev += dark_ground(0.0, 'area', 6.0, crack=False)
    for i in range(9):
        a = i / 9 * 360
        ev.append(mesh('rift_line', 0.0, 0.8, at='area', offset=[0, 0.12, 0], rot=[0, a, 0], scale=[1.2, 1, 8.0], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='accent' if i % 2 else 'body', tier=0 if i < 3 else 1, seed=20 + i))
    ev += [
        parts('spark', 0.0, 80, 9, 1, 0.5, 0.1, at='area', offset=[0, 0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 40, 5, 1, 0.8, 0.28, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += feel(0.0, ms=75, sh=0.4, fl=0.14, vg=0.32, fov=2.8)
    return {'skill': 'skl_tinh_bao', 'replaces': ['cotinhbao'], 'events': ev}


R['skl_tinh_bao'] = tinh_bao


# --------------------------------------------------------------------------------------------------------------------------------
def huyet_cu_ho():
    """Huyết Cự Hộ (nhánh 16, thủ, hit 0,4): dựng thế, vành triện huyết đồng + vòng tối dưới chân; phản đòn bật tia sáng. Không phủ màu lên thân."""
    G = -1.12
    ev = [
        parts('spark', -0.4, 22, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.7),
        decal('scorch', -0.25, 3.6, 5.0, at='self', offset=[0, G, 0], grow=0.2, tone='shadow', alpha=0.8, tier=1),
        decal('rune', -0.2, 3.6, 5.2, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.2, 4.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.6, sweep=0.2, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', follow=True, tier=0, seed=4),
        ring_wave(0.0, 'self', 0.8, 3.4, 0.4, alpha=0.8, camfade=True, seed=5, y=G),
        flip('spark_burst', 0.0, 0.34, 2.6, at='self', offset=[0, 0.2, 0], alpha=0.8, tone='accent', tier=0),
        snd(0.0, 'block', 0.6, 0.7, 0.05),
        parts('spark', 0.0, 40, 5, 1, 0.5, 0.08, at='self', offset=[0, 0.2, 0], tone='rim', tier=1),
        stop(0.0, 55),
        shake(0.0, 0.2),
        flash(0.0, 0.08, tier=0),
    ]
    return {'skill': 'skl_huyet_cu_ho', 'replaces': ['cohuyetcu'], 'events': ev}


R['skl_huyet_cu_ho'] = huyet_cu_ho


# --------------------------------------------------------------------------------------------------------------------------------
def nhat_kich():
    """Cổ Thần Nhất Kích (tối thượng, vùng 9 m quanh mình, hit 0,45): dồn huyết rồi giáng xuống, cự quyền phía trước mờ hiện, hố chấn + ba sóng xung."""
    ev = [
        parts('spark', -0.5, 60, 2.6, 1, 0.5, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.62),
        vig(-0.45, 0.3, 500, tier=1),
        cam(-0.45, 0.2, 1.4, fov=4.0, tier=1),
        decal('rune', -0.45, 9.2, 1.3, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='area', offset=[0, 0.1, 0], scale=1.0, scaleTo=1.02, fit='area', alpha=1, sweep=0.5, erodeFrom=0.85, shadow=False, tone='rim', tier=0, seed=2),
        # cự quyền khổng lồ giáng xuống phía trước vùng (không đè lên người chơi), viền sáng + kim văn
        mesh('card', -0.25, 0.7, card='fist', at='self', offset=[0, 7.0, 6.5], move={'to': 'self', 'offset': [0, 3.4, 6.5], 'ease': 'in'}, billboard=True, scale=[4.2, 4.2, 1], sweep=0, erodeFrom=0.7, alpha=1, shadow=False, tone='body', camFade=True, tier=0, seed=7),
        mesh('card', -0.25, 0.7, card='fist', at='self', offset=[0, 7.0, -6.5], move={'to': 'self', 'offset': [0, 3.4, -6.5], 'ease': 'in'}, billboard=True, scale=[4.2, 4.2, 1], sweep=0, erodeFrom=0.7, alpha=1, shadow=False, tone='body', camFade=True, tier=0, seed=8),
        slow(0.0, 0.4, 260, tier=2),
        snd(-0.3, 'slash', 0.6, 0.62, 0.05),
        snd(0.0, 'impact', 1.0, 0.6, 0.04),
        snd(0.02, 'crit', 0.5, 0.8, 0.05),
        flip('spark_burst', 0.0, 0.4, 4.8, at='area', offset=[0, 1.2, 0], alpha=0.85, tone='accent', tier=0),
        mesh('burst', -0.02, 0.12, at='area', offset=[0, 1.2, 0], scale=3.0, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        mesh('crack_radial', -0.02, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        ring_wave(0.0, 'area', 1.0, 9.6, 0.55, alpha=0.7, seed=3),
        ring_wave(0.1, 'area', 0.8, 8.4, 0.55, tone='rim', alpha=0.55, seed=4),
        ring_wave(0.2, 'area', 0.6, 7.0, 0.55, tone='accent', alpha=0.5, seed=5),
    ]
    ev += dark_ground(-0.02, 'area', 9.0)
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
    """Hóa Hình (tư thế, hit 0,6 = lúc thân bắt đầu to ra): Cổ Thần khổng lồ nửa thân (đầu sừng, vai, hai tay gập, viền sáng + kim văn)
    mọc từ dưới lên sau lưng mục tiêu phía trước rồi tan; sóng chấn nhỏ sát đất, vành triện, nứt đất. Không phủ màu lên thân, không rải đá."""
    G = -1.12
    ev = [
        parts('spark', -0.5, 46, 2.2, 1, 0.5, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.62),
        stop(0.0, 70),
        slow(0.0, 0.35, 300, tier=2),
        cam(0.0, 0.4, 1.2, fov=4.5, tier=1),
        vig(0.0, 0.3, 700, tier=1),
        shake(0.0, 0.5),
        flash(0.0, 0.14, tier=0),
        snd(0.0, 'impact', 1.0, 0.62, 0.04),
        snd(0.04, 'crit', 0.5, 0.7, 0.05),
        # bóng Cổ Thần khổng lồ: thẻ `colossus` đứng phía trước người chơi (camera ở sau lưng) nên người chơi nổi lên trước nó; mọc từ đất lên
        mesh('card', -0.1, 1.5, card='colossus', at='self', offset=[0, 3.8, 7.5], billboard=True, scale=[6.0, 9.0, 1], sweep=0.22, erodeFrom=0.7, alpha=0.74, shadow=False, tone='body', camFade=True, tier=0, seed=31),
        mesh('card', -0.1, 1.5, card='colossus', at='self', offset=[0, 3.8, -7.5], billboard=True, scale=[6.0, 9.0, 1], sweep=0.22, erodeFrom=0.7, alpha=0.74, shadow=False, tone='body', camFade=True, tier=0, seed=32),
        # vành triện + lớp tối + nứt dưới chân
        decal('scorch', -0.1, 5.2, 2.8, at='self', offset=[0, G, 0], grow=0.15, tone='shadow', alpha=0.8, tier=1),
        decal('rune', 0.0, 6.0, 2.4, at='self', offset=[0, G, 0], grow=0.2, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', 0.0, 1.4, at='self', offset=[0, G + 0.1, 0], scale=0.5, scaleTo=0.75, sweep=0.3, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=3),
        ring_wave(0.0, 'self', 1.0, 5.0, 0.5, alpha=0.6, seed=4, camfade=True, y=G),
        ring_wave(0.1, 'self', 0.8, 4.0, 0.5, tone='rim', alpha=0.5, seed=5, camfade=True, y=G),
        decal('crack', 0.02, 4.8, 2.4, at='self', offset=[0, G, 0], grow=0.1, tone='core', alpha=1, tier=1),
        flip('spark_burst', 0.02, 0.4, 3.2, at='self', offset=[0, 0.4, 0], alpha=0.7, tone='accent', tier=0),
        parts('spark', 0.0, 90, 9, 1, 0.55, 0.1, at='self', offset=[0, -0.8, 0], tone='rim', tier=0),
        parts('dust', 0.0, 50, 4, 1, 0.9, 0.3, at='self', offset=[0, -1.0, 0], tone='core', tier=1),
    ]
    ev += embers(0.05, 'self', n=60, y=0.6, speed=6)
    return {'skill': 'skl_hoa_hinh', 'replaces': ['cohoahinh'], 'events': ev}


R['skl_hoa_hinh'] = hoa_hinh


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
