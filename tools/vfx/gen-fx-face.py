# TN-3 (chương 6): sinh `packages/content/data/fx/mon_face*.json`: hiệu ứng lật mặt Âm/Dương của Phủ Chủ trong Giới Trì Động Phủ.
# Chỉ là hình, luật ở server (`MonsterFaces`, cờ MF_FACE). Chạy: python tools/vfx/gen-fx-face.py
#
# Client (`game/fx/monFx.ts`) phát tại chân boss bằng `FxRunner.startAt` khi nhận FX `face_warn` (2 giây trước khi lật) và `face` (lúc lật); bảng màu
# `face_am`/`face_duong` (render/vfx/palette.ts) chọn theo mặt MỚI. Mọi cỡ là MÉT ở mul = 1 (client nhân theo cỡ boss).
# Bài học "khối to che người/boss" (#424): MỌI khối cao (gai, khói, chớp) đều `camFade` để mờ khi nằm giữa camera và boss/người đứng gần;
# phần phẳng sát đất (vòng gợn, triện) không che nên giữ cho vòng còn đọc được từ xa. Ngân sách: mỗi timeline <= 12 draw.
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


def write(name, events):
    d = {'skill': name, 'palette': 'face_am', 'events': events}
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


def ring(n, radius, f):
    return [f(i, round(radius * math.sin(2 * math.pi * i / n), 2), round(radius * math.cos(2 * math.pi * i / n), 2)) for i in range(n)]


# Báo trước (2 giây): triện văn dưới chân boss siết dần, gợn thu vào, tàn sáng hút về. Phẳng sát đất nên đọc rõ từ xa; một cột sáng mảnh camFade.
write('mon_face_warn', [
    decal('rune', 0.0, 4.6, 2.0, at='self', offset=[0, -0.05, 0], grow=0.3, tone='accent', alpha=0.95, tier=0, **START),
    decal('rune', 0.1, 3.0, 1.9, at='self', offset=[0, -0.04, 0], grow=0.25, yaw=22, tone='rim', alpha=0.7, tier=1, **START),
    mesh('ripple', 0.0, 1.0, at='self', offset=[0, 0.08, 0], scale=8.0, scaleTo=2.0, sweep=0.5, erodeFrom=0.5, ragged=0.7, tone='body', alpha=0.85, seed=21, tier=0, **START),
    mesh('ripple', 0.9, 1.0, at='self', offset=[0, 0.09, 0], scale=14.0, scaleTo=3.0, sweep=0.5, erodeFrom=0.5, ragged=0.7, tone='accent', alpha=0.85, seed=22, tier=0, **START),
    mesh('smoke', 0.0, 1.9, at='self', offset=[0, 0.2, 0], scale=4.0, scaleTo=1.6, sweep=0.6, erodeFrom=0.4, tone='core', alpha=0.45, seed=23, tier=1, camFade=True, **START),
    parts('spark', 0.0, 18, 1.8, 3.0, 1.2, 0.08, at='self', offset=[0, 0.3, 0], tone='rim', inward=True, tier=1, **START),
])

# Lật mặt: chớp, hai gợn lan ra, vòng gai rạn trồi lần lượt, khói, mảnh bắn lên. Tất cả khối cao có camFade.
flip = [
    mesh('burst', 0.0, 0.14, at='self', offset=[0, 1.4, 0], scale=1.6, billboard=True, sweep=0.0, tone='rim', alpha=0.9, tier=0, camFade=True),
    mesh('ripple', 0.0, 0.45, at='self', offset=[0, 0.1, 0], scale=0.5, scaleTo=9.0, sweep=0.4, erodeFrom=0.45, ragged=0.8, tone='body', alpha=0.95, seed=31, tier=0),
    mesh('ripple', 0.08, 0.55, at='self', offset=[0, 0.12, 0], scale=0.4, scaleTo=7.0, sweep=0.4, erodeFrom=0.4, tone='accent', alpha=0.85, seed=32, tier=1),
    decal('rune', 0.0, 4.2, 0.8, at='self', offset=[0, -0.05, 0], grow=0.12, tone='core', alpha=0.8, tier=0),
    decal('crack', 0.04, 3.4, 0.8, at='self', offset=[0, -0.04, 0], grow=0.12, tone='accent', alpha=0.85, tier=1),
    mesh('smoke', 0.04, 0.6, at='self', offset=[0, 0.3, 0], scale=1.6, scaleTo=3.2, sweep=0.5, erodeFrom=0.4, tone='core', alpha=0.5, seed=33, tier=1, camFade=True),
    parts('shard', 0.0, 16, 5.5, 1.0, 0.7, 0.12, at='self', offset=[0, 0.4, 0], tone='body', grav=8, tier=0),
]
flip += ring(6, 2.2, lambda i, x, z: mesh('spike', round(0.03 + 0.02 * i, 3), 0.45, at='self', offset=[x, 0, z], rot=[-90 if i % 2 == 0 else -78, 0, 0], scale=round(0.22 + 0.04 * (i % 3), 2), sweep=0.2, erodeFrom=0.55, tone='rim' if i % 2 else 'body', alpha=0.9, seed=40 + i, tier=1, camFade=True))
write('mon_face', flip)
