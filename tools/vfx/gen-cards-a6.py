#!/usr/bin/env python3
"""A6 (Họa Pháp Lô 2): sinh 33 thẻ chiêu VFX của 9 boss chương 6–7 và 5 tinh anh (Vấn Đỉnh, Cửu Kiều) vào packages/content/data/vfx/cards/mon/.
Vùng (`zone`) và nhịp báo (`timing.anticipationMs`) PHẢI bằng `ai` của quái (`content:check` so khớp); vạch báo (`accent`) ĐỎ chuẩn kẻ địch; thân hiệu ứng (core/body/rim) theo màu hệ, không đỏ/cam.
Nguồn chiêu: packages/content/data/monsters.json. Chạy: python tools/vfx/gen-cards-a6.py"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'content', 'data', 'vfx', 'cards', 'mon')

BUDGET = {'drawCalls': 8, 'particles': 300, 'screenCover': 0.3, 'overdraw': 5}
BUDGET_ELITE = {'drawCalls': 7, 'particles': 220, 'screenCover': 0.2, 'overdraw': 4}


BODY_WORDS = {
    'boss_hu_anh_chu': 'ngọc lam và bạc (gương)',
    'boss_dinh_linh': 'vàng đồng và ngà (không cam)',
    'boss_phu_chu': 'lam xám và vàng nhạt',
    'boss_tu_quang_duc_chu': 'tím (không ngả hồng-đỏ)',
    'boss_kieu_thu': 'ngà trắng và vàng nhạt (không cam)',
    'boss_ve_kieu': 'lục ngọc và xám trắng',
    'boss_thach_tuong': 'xám đá và vàng đá nhạt',
    'boss_dao_linh': 'bạc và lam nhạt',
    'boss_lo_linh': 'vàng sáng và ngà (không cam)',
    'elite_hu_anh_nhan': 'bạc lam',
    'elite_anh_hac_vuong': 'ngọc lam',
    'elite_lo_thach_tuong': 'xám đá và vàng đá nhạt',
    'elite_sa_tuong': 'cát vàng nhạt (không cam)',
    'elite_may_lang_vuong': 'trắng và lục nhạt',
}


def zone_words(z):
    if z['shape'] == 'circle':
        return f"tròn bán kính {z['r']} m".replace('.', ',')
    if z['shape'] == 'cone':
        return f"quạt dài {z['r']} m, nửa góc {z['w']}°".replace('.', ',')
    return f"dài {z['r']} m, rộng {z['w']} m".replace('.', ',')


def zone(shape, r, w=None, at='target'):
    z = {'shape': shape, 'r': r}
    if w is not None:
        z['w'] = w
    z['at'] = at
    return z


# (monId, element, palette{core,body,rim,accent}, elite?)
# Màu: `accent` = ĐỎ chuẩn kẻ địch (vạch báo, quyết định 25/11: đỏ/cam dành cho cảnh báo); core/body/rim = màu hệ, KHÔNG đỏ/cam (vàng đồng/ngà hue ≥ 50°).
MON = {
    'boss_hu_anh_chu': ('thuy', {'core': '140f28', 'body': '3f8f9a', 'rim': 'd9f6f2', 'accent': 'ff1f3d'}, False),
    'boss_dinh_linh': ('kim', {'core': '16150a', 'body': 'a99a3c', 'rim': 'f3e8bd', 'accent': 'ff1f3d'}, False),
    'boss_phu_chu': ('tho', {'core': '131b2a', 'body': '4a6a8c', 'rim': 'dfe8f2', 'accent': 'ff1f3d'}, False),
    'boss_tu_quang_duc_chu': ('thuy', {'core': '160d28', 'body': '6b3fa0', 'rim': 'e2d4f7', 'accent': 'ff1f3d'}, False),
    'boss_kieu_thu': ('kim', {'core': '2a2a28', 'body': 'cfc8b0', 'rim': 'f4f6ee', 'accent': 'ff1f3d'}, False),
    'boss_ve_kieu': ('tho', {'core': '1f2a26', 'body': '8aa59a', 'rim': 'f0f6f3', 'accent': 'ff1f3d'}, False),
    'boss_thach_tuong': ('tho', {'core': '1e1c16', 'body': 'a29d8c', 'rim': 'f4eed8', 'accent': 'ff1f3d'}, False),
    'boss_dao_linh': ('thuy', {'core': '161c2a', 'body': '8e98b8', 'rim': 'f2f6fa', 'accent': 'ff1f3d'}, False),
    'boss_lo_linh': ('kim', {'core': '241f12', 'body': 'c2b27a', 'rim': 'fff6d0', 'accent': 'ff1f3d'}, False),
    'elite_hu_anh_nhan': ('kim', {'core': '16132a', 'body': '55507a', 'rim': 'dde3ee', 'accent': 'ff1f3d'}, True),
    'elite_anh_hac_vuong': ('thuy', {'core': '140f28', 'body': '3f8f9a', 'rim': 'd9f6f2', 'accent': 'ff1f3d'}, True),
    'elite_lo_thach_tuong': ('tho', {'core': '1b1a15', 'body': '9a9a8c', 'rim': 'f4eed8', 'accent': 'ff1f3d'}, True),
    'elite_sa_tuong': ('tho', {'core': '231e12', 'body': 'c9b878', 'rim': 'fff4cc', 'accent': 'ff1f3d'}, True),
    'elite_may_lang_vuong': ('thuy', {'core': '17222a', 'body': '9fc4c0', 'rim': 'f6fbfa', 'accent': 'ff1f3d'}, True),
}

# (monId, move, zone, delayMs, impactMs, lingerMs, shapeLang, idea, readability)
MOVES = [
    # ---------- Hư Ảnh Chủ ----------
    ('boss_hu_anh_chu', 'line', zone('rect', 20, 4, 'forward'), 1300, 150, 800, ['line', 'spike'],
     'Hư Ảnh Chủ giơ tay, một dải mặt gương dựng thẳng dọc đường 20 m: vạch báo ĐỎ dài 4 m; nổ ra tia phản chiếu, mảnh gương nhọn bay dọc theo đường, bóng người thoáng trong mảnh, tan như hơi nước trên mặt hồ.',
     'Dải ngọc lam đặc đúng 20×4 m, mảnh gương trắng bạc viền đậm không lẫn nền đá sáng; không che người chơi đứng ngoài dải.'),
    ('boss_hu_anh_chu', 'slam', zone('circle', 4.5, None, 'target'), 1300, 130, 800, ['ring', 'burst'],
     'Pha 2: Hư Ảnh Chủ nện xuống dưới chân người chơi: gương tròn bán kính 4,5 m nứt dần từ tâm (vạch báo ĐỎ), rồi vỡ tung thành mảnh gương xoáy lên, một cái bóng người thoáng hiện trong những mảnh.',
     'Đĩa gương ngọc tròn đúng 4,5 m, nứt hình mạng nhện rõ từ tâm; mảnh vỡ cao vừa phải, không che mục tiêu.'),
    ('boss_hu_anh_chu', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 800, ['arc', 'line'],
     'Pha 3: Hư Ảnh Chủ vung tay quét quạt 14 m, nửa góc 45°: dải bóng nhiều bàn tay nối đuôi nhau quét qua (vạch báo ĐỎ), bàn tay bóng tách thành lông bóng rơi, tan nhanh.',
     'Quạt ngọc lam rõ rìa, bàn tay bóng sẫm có viền sáng; chỗ an toàn (ngoài quạt) hoàn toàn sạch.'),
    # ---------- Đỉnh Linh ----------
    ('boss_dinh_linh', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 900, ['line', 'beam'],
     'Đỉnh Linh phun một rãnh đồng nóng chảy dọc đường 22 m: vạch báo ĐỎ dài 4 m; nổ ra rãnh đồng lỏng sáng trắng-vàng đồng (không cam) chạy dọc, giọt đồng bắn lên rồi nguội thành vảy sẫm.',
     'Dải vàng đồng nhạt đúng 22×4 m, lõi đồng lỏng trắng-vàng, vảy nguội nâu sẫm; tuyệt đối không cam/đỏ.'),
    ('boss_dinh_linh', 'slam', zone('circle', 5, None, 'target'), 1300, 130, 900, ['ring', 'spike'],
     'Pha 2: Đỉnh Linh giáng xuống như cả chiếc đỉnh đồng: vòng văn khắc đỉnh bán kính 5 m nứt phát sáng (vạch báo ĐỎ), rồi cột đồng lỏng trồi lên và sóng chuông ngân lan ra.',
     'Vòng văn khắc vàng đồng đúng 5 m, cột đồng thấp và đặc, sóng chuông là vòng mảnh trắng-ngà; không cam.'),
    ('boss_dinh_linh', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 900, ['arc', 'cloud'],
     'Pha 3: Đỉnh Linh quét cả cánh tay đồng: sóng nhiệt đồng quạt 14 m nửa góc 45° (vạch báo ĐỎ), mảnh giáp đồng văng ra theo hình quạt, sóng nhiệt làm méo nền.',
     'Quạt vàng đồng rõ rìa, mảnh giáp sẫm viền sáng; sóng nhiệt là vệt mờ, không che nhân vật.'),
    # ---------- Phủ Chủ ----------
    ('boss_phu_chu', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 800, ['line', 'beam'],
     'Phủ Chủ mở cửa hai mặt dọc đường 22 m: vạch báo ĐỎ chia đôi theo chiều dọc; nổ ra khung cửa hai mặt (nửa sáng vàng nhạt, nửa lam xám sẫm) hai mặt bật lên liên tiếp, bụi động phủ tung.',
     'Dải 22×4 m chia đôi dọc rõ ràng (một nửa sáng vàng nhạt, một nửa lam xám sẫm), khung cửa cao thấp vừa, không che mục tiêu.'),
    ('boss_phu_chu', 'slam', zone('circle', 4.5, None, 'target'), 1300, 130, 800, ['ring', 'burst'],
     'Pha 2: Phủ Chủ lật bàn tay, phòng đổi mặt dưới chân người chơi: vòng tròn 4,5 m chia đôi sáng/tối (vạch báo ĐỎ), rồi lật mặt nổ ra, nửa vòng sáng nửa vòng tối bật tung bụi.',
     'Vòng 4,5 m chia nửa sáng/tối rõ, mép vàng nhạt, bụi mỏng; không đỏ.'),
    ('boss_phu_chu', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 800, ['arc', 'cloud'],
     'Pha 3: Phủ Chủ quét cánh cửa hai mặt: quạt 14 m nửa góc 45° (vạch báo ĐỎ), cánh cửa nửa sáng nửa tối quét qua, bụi động phủ cuộn theo.',
     'Quạt rõ rìa, cánh cửa hai tông sáng/tối đọc được; chỗ an toàn sạch.'),
    # ---------- Tử Quang Dực Chủ ----------
    ('boss_tu_quang_duc_chu', 'sweep', zone('cone', 16, 25, 'forward'), 1400, 140, 800, ['arc', 'line'],
     'Tử Quang Dực Chủ vỗ cánh tím quét quạt 16 m nửa góc 25°: vạch báo ĐỎ; nổ ra cánh tím (không ngả hồng-đỏ) khổng lồ quét qua, lông cánh tách rơi và tan thành tàn quang.',
     'Quạt tím nhạt rõ rìa, lông cánh sẫm viền tím sáng; tuyệt đối không ngả hồng/đỏ.'),
    ('boss_tu_quang_duc_chu', 'line', zone('rect', 22, 3, 'forward'), 1300, 150, 800, ['line', 'beam'],
     'Tử Quang Dực Chủ phóng một tia tàn quang mảnh dọc đường 22 m, rộng 3 m (vạch báo ĐỎ); nổ ra tia quang tím lõi trắng xuyên suốt, tàn quang rơi lả tả hai bên.',
     'Dải tím nhạt hẹp đúng 22×3 m, tia lõi trắng-tím; tàn quang nhỏ, không che nhân vật.'),
    ('boss_tu_quang_duc_chu', 'slam', zone('circle', 4, None, 'target'), 1300, 130, 800, ['ring', 'burst'],
     'Pha 2: tàn quang rơi như mưa xuống bán kính 4 m (vạch báo ĐỎ): nhiều đốm quang rơi đồng loạt rồi bùng thành vết đốt tròn, khói tím mỏng bốc lên.',
     'Đĩa tím nhạt 4 m, đốm quang rơi từ trên, vết đốt sẫm viền tím; không ngả đỏ.'),
    ('boss_tu_quang_duc_chu', 'chant', zone('circle', 12, None, 'self'), 1000, 160, 1000, ['spiral', 'ring'],
     'Pha 3: Tử Quang Dực Chủ há miệng uống mạch: xoáy hút bán kính 12 m dưới sàn, mạch tím sáng chạy từ rìa vào tâm (vạch báo ĐỎ); cuối chiêu mạch bùng nổ rồi tan, kèm giật.',
     'Vòng 12 m quanh boss, mạch tím chạy vào tâm đọc được hướng hút; mép vòng sắc nét.'),
    # ---------- Kiều Thủ ----------
    ('boss_kieu_thu', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 900, ['line', 'spike'],
     'Kiều Thủ chém thanh kiếm không lưỡi xuống mặt cầu: một vết nứt thẳng 22 m phát sáng chạy dọc mặt cầu đá (vạch báo ĐỎ); nổ ra khe nứt sáng, mảnh đá trắng văng lên.',
     'Dải vàng ngà đúng 22×4 m, khe nứt sáng trắng, mảnh đá trắng viền sẫm; không cam.'),
    ('boss_kieu_thu', 'slam', zone('circle', 5, None, 'target'), 1300, 130, 900, ['ring', 'spike'],
     'Pha 2: Kiều Thủ dậm kiếm xuống: nứt tỏa tia từ tâm bán kính 5 m (vạch báo ĐỎ), rồi mặt cầu vỡ thành mảnh đá trắng bay lên, khe sáng lộ ra.',
     'Đĩa nứt tỏa tia đúng 5 m, mảnh đá trắng viền sẫm, khe sáng vàng ngà.'),
    ('boss_kieu_thu', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 900, ['arc', 'cloud'],
     'Pha 3: Kiều Thủ quét ngang, gió biển mây thổi NGƯỢC lên: quạt 14 m nửa góc 45° (vạch báo ĐỎ), dải mây ngà cuộn ngược qua cầu, bụi đá bay theo.',
     'Quạt ngà rõ rìa, dải mây trắng ngà cuộn mỏng; không che người chơi.'),
    # ---------- Vệ Kiều ----------
    ('boss_ve_kieu', 'line', zone('rect', 18, 3.5, 'forward'), 1300, 150, 800, ['line', 'beam'],
     'Vệ Kiều (người canh cầu hai mặt) phóng một tia đá hai mặt dọc cầu 18 m, rộng 3,5 m: vạch báo ĐỎ; nổ ra tia đá chia đôi sáng/xám, khe lục lộ ra.',
     'Dải lục ngọc nhạt đúng 18×3,5 m chia đôi sáng/xám; mảnh đá sẫm viền sáng.'),
    # ---------- Thạch Tượng ----------
    ('boss_thach_tuong', 'slam', zone('circle', 5, None, 'target'), 1300, 130, 900, ['ring', 'spike'],
     'Thạch Tượng nện xuống: giáp đá nứt theo nhịp thở của núi, khe vàng đá tỏa từ tâm bán kính 5 m (vạch báo ĐỎ), rồi tảng đá tróc ra bay lên, bụi mỏng.',
     'Đĩa khe vàng đá đúng 5 m, tảng đá sẫm viền sáng, bụi mỏng không che người.'),
    ('boss_thach_tuong', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 900, ['line', 'spike'],
     'Thạch Tượng đập tay xuống đất: một luống đá trồi nứt dọc đường 22 m (vạch báo ĐỎ); nổ ra hàng khối đá trồi lên liên tiếp theo luống, khe vàng sáng giữa các khối.',
     'Dải vàng đá 22×4 m, khối đá thấp nối nhau, khe vàng sáng; chỗ an toàn ngoài luống sạch.'),
    # ---------- Đạo Linh ----------
    ('boss_dao_linh', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 800, ['line', 'beam'],
     'Đạo Linh quét một nét cọ đạo bạc dọc đường 22 m, rộng 4 m (vạch báo ĐỎ); nổ ra vệt mực bạc đổi sắc dần, bắn ra vài giọt mực rồi nhạt đi.',
     'Dải bạc lam nhạt đúng 22×4 m, vệt mực bạc viền đậm; không đỏ.'),
    ('boss_dao_linh', 'slam', zone('circle', 5, None, 'target'), 1300, 130, 800, ['ring', 'burst'],
     'Pha 2: Đạo Linh nện xuống: vòng "đạo" bán kính 5 m (vạch báo ĐỎ) vỡ thành ba mảnh ba sắc nhạt (kim, thủy, mộc) bật lên, tan thành mực bạc.',
     'Vòng bạc lam 5 m chia ba cung rõ, ba sắc nhạt khác nhau, không đỏ/cam.'),
    ('boss_dao_linh', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 800, ['arc', 'line'],
     'Pha 3: Đạo Linh quét nét cọ lớn: quạt 14 m nửa góc 45° (vạch báo ĐỎ), nét cọ bạc quét qua, mực bạc bắn thành chấm.',
     'Quạt bạc lam rõ rìa, nét cọ mực viền đậm; chỗ an toàn sạch.'),
    # ---------- Lộ Linh ----------
    ('boss_lo_linh', 'line', zone('rect', 22, 4, 'forward'), 1300, 150, 900, ['line', 'beam'],
     'Lộ Linh trải một cầu ánh sáng thẳng dọc đường 22 m, rộng 4 m (vạch báo ĐỎ); nổ ra tấm sáng lát trên đường, mép sáng trắng, hạt sáng bay lên rồi tắt.',
     'Dải vàng sáng nhạt đúng 22×4 m, tấm sáng lát đặc viền trắng; không cam/đỏ.'),
    ('boss_lo_linh', 'slam', zone('circle', 5, None, 'target'), 1300, 130, 900, ['ring', 'burst'],
     'Pha 1: mặt cầu lật mặt dưới chân người chơi: vòng sáng bán kính 5 m (vạch báo ĐỎ) lật một nửa rồi nổ, mảnh cầu sáng bay lên.',
     'Vòng sáng 5 m, nửa lật nửa phẳng đọc rõ, mảnh cầu viền sáng.'),
    ('boss_lo_linh', 'sweep', zone('cone', 14, 45, 'forward'), 1300, 140, 900, ['arc', 'cloud'],
     'Pha 2: Lộ Linh quét dải sáng: quạt 14 m nửa góc 45° (vạch báo ĐỎ), dải sáng quét qua, mảnh cầu bay theo.',
     'Quạt vàng sáng rõ rìa, mảnh cầu sẫm viền sáng; chỗ an toàn sạch.'),
    # ---------- Tinh anh ----------
    ('elite_hu_anh_nhan', 'line', zone('rect', 10, 4, 'forward'), 1400, 140, 700, ['line', 'spike'],
     'Hư Ảnh Nhân giơ tay phóng tia gương ngắn dọc đường 10 m, rộng 4 m (vạch báo ĐỎ); nổ ra tia phản chiếu, vài mảnh gương nhỏ rơi.',
     'Dải bạc lam 10×4 m, mảnh gương nhỏ viền sáng; phủ nhỏ, không che người.'),
    ('elite_anh_hac_vuong', 'charge', zone('rect', 14, 3, 'forward'), 1000, 130, 700, ['line', 'cloud'],
     'Ảnh Hạc Vương lao lướt dọc đường 14 m, rộng 3 m (vạch báo ĐỎ); để lại vệt bóng hạc lướt qua, lông bóng rơi và tan.',
     'Dải ngọc lam 14×3 m, vệt bóng hạc sẫm viền ngọc; phủ nhỏ.'),
    ('elite_lo_thach_tuong', 'leap', zone('circle', 5.5, None, 'target'), 1500, 130, 700, ['ring', 'burst'],
     'Lộ Thạch Tướng nhảy đáp xuống: mỗi bước là một tiếng chuông trầm, vòng sóng chuông bán kính 5,5 m nổ từ điểm đáp (vạch báo ĐỎ), bụi đá bắn nhẹ.',
     'Vòng vàng đá 5,5 m, sóng chuông là vòng mảnh, bụi mỏng; không cam.'),
    ('elite_lo_thach_tuong', 'line', zone('rect', 11, 4, 'forward'), 1400, 140, 700, ['line', 'spike'],
     'Lộ Thạch Tướng đập tay xuống đất: luống đá nứt thẳng dọc đường 11 m, rộng 4 m (vạch báo ĐỎ); khối đá trồi lên liên tiếp, khe vàng sáng.',
     'Dải vàng đá 11×4 m, khối đá thấp, khe sáng; phủ nhỏ.'),
    ('elite_sa_tuong', 'leap', zone('circle', 5.5, None, 'target'), 1500, 130, 700, ['burst', 'cloud'],
     'Sa Tướng nhảy đáp xuống: cuộn cát nổ bán kính 5,5 m (vạch báo ĐỎ), đao cát bắn ra theo vòng rồi tan thành bụi vàng.',
     'Vòng cát vàng nhạt 5,5 m, cuộn cát thấp, đao cát sẫm viền sáng; không cam/đỏ.'),
    ('elite_sa_tuong', 'line', zone('rect', 11, 4, 'forward'), 1400, 140, 700, ['line', 'cloud'],
     'Sa Tướng quét một cồn cát sóng dọc đường 11 m, rộng 4 m (vạch báo ĐỎ); cồn cát nổi lên thành sóng chạy dọc rồi vỡ thành bụi.',
     'Dải cát vàng nhạt 11×4 m, sóng cát thấp; phủ nhỏ.'),
    ('elite_may_lang_vuong', 'charge', zone('rect', 13, 2.6, 'forward'), 1000, 130, 700, ['line', 'cloud'],
     'Mây Lang Vương lao lướt dọc đường 13 m, rộng 2,6 m (vạch báo ĐỎ); để lại vệt mây lang lướt, bông mây tan dần.',
     'Dải trắng lục 13×2,6 m, vệt mây trắng viền lục đậm để đọc được trên nền sáng; phủ nhỏ.'),
    ('elite_may_lang_vuong', 'leap', zone('circle', 5, None, 'target'), 1400, 130, 700, ['ring', 'cloud'],
     'Mây Lang Vương đáp xuống: vòng mây phồng nổ bán kính 5 m (vạch báo ĐỎ), bông mây bắn ra rồi tan.',
     'Vòng trắng lục 5 m, bông mây có viền đậm để đọc nền sáng; phủ nhỏ.'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for mon, mv, z, delay, impact, linger, lang, idea, read in MOVES:
        el, pal, elite = MON[mon]
        card = {
            'monId': mon,
            'move': mv,
            'idea': idea,
            'element': el,
            'palette': pal,
            'shapeLang': lang,
            'zone': z,
            'timing': {'anticipationMs': delay, 'impactMs': impact, 'lingerMs': linger},
            'readability': f"Vạch báo ĐỎ đặc đúng vùng {zone_words(z)}, đọc rõ trên nền đá sáng cả ngày lẫn đêm, ngoài vùng hoàn toàn sạch; thân hiệu ứng nổ màu hệ ({BODY_WORDS[mon]}), tuyệt đối không đỏ/cam, không che người chơi.",
            'budget': BUDGET_ELITE if elite else BUDGET,
        }
        with open(os.path.join(OUT, f'{mon}__{mv}.json'), 'w', encoding='utf8') as f:
            json.dump(card, f, ensure_ascii=False, indent=2)
            f.write('\n')
        n += 1
    print(f'ok: {n} cards')


if __name__ == '__main__':
    main()
