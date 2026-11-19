import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { t } from '@dtl/content';
import { InkStroke } from '../u2';
import { useReduceMotion } from '../u2/shell';
import { motionAt } from './hoaMotion';
import { TierBack, TierFront, tierUrl } from './TierLayers';
import type { PortraitPick } from './portraitPick';

/** Đường dẫn tranh (nạp lười khi mở bảng, không nằm trong tải đầu). */
const url = tierUrl;

/** Tâm thân từng tranh (0–1 theo bề ngang ảnh, `tools/hoa-truc/centers.py`): tay áo/lụa bay lệch nên tâm khung ≠ tâm người. */
let centers: Promise<Record<string, { cx?: number }>> | undefined;
function loadCenters(): Promise<Record<string, { cx?: number }>> {
  centers ??= fetch(`${import.meta.env.BASE_URL}hoa-truc/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return centers;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function load(name: string): Promise<HTMLImageElement | null> {
  let p = cache.get(name);
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url(name);
    });
    cache.set(name, p);
  }
  return p;
}

/** Gió linh khí mạnh dần theo tầng cảnh giới (tay áo, voan, tóc bay mạnh hơn). */
const AMP = [1, 1.35, 1.6, 1.9, 2.2] as const;
const COLS = 10;
const ROWS = 26;
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: ((i * 53) % 97) + 1,
  delay: -((i * 1.7) % 11),
  dur: 9 + ((i * 3) % 7),
  size: 2 + (i % 3),
  gold: i % 3 === 0,
}));

/**
 * Sân khấu tranh vẽ của bảng Nhân vật (Hoa Trúc, bước 1): thay khung xem 3D. Ba lớp parallax theo chuột (nền cảnh giới / nhân vật + kiếm /
 * sương + hạt linh khí), nhân vật "thở" bằng lưới biến dạng canvas, hào quang + viền theo phẩm cao nhất, đổi bộ thì vệt mực quét ngang.
 */
export function HoaTruc({ q, pick }: { q: number; pick: PortraitPick }) {
  const reduce = useReduceMotion();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<{ bg: HTMLElement | null; sword: HTMLElement | null; mist: HTMLElement | null }>({
    bg: null,
    sword: null,
    mist: null,
  });
  const mouse = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const [charImg, setCharImg] = useState<HTMLImageElement | null>(null);
  const cxRef = useRef(0.5);
  const [failed, setFailed] = useState(false);
  // Đổi bộ (lần đầu mở thì không quét): `swap` tăng mỗi lần tranh nhân vật đổi.
  const first = useRef(true);
  const [swap, setSwap] = useState(0);
  const [seal, setSeal] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void Promise.all([load(pick.char), loadCenters()]).then(([im, man]) => {
      if (!live) return;
      cxRef.current = man[pick.char]?.cx ?? 0.5;
      if (!im) setFailed(true);
      setCharImg(im);
    });
    if (first.current) first.current = false;
    else {
      setSwap((n) => n + 1);
      setSeal(true);
    }
    return () => {
      live = false;
    };
  }, [pick.char]);
  useEffect(() => {
    if (!seal) return;
    const id = window.setTimeout(() => setSeal(false), 2400);
    return () => window.clearTimeout(id);
  }, [seal, swap]);

  // Vẽ nhân vật + chuyển động + parallax. Một vòng RAF (30 khung/giây), dừng khi tab ẩn.
  useEffect(() => {
    const cv = canvas.current;
    const host = box.current;
    if (!cv || !host || !charImg) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    const size = { w: 0, h: 0, dpr: 1, mid: 0 };
    const fit = () => {
      const r = host.getBoundingClientRect();
      // hệ số zoom THỰC (kể cả zoom của bảng cha, `--ui-scale`): khung nhìn thấy / khung bố cục. getComputedStyle().zoom chỉ trả zoom của chính phần tử.
      const z = host.clientWidth > 0 ? r.width / host.clientWidth : 1;
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      size.w = Math.max(1, host.clientWidth);
      size.h = Math.max(1, host.clientHeight);
      // tâm vùng tranh thực = giữa khoảng trống giữa hai cột ô (cột giữa của lưới), không phải giữa cả lưới
      const sp = host.parentElement?.querySelector('.equip-spacer')?.getBoundingClientRect();
      size.mid = sp && sp.width > 40 ? (sp.left + sp.width / 2 - r.left) / z : size.w / 2;
      cv.width = Math.round(size.w * size.dpr * z);
      cv.height = Math.round(size.h * size.dpr * z);
      cv.style.width = size.w + 'px';
      cv.style.height = size.h + 'px';
      draw(0, true);
    };
    const draw = (now: number, still = false) => {
      const tsec = now / 1000;
      const m = mouse.current;
      m.sx += (m.x - m.sx) * 0.08;
      m.sy += (m.y - m.sy) * 0.08;
      const k = cv.width / size.w;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const ih = size.h * [0.86, 0.86, 0.82, 0.85, 0.85][pick.tier]!;
      const iw = (charImg.width / charImg.height) * ih;
      const ox = size.mid - cxRef.current * iw + (still || reduce ? 0 : m.sx * 12);
      const oy = size.h - ih - size.h * 0.004 + (still || reduce ? 0 : m.sy * 5);
      if (still || reduce) {
        ctx.drawImage(charImg, ox, oy, iw, ih);
      } else {
        const tw = iw / COLS;
        const th = ih / ROWS;
        const sw = charImg.width / COLS;
        const sh = charImg.height / ROWS;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const [dx, dy] = motionAt((c + 0.5) / COLS, (r + 0.5) / ROWS, tsec, AMP[pick.tier]);
            // mỗi ô nới 1 px để không hở khe giữa các ô
            ctx.drawImage(charImg, c * sw, r * sh, sw, sh, ox + c * tw + dx - 0.5, oy + r * th + dy - 0.5, tw + 1, th + 1);
          }
        }
        // lớp phụ chuyển theo chuột (nền, kiếm, sương) ngược chiều nhau: chiều sâu
        const L = layers.current;
        if (L.bg) L.bg.style.transform = `translate3d(${-m.sx * 9}px, ${-m.sy * 6}px, 0) scale(1.06)`;
        if (L.sword) L.sword.style.setProperty('--px', `${m.sx * 10}px`);
        if (L.mist) L.mist.style.transform = `translate3d(${-m.sx * 20}px, ${-m.sy * 8}px, 0)`;
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      last = now;
      draw(now);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [charImg, reduce, swap, pick.tier]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouse.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.current.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onLeave = () => {
    mouse.current.x = 0;
    mouse.current.y = 0;
  };

  return (
    <div
      ref={box}
      className="hoatruc"
      data-q={q}
      data-full={pick.full ? '1' : undefined}
      data-tier={pick.tier || undefined}
      data-reduce={reduce ? '1' : undefined}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-hidden="true"
    >
      <div className="hoatruc-clip">
        <div
          className="hoatruc-bg"
          key={pick.realm}
          ref={(el) => void (layers.current.bg = el)}
          style={{ backgroundImage: `url(${url(pick.realm)})` }}
        />
        <div className="hoatruc-aura" />
        <TierBack pick={pick} />
        {pick.sword && (
          // Kiếm đeo sau lưng: chỉ chuôi + tay nắm + đốc kiếm (tranh vẽ) nhô qua vai, thân kiếm nằm trong bao (khối vẽ bằng CSS, màu/ánh sáng theo kiếm)
          <div
            className="hoatruc-sword"
            key={pick.sword}
            data-k={pick.sword.replace('kiem_', '')}
            ref={(el) => void (layers.current.sword = el)}
          >
            <i className="hoatruc-scab" />
            <span className="hoatruc-hilt">
              <img src={url(pick.sword)} alt="" draggable={false} />
            </span>
          </div>
        )}
        <div className="hoatruc-char" key={'c' + swap} data-swap={swap > 0 ? '1' : undefined}>
          {failed ? <div className="hoatruc-miss" /> : <canvas ref={canvas} />}
        </div>
        <TierFront pick={pick} />
        <div className="hoatruc-mist" ref={(el) => void (layers.current.mist = el)}>
          <i className="hoatruc-fog f1" />
          <i className="hoatruc-fog f2" />
          {PARTICLES.map((p, i) => (
            <b
              key={i}
              className="hoatruc-mote"
              data-gold={p.gold ? '1' : undefined}
              style={
                {
                  left: p.left + '%',
                  animationDelay: p.delay + 's',
                  animationDuration: p.dur + 's',
                  width: p.size,
                  height: p.size,
                } as CSSProperties
              }
            />
          ))}
        </div>
        {swap > 0 && (
          <div className="hoatruc-ink" key={'i' + swap}>
            <InkStroke variant={swap % 3} />
          </div>
        )}
        {pick.full && <div className="hoatruc-full" />}
      </div>
      <div className="hoatruc-rim" />
      {seal && (
        <div className="hoatruc-seal" key={'s' + swap}>
          {pick.setId ? t(`set.${pick.setId}.name`) : t('ui.hoatruc.de_tu')}
        </div>
      )}
    </div>
  );
}
