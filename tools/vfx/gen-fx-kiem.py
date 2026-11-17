# Sinh các file packages/content/data/fx/<chiêu>.json của Kiếm tu (VFX-V2). JSON vẫn sửa tay được; script chỉ giữ công thức cho nhất quán.
#   python tools/vfx/gen-fx-kiem.py [id chiêu ...]
import json
import math
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../packages/content/data/fx')


def mesh(shape, t, dur, **k):
    e = {'type': 'mesh', 'shape': shape, 't': t, 'dur': dur}
    e.update(k)
    return e


def parts(kind, t, n, speed, spread, life, size, **k):
    e = {'type': 'particles', 'kind': kind, 't': t, 'n': n, 'speed': speed, 'spread': spread, 'life': life, 'size': size}
    e.update(k)
    return e


def decal(tex, t, r, dur, **k):
    e = {'type': 'decal', 'tex': tex, 't': t, 'r': r, 'dur': dur}
    e.update(k)
    return e


def stop(t, ms, **k):
    return {'type': 'hitstop', 't': t, 'ms': ms, **k}


def shake(t, lv, **k):
    return {'type': 'shake', 't': t, 'level': lv, **k}


def flash(t, a, **k):
    return {'type': 'flash', 't': t, 'amount': a, **k}


def ring_spikes(n, r, t, at, scale, dur, tier=1, tilt=18, stagger=0.02, y=0, seed0=1, **k):
    out = []
    for i in range(n):
        a = i / n * 2 * math.pi + 0.3
        out.append(mesh('spike', round(t + stagger * i, 3), dur, at=at, offset=[round(math.cos(a) * r, 2), y, round(math.sin(a) * r, 2)],
                        rot=[-90 + round(math.sin(a) * tilt), 0, 0], scale=round(scale * (0.75 + 0.25 * ((i * 5) % 3) / 2), 2),
                        sweep=0.2, erodeFrom=0.5, alpha=0.97, seed=seed0 + i, tier=tier, **k))
    return out


def write(tl):
    p = os.path.join(OUT, tl['skill'] + '.json')
    with open(p, 'w', encoding='utf8') as f:
        json.dump(tl, f, ensure_ascii=False, indent=1)


R = {}

# ---- Linh Khí Hộ Thể: kiếm trận hộ thân. Hình cũ (vòm khiên theo thời lượng) giữ nguyên, thêm lớp vẽ tay. ----
R['skl_linh_khi_ho_the'] = lambda: {
    'skill': 'skl_linh_khi_ho_the',
    'events': [
        parts('spark', -0.34, 20, 1.4, 1, 0.3, 0.06, at='self', inward=True, tone='rim', tier=1),
        decal('rune', -0.3, 1.9, 1.1, at='self', grow=0.25, tone='body', alpha=0.85, tier=1),
        mesh('ripple', 0.0, 0.55, at='self', offset=[0, -1.1, 0], scale=0.4, scaleTo=2.1, sweep=0.4, erodeFrom=0.45, ragged=0.35, tone='body', tier=0, seed=3),
        mesh('ripple', 0.1, 0.5, at='self', offset=[0, -0.1, 0], scale=0.3, scaleTo=1.5, sweep=0.4, erodeFrom=0.45, tone='accent', alpha=0.8, tier=2, seed=5),
        mesh('helix', 0.0, 0.9, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[2.0, 2.0, 2.4], sweep=0.3, erodeFrom=0.55, spin=420, follow=True, tone='body', tier=1, seed=8),
        mesh('burst', 0.0, 0.11, at='self', scale=1.3, billboard=True, sweep=0.0, tone='rim', tier=0),
        *ring_spikes(6, 1.35, 0.02, 'self', 0.34, 0.8, tier=1, y=-1.15, tilt=-14),
        parts('spark', 0.0, 26, 4.5, 1, 0.5, 0.06, at='self', tone='rim', tier=0),
        shake(0.0, 0.08, tier=1),
    ],
}

# ---- Hồi Nguyên Thuật: linh khí lam ngọc dâng lên như sen, thay hẳn hình `heal` cũ (thuốc `potion` không đổi). ----
R['skl_hoi_nguyen_thuat'] = lambda: {
    'skill': 'skl_hoi_nguyen_thuat',
    'replaces': ['heal'],
    'events': [
        parts('spark', -0.38, 26, 1.8, 1, 0.34, 0.06, at='self', inward=True, tone='body', tier=1),
        decal('rune', -0.3, 1.6, 1.3, at='self', grow=0.3, tone='body', alpha=0.8, tier=1),
        mesh('ripple', 0.0, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.5, sweep=0.5, erodeFrom=0.4, ragged=0.2, tone='body', tier=0, seed=4),
        mesh('helix', 0.0, 1.0, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[1.4, 1.4, 3.0], sweep=0.35, erodeFrom=0.5, spin=-300, follow=True, tone='rim', tier=0, seed=2),
        mesh('burst', 0.02, 0.11, at='self', scale=1.0, billboard=True, sweep=0.0, tone='body', alpha=0.8, tier=1),
        parts('petal', 0.0, 28, 1.2, 0.5, 1.4, 0.09, at='self', offset=[0, -1.0, 0], grav=-0.9, tone='rim', tier=0),
        parts('spark', 0.05, 18, 2.2, 0.6, 0.9, 0.05, at='self', offset=[0, -0.6, 0], grav=-1.5, tone='accent', tier=1),
        *ring_spikes(4, 0.9, 0.05, 'self', 0.16, 0.7, tier=2, y=-1.15, tilt=0),
    ],
    'variants': {
        'hot': [mesh('ripple', 0.45, 0.5, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.3, sweep=0.5, tone='body', alpha=0.7, tier=1, seed=11)],
    },
}


# ---- Thiên Kiếm Vũ: kiếm tinh thể rơi từ trời xuống vùng chỉ định, mỗi mũi cắm đất nổ gợn; thay hẳn mưa kiếm cũ. ----
def thien_kiem_vu():
    ev = [
        decal('rune', -0.5, 9.0, 2.0, at='area', grow=0.4, tone='body', alpha=0.95, tier=0),
        decal('crack', 0.25, 8.5, 2.6, at='area', grow=0.3, tone='body', alpha=0.9, tier=1),
        mesh('ripple', -0.2, 0.9, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.55, ragged=0.6, tone='body', alpha=0.9, tier=0, seed=2),
        mesh('ripple', 0.1, 0.7, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, erodeFrom=0.5, tone='accent', alpha=0.7, tier=2, seed=6),
        shake(0.0, 0.14, tier=1),
        stop(0.0, 50),
    ]
    # 28 kiếm khí tinh thể rơi nghiêng vào vùng bán kính 9 theo nhịp (12 kiếm đầu luôn có, phần còn lại từ Vừa/Cao), mỗi mũi cắm đất nổ gợn.
    N = 28
    for i in range(N):
        a = i * 2.399
        rr = 9.0 * math.sqrt((i + 0.5) / N)
        dx, dz = round(math.cos(a) * rr, 2), round(math.sin(a) * rr, 2)
        t = round(-0.4 + i * 0.045, 3)
        tier = 0 if i < 12 else (1 if i < 20 else 2)
        ev.append(mesh('kite', t, 0.34, at='area', offset=[dx + 3.5, 13, dz - 2.0], scale=[1.1, 1.1, 3.4], sweep=0.1, erodeFrom=0.9, tone='rim' if i % 2 else 'body',
                       move={'to': 'area', 'offset': [dx, 0.3, dz], 'ease': 'in'}, seed=20 + i, tier=tier))
        ev.append(mesh('ripple', round(t + 0.34, 3), 0.45, at='area', offset=[dx, 0, dz], scale=0.3, scaleTo=1.1, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.9, tier=tier, seed=50 + i))
        if i % 3 == 0:
            ev.append(mesh('spike', round(t + 0.34, 3), 0.7, at='area', offset=[dx, 0, dz], rot=[-90, 0, 0], scale=0.55, sweep=0.2, erodeFrom=0.5, tone='body', tier=1, seed=80 + i))
            ev.append(parts('spark', round(t + 0.34, 3), 8, 4, 1, 0.35, 0.06, at='area', offset=[dx, 0.3, dz], tone='rim', tier=1))
    return {'skill': 'skl_thien_kiem_vu', 'replaces': ['rain'], 'events': ev,
            'variants': {
                'wide': [mesh('ripple', 0.2, 0.8, at='area', scale=0.2, scaleTo=1.1, fit='area', sweep=0.5, tone='rim', alpha=0.7, tier=1, seed=50)],
                'focus': [mesh('spike', 0.25, 0.8, at='area', rot=[-90, 0, 0], scale=1.3, sweep=0.2, erodeFrom=0.55, tone='body', tier=0, seed=51),
                          mesh('burst', 0.3, 0.11, at='area', offset=[0, 1.2, 0], scale=2.0, billboard=True, sweep=0.0, tone='rim', tier=0)],
            }}


R['skl_thien_kiem_vu'] = thien_kiem_vu

# ---- Lôi Đình Nhất Kiếm: sét giữ hình cũ, thêm nứt đất cháy, vòng triện, gai tinh thể điểm vàng. ----
R['skl_loi_dinh_nhat_kiem'] = lambda: {
    'skill': 'skl_loi_dinh_nhat_kiem', 'palette': 'loi', 'replaces': ['thunder'], 'trigger': 'fx', 'fxKind': 'thunder',
    'events': [
        # Sét mảnh nối tiếp, không chớp toàn cảnh; lõi tối (tím sẫm) viền trắng tím.
        {'type': 'bolt', 't': 0.0, 'at': 'target', 'scale': 0.7, 'tone': 'body', 'seed': 11, 'tier': 0},
        {'type': 'bolt', 't': 0.05, 'at': 'target', 'scale': 0.9, 'tone': 'body', 'seed': 12, 'tier': 0},
        {'type': 'bolt', 't': 0.1, 'at': 'ground', 'offset': [1.6, 0, 0.8], 'scale': 0.8, 'tone': 'body', 'seed': 13, 'tier': 2},
        {'type': 'bolt', 't': 0.16, 'at': 'ground', 'offset': [-1.5, 0, -1.0], 'scale': 0.8, 'tone': 'body', 'seed': 14, 'tier': 2},
        mesh('burst', 0.0, 0.1, at='target', scale=0.8, billboard=True, sweep=0.0, tone='body', alpha=0.7, tier=0),
        mesh('ripple', 0.0, 0.28, at='ground', scale=0.4, scaleTo=1.4, sweep=0.4, erodeFrom=0.1, ragged=0.65, tone='core', alpha=0.75, tier=0, seed=3),
        mesh('ripple', 0.05, 0.3, at='ground', scale=0.3, scaleTo=1.1, sweep=0.4, erodeFrom=0.1, tone='body', alpha=0.6, tier=2, seed=9),
        decal('scorch', 0.0, 3.0, 2.4, at='ground', grow=0.1, tone='core', alpha=0.95, tier=0),
        decal('crack', 0.02, 3.6, 2.6, at='ground', grow=0.14, tone='body', alpha=0.95, tier=0),
        decal('rune', 0.05, 3.4, 2.2, at='ground', grow=0.2, tone='accent', alpha=0.8, tier=1, yaw=20),
        *ring_spikes(5, 1.3, 0.04, 'ground', 0.5, 0.5, tier=1, tilt=20, tone='body'),
        parts('spark', 0.0, 30, 8, 1, 0.4, 0.05, at='target', tone='body', tier=0),
        parts('shard', 0.02, 10, 5, 0.9, 0.6, 0.09, at='ground', offset=[0, 0.3, 0], tone='core', tier=2),
        stop(0.0, 65),
        shake(0.0, 0.3),
    ],
}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recipes_b  # noqa: E402

recipes_b.register(R, dict(mesh=mesh, parts=parts, decal=decal, stop=stop, shake=shake, flash=flash, ring_spikes=ring_spikes))

if __name__ == '__main__':
    want = sys.argv[1:] or list(R)
    for k in want:
        write(R[k]())
        print('ghi', k)
