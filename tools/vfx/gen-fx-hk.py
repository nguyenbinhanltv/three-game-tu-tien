# TN-6: sinh `packages/content/data/fx/hk_*.json`: hiệu ứng chín kiếp nhỏ của Huyền Kiếp theo ngôn ngữ VFX mới (hình mesh có khối của fxLib,
# ba tầng màu + bóng sẫm, triện văn, hạt). Chỉ là hình, luật ở server. Chạy: python tools/vfx/gen-fx-hk.py
#
# Client (`game/fx/suyFx.ts`, phần Huyền Kiếp) phát từng timeline bằng `FxRunner.startAt` tại điểm server báo qua FX `hkmark`; bảng màu theo kiếp
# (`hk_tuyet` … `hk_luan_hoi` ở `render/vfx/palette.ts`). Mọi cỡ là MÉT. Vật có thời hạn server báo dùng `untilDelay`; vật tồn tại lâu là vòng lặp 1 giây
# (LOOP/HOLD như gen-fx-suy.py). Ngân sách: mỗi timeline ≤ 12 draw, ≤ 4 tia sét; cả một kiếp (HK_FX_STAGE) ≤ 25 draw.
#
# Bài học #424: sân độ kiếp rất tối và camera nhìn từ sau lưng, nên (1) hình chính dùng tông `rim`/`body` sáng, cao 2–4 m, không khối nào to sát camera;
# (2) thứ phải bước vào/chạm (chỗ nấp, trụ nguội, ấn thật, Hồn Châu, cung sinh) còn có cột linh quang cộng sáng do client thêm; (3) mối nguy dùng `accent`.
import json
import math
import os

LOOP = 1.08
HOLD = 0.97
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


def bolt(t, **k):
    e = {'type': 'bolt', 't': t, 'at': 'area', 'scale': 0.3, 'thick': 3.4}
    e.update(k)
    return e


def write(name, pal, events):
    d = {'skill': name, 'palette': pal, 'events': events}
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


def ring(n, radius, f, phase=0.0):
    out = []
    for i in range(n):
        a = 2 * math.pi * (i + phase) / n
        out.append(f(i, round(radius * math.sin(a), 2), round(radius * math.cos(a), 2)))
    return out


# ---- chung: vào kiếp (thẻ ấn dưới chân, màu theo kiếp do client chọn) ----
write('hk_enter', 'hk_tuyet', [
    decal('rune', 0.0, 6.0, 3.2, at='area', grow=0.5, tone='body', alpha=0.9, tier=0),
    mesh('rune_ring2', 0.05, 1.5, at='area', offset=[0, 0.06, 0], scale=[0.6, 1, 0.6], scaleTo=[5.4, 1, 5.4], sweep=0.35, erodeFrom=0.45, ragged=0.6, tone='rim', alpha=0.85, seed=4, tier=0),
    mesh('shock_cone', 0.0, 0.6, at='area', offset=[0, 0.05, 0], scale=[0.5, 0.6, 0.5], scaleTo=[4.2, 1.4, 4.2], sweep=0.3, erodeFrom=0.4, ragged=0.7, tone='rim', alpha=0.8, seed=5, tier=0),
    parts('spark', 0.0, 30, 3.4, 1.0, 1.0, 0.09, at='area', offset=[0, 0.6, 0], tone='rim', tier=1),
])

# ---- Tuyết Kiếp: đụn tuyết (mối nguy trên đất, sống `d` giây): cụm gai băng thấp + mảng sương ----
write('hk_tuyet_drift', 'hk_tuyet', [
    decal('scorch', 0.0, 3.0, 8.0, at='area', grow=1.0, tone='rim', alpha=0.85, untilDelay=True, tier=0, **START),
    decal('rune', 0.3, 3.0, 8.0, at='area', grow=0.8, tone='accent', alpha=0.9, untilDelay=True, tier=0, **START),
    parts('dust', 0.0, 26, 2.2, 1.0, 1.4, 0.3, at='area', offset=[0, 2.4, 0], tone='rim', grav=2.4, tier=0, **START),
    parts('shard', 1.2, 14, 1.6, 1.0, 0.9, 0.12, at='area', offset=[0, 0.3, 0], tone='rim', grav=-0.6, tier=1, **START),
] + ring(5, 1.7, lambda i, x, z: mesh('spike', round(1.0 + 0.06 * i, 2), 4.0, at='area', offset=[x, 0, z], rot=[-90 + (12 if i % 2 else -8), i * 72, 0], scale=[0.5, 0.5, 0.42 + 0.1 * (i % 2)], sweep=0.06, erodeFrom=0.9, tone='rim', alpha=0.95, seed=10 + i, untilDelay=True, tier=0, **START))
+ [mesh('spike', 1.0, 4.0, at='area', offset=[0, 0, 0], rot=[-90, 0, 0], scale=[0.7, 0.7, 0.62], sweep=0.06, erodeFrom=0.9, tone='body', alpha=0.95, seed=16, untilDelay=True, tier=0, **START)])

# ---- Phong Kiếp ----
# Trụ chắn gió (vòng lặp): cụm đá cao, viền sáng.
write('hk_phong_pillar', 'hk_phong', [
    mesh('rock_spire', 0.0, LOOP, at='area', offset=[0, 0, 0], scale=[1.25, 3.4, 1.25], sweep=0.0, erodeFrom=HOLD, tone='body', alpha=0.98, seed=21, tier=0, **START),
    decal('rune', 0.0, 2.0, LOOP, at='area', grow=0.01, tone='body', alpha=0.8, yaw=0, tier=1, **START),
])
# Báo hướng gió (gốc ở tâm sân, +Z = chiều gió thổi; sống đúng `warn` giây): ba đợt vệt gió chạy dọc sân + mũi tên triện văn trên đất.
write('hk_phong_warn', 'hk_phong', [
    mesh('gust', 0.0, 1.1, at='area', offset=[0, 1.4, -9], scale=[3.2, 2.2, 9.0], tone='rim', alpha=0.85, seed=31, move={'to': 'area', 'offset': [0, 1.4, 6], 'ease': 'linear'}, tier=0, **START),
    mesh('gust', 0.9, 1.1, at='area', offset=[2.5, 1.2, -9], scale=[3.0, 2.0, 9.0], tone='accent', alpha=0.8, seed=32, move={'to': 'area', 'offset': [2.5, 1.2, 6], 'ease': 'linear'}, tier=0, **START),
    mesh('gust', 1.8, 1.1, at='area', offset=[-2.5, 1.6, -9], scale=[3.0, 2.0, 9.0], tone='rim', alpha=0.85, seed=33, move={'to': 'area', 'offset': [-2.5, 1.6, 6], 'ease': 'linear'}, tier=0, **START),
    mesh('rift_line', 0.0, 3.0, at='area', offset=[0, 0.07, -7], scale=[1.6, 1, 14], sweep=0.5, erodeFrom=0.9, ragged=0.5, tone='accent', alpha=0.85, seed=34, untilDelay=True, tier=0, **START),
    parts('dust', 0.0, 40, 6.0, 0.25, 1.4, 0.26, at='area', offset=[0, 0.8, -8], tone='rim', tier=0, **START),
    parts('dust', 1.4, 40, 6.5, 0.25, 1.4, 0.26, at='area', offset=[0, 0.8, -8], tone='accent', tier=1, **START),
])
# Gió thổi tới: ba vệt lớn quét cả sân.
write('hk_phong_blow', 'hk_phong', [
    mesh('gust', 0.0, 0.7, at='area', offset=[0, 1.4, -11], scale=[5.0, 3.0, 12.0], tone='rim', alpha=0.95, seed=41, move={'to': 'area', 'offset': [0, 1.4, 9], 'ease': 'out'}, tier=0),
    mesh('gust', 0.05, 0.7, at='area', offset=[4.5, 1.2, -11], scale=[4.5, 2.6, 12.0], tone='accent', alpha=0.9, seed=42, move={'to': 'area', 'offset': [4.5, 1.2, 9], 'ease': 'out'}, tier=0),
    mesh('gust', 0.1, 0.7, at='area', offset=[-4.5, 1.6, -11], scale=[4.5, 2.6, 12.0], tone='accent', alpha=0.9, seed=43, move={'to': 'area', 'offset': [-4.5, 1.6, 9], 'ease': 'out'}, tier=0),
    parts('dust', 0.0, 70, 14.0, 0.2, 0.9, 0.3, at='area', offset=[0, 1.0, -10], tone='rim', tier=0),
    {'type': 'shake', 't': 0.0, 'level': 0.2, 'tier': 1},
])
write('hk_phong_safe', 'hk_phong', [
    mesh('shock_cone', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=[0.4, 0.4, 0.4], scaleTo=[2.8, 1.0, 2.8], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='body', alpha=0.85, seed=45, tier=0),
    parts('petal', 0.0, 16, 2.0, 0.9, 1.2, 0.16, at='self', tone='rim', grav=-1.0, tier=1),
])
write('hk_phong_hit', 'hk_phong', [
    mesh('slash_fan', 0.0, 0.35, at='self', offset=[0, 0, 0], rot=[0, 0, 0], scale=[2.6, 1, 2.6], sweep=0.3, erodeFrom=0.4, ragged=0.9, tone='accent', alpha=0.95, seed=46, tier=0),
    mesh('burst', 0.0, 0.11, at='self', scale=1.8, billboard=True, sweep=0.0, tone='rim', alpha=0.75, cross=True, tier=0),
    parts('dust', 0.0, 24, 5.0, 0.6, 0.8, 0.28, at='self', tone='accent', tier=1),
    {'type': 'flash', 't': 0.0, 'amount': 0.14, 'tier': 0},
])

# ---- Lôi Kiếp ----
ROD = [
    mesh('rock_spire', 0.0, LOOP, at='area', offset=[0, 0, 0], scale=[0.55, 3.0, 0.55], sweep=0.0, erodeFrom=HOLD, alpha=0.98, seed=51, tier=0, **START),
    mesh('kite', 0.0, LOOP, at='area', offset=[0, 3.0, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, 1.2], sweep=0.0, erodeFrom=HOLD, alpha=0.95, seed=52, tier=0, **START),
]
write('hk_loi_rod', 'hk_loi', [dict(e, tone='body' if i == 0 else 'rim') for i, e in enumerate(ROD)] + [
    decal('rune', 0.0, 2.2, LOOP, at='area', grow=0.01, tone='body', alpha=0.95, yaw=0, tier=0, **START),
    parts('spark', 0.0, 4, 0.8, 0.5, 1.2, 0.07, at='area', offset=[0, 3.6, 0], tone='rim', grav=-0.8, tier=1, **START),
])
write('hk_loi_hot', 'hk_loi', [dict(e, tone='accent') for e in ROD] + [
    decal('rune', 0.0, 4.5, LOOP, at='area', grow=0.01, tone='accent', alpha=1.0, yaw=0, tier=0, **START),
    decal('scorch', 0.0, 2.4, LOOP, at='area', grow=0.01, tone='core', alpha=0.8, yaw=0, tier=1, **START),
    parts('spark', 0.0, 6, 2.4, 1.0, 0.7, 0.08, at='area', offset=[0, 2.2, 0], tone='accent', tier=1, **START),
])
write('hk_loi_zap', 'hk_loi', [
    bolt(0.0, tone='rim', seed=55, thick=4.0, scale=0.45, tier=0),
    bolt(0.08, offset=[0.4, 0, -0.3], tone='body', seed=56, tier=1),
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[0.5, 0.6, 0.5], scaleTo=[3.2, 1.5, 3.2], sweep=0.3, erodeFrom=0.35, ragged=0.8, tone='rim', alpha=0.9, seed=57, tier=0),
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 3.0, 0], scale=2.4, billboard=True, sweep=0.0, tone='rim', alpha=0.8, cross=True, tier=0),
    parts('spark', 0.0, 26, 5.0, 1.0, 0.6, 0.09, at='area', offset=[0, 2.6, 0], tone='rim', tier=0),
    {'type': 'flash', 't': 0.0, 'amount': 0.18, 'tier': 0},
])
write('hk_loi_boom', 'hk_loi', [
    bolt(0.0, tone='accent', seed=58, thick=4.0, scale=0.45, tier=0),
    mesh('crack_radial', 0.0, 2.2, at='area', offset=[0, 0.05, 0], scale=[0.6, 1, 0.6], scaleTo=[4.5, 1, 4.5], sweep=0.25, erodeFrom=0.6, ragged=0.85, tone='accent', alpha=0.95, seed=59, tier=0),
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[0.6, 0.8, 0.6], scaleTo=[4.6, 1.8, 4.6], sweep=0.3, erodeFrom=0.35, ragged=0.85, tone='accent', alpha=0.9, seed=60, tier=0),
    parts('shard', 0.0, 26, 6.5, 0.9, 0.7, 0.15, at='area', offset=[0, 0.5, 0], tone='rim', grav=9, tier=1),
    {'type': 'shake', 't': 0.0, 'level': 0.22, 'tier': 1},
])

# ---- Trảm Ly Kiếp: Bản Mệnh Ấn (vòng lặp ở tâm, bán kính vòng = 6 m) ----
write('hk_ly_seal', 'hk_tram_ly', [
    mesh('rune_ring2', 0.0, LOOP, at='area', offset=[0, 0.07, 0], scale=[6.0, 1, 6.0], sweep=0.0, erodeFrom=HOLD, ragged=0.3, tone='body', alpha=0.95, seed=61, tier=0, **START),
    decal('rune', 0.0, 2.4, LOOP, at='area', grow=0.01, tone='rim', alpha=0.9, yaw=0, tier=0, **START),
    mesh('seal_block', 0.0, LOOP, at='area', offset=[0, 0, 0], scale=[1.0, 0.9, 1.0], sweep=0.0, erodeFrom=HOLD, tone='body', alpha=0.95, seed=62, tier=0, **START),
] + ring(6, 6.0, lambda i, x, z: mesh('blade_stuck', 0.0, LOOP, at='area', offset=[x, 0, z], rot=[0, i * 60, 0], scale=1.6, sweep=0.0, erodeFrom=HOLD, tone='rim', alpha=0.95, seed=63 + i, tier=0 if i % 2 == 0 else 1, **START)))
# Rời vòng ấn: vòng đỏ lóe + khói.
write('hk_ly_out', 'hk_tram_ly', [
    mesh('rune_ring2', 0.0, 0.8, at='area', offset=[0, 0.1, 0], scale=[6.0, 1, 6.0], scaleTo=[6.6, 1, 6.6], sweep=0.0, erodeFrom=0.3, ragged=0.8, tone='accent', alpha=0.95, seed=70, tier=0),
    parts('spark', 0.0, 20, 3.0, 1.0, 0.7, 0.08, at='self', tone='accent', tier=1),
])
# Vạch kiếm chém xuống (client phát lúc vạch báo hết giờ; gốc ở đầu vạch, +Z dọc vạch dài 20 m).
write('hk_ly_cut', 'hk_tram_ly', [
    mesh('slash_thick', 0.0, 0.4, at='area', offset=[0, 0.9, 10], rot=[0, 90, 0], scale=[3.0, 1, 11.0], sweep=0.3, erodeFrom=0.35, ragged=0.8, tone='rim', alpha=0.95, seed=71, tier=0),
    mesh('rift_line', 0.0, 1.6, at='area', offset=[0, 0.06, 0], scale=[1.4, 1, 20], sweep=0.25, erodeFrom=0.5, ragged=0.9, tone='accent', alpha=0.9, seed=72, tier=0),
    mesh('blade_giant', 0.0, 0.45, at='area', offset=[0, 6.0, 10], rot=[90, 0, 0], scale=1.5, sweep=0.2, erodeFrom=0.5, tone='rim', alpha=0.9, seed=73, keepUp=True, move={'to': 'area', 'offset': [0, 1.0, 10], 'ease': 'in'}, tier=1),
    parts('spark', 0.0, 26, 7.0, 0.3, 0.5, 0.09, at='area', offset=[0, 0.6, 10], tone='rim', tier=0),
])

# ---- Huyết Ảnh Kiếp ----
write('hk_huyet_spawn', 'hk_huyet_anh', [
    mesh('crack_radial', 0.0, 2.4, at='area', offset=[0, 0.05, 0], scale=[0.5, 1, 0.5], scaleTo=[3.6, 1, 3.6], sweep=0.3, erodeFrom=0.6, ragged=0.9, tone='body', alpha=0.95, seed=81, tier=0),
    mesh('helix', 0.0, 1.2, at='area', offset=[0, 0.05, 0], rot=[-90, 0, 0], scale=[1.2, 1.2, 2.8], sweep=0.6, erodeFrom=0.6, ragged=0.6, tone='body', alpha=0.85, spin=260, seed=82, tier=0),
    mesh('burst', 0.1, 0.11, at='area', offset=[0, 1.3, 0], scale=2.0, billboard=True, sweep=0.0, tone='rim', alpha=0.7, tier=0),
    parts('dust', 0.0, 34, 3.0, 1.0, 1.1, 0.3, at='area', offset=[0, 0.8, 0], tone='body', inward=True, tier=0),
])
write('hk_huyet_kill', 'hk_huyet_anh', [
    mesh('slash_cross', 0.0, 0.4, at='target', rot=[90, 0, 0], scale=[2.6, 1, 2.6], sweep=0.3, erodeFrom=0.4, ragged=0.7, tone='rim', alpha=0.95, seed=83, tier=0),
    mesh('shock_cone', 0.02, 0.6, at='target', offset=[0, -0.9, 0], scale=[0.5, 0.6, 0.5], scaleTo=[3.6, 1.5, 3.6], sweep=0.3, erodeFrom=0.4, ragged=0.8, tone='body', alpha=0.85, seed=84, tier=0),
    mesh('burst', 0.0, 0.11, at='target', scale=2.4, billboard=True, sweep=0.0, tone='rim', alpha=0.8, cross=True, tier=0),
    parts('shard', 0.0, 26, 6.0, 0.9, 0.8, 0.14, at='target', tone='body', grav=8, tier=1),
    parts('petal', 0.05, 20, 2.0, 0.9, 1.5, 0.18, at='self', tone='rim', grav=-1.0, tier=1),
    {'type': 'flash', 't': 0.0, 'amount': 0.14, 'tier': 0},
])

# ---- Vấn Tâm Kiếp ----
# Thân ấn do client vẽ bằng cột linh quang quay mượt quanh tâm (không phải timeline): lúc đổi chỗ cả vòng phải xoay liên tục.
# Ấn thật sáng (sống đúng `show` giây): khung kim cương vàng dựng trên ấn + vòng sáng.
write('hk_van_true', 'hk_van_tam', [
    mesh('diamond_cage', 0.0, 1.4, at='area', offset=[0, 1.3, 0], scale=[1.3, 1.5, 1.3], sweep=0.1, erodeFrom=0.85, tone='accent', alpha=0.98, seed=92, keepUp=True, untilDelay=True, tier=0, **START),
    decal('rune', 0.0, 2.8, 1.4, at='area', grow=0.15, tone='accent', alpha=1.0, yaw=20, untilDelay=True, tier=0, **START),
    mesh('shock_cone', 0.0, 0.45, at='area', offset=[0, 0.05, 0], scale=[0.4, 0.5, 0.4], scaleTo=[2.8, 1.2, 2.8], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='accent', alpha=0.85, seed=93, tier=0, **START),
    parts('spark', 0.0, 22, 2.6, 1.0, 0.8, 0.09, at='area', offset=[0, 2.4, 0], tone='accent', inward=True, tier=0, **START),
])
# Các ấn đổi chỗ (gốc ở tâm sân, bán kính vòng 7 m): hai dải lụa quét quanh vòng theo chiều xoay.
write('hk_van_spin', 'hk_van_tam', [
    mesh('ribbon', 0.0, 1.2, at='area', offset=[0, 0.5, 0], rot=[-90, 0, 0], scale=[2.7, 2.7, 0.5], sweep=0.6, erodeFrom=0.6, ragged=0.5, tone='rim', alpha=0.9, seed=94, spin=240, tier=0),
    mesh('ribbon', 0.1, 1.2, at='area', offset=[0, 1.2, 0], rot=[-90, 180, 0], scale=[2.7, 2.7, 0.5], sweep=0.6, erodeFrom=0.6, ragged=0.5, tone='body', alpha=0.8, seed=95, spin=240, tier=1),
    mesh('rune_ring2', 0.0, 1.0, at='area', offset=[0, 0.07, 0], scale=[7.0, 1, 7.0], sweep=0.6, erodeFrom=0.6, ragged=0.5, tone='rim', alpha=0.8, seed=96, tier=0),
])
write('hk_van_ok', 'hk_van_tam', [
    mesh('diamond_cage', 0.0, 0.6, at='area', offset=[0, 1.3, 0], scale=[1.3, 1.5, 1.3], scaleTo=[2.0, 2.2, 2.0], sweep=0.0, erodeFrom=0.2, tone='accent', alpha=0.95, seed=97, keepUp=True, tier=0),
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[0.5, 0.6, 0.5], scaleTo=[3.4, 1.4, 3.4], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='accent', alpha=0.9, seed=98, tier=0),
    parts('petal', 0.0, 26, 2.4, 0.9, 1.5, 0.18, at='area', offset=[0, 1.0, 0], tone='rim', grav=-1.0, tier=0),
])
write('hk_van_bad', 'hk_van_tam', [
    mesh('crack_radial', 0.0, 1.6, at='self', offset=[0, -1.08, 0], scale=[0.4, 1, 0.4], scaleTo=[2.8, 1, 2.8], sweep=0.25, erodeFrom=0.6, ragged=0.9, tone='body', alpha=0.9, seed=99, tier=0),
    mesh('flip', 0.0, 0.7, at='self', offset=[0, 0.2, 0], scale=2.4, billboard=True, sweep=0.0, tone='core', alpha=0.6, flip='ink_smoke', tier=0),
    {'type': 'flash', 't': 0.0, 'amount': 0.12, 'tier': 0},
])

# ---- Thập Tức Khô Thần: vòng nhịp khép dần quanh người, chạm vòng trong đúng lúc nhịp rơi (sống đúng `d` giây tới nhịp) ----
write('hk_tuc_beat', 'hk_kho_than', [
    mesh('rune_ring2', 0.0, 2.9, at='self', offset=[0, -1.08, 0], scale=[6.0, 1, 6.0], scaleTo=[1.5, 1, 1.5], sweep=0.05, erodeFrom=0.97, ragged=0.3, tone='rim', alpha=0.95, seed=101, follow=True, untilDelay=True, tier=0, **START),
    mesh('rune_ring2', 0.0, 2.9, at='self', offset=[0, -1.06, 0], scale=[1.5, 1, 1.5], sweep=0.05, erodeFrom=0.97, ragged=0.3, tone='accent', alpha=0.9, seed=102, follow=True, untilDelay=True, tier=0, **START),
])
write('hk_tuc_good', 'hk_kho_than', [
    mesh('shock_cone', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=[1.2, 0.6, 1.2], scaleTo=[4.0, 1.5, 4.0], sweep=0.3, erodeFrom=0.35, ragged=0.6, tone='rim', alpha=0.9, seed=103, tier=0),
    mesh('helix', 0.0, 0.8, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[0.9, 0.9, 2.4], sweep=0.6, erodeFrom=0.5, ragged=0.4, tone='body', alpha=0.8, spin=300, seed=104, tier=1),
    mesh('burst', 0.0, 0.1, at='self', offset=[0, 0.4, 0], scale=1.4, billboard=True, sweep=0.0, tone='rim', alpha=0.7, tier=0),
    parts('spark', 0.0, 20, 3.0, 1.0, 0.7, 0.08, at='self', tone='rim', grav=-1.6, tier=1),
])
write('hk_tuc_bad', 'hk_kho_than', [
    mesh('crack_radial', 0.0, 1.4, at='self', offset=[0, -1.08, 0], scale=[0.4, 1, 0.4], scaleTo=[2.6, 1, 2.6], sweep=0.25, erodeFrom=0.6, ragged=0.9, tone='accent', alpha=0.9, seed=105, tier=0),
    mesh('flip', 0.0, 0.6, at='self', offset=[0, 0.2, 0], scale=2.2, billboard=True, sweep=0.0, tone='core', alpha=0.55, flip='ink_smoke', tier=0),
    parts('dust', 0.0, 16, 2.0, 1.0, 0.8, 0.26, at='self', tone='accent', inward=True, tier=1),
])

# ---- Hồn Thọ Kiếp: Hồn Châu (vòng lặp, nhặt xong là hết): viên tinh thể lơ lửng + vòng ấn ----
write('hk_chau', 'hk_hon_tho', [
    mesh('kite', 0.0, LOOP, at='area', offset=[0, 1.5, 0], rot=[-90, 0, 0], scale=[3.4, 3.4, 1.6], sweep=0.0, erodeFrom=HOLD, tone='rim', alpha=0.98, seed=111, tier=0, **START),
    mesh('kite', 0.0, LOOP, at='area', offset=[0, 1.5, 0], rot=[90, 0, 0], scale=[3.4, 3.4, 0.8], sweep=0.0, erodeFrom=HOLD, tone='body', alpha=0.95, seed=112, tier=0, **START),
    decal('rune', 0.0, 1.8, LOOP, at='area', grow=0.01, tone='body', alpha=0.95, yaw=0, tier=0, **START),
    parts('petal', 0.0, 4, 0.8, 0.6, 1.4, 0.14, at='area', offset=[0, 1.4, 0], tone='rim', grav=-0.6, tier=1, **START),
])
write('hk_chau_get', 'hk_hon_tho', [
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 1.4, 0], scale=1.8, billboard=True, sweep=0.0, tone='rim', alpha=0.8, tier=0),
    mesh('helix', 0.0, 0.8, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[0.8, 0.8, 2.2], sweep=0.6, erodeFrom=0.5, ragged=0.4, tone='body', alpha=0.85, spin=300, seed=113, tier=0),
    parts('spark', 0.0, 24, 2.6, 1.0, 0.7, 0.09, at='self', tone='rim', inward=True, tier=0),
])
write('hk_chau_gone', 'hk_hon_tho', [
    mesh('flip', 0.0, 0.6, at='area', offset=[0, 1.4, 0], scale=1.8, billboard=True, sweep=0.0, tone='core', alpha=0.6, flip='ink_smoke', tier=0),
    parts('dust', 0.0, 12, 1.4, 1.0, 0.8, 0.22, at='area', offset=[0, 1.4, 0], tone='core', grav=1.2, tier=1),
])

# ---- Luân Hồi Kiếp: vành bánh xe (vòng lặp ở tâm, bán kính 13 m) + báo nghiền + nghiền ----
write('hk_luan_wheel', 'hk_luan_hoi', [
    mesh('rune_ring2', 0.0, LOOP, at='area', offset=[0, 0.06, 0], scale=[13.0, 1, 13.0], sweep=0.0, erodeFrom=HOLD, ragged=0.3, tone='body', alpha=0.9, seed=121, tier=0, **START),
    mesh('rune_ring2', 0.0, LOOP, at='area', offset=[0, 0.07, 0], scale=[1.5, 1, 1.5], sweep=0.0, erodeFrom=HOLD, ragged=0.5, tone='accent', alpha=0.95, seed=122, tier=0, **START),
    mesh('rock_spire', 0.0, LOOP, at='area', offset=[0, 0, 0], scale=[0.7, 2.6, 0.7], sweep=0.0, erodeFrom=HOLD, tone='accent', alpha=0.95, seed=123, tier=1, **START),
])
write('hk_luan_warn', 'hk_luan_hoi', [
    mesh('rune_ring2', 0.0, 1.2, at='area', offset=[0, 0.09, 0], scale=[13.0, 1, 13.0], scaleTo=[2.0, 1, 2.0], sweep=0.05, erodeFrom=0.9, ragged=0.7, tone='accent', alpha=0.95, seed=127, untilDelay=True, tier=0, **START),
    parts('dust', 0.0, 40, 6.0, 1.0, 1.0, 0.3, at='area', offset=[0, 0.5, 0], tone='accent', inward=True, tier=0, **START),
])
write('hk_luan_grind', 'hk_luan_hoi', [
    mesh('shock_cone', 0.0, 0.7, at='area', offset=[0, 0.05, 0], scale=[1.0, 0.8, 1.0], scaleTo=[13.0, 2.0, 13.0], sweep=0.25, erodeFrom=0.35, ragged=0.8, tone='accent', alpha=0.85, seed=128, tier=0),
    mesh('crack_radial', 0.0, 2.0, at='area', offset=[0, 0.05, 0], scale=[1.0, 1, 1.0], scaleTo=[12.0, 1, 12.0], sweep=0.25, erodeFrom=0.55, ragged=0.9, tone='accent', alpha=0.8, seed=129, tier=0),
    parts('shard', 0.0, 40, 9.0, 1.0, 0.8, 0.16, at='area', offset=[0, 0.5, 0], tone='accent', grav=8, tier=1),
    {'type': 'shake', 't': 0.0, 'level': 0.22, 'tier': 1},
])

print('da sinh hk_*.json')
