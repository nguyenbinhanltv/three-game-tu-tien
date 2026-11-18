// Prop bày của Xích Tẫn Khích (DV-3D): khe nứt phụ, lòng chảo than hồng. Dùng prop sẵn có của Bắc Hoang (không model mới), chỉ tô cảnh, tất định.
// Hai hàng cột dọc chân vách hẻm (DV-3K), Trấn Giới Bia ở tâm (đợt 4, khớp `steles` ở levels/xich_tan_khich.json), kiếm gãy và đèn rải quanh.
import type { HandProp } from './props';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  z: Math.round((CZ + Math.sin(a) * r) * 100) / 100,
});

export const XICH_TAN_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  // Hai hàng cột khắc vân dọc chân vách (x lệch ±41), cách 14 m, chừa quanh lối vào phía nam; cột đổ nghiêng do bộ rải của client thêm.
  for (let i = 0; i < 11; i++) {
    const z = CZ - 70 + i * 14;
    if (z > CZ + 40) continue;
    for (const sx of [-1, 1])
      out.push({
        id: (i + (sx > 0 ? 1 : 0)) % 3 === 0 ? 'prop_da_dung' : 'prop_tru_da_khac_van',
        x: CX + sx * (41 + (i % 2) * 2),
        z,
        yaw: sx > 0 ? PI : 0,
        s: 1.05 + ((i * 7) % 5) * 0.07,
      });
  }
  out.push({ id: 'prop_bia_da', x: CX, z: CZ, yaw: 0, s: 1.4 });
  for (let i = 0; i < 9; i++) out.push({ id: 'prop_kiem_gay', ...at(20 + (i % 3) * 11, i * 0.75 + 0.3), yaw: i * 1.9, s: 1 });
  return out;
})();
