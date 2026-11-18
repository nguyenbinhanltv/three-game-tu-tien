// Prop bày của Kính Nguyệt Cung (E3-M): lòng chảo Kiếm Trủng dựng thành sảnh gương treo giữa mây.
// Dùng prop sẵn có của Vân Hải (cổng đình, Kính Hồ Đài, đá trôi, ảnh ngọc kính) + đèn đá Vân Lam; chỉ tô cảnh (cột đá trôi không va chạm), tất định.
import type { HandProp } from './props.types';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  z: Math.round((CZ + Math.sin(a) * r) * 100) / 100,
});

export const KINH_NGUYET_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  // Cổng đình ở lối vào phía nam (+z), nơi vào/ra.
  out.push({ id: 'prop_phu_dao_dinh', x: CX, z: 1338, yaw: PI, s: 1.5 });
  // Kính Hồ Đài (mặt gương đá) sau lưng khu đánh boss, phía bắc.
  out.push({ id: 'prop_kinh_ho_dai', x: CX, z: 1226, yaw: 0, s: 1.5 });
  // Vòng cột đá trôi quanh sảnh (cách tâm 74–84 m), chừa cửa phía nam.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < 0.28) continue;
    out.push({ id: 'prop_da_troi', ...at(74 + (i % 3) * 5, a), yaw: (i * 2.399) % (PI * 2), s: 0.8 + ((i * 7) % 5) * 0.07 });
  }
  // Mảnh gương cắm trên sàn (ảnh ngọc kính, nhỏ) rải quanh khu đánh.
  for (let i = 0; i < 9; i++) {
    const a = i * 2.17;
    out.push({ id: 'prop_anh_ngoc_kinh', ...at(18 + ((i * 13) % 34), a), yaw: a * 2, s: 3 + (i % 3) * 0.5 });
  }
  // Đèn đá dọc lối vào và vòng sảnh: ánh lạnh trên nền tối.
  for (const z of [1318, 1330, 1344, 1358])
    out.push({ id: 'prop_den_da', x: 1511, z, yaw: 0, s: 1 }, { id: 'prop_den_da', x: 1529, z, yaw: 0, s: 1 });
  for (const a of [0.7, 1.7, 2.7, 3.7, 4.7, 5.7]) out.push({ id: 'prop_den_da', ...at(56, a), yaw: 0, s: 1.1 });
  return out;
})();
