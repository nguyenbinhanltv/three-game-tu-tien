# VFX Lôi tu (TN-9 PR3): 6 timeline riêng (Lôi Ấn Kích, Cửu Tiêu Thiên Lôi, Phích Lịch Tuyến, Lôi Võng, Lôi Phạt, Lôi Hải).
#   python tools/vfx/recipes_loi.py [id chiêu ...]      → ghi packages/content/data/fx/<id>.json
# Màu theo bảng màu hướng tu `loi_tu` (paths.json): core tím đen, body tím điện, rim trắng xanh, accent vàng chớp. SÉT BA TẦNG MÀU, mỗi tia là ba bản
# LỒNG NHAU của cùng một hình: viền tối rộng (`core` tím đen) → thân tím-lam (`body`) → lõi trắng xanh mảnh (`rim`); dưới đất có lớp tối (`scorch`/`crack`)
# để sét nổi trên đá sáng; điểm đánh có decal `strike` và `spark_burst` vàng chớp (`accent`).
# Hình tia là `bolt`/`bolt_b`/`bolt_c` (render/vfx/fxLib.ts `boltStrips`): dải zigzag có hai nhánh rẽ; ba biến thể là ba đường khác nhau, phát LUÂN PHIÊN
# từng khung ngắn (~0,06 s) nên sét CHẬP CHỜN thay vì đứng yên. Cột sét dựng đứng (rot -90° quanh X → +Z thành +Y), neo ở mặt đất, cao tới mây.
# Tia nối người ra chiêu tới mục tiêu nằm ngang (neo `self`, hướng theo `aim`). Tránh che camera/nhân vật/mục tiêu: khối đứng có `camFade`; hiệu ứng ngắn
# thì kéo dài đủ lâu (≥ 0,7 s sau lúc trúng) vì ảnh chụp có độ trễ. Chiêu của tư thế và chiêu lướt mượn hình nên không có timeline.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flash, flip, mesh, parts, shake, slow, snd, stop, vig, write  # noqa: E402
from recipes_dao import embers  # noqa: E402
from recipes_cothan import dark_ground, ring_wave  # noqa: E402

R = {}
BV = ['bolt', 'bolt_b', 'bolt_c']
UP = [-90, 0, 0]


def layers(shape, t, dur, at, off, rot, w, length, seed, cf, thin=False):
    """Ba bản lồng nhau của một tia: viền tối (to), thân tím-lam, lõi trắng (nhỏ). `thin` bỏ viền tối (tia phụ, tiết kiệm draw)."""
    out = []
    spec = [('core', 1.0, 0.85), ('body', 0.62, 1.0), ('rim', 0.3, 1.0)] if not thin else [('body', 0.62, 1.0), ('rim', 0.3, 1.0)]
    for i, (tone, k, a) in enumerate(spec):
        kw = dict(at=at, offset=off, scale=[w * k, w * k, length], sweep=0, erodeFrom=0.7, ragged=0.0, shadow=False, tone=tone, alpha=a, camFade=cf, tier=0 if i else 1, seed=seed + i)
        if rot is not None:
            kw['rot'] = rot
        out.append(mesh(shape, t, dur, **kw))
    return out


def flicker(t0, n, step, at, off, rot, w, length, seed, cf=True, thin=False):
    """n khung sét luân phiên ba biến thể, mỗi khung sống ~1,25 bước: sét chập chờn."""
    out = []
    for k in range(n):
        out += layers(BV[(k + seed) % 3], t0 + k * step, step * 1.25, at, off, rot, w * (0.9 + 0.2 * ((k * 7) % 3) / 2), length, seed + 10 * k, cf, thin)
    return out


def column(t0, at, dx, dz, h, w=1.0, n=5, step=0.06, seed=1, thin=False):
    """Cột sét đứng ở (dx, dz) quanh `at`, cao h m, chập chờn n khung bắt đầu từ t0."""
    return flicker(t0, n, step, at, [dx, 0.0, dz], UP, w, h, seed, True, thin)


def link(t0, n, step, off_y, length, w=0.6, seed=3, thin=True):
    """Tia ngang nối từ người ra chiêu về phía mục tiêu/đường chém (neo `self`, hướng theo `aim`)."""
    return flicker(t0, n, step, 'self', [0, off_y, 0.4], None, w, length, seed, True, thin)


def strike(t, at, r, dur=2.2, offset=None):
    """Điểm đánh: decal `strike` (vệt chớp trên đất)."""
    return [decal('strike', t, r, dur, at=at, offset=offset or [0, 0, 0], grow=0.1, tone='accent', alpha=1, tier=0)]


# --------------------------------------------------------------------------------------------------------------------------------
def loi_an_kich():
    """Lôi Ấn Kích (đặc trưng, hit 0,3): tia sét nối từ người tới mục tiêu rồi một cột sét đánh xuống đầu nó khắc ấn; chớp vàng, sóng xung, nứt, bụi."""
    ev = [
        parts('spark', -0.3, 22, 1.4, 1, 0.28, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'cast', 0.5, 1.1),
    ]
    ev += link(-0.22, 5, 0.06, 1.0, 7.0, 0.8, seed=2)
    ev += column(-0.1, 'target', 0.0, 0.0, 8.0, 1.0, n=6, step=0.06, seed=11)
    ev += [
        snd(-0.1, 'slash', 0.5, 1.3, 0.06),
        snd(0.0, 'crit', 0.7, 1.0),
        flip('spark_burst', 0.0, 0.6, 3.6, at='target', offset=[0, 1.0, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 1.0, 0], scale=2.8, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        ring_wave(0.0, 'ground', 0.6, 4.0, 0.8, tone='body', alpha=0.9, seed=3),
        ring_wave(0.07, 'ground', 0.5, 3.0, 0.8, tone='rim', alpha=0.7, seed=4),
        mesh('crack_radial', 0.02, 1.4, at='ground', scale=3.4, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        flip('dust_kick', 0.03, 1.0, 2.8, at='ground', offset=[0, 0.5, 0], alpha=0.6, tone='core', tier=1),
    ]
    ev += strike(0.0, 'target', 3.4, 1.8)
    ev += dark_ground(0.02, 'ground', 2.8)
    ev += [parts('spark', 0.0, 70, 9, 1, 0.5, 0.09, at='target', offset=[0, 1.0, 0], tone='rim', tier=0)]
    ev += embers(0.02, 'target', n=36, y=1.0, speed=6)
    ev += feel(0.0, ms=70, sh=0.34, fl=0.2, vg=0.3, fov=2.2)
    return {'skill': 'skl_loi_an_kich', 'replaces': ['loiankich'], 'events': ev}


R['skl_loi_an_kich'] = loi_an_kich


# --------------------------------------------------------------------------------------------------------------------------------
def cuu_tieu():
    """Cửu Tiêu Thiên Lôi (tối thượng, hit 0,5): ba cột thiên lôi (một chính, hai lệch) chập chờn giáng xuống mục tiêu, vòng triện tím điện,
    ba sóng xung, nứt tỏa; làm chậm + kéo máy."""
    ev = [
        parts('spark', -0.5, 60, 2.6, 1, 0.5, 0.08, at='self', offset=[0, 0.9, 0], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.8),
        vig(-0.45, 0.3, 500, tier=1),
        cam(-0.45, 0.2, 1.4, fov=4.0, tier=1),
        decal('rune', -0.45, 6.0, 1.4, at='target', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.45, 1.0, at='target', offset=[0, 0.1, 0], scale=0.9, scaleTo=1.0, sweep=0.5, erodeFrom=0.85, alpha=1, shadow=False, tone='rim', tier=0, seed=2),
    ]
    ev += column(-0.26, 'target', 0.0, 0.0, 16.0, 1.5, n=8, step=0.06, seed=21)
    ev += column(-0.18, 'target', 2.4, 1.0, 14.0, 1.0, n=4, step=0.07, seed=31, thin=True)
    ev += column(-0.12, 'target', -2.2, -1.2, 14.0, 1.0, n=4, step=0.07, seed=41, thin=True)
    ev += [
        slow(0.0, 0.4, 260, tier=2),
        snd(-0.3, 'slash', 0.6, 0.7, 0.05),
        snd(0.0, 'impact', 1.0, 0.7, 0.04),
        snd(0.02, 'crit', 0.6, 0.9, 0.05),
        flip('spark_burst', 0.0, 0.6, 5.0, at='target', offset=[0, 1.2, 0], alpha=0.95, tone='accent', tier=0),
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
    """Phích Lịch Tuyến (nhánh 16, hit 0,4): tia sét bay từ người ra mục tiêu (neo `target`, KHÔNG neo theo hướng nhìn: chiêu đường thẳng không có
    `tgt` thì hướng là hướng nhìn của người chơi, dễ lệch khỏi mục tiêu), chập chờn zigzag rẽ nhánh; nổ tại mục tiêu: ba cột sét + chớp + vết cháy."""
    ev = [
        parts('spark', -0.4, 20, 1.3, 1, 0.3, 0.06, at='self', offset=[0, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 1.1),
    ]
    # tia nối: mỗi khung là một tia ngắn bay từ người tới mục tiêu (hướng mũi theo hướng bay), luân phiên ba biến thể
    for k in range(8):
        for i, (tone, kk, al) in enumerate([('core', 1.0, 0.85), ('body', 0.62, 1.0), ('rim', 0.3, 1.0)]):
            ev.append(mesh(BV[k % 3], -0.28 + k * 0.06, 0.11, at='self', offset=[0, 0.0, 0.4], scale=[0.9 * kk, 0.9 * kk, 5.0], sweep=0, erodeFrom=0.7, ragged=0.0, shadow=False,
                           move={'to': 'target', 'ease': 'linear'}, tone=tone, alpha=al, camFade=True, tier=0 if i else 1, seed=2 + 10 * k + i))
    # nổ tại mục tiêu: ba cột sét (một chính, hai phụ), chớp vàng, vết cháy, nứt, bụi
    ev += column(-0.08, 'target', 0.0, 0.0, 9.0, 1.2, n=6, step=0.06, seed=60)
    ev += column(-0.04, 'target', 1.6, 0.8, 7.0, 0.8, n=5, step=0.06, seed=65, thin=True)
    ev += column(0.0, 'target', -1.6, -0.8, 7.0, 0.8, n=5, step=0.06, seed=70, thin=True)
    ev += [
        snd(-0.2, 'slash', 0.5, 1.3, 0.06),
        snd(0.0, 'impact', 0.7, 1.0),
        flip('spark_burst', 0.0, 0.6, 3.6, at='target', offset=[0, 0.9, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 1.0, 0], scale=2.8, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        ring_wave(0.0, 'ground', 0.6, 3.8, 0.8, tone='body', alpha=0.9, seed=3),
        mesh('crack_radial', 0.02, 1.4, at='ground', scale=3.2, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        flip('dust_kick', 0.03, 1.0, 2.6, at='ground', offset=[0, 0.5, 0], alpha=0.6, tone='core', tier=1),
        parts('spark', 0.0, 70, 9, 1, 0.5, 0.09, at='target', offset=[0, 1.0, 0], tone='rim', tier=0),
    ]
    ev += strike(0.0, 'target', 3.4, 1.8)
    ev += dark_ground(0.02, 'ground', 2.8)
    ev += feel(0.0, ms=70, sh=0.32, fl=0.2, vg=0.28, fov=2.0)
    return {'skill': 'skl_phich_lich', 'replaces': ['phichlich'], 'events': ev}


R['skl_phich_lich'] = phich_lich


# --------------------------------------------------------------------------------------------------------------------------------
def loi_vong():
    """Lôi Võng (nhánh 16, thủ, hit 0,4): lưới lôi: sáu tia sét ngang chập chờn tỏa từ chân ra rìa vòng triện; phản đòn bật tia. Không phủ lên thân."""
    G = -1.12
    ev = [
        parts('spark', -0.4, 24, 1.2, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 1.1),
        decal('scorch', -0.25, 3.8, 5.0, at='self', offset=[0, G, 0], grow=0.2, tone='shadow', alpha=0.8, tier=1),
        decal('rune', -0.2, 3.8, 5.2, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.2, 4.0, at='self', offset=[0, G + 0.1, 0], scale=0.4, scaleTo=0.62, sweep=0.2, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', follow=True, tier=0, seed=4),
        ring_wave(0.0, 'self', 0.8, 3.6, 0.7, tone='body', alpha=0.85, camfade=True, seed=5, y=G),
        flip('spark_burst', 0.0, 0.5, 2.6, at='self', offset=[0, 0.2, 0], alpha=0.85, tone='accent', tier=0),
        snd(0.0, 'block', 0.6, 1.1, 0.05),
        parts('spark', 0.0, 44, 5, 1, 0.55, 0.08, at='self', offset=[0, 0.2, 0], tone='rim', tier=1),
        stop(0.0, 55),
        shake(0.0, 0.2),
        flash(0.0, 0.1, tier=0),
    ]
    for a in (0, 120, 240):
        ev += flicker(0.0, 8, 0.07, 'self', [0, G + 0.35, 0], [0, a, 0], 0.7, 3.2, seed=a // 40 + 70, cf=True, thin=True)
    for a in (60, 180, 300):
        ev += flicker(0.03, 7, 0.07, 'self', [0, G + 0.3, 0], [0, a, 0], 0.5, 2.2, seed=a // 40 + 80, cf=True, thin=True)
    return {'skill': 'skl_loi_vong', 'replaces': ['loivong'], 'events': ev}


R['skl_loi_vong'] = loi_vong


# --------------------------------------------------------------------------------------------------------------------------------
def loi_phat():
    """Lôi Phạt (nhánh 20, khống, hit 0,4): MỘT CỘT SÉT lớn giáng từ trời xuống mục tiêu (lõi trắng chói, thân tím-lam rẽ nhánh, viền tối), chớp vàng mặt đất,
    vết cháy, bụi; vòng triện ghìm dưới chân nó ở lại trong lúc choáng."""
    ev = [
        parts('spark', -0.4, 22, 1.3, 1, 0.3, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 0.95),
        decal('rune', -0.25, 4.0, 2.8, at='target', grow=0.25, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.25, 2.0, at='target', offset=[0, 0.1, 0], scale=0.5, scaleTo=0.55, sweep=0.25, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=4),
    ]
    ev += column(-0.2, 'target', 0.0, 0.0, 14.0, 1.9, n=9, step=0.06, seed=81)
    ev += column(-0.12, 'target', 1.5, 0.6, 10.0, 0.9, n=6, step=0.07, seed=91, thin=True)
    ev += column(-0.08, 'target', -1.4, -0.5, 10.0, 0.9, n=6, step=0.07, seed=101, thin=True)
    ev += [
        snd(0.0, 'impact', 0.8, 0.9),
        snd(0.02, 'crit', 0.5, 1.0, 0.05),
        flip('spark_burst', 0.0, 0.6, 4.4, at='target', offset=[0, 0.9, 0], alpha=0.95, tone='accent', tier=0),
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 1.0, 0], scale=3.4, billboard=True, sweep=0, tone='rim', cross=True, tier=0),
        ring_wave(0.0, 'ground', 0.6, 4.4, 0.8, tone='body', alpha=0.9, seed=3),
        ring_wave(0.08, 'ground', 0.5, 3.4, 0.8, tone='rim', alpha=0.7, seed=5),
        mesh('crack_radial', 0.02, 1.6, at='ground', scale=3.4, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        flip('dust_kick', 0.03, 1.0, 3.0, at='ground', offset=[0, 0.5, 0], alpha=0.6, tone='core', tier=1),
    ]
    ev += strike(0.0, 'target', 4.0, 2.0)
    ev += dark_ground(0.02, 'ground', 3.0)
    ev += [parts('spark', 0.0, 80, 9, 1, 0.5, 0.09, at='target', offset=[0, 1.0, 0], tone='rim', tier=0)]
    ev += feel(0.0, ms=75, sh=0.4, fl=0.26, vg=0.3, fov=2.4)
    return {'skill': 'skl_loi_phat', 'replaces': ['loiphat'], 'events': ev}


R['skl_loi_phat'] = loi_phat


# --------------------------------------------------------------------------------------------------------------------------------
def loi_hai():
    """Lôi Hải (nhánh 20, vùng 8 m, hit 0,45): biển lôi: sáu cột sét chập chờn rải đều trong vùng + một cột lớn ở giữa, vòng triện lớn, hai sóng xung, nứt tỏa."""
    ev = [
        parts('spark', -0.45, 30, 1.4, 1, 0.3, 0.06, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.45, 0.85),
        decal('rune', -0.4, 8.2, 1.0, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        mesh('rune_ring2', -0.4, 0.9, at='area', offset=[0, 0.1, 0], scale=0.45, scaleTo=0.5, fit='area', sweep=0.4, erodeFrom=0.8, alpha=0.95, shadow=False, tone='rim', tier=0, seed=2),
    ]
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        dx, dz = round(math.cos(a) * 4.6, 2), round(math.sin(a) * 4.6, 2)
        ev += column(-0.25 + 0.05 * i, 'area', dx, dz, 9.0, 0.8, n=5, step=0.07, seed=90 + i * 3, thin=True)
        ev.append(decal('strike', -0.02 + 0.05 * i, 2.6, 1.8, at='area', offset=[dx, 0, dz], grow=0.1, tone='accent', alpha=1, tier=1))
    ev += column(-0.2, 'area', 0.0, 0.0, 14.0, 1.6, n=8, step=0.06, seed=120)
    ev += [
        snd(0.0, 'impact', 0.95, 0.75, 0.04),
        flip('spark_burst', -0.02, 0.6, 4.0, at='area', offset=[0, 0.9, 0], alpha=0.95, tone='accent', tier=0),
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
