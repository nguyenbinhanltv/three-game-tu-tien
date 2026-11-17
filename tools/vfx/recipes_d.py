# VFX-V4: Pháp tướng (hư ảnh khổng lồ bán trong suốt) cho chiêu tối thượng mỗi nhánh. Nạp từ gen-fx-kiem.py SAU recipes_b/c:
# bọc công thức sẵn có của chiêu, thêm sự kiện pháp tướng + kéo camera ra xa nhẹ. Hiện (mọc) 0,3 s, giữ, tan (dissolve) ở 72% vòng đời.
import math


def register(R, H):
    mesh, parts, flash = H['mesh'], H['parts'], H['flash']
    ALPHA = 0.62

    def camera(t, pull, dur):
        return {'type': 'camera', 't': t, 'pull': pull, 'dur': dur}

    def wing(side, n, t0, tone_a, tone_b, pivot, scale=1.0, tier=0):
        """Một cánh: n lông (kite) xòe quạt trong mặt phẳng đứng; lông trên dài, mỏng dần xuống."""
        out = []
        for i in range(n):
            phi = -25 + i * (110 / (n - 1))
            ln = (1.5 + 1.6 * math.sin(math.radians(min(phi + 25, 135) * 0.9))) * scale
            out.append(mesh('kite', round(t0 + 0.03 * i, 3), 2.3, at='self', offset=[pivot[0], pivot[1], pivot[2]], rot=[-round(phi), 90 * side, 0],
                            scale=[2.6 * scale, 0.5 * scale, round(ln, 2)], sweep=0.3, erodeFrom=0.72, alpha=ALPHA + 0.15, tone=tone_a if i % 2 == 0 else tone_b,
                            seed=900 + i + (20 if side < 0 else 0), tier=tier if i % 2 == 0 else max(tier, 1)))
        return out

    def dragon_events():
        return [
            mesh('dragon', -0.3, 2.7, at='self', offset=[0, -1.15, 0], scale=1.0, sweep=0.35, erodeFrom=0.72, alpha=ALPHA + 0.1, tone='body', seed=950, tier=0),
            mesh('kite', 0.3, 2.2, at='self', offset=[0, 5.85, -2.1], rot=[-10, 0, 0], scale=[1.5, 1.2, 3.0], sweep=0.3, erodeFrom=0.72, alpha=ALPHA + 0.2, tone='rim', seed=951, tier=0),
            mesh('kite', 0.35, 2.1, at='self', offset=[0.5, 6.6, -2.4], rot=[-35, 25, 0], scale=[0.3, 0.3, 1.8], sweep=0.3, erodeFrom=0.72, alpha=ALPHA, tone='accent', seed=952, tier=1),
            mesh('kite', 0.35, 2.1, at='self', offset=[-0.5, 6.6, -2.4], rot=[-35, -25, 0], scale=[0.3, 0.3, 1.8], sweep=0.3, erodeFrom=0.72, alpha=ALPHA, tone='accent', seed=953, tier=1),
            mesh('ripple', -0.2, 2.6, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.6, sweep=0.4, erodeFrom=0.7, ragged=0.5, tone='body', alpha=0.8, seed=954, tier=0),
            parts('spark', 0.2, 50, 3.0, 1, 1.6, 0.08, at='self', offset=[0, 2, 0], grav=-0.6, tone='rim', tier=1),
            camera(-0.2, 0.2, 2.6),
        ]

    def arhat_events():
        z = 16.0
        S = 1.3
        out = [
            mesh('statue', -0.3, 2.7, at='self', offset=[0, -1.15, z], rot=[0, 180, 0], scale=1.7 * S, sweep=0.35, erodeFrom=0.72, alpha=ALPHA, tone='body', seed=960, tier=0),
            mesh('ripple', 0.0, 2.4, at='self', offset=[0, 5.2 * S, z + 1.5], rot=[90, 0, 0], scale=3.4 * S, sweep=0.4, erodeFrom=0.72, ragged=0.3, tone='accent', alpha=0.9, seed=961, tier=0),
            mesh('ripple', 0.1, 2.3, at='self', offset=[0, 5.2 * S, z + 1.6], rot=[90, 0, 0], scale=2.4 * S, sweep=0.4, erodeFrom=0.72, ragged=0.2, tone='rim', alpha=0.8, seed=962, tier=1),
            mesh('ripple', -0.2, 2.6, at='self', offset=[0, -1.1, z], scale=0.3, scaleTo=4.4, sweep=0.4, erodeFrom=0.7, ragged=0.5, tone='accent', alpha=0.85, seed=963, tier=0),
            camera(-0.2, 0.2, 2.6),
        ]
        # Hai tay chắp ấn: từ vai chéo vào giữa ngực, bàn tay (kite dựng đứng) chắp trước ngực.
        for side in (1, -1):
            out.append(mesh('kite', 0.05, 2.4, at='self', offset=[round(2.4 * S * side, 2), 3.4 * S, z], rot=[18, -90 * side, 0], scale=[5.0, 2.8, 3.3], sweep=0.3, erodeFrom=0.72,
                            alpha=ALPHA + 0.15, tone='body', seed=964 + side, tier=0))
        out.append(mesh('kite', 0.1, 2.3, at='self', offset=[0, 2.4 * S, z - 0.8], rot=[-90, 0, 0], scale=[3.8, 3.3, 2.6], sweep=0.3, erodeFrom=0.72, alpha=ALPHA + 0.2, tone='accent', seed=966, tier=0))
        out.append(mesh('ripple', 0.0, 2.3, at='self', offset=[0, -0.5, z], scale=0.3, scaleTo=2.6, sweep=0.4, erodeFrom=0.72, tone='rim', alpha=0.8, seed=967, tier=1))
        for i in range(12):
            phi = i * 30
            out.append(mesh('spike', round(0.1 + 0.02 * i, 3), 2.2, at='self', offset=[0, 5.2 * S, z + 1.7], rot=[-phi, 90, 0], scale=[0.45, 0.45, round(1.3 + 0.5 * (i % 2), 2)],
                            sweep=0.3, erodeFrom=0.72, alpha=0.85, tone='accent', seed=970 + i, tier=0 if i % 2 == 0 else 1))
        return out

    def phoenix_events():
        z = 16.0
        pv = [0, 5.5, z]
        out = [
            mesh('kite', -0.3, 2.6, at='self', offset=[0, 5.5, z], rot=[-90, 0, 0], scale=[7.0, 5.0, 5.5], sweep=0.35, erodeFrom=0.72, alpha=ALPHA + 0.15, tone='body', seed=980, tier=0),
            mesh('kite', 0.0, 2.4, at='self', offset=[0, 10.6, z - 0.5], rot=[-20, 180, 0], scale=[3.6, 3.0, 2.8], sweep=0.3, erodeFrom=0.72, alpha=ALPHA + 0.2, tone='accent', seed=981, tier=0),
            *wing(1, 8, -0.1, 'body', 'accent', pv, 3.0, 0),
            *wing(-1, 8, -0.1, 'body', 'accent', pv, 3.0, 0),
            *[mesh('kite', round(0.1 + 0.04 * i, 3), 2.3, at='self', offset=[0, 4.2, z], rot=[round(60 + i * 18), 0, 0], scale=[3.0, 1.2, round(5.6 - 0.4 * i, 2)], sweep=0.3, erodeFrom=0.72,
                      alpha=ALPHA, tone='accent' if i % 2 else 'rim', seed=990 + i, tier=1) for i in range(5)],
            mesh('ripple', -0.2, 2.6, at='self', offset=[0, -1.1, z], scale=0.3, scaleTo=4.4, sweep=0.4, erodeFrom=0.7, ragged=0.5, tone='body', alpha=0.85, seed=985, tier=0),
            parts('petal', 0.1, 50, 1.6, 0.8, 2.2, 0.1, at='self', offset=[0, 3.5, z], grav=-0.6, tone='rim', tier=0),
            camera(-0.2, 0.2, 2.6),
        ]
        return out

    for skill, extra in (('skl_van_kiem_quy_tong', dragon_events), ('skl_kim_cuong_bat_hoai', arhat_events), ('skl_hoi_thien_dan_lo', phoenix_events)):
        base = R[skill]

        def wrapped(base=base, extra=extra):
            tl = base()
            tl['events'] = tl['events'] + extra()
            return tl

        R[skill] = wrapped
