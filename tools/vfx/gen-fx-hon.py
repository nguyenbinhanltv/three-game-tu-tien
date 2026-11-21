# TN-2: sinh timeline VFX của Hồn tu (Dẫn Hồn Kinh) theo ngôn ngữ VFX mới (hình mesh có khối của fxLib, ba tầng màu + bóng sẫm,
# triện văn, hạt). Chỉ là hình, luật ở server. Chạy: python tools/vfx/gen-fx-hon.py
#
#   skl_*.json   chiêu có động tác: FxRunner phát theo sự kiện chiêu (t tính so với hitAt, âm = trước lúc trúng).
#   skl_u_anh_bo chiêu lướt: kích hoạt theo S.FX `dash` của người tu Dẫn Hồn Kinh.
#   hon_*.json   hiệu ứng tại điểm, client phát bằng `FxRunner.startAt` (`game/fx/honFx.ts`): nhịp hồn binh, tia hồn thu về.
# Bảng màu lấy theo hướng tu (paths.json → hon_tu: lõi tím đen, thân tím hồn, viền bạc lạnh, điểm nhấn màu xương).
# Cỡ hình tính cho camera mặc định (cách người ~18 m, nền cỏ sáng): hình chính ở mục tiêu rộng 2,5–3,5 m, có lớp bóng sẫm.
#
# Bản sắc hình: hồn là KHÓI và DẢI mảnh bay lên / bị hút về, không phải lưỡi kiếm; ấn là vòng triện văn sẫm trên đất.
# Bài học #424/#432 áp từ đầu: không khối cộng sáng to gần camera, không cột cao đứng giữa camera và nhân vật (hình cao nhất 2,6 m
# và đặt ở MỤC TIÊU, quanh người chỉ có vòng trên đất và hình thấp dưới 1,2 m), mỗi timeline ≤ 12 draw.
import json
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'content', 'data', 'fx')
M = 'dan_hon_kinh'


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


def sound(t, sid, gain, rate):
    return {'type': 'soundAt', 't': t, 'id': sid, 'gain': gain, 'rate': rate, 'jitter': 0.05}


def write(name, events, **head):
    d = {'skill': name}
    d.update(head)
    d['events'] = events
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


def ring(n, radius, f, phase=0.0):
    out = []
    for i in range(n):
        a = 2 * math.pi * (i + phase) / n
        out.append(f(i, round(radius * math.sin(a), 2), round(radius * math.cos(a), 2)))
    return out


# ---- U Ảnh Bộ (lướt): vệt khói mỏng ở chỗ vừa rời, không sáng ----
write('skl_u_anh_bo', [
    mesh('smoke', 0.0, 0.5, at='self', offset=[0, -0.6, -0.4], scale=1.4, billboard=True, tone='core', alpha=0.7, tier=0),
    mesh('ripple', 0.0, 0.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.5, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.7, tier=1, seed=2),
    parts('dust', 0.0, 14, 1.6, 1.0, 0.5, 0.2, at='self', offset=[0, -0.6, 0], tone='body', tier=1),
    sound(0.0, 'cast', 0.35, 0.8),
], trigger='fx', fxKind='dash', method=M)

# ---- Phệ Hồn (đặc trưng, đơn mục tiêu): một dải hồn lao tới cắn, để lại Hồn ấn (vòng triện sẫm dưới chân mục tiêu) ----
write('skl_phe_hon', [
    parts('dust', -0.3, 14, 1.2, 1.0, 0.28, 0.16, at='self', offset=[0.2, 0, 0.4], inward=True, tone='rim', tier=1),
    sound(-0.3, 'cast', 0.4, 0.75),
    mesh('spark_streak', -0.2, 0.22, at='ahead', offset=[0.1, 0.1, 0.5], scale=3.6, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, shadow=False, tone='rim', tier=0),
    mesh('spark_streak', -0.16, 0.2, at='ahead', offset=[-0.3, 0.4, 0.4], scale=2.6, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, shadow=False, tone='body', tier=1),
    # Trúng: vết cắn chữ thập nhỏ ở ngực mục tiêu + làn khói hồn bốc lên (thấp, sau mục tiêu so với camera).
    mesh('slash_cross', 0.0, 0.34, at='target', offset=[0, 1.0, 0], scale=2.6, billboard=True, sweep=0.3, erodeFrom=0.45, ragged=0.8, tone='rim', alpha=0.95, tier=0, seed=3),
    mesh('smoke', 0.02, 0.7, at='target', offset=[0, 1.0, 0], scale=1.6, scaleTo=2.2, billboard=True, tone='core', alpha=0.7, move={'to': 'target', 'offset': [0, 1.7, 0], 'ease': 'out'}, tier=0),
    mesh('ripple', 0.0, 0.5, at='ground', scale=0.6, scaleTo=3.0, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.8, shadow=False, tier=0, seed=4),
    decal('rune', 0.03, 2.2, 2.6, at='ground', grow=0.14, tone='core', alpha=0.95, tier=0),
    parts('dust', 0.0, 22, 2.2, 1.0, 0.7, 0.18, at='target', offset=[0, 0.9, 0], tone='rim', grav=-1.6, tier=0),
    parts('spark', 0.0, 16, 5.0, 1.0, 0.35, 0.07, at='target', offset=[0, 1.0, 0], tone='accent', tier=1),
    sound(0.0, 'impact', 0.5, 0.8),
    {'type': 'hitstop', 't': 0.0, 'ms': 45},
    {'type': 'shake', 't': 0.0, 'level': 0.12},
])

# ---- Sưu Hồn Thuật: hồn bị rút khỏi mục tiêu (xoắn bốc lên) rồi ba dải bay ngược về người ----
write('skl_suu_hon_thuat', [
    parts('dust', -0.2, 18, 1.4, 1.0, 0.25, 0.16, at='target', offset=[0, 1.0, 0], inward=True, tone='rim', tier=1),
    sound(-0.2, 'cast', 0.45, 0.7),
    mesh('helix', 0.0, 0.7, at='target', offset=[0, 0.1, 0], rot=[-90, 0, 0], scale=[2.2, 2.2, 3.0], sweep=0.3, erodeFrom=0.5, spin=420, tone='body', alpha=0.95, tier=0, seed=5),
    mesh('rune_ring2', 0.0, 0.6, at='ground', offset=[0, 0.06, 0], scale=[0.8, 1, 0.8], scaleTo=[3.4, 1, 3.4], sweep=0.35, erodeFrom=0.5, ragged=0.6, tone='body', alpha=0.85, shadow=False, tier=0, seed=6),
    mesh('burst', 0.0, 0.11, at='target', offset=[0, 1.0, 0], scale=1.1, billboard=True, sweep=0.0, tone='accent', alpha=0.7, tier=0),
    mesh('smoke', 0.0, 0.7, at='target', offset=[0, 1.0, 0], scale=1.8, scaleTo=2.6, billboard=True, tone='core', alpha=0.7, tier=0),
    decal('rune', 0.0, 2.8, 2.4, at='ground', grow=0.12, tone='rim', alpha=0.95, tier=0),
] + [
    mesh('spark_streak', round(0.08 + 0.12 * i, 2), 0.3, at='target', offset=[ox, 1.0 + 0.3 * i, 0], scale=2.8, move={'to': 'self', 'ease': 'in', 'offset': [0, 0.2, 0]}, shadow=False, tone='rim' if i != 1 else 'accent', tier=0 if i == 0 else 1)
    for i, ox in enumerate([0.4, -0.4, 0.0])
] + [
    parts('dust', 0.0, 26, 2.6, 1.0, 0.8, 0.18, at='target', offset=[0, 0.8, 0], tone='rim', grav=-2.0, tier=0),
    decal('scorch', 0.05, 2.4, 2.6, at='ground', grow=0.1, tone='shadow', alpha=0.7, tier=1),
    sound(0.0, 'impact', 0.55, 0.7),
    {'type': 'hitstop', 't': 0.0, 'ms': 50},
    {'type': 'shake', 't': 0.0, 'level': 0.16},
])

# ---- Âm Hồn Triều (quét đường 12 m): ba đợt sóng hồn thấp chạy dọc vệt, nền là vạch nứt sẫm ----
write('skl_am_hon_trieu', [
    parts('dust', -0.4, 20, 1.3, 1.0, 0.3, 0.18, at='self', offset=[0, -0.2, 0.4], inward=True, tone='rim', tier=1),
    sound(-0.4, 'cast', 0.45, 0.7),
    mesh('rift_line', 0.0, 0.9, at='ahead', offset=[0, 0.1, 0.4], scale=[2.2, 1, 12], alpha=1, sweep=0.5, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=7),
    # Hai lưỡi sóng hồn dày, thấp (đỉnh dưới 1,2 m), chạy dọc vệt: phần đọc được từ camera mặc định (đường gió chỉ là nét mảnh).
    mesh('slash_thick', -0.05, 0.4, at='ahead', offset=[0, 0.5, 0.8], rot=[0, 0, 0], scale=2.8, scaleTo=4.6, sweep=0.35, erodeFrom=0.55, ragged=0.6, move={'to': 'ahead', 'offset': [0, 0.5, 10.5], 'ease': 'out'}, tone='body', alpha=0.95, tier=0, seed=70),
    mesh('slash_thick', 0.03, 0.4, at='ahead', offset=[0, 0.4, 0.4], rot=[0, 0, 6], scale=2.2, scaleTo=3.8, sweep=0.35, erodeFrom=0.5, ragged=0.5, move={'to': 'ahead', 'offset': [0, 0.4, 8.5], 'ease': 'out'}, tone='rim', alpha=0.9, shadow=False, tier=1, seed=71),
] + [
    mesh('gust', round(-0.05 + 0.07 * i, 2), 0.42, at='ahead', offset=[ox, 0.7, 0.6], scale=[3.6, 2.0, 6.0], tone=tone, alpha=0.9, seed=8 + i, move={'to': 'ahead', 'offset': [ox, 0.7, 11.0], 'ease': 'out'}, tier=0 if i == 0 else 1)
    for i, (ox, tone) in enumerate([(0.0, 'rim'), (0.7, 'body'), (-0.7, 'body')])
] + [
    decal('rune', 0.0, 2.4, 2.2, at='ahead', offset=[0, 0, 2.0], grow=0.1, tone='rim', alpha=0.9, tier=0),
    decal('rune', 0.06, 2.4, 2.2, at='ahead', offset=[0, 0, 7.0], grow=0.1, tone='rim', alpha=0.9, tier=0),
    mesh('smoke', 0.12, 0.7, at='ahead', offset=[0, 0.7, 11.0], scale=1.6, scaleTo=2.4, billboard=True, tone='core', alpha=0.7, tier=1),
    mesh('ripple', 0.1, 0.45, at='ahead', offset=[0, 0.06, 11.0], scale=0.5, scaleTo=2.4, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.8, shadow=False, tier=0, seed=11),
    parts('dust', 0.0, 36, 7.0, 0.25, 0.7, 0.2, at='ahead', offset=[0, 0.5, 1.0], tone='rim', tier=0),
    parts('dust', 0.06, 24, 3.0, 1.0, 0.8, 0.2, at='ahead', offset=[0, 0.5, 6.0], tone='body', grav=-1.4, tier=1),
    decal('scorch', 0.05, 2.0, 2.8, at='ahead', offset=[0, 0, 4.0], grow=0.1, tone='shadow', alpha=0.7, tier=1),
    sound(0.0, 'impact', 0.55, 0.75),
    {'type': 'hitstop', 't': 0.0, 'ms': 50},
    {'type': 'shake', 't': 0.0, 'level': 0.18},
])

# ---- Định Thân Thuật: lồng ấn khép quanh mục tiêu, giữ ~2 giây (bằng thời gian ghìm), vòng triện dưới chân ----
# Lồng thấp ngang thân mục tiêu (đỉnh dưới 2 m) và bốn chốt ấn thấp 0,5 m: bản đầu dựng lồng 2,3 m + gai 1,6 m thành khối trắng cao che mục tiêu.
write('skl_dinh_than_thuat', [
    parts('dust', -0.3, 16, 1.2, 1.0, 0.28, 0.16, at='target', offset=[0, 1.0, 0], inward=True, tone='rim', tier=1),
    sound(-0.3, 'cast', 0.45, 0.65),
    mesh('diamond_cage', 0.0, 2.0, at='target', offset=[0, 0.9, 0], scale=1.25, sweep=0.12, erodeFrom=0.85, tone='body', alpha=0.7, tier=0, seed=12),
    mesh('rune_ring2', 0.0, 2.0, at='ground', offset=[0, 0.06, 0], scale=[3.0, 1, 3.0], sweep=0.1, erodeFrom=0.85, ragged=0.5, tone='body', alpha=0.85, shadow=False, tier=0, seed=13),
    decal('rune', 0.0, 2.6, 2.2, at='ground', grow=0.05, tone='core', alpha=0.95, tier=0),
] + ring(4, 1.5, lambda i, x, z: mesh('spike', round(0.02 * i, 2), 1.2, at='target', offset=[x, 0.0, z], rot=[-90, 0, 0], scale=[0.45, 0.45, 0.55], sweep=0.2, erodeFrom=0.6, tone='accent' if i % 2 else 'rim', alpha=0.95, seed=14 + i, tier=0 if i < 2 else 1)) + [
    parts('spark', 0.0, 18, 4.0, 1.0, 0.35, 0.07, at='target', offset=[0, 1.0, 0], tone='accent', tier=1),
    sound(0.0, 'impact', 0.5, 0.6),
    {'type': 'hitstop', 't': 0.0, 'ms': 45},
    {'type': 'shake', 't': 0.0, 'level': 0.12},
])

# ---- Hoàng Tuyền Dẫn (vùng 9 m quanh mục tiêu): mặt đất mở thành vũng sẫm, vòng triện loang rộng, khói thấp; không cột sáng ----
write('skl_hoang_tuyen_dan', [
    parts('dust', -0.5, 24, 1.4, 1.0, 0.4, 0.18, at='self', offset=[0, -0.2, 0.2], inward=True, tone='rim', tier=1),
    sound(-0.5, 'cast', 0.5, 0.6),
    decal('rune', -0.35, 8.0, 1.2, at='area', grow=0.3, tone='body', alpha=0.75, tier=0),
    decal('scorch', 0.0, 8.5, 3.0, at='area', grow=0.12, tone='core', alpha=0.9, tier=0),
    mesh('rune_ring2', 0.0, 0.8, at='area', offset=[0, 0.07, 0], scale=[1.5, 1, 1.5], scaleTo=[8.6, 1, 8.6], sweep=0.3, erodeFrom=0.5, ragged=0.6, tone='rim', alpha=0.9, shadow=False, tier=0, seed=20),
    mesh('shock_cone', 0.0, 0.45, at='area', offset=[0, 0.05, 0], scale=[1.0, 0.5, 1.0], scaleTo=[7.0, 0.9, 7.0], sweep=0.3, erodeFrom=0.35, ragged=0.7, tone='body', alpha=0.75, shadow=False, tier=0, seed=21),
    mesh('crack_radial', 0.03, 0.9, at='area', offset=[0, 0.05, 0], scale=6.5, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=0, seed=22),
] + ring(3, 4.0, lambda i, x, z: mesh('smoke', round(0.05 + 0.06 * i, 2), 0.9, at='area', offset=[x, 0.8, z], scale=1.8, scaleTo=2.6, billboard=True, tone='core' if i else 'body', alpha=0.65, tier=0 if i == 0 else 1), phase=0.5) + [
    parts('dust', 0.0, 60, 3.0, 1.0, 1.0, 0.22, at='area', offset=[0, 0.4, 0], tone='rim', grav=-1.8, tier=0),
    parts('shard', 0.02, 24, 5.0, 1.0, 0.6, 0.1, at='area', offset=[0, 0.3, 0], tone='accent', tier=1),
    sound(0.0, 'impact', 0.7, 0.6),
    {'type': 'hitstop', 't': 0.0, 'ms': 65},
    {'type': 'shake', 't': 0.0, 'level': 0.3},
    {'type': 'flash', 't': 0.0, 'amount': 0.08, 'tier': 0},
])

# ---- Tát Đậu Thành Binh (tối thượng, gọi hồn binh) ----
# Khoảnh khắc triệu: vòng triện lớn loang quanh người (bán kính ~6 m, vừa vùng hồn binh hoạt động gần), sóng xung thấp, khói hồn bốc
# quanh rìa, chớp nhẹ. Ba hồn binh là timeline `hon_binh_stand` do client giữ suốt thời gian chiêu (xem dưới), không nằm ở đây.
# Quanh người chỉ có hình trên đất và khói thấp ở rìa vòng: không gì đứng giữa camera và nhân vật.
write('skl_tat_dau_thanh_binh', [
    parts('dust', -0.5, 30, 1.6, 1.0, 0.4, 0.18, at='self', offset=[0, -0.4, 0], inward=True, tone='rim', tier=1),
    sound(-0.5, 'cast', 0.55, 0.6),
    decal('rune', -0.45, 3.0, 1.2, at='self', grow=0.3, tone='body', alpha=0.85, tier=0),
    decal('rune', 0.0, 6.0, 4.0, at='self', grow=0.25, tone='rim', alpha=0.95, tier=0),
    decal('scorch', 0.0, 5.0, 3.0, at='self', grow=0.2, tone='core', alpha=0.7, tier=1),
    mesh('rune_ring2', 0.0, 0.9, at='self', offset=[0, -1.05, 0], scale=[1.0, 1, 1.0], scaleTo=[6.2, 1, 6.2], sweep=0.3, erodeFrom=0.5, ragged=0.6, tone='rim', alpha=0.95, shadow=False, tier=0, seed=30),
    mesh('shock_cone', 0.0, 0.5, at='self', offset=[0, -1.05, 0], scale=[1.0, 0.5, 1.0], scaleTo=[5.5, 0.9, 5.5], sweep=0.3, erodeFrom=0.35, ragged=0.7, tone='body', alpha=0.8, shadow=False, tier=0, seed=31),
    mesh('crack_radial', 0.03, 0.9, at='self', offset=[0, -1.05, 0], scale=4.5, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='core', tier=1, seed=32),
] + ring(4, 4.6, lambda i, x, z: mesh('smoke', round(0.04 + 0.05 * i, 2), 1.0, at='self', offset=[x, -0.3, z], scale=1.6, scaleTo=2.4, billboard=True, tone='core' if i % 2 else 'body', alpha=0.6, move={'to': 'self', 'offset': [x, 0.9, z], 'ease': 'out'}, tier=0 if i < 2 else 1), phase=0.5) + [
    parts('dust', 0.0, 80, 4.5, 1.0, 1.1, 0.22, at='self', offset=[0, -0.8, 0], tone='rim', grav=-2.0, tier=0),
    parts('shard', 0.02, 30, 6.0, 1.0, 0.6, 0.1, at='self', offset=[0, -0.6, 0], tone='accent', tier=1),
    sound(0.0, 'impact', 0.7, 0.6),
    {'type': 'hitstop', 't': 0.0, 'ms': 60},
    {'type': 'shake', 't': 0.0, 'level': 0.28},
    {'type': 'flash', 't': 0.0, 'amount': 0.1, 'tier': 0},
])

# ---- Hiệu ứng tại điểm (client phát bằng startAt) ----
# Một nhịp hồn binh đánh: vệt cào nhỏ ở ngực quái + vài hạt. Phát tối đa 3 lần mỗi giây nên phải rất nhẹ.
write('hon_binh_hit', [
    mesh('slash_thin', 0.0, 0.28, at='self', offset=[0, 1.0, 0], scale=2.8, billboard=True, sweep=0.35, erodeFrom=0.4, ragged=0.8, tone='rim', alpha=0.9, tier=0, seed=40),
    parts('dust', 0.0, 8, 2.0, 1.0, 0.4, 0.14, at='self', offset=[0, 1.0, 0], tone='body', grav=-1.2, tier=1),
], palette=M)
# Ba hồn binh đứng quanh người gọi, bám theo người đó (follow). Mesh chỉ sống tối đa 4 giây nên client phát lại đoạn này nối tiếp
# (`HON_BINH_SEG` giây một lần) tới hết thời gian chiêu. Vị trí trong khung người gọi: hai bên hơi chếch trước và một ở chính diện,
# KHÔNG có con nào phía sau lưng (phía camera mặc định) để không che nhân vật. Cao 1,9 m (ngang người thật), thân tím, viền bạc.
SOLDIERS = [(-2.2, 0.9, 20), (2.2, 0.9, -20), (0.0, 2.8, 0)]
write('hon_binh_stand', [
    mesh('soul_soldier', round(0.05 * i, 2), 3.6, at='self', offset=[x, -1.05, z], rot=[0, yaw, 0], scale=2.0, sweep=0.1, erodeFrom=0.9, tone='body', alpha=1.0, follow=True, seed=50 + i, tier=0)
    for i, (x, z, yaw) in enumerate(SOLDIERS)
] + [
    mesh('ripple', round(0.05 * i, 2), 0.6, at='self', offset=[x, -1.08, z], scale=0.3, scaleTo=1.5, sweep=0.5, erodeFrom=0.4, tone='rim', alpha=0.8, shadow=False, seed=54 + i, tier=1)
    for i, (x, z, yaw) in enumerate(SOLDIERS)
] + [
    parts('dust', 0.0, 18, 1.4, 1.0, 0.9, 0.16, at='self', offset=[0, -0.6, 1.2], tone='rim', grav=-1.2, tier=1),
], palette=M)
# Tia hồn thu về (thu hồn khi quái chết, Nhiếp Hồn của hồn phiên): một dải từ quái bay về ngực người nhận, khói nhỏ ở chỗ rời.
write('hon_reap', [
    mesh('spark_streak', 0.0, 0.45, at='self', offset=[0, 0.9, 0], scale=2.8, move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}, shadow=False, tone='rim', tier=0),
    mesh('smoke', 0.0, 0.5, at='self', offset=[0, 1.0, 0], scale=0.9, scaleTo=1.3, billboard=True, tone='core', alpha=0.6, tier=1),
    parts('dust', 0.0, 10, 1.6, 1.0, 0.5, 0.16, at='self', offset=[0, 0.9, 0], tone='rim', grav=-1.4, tier=1),
], palette=M)
print('da sinh timeline Hon tu')
