# VFX VS-1: 5 chiêu Kiếm tu làm lại theo ngôn ngữ hình mới của Kiếm Khí Trảm (chiêu mẫu đã duyệt).
#   python tools/vfx/recipes_vs1.py [id chiêu ...]      → ghi packages/content/data/fx/<id>.json
# Ngôn ngữ chung (xem docs/handbook/vfx-animation.md, mục VS-1b):
#   - vết chém dày `slash_thick` (thân màu + lõi trắng `rim` nhỏ hơn, lõi không bóng) + đuôi `slash_thin`, `spin` theo hướng vung
#   - đòn kết: chớp `burst`, `spark_burst` flipbook to, tia lửa `spark_streak`, sóng xung `shock_cone`, nứt `crack_radial` + decal `crack` (tone `core`)
#     + decal `scorch` (tone `shadow`, tối để thấy trên nền đá sáng), đá `rubble_a` tone `shadow` (tối, không phải khối tinh thể xanh), bụi `dust_kick`
#   - khựng + rung + chớp + `camera.fov` + `soundAt` (báo trước / vút / trúng); `vignette` tối ≤ 0,35 cho chiêu thường, ≤ 0,5 cho chiêu tối thượng
#   - chiêu tối thượng (Vạn Kiếm Quy Tông, Thiên Kiếm Hóa Hình) mới dùng `slowmo` và `camera.pull`
# Ngân sách: mỗi mốc ≤ 12 draw (validateFxTimeline), cả chiêu ≤ 25, hạt ≤ 1.500. Biến thức (`variants`) giữ ý nghĩa cũ.
import json
import math
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../packages/content/data/fx')


def mesh(shape, t, dur, **k):
    e = {'type': 'mesh', 'shape': shape, 't': round(t, 3), 'dur': dur}
    e.update(k)
    return e


def flip(atlas, t, dur, scale, **k):
    return mesh('flip', t, dur, flip=atlas, scale=scale, billboard=True, **k)


def parts(kind, t, n, speed, spread, life, size, **k):
    e = {'type': 'particles', 'kind': kind, 't': round(t, 3), 'n': n, 'speed': speed, 'spread': spread, 'life': life, 'size': size}
    e.update(k)
    return e


def decal(tex, t, r, dur, **k):
    e = {'type': 'decal', 'tex': tex, 't': round(t, 3), 'r': r, 'dur': dur}
    e.update(k)
    return e


def snd(t, sid, gain=0.5, rate=1.0, jitter=0.05):
    return {'type': 'soundAt', 't': round(t, 3), 'id': sid, 'gain': gain, 'rate': rate, 'jitter': jitter}


def stop(t, ms, **k):
    return {'type': 'hitstop', 't': t, 'ms': ms, **k}


def shake(t, lv, **k):
    return {'type': 'shake', 't': t, 'level': lv, **k}


def flash(t, a, **k):
    return {'type': 'flash', 't': t, 'amount': a, **k}


def vig(t, amount, ms, tone='dark', **k):
    return {'type': 'vignette', 't': t, 'amount': amount, 'ms': ms, 'tone': tone, **k}


def cam(t, pull, dur, fov=0, **k):
    e = {'type': 'camera', 't': t, 'pull': pull, 'dur': dur}
    if fov:
        e['fov'] = fov
    e.update(k)
    return e


def slow(t, scale, ms, **k):
    return {'type': 'slowmo', 't': t, 'scale': scale, 'ms': ms, **k}


MV = {'to': 'target', 'ahead': 9, 'ease': 'out'}


def rubble(t, at, n, r, up, scale, seed0=1, area=False):
    """n mảnh đá tối văng ra quanh gốc theo vòng bán kính r, bay lên `up` m."""
    out = []
    for i in range(n):
        a = (i / n) * math.tau + seed0
        dx, dz = math.cos(a) * r, math.sin(a) * r
        out.append(
            mesh(
                'rubble_a', t + 0.01 * i, 0.42, at=at, offset=[0, 0.05, 0], rot=[30 * i, 70 * i, 10 * i], scale=scale, scaleTo=scale * 0.65,
                sweep=0, erodeFrom=0.3, alpha=1, move={'to': at, 'offset': [dx, up, dz], 'ease': 'out'}, tone='shadow', tier=1, seed=seed0 + i,
            )
        )
    return out


def impact(t, at='target', y=1.0, burst=2.0, sparks=64, tier_flip=0):
    """Cụm đòn kết dùng chung: chớp + spark_burst hai lớp + hạt + tia lửa tỏa."""
    ev = [
        mesh('burst', t, 0.12, at=at, offset=[0, y, 0], scale=burst, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', t, 0.36, burst * 1.15, at=at, offset=[0, y, 0], alpha=0.9, tone='accent', tier=tier_flip),
        flip('spark_burst', t + 0.03, 0.32, burst * 0.75, at=at, offset=[0, y, 0], rot=[0, 0, 40], alpha=0.8, tone='rim', tier=1),
        parts('spark', t, sparks, 9, 1, 0.42, 0.1, at=at, offset=[0, y, 0], tone='rim', tier=0),
    ]
    for i, (dx, dy, dz) in enumerate([(1.8, 0.9, 0), (-1.7, 0.8, 0.4), (0.4, 2.0, 0), (1.3, -0.3, 1.1), (-1.1, 1.5, -0.7)]):
        ev.append(
            mesh('spark_streak', t, 0.26, at=at, offset=[0, y, 0], scale=1.5, move={'to': at, 'offset': [dx, y + dy, dz], 'ease': 'out'},
                 shadow=False, tone='accent', alpha=1, seed=i + 1, tier=1)
        )
    return ev


def ground(t, at='ground', r=3.2, cone=3.0, crackscale=3.2, dust=True):
    """Phản ứng mặt đất: sóng xung, nứt phát sáng (tối + tương phản), vết cháy, bụi."""
    ev = [
        mesh('shock_cone', t + 0.02, 0.34, at=at, scale=[r * 0.35] * 3, scaleTo=[cone] * 3, alpha=0.75, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1),
        mesh('crack_radial', t + 0.03, 0.8, at=at, scale=crackscale, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
        decal('crack', t + 0.04, r, 2.6, at=at, grow=0.12, tone='core', alpha=1, tier=1),
        decal('scorch', t + 0.04, r * 0.8, 3.0, at=at, grow=0.1, tone='shadow', alpha=0.75, tier=1),
    ]
    if dust:
        ev.append(flip('dust_kick', t + 0.03, 0.6, 2.4, at=at, offset=[0, 0.45, 0], alpha=0.5, tone='body', tier=1))
    return ev


def feel(t, ms=70, sh=0.26, fl=0.14, vg=0.32, fov=1.8, pull=0, tier_v=1):
    ev = [stop(t, ms), shake(t, sh), flash(t, fl, tier=0)]
    if vg:
        ev.append(vig(t, vg, 300, tier=tier_v))
    ev.append(cam(t, pull, 0.5, fov=fov, tier=1))
    return ev


def write(tl):
    path = os.path.join(OUT, tl['skill'] + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(tl, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('ghi', os.path.relpath(path))


R = {}


# --------------------------------------------------------------------------------------------------------------------------------
def truy_hon():
    """Phi Kiếm Truy Hồn: một thanh kiếm thật bay đường thẳng, đuôi bóng kiếm, cắm xuống mục tiêu rồi vỡ đá."""
    ev = [
        parts('spark', -0.3, 16, 1.2, 1, 0.26, 0.06, at='self', offset=[0.2, 0, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'sword', 0.45, 0.9),
        mesh('blade_flying', -0.2, 0.22, at='ahead', offset=[0.1, 0.15, 0.5], scale=3.0, sweep=0, erodeFrom=0.9, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, tone='rim', alpha=1, tier=0, seed=3),
    ]
    for i, (d, a, s) in enumerate([(0.03, 0.75, 2.6), (0.06, 0.55, 2.2), (0.09, 0.4, 1.8)]):
        ev.append(mesh('blade_ghost', -0.2 + d, 0.22, at='ahead', offset=[0.1, 0.15, 0.5], scale=s, sweep=0, erodeFrom=0.7, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, tone='body', alpha=a, tier=1 if i else 0, seed=i + 5))
    ev += [
        mesh('spark_streak', -0.17, 0.2, at='ahead', offset=[0.45, 0.1, 0.4], scale=1.8, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, shadow=False, tone='accent', alpha=0.9, tier=1, seed=2),
        snd(-0.17, 'slash', 0.5, 1.3, 0.06),
        # cắm xuống: kiếm găm vào mục tiêu rồi mờ dần
        mesh('blade_stuck', 0.0, 0.7, at='target', offset=[0, 1.0, 0], rot=[100, 0, 0], scale=2.6, sweep=0, erodeFrom=0.55, alpha=1, tone='rim', tier=0, seed=1),
        snd(0.0, 'impact', 0.6, 0.97),
    ]
    ev += impact(0.0, burst=1.8, sparks=44)
    ev += ground(0.0, r=2.4, cone=2.2, crackscale=2.4)
    ev += rubble(0.02, 'ground', 3, 1.1, 0.9, 0.42)
    ev += feel(0.0, ms=55, sh=0.18, fl=0.1, vg=0.25, fov=1.2)
    ev = [e for e in ev if not (e['type'] == 'mesh' and e['shape'] == 'burst')]  # bớt một nhóm draw (spark_burst đã đủ chớp)
    return {
        'skill': 'skl_phi_kiem_truy_hon',
        'replaces': ['kanh'],
        'events': ev,
        'variants': {
            # đâm sâu: một kiếm khác cắm thẳng đứng trên đầu mục tiêu (rơi xuống) kèm nón sóng lớn hơn
            'deep': [
                mesh('blade_flying', 0.1, 0.22, at='target', offset=[0, 5.0, 0], rot=[90, 0, 0], scale=3.0, sweep=0, erodeFrom=0.9, move={'to': 'target', 'ease': 'in', 'offset': [0, 0.8, 0]}, tone='rim', alpha=1, tier=0, seed=11),
                mesh('slash_thick', 0.1, 0.25, at='target', offset=[0, 1.0, 0], rot=[0, 0, 12], scale=1.9, sweep=0.5, erodeFrom=0.5, ragged=0.6, shadow=False, tone='rim', tier=1, seed=12),
            ],
            # tán kiếm: ba kiếm nhỏ bắn tỏa ra ba hướng
            'spread': [
                mesh('blade_flying', 0.12, 0.24, at='target', offset=[0, 1.0, 0], scale=1.8, sweep=0, erodeFrom=0.85, move={'to': 'target', 'offset': [dx, 1.0, dz], 'ease': 'out'}, tone='body', tier=0, seed=20 + i)
                for i, (dx, dz) in enumerate([(2.6, 1.2), (-2.4, 1.8), (0.4, -2.8)])
            ],
        },
    }


R['skl_phi_kiem_truy_hon'] = truy_hon


# --------------------------------------------------------------------------------------------------------------------------------
def hoanh_kiem():
    """Hoành Kiếm Phá Mạch: sóng chém ngang xuyên thẳng 12 m, xé khe nứt dọc đường đi, đá và bụi tung theo."""
    L = 12
    ev = [
        parts('spark', -0.4, 20, 1.3, 1, 0.3, 0.06, at='self', offset=[0, 0.1, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.4, 'sword', 0.5, 0.88),
        # sóng chém: nằm ngang, bay xa 12 m; lõi trắng + thân màu + đuôi mảnh
        mesh('slash_thick', -0.22, 0.34, at='ahead', offset=[0, 0.5, 0.6], rot=[0, 0, -8], scale=2.6, scaleTo=4.2, sweep=0.35, erodeFrom=0.55, ragged=0.55, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='body', alpha=1, tier=0),
        mesh('slash_thick', -0.2, 0.32, at='ahead', offset=[0, 0.5, 0.6], rot=[0, 0, -8], scale=2.0, scaleTo=3.4, sweep=0.35, erodeFrom=0.5, ragged=0.4, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='rim', alpha=0.95, seed=4, tier=0),
        mesh('slash_thin', -0.18, 0.36, at='ahead', offset=[0, 0.3, 0.2], rot=[0, 0, 4], scale=3.0, scaleTo=5.0, sweep=0.3, erodeFrom=0.35, ragged=0.8, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='core', alpha=0.9, seed=9, tier=1),
        snd(-0.2, 'slash', 0.55, 0.95, 0.06),
        # khe nứt xé dọc đường chém (tối, thấy rõ trên đá sáng)
        mesh('rift_line', 0.0, 0.9, at='ahead', offset=[0, 0.12, 0.4], scale=[1.5, 1, L], alpha=1, sweep=0.55, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=3),
        decal('crack', 0.05, 2.2, 2.6, at='ahead', offset=[0, 0, 3.0], grow=0.12, tone='core', alpha=1, tier=1),
        decal('scorch', 0.05, 2.2, 3.0, at='ahead', offset=[0, 0, 8.0], grow=0.1, tone='shadow', alpha=0.75, tier=1),
        snd(0.0, 'impact', 0.65, 0.9),
    ]
    # bụi và đá tung dọc theo đường đi (3 cụm)
    for i, d in enumerate([3.0, 6.5, 10.0]):
        ev.append(flip('dust_kick', 0.02 + 0.05 * i, 0.6, 2.4, at='ahead', offset=[0, 0.45, d], alpha=0.5, tone='body', tier=1))
        ev.append(mesh('rubble_a', 0.03 + 0.05 * i, 0.42, at='ahead', offset=[0.4 * (i - 1), 0.05, d], rot=[30 * i, 70 * i, 10], scale=0.55, scaleTo=0.35, sweep=0, erodeFrom=0.3, alpha=1, move={'to': 'ahead', 'offset': [0.9 * (i - 1), 1.1, d + 0.5], 'ease': 'out'}, tone='shadow', tier=1, seed=i + 1))
    # đòn kết ở cuối đường (tâm 12 m)
    ev += [
        flip('spark_burst', 0.1, 0.36, 3.0, at='ahead', offset=[0, 1.0, L - 0.5], alpha=0.9, tone='accent', tier=0),
        parts('spark', 0.1, 56, 9, 1, 0.42, 0.1, at='ahead', offset=[0, 1.0, L - 0.5], tone='rim', tier=0),
        mesh('shock_cone', 0.1, 0.34, at='ahead', offset=[0, 0.05, L - 0.5], scale=[1.0] * 3, scaleTo=[2.8] * 3, alpha=0.75, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1),
        mesh('crack_radial', 0.1, 0.8, at='ahead', offset=[0, 0.05, L - 0.5], scale=3.0, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=2),
    ]
    for i, (dx, dy, dz) in enumerate([(1.8, 0.9, 0), (-1.7, 0.8, 0.4), (0.4, 2.0, 0)]):
        ev.append(mesh('spark_streak', 0.1, 0.26, at='ahead', offset=[0, 1.0, L - 0.5], scale=1.5, move={'to': 'ahead', 'offset': [dx, 1.0 + dy, L - 0.5 + dz], 'ease': 'out'}, shadow=False, tone='accent', alpha=1, seed=i + 1, tier=1))
    ev += feel(0.0, ms=65, sh=0.3, fl=0.12, vg=0.3, fov=2.0)
    return {
        'skill': 'skl_hoanh_kiem_pha_mach',
        'replaces': ['hoanhkiem'],
        'events': ev,
        'variants': {
            # dài: khe nứt kéo xa thêm và một cú nổ ở tận cuối
            'long': [
                mesh('rift_line', 0.2, 0.7, at='ahead', offset=[0, 0.12, L + 0.4], scale=[1.4, 1, 6], alpha=1, sweep=0.5, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=30),
                flip('spark_burst', 0.28, 0.34, 2.4, at='ahead', offset=[0, 1.0, L + 5], alpha=0.9, tone='accent', tier=0),
            ],
            # song kiếm: thêm một đường chém chéo ngược chiều
            'twin': [
                mesh('slash_thick', 0.0, 0.34, at='ahead', offset=[0, 0.3, 0.2], rot=[0, 0, 62], scale=2.0, scaleTo=4.0, sweep=0.45, erodeFrom=0.55, ragged=0.5, shadow=False, move={'to': 'ahead', 'ahead': L, 'ease': 'out'}, tone='body', tier=1, seed=40),
            ],
        },
    }


R['skl_hoanh_kiem_pha_mach'] = hoanh_kiem


# --------------------------------------------------------------------------------------------------------------------------------
def thien_kiem_vu():
    """Thiên Kiếm Vũ: vòng ấn đôi báo trước vùng 9 m, 14 thanh kiếm thật rơi xuống và cắm đất, mỗi thanh nứt đất + bụi."""
    r = random_ring(14, 6.6, 3)
    ev = [
        parts('spark', -0.42, 18, 1.4, 1, 0.3, 0.06, at='self', offset=[0, 0.4, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.42, 'sword', 0.5, 0.9),
        # báo trước vùng chiêu
        mesh('rune_ring2', -0.42, 0.6, at='area', scale=0.9, scaleTo=1.0, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.8, shadow=False, tone='rim', tier=0, seed=2),
        decal('rune', -0.4, 7.5, 1.0, at='area', grow=0.3, tone='accent', alpha=0.8, tier=1),
    ]
    for i, (dx, dz) in enumerate(r):
        t0 = -0.4 + 0.026 * i  # rơi lệch nhịp nối tiếp nhau
        ev.append(mesh('blade_flying', t0, 0.3, at='area', offset=[dx, 16.0, dz], rot=[90, 0, 0], scale=3.0, sweep=0, erodeFrom=0.9, move={'to': 'area', 'ease': 'in', 'offset': [dx, 3.1, dz]}, tone='rim', alpha=1, tier=0 if i < 8 else 1, seed=i + 1))
        ev.append(mesh('blade_stuck', t0 + 0.3, 0.9, at='area', offset=[dx, 3.1, dz], rot=[90, 0, 0], scale=3.0, sweep=0, erodeFrom=0.6, alpha=1, tone='rim', tier=0 if i < 8 else 1, seed=i + 1))
        if i % 3 == 0:
            ev.append(flip('dust_kick', t0 + 0.31, 0.6, 2.6, at='area', offset=[dx, 0.5, dz], alpha=0.5, tone='body', tier=1))
            ev.append(mesh('shock_cone', t0 + 0.32, 0.34, at='area', offset=[dx, 0.05, dz], scale=[0.5] * 3, scaleTo=[1.6] * 3, alpha=0.7, sweep=0.3, erodeFrom=0.3, shadow=False, tone='rim', tier=1))
        if i % 2 == 0:
            ev.append(mesh('crack_radial', t0 + 0.32, 0.8, at='area', offset=[dx, 0.05, dz], scale=1.5, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=1, seed=i))
            ev.append(mesh('rubble_a', t0 + 0.32, 0.42, at='area', offset=[dx, 0.05, dz], rot=[30 * i, 70, 10], scale=0.4, scaleTo=0.25, sweep=0, erodeFrom=0.3, alpha=1, move={'to': 'area', 'offset': [dx + 0.6, 0.9, dz + 0.4], 'ease': 'out'}, tone='shadow', tier=1, seed=i))
        ev.append(snd(t0 + 0.3, 'impact', 0.22, 1.0 + 0.04 * (i % 5), 0.08))
        ev.append(parts('spark', t0 + 0.3, 10, 6, 1, 0.3, 0.08, at='area', offset=[dx, 0.4, dz], tone='rim', tier=1))
    # vệt cháy/nứt lớn ở tâm + đòn kết
    ev += [
        decal('crack', 0.1, 6.5, 3.0, at='area', grow=0.2, tone='core', alpha=1, tier=1),
        decal('scorch', 0.1, 4.5, 3.2, at='area', grow=0.2, tone='shadow', alpha=0.7, tier=1),
        mesh('burst', 0.1, 0.12, at='area', offset=[0, 1.2, 0], scale=2.2, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        snd(0.12, 'impact', 0.7, 0.88),
    ]
    ev += feel(0.1, ms=60, sh=0.28, fl=0.12, vg=0.3, fov=1.8)
    return {
        'skill': 'skl_thien_kiem_vu',
        'replaces': ['rain'],
        'events': ev,
        'variants': {
            # rộng: vòng ấn ngoài to hơn quét ra rìa
            'wide': [mesh('rune_ring2', 0.2, 0.8, at='area', scale=0.2, scaleTo=1.15, fit='area', alpha=0.8, sweep=0.5, shadow=False, tone='rim', tier=1, seed=50)],
            # tập trung: một thanh kiếm khổng lồ cắm ngay tâm + cú nổ
            'focus': [
                mesh('blade_giant', 0.25, 0.8, at='area', offset=[0, 0.0, 0], rot=[90, 0, 0], scale=5.0, sweep=0, erodeFrom=0.6, alpha=1, move={'to': 'area', 'ease': 'in', 'offset': [0, 4.2, 0]}, tone='rim', tier=0, seed=51),
                flip('spark_burst', 0.3, 0.36, 3.2, at='area', offset=[0, 1.2, 0], alpha=0.95, tone='accent', tier=0),
            ],
        },
    }


def random_ring(n, rmax, seed):
    """Vị trí rải đều trong vùng tròn (xoắn ốc vàng, ổn định, không ngẫu nhiên)."""
    out = []
    for i in range(n):
        rad = rmax * math.sqrt((i + 0.5) / n)
        ang = i * 2.399963 + seed
        out.append((round(math.cos(ang) * rad, 2), round(math.sin(ang) * rad, 2)))
    return out


R['skl_thien_kiem_vu'] = thien_kiem_vu


# --------------------------------------------------------------------------------------------------------------------------------
def van_kiem():
    """Vạn Kiếm Quy Tông (tối thượng): vầng kiếm sau lưng + trận kiếm bao vùng 10 m, rồng quấn kiếm 3D lao xuống, slow-mo + vignette + camera."""
    ev = [
        parts('spark', -0.5, 40, 2.4, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'sword', 0.6, 0.8),
        vig(-0.5, 0.3, 500, tier=1),
        cam(-0.5, 0.12, 1.6, fov=3.0, tier=1),
        # vầng kiếm mở sau lưng + trận kiếm dựng quanh vùng
        mesh('sword_halo', -0.5, 0.6, at='self', offset=[0, 1.2, -0.9], rot=[0, 0, 0], scale=1.5, scaleTo=1.9, sweep=0.5, erodeFrom=0.6, alpha=0.95, tone='rim', tier=0, seed=2),
        mesh('rune_array', -0.45, 0.8, at='area', scale=7.5, scaleTo=8.0, sweep=0.5, erodeFrom=0.7, alpha=0.9, tone='body', tier=0, seed=3),
        # rồng quấn kiếm lao xuống tâm
        mesh('dragon_sword', -0.32, 0.34, at='area', offset=[0, 12, 0], rot=[180, 0, 0], scale=3.2, sweep=0, erodeFrom=0.85, alpha=1, move={'to': 'area', 'ease': 'in', 'offset': [0, 0.2, 0]}, tone='rim', tier=0, seed=4),
        snd(-0.2, 'slash', 0.6, 0.85, 0.05),
        # ba vệt chém khổng lồ quét quanh
    ]
    for i, a in enumerate([-60, 20, 100]):
        ev.append(mesh('slash_thick', -0.06 + 0.03 * i, 0.3, at='area', offset=[0, 0.8, 0], rot=[0, a, -20 + 20 * i], scale=3.6, scaleTo=7.0, spin=250, sweep=0.35, erodeFrom=0.5, ragged=0.5, shadow=False, tone='rim' if i % 2 else 'body', alpha=0.95, tier=0 if i == 0 else 1, seed=i + 7))
    ev += [slow(0.0, 0.35, 220, tier=2), snd(0.0, 'impact', 0.85, 0.8, 0.04), snd(0.02, 'crit', 0.5, 0.9, 0.05)]
    ev += impact(0.0, at='area', y=1.4, burst=3.6, sparks=80)
    ev += ground(0.0, at='area', r=7.0, cone=9.0, crackscale=7.0)
    ev += rubble(0.03, 'area', 5, 3.2, 2.2, 1.0, seed0=2)
    ev += feel(0.0, ms=80, sh=0.45, fl=0.2, vg=0.45, fov=3.0, pull=0.12)
    ev.append(flip('ink_smoke', 0.06, 0.9, 5.0, at='area', offset=[0, 1.8, 0], alpha=0.45, tone='shadow', tier=2))
    return {'skill': 'skl_van_kiem_quy_tong', 'replaces': ['vankiem'], 'events': ev}


R['skl_van_kiem_quy_tong'] = van_kiem


# --------------------------------------------------------------------------------------------------------------------------------
def hoa_hinh():
    """Thiên Kiếm Hóa Hình (cấp 28): vòng ấn đôi, kiếm khổng lồ dựng lên rồi chém xuống tâm vùng 12 m, vết chém dọc + nứt đất khổng lồ."""
    ev = [
        parts('spark', -0.6, 36, 2.6, 1, 0.5, 0.08, at='self', offset=[0, 1.0, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.6, 'sword', 0.6, 0.78),
        vig(-0.6, 0.35, 600, tier=1),
        mesh('rune_ring2', -0.6, 0.7, at='area', scale=0.9, scaleTo=1.05, fit='area', alpha=0.9, sweep=0.5, erodeFrom=0.8, shadow=False, tone='rim', tier=0, seed=2),
        decal('rune', -0.58, 11, 1.2, at='area', grow=0.4, tone='accent', alpha=0.85, tier=1),
        # kiếm khổng lồ dựng lên từ lòng đất (mũi hướng lên) ...
        mesh('blade_giant', -0.55, 0.5, at='area', offset=[0, -4.0, 0], rot=[-90, 0, 0], scale=9.0, sweep=0, erodeFrom=0.95, alpha=1, move={'to': 'area', 'ease': 'out', 'offset': [0, 0.0, 0]}, tone='rim', tier=0, seed=3),
        snd(-0.5, 'cast', 0.6, 0.8),
        # ... rồi lật mũi xuống chém vào tâm
        mesh('blade_giant', -0.1, 0.14, at='area', offset=[0, 12.0, 0], rot=[90, 0, 0], scale=9.0, sweep=0, erodeFrom=0.95, alpha=1, move={'to': 'area', 'ease': 'in', 'offset': [0, 4.5, 0]}, tone='rim', tier=0, seed=4),
        mesh('slash_thick', -0.08, 0.3, at='area', offset=[0, 2.0, 0], rot=[0, 0, 90], scale=5.0, scaleTo=9.0, sweep=0.35, erodeFrom=0.5, ragged=0.5, shadow=False, tone='rim', alpha=0.95, tier=0, seed=5),
        snd(-0.1, 'slash', 0.6, 0.8, 0.05),
        slow(0.0, 0.3, 240, tier=2),
        snd(0.0, 'impact', 0.9, 0.75, 0.04),
        snd(0.02, 'crit', 0.55, 0.85, 0.05),
    ]
    ev += impact(0.0, at='area', y=1.6, burst=4.0, sparks=90)
    ev += ground(0.0, at='area', r=8.0, cone=10.0, crackscale=8.5)
    ev += rubble(0.03, 'area', 6, 3.8, 2.6, 1.1, seed0=3)
    ev += feel(0.0, ms=80, sh=0.5, fl=0.2, vg=0.45, fov=3.2, pull=0.15)
    ev.append(flip('ink_smoke', 0.06, 0.9, 5.5, at='area', offset=[0, 2.0, 0], alpha=0.45, tone='shadow', tier=2))
    return {
        'skill': 'skl_thien_kiem_hoa_hinh',
        'events': ev,
        'variants': {
            # đóng băng: vòng băng xanh sẫm quét ra + âm băng
            'freeze': [
                mesh('rune_ring2', 0.3, 0.9, at='area', scale=0.1, scaleTo=1.0, fit='area', alpha=0.85, sweep=0.5, shadow=False, tone='core', tier=1, seed=20),
                snd(0.04, 'ice_spike', 0.9, 1.0, 0.03),
                snd(0.32, 'ice_hit', 0.8, 1.0, 0.03),
            ],
            # vang dội: cú nổ thứ hai màu vàng + vòng ấn vàng
            'echo': [
                flip('spark_burst', 0.4, 0.36, 3.6, at='area', offset=[0, 1.5, 0], alpha=0.9, tone='accent', tier=0),
                mesh('rune_ring2', 0.4, 0.8, at='area', scale=0.1, scaleTo=0.9, fit='area', alpha=0.85, sweep=0.5, shadow=False, tone='accent', tier=1, seed=21),
            ],
        },
    }


R['skl_thien_kiem_hoa_hinh'] = hoa_hinh


if __name__ == '__main__':
    ids = sys.argv[1:] or list(R)
    for i in ids:
        write(R[i]())
