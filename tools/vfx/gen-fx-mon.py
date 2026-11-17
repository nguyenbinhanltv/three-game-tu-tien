# VFX-V5: sinh `packages/content/data/fx/mon_*.json`: hiệu ứng của QUÁI / TINH ANH / BOSS theo cùng ngôn ngữ V0–V4
# (ba tầng màu + bóng sẫm, mép rách, gai tinh thể, triện văn, hạt tan). Chỉ hình, không đổi luật. Chạy: python tools/vfx/gen-fx-mon.py
# Màu theo ngũ hành của quái (palette `mon_<elem>`, boss `mon_boss`) chọn lúc chạy ở `game/monFx.ts`; JSON chỉ ghi tầng màu (core/body/rim/accent).
# Quy ước: hầu hết sự kiện neo hit=0 (`t` giây quanh mốc trúng/nổ); vạch báo/niệm dùng `from: start`.
# Hệ số cỡ `mul` do client truyền (chiều cao quái, bán kính vùng): khoảng dịch và cỡ ở đây ứng với mul = 1.
import json
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'content', 'data', 'fx')
START = {'from': 'start'}


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


BOSS = {}


def write(name, events, **extra):
    d = {'skill': name, 'palette': 'mon_neutral', 'events': events}
    if name in BOSS:
        d['variants'] = {'boss': BOSS[name]}
    d.update(extra)
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


def ring(n, radius, f):
    return [f(i, round(radius * math.sin(2 * math.pi * i / n), 2), round(radius * math.cos(2 * math.pi * i / n), 2)) for i in range(n)]



# ---- BOSS (V5 PR 2): biến thức `boss` cộng thêm vào sự kiện chung; màu `mon_boss_<hệ>` (viền vàng kim, accent đỏ thẫm) chọn ở client. ----
# Vạch báo vùng tròn: vành triện văn ngoài sẫm, bốn cột gai đỏ ở mép (tới lúc nổ), gợn nhấp nháy, khí hút vào.
BOSS['mon_warn'] = [
    decal('rune', 0.0, 5.4, 2.0, at='area', grow=0.3, tone='core', alpha=0.9, untilDelay=True, yaw=22, tier=0, **START),
    mesh('ripple', 0.35, 0.45, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.5, erodeFrom=0.5, ragged=0.8, tone='accent', alpha=0.75, seed=9, tier=1, **START),
    mesh('ripple', 0.75, 0.45, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.5, erodeFrom=0.5, ragged=0.8, tone='rim', alpha=0.65, seed=10, tier=1, **START),
    parts('spark', 0.0, 22, 2.4, 1.0, 1.1, 0.12, at='area', offset=[0, 0.3, 0], tone='rim', inward=True, tier=0, **START),
] + ring(4, 3.9, lambda i, x, z: mesh('spike', 0.05 * i, 1.0, at='area', offset=[x, 0, z], rot=[-90, 0, 0], scale=0.5, sweep=0.25, erodeFrom=0.9, tone='accent', alpha=0.95, seed=60 + i, untilDelay=True, tier=0, **START))

# Nổ vùng tròn: chớp lớn, gợn viền sáng thứ ba, vòng gai ngoài, cột sáng giữa, mảnh vỡ nhiều, vết nứt lớn.
BOSS['mon_boom_circle'] = [
    mesh('burst', 0.0, 0.16, at='area', offset=[0, 0.8, 0], scale=4.2, billboard=True, sweep=0.0, tone='accent', tier=0),
    mesh('ripple', 0.1, 0.6, at='area', scale=0.1, scaleTo=1.3, fit='area', sweep=0.4, erodeFrom=0.4, ragged=0.9, tone='rim', alpha=0.85, seed=14, tier=0),
    mesh('kite', 0.0, 0.6, at='area', offset=[0, 0, 0], rot=[-90, 0, 0], scale=[0.7, 0.7, 6.5], sweep=0.2, erodeFrom=0.45, tone='rim', alpha=0.8, seed=15, tier=1),
    decal('crack', 0.04, 6.5, 2.8, at='area', grow=0.16, tone='core', alpha=0.9, yaw=40, tier=1),
    parts('shard', 0.0, 26, 6.5, 0.9, 0.7, 0.16, at='area', offset=[0, 0.3, 0], tone='rim', grav=9, tier=1),
] + ring(12, 4.4, lambda i, x, z: mesh('spike', round(0.05 + 0.012 * i, 3), 0.75, at='area', offset=[x, 0, z], rot=[-90 if i % 2 == 0 else -75, 0, 0], scale=round(0.75 + 0.12 * (i % 3), 2), sweep=0.2, erodeFrom=0.55, tone='rim' if i % 2 else 'body', seed=80 + i, tier=1 if i % 2 else 0))

BOSS['mon_boom_line'] = [
    mesh('kite', 0.2, 0.6, at='area', offset=[0, 0, 8.0], rot=[-90, 0, 0], scale=[0.6, 0.6, 5.5], sweep=0.2, erodeFrom=0.45, tone='rim', alpha=0.8, seed=16, tier=1),
    decal('crack', 0.1, 4.6, 2.4, at='area', offset=[0, 0, 8.0], grow=0.2, tone='core', alpha=0.9, tier=1),
] + [mesh('spike', round(0.06 + 0.04 * i, 3), 0.75, at='area', offset=[1.3 if i % 2 else -1.3, 0, round(1.2 + i * 1.0, 2)], rot=[-85, 0, 0], scale=round(0.9 + 0.04 * i, 2), sweep=0.2, erodeFrom=0.55, tone='rim', seed=100 + i, tier=0 if i % 2 else 1) for i in range(8)]

BOSS['mon_boom_cone'] = [
    mesh('crescent', 0.08, 0.34, at='area', offset=[0, 0.35, 0], scale=[11.0, 1.0, 11.0], sweep=0.45, erodeFrom=0.35, ragged=0.85, tone='rim', alpha=0.8, seed=17, tier=1),
    mesh('burst', 0.04, 0.14, at='area', offset=[0, 0.8, 1.4], scale=3.0, billboard=True, sweep=0.0, tone='accent', tier=0),
    parts('shard', 0.02, 16, 7.0, 0.5, 0.6, 0.14, at='area', offset=[0, 0.4, 1.0], tone='rim', grav=8, tier=1),
]

# Đòn đánh người của boss: thêm vệt cào lớn viền sáng + mảnh.
BOSS['mon_strike'] = [
    mesh('crescent', -0.06, 0.26, at='target', rot=[0, 0, 18], scale=[2.2, 1.0, 2.9], scaleTo=[2.6, 1.0, 3.3], sweep=0.45, erodeFrom=0.4, ragged=0.95, tone='rim', alpha=0.9, seed=21, tier=1),
    parts('shard', 0.0, 8, 4.5, 0.9, 0.5, 0.14, at='target', tone='accent', grav=8, tier=1),
]

# Niệm/chant của boss (2,4 s): triện văn lớn, gợn lặp, cột sáng tụ, khí hút vào dày.
BOSS['mon_cast'] = [
    decal('rune', 0.0, 4.6, 2.4, at='self', grow=0.4, tone='core', alpha=1.0, yaw=15, tier=0, **START),
    mesh('ripple', 0.6, 0.6, at='self', offset=[0, -1.0, 0], scale=0.4, scaleTo=2.6, sweep=0.5, erodeFrom=0.4, ragged=0.8, tone='rim', alpha=0.85, seed=11, tier=1, **START),
    mesh('ripple', 1.2, 0.6, at='self', offset=[0, -1.0, 0], scale=0.4, scaleTo=2.8, sweep=0.5, erodeFrom=0.4, ragged=0.8, tone='accent', alpha=0.85, seed=12, tier=1, **START),
    mesh('kite', 0.2, 2.2, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[0.5, 0.5, 4.5], sweep=0.5, erodeFrom=0.75, tone='rim', alpha=0.5, seed=13, tier=1, **START),
    parts('spark', 0.0, 40, 3.6, 1.0, 1.3, 0.16, at='self', tone='rim', inward=True, tier=0, **START),
]

# Boss gục: ba gợn lớn, vòng gai vỡ, cột sáng bay lên, tro + cánh linh quang nhiều, vết nứt lớn.
BOSS['mon_death'] = [
    mesh('burst', 0.08, 0.2, at='self', scale=3.4, billboard=True, sweep=0.0, tone='accent', tier=0),
    mesh('ripple', 0.2, 0.9, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=3.6, sweep=0.4, erodeFrom=0.3, ragged=0.9, tone='rim', alpha=0.85, seed=18, tier=0),
    mesh('ripple', 0.4, 0.9, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=4.4, sweep=0.4, erodeFrom=0.3, ragged=0.9, tone='accent', alpha=0.7, seed=19, tier=1),
    mesh('kite', 0.1, 1.2, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[0.6, 0.6, 7.0], sweep=0.3, erodeFrom=0.4, tone='rim', alpha=0.7, seed=22, tier=1),
    decal('crack', 0.1, 3.2, 3.0, at='self', grow=0.3, tone='core', alpha=0.9, yaw=10, tier=1),
    parts('petal', 0.1, 40, 2.6, 0.9, 2.0, 0.22, at='self', tone='rim', grav=-0.7, tier=0),
    parts('dust', 0.0, 60, 2.6, 0.9, 1.8, 0.4, at='self', tone='body', grav=-1.6, tier=1),
    parts('shard', 0.0, 30, 4.5, 0.9, 1.0, 0.22, at='self', tone='accent', grav=7, tier=1),
] + ring(10, 2.4, lambda i, x, z: mesh('spike', round(0.08 + 0.02 * i, 3), 0.8, at='self', offset=[x, -1.0, z], rot=[-90 if i % 2 else -75, 0, 0], scale=0.9, sweep=0.2, erodeFrom=0.5, tone='rim' if i % 2 else 'body', seed=120 + i, tier=1))


# 1) Quái bị đánh: chớp nhỏ + tia + mảnh tinh thể theo hệ (rẻ: người chơi đánh liên tục).
write('mon_hit', [
    mesh('burst', 0.0, 0.14, at='target', scale=1.0, scaleTo=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
    parts('spark', 0.0, 12, 5.5, 0.85, 0.35, 0.12, at='target', tone='rim', tier=0),
    parts('shard', 0.0, 6, 3.8, 0.9, 0.55, 0.15, at='target', tone='body', grav=8, tier=1),
])

# 2) Đòn của quái trúng người: ba vệt cào mảnh mép rách (đỏ son là chủ, thân theo hệ nằm trong) khác hẳn vệt chém tròn to của người chơi;
# chớp đỏ + tia + vết cháy nhẹ. Nhỏ hơn đòn người chơi để không lẫn.
write('mon_strike', [
    mesh('crescent', -0.04, 0.2, at='target', rot=[0, 0, 24], scale=[1.4, 1.0, 1.75], scaleTo=[1.6, 1.0, 2.0], sweep=0.45, erodeFrom=0.4, ragged=0.9, tone='accent', alpha=0.95, seed=3, tier=0),
    mesh('crescent', -0.02, 0.2, at='target', offset=[0.25, 0.1, 0], rot=[0, 0, 36], scale=[1.1, 1.0, 1.45], scaleTo=[1.3, 1.0, 1.7], sweep=0.45, erodeFrom=0.4, ragged=0.9, tone='body', alpha=0.9, seed=5, tier=0),
    mesh('crescent', 0.0, 0.18, at='target', offset=[-0.25, -0.05, 0], rot=[0, 0, 12], scale=[1.0, 1.0, 1.3], scaleTo=[1.2, 1.0, 1.5], sweep=0.45, erodeFrom=0.4, ragged=0.9, tone='accent', alpha=0.85, seed=9, tier=1),
    mesh('burst', 0.0, 0.12, at='target', scale=0.9, billboard=True, sweep=0.0, tone='accent', tier=0),
    parts('spark', 0.0, 10, 6.0, 0.7, 0.3, 0.08, at='target', tone='accent', tier=0),
    decal('scorch', 0.0, 1.2, 1.2, at='target', grow=0.08, tone='core', alpha=0.5, tier=2),
])

# 3) Quái niệm/tụ lực (chant, cast): triện văn dưới chân + khí hút vào tâm.
write('mon_cast', [
    decal('rune', 0.0, 2.6, 1.5, at='self', grow=0.3, tone='accent', alpha=1.0, tier=0, **START),
    decal('rune', 0.1, 1.6, 1.4, at='self', grow=0.3, tone='body', alpha=0.9, yaw=30, tier=1, **START),
    mesh('ripple', 0.0, 0.7, at='self', offset=[0, -1.0, 0], scale=0.5, scaleTo=2.2, sweep=0.5, erodeFrom=0.4, ragged=0.7, tone='body', alpha=0.9, seed=2, tier=0, **START),
    mesh('ripple', 0.3, 0.6, at='self', offset=[0, -1.0, 0], scale=0.4, scaleTo=1.6, sweep=0.5, erodeFrom=0.4, ragged=0.8, tone='accent', alpha=0.85, seed=8, tier=1, **START),
    parts('spark', 0.0, 28, 2.6, 1.0, 0.8, 0.14, at='self', tone='rim', inward=True, tier=0, **START),
    parts('dust', 0.1, 14, 2.2, 1.0, 0.9, 0.26, at='self', tone='body', inward=True, tier=1, **START),
])

# 4) Vạch báo (vùng sắp nổ): triện văn đỏ trải theo vùng + gợn mở; `untilDelay` = tồn tại đúng tới lúc nổ. mul = r/4 (m).
write('mon_warn', [
    decal('rune', 0.0, 4.0, 2.0, at='area', grow=0.25, tone='accent', alpha=0.9, untilDelay=True, tier=0, **START),
    mesh('ripple', 0.0, 0.45, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.5, erodeFrom=0.5, ragged=0.8, tone='accent', alpha=0.8, seed=7, tier=0, **START),
    parts('spark', 0.0, 14, 1.6, 1.0, 0.9, 0.09, at='area', offset=[0, 0.2, 0], tone='accent', inward=True, tier=1, **START),
])

# 5) Nổ vùng tròn: chớp, hai gợn lan, vòng gai tinh thể trồi lần lượt, vết nứt + cháy, đá/mảnh bắn lên. mul = r/4.
circle = [
    mesh('burst', 0.0, 0.12, at='area', offset=[0, 0.5, 0], scale=2.4, billboard=True, sweep=0.0, tone='rim', tier=0),
    mesh('ripple', 0.0, 0.55, at='area', scale=0.15, scaleTo=1.0, fit='area', sweep=0.4, erodeFrom=0.45, ragged=0.8, tone='body', alpha=0.95, seed=2, tier=0),
    mesh('ripple', 0.07, 0.5, at='area', scale=0.1, scaleTo=0.7, fit='area', sweep=0.4, erodeFrom=0.4, tone='accent', alpha=0.8, seed=3, tier=1),
    decal('crack', 0.02, 4.4, 2.4, at='area', grow=0.12, tone='accent', alpha=0.9, tier=0),
    decal('scorch', 0.0, 4.2, 2.0, at='area', grow=0.1, tone='core', alpha=0.55, tier=1),
    parts('dust', 0.0, 26, 3.0, 0.9, 0.55, 0.22, at='area', offset=[0, 0.2, 0], tone='core', grav=3, tier=1),
    parts('shard', 0.0, 14, 5.0, 0.9, 0.6, 0.12, at='area', offset=[0, 0.3, 0], tone='body', grav=9, tier=0),
]
circle += ring(8, 3.0, lambda i, x, z: mesh('spike', round(0.02 + 0.015 * i, 3), 0.7, at='area', offset=[x, 0, z], rot=[-90 if i % 2 == 0 else -78, 0, 0], scale=round(0.55 + 0.1 * (i % 3), 2), sweep=0.2, erodeFrom=0.55, tone='body', seed=20 + i, tier=0 if i % 2 == 0 else 1))
write('mon_boom_circle', circle)

# 6) Nổ vùng chữ nhật (đường): gai tinh thể trồi nối tiếp dọc trục (như ảnh tham khảo 08) + vệt nứt; actor.yaw = hướng vạch, area = gốc. mul = r/8.
line = [
    mesh('burst', 0.0, 0.1, at='area', offset=[0, 0.5, 0.6], scale=1.4, billboard=True, sweep=0.0, tone='rim', tier=0),
    decal('crack', 0.04, 4.0, 2.0, at='area', offset=[0, 0, 4.0], grow=0.18, tone='accent', alpha=0.9, tier=0),
    parts('shard', 0.0, 18, 5.0, 0.4, 0.6, 0.12, at='area', offset=[0, 0.3, 1.0], tone='body', grav=9, tier=1),
]
for i in range(8):
    z = round(0.8 + i * 1.0, 2)
    line.append(mesh('spike', round(0.03 + 0.04 * i, 3), 0.7, at='area', offset=[0.35 if i % 2 else -0.35, 0, z], rot=[-90 if i % 2 == 0 else -80, 0, 0], scale=round(0.55 + 0.05 * i, 2), sweep=0.2, erodeFrom=0.55, tone='body', seed=40 + i, tier=0 if i % 2 == 0 else 1))
    line.append(parts('dust', round(0.03 + 0.04 * i, 3), 3, 1.8, 0.8, 0.5, 0.18, at='area', offset=[0, 0.2, z], tone='core', grav=2, tier=1))
write('mon_boom_line', line)

# 7) Nổ vùng nón (quét): ba lưỡi liềm lồng nhau mở theo hướng, tia xẹt, khói toon. mul = r/8.
write('mon_boom_cone', [
    mesh('crescent', 0.0, 0.32, at='area', offset=[0, 0.2, 0], scale=[8.0, 1.0, 8.0], sweep=0.45, erodeFrom=0.4, ragged=0.6, tone='body', alpha=0.9, seed=11, tier=0),
    mesh('crescent', 0.03, 0.3, at='area', offset=[0, 0.25, 0], scale=[6.0, 1.0, 6.0], sweep=0.45, erodeFrom=0.4, ragged=0.7, tone='rim', alpha=0.85, seed=12, tier=1),
    mesh('crescent', 0.05, 0.28, at='area', offset=[0, 0.3, 0], scale=[9.5, 1.0, 9.5], sweep=0.45, erodeFrom=0.35, ragged=0.8, tone='accent', alpha=0.7, seed=13, tier=2),
    mesh('burst', 0.0, 0.1, at='area', offset=[0, 0.6, 0.8], scale=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
    mesh('smoke', 0.04, 0.9, at='area', offset=[0, 0, 3.0], scale=3.2, scaleTo=5.5, sweep=0.5, erodeFrom=0.4, tone='core', alpha=0.55, tier=1),
    parts('spark', 0.0, 22, 8.0, 0.35, 0.45, 0.09, at='area', offset=[0, 0.5, 0.8], tone='rim', tier=0),
])

# 8) Đạn đánh xa của quái: miệng nòng lúc bắn, và va chạm lúc tan.
write('mon_bolt_muzzle', [
    mesh('burst', 0.0, 0.14, at='ahead', scale=0.9, billboard=True, sweep=0.0, tone='rim', tier=0),
    parts('spark', 0.0, 8, 4.0, 0.5, 0.3, 0.08, at='ahead', tone='body', tier=0),
])
write('mon_bolt_impact', [
    mesh('burst', 0.0, 0.14, at='target', scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0),
    mesh('ripple', 0.0, 0.4, at='target', offset=[0, -1.0, 0], scale=0.3, scaleTo=1.3, sweep=0.5, erodeFrom=0.4, ragged=0.7, tone='body', alpha=0.85, seed=4, tier=1),
    parts('spark', 0.0, 10, 5.0, 0.9, 0.35, 0.08, at='target', tone='rim', tier=0),
    parts('shard', 0.0, 6, 3.5, 0.9, 0.5, 0.1, at='target', tone='accent', grav=8, tier=1),
])

# 9) Quái chết: tan thành hạt (tro bay lên, mảnh tinh thể rơi, cánh linh quang) + gợn + vết cháy; mực có sẵn (`monsterInk`) vẽ thêm. mul theo chiều cao.
write('mon_death', [
    mesh('burst', 0.0, 0.16, at='self', scale=1.5, billboard=True, sweep=0.0, tone='rim', tier=0),
    mesh('ripple', 0.0, 0.6, at='self', offset=[0, -1.0, 0], scale=0.4, scaleTo=1.2, sweep=0.4, erodeFrom=0.4, ragged=0.8, tone='body', alpha=0.9, seed=6, tier=0),
    mesh('ripple', 0.12, 0.7, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=1.6, sweep=0.4, erodeFrom=0.3, ragged=0.9, tone='accent', alpha=0.75, seed=7, tier=1),
    parts('dust', 0.0, 40, 1.8, 0.8, 1.5, 0.34, at='self', tone='body', grav=-1.4, tier=0),
    parts('spark', 0.05, 26, 2.2, 0.9, 1.4, 0.12, at='self', tone='rim', grav=-1.0, tier=0),
    parts('shard', 0.0, 14, 3.4, 0.9, 0.8, 0.16, at='self', tone='core', grav=7, tier=1),
    parts('petal', 0.05, 18, 1.8, 0.9, 1.6, 0.18, at='self', tone='accent', grav=-0.6, tier=1),
    decal('scorch', 0.0, 2.0, 2.2, at='self', grow=0.2, tone='core', alpha=0.55, tier=1),
])

# Vạch báo đường/nón của boss: gợn mở nhấp nháy ba nhịp dọc theo hướng vạch (mul = r/8); pháp trận sẵn có vẫn chạy.
write('mon_warn_line', [
    mesh('ripple', round(0.45 * i, 2), 0.5, at='area', offset=[0, 0.1, 4.0], scale=[1.5, 1.0, 4.3], scaleTo=[1.7, 1.0, 4.6], sweep=0.5, erodeFrom=0.5, ragged=0.8, tone='accent' if i % 2 == 0 else 'rim', alpha=0.7, seed=30 + i, tier=0, **START) for i in range(3)
] + [parts('spark', 0.0, 18, 1.8, 0.4, 1.2, 0.1, at='area', offset=[0, 0.3, 4.0], tone='rim', inward=True, tier=1, **START)])
write('mon_warn_cone', [
    mesh('crescent', round(0.45 * i, 2), 0.5, at='area', offset=[0, 0.2, 0], scale=[8.0, 1.0, 8.0], scaleTo=[8.4, 1.0, 8.4], sweep=0.6, erodeFrom=0.5, ragged=0.8, tone='accent' if i % 2 == 0 else 'rim', alpha=0.75, seed=34 + i, tier=0, **START) for i in range(3)
] + [parts('spark', 0.0, 18, 2.0, 0.5, 1.1, 0.1, at='area', offset=[0, 0.3, 4.0], tone='rim', inward=True, tier=1, **START)])
print('ok')
