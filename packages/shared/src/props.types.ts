// Kiểu của prop đặt tay (tách khỏi props.ts để props.<level>.ts không import ngược props.ts: không vòng phụ thuộc).
export interface HandProp {
  /** Asset id (assets/source/prop/<id>). */
  id: string;
  x: number;
  z: number;
  /** Quay quanh Y (rad); mặt trước model nhìn +Z khi 0. */
  yaw: number;
  /** Tỉ lệ đều so với kích thước chuẩn của asset. */
  s: number;
  /** Bán kính va chạm (m); không có thì không chặn đường. */
  r?: number;
}
