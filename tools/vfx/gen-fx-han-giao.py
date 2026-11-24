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


def flips(n, rad, base_t, scale, h=0.9, dur=0.9, alpha=0.95, tone='body'):
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


def mist(t, dur, alpha, seed, scale=1.0, tone='core'):
    """Sương lạnh: tấm khói toon nằm trên đất phủ vùng, nở rồi tan."""
    return mesh('smoke', t, dur, tone, alpha, seed, fit='area', scale=scale, scaleTo=scale * 1.12, sweep=0.35, erodeFrom=0.3)


def warn_disc(delay_grow, yaw_a=35, yaw_b=-50):
    """Vạch báo = ĐĨA đỏ: nền mờ thấy rõ viền hitbox ngay từ đầu + đĩa đỏ/vân nứt (warn_crack) tô dần từ tâm ra rìa theo tiến độ nạp."""
    return [
        decal('warn_crack', 0, 4, 2, 'accent', 0.9, 0.04, yaw=yaw_b),  # viền + vân mờ: hitbox đọc được ngay
        decal('warn_crack', 0, 4, 2, 'accent', 0.95, delay_grow, yaw=yaw_a, growUntilDelay=True),  # vân nứt đỏ sáng lan từ tâm
    ]


# ---------------- SLAM: tròn r 5,5 quanh người bị nhắm, báo 1,7 s ----------------
write('mon_warn__boss_han_giao__slam', [
    *warn_disc(1.6),
    parts('spark', 0, 16, 1.7, 1, 0.9, 0.09, 'accent', inward=True, offset=[0, 0.2, 0]),
])
write('mon_boom_circle__boss_han_giao__slam', [
    mesh('burst', 0, 0.16, 'rim', 0.4, 0, offset=[0, 0.5, 0], scale=1.6, billboard=True, sweep=0),
    decal('ice_crack', 0, 4.4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=0.35),  # đĩa băng xanh sáng + viền vàng, hiện ngay
    mesh('ripple', 0, 0.5, 'rim', 0.95, 2, scale=0.7, scaleTo=1.04, fit='area', sweep=0.25, erodeFrom=0.5, ragged=0.4),
    mesh('ripple', 0.04, 0.45, 'body', 0.85, 3, scale=0.5, scaleTo=0.85, fit='area', sweep=0.3, erodeFrom=0.45),
    *flips(6, 2.4, 0.0, 1.9),
    *flips(4, 0.9, 0.04, 1.5, tone='body'),
    *ring(8, 3.1, 20, 0.62),  # cột băng nhọn quanh vùng
    mesh('spike', 0, 0.9, 'body', 1, 40, offset=[0, 0, 0], rot=[-90, 0, 0], scale=0.95, sweep=0.15, erodeFrom=0.6),
    mist(0.05, 1.5, 0.4, 7, tone='body'),
    parts('shard', 0, 26, 6, 0.9, 0.7, 0.12, 'body', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('dust', 0, 26, 3, 0.9, 0.9, 0.24, 'core', offset=[0, 0.2, 0], grav=1.2),
])

# ---------------- CHANT: tròn r 12–13 quanh boss, niệm 2,6 s rồi báo 0,9 s ----------------
# Lúc niệm (MonFx.cast, `mon_cast__<quái>`, mét thật): viền đỏ MỎNG r 13 + triện mờ trong suốt thời gian niệm, rồi 0,9 s cuối vạch báo tô đậm.
write('mon_cast__boss_han_giao', [
    decal('rune', 0, 13, 3.4, 'accent', 0.75, 0.35, ink=True, untilDelay=False, at='self'),  # 1 decal (trần DECAL_MAX): viền đỏ mỏng + triện
])
write('mon_warn__boss_han_giao__chant', [
    *warn_disc(0.85, 70, -20),
    parts('spark', 0, 26, 3.2, 1, 0.9, 0.11, 'accent', inward=True, offset=[0, 0.2, 0]),
])
write('mon_boom_circle__boss_han_giao__chant', [
    mesh('burst', 0, 0.16, 'rim', 0.34, 0, offset=[0, 0.7, 0], scale=1.4, billboard=True, sweep=0),
    decal('ice_crack', 0, 4.5, 2.8, 'body', 1.0, 0.03, top=False, untilDelay=False, lift=0.35),
    mesh('ripple', 0, 0.6, 'rim', 0.95, 2, scale=0.6, scaleTo=1.04, fit='area', sweep=0.25, erodeFrom=0.5, ragged=0.4),
    mesh('ripple', 0.06, 0.55, 'body', 0.85, 3, scale=0.4, scaleTo=0.8, fit='area', sweep=0.3, erodeFrom=0.45),
    *flips(8, 3.3, 0.0, 2.1),
    *flips(6, 1.5, 0.05, 1.7, tone='body'),
    *ring(8, 3.1, 60, 0.6),
    mist(0.05, 1.8, 0.32, 9, tone='body'),
    parts('shard', 0, 40, 7, 1, 0.85, 0.12, 'body', offset=[0, 0.3, 0], grav=8, tier=0),
    parts('dust', 0, 32, 4, 1, 0.9, 0.26, 'core', offset=[0, 0.2, 0], grav=1.2),
])

# ---------------- SWEEP: quạt r 14, nửa góc 35° ----------------
write('mon_warn_cone__boss_han_giao__sweep', [
    decal('warn_crack', 0, 8, 1.6, 'accent', 0.9, 0.04, sector=35),  # quạt mờ: viền hitbox đọc ngay
    decal('warn_crack', 0, 8, 1.6, 'accent', 0.95, 1.4, sector=35, growUntilDelay=True),  # vân nứt đỏ nạp từ tâm ra cung
    parts('spark', 0, 22, 2.2, 0.5, 1.2, 0.1, 'accent', inward=True, offset=[0, 0.3, 4]),
    parts('spark', 0.4, 18, 2.2, 0.5, 1.0, 0.1, 'rim', inward=True, offset=[0, 0.3, 7]),
])
write('mon_boom_cone__boss_han_giao__sweep', [
    mesh('burst', 0, 0.14, 'rim', 0.36, 0, offset=[0, 0.6, 0.8], scale=1.5, billboard=True, sweep=0),
    decal('ice_crack', 0, 8, 2.2, 'body', 1.0, 0.03, top=False, untilDelay=False, sector=35, lift=0.35),
    # lưỡi băng quét: MỘT tia sáng trắng xoay từ mép này sang mép kia (swing), từ gốc ra cung (như concept); 1 decal để chừa trần DECAL_MAX
    decal('ice_crack', 0, 8, 0.6, 'rim', 1.0, 0.06, top=False, untilDelay=False, sector=9, swing=[-31, 31], swingDur=0.28, lift=0.4),
    *[mesh('flip', 0.0 + i * 0.03, 0.9, 'body', 0.95, 230 + i, flip='ice_flip', scale=1.7 + (i % 3) * 0.25,
           offset=[round(math.sin(math.radians((i % 3 - 1) * 16)) * (2.5 + i * 1.7), 2), 0.9, round(math.cos(math.radians((i % 3 - 1) * 16)) * (2.5 + i * 1.7), 2)],
           sweep=0, tier=0 if i % 2 == 0 else 1) for i in range(7)],
    mist(0.05, 1.6, 0.5, 11, scale=0.5),
    parts('shard', 0, 26, 9, 0.35, 0.6, 0.1, 'body', offset=[0, 0.5, 0.8], grav=4, tier=0),
    parts('dust', 0.04, 14, 3, 0.7, 0.9, 0.26, 'core', offset=[0, 0.1, 4], grav=1),
])
print('ok')
