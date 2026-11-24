#!/usr/bin/env python3
"""V-P9b: timeline riêng của Hàn Giao (boss_han_giao): slam, chant, sweep — mỗi chiêu một timeline vạch báo + một timeline vùng nổ.
Tên file: mon_warn|mon_warn_cone|mon_boom_circle|mon_boom_cone + '__boss_han_giao__' + chiêu (MonFx.tlFor tìm theo thứ tự này).
Bám concept đã duyệt (artifact vp9/concept): vạch báo ĐỎ (accent, vẽ ĐÈ lên thân boss: decal `top`), tiến độ nạp = vùng đỏ mọc từ tâm ra rìa
trong đúng `delay`, vân nứt đỏ lan dần; nổ = băng (body/rim) + cột băng + mảnh vỡ + dư ba.
Cỡ: decal `r: 4` nhân với `mul` = r_vùng/4 (MonFx.hazardMul) nên bán kính vẽ = bán kính hitbox server (vùng tròn r 2-16 m); quạt dùng pháp trận cũ (đúng hình) + hạt.
Chạy: python tools/vfx/gen-fx-han-giao.py  (ghi vào packages/content/data/fx/)."""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'content', 'data', 'fx')


def decal(tex, t, r, dur, tone, alpha, grow, top=True, ink=False, yaw=None, untilDelay=True, **kw):
    e = {"type": "decal", "tex": tex, "t": t, "r": r, "dur": dur, "at": "area", "grow": grow, "tone": tone, "alpha": alpha, "tier": 0, "from": "start"}
    if top:
        e["top"] = True
    if ink:
        e["ink"] = True
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


def ring(n, rad, base_seed, scale, tone='body', tilt=-90, h=0.0):
    out = []
    for i in range(n):
        a = i / n * math.tau
        out.append(mesh('spike', 0.02 + i * 0.015, 0.75, tone, 1, base_seed + i,
                        offset=[round(math.cos(a) * rad, 2), h, round(math.sin(a) * rad, 2)], rot=[tilt, 0, 0], scale=scale + (i % 3) * 0.06,
                        sweep=0.2, erodeFrom=0.55, **{"tier": 0 if i % 2 == 0 else 1}))
    return out


def flips(n, rad, base_t, scale, h=0.9, dur=0.9, alpha=0.95, tone='rim'):
    """Flipbook băng nứt (texture Codex dùng chung `ice_flip`) tại các điểm quanh tâm vùng; quay mặt về camera."""
    out = []
    for i in range(n):
        a = i / n * math.tau + 0.4
        out.append(mesh('flip', base_t + i * 0.03, dur, tone, alpha, 200 + i, flip='ice_flip', scale=scale + (i % 3) * 0.15,
                        offset=[round(math.cos(a) * rad, 2), h, round(math.sin(a) * rad, 2)], sweep=0, tier=0 if i % 2 == 0 else 1))
    return out


def write(name, events, palette='mon_boss_thuy'):
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8') as f:
        json.dump({"skill": name, "palette": palette, "events": events}, f, ensure_ascii=False, indent=1)
        f.write('\n')


# ---------------- SLAM: tròn r 5,5 quanh người bị nhắm, báo 1,7 s ----------------
write('mon_warn__boss_han_giao__slam', [
    decal('rune', 0, 4, 2, 'accent', 0.95, 0.3, ink=True),  # viền đỏ nét liền + triện, đúng hitbox
    decal('scorch', 0, 4, 2, 'accent', 0.42, 1.6, yaw=0),  # tiến độ: vùng đỏ mọc từ tâm ra rìa trong đúng delay
    decal('warn_crack', 0.1, 3.9, 2, 'accent', 0.8, 1.5, yaw=35),  # vân nứt đỏ (texture Codex dùng chung) lan từ tâm ra rìa trong đúng delay
    decal('rune', 0.4, 2.2, 2, 'rim', 0.5, 0.5, yaw=20),  # vòng triện nhỏ vàng ấm ở tâm (mốc ngắm)
    parts('spark', 0, 16, 1.7, 1, 0.9, 0.09, 'accent', inward=True, offset=[0, 0.2, 0]),
])
write('mon_boom_circle__boss_han_giao__slam', [
    mesh('burst', 0, 0.12, 'rim', 0.32, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    mesh('ripple', 0, 0.55, 'body', 0.95, 2, scale=0.15, scaleTo=1, fit='area', sweep=0.4, erodeFrom=0.45, ragged=0.8),
    mesh('ripple', 0.07, 0.5, 'rim', 0.85, 3, scale=0.1, scaleTo=0.7, fit='area', sweep=0.4, erodeFrom=0.4),
    decal('ice_crack', 0.02, 4.4, 2.2, 'body', 0.92, 0.1, top=False, untilDelay=False),
    *flips(5, 2.6, 0.02, 1.7),
    *ring(6, 3.3, 20, 0.45),
    mesh('spike', 0, 0.8, 'rim', 1, 40, offset=[0, 0, 0], rot=[-90, 0, 0], scale=0.7, sweep=0.2, erodeFrom=0.55),
    parts('shard', 0, 20, 5.5, 0.9, 0.65, 0.12, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('dust', 0, 22, 3, 0.9, 0.55, 0.22, 'core', offset=[0, 0.2, 0], grav=3),
])

# ---------------- CHANT: tròn r 12–13 quanh boss, niệm 2,6 s rồi báo 0,9 s ----------------
write('mon_warn__boss_han_giao__chant', [
    decal('rune', 0, 4, 2, 'accent', 0.95, 0.25, ink=True),
    decal('scorch', 0, 4, 2, 'accent', 0.5, 0.85, yaw=0),  # nạp trong 0,9 s: cả vùng đỏ đậm dần từ tâm
    decal('warn_crack', 0, 3.95, 2, 'accent', 0.8, 0.8, yaw=70),
    decal('rune', 0.1, 2.6, 2, 'accent', 0.7, 0.4, ink=True, yaw=25),  # triện lớn bên trong
    decal('rune', 0.1, 1.5, 2, 'rim', 0.55, 0.4, yaw=-40),
    parts('spark', 0, 26, 3.2, 1, 0.9, 0.11, 'accent', inward=True, offset=[0, 0.2, 0]),
])
write('mon_boom_circle__boss_han_giao__chant', [
    mesh('burst', 0, 0.12, 'rim', 0.26, 0, offset=[0, 0.7, 0], scale=1.2, billboard=True, sweep=0),
    mesh('ripple', 0, 0.7, 'rim', 0.9, 2, scale=0.2, scaleTo=1, fit='area', sweep=0.45, erodeFrom=0.45, ragged=0.5),
    mesh('ripple', 0.12, 0.65, 'body', 0.85, 3, scale=0.1, scaleTo=0.8, fit='area', sweep=0.4, erodeFrom=0.4),
    mesh('ripple', 0.24, 0.6, 'rim', 0.7, 4, scale=0.1, scaleTo=0.55, fit='area', sweep=0.4, erodeFrom=0.4),
    decal('ice_crack', 0.02, 4.5, 2.6, 'body', 0.92, 0.4, top=False, untilDelay=False),
    *flips(7, 3.2, 0.03, 1.9),
    *flips(5, 1.4, 0.2, 1.5, tone='body'),
    *ring(7, 3.0, 60, 0.42),
    parts('shard', 0, 36, 7, 1, 0.8, 0.12, 'rim', offset=[0, 0.3, 0], grav=8, tier=0),
    parts('dust', 0, 30, 4, 1, 0.7, 0.25, 'core', offset=[0, 0.2, 0], grav=2),
])

# ---------------- SWEEP: quạt r 14, nửa góc 35°, báo 1,5 s (pháp trận quạt cũ đè lên thân boss + hạt) ----------------
write('mon_warn_cone__boss_han_giao__sweep', [
    decal('warn_crack', 0, 8, 1.6, 'accent', 0.62, 1.4, sector=35, yaw=None),  # mặt quạt đỏ vân nứt nạp từ tâm ra cung (r 8 × mul 1,75 = 14 m)
    parts('spark', 0, 22, 2.2, 0.5, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, 4]),
    parts('spark', 0.4, 18, 2.2, 0.5, 1.0, 0.1, 'rim', inward=True, offset=[0, 0.3, 7]),
])
sw = []
for i in range(7):
    sw.append(mesh('spike', 0.01 * i, 0.8, 'body', 1, 100 + i, offset=[round((i - 3) * 0.55, 2), 0, round(1.2 + i * 1.7, 2)], rot=[-86, 0, 0],
                   scale=0.4 + (i % 3) * 0.06, sweep=0.2, erodeFrom=0.55, **{"tier": 0 if i % 2 == 0 else 1}))
write('mon_boom_cone__boss_han_giao__sweep', [
    mesh('burst', 0, 0.12, 'rim', 0.3, 0, offset=[0, 0.6, 0.8], scale=1.4, billboard=True, sweep=0),
    decal('ice_crack', 0, 8, 1.6, 'body', 0.95, 0.08, top=False, untilDelay=False, sector=35),  # mặt quạt băng nứt, viền vàng nhạt (concept)
    *[mesh('flip', 0.04 + i * 0.045, 0.85, 'rim', 0.95, 230 + i, flip='ice_flip', scale=1.5 + (i % 3) * 0.2,
           offset=[round(math.sin(math.radians((i % 3 - 1) * 16)) * (2.5 + i * 1.7), 2), 0.85, round(math.cos(math.radians((i % 3 - 1) * 16)) * (2.5 + i * 1.7), 2)],
           sweep=0, tier=0 if i % 2 == 0 else 1) for i in range(7)],
    parts('shard', 0, 22, 9, 0.35, 0.55, 0.1, 'rim', offset=[0, 0.5, 0.8], grav=4, tier=0),
    parts('dust', 0.04, 10, 3, 0.7, 0.8, 0.26, 'core', offset=[0, 0.1, 4], grav=1),
])
print('ok')
