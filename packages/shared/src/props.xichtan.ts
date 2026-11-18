// Prop bày của Xích Tẫn Khích (DV-3D): khe nứt phụ, lòng chảo than hồng. Dùng prop sẵn có của Bắc Hoang (không model mới), chỉ tô cảnh, tất định.
// Vòng cột đá quanh sàn (chừa cửa nam, lối vào), Trấn Giới Bia ở tâm (đợt 4, khớp `steles` ở levels/xich_tan_khich.json), kiếm gãy và đèn rải quanh.
import type { HandProp } from './props';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({ x: Math.round((CX + Math.cos(a) * r) * 100) / 100, z: Math.round((CZ + Math.sin(a) * r) * 100) / 100 });

export const XICH_TAN_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * PI * 2;
    const deg = (a * 180) / PI;
    if (Math.abs(((deg - 90 + 540) % 360) - 180) < 14) continue;
    out.push({ id: i % 3 === 0 ? 'prop_da_dung' : 'prop_tru_da_khac_van', ...at(78 + (i % 2) * 4, a), yaw: a, s: 1 + ((i * 7) % 5) * 0.07 });
  }
  out.push({ id: 'prop_bia_da', x: CX, z: CZ, yaw: 0, s: 1.4 });
  for (let i = 0; i < 4; i++) out.push({ id: 'prop_den_long_troi', ...at(9, (i / 4) * PI * 2 + 0.4), yaw: 0, s: 1 });
  for (let i = 0; i < 9; i++) out.push({ id: 'prop_kiem_gay', ...at(20 + (i % 3) * 11, i * 0.75 + 0.3), yaw: i * 1.9, s: 1 });
  for (let i = 0; i < 5; i++) out.push({ id: 'prop_cay_goc_kho', ...at(60 + (i % 2) * 8, i * 1.3 + 2.2), yaw: i * 2.3, s: 1.05 });
  return out;
})();
