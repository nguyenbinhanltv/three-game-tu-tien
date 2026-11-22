# TN-3: sinh `packages/content/data/fx/kc_*.json`: hiệu ứng ba cơ chế kiếp chương 6 (hỏi đạo, âm vực lan, đòn nhịp Dương Thực) theo ngôn ngữ VFX timeline.
# Chỉ là hình, luật ở server (apps/server/src/game/tribch6.ts). Chạy: python tools/vfx/gen-fx-ch6.py
#
# Client (`game/fx/suyFx.ts`, phần `kcMark`) phát từng timeline bằng `FxRunner.startAt` tại điểm server báo qua FX `kcmark`; bảng màu `kc_hoi_dao`,
# `kc_am_lan`, `kc_duong_dap` ở `render/vfx/palette.ts`. Mọi cỡ là MÉT. Vật có thời hạn dùng `untilDelay` (sống đúng `d` giây server báo).
#
# Quy ước (bài học #424, sân độ kiếp rất tối, camera nhìn từ sau lưng): hình chính là vòng/triện PHẲNG sát đất để không che nhân vật; khối cao đều `camFade`
# (mờ khi nằm giữa camera và người); thứ phải bước vào dùng `rim`/`body` sáng, mối nguy dùng `accent`.
# Cỡ khớp luật server (đổi một bên thì đổi bên kia): Đạo Môn gateR = 3,5 m, âm vực r1 = 8 m, đòn nhịp sân 12 m (`tribulations.json`).
import json
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


def write(name, pal, events):
    d = {'skill': name, 'palette': pal, 'events': events}
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


# ---- Vấn Đỉnh · hỏi đạo ----
# Đạo Môn n vành (gốc ở tâm cổng, bán kính cổng 3,5 m, sống đúng d giây): đĩa nền + n vành đồng tâm; cột sáng cao do client thêm (số cột = số vành). Ít khối để không chạm trần số khối FX đồng thời.
RINGS = [3.0, 2.2, 1.4]
for n in (1, 2, 3):
    # Sàn sân kiếp có các tấm đá nhô cao hơn mặt đất: đĩa/vòng đặt cao ~0,9–1,1 m (tấm đá sân kiếp nhô tới ~0,8 m) để không chìm dưới tấm.
    ev = [mesh('ripple', 0.0, 3.0, at='area', offset=[0, 1.4, 0], scale=3.0, sweep=0.0, erodeFrom=0.97, ragged=0.2, tone='body', alpha=0.85, seed=200, untilDelay=True, tier=0, **START)]
    for i in range(n):
        ev.append(mesh('rune_ring2', 0.05 * i, 3.0, at='area', offset=[0, 1.5 + 0.06 * i, 0], scale=[RINGS[i], 1, RINGS[i]], sweep=0.0, erodeFrom=0.97, ragged=0.3, tone='rim', alpha=1.0, seed=201 + i, untilDelay=True, tier=0, **START))
    # Khung cổng: hai cột đá cao 3,5 m hai bên (camFade để không che người).
    for sx in (-1, 1):
        ev.append(mesh('rock_spire', 0.0, 3.0, at='area', offset=[sx * 2.6, 0, 0], scale=[0.5, 3.5, 0.5], sweep=0.0, erodeFrom=0.97, tone='rim', alpha=0.95, seed=212 + sx, untilDelay=True, tier=1, camFade=True, **START))
    write('kc_gate_%d' % n, 'kc_hoi_dao', ev)

# Dấu hỏi giữa sân n vành: nhỏ hơn, tông accent vàng, chỉ vòng phẳng + triện (không khối cao: người độ kiếp đứng ngay đây lúc bắt đầu).
MR = [2.8, 1.9, 1.0]
for n in (1, 2, 3):
    ev = [mesh('ripple', 0.0, 3.0, at='area', offset=[0, 0.9, 0], scale=2.9, sweep=0.0, erodeFrom=0.97, ragged=0.2, tone='body', alpha=0.8, seed=220, untilDelay=True, tier=0, **START)]
    for i in range(n):
        ev.append(mesh('rune_ring2', 0.05 * i, 3.0, at='area', offset=[0, 1.1 + 0.06 * i, 0], scale=[MR[i], 1, MR[i]], sweep=0.0, erodeFrom=0.97, ragged=0.3, tone='accent', alpha=1.0, seed=221 + i, untilDelay=True, tier=0, **START))
    write('kc_mark_%d' % n, 'kc_hoi_dao', ev)

# Đường sáng mờ từ dấu giữa sân tới cổng đúng (gốc ở tâm sân, +Z hướng tới cổng, dài đúng bán kính vòng 6 m, sống đúng d = 2 giây cuối).
write('kc_hd_path', 'kc_hoi_dao', [
    mesh('rift_line', 0.0, 2.0, at='area', offset=[0, 1.0, 3.0], scale=[1.0, 1, 6.0], sweep=0.5, erodeFrom=0.9, ragged=0.3, tone='accent', alpha=0.7, seed=233, untilDelay=True, tier=0, **START),
    parts('spark', 0.0, 20, 1.5, 0.3, 1.0, 0.08, at='area', offset=[0, 1.1, 3.0], tone='accent', tier=1, **START),
])

# Đáp đúng (ở cổng đúng): sóng sáng lan ra + cánh hoa. Đáp sai: nứt đất dưới chân người + khói.
write('kc_hd_ok', 'kc_hoi_dao', [
    mesh('shock_cone', 0.0, 0.6, at='area', offset=[0, 0.05, 0], scale=[0.6, 0.7, 0.6], scaleTo=[3.6, 1.4, 3.6], sweep=0.3, erodeFrom=0.4, ragged=0.6, tone='rim', alpha=0.9, seed=231, tier=0),
    parts('petal', 0.0, 22, 2.2, 0.9, 1.4, 0.16, at='area', offset=[0, 0.8, 0], tone='rim', grav=-1.0, tier=0),
])
write('kc_hd_bad', 'kc_hoi_dao', [
    mesh('crack_radial', 0.0, 1.6, at='self', offset=[0, -1.08, 0], scale=[0.4, 1, 0.4], scaleTo=[3.0, 1, 3.0], sweep=0.25, erodeFrom=0.6, ragged=0.9, tone='accent', alpha=0.9, seed=232, tier=0),
    parts('dust', 0.0, 16, 2.0, 1.0, 0.8, 0.26, at='self', tone='body', inward=True, tier=1),
    {'type': 'flash', 't': 0.0, 'amount': 0.1, 'tier': 0},
])

# ---- Âm Hư · âm vực lan dần ----
# Vực (gốc ở tâm vực, r1 = 8 m, sống đúng d giây = mầm + lan + giữ): vệt đất tối mọc dần từ tâm tới 8 m (phẳng sát đất; mọc nhanh hơn vùng hại lúc đầu nên báo thừa an toàn),
# triện văn viền sáng và khói hồn bốc nhẹ. Không khối cao.
# Mầm (1,2 s đầu, chưa hại): vòng accent hồng nhỏ nhấp nháy. Vực lan (sau mầm): vùng tím-đen đặc mọc từ tâm tới 8 m, viền sáng lan ra theo (hai vòng nối nhau gần khớp
# bán kính server), triện văn rim sáng; khi lan hết giữ vòng viền 8 m.
write('kc_am_pool', 'kc_am_lan', [
    mesh('rune_ring2', 0.0, 1.2, at='area', offset=[0, 1.0, 0], scale=[1.2, 1, 1.2], scaleTo=[1.9, 1, 1.9], sweep=0.0, erodeFrom=0.9, ragged=0.4, tone='accent', alpha=1.0, seed=243, tier=0, **START),
    mesh('ripple', 1.2, 1.8, at='area', offset=[0, 0.9, 0], scale=1.5, scaleTo=3.8, sweep=0.0, erodeFrom=0.95, ragged=0.3, tone='core', alpha=1.0, seed=246, tier=0, **START),
    mesh('ripple', 3.0, 4.0, at='area', offset=[0, 0.9, 0], scale=3.8, scaleTo=8.0, sweep=0.0, erodeFrom=0.99, ragged=0.3, tone='core', alpha=1.0, seed=247, untilDelay=True, tier=0, **START),
    mesh('rune_ring2', 1.2, 1.8, at='area', offset=[0, 1.02, 0], scale=[1.5, 1, 1.5], scaleTo=[3.8, 1, 3.8], sweep=0.0, erodeFrom=0.9, ragged=0.4, tone='rim', alpha=1.0, seed=241, tier=0, **START),
    mesh('rune_ring2', 3.0, 4.0, at='area', offset=[0, 1.02, 0], scale=[3.8, 1, 3.8], scaleTo=[8.0, 1, 8.0], sweep=0.0, erodeFrom=0.99, ragged=0.3, tone='accent', alpha=1.0, seed=244, untilDelay=True, tier=0, **START),
    parts('dust', 1.2, 22, 0.8, 1.0, 1.8, 0.34, at='area', offset=[0, 0.9, 0], tone='body', grav=-0.5, tier=1, **START),
])
write('kc_am_end', 'kc_am_lan', [
    mesh('shock_cone', 0.0, 0.7, at='area', offset=[0, 0.05, 0], scale=[2.0, 0.6, 2.0], scaleTo=[8.0, 0.8, 8.0], sweep=0.3, erodeFrom=0.35, ragged=0.8, tone='body', alpha=0.6, seed=242, tier=1),
    parts('dust', 0.0, 18, 1.6, 1.0, 1.0, 0.3, at='area', offset=[0, 0.9, 0], tone='core', grav=1.2, tier=1),
])

# ---- Dương Thực · đòn nhịp ----
# Ủ đòn (gốc ở tâm sân, sống đúng windup giây): vòng 12 m thu dần về tâm (đòn nhịp nung cả sân), triện văn đỏ cam, mặt trời nhỏ trên cao camFade.
write('kc_dt_wind', 'kc_duong_dap', [
    decal('rune', 0.0, 12.0, 2.4, at='area', grow=0.6, tone='body', alpha=0.7, yaw=0, untilDelay=True, tier=0, **START),
    mesh('rune_ring2', 0.0, 2.4, at='area', offset=[0, 0.08, 0], scale=[12.0, 1, 12.0], scaleTo=[2.0, 1, 2.0], sweep=0.05, erodeFrom=0.97, ragged=0.4, tone='accent', alpha=0.95, seed=251, untilDelay=True, tier=0, **START),
    mesh('burst', 0.0, 2.4, at='area', offset=[0, 9.0, 0], scale=2.0, scaleTo=5.0, billboard=True, sweep=0.0, tone='rim', alpha=0.55, untilDelay=True, tier=1, camFade=True, **START),
    parts('spark', 0.0, 40, 2.0, 1.0, 1.6, 0.1, at='area', offset=[0, 0.4, 0], tone='accent', inward=True, tier=1, **START),
])
# Cửa sổ phản đòn mở (trên người chơi, 1 s): hai vòng sáng quanh chân thu nhanh, dấu "bây giờ".
write('kc_dt_now', 'kc_duong_dap', [
    decal('rune', 0.0, 4.6, 1.3, at='self', grow=0.15, tone='accent', alpha=0.9, follow=True, tier=0),
    mesh('rune_ring2', 0.0, 1.3, at='self', offset=[0, -1.08, 0], scale=[5.0, 1, 5.0], scaleTo=[1.4, 1, 1.4], sweep=0.05, erodeFrom=0.92, ragged=0.15, tone='rim', alpha=1.0, seed=252, follow=True, tier=0),
    mesh('rune_ring2', 0.0, 1.3, at='self', offset=[0, -1.06, 0], scale=[3.4, 1, 3.4], scaleTo=[1.4, 1, 1.4], sweep=0.05, erodeFrom=0.92, ragged=0.15, tone='accent', alpha=1.0, seed=253, follow=True, tier=0),
    mesh('rune_ring2', 0.0, 1.3, at='self', offset=[0, -1.04, 0], scale=[1.4, 1, 1.4], sweep=0.05, erodeFrom=0.92, ragged=0.1, tone='rim', alpha=1.0, seed=257, follow=True, tier=0),
])
# Phản đòn: sóng sáng vỡ ra, tia lửa, chớp nhẹ. Chịu đòn: nứt đất đỏ + khói + rung.
write('kc_dt_parry', 'kc_duong_dap', [
    mesh('shock_cone', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=[1.2, 0.6, 1.2], scaleTo=[5.0, 1.6, 5.0], sweep=0.3, erodeFrom=0.35, ragged=0.6, tone='rim', alpha=0.9, seed=254, tier=0),
    parts('spark', 0.0, 28, 4.0, 1.0, 0.7, 0.09, at='self', offset=[0, 0.4, 0], tone='rim', grav=-1.4, tier=0),
    {'type': 'flash', 't': 0.0, 'amount': 0.12, 'tier': 0},
])
write('kc_dt_hit', 'kc_duong_dap', [
    mesh('crack_radial', 0.0, 1.6, at='self', offset=[0, -1.08, 0], scale=[0.4, 1, 0.4], scaleTo=[3.4, 1, 3.4], sweep=0.25, erodeFrom=0.6, ragged=0.9, tone='accent', alpha=0.95, seed=255, tier=0),
    mesh('shock_cone', 0.0, 0.6, at='self', offset=[0, -1.1, 0], scale=[1.0, 0.8, 1.0], scaleTo=[6.0, 2.0, 6.0], sweep=0.3, erodeFrom=0.35, ragged=0.8, tone='accent', alpha=0.85, seed=256, tier=0),
    parts('dust', 0.0, 20, 2.4, 1.0, 0.9, 0.28, at='self', tone='body', inward=True, tier=1),
    {'type': 'shake', 't': 0.0, 'level': 0.25, 'tier': 1},
    {'type': 'flash', 't': 0.0, 'amount': 0.16, 'tier': 0},
])

print('da sinh kc_*.json')
