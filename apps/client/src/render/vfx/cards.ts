import * as THREE from 'three/webgpu';

/**
 * Thẻ pháp tướng vẽ 2D (VFX-V4 vòng 3): La Hán ngồi kiết già nửa thân + hào quang, Phượng hoàng dang cánh, vẽ bằng nét thủ tục trên canvas
 * (không dùng ảnh ngoài). Mã hóa cho shader `card` (render/vfx/stylized.ts): kênh R = tầng màu (0 bóng sẫm … 0,5 thân … 1 viền sáng),
 * kênh G = 1 ở phần dùng màu điểm nhấn (vàng / đỏ son), alpha = hình. Một texture mỗi thẻ.
 */
type CardId = 'arhat' | 'phoenix' | 'ghost' | 'infant' | 'colossus' | 'fist';
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
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
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
 * Nguyên Anh (RFX-1): hài nhi ngồi thiền kiết già trên đài sen, hào quang tròn sau lưng. Thân vàng (tầng giữa) viền vàng kim dày (tầng sáng, điểm nhấn),
 * mặt có mắt nhắm + miệng cười + chấm giữa trán (tầng sẫm), hai tay kết ấn trước ngực: đọc ra hình hài nhi ngồi thiền chứ không phải bóng trắng.
 */
/**
 * Cổ Thần khổng lồ (TN-5, cảnh Hóa Hình) 512×768: thân từ eo trở lên nhìn thẳng, đầu có hai sừng cong, vai rộng, hai tay gập khoe cơ
 * (cánh tay đưa ngang, cẳng tay dựng, nắm đấm). Viền sáng (tier 1) quanh toàn thân, vân kim văn (điểm nhấn vàng) trên ngực, vai, tay, trán;
 * thân dưới chìm dần vào mặt đất (mờ ở đáy), đỉnh đầu mờ nhẹ.
 */
function drawColossus(g: Ctx): void {
  const C = 256;
  const body = 0.46;
  const dark = 0.22;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Hai tay: cánh tay đưa ra ngoài rồi cẳng tay dựng lên, viền sáng bên ngoài, nắm đấm ở đầu.
  for (const s of [-1, 1]) {
    const pts: [number, number][] = [
      [C + s * 150, 292],
      [C + s * 218, 372],
      [C + s * 214, 214],
    ];
    line(g, 1, 96, pts);
    line(g, body, 80, pts);
    line(g, dark, 22, [
      [C + s * 164, 306],
      [C + s * 212, 366],
    ]);
    fillPath(g, body, 0, () => g.arc(C + s * 214, 170, 50, 0, Math.PI * 2), 1, 9);
    // vân trên tay: hai đai kim văn quanh cánh tay + một vạch chữ V trên nắm đấm
    for (const [x, y, a] of [
      [C + s * 190, 332, 0.5],
      [C + s * 216, 288, 0.1],
    ] as const)
      line(
        g,
        0.9,
        7,
        [
          [x - 26 * Math.cos(a), y + 26 * Math.sin(a)],
          [x + 26 * Math.cos(a), y - 26 * Math.sin(a)],
        ],
        1,
      );
    line(
      g,
      0.95,
      7,
      [
        [C + s * 190, 150],
        [C + s * 214, 190],
        [C + s * 238, 150],
      ],
      1,
    );
  }
  // Thân: vai rộng thu về eo.
  fillPath(
    g,
    body,
    0,
    () => {
      g.moveTo(C - 168, 276);
      g.quadraticCurveTo(C - 120, 226, C - 52, 222);
      g.lineTo(C + 52, 222);
      g.quadraticCurveTo(C + 120, 226, C + 168, 276);
      g.lineTo(C + 132, 768);
      g.lineTo(C - 132, 768);
      g.closePath();
    },
    1,
    10,
  );
  // Bóng dưới ngực (khối cơ) để thân có khối.
  for (const s of [-1, 1]) {
    fillPath(
      g,
      dark,
      0,
      () => {
        g.moveTo(C + s * 12, 372);
        g.quadraticCurveTo(C + s * 84, 392, C + s * 126, 350);
        g.quadraticCurveTo(C + s * 96, 440, C + s * 12, 430);
        g.closePath();
      },
      0,
    );
  }
  // Cổ + đầu + hai sừng.
  fillPath(g, body, 0, () => g.rect(C - 34, 188, 68, 54), 1, 8);
  for (const s of [-1, 1]) {
    fillPath(
      g,
      body,
      0,
      () => {
        g.moveTo(C + s * 40, 120);
        g.quadraticCurveTo(C + s * 104, 96, C + s * 96, 22);
        g.quadraticCurveTo(C + s * 64, 70, C + s * 30, 84);
        g.closePath();
      },
      1,
      8,
    );
  }
  fillPath(g, body, 0, () => g.ellipse(C, 142, 58, 66, 0, 0, Math.PI * 2), 1, 10);
  // Mắt (sáng) và kim văn trán.
  for (const s of [-1, 1])
    line(
      g,
      1,
      9,
      [
        [C + s * 14, 140],
        [C + s * 40, 134],
      ],
      1,
    );
  line(
    g,
    0.95,
    6,
    [
      [C, 90],
      [C, 112],
    ],
    1,
  );
  // Vân kim văn trên ngực: ba lớp chữ V lồng nhau, ấn tròn giữa ngực, hai đường gân vai.
  for (let i = 0; i < 3; i++)
    line(
      g,
      0.9 - i * 0.08,
      8,
      [
        [C - 96 + i * 20, 292 + i * 34],
        [C, 372 + i * 40],
        [C + 96 - i * 20, 292 + i * 34],
      ],
      1,
    );
  g.beginPath();
  g.arc(C, 330, 22, 0, Math.PI * 2);
  g.strokeStyle = col(1, 1);
  g.lineWidth = 7;
  g.stroke();
  for (const s of [-1, 1]) {
    line(
      g,
      0.85,
      6,
      [
        [C + s * 60, 238],
        [C + s * 128, 262],
        [C + s * 150, 300],
      ],
      1,
    );
    line(
      g,
      0.8,
      5,
      [
        [C + s * 36, 450],
        [C + s * 40, 560],
        [C + s * 44, 680],
      ],
      1,
    );
  }
  // Đai lưng kim văn.
  line(
    g,
    0.9,
    10,
    [
      [C - 130, 600],
      [C + 130, 600],
    ],
    1,
  );
  for (let i = -4; i <= 4; i++)
    line(
      g,
      0.8,
      5,
      [
        [C + i * 28, 588],
        [C + i * 28, 612],
      ],
      1,
    );
  // Mờ: đáy chìm vào đất, đỉnh đầu mờ nhẹ.
  g.save();
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, 0, 768);
  gr.addColorStop(0, 'rgba(0,0,0,0.35)');
  gr.addColorStop(0.1, 'rgba(0,0,0,1)');
  gr.addColorStop(0.62, 'rgba(0,0,0,1)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 768);
  g.restore();
}

/**
 * Cự quyền (TN-5, Thái Cổ Quyền) 512×512: nắm đấm nhìn từ phía mặt các ngón: bốn ngón co có nếp gập sẫm và đốt ngón sáng, ngón cái ép chéo,
 * bàn tay thấp hơn, cổ tay quấn đai; viền sáng, kim văn chữ V trên mu bàn tay.
 */
function drawFist(g: Ctx): void {
  const body = 0.52;
  const dark = 0.2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Cổ tay + hai đai quấn.
  fillPath(g, body, 0, () => g.roundRect(206, 396, 100, 116, 14), 1, 10);
  for (let i = 0; i < 2; i++)
    line(
      g,
      0.9,
      9,
      [
        [212, 424 + i * 38],
        [300, 424 + i * 38],
      ],
      1,
    );
  // Bàn tay (khối nền, tối hơn để các ngón nổi lên).
  fillPath(g, 0.38, 0, () => g.roundRect(110, 214, 292, 206, 46), 1, 10);
  // Bốn ngón co: mỗi ngón một khối, nếp gập sẫm hai chỗ, đốt ngón sáng ở đỉnh.
  for (let i = 0; i < 4; i++) {
    const x = 118 + i * 70;
    const h = i === 0 || i === 3 ? 150 : 166;
    fillPath(g, body, 0, () => g.roundRect(x, 70 + (166 - h), 66, h + 90, 28), 1, 9);
    line(g, dark, 7, [
      [x + 10, 186],
      [x + 56, 186],
    ]);
    line(g, dark, 7, [
      [x + 10, 232],
      [x + 56, 232],
    ]);
    g.beginPath();
    g.ellipse(x + 33, 110 + (166 - h), 20, 13, 0, 0, Math.PI * 2);
    g.fillStyle = col(0.92, 1);
    g.fill();
  }
  // Ngón cái ép chéo trước các ngón.
  fillPath(g, body, 0, () => g.ellipse(168, 312, 86, 36, -0.38, 0, Math.PI * 2), 1, 10);
  line(g, dark, 7, [
    [110, 330],
    [226, 292],
  ]);
  // Kim văn chữ V trên mu bàn tay + đốt cổ tay.
  for (let i = 0; i < 3; i++)
    line(
      g,
      0.9 - i * 0.05,
      9,
      [
        [262, 330 + i * 22],
        [322, 352 + i * 22],
        [382, 330 + i * 22],
      ],
      1,
    );
}

function drawInfant(g: Ctx): void {
  const C = 192;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Hào quang: hai vành + tia.
  g.beginPath();
  g.arc(C, 170, 152, 0, Math.PI * 2);
  g.strokeStyle = col(1, 1);
  g.lineWidth = 8;
  g.stroke();
  g.beginPath();
  g.arc(C, 170, 128, 0, Math.PI * 2);
  g.strokeStyle = col(0.62, 1);
  g.lineWidth = 5;
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r1 = 176 + (i % 2) * 10;
    line(
      g,
      0.9,
      4,
      [
        [C + Math.cos(a) * 158, 170 + Math.sin(a) * 158],
        [C + Math.cos(a) * r1, 170 + Math.sin(a) * r1],
      ],
      1,
    );
  }
  // Đài sen: hai lớp cánh, viền vàng kim.
  for (let k = 0; k < 2; k++) {
    const n = k === 0 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const x = C + (i - (n - 1) / 2) * (k === 0 ? 40 : 46);
      const y = 292 + k * 14;
      fillPath(
        g,
        k === 0 ? 0.5 : 0.62,
        1,
        () => {
          g.moveTo(x, y);
          g.quadraticCurveTo(x + 28, y + 26, x, y + 58);
          g.quadraticCurveTo(x - 28, y + 26, x, y);
        },
        1,
        4,
      );
    }
  }
  // Chân kiết già, thân, tay kết ấn.
  fillPath(g, 0.5, 0, () => g.ellipse(C, 276, 104, 34, 0, 0, Math.PI * 2), 1, 7);
  line(g, 0.1, 4, [
    [C - 70, 280],
    [C - 20, 262],
    [C + 20, 262],
    [C + 70, 280],
  ]);
  fillPath(g, 0.5, 0, () => g.ellipse(C, 224, 56, 66, 0, 0, Math.PI * 2), 1, 7);
  // Hai tay: cánh tay từ vai khép về ngực, hai bàn tay chắp thành ấn (viền sáng), đường ngón.
  for (const s of [-1, 1]) {
    fillPath(
      g,
      0.55,
      0,
      () => {
        g.moveTo(C + s * 46, 196);
        g.quadraticCurveTo(C + s * 62, 232, C + s * 14, 232);
        g.lineTo(C + s * 8, 216);
        g.quadraticCurveTo(C + s * 34, 214, C + s * 34, 192);
        g.closePath();
      },
      1,
      5,
    );
  }
  fillPath(g, 0.6, 1, () => g.ellipse(C, 226, 20, 13, 0, 0, Math.PI * 2), 1, 4);
  line(g, 0.1, 3, [
    [C - 10, 226],
    [C + 10, 226],
  ]);
  line(g, 0.1, 3, [
    [C, 220],
    [C, 232],
  ]);
  // Đầu to tròn trẻ thơ, búi tóc vàng kim, mắt nhắm, miệng cười, chấm giữa trán.
  fillPath(g, 0.55, 0, () => g.ellipse(C, 142, 44, 48, 0, 0, Math.PI * 2), 1, 7);
  fillPath(g, 0.8, 1, () => g.ellipse(C, 92, 16, 18, 0, 0, Math.PI * 2), 1, 4);
  fillPath(g, 0.45, 0, () => g.ellipse(C, 108, 38, 12, 0, 0, Math.PI * 2));
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(C + s * 17, 144, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokeStyle = col(0.04, 0);
    g.lineWidth = 5;
    g.stroke();
    fillPath(g, 0.7, 1, () => g.ellipse(C + s * 30, 162, 8, 5, 0, 0, Math.PI * 2));
  }
  g.beginPath();
  g.arc(C, 158, 11, 0.2 * Math.PI, 0.8 * Math.PI);
  g.strokeStyle = col(0.04, 0);
  g.lineWidth = 4;
  g.stroke();
  fillPath(g, 1, 1, () => g.arc(C, 126, 4, 0, Math.PI * 2));
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
    const w = id === 'arhat' || id === 'colossus' || id === 'fist' ? 512 : id === 'infant' ? 384 : id === 'ghost' ? 256 : 768;
    const h = id === 'arhat' || id === 'colossus' ? 768 : id === 'fist' ? 512 : id === 'infant' ? 384 : id === 'ghost' ? 512 : 640;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    if (id === 'arhat') drawArhat(g);
    else if (id === 'ghost') drawGhost(g);
    else if (id === 'infant') drawInfant(g);
    else if (id === 'colossus') drawColossus(g);
    else if (id === 'fist') drawFist(g);
    else drawPhoenix(g);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
  tex.set(id, t);
  return t;
}
