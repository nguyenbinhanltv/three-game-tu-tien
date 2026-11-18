import * as THREE from 'three/webgpu';

/**
 * Thẻ pháp tướng vẽ 2D (VFX-V4 vòng 3): La Hán ngồi kiết già nửa thân + hào quang, Phượng hoàng dang cánh, vẽ bằng nét thủ tục trên canvas
 * (không dùng ảnh ngoài). Mã hóa cho shader `card` (render/vfx/stylized.ts): kênh R = tầng màu (0 bóng sẫm … 0,5 thân … 1 viền sáng),
 * kênh G = 1 ở phần dùng màu điểm nhấn (vàng / đỏ son), alpha = hình. Một texture mỗi thẻ.
 */
export type CardId = 'arhat' | 'phoenix' | 'ghost' | 'sword' | 'turtle';
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
    line(
      g,
      0.9,
      5,
      [
        [C + Math.cos(a) * r0, 235 + Math.sin(a) * r0],
        [C + Math.cos(a) * r1, 235 + Math.sin(a) * r1],
      ],
      1,
    );
  }
  // Đài sen: hai lớp cánh dưới.
  for (let k = 0; k < 2; k++) {
    const n = k === 0 ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const x = C + (i - (n - 1) / 2) * (k === 0 ? 50 : 56);
      const y = 700 - k * 26;
      fillPath(
        g,
        k === 0 ? 0.6 : 0.78,
        1,
        () => {
          g.moveTo(x, y - 62);
          g.quadraticCurveTo(x + 36, y - 10, x, y + 28);
          g.quadraticCurveTo(x - 36, y - 10, x, y - 62);
        },
        1,
        4,
      );
    }
  }
  // Hai chân bắt chéo (kiết già).
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.ellipse(C, 610, 210, 78, 0, 0, Math.PI * 2);
    },
    1,
    7,
  );
  line(g, 0.18, 7, [
    [90, 618],
    [180, 590],
    [256, 612],
  ]);
  line(g, 0.18, 7, [
    [422, 618],
    [332, 590],
    [256, 612],
  ]);
  line(g, 0.18, 6, [
    [130, 650],
    [256, 636],
    [382, 650],
  ]);
  // Thân áo cà sa: vai rộng, xuôi xuống.
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.moveTo(150, 340);
      g.quadraticCurveTo(256, 315, 362, 340);
      g.lineTo(420, 580);
      g.quadraticCurveTo(256, 640, 92, 580);
      g.closePath();
    },
    1,
    7,
  );
  // Dải áo vắt chéo (điểm nhấn vàng) + nếp áo.
  fillPath(
    g,
    0.62,
    1,
    () => {
      g.moveTo(170, 336);
      g.lineTo(212, 332);
      g.lineTo(380, 560);
      g.lineTo(330, 566);
      g.closePath();
    },
    1,
    4,
  );
  line(g, 0.18, 6, [
    [256, 360],
    [250, 470],
    [268, 560],
  ]);
  line(g, 0.18, 5, [
    [190, 420],
    [176, 520],
    [150, 580],
  ]);
  line(g, 0.18, 5, [
    [322, 420],
    [338, 520],
    [366, 580],
  ]);
  // Hai tay: từ vai xuống, chắp ấn trước ngực.
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.moveTo(150, 348);
      g.quadraticCurveTo(92, 440, 168, 500);
      g.lineTo(256, 470);
      g.lineTo(230, 430);
      g.quadraticCurveTo(166, 450, 176, 372);
      g.closePath();
    },
    1,
    6,
  );
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.moveTo(362, 348);
      g.quadraticCurveTo(420, 440, 344, 500);
      g.lineTo(256, 470);
      g.lineTo(282, 430);
      g.quadraticCurveTo(346, 450, 336, 372);
      g.closePath();
    },
    1,
    6,
  );
  fillPath(
    g,
    0.8,
    1,
    () => {
      g.ellipse(256, 470, 46, 34, 0, 0, Math.PI * 2);
    },
    1,
    6,
  );
  line(g, 0.2, 4, [
    [236, 470],
    [276, 470],
  ]);
  // Cổ + đầu + tai dài + búi tóc + điểm bạch hào.
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.rect(226, 288, 60, 50);
    },
    1,
    5,
  );
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.ellipse(256, 232, 62, 74, 0, 0, Math.PI * 2);
    },
    1,
    7,
  );
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.ellipse(190, 252, 14, 46, 0.1, 0, Math.PI * 2);
    },
    1,
    4,
  );
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.ellipse(322, 252, 14, 46, -0.1, 0, Math.PI * 2);
    },
    1,
    4,
  );
  fillPath(
    g,
    0.8,
    1,
    () => {
      g.ellipse(256, 152, 34, 28, 0, 0, Math.PI * 2);
    },
    1,
    5,
  );
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
    line(g, 0.12, 5, [
      [256 + s * 12, 208],
      [256 + s * 42, 204],
    ]);
  }
  line(g, 0.12, 4, [
    [240, 266],
    [256, 272],
    [272, 266],
  ]);
}

function drawPhoenix(g: Ctx): void {
  const C = 384;
  const feather = (x: number, y: number, ang: number, len: number, w: number, tier: number, acc: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    fillPath(
      g,
      tier,
      acc,
      () => {
        g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.45, -w, len, 0);
        g.quadraticCurveTo(len * 0.45, w, 0, 0);
      },
      1,
      4,
    );
    line(g, 0.15, 3, [
      [len * 0.08, 0],
      [len * 0.9, 0],
    ]);
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
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.moveTo(C, 190);
      g.quadraticCurveTo(C + 90, 290, C + 20, 400);
      g.quadraticCurveTo(C, 420, C - 20, 400);
      g.quadraticCurveTo(C - 90, 290, C, 190);
    },
    1,
    7,
  );
  fillPath(
    g,
    0.85,
    1,
    () => {
      g.ellipse(C, 300, 34, 70, 0, 0, Math.PI * 2);
    },
    1,
    4,
  );
  // Cổ cong + đầu + mỏ + mào ba lông.
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.moveTo(C - 22, 200);
      g.quadraticCurveTo(C - 40, 120, C - 6, 96);
      g.lineTo(C + 22, 110);
      g.quadraticCurveTo(C + 28, 160, C + 22, 200);
      g.closePath();
    },
    1,
    6,
  );
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.ellipse(C, 92, 34, 28, 0, 0, Math.PI * 2);
    },
    1,
    6,
  );
  fillPath(
    g,
    0.85,
    1,
    () => {
      g.moveTo(C + 28, 86);
      g.lineTo(C + 74, 100);
      g.lineTo(C + 28, 108);
      g.closePath();
    },
    1,
    4,
  );
  g.beginPath();
  g.arc(C + 10, 86, 6, 0, Math.PI * 2);
  g.fillStyle = col(0.1);
  g.fill();
  for (let i = 0; i < 3; i++) {
    feather(C - 6, 70, -Math.PI / 2 + (i - 1) * 0.5, 80 - Math.abs(i - 1) * 16, 12, 0.8, 1);
  }
}

/** Hồn thể / tàn ảnh: bóng người đứng (áo dài, búi tóc, kiếm sau lưng) 256×512 dùng cho xuất khiếu và thuấn di. */
function drawGhost(g: Ctx): void {
  const C = 128;
  // Kiếm sau lưng.
  line(
    g,
    1,
    8,
    [
      [C + 40, 120],
      [C - 36, 330],
    ],
    1,
  );
  line(
    g,
    0.6,
    4,
    [
      [C + 40, 120],
      [C - 36, 330],
    ],
    1,
  );
  // Chân + giày.
  for (const s of [-1, 1]) {
    fillPath(g, 0.5, 0, () => g.rect(C + s * 26 - 14, 380, 28, 80), 1, 4);
    fillPath(g, 0.8, 1, () => g.ellipse(C + s * 26, 470, 24, 12, 0, 0, Math.PI * 2), 1, 3);
  }
  // Áo dài choàng, vạt xòe, đai lưng (điểm nhấn).
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.moveTo(84, 118);
      g.quadraticCurveTo(C, 104, 172, 118);
      g.lineTo(196, 392);
      g.quadraticCurveTo(C, 410, 60, 392);
      g.closePath();
    },
    1,
    6,
  );
  fillPath(g, 0.78, 1, () => g.rect(76, 236, 104, 22), 1, 3);
  line(g, 0.18, 5, [
    [C, 130],
    [C - 6, 230],
    [C, 395],
  ]);
  line(g, 0.18, 4, [
    [96, 270],
    [84, 380],
  ]);
  line(g, 0.18, 4, [
    [160, 270],
    [172, 380],
  ]);
  // Hai tay buông, tay áo rộng.
  for (const s of [-1, 1]) {
    fillPath(
      g,
      0.55,
      0,
      () => {
        g.moveTo(C + s * 44, 120);
        g.quadraticCurveTo(C + s * 86, 200, C + s * 70, 330);
        g.lineTo(C + s * 36, 320);
        g.quadraticCurveTo(C + s * 40, 220, C + s * 30, 140);
        g.closePath();
      },
      1,
      5,
    );
  }
  // Cổ + đầu + búi tóc.
  fillPath(g, 0.5, 0, () => g.rect(C - 14, 94, 28, 30), 1, 4);
  fillPath(g, 0.6, 0, () => g.ellipse(C, 66, 30, 36, 0, 0, Math.PI * 2), 1, 5);
  fillPath(g, 0.85, 1, () => g.ellipse(C, 32, 16, 14, 0, 0, Math.PI * 2), 1, 3);
  line(g, 0.12, 4, [
    [C - 16, 66],
    [C - 6, 66],
  ]);
  line(g, 0.12, 4, [
    [C + 6, 66],
    [C + 16, 66],
  ]);
}

/**
 * Kiếm long ngọc (RFX-1, pháp tướng Hóa Thần của Kiếm tu): thanh trường kiếm dựng đứng, rồng ngọc uốn quanh thân kiếm, vành sáng sau lưng.
 * Điểm nhấn (kênh G) là thân rồng và đường huyết tào.
 */
function drawSword(g: Ctx): void {
  const C = 256;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(C, 360, 232, 0, Math.PI * 2);
  g.strokeStyle = col(0.7, 1);
  g.lineWidth = 8;
  g.stroke();
  g.beginPath();
  g.arc(C, 360, 204, 0, Math.PI * 2);
  g.strokeStyle = col(1, 0);
  g.lineWidth = 3;
  g.stroke();
  // Lưỡi kiếm: hai tông (sống tối, mặt sáng), mũi nhọn.
  fillPath(
    g,
    0.55,
    0,
    () => {
      g.moveTo(C, 30);
      g.lineTo(C + 34, 120);
      g.lineTo(C + 30, 540);
      g.lineTo(C - 30, 540);
      g.lineTo(C - 34, 120);
      g.closePath();
    },
    1,
    7,
  );
  fillPath(
    g,
    0.85,
    0,
    () => {
      g.moveTo(C, 44);
      g.lineTo(C + 26, 124);
      g.lineTo(C + 22, 532);
      g.lineTo(C, 532);
      g.closePath();
    },
    0,
  );
  line(g, 0.15, 5, [
    [C, 70],
    [C, 520],
  ]);
  line(g, 1, 4, [
    [C - 14, 150],
    [C - 14, 500],
  ]);
  // Chắn kiếm hình cánh + chuôi + chuôi tròn.
  fillPath(
    g,
    0.6,
    1,
    () => {
      g.moveTo(C - 130, 560);
      g.quadraticCurveTo(C - 70, 520, C, 546);
      g.quadraticCurveTo(C + 70, 520, C + 130, 560);
      g.quadraticCurveTo(C + 70, 590, C, 580);
      g.quadraticCurveTo(C - 70, 590, C - 130, 560);
      g.closePath();
    },
    1,
    5,
  );
  fillPath(g, 0.4, 0, () => g.rect(C - 14, 580, 28, 120), 1, 4);
  for (let i = 0; i < 4; i++)
    line(
      g,
      0.85,
      4,
      [
        [C - 14, 598 + i * 26],
        [C + 14, 612 + i * 26],
      ],
      1,
    );
  fillPath(g, 0.85, 1, () => g.arc(C, 722, 22, 0, Math.PI * 2), 1, 4);
  // Rồng ngọc uốn quanh thân: dải dày chạy chữ S, nét sáng ở lưng, vảy là chấm, đầu ở phía mũi kiếm.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    pts.push([C + Math.sin(f * Math.PI * 3.2 + 0.4) * (92 - f * 26), 640 - f * 520]);
  }
  line(g, 0.18, 34, pts);
  line(g, 0.78, 26, pts, 1);
  line(
    g,
    1,
    7,
    pts.map(([x, y]) => [x - 6, y - 4] as [number, number]),
    1,
  );
  for (let i = 3; i < 40; i += 2) {
    const [x, y] = pts[i];
    fillPath(g, 1, 1, () => g.arc(x + 4, y, 4, 0, Math.PI * 2));
  }
  // Đầu rồng, sừng và râu.
  const hx = pts[40][0];
  const hy = pts[40][1];
  fillPath(
    g,
    0.78,
    1,
    () => {
      g.moveTo(hx - 34, hy + 10);
      g.quadraticCurveTo(hx, hy - 34, hx + 46, hy - 6);
      g.lineTo(hx + 30, hy + 20);
      g.quadraticCurveTo(hx, hy + 30, hx - 34, hy + 10);
      g.closePath();
    },
    1,
    5,
  );
  line(
    g,
    1,
    5,
    [
      [hx - 10, hy - 20],
      [hx - 36, hy - 56],
      [hx - 54, hy - 52],
    ],
    1,
  );
  line(
    g,
    1,
    5,
    [
      [hx + 6, hy - 22],
      [hx + 14, hy - 62],
      [hx + 36, hy - 66],
    ],
    1,
  );
  line(
    g,
    0.85,
    4,
    [
      [hx + 44, hy],
      [hx + 90, hy - 22],
      [hx + 116, hy + 20],
    ],
    1,
  );
  fillPath(g, 0.1, 0, () => g.arc(hx + 14, hy - 4, 5, 0, Math.PI * 2));
  // Đuôi rồng xòe ở chân kiếm.
  line(
    g,
    0.78,
    12,
    [
      [pts[0][0], 640],
      [pts[0][0] + 60, 668],
      [pts[0][0] + 100, 640],
    ],
    1,
  );
}

/**
 * Huyền vũ đá (RFX-1, pháp tướng Hóa Thần của Hộ pháp): rùa khổng lồ mai lục giác, rắn quấn mai ngóc đầu, sóng nước dưới chân.
 */
function drawTurtle(g: Ctx): void {
  const C = 384;
  g.lineCap = 'round';
  // Sóng nước dưới chân (điểm nhấn).
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.ellipse(C, 560, 330 - k * 44, 56 - k * 10, 0, 0, Math.PI * 2);
    g.strokeStyle = col(0.7 + k * 0.1, 1);
    g.lineWidth = 6 - k;
    g.stroke();
  }
  // Bốn chân.
  for (const [x, y] of [
    [170, 500],
    [250, 530],
    [520, 530],
    [600, 500],
  ] as const) {
    fillPath(g, 0.45, 0, () => g.ellipse(x, y, 48, 38, 0, 0, Math.PI * 2), 1, 5);
    for (const d of [-16, 0, 16])
      line(g, 0.15, 3, [
        [x + d, y + 22],
        [x + d, y + 34],
      ]);
  }
  // Cổ và đầu quay sang trái.
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.moveTo(180, 420);
      g.quadraticCurveTo(110, 380, 96, 300);
      g.lineTo(150, 292);
      g.quadraticCurveTo(170, 360, 250, 380);
      g.closePath();
    },
    1,
    6,
  );
  fillPath(g, 0.6, 0, () => g.ellipse(112, 280, 56, 40, -0.3, 0, Math.PI * 2), 1, 6);
  fillPath(g, 0.1, 0, () => g.arc(100, 268, 6, 0, Math.PI * 2));
  line(
    g,
    0.85,
    4,
    [
      [70, 296],
      [112, 306],
    ],
    1,
  );
  // Mai: vòm bán nguyệt, lưới lục giác hai tầng.
  fillPath(
    g,
    0.5,
    0,
    () => {
      g.moveTo(C - 280, 500);
      g.bezierCurveTo(C - 280, 170, C + 280, 170, C + 280, 500);
      g.quadraticCurveTo(C, 560, C - 280, 500);
      g.closePath();
    },
    1,
    9,
  );
  fillPath(g, 0.78, 0, () => {
    g.moveTo(C - 250, 470);
    g.bezierCurveTo(C - 240, 220, C + 240, 220, C + 250, 470);
    g.quadraticCurveTo(C, 520, C - 250, 470);
    g.closePath();
  });
  for (let r = 0; r < 3; r++) {
    const cols = r === 0 ? 4 : 5;
    for (let c = 0; c < cols; c++) {
      const x = C + (c - (cols - 1) / 2) * 100;
      const y = 280 + r * 80;
      fillPath(
        g,
        0.55,
        1,
        () => {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            const px = x + Math.cos(a) * 44;
            const py = y + Math.sin(a) * 38;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
        },
        0.18,
        4,
      );
    }
  }
  // Rắn quấn từ đuôi bên phải lên quanh mai, ngóc đầu phía trên.
  const sp: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const f = i / 30;
    sp.push([C + 300 - f * 520 + Math.sin(f * 9) * 14, 520 - Math.sin(f * Math.PI) * 330 + Math.cos(f * 7) * 10]);
  }
  line(g, 0.18, 30, sp);
  line(g, 0.7, 22, sp, 1);
  line(
    g,
    1,
    5,
    sp.map(([x, y]) => [x, y - 6] as [number, number]),
    1,
  );
  const [sx, sy] = sp[30];
  fillPath(g, 0.78, 1, () => g.ellipse(sx - 10, sy - 18, 34, 22, -0.5, 0, Math.PI * 2), 1, 5);
  fillPath(g, 0.1, 0, () => g.arc(sx - 20, sy - 24, 5, 0, Math.PI * 2));
  line(
    g,
    0.85,
    4,
    [
      [sx - 40, sy - 8],
      [sx - 70, sy - 6],
      [sx - 82, sy + 8],
    ],
    1,
  );
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
    const w = id === 'arhat' || id === 'sword' ? 512 : id === 'ghost' ? 256 : 768;
    const h = id === 'arhat' || id === 'sword' ? 768 : id === 'ghost' ? 512 : 640;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (id === 'arhat') drawArhat(g);
    else if (id === 'ghost') drawGhost(g);
    else if (id === 'sword') drawSword(g);
    else if (id === 'turtle') drawTurtle(g);
    else drawPhoenix(g);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
  tex.set(id, t);
  return t;
}
