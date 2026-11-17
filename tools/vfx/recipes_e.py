# VFX-V4 phần 2: đột phá cảnh giới, độ kiếp (khởi vòng trận), di chuyển (ngự kiếm, xuất khiếu, thuấn di). Chỉ thêm lớp hình
# (timeline kích hoạt theo S.FX, id giả `fx_*`), không đổi luật. Nạp từ gen-fx-kiem.py sau recipes_d.


def register(R, H):
    mesh, parts, decal, flash, shake, ring_spikes = H['mesh'], H['parts'], H['decal'], H['flash'], H['shake'], H['ring_spikes']

    def cam(t, pull, dur):
        return {'type': 'camera', 't': t, 'pull': pull, 'dur': dur}

    def bolt(t, at, off, scale, tone, seed, tier=0):
        return {'type': 'bolt', 't': t, 'at': at, 'offset': off, 'scale': scale, 'tone': tone, 'seed': seed, 'tier': tier}

    # ---------- Đột phá cảnh giới ----------
    def dotpha(tid, pal, when, r, col_h, halo):
        def make():
            ev = [
                decal('rune', -0.2, r, 3.2, at='self', offset=[0, -1.15, 0], grow=0.5, tone='core', alpha=0.95, tier=0),
                decal('rune', -0.1, r * 0.7, 3.0, at='self', offset=[0, -1.15, 0], grow=0.6, tone='body', alpha=0.6, yaw=17, tier=1),
                mesh('ripple', 0.0, 1.3, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=r * 0.75, sweep=0.4, erodeFrom=0.45, ragged=0.5, tone='core', alpha=0.9, seed=2, tier=0),
                mesh('ripple', 0.12, 1.1, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=r * 0.55, sweep=0.4, erodeFrom=0.45, tone='rim', alpha=0.75, seed=3, tier=1),
                # Cột sáng có lõi sẫm: hai dải xoắn ngược chiều (lõi sẫm + thân sáng) dựng quanh người.
                mesh('helix', 0.0, 2.8, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, col_h], sweep=0.3, erodeFrom=0.6, spin=260, follow=True, tone='core', alpha=0.9, seed=4, tier=0),
                mesh('helix', 0.05, 2.7, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[2.2, 2.2, col_h * 0.85], sweep=0.3, erodeFrom=0.6, spin=-200, follow=True, tone='body', alpha=0.85, seed=5, tier=0),
                mesh('helix', 0.1, 2.5, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[3.0, 3.0, col_h * 0.6], sweep=0.3, erodeFrom=0.6, spin=140, follow=True, tone='rim', alpha=0.6, seed=6, tier=1),
                mesh('burst', 0.0, 0.11, at='self', scale=2.2, billboard=True, sweep=0.0, tone='rim', tier=0),
                *ring_spikes(8, r * 0.28, 0.0, 'self', 0.6, 1.6, tier=1, y=-1.15, tilt=-12, stagger=0.04),
                parts('spark', 0.0, 80, 3.2, 1, 2.2, 0.08, at='self', offset=[0, -0.5, 0], grav=-2.2, tone='accent', tier=0),
                parts('spark', 0.1, 50, 1.8, 1, 2.4, 0.07, at='self', offset=[0, -0.5, 0], grav=-3.0, tone='rim', tier=1),
                flash(0.0, 0.1, tier=1),
                shake(0.0, 0.2, tier=1),
                cam(-0.1, 0.1, 2.4),
            ]
            if halo:
                ev += [mesh('ripple', 0.2, 2.4, at='self', offset=[0, 4.5, -0.5], rot=[90, 0, 0], scale=halo, sweep=0.4, erodeFrom=0.7, ragged=0.2, tone='accent', alpha=0.85, seed=7, tier=0),
                       mesh('ripple', 0.3, 2.3, at='self', offset=[0, 4.5, -0.6], rot=[90, 0, 0], scale=halo * 0.7, sweep=0.4, erodeFrom=0.7, ragged=0.2, tone='rim', alpha=0.8, seed=8, tier=1)]
            tl = {'skill': tid, 'trigger': 'fx', 'fxKind': 'ascend', 'palette': pal, 'replaces': ['ascend'], 'events': ev}
            if when:
                tl['when'] = when
            return tl
        return make

    R['fx_dotpha_tc'] = dotpha('fx_dotpha_tc', 'dotpha_tc', None, 7.0, 14.0, 0)
    R['fx_dotpha_kd'] = dotpha('fx_dotpha_kd', 'dotpha_kd', 'ket_dan', 9.0, 18.0, 3.2)
    R['fx_dotpha_na'] = dotpha('fx_dotpha_na', 'dotpha_na', 'nguyen_anh', 11.0, 22.0, 4.4)

    # ---------- Độ kiếp: khởi vòng trận lôi văn + sét mảnh nối tiếp (mây kiếp cũ giữ nguyên) ----------
    def kiep(tid, pal, when, r, nbolt):
        def make():
            ev = [
                decal('rune', -0.3, r, 6.0, at='self', offset=[0, -1.15, 0], grow=0.6, tone='core', alpha=0.95, tier=0),
                decal('crack', 0.0, r * 0.85, 5.5, at='self', offset=[0, -1.15, 0], grow=0.4, tone='body', alpha=0.9, tier=0),
                decal('rune', 0.1, r * 0.55, 5.0, at='self', offset=[0, -1.15, 0], grow=0.5, tone='accent', alpha=0.55, yaw=23, tier=1),
                mesh('ripple', 0.0, 1.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=r * 0.85, sweep=0.4, erodeFrom=0.4, ragged=0.6, tone='core', alpha=0.9, seed=2, tier=0),
                mesh('ripple', 0.1, 1.2, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=r * 0.6, sweep=0.4, erodeFrom=0.4, tone='rim', alpha=0.7, seed=3, tier=1),
                *ring_spikes(10, r * 0.55, 0.05, 'self', 0.7, 1.8, tier=1, y=-1.15, tilt=18, stagger=0.05),
                mesh('burst', 0.0, 0.11, at='self', scale=1.6, billboard=True, sweep=0.0, tone='body', alpha=0.8, tier=0),
                parts('spark', 0.0, 60, 4.0, 1, 1.6, 0.07, at='self', offset=[0, -0.5, 0], grav=-1.2, tone='accent', tier=0),
                shake(0.0, 0.18, tier=1),
                cam(-0.1, 0.1, 3.0),
            ]
            offs = [[r * 0.55, 0, 0], [-r * 0.5, 0, r * 0.2], [0, 0, r * 0.6], [r * 0.2, 0, -r * 0.5]]
            for i in range(nbolt):
                ev.append(bolt(round(0.15 + 0.2 * i, 3), 'ground', [round(v, 2) for v in offs[i]], 1.0, 'rim' if i % 2 else 'body', 30 + i, 0 if i < 2 else 1))
            tl = {'skill': tid, 'trigger': 'fx', 'fxKind': 'tribstart', 'palette': pal, 'events': ev}
            if when:
                tl['when'] = when
            return tl
        return make

    R['fx_kiep_tc'] = kiep('fx_kiep_tc', 'loi', None, 8.0, 3)
    R['fx_kiep_kd'] = kiep('fx_kiep_kd', 'dotpha_kd', 'ket_dan', 9.0, 4)
    R['fx_kiep_na'] = kiep('fx_kiep_na', 'dotpha_na', 'nguyen_anh', 11.0, 4)

    # ---------- Nguyên anh xuất khiếu / nhập thể ----------
    R['fx_soul_out'] = lambda: {
        'skill': 'fx_soul_out', 'trigger': 'fx', 'fxKind': 'soul_out', 'palette': 'dotpha_na',
        'events': [
            decal('rune', -0.2, 3.2, 2.2, at='self', offset=[0, -1.15, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
            mesh('ripple', 0.0, 0.9, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.6, sweep=0.4, erodeFrom=0.45, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('kite', 0.0, 1.1, at='self', offset=[0, 0.3, 0], rot=[-90, 0, 0], scale=[0.7, 0.5, 1.9], sweep=0.3, erodeFrom=0.55, tone='rim', alpha=0.8,
                 move={'to': 'self', 'offset': [0, 3.4, 0], 'ease': 'out'}, keepUp=True, seed=3, tier=0),
            mesh('helix', 0.0, 1.0, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.4, 1.4, 4.5], sweep=0.3, erodeFrom=0.55, spin=300, tone='body', alpha=0.8, seed=4, tier=1),
            mesh('burst', 0.0, 0.1, at='self', scale=1.4, billboard=True, sweep=0.0, tone='accent', tier=0),
            parts('spark', 0.0, 36, 2.4, 1, 1.4, 0.07, at='self', offset=[0, 0.4, 0], grav=-1.8, tone='rim', tier=0),
        ],
    }
    R['fx_soul_in'] = lambda: {
        'skill': 'fx_soul_in', 'trigger': 'fx', 'fxKind': 'soul_in', 'palette': 'dotpha_na',
        'events': [
            parts('spark', -0.4, 40, 3.0, 1, 0.45, 0.07, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=0),
            mesh('ripple', -0.1, 0.6, at='self', offset=[0, -1.1, 0], scale=2.6, scaleTo=0.4, sweep=0.1, erodeFrom=0.55, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('burst', 0.1, 0.1, at='self', scale=1.4, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('ripple', 0.12, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.0, sweep=0.4, erodeFrom=0.4, tone='core', alpha=0.85, seed=3, tier=1),
        ],
    }

    # ---------- Thuấn di (nguyên anh): vệt xé không gian đổ về chỗ đến ----------
    R['fx_blink'] = lambda: {
        'skill': 'fx_blink', 'trigger': 'fx', 'fxKind': 'blink', 'palette': 'than_hanh',
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=2.0, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('crescent', 0.0, 0.3, at='self', offset=[0, 0, -0.6], rot=[0, 0, 90], scale=2.6, scaleTo=4.0, sweep=0.4, erodeFrom=0.4, ragged=0.6, tone='body', seed=2, tier=0),
            mesh('crescent', 0.04, 0.26, at='self', offset=[0, 0, -1.4], rot=[0, 0, 90], scale=1.2, scaleTo=2.0, sweep=0.4, erodeFrom=0.4, ragged=0.7, tone='core', alpha=0.85, seed=3, tier=1),
            mesh('helix', 0.0, 0.35, at='self', offset=[0, 0, -5.0], scale=[1.2, 1.2, 8.0], sweep=0.2, erodeFrom=0.3, spin=700, tone='accent', alpha=0.85, seed=4, tier=0),
            mesh('ripple', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.4, sweep=0.4, erodeFrom=0.4, tone='body', seed=5, tier=0),
            *ring_spikes(6, 1.6, 0.04, 'self', 0.8, 0.7, tier=1, y=-1.15, tilt=20),
            parts('spark', 0.0, 40, 8, 0.5, 0.4, 0.06, at='self', back=True, tone='rim', tier=0),
            shake(0.0, 0.14, tier=1),
        ],
    }

    # ---------- Ngự kiếm: vòng ấn dưới chân, kiếm hóa quang đỡ lên ----------
    R['fx_fly_on'] = lambda: {
        'skill': 'fx_fly_on', 'palette': 'than_hanh',
        'events': [
            decal('rune', -0.1, 3.8, 1.6, at='self', offset=[0, -1.15, 0], grow=0.25, tone='core', alpha=0.95, tier=0),
            mesh('ripple', 0.0, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.6, sweep=0.4, erodeFrom=0.4, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('kite', 0.0, 0.8, at='self', offset=[0, -1.0, 0], scale=[1.0, 1.0, 3.6], sweep=0.2, erodeFrom=0.55, tone='rim', alpha=0.85, seed=3, tier=0),
            mesh('helix', 0.0, 0.8, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[2.6, 2.6, 4.0], sweep=0.3, erodeFrom=0.5, spin=360, tone='accent', alpha=0.8, seed=4, tier=1),
            mesh('burst', 0.0, 0.1, at='self', offset=[0, -0.9, 0], scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0),
            parts('spark', 0.0, 26, 2.2, 1, 0.8, 0.06, at='self', offset=[0, -1.0, 0], grav=-1.0, tone='rim', tier=0),
        ],
    }
