"""Hàm dùng chung cho các bộ sinh timeline VFX quái (gen-fx-a1.py, gen-fx-a2.py): decal/mesh/particles, vạch báo (tròn/quạt/dải), vùng nổ theo hệ.
Quy ước chung ở docstring gen-fx-a1.py. File json ghi LF, không CRLF (Windows)."""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'content', 'data', 'fx')


def decal(tex, t, r, dur, tone, alpha, grow, top=True, yaw=None, untilDelay=True, **kw):
    e = {"type": "decal", "tex": tex, "t": t, "r": r, "dur": dur, "at": "area", "grow": grow, "tone": tone, "alpha": alpha, "tier": 0, "from": "start"}
    if top:
        e["top"] = True
    if yaw is not None:
        e["yaw"] = yaw
    if untilDelay:
        e["untilDelay"] = True
    e.update(kw)
    return e


def mesh(shape, t, dur, tone, alpha, seed, **kw):
    e = {"type": "mesh", "shape": shape, "t": t, "dur": dur, "at": "area", "tone": tone, "alpha": alpha, "seed": seed, "tier": 0}
    e.update(kw)
    return e


def parts(kind, t, n, speed, spread, life, size, tone, **kw):
    e = {"type": "particles", "kind": kind, "t": t, "n": n, "speed": speed, "spread": spread, "life": life, "size": size, "at": "area", "tone": tone, "tier": 1}
    e.update(kw)
    return e


def unmul(events, k):
    """FxRunner nhân `offset` (cả y) và `scale` của mesh (trừ fit='area') với `mul` = hazardMul(r, 8) của vùng dải/nón: chia ngược để kích thước/vị trí
    bằng đúng mét ghi ở đây (vùng tròn đã viết theo `mul` nên không dùng)."""
    out = []
    for e in events:
        e = dict(e)
        if e['type'] in ('mesh', 'particles') and 'offset' in e:
            e['offset'] = [round(v / k, 3) for v in e['offset']]
        if e['type'] == 'mesh' and e.get('fit') != 'area':
            sc = e.get('scale', 1)
            e['scale'] = [round(v / k, 3) for v in sc] if isinstance(sc, list) else round(sc / k, 3)
        out.append(e)
    return out


def write(name, events, palette):
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump({"skill": name, "palette": palette, "events": events}, f, ensure_ascii=False, indent=1)
        f.write('\n')


def flip(tex, t, x, z, scale, seed, h=0.9, dur=0.9, alpha=0.95, tone='body', tier=0):
    """Flipbook Codex (flip_atlas) tại (x ngang, z dọc hướng vùng); quay mặt về camera."""
    return mesh('flip', t, dur, tone, alpha, seed, flip=tex, scale=scale, offset=[round(x, 2), h, round(z, 2)], sweep=0, tier=tier)


def flip_ring(tex, n, rad, t0, scale, seed0, step=0.02, **kw):
    out = []
    for i in range(n):
        a = i / n * math.tau + 0.3
        out.append(flip(tex, t0 + i * step, math.sin(a) * rad, math.cos(a) * rad, scale + (i % 3) * 0.15, seed0 + i, tier=0 if i % 2 == 0 else 1, **kw))
    return out


def flip_line(tex, n, length, t0, scale, seed0, step=0.035, jitter=0.5, **kw):
    out = []
    for i in range(n):
        z = 1.5 + (length - 3) * i / max(1, n - 1)
        out.append(flip(tex, t0 + i * step, ((i % 3) - 1) * jitter, z, scale + (i % 3) * 0.15, seed0 + i, tier=0 if i % 2 == 0 else 1, **kw))
    return out


# Lưu ý: hình `smoke` luôn là khói toon TRẮNG ngả lam (không theo tông màu) nên làm nhạt đất/ngọc/lửa/rễ: A1 không dùng, chỉ giữ hạt dust/tro.
def mist(t, dur, alpha, seed, scale=1.0, tone='core'):
    return mesh('smoke', t, dur, tone, alpha, seed, fit='area', scale=scale, scaleTo=scale * 1.12, sweep=0.35, erodeFrom=0.3)


def ring_mesh(shape, n, rad, base_seed, scale, tone='body', tilt=-90, h=0.0, t0=0.02, step=0.015):
    out = []
    for i in range(n):
        a = i / n * math.tau
        out.append(mesh(shape, t0 + i * step, 0.8, tone, 1, base_seed + i, offset=[round(math.cos(a) * rad, 2), h, round(math.sin(a) * rad, 2)],
                        rot=[tilt, 0, 0], scale=scale + (i % 3) * 0.06, sweep=0.2, erodeFrom=0.55, tier=0 if i % 2 == 0 else 1))
    return out


def ripple(t, tone, alpha, seed, s0=0.85, s1=1.04, dur=0.55):
    # sóng đầu tiên: bắt đầu gần đủ bán kính + sweep ngắn để thấy ngay ở khung +0 ms
    return mesh('ripple', t, dur, tone, alpha, seed, scale=s0, scaleTo=s1, fit='area', sweep=0.08, erodeFrom=0.5, ragged=0.4)


def spires(length, n, half_w, scale, seed, tone='body', t0=0.0, step=0.025):
    """Hai hàng gai đá hai bên dải (rock_spire, đứng +Y), mật độ cao dọc dải."""
    out = []
    for i in range(n):
        z = 1.2 + (length - 2.4) * i / max(1, n - 1)
        for sd in (-1, 1):
            out.append(mesh('rock_spire', t0 + i * step, 0.9, tone, 1, seed + i * 2 + (sd > 0), offset=[sd * half_w, 0, round(z, 2)],
                            scale=scale * (0.8 + 0.4 * ((i + (sd > 0)) % 3) / 2), sweep=0.2, erodeFrom=0.6, tier=0 if i % 2 == 0 else 1))
    return out


def rift(length, width, tone='rim', alpha=0.95, seed=60, t=0.0, dur=1.1):
    """Khe nứt thẳng dọc dải (rift_line: rộng ≈ 0,14 × scale x)."""
    return mesh('rift_line', t, dur, tone, alpha, seed, offset=[0, 0.3, 0], scale=[round(width / 0.14, 2), 1, length], sweep=0.22, erodeFrom=0.55)


# ---------- vạch báo: đĩa/quạt/dải đỏ đặc, vân nứt tô dần theo delay ----------
def warn_circle(delay, yaw_a=35, yaw_b=-50, spark=16):
    return [
        decal('warn_crack', 0, 4, 2, 'accent', 0.9, 0.04, yaw=yaw_b),  # viền + nền mờ: hitbox đọc được ngay (kể cả khi texture chưa nạp xong: vòng cũ được giữ, xem MonFx.warn)
        decal('warn_crack', 0, 4, 2, 'accent', 0.95, delay, yaw=yaw_a, growUntilDelay=True),  # vân nứt đỏ sáng lan từ tâm
        parts('spark', 0, spark, 1.7, 1, 0.9, 0.09, 'accent', inward=True, offset=[0, 0.2, 0]),
    ]


def warn_fan(delay, half, spark=20):
    return [
        decal('warn_crack', 0, 8, 2, 'accent', 0.9, 0.04, sector=half),
        decal('warn_crack', 0, 8, 2, 'accent', 0.95, delay, sector=half, growUntilDelay=True),
        parts('spark', 0, spark, 2.2, 0.5, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, 3]),
    ]


def warn_strip(delay, length, width, spark=20):
    return [
        decal('warn_crack', 0, 1, 2, 'accent', 0.9, 0.04, strip=[length, width]),
        decal('warn_crack', 0, 1, 2, 'accent', 0.95, delay, strip=[length, width], growUntilDelay=True),
        parts('spark', 0, spark, 2.2, 0.4, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, length * 0.3]),
    ]


def cast_ring(boss, r, pal):
    # Lúc niệm (MonFx.cast): viền đỏ MỎNG + triện mờ trong suốt thời gian niệm, rồi vạch báo tô đậm ở `delay` cuối. 1 decal (trần DECAL_MAX).
    write('mon_cast__' + boss, [decal('rune', 0, r, 3.6, 'accent', 0.75, 0.35, ink=True, untilDelay=False, at='self')], pal)


def sp(name, t, dur, size, x=0.0, y=0.0, z=0.0, k=1.0, alpha=0.95, erode=0.35, flat=False, aim=False, to=None, size_to=None, seed=0, tone='body'):
    """Một sprite: `size` = cạnh ô vuông bằng mét thật (scale của mesh là NỬA cạnh vì ô rộng 2 đơn vị); `k` = hệ số mul của vùng để chia ngược. `to` = (x, z) đích trượt tới (mét thật)."""
    e = mesh('sprite', t, dur, tone, alpha, seed, sprite=name, scale=round(size / 2 / k, 3), scaleTo=round((size_to or size) / 2 / k, 3),
             offset=[round(x / k, 3), round(y / k, 3), round(z / k, 3)], erodeFrom=erode, sweep=0, ragged=0.5, tier=0)
    if flat:
        e['billboard'] = False
        e['rot'] = [-90, 0, 0]
    if aim:
        e['aim'] = True
    if to is not None:
        e['move'] = {'to': 'area', 'offset': [round(to[0] / k, 3), round(y / k, 3), round(to[1] / k, 3)], 'ease': 'out'}
    return e


def ring_pts(n, rad, a0=0.3):
    return [(math.cos(a0 + i / n * math.tau) * rad, math.sin(a0 + i / n * math.tau) * rad) for i in range(n)]
