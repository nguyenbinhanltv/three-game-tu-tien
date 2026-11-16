# Một lần (E2-A): thêm chuỗi i18n, glossary, địa điểm và quái tạm cho Đoạn Mạch Cổ Cốc. Idempotent theo khóa.
# E2-B sẽ thay các mục quái/loot tạm (monsters.json, loot.json) bằng bản đầy đủ có AI riêng.
import json
import re

ROOT = __file__.replace('\\', '/').rsplit('/tools/maps/', 1)[0] + '/packages/content/data/'


def rd(p):
    return open(ROOT + p, encoding='utf-8').read()


def wr(p, s):
    open(ROOT + p, 'w', encoding='utf-8', newline='').write(s)


def q(x):
    return json.dumps(x, ensure_ascii=False)


mons = '''  { "id": "mon_thach_giap_te", "elem": "tho", "model": "boar", "scale": 1.6, "color": "#a8763e", "accent": "#e6ddcb", "hpMul": 1.4, "atkMul": 1.2, "speed": 4.8, "aggro": 12, "attackRange": 2.8, "attackCd": 2.4, "xpMul": 1.2 },
  { "id": "mon_khai_mach_khoi_loi", "elem": "tho", "model": "ape", "scale": 1.4, "color": "#8a4b2a", "accent": "#5fe0d0", "hpMul": 1.3, "atkMul": 1.3, "speed": 4.6, "aggro": 12, "attackRange": 3.0, "attackCd": 2.4, "xpMul": 1.2 },
  { "id": "mon_ngo_cong_au", "elem": "moc", "model": "serpent", "scale": 1.2, "color": "#6f7a3c", "accent": "#c8d98a", "hpMul": 1.1, "atkMul": 1.5, "speed": 5.4, "aggro": 14, "attackRange": 2.6, "attackCd": 2.0, "xpMul": 1.2,
    "ai": { "caster": { "range": 9, "cast": 0.9, "delay": 1.2, "cd": 5, "mul": 1.3, "shape": "cone", "r": 9, "w": 30, "kind": "spirit" } } },
  { "id": "mon_mach_thuong_ho_ve", "elem": "kim", "model": "ape", "scale": 1.5, "color": "#6d6a60", "accent": "#d9c27a", "hpMul": 1.5, "atkMul": 1.4, "speed": 5.0, "aggro": 12, "attackRange": 3.0, "attackCd": 2.4, "xpMul": 1.3,
    "ai": { "combo": { "chance": 0.4, "delay": 0.6, "mul": 1.5 } } },
  { "id": "elite_liet_cot_bao", "elem": "kim", "model": "wolf", "scale": 1.8, "color": "#c9bfa8", "accent": "#e0b84a", "hpMul": 5.5, "atkMul": 2.3, "speed": 6.4, "aggro": 14, "attackRange": 3.0, "attackCd": 2.2, "xpMul": 4, "elite": true,
    "ai": { "combo": { "chance": 0.5, "delay": 0.6, "mul": 1.6 }, "caster": { "range": 10, "cast": 0.8, "delay": 1.2, "cd": 7, "mul": 1.5, "shape": "cone", "r": 10, "w": 50, "kind": "spirit" } } },
  { "id": "elite_ho_mach_khoi_tuong", "elem": "tho", "model": "ape", "scale": 2.2, "color": "#7a4a2c", "accent": "#5fe0d0", "hpMul": 7.0, "atkMul": 2.2, "speed": 4.6, "aggro": 14, "attackRange": 3.4, "attackCd": 2.6, "xpMul": 4, "elite": true,
    "ai": { "caster": { "range": 6, "cast": 1.1, "delay": 1.4, "cd": 8, "mul": 1.6, "shape": "cone", "r": 6, "w": 70, "kind": "spirit" } } },
  { "id": "elite_xich_sa_ngo_cong", "elem": "moc", "model": "serpent", "scale": 2.0, "color": "#a8452a", "accent": "#e6c06a", "hpMul": 6.0, "atkMul": 2.4, "speed": 5.6, "aggro": 14, "attackRange": 3.0, "attackCd": 2.2, "xpMul": 4, "elite": true,
    "ai": { "caster": { "range": 12, "cast": 1.0, "delay": 1.3, "cd": 6, "mul": 1.5, "shape": "cone", "r": 12, "w": 30, "kind": "spirit" } } },
  { "id": "boss_dia_mach_long", "elem": "tho", "model": "serpent", "scale": 3.2, "color": "#8a5a34", "accent": "#5fe0d0", "hpMul": 90, "atkMul": 1.35, "speed": 4.6, "aggro": 34, "attackRange": 7.0, "attackCd": 2.4, "xpMul": 30, "boss": true,
    "ai": { "slam": { "cd": 8, "r": 5.5, "delay": 1.7, "mul": 1.5, "max": 4, "kind": "spirit" } },
    "posture": { "k": 2, "heavy": 0.03, "interrupt": 0.35, "wait": 3, "decay": 0.06, "brk": 4 } },
'''

s = rd('monsters.json')
if 'mon_thach_giap_te' not in s:
    i = s.rindex('  { "id": "mon_tam_ma"')
    wr('monsters.json', s[:i] + mons + s[i:])


def loot_c(lo, hi, e, gem):
    return (
        f'  "{e}": {{ "gold": [{lo}, {hi}], "src": "common",\n'
        '    "drops": [ {"item": "itm_bi_tich_tan_quyen", "chance": 0.03, "min": 1, "max": 1}, {"item": "itm_yeu_dan", "chance": 0.3, "min": 1, "max": 1}, '
        f'{{"item": "itm_thiet_tinh", "chance": 0.2, "min": 1, "max": 1}}, {{"item": "{gem}", "chance": 0.03, "min": 1, "max": 1}} ],\n'
        '    "equip": [ {"chance": 0.06, "q": [50, 50, 0, 0, 0]} ] },\n'
    )


def loot_e(e, gem):
    return (
        f'  "{e}": {{ "gold": [90, 140], "src": "elite",\n'
        '    "drops": [ {"item": "itm_bi_tich_tan_quyen", "chance": 0.3, "min": 1, "max": 1}, {"item": "itm_yeu_dan", "chance": 1, "min": 2, "max": 3}, '
        f'{{"item": "itm_thiet_tinh", "chance": 0.6, "min": 1, "max": 2}}, {{"item": "{gem}", "chance": 0.3, "min": 1, "max": 1}}, {{"item": "itm_tay_luyen_thach", "chance": 0.25, "min": 1, "max": 1}} ],\n'
        '    "equip": [ {"chance": 1, "q": [0, 20, 60, 20, 0]}, {"chance": 0.5, "q": [20, 60, 20, 0, 0]} ] },\n'
    )


loot = (
    loot_c(14, 26, 'mon_thach_giap_te', 'gem_tho_1')
    + loot_c(14, 26, 'mon_khai_mach_khoi_loi', 'gem_tho_1')
    + loot_c(14, 26, 'mon_ngo_cong_au', 'gem_moc_1')
    + loot_c(16, 30, 'mon_mach_thuong_ho_ve', 'gem_kim_1')
    + loot_e('elite_liet_cot_bao', 'gem_kim_1')
    + loot_e('elite_ho_mach_khoi_tuong', 'gem_tho_1')
    + loot_e('elite_xich_sa_ngo_cong', 'gem_moc_1')
    + '  "boss_dia_mach_long": { "gold": [600, 900], "src": "boss",\n'
    '    "drops": [ {"item": "itm_bi_tich_tan_quyen", "chance": 1, "min": 3, "max": 4}, {"item": "itm_tu_khi_dan", "chance": 1, "min": 2, "max": 3}, {"item": "itm_thiet_tinh", "chance": 1, "min": 3, "max": 5}, '
    '{"item": "gem_tho_2", "chance": 0.6, "min": 1, "max": 1}, {"item": "gem_tho_1", "chance": 1, "min": 1, "max": 2}, {"item": "itm_tay_luyen_thach", "chance": 0.6, "min": 1, "max": 2}, {"item": "itm_ho_phu", "chance": 0.6, "min": 1, "max": 1} ],\n'
    '    "equip": [ {"chance": 1, "q": [0, 0, 0, 85, 15]}, {"chance": 0.7, "q": [0, 0, 60, 40, 0]}, {"chance": 0.4, "q": [0, 0, 45, 50, 5]} ] },\n'
)
s = rd('loot.json')
if 'mon_thach_giap_te' not in s:
    i = s.rindex('  "mon_tam_ma"')
    wr('loot.json', s[:i] + loot + s[i:])

names = {
    'mon_thach_giap_te': ('Thạch Giáp Tê', None),
    'mon_khai_mach_khoi_loi': ('Khai Mạch Khôi Lỗi', None),
    'mon_ngo_cong_au': ('Ngô Công Ấu', None),
    'mon_mach_thuong_ho_ve': ('Mạch Thương Hộ Vệ', None),
    'elite_liet_cot_bao': ('Liệt Cốt Báo Vương', 'Báo vương xương lộ, vồ mồi từ trên vách'),
    'elite_ho_mach_khoi_tuong': ('Hộ Mạch Khôi Tướng', 'Khôi tướng giữ mạch, tay cầm khiên đá'),
    'elite_xich_sa_ngo_cong': ('Xích Sa Ngô Công', 'Rết đỏ chui dưới cát, nanh nhỏ độc'),
    'boss_dia_mach_long': ('Địa Mạch Long', 'Long thú dưới mạch, nằm chờ nơi vách đứt'),
}
zone = {
    'sa_thach_pha': 'Sa Thạch Pha',
    'kho_ha_dao': 'Khô Hà Đạo',
    'hoang_sa_huyet': 'Hoang Sa Huyệt',
    'cuu_mo_khu': 'Cựu Mỏ Khu',
    'tuyet_bich': 'Đoạn Mạch Tuyệt Bích',
}
poi = {
    'mach_tinh_tru': ('Mạch Tinh Trụ', 'Cột đá lam cắm giữa sườn dốc, khe sáng chạy dọc thân. Linh khí rỉ ra từng giọt, như máu chảy chậm từ vết thương cũ.'),
    'cau_da_gay': ('Cầu Đá Gãy', 'Nhịp cầu cổ bắc ngang lòng sông cạn, giữa chừng đã đứt. Người xưa qua đây khi mạch còn chảy, nay chỉ còn gió.'),
    'ho_sa_lun': ('Hố Sa Lún', 'Cát ở đây mềm như nước. Bước một bước, lún nửa bước. Dưới hố, mạch cũ đã cạn từ lâu.'),
    'cong_mo': ('Cổng Mỏ Khai Mạch', 'Trại Tàng Mạch Hội dựng sát cửa mỏ. Xe quặng đầy mạch tinh thô, người canh thì chẳng thấy đâu.'),
    'vach_dut_mach': ('Vách Đứt Mạch', 'Vách đá bị cắt thẳng như một nhát chém. Mạch lam dừng đột ngột ở mép đứt, phía sau chỉ còn đá chết.'),
}
tele = {
    'tp_thien_mach': 'Trận Thiên Mạch Đài',
    'dm_tp_tram': 'Trận Hạ Khuyết Trạm',
    'dm_tp_sa_thach': 'Trận Sa Thạch Pha',
    'dm_tp_kho_ha': 'Trận Khô Hà Đạo',
    'dm_tp_hoang_sa': 'Trận Hoang Sa Huyệt',
    'dm_tp_cuu_mo': 'Trận Cựu Mỏ Khu',
    'dm_tp_tuyet_bich': 'Trận Đoạn Mạch Tuyệt Bích',
}
add = []
for k, (n, tt) in names.items():
    add.append(f'  "mon.{k}": {q(n)},')
    if tt:
        add.append(f'  "mon.{k}.title": {q(tt)},')
add.append('  "map.doan_mach": "Đoạn Mạch Cổ Cốc",')
for k, v in zone.items():
    add.append(f'  "zone.{k}": {q(v)},')
for k, (n, d) in poi.items():
    add.append(f'  "poi.{k}.name": {q(n)},')
    add.append(f'  "poi.{k}.desc": {q(d)},')
for k, v in tele.items():
    add.append(f'  "tele.{k}": {q(v)},')
s = rd('i18n/vi.json')
if '"map.doan_mach"' not in s:
    i = s.rindex('  "sys.tele_here"')
    wr('i18n/vi.json', s[:i] + '\n'.join(add) + '\n' + s[i:])

s = rd('glossary.json')
if '"doan_mach"' not in s:
    s = s.replace(
        '"dai_ho": "Đài Canh Hồ"\n  }',
        '"dai_ho": "Đài Canh Hồ",\n' + ',\n'.join(f'    "{k}": {q(v[0])}' for k, v in poi.items()) + '\n  }',
        1,
    )
    s = s.rstrip()
    assert s.endswith('}')
    s = s[:-1].rstrip() + (
        ',\n  "maps": {\n    "van_lam": "Vân Lam Sơn Mạch",\n    "doan_mach": "Đoạn Mạch Cổ Cốc"\n  },\n  "zones": {\n'
        + ',\n'.join(f'    "{k}": {q(v)}' for k, v in zone.items())
        + '\n  },\n  "teleports": {\n'
        + ',\n'.join(f'    "{k}": {q(v)}' for k, v in tele.items())
        + '\n  }\n}\n'
    )
    wr('glossary.json', s)

s = rd('places.json')
if 'dm_tram' not in s:
    places = [
        ('dm_tram', 1024, 1036, 'Hạ Khuyết Trạm, điểm vào Đoạn Mạch Cổ Cốc (cấp 16–19)'),
        ('dm_sa_thach', 1279, 1199, 'Mạch Tinh Trụ, Sa Thạch Pha (cấp 16–17)'),
        ('dm_kho_ha', 1504, 974, 'Cầu Đá Gãy, Khô Hà Đạo (cấp 17–18)'),
        ('dm_hoang_sa', 954, 1524, 'Hố Sa Lún, Hoang Sa Huyệt (cấp 18–19)'),
        ('dm_cuu_mo', 584, 944, 'Cổng Mỏ Khai Mạch, Cựu Mỏ Khu (cấp 18–19)'),
        ('dm_tuyet_bich', 1044, 484, 'Vách Đứt Mạch, Đoạn Mạch Tuyệt Bích (cấp 19)'),
        ('dm_boss', 1054, 404, 'Chỗ Địa Mạch Long (cấp 19)'),
    ]
    body = ',\n'.join(f'  {{ "id": "{i}", "level": "doan_mach", "x": {x}, "z": {z}, "note": {q(n)} }}' for i, x, z, n in places)
    s = s.rstrip()
    assert s.endswith(']')
    s = s[:-1].rstrip() + ',\n' + body + '\n]\n'
    wr('places.json', s)
print('ok')
