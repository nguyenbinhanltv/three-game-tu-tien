import * as THREE from 'three/webgpu';

/**
 * Thẻ pháp tướng vẽ 2D (VFX-V4 vòng 3): La Hán ngồi kiết già nửa thân + hào quang, Phượng hoàng dang cánh, vẽ bằng nét thủ tục trên canvas
 * (không dùng ảnh ngoài). Mã hóa cho shader `card` (render/vfx/stylized.ts): kênh R = tầng màu (0 bóng sẫm … 0,5 thân … 1 viền sáng),
 * kênh G = 1 ở phần dùng màu điểm nhấn (vàng / đỏ son), alpha = hình. Một texture mỗi thẻ.
 */
export type CardId = 'arhat' | 'phoenix';
export const CARD_INDEX: Record<CardId, number> = { arhat: 0, phoenix: 1 };
/** Tỉ lệ rộng/cao của thẻ. */
export const CARD_ASPECT: Record<CardId, number> = { arhat: 512 / 768, phoenix: 768 / 640 };

type Ctx = CanvasRenderingContext2D;
const col = (tier: number, acc = 0) => `rgb(${Math.round(tier * 255)},${Math.round(acc * 255)},0)`;

function fillPath(g: Ctx, tier: number, acc: number, draw: () => void, outline = 0, olw = 6): void {
  g.beginPath();
  draw();
  g.fillStyle = col(tier, acc);
  g.fill();
  if (outline > 0) {
    g.strokeStyle = col(outline, acc);
    g.lineWidth = olw;
    g.lineJoin = 'round';
    g.stroke();
  }
}

function line(g: Ctx, tier: number, w: number, pts: [number, number][], acc = 0): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.strokeStyle = col(tier, acc);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.stroke();
}

function drawArhat(g: Ctx): void {
  const C = 256;
  // Hào quang: vành đôi + 28 tia, điểm nhấn vàng.
  g.lineCap = 'round';
  g.beginPath();
  g.arc(C, 235, 205, 0, Math.PI * 2);
  g.strokeStyle = col(1, 1);
  g.lineWidth = 12;
  g.stroke();
  g.beginPath();
  g.arc(C, 235, 176, 0, Math.PI * 2);
  g.strokeStyle = col(0.7, 1);
  g.lineWidth = 6;
  g.stroke();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r0 = 214;
    const r1 = 236 + (i % 2) * 22;
    line(g, 0.9, 5, [[C + Math.cos(a) * r0, 235 + Math.sin(a) * r0], [C + Math.cos(a) * r1, 235 + Math.sin(a) * r1]], 1);
  }
  // Đài sen: hai lớp cánh dưới.
  for (let k = 0; k < 2; k++) {
    const n = k === 0 ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const x = C + (i - (n - 1) / 2) * (k === 0 ? 50 : 56);
      const y = 700 - k * 26;
      fillPath(g, k === 0 ? 0.6 : 0.78, 1, () => {
        g.moveTo(x, y - 62);
        g.quadraticCurveTo(x + 36, y - 10, x, y + 28);
        g.quadraticCurveTo(x - 36, y - 10, x, y - 62);
      }, 1, 4);
    }
  }
  // Hai chân bắt chéo (kiết già).
  fillPath(g, 0.5, 0, () => {
    g.ellipse(C, 610, 210, 78, 0, 0, Math.PI * 2);
  }, 1, 7);
  line(g, 0.18, 7, [[90, 618], [180, 590], [256, 612]]);
  line(g, 0.18, 7, [[422, 618], [332, 590], [256, 612]]);
  line(g, 0.18, 6, [[130, 650], [256, 636], [382, 650]]);
  // Thân áo cà sa: vai rộng, xuôi xuống.
  fillPath(g, 0.5, 0, () => {
    g.moveTo(150, 340);
    g.quadraticCurveTo(256, 315, 362, 340);
    g.lineTo(420, 580);
    g.quadraticCurveTo(256, 640, 92, 580);
    g.closePath();
  }, 1, 7);
  // Dải áo vắt chéo (điểm nhấn vàng) + nếp áo.
  fillPath(g, 0.62, 1, () => {
    g.moveTo(170, 336);
    g.lineTo(212, 332);
    g.lineTo(380, 560);
    g.lineTo(330, 566);
    g.closePath();
  }, 1, 4);
  line(g, 0.18, 6, [[256, 360], [250, 470], [268, 560]]);
  line(g, 0.18, 5, [[190, 420], [176, 520], [150, 580]]);
  line(g, 0.18, 5, [[322, 420], [338, 520], [366, 580]]);
  // Hai tay: từ vai xuống, chắp ấn trước ngực.
  fillPath(g, 0.55, 0, () => {
    g.moveTo(150, 348);
    g.quadraticCurveTo(92, 440, 168, 500);
    g.lineTo(256, 470);
    g.lineTo(230, 430);
    g.quadraticCurveTo(166, 450, 176, 372);
    g.closePath();
  }, 1, 6);
  fillPath(g, 0.55, 0, () => {
    g.moveTo(362, 348);
    g.quadraticCurveTo(420, 440, 344, 500);
    g.lineTo(256, 470);
    g.lineTo(282, 430);
    g.quadraticCurveTo(346, 450, 336, 372);
    g.closePath();
  }, 1, 6);
  fillPath(g, 0.8, 1, () => {
    g.ellipse(256, 470, 46, 34, 0, 0, Math.PI * 2);
  }, 1, 6);
  line(g, 0.2, 4, [[236, 470], [276, 470]]);
  // Cổ + đầu + tai dài + búi tóc + điểm bạch hào.
  fillPath(g, 0.5, 0, () => {
    g.rect(226, 288, 60, 50);
  }, 1, 5);
  fillPath(g, 0.55, 0, () => {
    g.ellipse(256, 232, 62, 74, 0, 0, Math.PI * 2);
  }, 1, 7);
  fillPath(g, 0.5, 0, () => {
    g.ellipse(190, 252, 14, 46, 0.1, 0, Math.PI * 2);
  }, 1, 4);
  fillPath(g, 0.5, 0, () => {
    g.ellipse(322, 252, 14, 46, -0.1, 0, Math.PI * 2);
  }, 1, 4);
  fillPath(g, 0.8, 1, () => {
    g.ellipse(256, 152, 34, 28, 0, 0, Math.PI * 2);
  }, 1, 5);
  g.beginPath();
  g.arc(256, 196, 6, 0, Math.PI * 2);
  g.fillStyle = col(1, 1);
  g.fill();
  // Mặt: mắt khép, mày, miệng.
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(256 + s * 26, 228, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokeStyle = col(0.12);
    g.lineWidth = 5;
    g.stroke();
    line(g, 0.12, 5, [[256 + s * 12, 208], [256 + s * 42, 204]]);
  }
  line(g, 0.12, 4, [[240, 266], [256, 272], [272, 266]]);
}

function drawPhoenix(g: Ctx): void {
  const C = 384;
  const feather = (x: number, y: number, ang: number, len: number, w: number, tier: number, acc: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    fillPath(g, tier, acc, () => {
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.45, -w, len, 0);
      g.quadraticCurveTo(len * 0.45, w, 0, 0);
    }, 1, 4);
    line(g, 0.15, 3, [[len * 0.08, 0], [len * 0.9, 0]]);
    g.restore();
  };
  // Đuôi dài rủ xuống: bảy lông cong, vòng mắt ở đầu lông.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i - 3) * 0.2;
    const ln = 250 - Math.abs(i - 3) * 22;
    feather(C, 372, a, ln, 20, i % 2 ? 0.5 : 0.68, i % 2 ? 1 : 0);
    g.beginPath();
    g.arc(C + Math.cos(a) * (ln - 10), 372 + Math.sin(a) * (ln - 10), 10, 0, Math.PI * 2);
    g.fillStyle = col(1, 1);
    g.fill();
  }
  // Hai cánh dang rộng: hai tầng lông (lông bay dài ở sau, lông phủ ngắn ở trước).
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      feather(C + s * 40, 250, s > 0 ? -0.6 + i * 0.19 : Math.PI + 0.6 - i * 0.19, 330 - i * 12, 34, i % 2 ? 0.55 : 0.72, i % 2 ? 0 : 1);
    }
    for (let i = 0; i < 7; i++) {
      feather(C + s * 40, 268, s > 0 ? -0.35 + i * 0.22 : Math.PI + 0.35 - i * 0.22, 200 - i * 10, 26, i % 2 ? 0.8 : 0.62, i % 2 ? 1 : 0);
    }
  }
  // Thân hình giọt nước + ngực sáng.
  fillPath(g, 0.55, 0, () => {
    g.moveTo(C, 190);
    g.quadraticCurveTo(C + 90, 290, C + 20, 400);
    g.quadraticCurveTo(C, 420, C - 20, 400);
    g.quadraticCurveTo(C - 90, 290, C, 190);
  }, 1, 7);
  fillPath(g, 0.85, 1, () => {
    g.ellipse(C, 300, 34, 70, 0, 0, Math.PI * 2);
  }, 1, 4);
  // Cổ cong + đầu + mỏ + mào ba lông.
  fillPath(g, 0.55, 0, () => {
    g.moveTo(C - 22, 200);
    g.quadraticCurveTo(C - 40, 120, C - 6, 96);
    g.lineTo(C + 22, 110);
    g.quadraticCurveTo(C + 28, 160, C + 22, 200);
    g.closePath();
  }, 1, 6);
  fillPath(g, 0.55, 0, () => {
    g.ellipse(C, 92, 34, 28, 0, 0, Math.PI * 2);
  }, 1, 6);
  fillPath(g, 0.85, 1, () => {
    g.moveTo(C + 28, 86);
    g.lineTo(C + 74, 100);
    g.lineTo(C + 28, 108);
    g.closePath();
  }, 1, 4);
  g.beginPath();
  g.arc(C + 10, 86, 6, 0, Math.PI * 2);
  g.fillStyle = col(0.1);
  g.fill();
  for (let i = 0; i < 3; i++) {
    feather(C - 6, 70, -Math.PI / 2 + (i - 1) * 0.5, 80 - Math.abs(i - 1) * 16, 12, 0.8, 1);
  }
}

const tex = new Map<CardId, THREE.Texture>();

/** Texture của một thẻ (dựng một lần, nạp lười). Không có `document` (test) thì trả texture trống. */
export function cardTexture(id: CardId): THREE.Texture {
  const hit = tex.get(id);
  if (hit) return hit;
  let t: THREE.Texture;
  if (typeof document === 'undefined') {
    t = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    t.needsUpdate = true;
  } else {
    const w = id === 'arhat' ? 512 : 768;
    const h = id === 'arhat' ? 768 : 640;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (id === 'arhat') drawArhat(g);
    else drawPhoenix(g);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
  tex.set(id, t);
  return t;
}
