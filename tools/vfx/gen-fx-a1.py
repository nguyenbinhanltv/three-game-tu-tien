#!/usr/bin/env python3
"""A1 (Họa Pháp Lô 2): timeline riêng cho 12 chiêu của 6 boss chương 1–2 (concept đã duyệt ở artifact a1/):
Kiếm Khôi (kim), Huyết Lang Vương (hỏa), Thú Mộ Tướng (lôi), Địa Mạch Long (thổ/ngọc), Thạch Tâm Khôi Vương (thổ/ngọc), Thôn Mạch Ngô Công Vương (mộc/độc).
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo = đĩa/quạt/dải đỏ đặc vân nứt tô dần theo `delay`) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo hệ);
chiêu niệm (chant) thêm `mon_cast__<quái>` (viền đỏ mỏng lúc niệm). Texture dùng chung: decal_atlas / flip_atlas (docs/handbook/vfx-forge.md).
Quy ước: ≤ 4 decal sống cùng lúc mỗi chiêu (DECAL_MAX = 6 cho cả runner); vùng tròn dùng decal `r: 4` nhân `mul` = r/4 (khớp hitbox), quạt `r: 8` nhân r/8,
dải chữ nhật dùng `strip: [dài, rộng]` mét thật (khớp hitbox). Nổ phải tối ở lõi/viền sáng, KHÔNG đỏ/cam phẳng để không lẫn vạch báo.
Chạy: python tools/vfx/gen-fx-a1.py  (ghi vào packages/content/data/fx/)."""
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


def cast_ring(boss, r):
    # Lúc niệm (MonFx.cast): viền đỏ MỎNG + triện mờ trong suốt thời gian niệm, rồi vạch báo tô đậm ở `delay` cuối. 1 decal (trần DECAL_MAX).
    write('mon_cast__' + boss, [decal('rune', 0, r, 3.6, 'accent', 0.75, 0.35, ink=True, untilDelay=False, at='self')], PAL[boss])


PAL = {
    'boss_kiem_khoi': 'mon_boss_kim',
    'boss_huyet_lang_vuong': 'mon_boss_hoa',
    'boss_thu_mo_tuong': 'mon_boss_loi',
    'boss_dia_mach_long': 'mon_boss_tho',
    'boss_thach_tam_khoi_vuong': 'mon_boss_tho',
    'boss_thon_mach_ngo_cong_vuong': 'mon_boss_moc',
}
LIFT = 0.35  # nâng decal nổ: mặt đá bát quái sân tông môn nhô cao hơn mặt phẳng decal

# ================= Kiếm Khôi (kim): vòng lưỡi kiếm thép / vệt kiếm khí bạc =================
B = 'boss_kiem_khoi'
write(f'mon_warn__{B}__slam', warn_circle(1.7), PAL[B])
write(f'mon_boom_circle__{B}__slam', [
    mesh('burst', 0, 0.16, 'rim', 0.38, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('steel_crack', 0, 4.4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'body', 0.95, 2),
    *flip_ring('steel_flip', 6, 2.6, 0.0, 1.8, 300),
    *ring_mesh('spike', 10, 3.1, 20, 0.6, tone='body'),  # vòng lưỡi kiếm thép trắng bạc quanh rìa (như concept)
    mesh('spike', 0, 0.9, 'body', 1, 40, offset=[0, 0, 0], rot=[-90, 0, 0], scale=1.0, sweep=0.15, erodeFrom=0.6),
        parts('spark', 0, 28, 6, 0.9, 0.7, 0.1, 'body', offset=[0, 0.3, 0], grav=6, tier=0),
    parts('shard', 0, 20, 6, 0.9, 0.7, 0.11, 'body', offset=[0, 0.3, 0], grav=9, tier=0),
], PAL[B])
write(f'mon_warn_line__{B}__sweep', warn_strip(1.3, 16, 3), PAL[B])
write(f'mon_boom_line__{B}__sweep', unmul([
    decal('steel_crack', 0, 1, 2.4, 'body', 1.0, 0.04, top=False, untilDelay=False, strip=[16, 3], lift=LIFT),
    decal('steel_crack', 0, 1, 2.4, 'body', 1.0, 0.04, top=False, untilDelay=False, strip=[16, 3], lift=0.36),
    rift(16, 0.7, tone='rim', seed=60),  # rãnh nứt sáng bạc chạy dọc đường chém
    *flip_line('steel_flip', 8, 16, 0.0, 1.2, 320, step=0.02, jitter=0.9),
    *[mesh('spark_streak', 0.0 + i * 0.02, 0.45, 'rim', 1, 330 + i, offset=[(i - 1) * 0.9, 0.5, 0.5], scale=[0.6, 0.6, 15], sweep=0.2, erodeFrom=0.5) for i in range(3)],  # vệt kiếm khí trắng bạc
    parts('spark', 0, 40, 10, 0.3, 0.6, 0.1, 'body', offset=[0, 0.5, 3], grav=3, tier=0),
    parts('shard', 0.0, 26, 9, 0.4, 0.6, 0.1, 'body', offset=[0, 0.4, 8], grav=6, tier=0),
], 2.0), PAL[B])

# ================= Huyết Lang Vương (hỏa): vuốt than cháy, lõi tối viền vàng trắng =================
B = 'boss_huyet_lang_vuong'
write(f'mon_warn__{B}__slam', warn_circle(1.7, 40, -20), PAL[B])
claw = []
for i in range(3):  # ba vết vuốt rạch chéo qua vùng nổ
    ox = (i - 1) * 1.7
    for j in range(3):
        claw.append(flip('fire_flip', 0.0 + i * 0.03 + j * 0.02, ox + (j - 1) * 0.2, (j - 1) * 2.0 + ox * 0.3, 1.6 + j * 0.1, 340 + i * 3 + j, tier=0 if (i + j) % 2 == 0 else 1))
write(f'mon_boom_circle__{B}__slam', [
    mesh('burst', 0, 0.16, 'rim', 0.35, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('ember_crack', 0, 4.4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'rim', 0.9, 2),
    *claw,  # tro đen: lõi tối, không mảng cam phẳng
    parts('spark', 0, 30, 6, 0.9, 0.7, 0.09, 'rim', offset=[0, 0.3, 0], grav=5, tier=0),
    parts('dust', 0, 26, 3, 0.9, 0.9, 0.24, 'core', offset=[0, 0.2, 0], grav=0.8),
], PAL[B])
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.2, 50), PAL[B])
write(f'mon_boom_cone__{B}__sweep', [
    mesh('burst', 0, 0.14, 'rim', 0.34, 0, offset=[0, 0.6, 0.8], scale=1.4, billboard=True, sweep=0),
    decal('ember_crack', 0, 8, 2.2, 'body', 1.0, 0.04, top=False, untilDelay=False, sector=50, lift=LIFT),
    *[flip('fire_flip', i * 0.03, math.sin(math.radians((i % 3 - 1) * 22)) * (2 + i * 1.3), math.cos(math.radians((i % 3 - 1) * 22)) * (2 + i * 1.3), 1.6 + (i % 3) * 0.2, 360 + i, tier=0 if i % 2 == 0 else 1) for i in range(7)],
    parts('spark', 0, 26, 8, 0.4, 0.6, 0.09, 'rim', offset=[0, 0.5, 0.8], grav=4, tier=0),
    parts('dust', 0.04, 14, 3, 0.7, 0.9, 0.24, 'core', offset=[0, 0.1, 4], grav=0.8),
], PAL[B])

# ================= Thú Mộ Tướng (lôi): cột sét tím-trắng =================
B = 'boss_thu_mo_tuong'
cast_ring(B, 10)
write(f'mon_warn__{B}__chant', warn_circle(0.85, 70, -20, spark=24), PAL[B])
write(f'mon_boom_circle__{B}__chant', [
    mesh('burst', 0, 0.16, 'rim', 0.34, 0, offset=[0, 0.7, 0], scale=1.4, billboard=True, sweep=0),
    decal('bolt_scorch', 0, 4, 2.8, 'body', 1.0, 0.03, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'rim', 0.95, 2),
    *flip_ring('bolt_flip', 8, 6.5, 0.0, 1.5, 380),
    *flip_ring('bolt_flip', 5, 3.0, 0.05, 1.3, 390),
    flip('bolt_flip', 0.0, 0, 0, 1.8, 399, h=1.0, alpha=0.85),
    parts('spark', 0, 40, 9, 1, 0.8, 0.09, 'rim', offset=[0, 0.4, 0], grav=3, tier=0),
    parts('dust', 0, 20, 4, 1, 0.9, 0.22, 'core', offset=[0, 0.2, 0], grav=1),
], PAL[B])
write(f'mon_warn_line__{B}__sweep', warn_strip(1.5, 18, 4), PAL[B])
write(f'mon_boom_line__{B}__sweep', unmul([
    mesh('burst', 0, 0.16, 'rim', 0.4, 0, offset=[0, 0.6, 1.0], scale=1.5, billboard=True, sweep=0),
    decal('bolt_scorch', 0, 1, 2.4, 'body', 1.0, 0.04, top=False, untilDelay=False, strip=[18, 4], lift=LIFT),
    decal('bolt_scorch', 0, 1, 2.4, 'body', 1.0, 0.04, top=False, untilDelay=False, strip=[18, 4], lift=0.36),
    # chuỗi sét zigzag chạy dọc dải (ba biến thể bolt để chập chờn)
    *[mesh(sh, 0.0 + i * 0.015, 0.7, 'rim', 1, 400 + i, offset=[(i - 1) * 0.8, 0.45, 0.3], scale=[1.4, 1.4, 17.5], sweep=0.25, erodeFrom=0.5) for i, sh in enumerate(['bolt', 'bolt_b', 'bolt_c'])],
    *flip_line('bolt_flip', 9, 18, 0.0, 1.2, 410, step=0.02, jitter=1.0),
    parts('spark', 0, 44, 11, 0.3, 0.6, 0.09, 'rim', offset=[0, 0.5, 5], grav=2, tier=0),
    parts('dust', 0.02, 16, 3, 0.7, 0.8, 0.22, 'core', offset=[0, 0.1, 6], grav=1),
], 2.25), PAL[B])

# ================= Địa Mạch Long (thổ/ngọc lam): khe nứt gai đá, địa chấn =================
B = 'boss_dia_mach_long'
cast_ring(B, 14)
write(f'mon_warn_line__{B}__line', warn_strip(2.0, 30, 4, spark=26), PAL[B])
write(f'mon_boom_line__{B}__line', unmul([
    mesh('burst', 0, 0.16, 'rim', 0.36, 0, offset=[0, 0.6, 1.0], scale=1.5, billboard=True, sweep=0),
    decal('jade_crack', 0, 1, 2.6, 'body', 1.0, 0.1, top=False, untilDelay=False, strip=[30, 4], lift=LIFT),
    decal('jade_crack', 0, 1, 2.6, 'body', 1.0, 0.1, top=False, untilDelay=False, strip=[30, 4], lift=0.36),
    rift(30, 1.6, tone='rim', seed=70),  # khe nứt dài, lõi sẫm viền sáng
    *spires(30, 10, 1.9, 1.3, 440, tone='body'),  # gai đá nâu hai bên khe
    *flip_line('earth_flip', 12, 30, 0.0, 1.2, 420, step=0.02, jitter=1.0),
    parts('dust', 0, 44, 4, 0.5, 1.0, 0.3, 'core', offset=[0, 0.2, 8], grav=0.8, tier=0),
    parts('shard', 0.0, 30, 8, 0.5, 0.7, 0.12, 'body', offset=[0, 0.4, 12], grav=8, tier=0),
], 3.75), PAL[B])
write(f'mon_warn__{B}__chant', warn_circle(0.85, 70, -20, spark=26), PAL[B])
write(f'mon_boom_circle__{B}__chant', unmul([
    decal('jade_crack', 0, 4, 2.8, 'body', 1.0, 0.03, top=False, untilDelay=False, lift=LIFT),
    # kích thước/vị trí theo mét thật (unmul): vòng r 14 m; không dùng ripple/burst (tạo mảng trắng phẳng ở vùng lớn)
    *flip_ring('earth_flip', 9, 9.0, 0.0, 1.6, 440),
    *flip_ring('earth_flip', 5, 4.5, 0.05, 1.5, 450),
    parts('dust', 0, 40, 5, 1, 1.0, 0.3, 'core', offset=[0, 0.2, 0], grav=0.8),
    parts('shard', 0, 36, 7, 1, 0.8, 0.12, 'body', offset=[0, 0.3, 0], grav=8, tier=0),
], 3.5), PAL[B])
# ================= Thạch Tâm Khôi Vương (thổ/ngọc lam): hố nứt hình sao, sóng đá =================
B = 'boss_thach_tam_khoi_vuong'
write(f'mon_warn__{B}__leap', warn_circle(1.2, 25, -60), PAL[B])
write(f'mon_boom_circle__{B}__leap', unmul([
    mesh('burst', 0, 0.16, 'rim', 0.4, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('jade_crack', 0, 4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),
    mesh('crack_radial', 0, 1.0, 'rim', 1, 470, offset=[0, 0.3, 0], fit='area', scale=1.0, sweep=0.1, erodeFrom=0.55),  # hố nứt hình sao
    ripple(0, 'rim', 0.9, 2),
    *spires(4, 3, 1.8, 1.1, 480),
    *flip_ring('earth_flip', 6, 2.8, 0.0, 1.5, 460),
    flip('earth_flip', 0.0, 0, 0, 2.0, 469, h=1.1),
    parts('dust', 0, 36, 4, 1, 0.9, 0.28, 'core', offset=[0, 0.2, 0], grav=0.8),
    parts('shard', 0, 46, 9, 1, 0.8, 0.14, 'body', offset=[0, 0.3, 0], grav=10, tier=0),  # đá văng
], 1.125), PAL[B])
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 10, 3), PAL[B])
write(f'mon_boom_line__{B}__line', unmul([
    # sóng đá nâu + khe ngọc lam chạy HẾT chiều dài dải 10×3 m: decal dải hai lớp, khe nứt, hai hàng gai đá dày, đá vụn; KHÔNG có đỏ
    decal('jade_crack', 0, 1, 2.4, 'body', 1.0, 0.05, top=False, untilDelay=False, strip=[10, 3], lift=LIFT),
    decal('jade_crack', 0, 1, 2.4, 'body', 1.0, 0.05, top=False, untilDelay=False, strip=[10, 3], lift=0.36),
    rift(10, 1.0, tone='rim', seed=80),
    *spires(10, 7, 1.45, 1.2, 490),
    *[mesh('rock_spire', 0.0 + i * 0.02, 0.9, 'body', 1, 520 + i, offset=[0, 0, 1.0 + i * 1.5], scale=0.8, sweep=0.2, erodeFrom=0.6) for i in range(6)],  # gai giữa dải
    parts('dust', 0, 30, 4, 0.5, 0.9, 0.26, 'core', offset=[0, 0.2, 4], grav=0.8, tier=0),
    parts('shard', 0.0, 34, 8, 0.5, 0.7, 0.12, 'body', offset=[0, 0.4, 5], grav=8, tier=0),
], 1.25), PAL[B])
# ================= Thôn Mạch Ngô Công Vương (mộc/độc): gai rễ gỗ, bào tử xanh lục =================
B = 'boss_thon_mach_ngo_cong_vuong'
cast_ring(B, 12)
write(f'mon_warn__{B}__slam', warn_circle(1.7, 35, -50), PAL[B])
write(f'mon_boom_circle__{B}__slam', [
    mesh('burst', 0, 0.16, 'rim', 0.34, 0, offset=[0, 0.5, 0], scale=1.5, billboard=True, sweep=0),
    decal('root_mat', 0, 4, 2.4, 'body', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'rim', 0.9, 2),
    *flip_ring('root_flip', 7, 2.8, 0.0, 1.8, 500),
    flip('root_flip', 0.0, 0, 0, 2.2, 509, h=1.1),
    parts('dust', 0, 28, 3, 0.9, 1.0, 0.22, 'body', offset=[0, 0.2, 0], grav=0.5),
    parts('spark', 0, 22, 4, 0.9, 0.9, 0.08, 'rim', offset=[0, 0.3, 0], grav=-0.5, tier=0),
], PAL[B])
write(f'mon_warn__{B}__chant', warn_circle(0.85, 70, -20, spark=24), PAL[B])
write(f'mon_boom_circle__{B}__chant', [
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.7, 0], scale=1.4, billboard=True, sweep=0),
    decal('root_mat', 0, 4, 2.8, 'body', 1.0, 0.03, top=False, untilDelay=False, lift=LIFT),
    ripple(0, 'rim', 0.9, 2),
    *flip_ring('root_flip', 9, 7.0, 0.0, 2.2, 520),
    *flip_ring('root_flip', 5, 3.2, 0.05, 1.9, 530),
    parts('dust', 0, 34, 4, 1, 1.0, 0.26, 'body', offset=[0, 0.2, 0], grav=0.5),
    parts('spark', 0, 30, 5, 1, 0.9, 0.08, 'rim', offset=[0, 0.3, 0], grav=-0.4, tier=0),
], PAL[B])
# ---- Chui đất / trồi lên (burrow, emerge; pha 65% máu): vạch tròn r4 báo 2,0 s (chỗ boss chui xuống, n=3 vạch), rồi quạt r14 nửa góc 35° báo 1,5 s ----
write(f'mon_warn__{B}__burrow', warn_circle(2.0, 20, -65, spark=18), PAL[B])
write(f'mon_boom_circle__{B}__burrow', [
    mesh('burst', 0, 0.16, 'rim', 0.3, 0, offset=[0, 0.4, 0], scale=1.3, billboard=True, sweep=0),
    decal('root_mat', 0, 4, 2.4, 'core', 1.0, 0.02, top=False, untilDelay=False, lift=LIFT),  # hố đất tối, rễ lồi quanh miệng hố
    ripple(0, 'body', 0.85, 3),
    *flip_ring('root_flip', 6, 2.4, 0.0, 1.7, 560),
    *ring_mesh('spike', 8, 2.6, 570, 0.55, tone='body'),  # vòng gai rễ gỗ nhô quanh miệng hố
    parts('dust', 0, 36, 4.5, 0.9, 1.1, 0.26, 'body', offset=[0, 0.2, 0], grav=1.2),  # đất bắn tung
    parts('spark', 0, 18, 4, 0.9, 0.9, 0.08, 'rim', offset=[0, 0.3, 0], grav=-0.4, tier=0),  # bào tử xanh lục
], PAL[B])
write(f'mon_warn_cone__{B}__emerge', warn_fan(1.5, 35), PAL[B])
write(f'mon_boom_cone__{B}__emerge', [
    mesh('burst', 0, 0.16, 'rim', 0.32, 0, offset=[0, 0.6, 0.8], scale=1.5, billboard=True, sweep=0),
    decal('root_mat', 0, 8, 2.4, 'body', 1.0, 0.03, top=False, untilDelay=False, sector=35, lift=LIFT),
    *unmul([
        *[flip('root_flip', i * 0.03, math.sin(math.radians((i % 3 - 1) * 14)) * (2.2 + i * 1.55), math.cos(math.radians((i % 3 - 1) * 14)) * (2.2 + i * 1.55), 1.8 + (i % 3) * 0.2, 580 + i, tier=0 if i % 2 == 0 else 1) for i in range(8)],
        *[mesh('spike', 0.02 + i * 0.03, 0.9, 'body', 1, 600 + i, offset=[round(math.sin(math.radians((i % 3 - 1) * 12)) * (3 + i * 1.5), 0, 2), 0, 0][:3] if False else [round(math.sin(math.radians((i % 3 - 1) * 12)) * (3 + i * 1.5), 2), 0, round(math.cos(math.radians((i % 3 - 1) * 12)) * (3 + i * 1.5), 2)], rot=[-90, 0, 0], scale=0.8, sweep=0.2, erodeFrom=0.6, tier=0 if i % 2 == 0 else 1) for i in range(7)],  # gai rễ trồi theo quạt
        parts('dust', 0, 32, 6, 0.5, 1.0, 0.26, 'body', offset=[0, 0.3, 3], grav=1.0),
        parts('spark', 0.02, 24, 5, 0.5, 0.9, 0.08, 'rim', offset=[0, 0.5, 4], grav=-0.4, tier=0),
    ], 1.75),
], PAL[B])
print('ok')
