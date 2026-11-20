# TN-4: sinh `packages/content/data/fx/suy_*.json`: hiệu ứng của năm ải Thiên Nhân Ngũ Suy theo ngôn ngữ VFX mới (VS-1):
# hình mesh có khối của `render/vfx/fxLib.ts`, ba tầng màu + bóng sẫm, mép rách, triện văn, hạt tan. Chỉ là hình, luật ở server.
# Chạy: python tools/vfx/gen-fx-suy.py
#
# Client (`game/fx/suyFx.ts`) phát từng timeline bằng `FxRunner.startAt` tại đúng điểm server báo (`suymark`), bảng màu theo ải
# (`suy_linh|suy_the|suy_thuc|suy_tho|suy_tam` ở `render/vfx/palette.ts`); JSON chỉ ghi tầng màu. Mọi cỡ ở đây là MÉT (mul = 1).
# Vật tồn tại theo thời lượng server báo dùng `untilDelay` (Linh Nhãn, vòng Tôi Thể Lôi, suy phong, thắp đèn).
# Ngân sách: mỗi timeline ≤ 12 draw, cả một ải (mọi timeline của ải + phần chung) ≤ 25 draw (`content:check`).
#
# Đọc được là trên hết: thứ PHẢI BƯỚC VÀO (Linh Nhãn, Tôi Thể Lôi, đèn cần thắp) dùng thân/viền sáng của ải; mối nguy (lôi ẩn, suy phong,
# động niệm) dùng `accent`. Không hình nào cao quá đầu người ở sát chỗ nhân vật đứng, để không che thân mình và Tâm Ma Ảnh.
import json
import math
import os

# Vòng lặp của vật tồn tại lâu (Linh Nhãn, Thọ Đăng): client phát lại mỗi 1 giây; hình sống 1,08 s và chỉ tan ở 3% cuối nên các vòng gối nhau.
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


def write(name, stage, events):
    d = {'skill': name, 'palette': 'suy_' + stage, 'events': events}
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


def ring(n, radius, f, phase=0.0):
    out = []
    for i in range(n):
        a = 2 * math.pi * (i + phase) / n
        out.append(f(i, round(radius * math.sin(a), 2), round(radius * math.cos(a), 2)))
    return out


# ---------------------------------------------------------------------------------------------------------------
# Chung: vào ải (thẻ ấn dưới chân), qua ải (suy khí tan, linh quang bốc), thất bại (suy khí ập vào)
# ---------------------------------------------------------------------------------------------------------------
for st in ['linh', 'the', 'thuc', 'tho', 'tam']:
    write('suy_enter_' + st, st, [
        decal('rune', 0.0, 6.0, 3.6, at='area', grow=0.5, tone='core', alpha=0.75, tier=0),
        mesh('rune_ring2', 0.05, 1.6, at='area', offset=[0, 0.06, 0], scale=[0.6, 1, 0.6], scaleTo=[5.2, 1, 5.2], sweep=0.35, erodeFrom=0.45, ragged=0.6, tone='body', alpha=0.8, seed=4, tier=0),
        parts('dust', 0.0, 36, 2.2, 1.0, 1.8, 0.3, at='area', offset=[0, 0.4, 0], tone='core', inward=True, tier=1),
    ])

write('suy_ok', 'linh', [
    mesh('shock_cone', 0.0, 0.7, at='area', offset=[0, 0.05, 0], scale=[0.6, 0.8, 0.6], scaleTo=[4.6, 1.6, 4.6], sweep=0.3, erodeFrom=0.35, ragged=0.7, tone='rim', alpha=0.85, seed=2, tier=0),
    mesh('helix', 0.05, 1.3, at='area', offset=[0, 0.1, 0], rot=[-90, 0, 0], scale=[1.2, 1.2, 2.6], sweep=0.6, erodeFrom=0.55, ragged=0.5, tone='body', alpha=0.8, spin=220, seed=6, tier=1),
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 1.2, 0], scale=1.8, billboard=True, sweep=0.0, tone='rim', alpha=0.7, tier=0),
    parts('petal', 0.05, 46, 2.4, 0.9, 1.9, 0.2, at='area', offset=[0, 0.6, 0], tone='rim', grav=-1.1, tier=0),
    parts('spark', 0.0, 30, 4.2, 1.0, 0.9, 0.09, at='area', offset=[0, 0.8, 0], tone='accent', tier=1),
])

write('suy_fail', 'tam', [
    mesh('crack_radial', 0.0, 2.2, at='area', offset=[0, 0.05, 0], scale=[0.4, 1, 0.4], scaleTo=[4.2, 1, 4.2], sweep=0.3, erodeFrom=0.6, ragged=0.9, tone='core', alpha=0.95, seed=3, tier=0),
    mesh('shock_cone', 0.0, 0.6, at='area', offset=[0, 0.05, 0], scale=[4.4, 1.2, 4.4], scaleTo=[0.5, 0.4, 0.5], sweep=0.2, erodeFrom=0.5, ragged=0.9, tone='accent', alpha=0.7, seed=5, tier=0),
    parts('dust', 0.0, 60, 3.0, 1.0, 1.4, 0.34, at='area', offset=[0, 0.8, 0], tone='core', inward=True, tier=0),
    decal('scorch', 0.1, 3.6, 4.0, at='area', grow=0.3, tone='core', alpha=0.8, tier=1),
])

# ---------------------------------------------------------------------------------------------------------------
# Ải 1 · Linh Lực Suy: Linh Nhãn (suối linh khí trồi khỏi đất khô). Tồn tại đúng `life` giây (untilDelay) rồi dời chỗ.
# Hình: vành đá sáu trụ thấp quanh mép (khối `rock_spire`, viền sáng) + vòng ấn đôi + lõi linh quang xoắn thấp + khí bốc. Tâm để trống cho người đứng.
# ---------------------------------------------------------------------------------------------------------------
write('suy_nhan_open', 'linh', [
    mesh('shock_cone', 0.0, 0.55, at='area', offset=[0, 0.05, 0], scale=[0.4, 0.5, 0.4], scaleTo=[3.4, 1.0, 3.4], sweep=0.35, erodeFrom=0.4, ragged=0.7, tone='rim', alpha=0.8, seed=12, tier=0),
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 0.9, 0], scale=1.6, billboard=True, sweep=0.0, tone='rim', alpha=0.6, tier=1),
    parts('spark', 0.0, 26, 3.0, 1.0, 0.8, 0.08, at='area', offset=[0, 0.3, 0], tone='rim', grav=-1.4, tier=0),
])

# Vòng lặp LOOP giây (client phát lại mỗi giây cho tới khi Linh Nhãn dời chỗ): không quét, không tan, để các vòng nối nhau liền mạch.
write('suy_nhan', 'linh', [
    decal('rune', 0.0, 3.2, LOOP, at='area', grow=0.01, tone='body', alpha=1.0, yaw=0, tier=0, **START),
    decal('rune', 0.0, 1.5, LOOP, at='area', grow=0.01, tone='rim', alpha=0.8, yaw=30, tier=1, **START),
    mesh('helix', 0.0, LOOP, at='area', offset=[0, 0.05, 0], rot=[-90, 0, 0], scale=[0.9, 0.9, 2.2], sweep=0.0, erodeFrom=HOLD, ragged=0.4, tone='body', alpha=0.6, spin=120, seed=13, tier=0, **START),
    parts('spark', 0.0, 8, 1.3, 0.35, 1.4, 0.09, at='area', offset=[0, 0.1, 0], tone='rim', grav=-1.6, tier=0, **START),
    parts('petal', 0.3, 4, 0.9, 0.5, 1.8, 0.16, at='area', offset=[0, 0.2, 0], tone='accent', grav=-0.8, tier=1, **START),
] + ring(6, 3.0, lambda i, x, z: mesh('rock_spire', 0.0, LOOP, at='area', offset=[x, 0, z], rot=[0, i * 60, 0], scale=[0.6, 1.0 + 0.35 * (i % 2), 0.6], sweep=0.0, erodeFrom=HOLD, tone='body', alpha=0.95, seed=20 + i, tier=0, **START)))

# Linh Nhãn khô (hết hạn/dời chỗ): khí tắt, bụi sụp.
write('suy_nhan_end', 'linh', [
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[3.2, 0.9, 3.2], scaleTo=[0.5, 0.2, 0.5], sweep=0.2, erodeFrom=0.4, ragged=0.9, tone='core', alpha=0.7, seed=15, tier=0),
    parts('dust', 0.0, 20, 1.4, 1.0, 0.9, 0.3, at='area', offset=[0, 0.2, 0], tone='core', grav=1.2, tier=1),
])

# ---------------------------------------------------------------------------------------------------------------
# Ải 2 · Nhục Thân Suy: Tôi Thể Lôi. Báo `warn` giây: lồng kim cương hổ phách treo trên vòng ấn (khác hẳn vòng tím/đỏ của thiên lôi thường)
# hạ dần xuống; đón được thì tia vàng giáng + vỡ lồng; lỡ thì lồng tan thành khói.
# ---------------------------------------------------------------------------------------------------------------
write('suy_toi_warn', 'the', [
    decal('rune', 0.0, 2.8, 2.2, at='area', grow=0.25, tone='body', alpha=1.0, yaw=0, untilDelay=True, tier=0, **START),
    decal('rune', 0.1, 1.4, 2.2, at='area', grow=0.3, tone='rim', alpha=0.9, yaw=45, untilDelay=True, tier=1, **START),
    mesh('seal_block', 0.0, 2.2, at='area', offset=[0, 6.0, 0], scale=[1.5, 1.2, 1.5], sweep=0.15, erodeFrom=0.95, tone='body', alpha=0.95, seed=32, keepUp=True,
         move={'to': 'area', 'offset': [0, 2.4, 0], 'ease': 'in'}, untilDelay=True, tier=0, **START),
    parts('spark', 0.0, 24, 2.0, 1.0, 1.0, 0.1, at='area', offset=[0, 2.6, 0], tone='rim', inward=True, tier=0, **START),
] + ring(4, 2.6, lambda i, x, z: mesh('rock_spire', round(0.1 + 0.08 * i, 3), 2.2, at='area', offset=[x, 0, z], rot=[0, i * 90, 0], scale=[0.45, 0.8, 0.45], sweep=0.2, erodeFrom=0.92, tone='body', alpha=0.95, seed=40 + i, untilDelay=True, tier=0, **START), phase=0.5))

write('suy_toi_hit', 'the', [
    {'type': 'bolt', 't': 0.0, 'at': 'area', 'scale': 0.9, 'thick': 3.2, 'tone': 'body', 'seed': 51, 'tier': 0},
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[0.5, 0.6, 0.5], scaleTo=[3.4, 1.5, 3.4], sweep=0.3, erodeFrom=0.35, ragged=0.8, tone='rim', alpha=0.9, seed=52, tier=0),
    mesh('crack_radial', 0.02, 2.4, at='area', offset=[0, 0.05, 0], scale=[0.5, 1, 0.5], scaleTo=[2.9, 1, 2.9], sweep=0.25, erodeFrom=0.6, ragged=0.8, tone='body', alpha=0.9, seed=53, tier=0),
    mesh('seal_block', 0.0, 0.3, at='area', offset=[0, 2.4, 0], scale=[1.5, 1.2, 1.5], scaleTo=[1.9, 0.5, 1.9], sweep=0.0, erodeFrom=0.2, tone='rim', alpha=0.9, seed=54, keepUp=True,
         move={'to': 'area', 'offset': [0, 0.1, 0], 'ease': 'in'}, tier=0),
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 1.1, 0], scale=2.2, billboard=True, sweep=0.0, tone='rim', alpha=0.75, cross=True, tier=0),
    parts('shard', 0.0, 24, 5.5, 0.9, 0.7, 0.14, at='area', offset=[0, 0.4, 0], tone='body', grav=9, tier=1),
    parts('spark', 0.0, 22, 4.5, 1.0, 0.6, 0.09, at='area', offset=[0, 0.9, 0], tone='rim', tier=0),
    {'type': 'shake', 't': 0.0, 'level': 0.2, 'tier': 1},
])

write('suy_toi_miss', 'the', [
    mesh('seal_block', 0.0, 0.5, at='area', offset=[0, 2.4, 0], scale=[1.5, 1.2, 1.5], scaleTo=[1.0, 1.6, 1.0], sweep=0.0, erodeFrom=0.1, tone='core', alpha=0.7, seed=56, keepUp=True, tier=0),
    mesh('flip', 0.0, 0.6, at='area', offset=[0, 2.2, 0], scale=2.4, billboard=True, sweep=0.0, tone='core', alpha=0.6, flip='ink_smoke', tier=1),
    parts('dust', 0.0, 16, 1.6, 1.0, 0.9, 0.28, at='area', offset=[0, 2.2, 0], tone='core', grav=1.5, tier=1),
])

# ---------------------------------------------------------------------------------------------------------------
# Ải 3 · Thần Thức Suy: lôi ẩn. Đang tụ: chỉ có sương mực rỉ quanh tâm sân (không lộ cung nào). Ngưng thần: một vòng ấn quét từ người ra cả sân.
# Nổ: mỗi cung một khe nứt chạy từ tâm ra + gai đá + tia (client phát `suy_thuc_boom` theo hướng từng cung nổ).
# ---------------------------------------------------------------------------------------------------------------
write('suy_thuc_brew', 'thuc', [
    decal('scorch', 0.0, 4.5, 3.0, at='area', grow=1.2, tone='core', alpha=0.85, untilDelay=True, tier=0, **START),
    decal('rune', 0.2, 2.2, 3.0, at='area', grow=0.8, tone='body', alpha=0.7, untilDelay=True, tier=1, **START),
    mesh('flip', 0.0, 1.4, at='area', offset=[0, 0.5, 0], scale=3.2, billboard=True, sweep=0.0, tone='core', alpha=0.45, flip='ink_smoke', tier=1, **START),
    parts('dust', 0.0, 26, 3.4, 1.0, 1.6, 0.32, at='area', offset=[0, 0.3, 0], tone='core', inward=True, tier=0, **START),
])

write('suy_thuc_pulse', 'thuc', [
    mesh('shock_cone', 0.0, 0.7, at='self', offset=[0, -1.1, 0], scale=[0.4, 0.3, 0.4], scaleTo=[13.0, 0.9, 13.0], sweep=0.25, erodeFrom=0.4, ragged=0.5, tone='rim', alpha=0.75, seed=63, tier=0),
    mesh('rune_ring2', 0.0, 0.9, at='self', offset=[0, -1.08, 0], scale=[0.6, 1, 0.6], scaleTo=[7.0, 1, 7.0], sweep=0.3, erodeFrom=0.4, ragged=0.5, tone='body', alpha=0.8, seed=64, tier=0),
    decal('rune', 0.0, 5.0, 0.9, at='self', offset=[0, -1.12, 0], grow=0.35, tone='rim', alpha=0.9, tier=0),
    mesh('burst', 0.0, 0.1, at='self', offset=[0, 0.55, 0], scale=0.9, billboard=True, sweep=0.0, tone='rim', alpha=0.6, tier=1),
    parts('spark', 0.0, 20, 5.0, 1.0, 0.6, 0.07, at='self', offset=[0, 0.4, 0], tone='rim', tier=1),
])

# Ngưng thần uổng (không có đợt nào đang tụ): vòng quét nhỏ, tắt nhanh.
write('suy_thuc_void', 'thuc', [
    mesh('rune_ring2', 0.0, 0.5, at='self', offset=[0, -1.08, 0], scale=[0.6, 1, 0.6], scaleTo=[3.0, 1, 3.0], sweep=0.3, erodeFrom=0.3, ragged=0.9, tone='core', alpha=0.6, seed=65, tier=0),
])

# Một cung nổ: gốc ở tâm sân, hướng +Z = giữa cung (client xoay `yaw`), bán kính 14 m.
write('suy_thuc_boom', 'thuc', [
    mesh('rift_line', 0.0, 1.5, at='area', offset=[0, 0.06, 1.0], scale=[3.2, 1, 12.5], sweep=0.3, erodeFrom=0.55, ragged=0.9, tone='accent', alpha=0.95, seed=71, tier=0),
    {'type': 'bolt', 't': 0.04, 'at': 'area', 'offset': [0, 0, 8.0], 'scale': 0.7, 'thick': 1.6, 'tone': 'body', 'seed': 72, 'tier': 0},
    mesh('rock_spire', 0.03, 0.9, at='area', offset=[0.9, 0, 4.5], rot=[0, 20, 8], scale=[0.9, 1.7, 0.9], sweep=0.2, erodeFrom=0.6, tone='body', alpha=0.95, seed=73, tier=0),
    mesh('rock_spire', 0.08, 0.9, at='area', offset=[-1.6, 0, 9.0], rot=[0, 140, -8], scale=[1.1, 2.1, 1.1], sweep=0.2, erodeFrom=0.6, tone='body', alpha=0.95, seed=74, tier=0),
    mesh('rock_spire', 0.12, 0.9, at='area', offset=[1.8, 0, 12.0], rot=[0, 260, 6], scale=[0.9, 1.5, 0.9], sweep=0.2, erodeFrom=0.6, tone='body', alpha=0.95, seed=75, tier=1),
    parts('shard', 0.04, 18, 6.0, 0.8, 0.7, 0.15, at='area', offset=[0, 0.4, 8.0], tone='rim', grav=9, tier=1),
])

# ---------------------------------------------------------------------------------------------------------------
# Ải 4 · Thọ Nguyên Suy: Thọ Đăng. Thân đèn là khối `seal_block` (đế) + trụ đá; ngọn lửa là mũi tinh thể `kite` bập bùng.
# `suy_den_lit` / `suy_den_dark` là vòng lặp 4 s do client phát lại (đèn cháy bao lâu server mới biết); khi đổi trạng thái client `drop` vòng cũ.
# ---------------------------------------------------------------------------------------------------------------
LAMP_BODY = [
    mesh('seal_block', 0.0, LOOP, at='area', offset=[0, 0, 0], scale=[0.9, 0.5, 0.9], sweep=0.0, erodeFrom=HOLD, alpha=0.95, seed=81, tier=0, **START),
    mesh('rock_spire', 0.0, LOOP, at='area', offset=[0, 0.45, 0], scale=[0.36, 1.25, 0.36], sweep=0.0, erodeFrom=HOLD, alpha=0.95, seed=82, tier=0, **START),
]


def toned(events, tone):
    return [dict(e, tone=tone) for e in events]


write('suy_den_lit', 'tho', toned(LAMP_BODY, 'body') + [
    mesh('kite', 0.0, LOOP, at='area', offset=[0, 1.75, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, 1.05], sweep=0.0, erodeFrom=HOLD, tone='rim', alpha=0.95, seed=83, tier=0, **START),
    decal('rune', 0.0, 1.6, LOOP, at='area', grow=0.01, tone='body', alpha=0.85, yaw=0, tier=0, **START),
    parts('spark', 0.0, 4, 0.7, 0.4, 1.4, 0.07, at='area', offset=[0, 2.1, 0], tone='rim', grav=-1.0, tier=1, **START),
])

write('suy_den_dark', 'tho', toned(LAMP_BODY, 'core') + [
    decal('rune', 0.0, 2.8, LOOP, at='area', grow=0.01, tone='accent', alpha=1.0, yaw=0, tier=0, **START),
    decal('scorch', 0.0, 1.4, LOOP, at='area', grow=0.01, tone='core', alpha=0.7, yaw=0, tier=1, **START),
    parts('dust', 0.0, 3, 0.5, 0.6, 1.6, 0.24, at='area', offset=[0, 1.7, 0], tone='core', grav=-0.6, tier=1, **START),
])

# Suy phong nhắm một ngọn (báo `warn` giây): vệt gió xám quấn quanh đèn + vòng ấn nhấp nháy.
write('suy_den_gust', 'tho', [
    mesh('ribbon', 0.0, 1.5, at='area', offset=[0, 0.4, 0], rot=[-90, 0, 0], scale=[1.5, 1.5, 0.75], sweep=0.5, erodeFrom=0.8, ragged=0.7, tone='accent', alpha=0.85, seed=86, spin=-360, untilDelay=True, tier=0, **START),
    decal('rune', 0.0, 2.8, 1.5, at='area', grow=0.2, tone='accent', alpha=1.0, yaw=20, untilDelay=True, tier=0, **START),
    mesh('ribbon', 0.15, 1.5, at='area', offset=[0, 1.3, 0], rot=[-90, 0, 0], scale=[2.2, 2.2, 0.5], sweep=0.5, erodeFrom=0.8, ragged=0.7, tone='rim', alpha=0.7, seed=187, spin=360, untilDelay=True, tier=1, **START),
    parts('dust', 0.0, 22, 3.0, 1.0, 1.1, 0.26, at='area', offset=[0, 1.4, 0], tone='accent', inward=True, tier=0, **START),
])

write('suy_den_out', 'tho', [
    mesh('flip', 0.0, 0.8, at='area', offset=[0, 2.1, 0], scale=2.2, billboard=True, sweep=0.0, tone='core', alpha=0.7, flip='ink_smoke', tier=0),
    mesh('shock_cone', 0.0, 0.45, at='area', offset=[0, 1.6, 0], scale=[0.3, 0.3, 0.3], scaleTo=[1.8, 0.5, 1.8], sweep=0.3, erodeFrom=0.4, ragged=0.9, tone='accent', alpha=0.7, seed=88, tier=0),
    parts('dust', 0.0, 18, 2.2, 0.9, 1.0, 0.26, at='area', offset=[0, 1.9, 0], tone='core', grav=0.8, tier=1),
])

# Đang thắp lại (đứng cạnh `light` giây): linh quang hút về bấc.
write('suy_den_light', 'tho', [
    mesh('helix', 0.0, 1.2, at='area', offset=[0, 0.3, 0], rot=[-90, 0, 0], scale=[0.7, 0.7, 0.9], sweep=0.9, erodeFrom=0.85, ragged=0.4, tone='rim', alpha=0.8, seed=89, spin=300, untilDelay=True, tier=0, **START),
    parts('spark', 0.0, 26, 2.2, 1.0, 0.9, 0.08, at='area', offset=[0, 1.9, 0], tone='rim', inward=True, tier=0, **START),
])

write('suy_den_relit', 'tho', [
    mesh('burst', 0.0, 0.11, at='area', offset=[0, 2.0, 0], scale=1.7, billboard=True, sweep=0.0, tone='rim', alpha=0.75, tier=0),
    mesh('shock_cone', 0.0, 0.5, at='area', offset=[0, 0.05, 0], scale=[0.4, 0.5, 0.4], scaleTo=[2.6, 1.0, 2.6], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='body', alpha=0.8, seed=90, tier=0),
    parts('spark', 0.0, 22, 3.2, 1.0, 0.8, 0.08, at='area', offset=[0, 2.0, 0], tone='rim', grav=2.0, tier=0),
])

# ---------------------------------------------------------------------------------------------------------------
# Ải 5 · Đạo Tâm Suy. Nhịp phá vọng mở: vầng kiếm vàng hiện sau lưng (ra tay được) suốt `strike` giây. Trúng: vết chém chữ thập vàng ở Tâm Ma Ảnh.
# Động niệm (ra tay lúc tĩnh): khói mực + nứt đỏ dưới chân mình. Lỡ nhịp: vầng kiếm rã.
# ---------------------------------------------------------------------------------------------------------------
write('suy_tam_open', 'tam', [
    decal('rune', 0.0, 3.0, 3.0, at='self', offset=[0, -1.12, 0], grow=0.25, tone='accent', alpha=1.0, yaw=0, untilDelay=True, tier=0, **START),
    mesh('shock_cone', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=[0.4, 0.4, 0.4], scaleTo=[3.2, 1.0, 3.2], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='rim', alpha=0.8, seed=93, tier=0, **START),
    parts('spark', 0.0, 22, 2.6, 1.0, 0.8, 0.08, at='self', tone='accent', inward=True, tier=1, **START),
] + ring(4, 2.6, lambda i, x, z: mesh('spike', round(0.04 * i, 3), 3.0, at='self', offset=[x, -1.12, z], rot=[-90, 0, 0], scale=[0.42, 0.42, 0.5], sweep=0.15, erodeFrom=0.92, tone='accent', alpha=0.95, seed=91 + i, untilDelay=True, tier=0, **START), phase=0.5))

write('suy_tam_good', 'tam', [
    mesh('slash_cross', 0.0, 0.4, at='target', scale=[2.4, 1, 2.4], rot=[90, 0, 0], sweep=0.3, erodeFrom=0.4, ragged=0.7, tone='accent', alpha=0.95, seed=94, tier=0),
    mesh('burst', 0.0, 0.11, at='target', scale=2.0, billboard=True, sweep=0.0, tone='rim', alpha=0.75, cross=True, tier=0),
    mesh('shock_cone', 0.02, 0.5, at='target', offset=[0, -0.9, 0], scale=[0.4, 0.5, 0.4], scaleTo=[3.0, 1.2, 3.0], sweep=0.3, erodeFrom=0.4, ragged=0.7, tone='accent', alpha=0.8, seed=95, tier=0),
    parts('shard', 0.0, 20, 5.5, 0.9, 0.7, 0.13, at='target', tone='accent', grav=8, tier=1),
    parts('petal', 0.05, 22, 2.0, 0.9, 1.6, 0.18, at='self', tone='rim', grav=-1.0, tier=1),
    {'type': 'shake', 't': 0.0, 'level': 0.15, 'tier': 1},
])

write('suy_tam_bad', 'tam', [
    mesh('crack_radial', 0.0, 1.6, at='self', offset=[0, -1.08, 0], scale=[0.4, 1, 0.4], scaleTo=[2.6, 1, 2.6], sweep=0.25, erodeFrom=0.6, ragged=0.9, tone='body', alpha=0.9, seed=96, tier=0),
    mesh('flip', 0.0, 0.7, at='self', offset=[0, 0.2, 0], scale=2.6, billboard=True, sweep=0.0, tone='core', alpha=0.6, flip='ink_smoke', tier=0),
    parts('dust', 0.0, 22, 2.6, 1.0, 1.0, 0.3, at='self', tone='body', inward=True, tier=1),
])

write('suy_tam_miss', 'tam', [
    decal('scorch', 0.0, 3.0, 1.2, at='self', offset=[0, -1.12, 0], grow=0.1, tone='core', alpha=0.8, tier=0),
    mesh('flip', 0.0, 0.6, at='self', offset=[0, 0.2, 0], scale=2.2, billboard=True, sweep=0.0, tone='core', alpha=0.5, flip='ink_smoke', tier=1),
    parts('dust', 0.0, 18, 2.0, 1.0, 0.9, 0.28, at='self', offset=[0, 0.3, 0], tone='core', grav=1.5, tier=1),
])

print('da sinh suy_*.json')
