#!/usr/bin/env node
// Họa Pháp Lô 2 — hiệu ứng TRÚNG ĐÒN CHUNG (không thuộc chiêu nào): vết va theo kiểu vũ khí, chí mạng, chặn, quái đánh trúng người, ngắt chú/mất thế,
// hồi máu, hồi linh lực, nhịp hồi. Sprite vẽ tay nhóm `chung_*` (tranh đơn sắc, kiểu tô 12 = theo bảng màu lúc phát: hướng tu người đánh / hệ của quái).
// Hiệu ứng nhỏ và lặp rất nhiều nên ngân sách chặt: mỗi lần trúng ≤ 2 sprite (mỗi sprite một draw call), ≤ 14 hạt.
// Ba nhịp: tụ (chỉ hồi phục, 150 ms) → trúng tại mốc `I` (hình bật) → điểm nhấn +30 ms (lớp `rim` ngắn) → tan ≤ 200 ms.
// Ghi đè toàn bộ thẻ + timeline của nhóm (không giữ sửa tay). Dùng: node tools/vfx-forge/trung-don.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fxDir = path.join(root, 'packages/content/data/fx');
const cardDir = path.join(root, 'packages/content/data/vfx/cards');
const r2 = (x) => Math.round(x * 100) / 100;
/** Tấm sprite là quad 2×2: `size` = cạnh ô theo mét (tranh chiếm ~60–80% ô). */
const K = 0.5;
let seq = 2000;

const sprite = (name, o) => {
  const { size, sizeTo, off = [0, 0, 0], up, at = 'target', ...rest } = o;
  return {
    type: 'mesh',
    shape: 'sprite',
    sprite: name,
    billboard: true,
    at,
    t: 0,
    dur: 0.18,
    offset: off,
    scale: r2(size * K),
    scaleTo: r2((sizeTo ?? size) * K),
    sweep: 0,
    erodeFrom: 0.45,
    ragged: 0.5,
    tone: 'body',
    alpha: 0.95,
    tier: 0,
    seed: seq++,
    ...(up ? { move: { to: at, offset: [off[0], r2(off[1] + up), off[2]], ease: 'out' } } : {}),
    ...rest,
  };
};
const parts = (kind, t, n, o = {}) => ({
  type: 'particles',
  kind,
  t,
  n,
  speed: 4,
  spread: 0.8,
  life: 0.3,
  size: 0.08,
  at: 'target',
  tone: 'rim',
  tier: 0,
  ...o,
});
/** Điểm nhấn +30 ms: cùng tranh, lớp viền sáng rất ngắn, to hơn một chút (đọc được "đã trúng" ở cỡ 60–100 px). */
const accent = (name, I, size, o = {}) => sprite(name, { t: r2(I + 0.03), dur: 0.07, size: size * 1.12, sizeTo: size * 1.3, tone: 'rim', alpha: 0.85, erodeFrom: 0.2, tier: 1, ...o });

/** Bảng màu mặc định của nhóm (phòng thử, và khi không biết người đánh). Lúc chơi `startAt` truyền bảng hướng tu / hệ quái. Không tông nào đỏ/cam. */
const PAL = {
  hit_chung: { core: '14161c', body: 'b9c6d6', rim: 'ffffff', accent: 'f0e6a8', shadow: '08090c' },
  hit_guard: { core: '10202e', body: '6fa8d0', rim: 'eaf6ff', accent: 'f0e6a8', shadow: '070d14' },
  hit_heal: { core: '0c3324', body: '4fd69a', rim: 'eafff2', accent: 'f4e9a0', shadow: '06160f' },
  hit_mana: { core: '0c1c4a', body: '4f8cf0', rim: 'e2efff', accent: 'b9a8ff', shadow: '060c22' },
  hit_dich: { core: '2a1030', body: 'a04ad8', rim: 'f3e2ff', accent: 'f0e6a8', shadow: '12061a' },
};

const SCENES = [
  {
    id: 'fx_hit_cut',
    pal: 'hit_chung',
    fxKind: '~hit_cut',
    I: 0,
    idea: 'Đòn SẮC (kiếm, đao, phi kiếm) trúng thân: MỘT nét cọ khô xẻ chéo qua điểm trúng, chạy theo hướng đòn, hai đầu tỏe sợi mực; lõi mực gần đen, thân màu hướng tu người đánh, mép trắng mảnh. Vài tia nhỏ văng theo hướng đòn. Nhỏ (khoảng 1,6 m), tan trong 0,18 giây. Không sao tỏa tia, không lưỡi liềm trơn.',
    element: 'kim',
    shapeLang: ['line'],
    silhouette: 'một nét cọ khô xẻ chéo qua thân, hai đầu tỏe sợi, nằm dọc hướng đòn',
    timing: { anticipationMs: 0, impactMs: 60, lingerMs: 150 },
    footprint: { lengthM: 1.8, widthM: 0.8, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 14, screenCover: 0.01, overdraw: 2 },
    events: () => [
      sprite('chung_cut', { size: 1.5, sizeTo: 1.9, align: 'aim', dur: 0.18 }),
      accent('chung_cut', 0, 1.5, { align: 'aim' }),
      parts('spark', 0, 8, { speed: 6, spread: 0.45, life: 0.22, size: 0.07 }),
      parts('shard', 0.03, 4, { speed: 3.4, spread: 0.7, life: 0.4, size: 0.09, tone: 'core', grav: 9, tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_smash',
    pal: 'hit_chung',
    fxKind: '~hit_smash',
    I: 0,
    idea: 'Đòn NẶNG/TÙ (quyền, chưởng, cự quyền) trúng thân: một mảng mực vỡ dẹt bất đối xứng như vết đập lên giấy ướt, giữa có khe trắng gãy, mảnh mực văng lệch về phía sau nạn nhân. Lõi mực, thân màu hướng tu, khe trắng. Không tròn đều, không tia thẳng.',
    element: 'tho',
    shapeLang: ['burst'],
    silhouette: 'mảng mực vỡ dẹt lệch một bên, khe trắng gãy ở giữa, mảnh văng về phía sau',
    timing: { anticipationMs: 0, impactMs: 70, lingerMs: 160 },
    footprint: { lengthM: 1.8, widthM: 1.6, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 14, screenCover: 0.012, overdraw: 2 },
    events: () => [
      sprite('chung_smash', { size: 1.3, sizeTo: 2.0, align: 'aim', dur: 0.2, erodeFrom: 0.4 }),
      accent('chung_smash', 0, 1.4, { align: 'aim' }),
      parts('shard', 0, 8, { speed: 4.2, spread: 0.65, life: 0.42, size: 0.11, tone: 'core', grav: 9 }),
      parts('dust', 0.02, 5, { speed: 1.6, spread: 0.9, life: 0.5, size: 0.3, tone: 'shadow', grav: -0.6, tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_stab',
    pal: 'hit_chung',
    fxKind: '~hit_stab',
    I: 0,
    idea: 'Đòn PHÁP/XUYÊN (tia, đạn, sét, hồn, cổ, đan hỏa) trúng thân: một chùm giọt mực nhọn bắn xuyên qua điểm trúng theo MỘT hướng (hình nón hẹp văng ra sau nạn nhân), đầu vào gọn, đầu ra tỏe; lõi mực, thân màu hướng tu, đầu giọt trắng.',
    element: 'vo',
    shapeLang: ['line', 'burst'],
    silhouette: 'chùm giọt mực nhọn bắn xuyên theo một hướng, đầu vào gọn đầu ra tỏe',
    timing: { anticipationMs: 0, impactMs: 60, lingerMs: 150 },
    footprint: { lengthM: 2.0, widthM: 1.0, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 14, screenCover: 0.01, overdraw: 2 },
    events: () => [
      sprite('chung_stab', { size: 1.4, sizeTo: 2.0, align: 'aim', dur: 0.18 }),
      accent('chung_stab', 0, 1.4, { align: 'aim' }),
      parts('spark', 0, 10, { speed: 7, spread: 0.3, life: 0.22, size: 0.06 }),
      parts('petal', 0.03, 4, { speed: 2.2, spread: 0.8, life: 0.4, size: 0.1, tone: 'body', tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_crit',
    pal: 'hit_chung',
    fxKind: '~hit_crit',
    I: 0,
    idea: 'CHÍ MẠNG (phát thêm lên trên vết va): một khe nứt gãy khúc chữ chi như vết rách trên giấy, dựng đứng hơi nghiêng qua điểm trúng, lõi mực đen rộng, mép trắng sắc, vài mảnh giấy rách bật ra hai bên. To hơn vết va thường (khoảng 2,4 m) để nhìn là biết chí mạng. Không sao, không tia tỏa.',
    element: 'kim',
    shapeLang: ['line', 'spike'],
    silhouette: 'khe nứt gãy khúc chữ chi dựng đứng như vết rách giấy, mảnh rách bật hai bên',
    timing: { anticipationMs: 0, impactMs: 80, lingerMs: 220 },
    footprint: { lengthM: 1.2, widthM: 1.2, heightM: 2.4 },
    budget: { drawCalls: 3, particles: 16, screenCover: 0.02, overdraw: 3 },
    events: () => [
      sprite('chung_crit', { size: 1.8, sizeTo: 2.4, dur: 0.26, off: [0, 0.2, 0], erodeFrom: 0.5 }),
      accent('chung_crit', 0, 1.9, { off: [0, 0.2, 0], dur: 0.08 }),
      sprite('chung_chips', { t: 0.03, size: 1.2, sizeTo: 2.2, dur: 0.24, tone: 'rim', alpha: 0.8, erodeFrom: 0.3, tier: 1 }),
      parts('shard', 0, 10, { speed: 5, spread: 0.9, life: 0.45, size: 0.1, tone: 'rim', grav: 8 }),
      parts('spark', 0.03, 6, { speed: 7, spread: 1, life: 0.2, size: 0.06, tone: 'accent', tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_block',
    pal: 'hit_guard',
    fxKind: '~hit_block',
    I: 0,
    idea: 'CHẶN / HẤP THỤ (đòn bị hộ thể nuốt hết, sát thương 0): một tấm khiên lục giác bằng mực loãng hiện lên trước ngực đúng chỗ đòn chạm, nứt ba đường từ điểm chạm, một góc vỡ bật mảnh; lam thép, lõi mực chàm, mép trắng lạnh. Đứng yên rồi tan, không nở to.',
    element: 'kim',
    shapeLang: ['ring', 'line'],
    silhouette: 'tấm lục giác mực loãng nứt ba đường từ một điểm, một góc vỡ bật mảnh',
    timing: { anticipationMs: 0, impactMs: 80, lingerMs: 260 },
    footprint: { lengthM: 1.4, widthM: 1.4, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 10, screenCover: 0.012, overdraw: 2 },
    events: () => [
      sprite('chung_guard', { size: 1.5, sizeTo: 1.6, dur: 0.34, erodeFrom: 0.55, alpha: 0.9 }),
      accent('chung_guard', 0, 1.4, { dur: 0.08 }),
      parts('shard', 0.03, 7, { speed: 3.6, spread: 0.8, life: 0.4, size: 0.1, tone: 'rim', grav: 9 }),
      parts('spark', 0, 3, { speed: 5, spread: 0.9, life: 0.18, size: 0.06, tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_mon',
    pal: 'hit_dich',
    fxKind: '~hit_mon',
    I: 0,
    idea: 'QUÁI đánh trúng người chơi: ba vệt cào cong song song xé qua thân theo hướng đòn (thú). Lõi mực, thân theo HỆ của quái (tím, lục, lam, nâu… KHÔNG đỏ/cam: đỏ chỉ dành cho vạch báo), mép sáng mảnh. Nhỏ, không che nhân vật.',
    element: 'am',
    shapeLang: ['arc', 'line'],
    silhouette: 'ba vệt cào cong song song xé chéo qua thân',
    timing: { anticipationMs: 0, impactMs: 60, lingerMs: 160 },
    footprint: { lengthM: 1.8, widthM: 1.2, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 12, screenCover: 0.012, overdraw: 2 },
    events: () => [
      sprite('chung_claw', { size: 1.5, sizeTo: 1.9, align: 'aim', dur: 0.2 }),
      accent('chung_claw', 0, 1.5, { align: 'aim' }),
      parts('spark', 0, 6, { speed: 5, spread: 0.6, life: 0.24, size: 0.07 }),
      parts('shard', 0.03, 5, { speed: 3.2, spread: 0.8, life: 0.4, size: 0.09, tone: 'core', grav: 9, tier: 1 }),
    ],
  },
  {
    id: 'fx_hit_bite',
    pal: 'hit_dich',
    fxKind: '~hit_bite',
    I: 0,
    idea: 'QUÁI CẮN trúng người chơi: dấu cắn bằng mực, hai hàng răng nhọn (hàm trên và hàm dưới) khép lại quanh điểm trúng rồi tan, vài giọt mực văng. Lõi mực, thân theo HỆ của quái (KHÔNG đỏ/cam), đầu răng trắng. Nhỏ, không che nhân vật.',
    element: 'am',
    shapeLang: ['spike'],
    silhouette: 'hai hàng răng nhọn mực khép lại quanh điểm trúng như một dấu cắn',
    timing: { anticipationMs: 0, impactMs: 60, lingerMs: 160 },
    footprint: { lengthM: 1.4, widthM: 1.2, heightM: 1.6 },
    budget: { drawCalls: 2, particles: 8, screenCover: 0.01, overdraw: 2 },
    events: () => [
      sprite('chung_fang', { size: 1.6, sizeTo: 1.2, dur: 0.2, erodeFrom: 0.5 }),
      accent('chung_fang', 0, 1.2, { sizeTo: 1.1 }),
      parts('shard', 0.03, 6, { speed: 3, spread: 0.9, life: 0.4, size: 0.09, tone: 'core', grav: 9 }),
    ],
  },
  {
    id: 'fx_break',
    pal: 'hit_chung',
    fxKind: '~break',
    I: 0,
    idea: 'NGẮT CHÚ / MẤT THẾ (boss bị phá chú hoặc quỵ): một sợi xích chú bằng mực đang căng thì ĐỨT làm đôi ngay trước ngực boss, hai nửa bật ra hai phía, mắt xích vỡ rơi xuống; lõi mực, thân màu người phá, mép trắng. Có khói mực nhỏ ở điểm đứt. To hơn vết va (khoảng 2,6 m) vì là khoảnh khắc thưởng.',
    element: 'vo',
    shapeLang: ['line', 'cloud'],
    silhouette: 'sợi xích mực đứt đôi, hai nửa bật ra hai phía, mắt xích vỡ rơi',
    timing: { anticipationMs: 0, impactMs: 90, lingerMs: 320 },
    footprint: { lengthM: 2.6, widthM: 1.4, heightM: 2 },
    budget: { drawCalls: 3, particles: 20, screenCover: 0.025, overdraw: 3 },
    events: () => [
      sprite('chung_snap', { size: 2.0, sizeTo: 2.8, dur: 0.36, erodeFrom: 0.5 }),
      accent('chung_snap', 0, 2.1, { dur: 0.09 }),
      sprite('chung_puff', { t: 0.03, size: 1.0, sizeTo: 1.9, dur: 0.4, tone: 'core', alpha: 0.6, erodeFrom: 0.3, up: 0.4, tier: 1 }),
      parts('shard', 0, 12, { speed: 4.5, spread: 0.9, life: 0.5, size: 0.11, tone: 'rim', grav: 9 }),
      parts('spark', 0.03, 8, { speed: 6, spread: 1, life: 0.22, size: 0.06, tone: 'accent', tier: 1 }),
    ],
  },
  {
    id: 'fx_heal',
    pal: 'hit_heal',
    fxKind: '~heal',
    I: 0.15,
    idea: 'HỒI MÁU (người NHẬN một lượng hồi lớn: được đồng đội hồi, đan hồi máu, pháp bảo; chiêu hồi của Đan sư đã có hình riêng): linh khí ngọc lục thu về chân người trong 0,15 giây, rồi MỘT búp sen mực nở bung ngang thắt lưng (nhìn chéo từ trên), cánh sen tách ra bay lên quá đầu rồi tan. Lõi mực lục thẫm, thân ngọc lục, mép trắng ngọc, vài đốm vàng nhạt. Không cột sáng, không vòng dưới chân.',
    element: 'moc',
    shapeLang: ['spiral', 'cloud'],
    silhouette: 'một búp sen mực nở bung quanh thắt lưng, cánh sen tách ra bay lên quá đầu',
    timing: { anticipationMs: 150, impactMs: 80, lingerMs: 600 },
    footprint: { lengthM: 2.2, widthM: 2.2, heightM: 2.8 },
    budget: { drawCalls: 4, particles: 60, screenCover: 0.03, overdraw: 3 },
    events: () => [
      sprite('chung_eddy', { t: 0, dur: 0.17, off: [0, -0.7, 0], size: 2.2, sizeTo: 1.0, tone: 'core', alpha: 0.6, erodeFrom: 0.8 }),
      parts('spark', 0, 14, { offset: [0, -0.5, 0], speed: 3, life: 0.14, inward: true, tone: 'body' }),
      sprite('chung_lotus', { t: 0.15, dur: 0.5, off: [0, -0.25, 0], size: 1.0, sizeTo: 2.1, erodeFrom: 0.45 }),
      accent('chung_lotus', 0.15, 1.3, { off: [0, -0.25, 0], sizeTo: 1.9 }),
      sprite('chung_petals', { t: 0.3, dur: 0.6, off: [0, 0.3, 0], size: 1.4, sizeTo: 2.0, up: 1.1, tone: 'rim', alpha: 0.85, erodeFrom: 0.4, tier: 1 }),
      parts('petal', 0.18, 16, { offset: [0, -0.2, 0], speed: 1.6, spread: 1, life: 0.9, size: 0.1, grav: -1.4, tone: 'rim' }),
      parts('spark', 0.3, 8, { speed: 1.2, spread: 1, life: 0.7, size: 0.06, grav: -1.2, tone: 'accent', tier: 1 }),
    ],
  },
  {
    id: 'fx_mana',
    pal: 'hit_mana',
    fxKind: 'potion',
    when: 'mp',
    replaces: ['potion'],
    I: 0.15,
    idea: 'HỒI LINH LỰC (đan hồi linh lực): khác hẳn hồi máu: một dải lụa mực lam chàm cuộn MỘT vòng hở quanh thân từ dưới lên như xoáy nước, rồi tách thành chùm giọt nước rơi NGƯỢC lên trời và tan. Lõi chàm tối, thân lam, mép trắng lạnh, vài đốm tím nhạt. Không cột sáng, không vòng kín dưới chân.',
    element: 'thuy',
    shapeLang: ['spiral'],
    silhouette: 'dải lụa mực cuộn một vòng hở quanh thân, đầu dải tách thành chùm giọt rơi ngược lên',
    timing: { anticipationMs: 150, impactMs: 80, lingerMs: 550 },
    footprint: { lengthM: 2.2, widthM: 2.2, heightM: 2.8 },
    budget: { drawCalls: 3, particles: 50, screenCover: 0.03, overdraw: 3 },
    events: () => [
      parts('spark', 0, 14, { at: 'self', offset: [0, -0.5, 0], speed: 3, life: 0.14, inward: true, tone: 'body' }),
      sprite('chung_eddy', { at: 'self', t: 0.15, dur: 0.5, off: [0, -0.2, 0], size: 1.5, sizeTo: 2.3, up: 0.5, erodeFrom: 0.45, follow: true }),
      accent('chung_eddy', 0.15, 1.6, { at: 'self', off: [0, -0.2, 0], sizeTo: 2.0, follow: true }),
      sprite('chung_drops', { at: 'self', t: 0.3, dur: 0.55, off: [0, 0.4, 0], size: 1.3, sizeTo: 1.8, up: 1.2, tone: 'rim', alpha: 0.85, erodeFrom: 0.4, tier: 1 }),
      parts('spark', 0.2, 18, { at: 'self', offset: [0, -0.2, 0], speed: 1.8, spread: 1, life: 0.8, size: 0.07, grav: -2, tone: 'rim' }),
    ],
  },
  {
    id: 'fx_potion',
    pal: 'hit_heal',
    fxKind: 'potion',
    replaces: ['potion'],
    I: 0.12,
    idea: 'DÙNG ĐAN (mọi lần uống đan không phải đan linh lực: hồi máu, buff, đổi linh căn): một làn khói đan mực nhỏ bốc từ ngực rồi tan thành vài cánh sáng bay lên. Rất nhỏ và nhanh (dùng thường xuyên; đan hồi máu còn có búp sen của nhịp hồi). Ngọc lục, lõi mực, mép trắng ngọc.',
    element: 'moc',
    shapeLang: ['cloud', 'spiral'],
    silhouette: 'một làn khói đan nhỏ cuộn bốc lên từ ngực rồi tan thành vài cánh sáng',
    timing: { anticipationMs: 120, impactMs: 70, lingerMs: 450 },
    footprint: { lengthM: 1.6, widthM: 1.6, heightM: 2.6 },
    budget: { drawCalls: 1, particles: 30, screenCover: 0.015, overdraw: 2 },
    events: () => [
      sprite('chung_puff', { at: 'self', t: 0, dur: 0.34, off: [0, 0, 0], size: 0.7, sizeTo: 1.6, up: 0.6, tone: 'body', alpha: 0.7, erodeFrom: 0.35 }),
      parts('spark', 0, 8, { at: 'self', speed: 2.4, life: 0.12, inward: true, tone: 'body' }),
      parts('petal', 0.12, 10, { at: 'self', speed: 1.5, spread: 1, life: 0.8, size: 0.09, grav: -1.4, tone: 'rim' }),
      parts('spark', 0.15, 6, { at: 'self', speed: 1.2, spread: 1, life: 0.6, size: 0.06, grav: -1.2, tone: 'accent', tier: 1 }),
    ],
  },
  {
    id: 'fx_heal_tick',
    pal: 'hit_heal',
    fxKind: '~heal_tick',
    I: 0,
    idea: 'NHỊP HỒI (mỗi lần nhận số hồi máu từ người khác hoặc hồi dần): chỉ một chùm cánh sen nhỏ bay lên từ vai rồi tan, không có búp sen. Rất nhỏ vì lặp mỗi giây.',
    element: 'moc',
    shapeLang: ['cloud'],
    silhouette: 'một chùm cánh sen nhỏ bay lên từ vai rồi tan',
    timing: { anticipationMs: 0, impactMs: 60, lingerMs: 400 },
    footprint: { lengthM: 1.2, widthM: 1.2, heightM: 2.4 },
    budget: { drawCalls: 1, particles: 10, screenCover: 0.01, overdraw: 1 },
    events: () => [
      sprite('chung_petals', { t: 0, dur: 0.5, off: [0, 0.2, 0], size: 0.9, sizeTo: 1.4, up: 0.9, erodeFrom: 0.4, alpha: 0.85 }),
      parts('petal', 0.03, 6, { speed: 1.3, spread: 1, life: 0.7, size: 0.08, grav: -1.4, tone: 'rim' }),
    ],
  },
  {
    id: 'fx_evade',
    pal: 'hit_chung',
    fxKind: '~evade',
    I: 0,
    idea: 'NÉ TRÚNG (đòn bị khung bất tử của thân pháp bỏ qua, server báo): một tàn ảnh mực mờ của người vừa lách khỏi chỗ cũ, ba bóng chồng nhạt dần, kèm một làn bụi mực. Lõi mực, thân xám lạnh, không sáng chói. Rất nhẹ, tan trong 0,3 giây.',
    element: 'vo',
    shapeLang: ['line', 'cloud'],
    silhouette: 'ba bóng người mực chồng nhau nhạt dần lách ngang, một làn bụi mực',
    timing: { anticipationMs: 0, impactMs: 50, lingerMs: 250 },
    footprint: { lengthM: 1.8, widthM: 1.2, heightM: 1.8 },
    budget: { drawCalls: 2, particles: 6, screenCover: 0.01, overdraw: 2 },
    events: () => [
      sprite('chung_dodge', { size: 1.7, sizeTo: 1.9, dur: 0.3, erodeFrom: 0.3, alpha: 0.75, tone: 'core' }),
      accent('chung_dodge', 0, 1.6, { dur: 0.07, alpha: 0.6 }),
      parts('dust', 0.02, 5, { speed: 1.4, spread: 0.8, life: 0.3, size: 0.2, tone: 'shadow', grav: -0.4, tier: 1 }),
    ],
  },
];

/** Dư ba (chuẩn 2): phải có sự kiện hình BẮT ĐẦU từ +150 ms; hiệu ứng tan ≤ 200 ms nên thêm vài hạt bụi mực rất nhỏ rơi nốt. */
const withTail = (evs, I) =>
  evs.some((e) => (e.t ?? 0) - I >= 0.15)
    ? evs
    : [...evs, parts('dust', r2(I + 0.15), 2, { speed: 0.6, spread: 0.5, life: 0.25, size: 0.1, tone: 'shadow', grav: 2, tier: 1 })];

for (const s of SCENES) {
  seq = 2000 + SCENES.indexOf(s) * 20;
  const tl = {
    skill: s.id,
    trigger: 'fx',
    fxKind: s.fxKind,
    ...(s.when ? { when: s.when } : {}),
    palette: s.pal,
    ...(s.replaces ? { replaces: s.replaces } : {}),
    events: withTail(s.events(), s.I),
  };
  fs.writeFileSync(path.join(fxDir, `${s.id}.json`), JSON.stringify(tl, null, 2) + '\n');
  const card = {
    skillId: s.id,
    idea: s.idea,
    element: s.element,
    path: '',
    scene: { palette: PAL[s.pal], impactAt: s.I },
    shapeLang: s.shapeLang,
    timing: s.timing,
    footprint: s.footprint,
    colorRole: 'own',
    telegraph: false,
    budget: s.budget,
    textures: [],
    silhouette: s.silhouette,
    standard: 2,
    materials: ['sprite', 'particles'],
  };
  fs.writeFileSync(path.join(cardDir, `${s.id}.json`), JSON.stringify(card, null, 2) + '\n');
}
console.log(`[trung-don] ${SCENES.length} timeline + thẻ; bảng màu: ${Object.keys(PAL).join(', ')}`);
console.log(JSON.stringify(PAL));
