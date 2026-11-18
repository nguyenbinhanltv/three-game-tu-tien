// Prop bày của Kim Dạ Cung (DV-3E): sảnh cung dát vàng của một triều đã chết, dựng trên lòng chảo như Thần Tàng Điện. Dùng prop sẵn có
// (không model mới), chỉ tô cảnh, tất định. Lối vào ở nam (+z); ngai ở bắc. Hai Trấn Giới Bia cùng chỗ với `kd.night.steles` của
// `boss_kim_da_ma_hau` (monsters.json), bốn đèn đố cùng chỗ với `puzzle.points` ở levels/kim_da_cung.json.
import type { HandProp } from './props.types';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  z: Math.round((CZ + Math.sin(a) * r) * 100) / 100,
});

export const KIM_DA_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  // Hàng cột dát vàng đã xỉn quanh sảnh (cách tâm 70–74 m), chừa cửa nam.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * PI * 2;
    const deg = (a * 180) / PI;
    if (Math.abs(((deg - 90 + 540) % 360) - 180) < 12) continue;
    out.push({ id: 'prop_tru_da_khac_van', ...at(70 + (i % 2) * 4, a), yaw: a, s: 1.15 + ((i * 7) % 5) * 0.06 });
  }
  // Hành lang cột kép từ cửa nam tới giữa sảnh: hai hàng đèn dẫn tới bốn cột đèn đố.
  for (let k = 0; k < 5; k++)
    for (const sx of [-1, 1]) out.push({ id: 'prop_den_long_troi', x: CX + sx * 16, z: CZ + 50 - k * 10, yaw: 0, s: 1.1 });
  // Hai Trấn Giới Bia của pha Kim dạ.
  for (const sx of [-16, 16]) out.push({ id: 'prop_bia_da', x: CX + sx, z: CZ, yaw: 0, s: 1.3 });
  // Ngai: bệ bia lớn ở bắc, hai bên tượng võ sĩ canh.
  out.push({ id: 'prop_bia_da', x: CX, z: CZ - 44, yaw: 0, s: 2.2 });
  for (const sx of [-12, 12]) out.push({ id: 'prop_tuong_da_vo_si', x: CX + sx, z: CZ - 40, yaw: 0, s: 1.15 });
  for (const sx of [-26, 26]) out.push({ id: 'prop_den_long_troi', x: CX + sx, z: CZ - 42, yaw: 0, s: 1.3 });
  // Bốn đèn đố (hành lang đèn, đợt 4).
  for (const [x, z] of [
    [1486, 1322],
    [1554, 1322],
    [1486, 1278],
    [1554, 1278],
  ] as const)
    out.push({ id: 'prop_den_long_troi', x, z, yaw: 0, s: 1.4 });
  // Kiếm gãy và gốc cây khô của vườn chết rải trong sảnh.
  for (let i = 0; i < 9; i++) out.push({ id: 'prop_kiem_gay', ...at(22 + (i % 3) * 12, i * 0.7 + 0.5), yaw: i * 1.9, s: 1 });
  for (let i = 0; i < 4; i++) out.push({ id: 'prop_cay_goc_kho', ...at(56 + (i % 2) * 6, i * 1.6 + 3.7), yaw: i * 2.3, s: 1.05 });
  return out;
})();
