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
            phi = -35 + i * (95 / (n - 1))
            ln = (1.5 + 1.6 * math.sin(math.radians(min(phi + 25, 135) * 0.9))) * scale
            out.append(mesh('kite', round(t0 + 0.03 * i, 3), 2.3, at='self', offset=[pivot[0], pivot[1], pivot[2]], rot=[-round(phi), 90 * side, 0],
                            scale=[1.1 * scale, 0.25 * scale, round(ln * 1.4, 2)], sweep=0.3, erodeFrom=0.72, alpha=0.92, tone=tone_a if i % 2 == 0 else tone_b,
                            seed=900 + i + (20 if side < 0 else 0), tier=tier if i % 2 == 0 else max(tier, 1)))
        return out

    def dragon_events():
        return [
            # Rồng quấn quanh người (cao ~11 m ≈ 6 lần người), đầu/sừng/râu/vây dựng sẵn trong hình.
            mesh('dragon', -0.3, 1.6, at='self', offset=[0, -1.15, 0], scale=1.0, sweep=0.3, erodeFrom=0.62, alpha=0.88, tone='body', seed=950, tier=0),
            mesh('dragon', -0.25, 1.5, at='self', offset=[0, -1.15, 0], rot=[0, 180, 0], scale=0.78, sweep=0.35, erodeFrom=0.62, alpha=0.7, tone='rim', seed=951, tier=2),
            # Rồng lao xuống mục tiêu.
            mesh('dragon', 0.35, 1.0, at='area', offset=[0, 9, 0], scale=0.9, sweep=0.2, erodeFrom=0.7, alpha=0.9, tone='body', keepUp=True,
                 move={'to': 'area', 'offset': [0, -1.0, 0], 'ease': 'in'}, seed=952, tier=0),
            mesh('ripple', 0.9, 0.7, at='area', scale=0.2, scaleTo=0.7, fit='area', sweep=0.4, erodeFrom=0.45, ragged=0.5, tone='accent', alpha=0.9, seed=953, tier=0),
            mesh('burst', 0.95, 0.11, at='area', offset=[0, 1.2, 0], scale=3.0, billboard=True, sweep=0.0, tone='accent', tier=0),
            parts('spark', 0.2, 60, 3.4, 1, 1.6, 0.09, at='self', offset=[0, 3, 0], grav=-0.6, tone='accent', tier=1),
            camera(-0.2, 0.12, 2.4),
        ]

    def arhat_events():
        # Thẻ 2D La Hán ngồi kiết già + hào quang (cards.ts), cao ~6,5 m (~3,7 lần người), canh giữa người từ camera sau lưng, dissolve vào/ra.
        h, d = 6.5, 6.5
        return [
            mesh('card', -0.3, 2.7, card='arhat', at='self', offset=[0, h / 2 - 1.15 + 0.4, d], billboard=True, scale=[round(h * 512 / 768 / 2, 2), h / 2, 1], sweep=0.3, erodeFrom=0.72,
                 alpha=0.92, tone='body', seed=960, tier=0),
            mesh('ripple', -0.2, 2.6, at='self', offset=[0, -1.1, d], scale=0.3, scaleTo=3.6, sweep=0.4, erodeFrom=0.7, ragged=0.5, tone='accent', alpha=0.85, seed=963, tier=0),
            parts('spark', 0.0, 70, 2.0, 1, 2.2, 0.09, at='self', offset=[0, h / 2, d], grav=-0.5, tone='accent', tier=0),
            parts('spark', 0.1, 40, 1.4, 1, 2.0, 0.07, at='self', offset=[0, h / 2, d], grav=-0.3, tone='rim', tier=1),
            camera(-0.2, 0.12, 2.6),
        ]

    def phoenix_events():
        # Thẻ 2D Phượng hoàng dang cánh (cánh + đuôi cinnabar/ngọc), rộng ~9,5 m, canh giữa người, dissolve vào/ra, lông vũ rơi.
        w, hh, d = 9.5, 7.9, 6.5
        return [
            mesh('card', -0.3, 2.7, card='phoenix', at='self', offset=[0, hh / 2 - 1.15 + 0.4, d], billboard=True, scale=[w / 2, hh / 2, 1], sweep=0.3, erodeFrom=0.72,
                 alpha=0.92, tone='body', seed=980, tier=0),
            mesh('ripple', -0.2, 2.6, at='self', offset=[0, -1.1, d], scale=0.3, scaleTo=3.6, sweep=0.4, erodeFrom=0.7, ragged=0.5, tone='body', alpha=0.85, seed=985, tier=0),
            parts('petal', 0.0, 70, 1.8, 1, 2.4, 0.11, at='self', offset=[0, hh / 2, d], grav=0.9, tone='accent', tier=0),
            parts('petal', 0.1, 50, 1.6, 1, 2.2, 0.1, at='self', offset=[0, hh / 2, d], grav=0.8, tone='body', tier=1),
            camera(-0.2, 0.12, 2.6),
        ]

    for skill, extra in (('skl_van_kiem_quy_tong', dragon_events), ('skl_kim_cuong_bat_hoai', arhat_events), ('skl_hoi_thien_dan_lo', phoenix_events)):
        base = R[skill]

        def wrapped(base=base, extra=extra):
            tl = base()
            tl['events'] = tl['events'] + extra()
            return tl

        R[skill] = wrapped
