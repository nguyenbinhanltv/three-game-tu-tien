# Sửa cổng Kính Nguyệt Cung (van_hai, ~1168,1598)

Trước: vành torus mỏng + hai hộp + đĩa mờ (độ đục 0,32) nhìn nghiêng qua sương thành chữ "IOI" trong mờ.
Sau (`buildMoonGate` trong `game/sect.ts`): bệ đá ba bậc, hai trụ bạc lam dày có đế và chóp, vòm torus dày + vòng viền sáng,
mặt gương là đĩa dày có gờ (lõi tối đặc, đĩa sáng độ đục gốc 0,5 phía trước), màu đỉnh, `fog: false`. Một lưới (+ đĩa sáng sẵn có) = 2 draw, ~1,5k tam giác.
Vị trí, trigger, vé không đổi. Ảnh: `truoc/`, `sau/` (nam, bắc, đông, tây, xa 80 m). Chụp lại: `pnpm --filter @dtl/perf exec tsx src/shots-gate.ts --out <thư mục tuyệt đối>`.
