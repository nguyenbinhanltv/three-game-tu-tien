import '../fonts.css';
import '../tokens.css';
import './boot.css';
import { loadArtUrl } from '../../Art';

/**
 * Nền sơn thủy nhiều lớp cho màn tiêu đề/đăng nhập và màn tải (U2-4).
 * Một tranh được tách lớp bằng mặt nạ mềm (nền, núi xa, núi giữa, nước/gần) trượt theo chuột hoặc trôi chậm, cộng hai lớp sinh riêng
 * (cành tùng — trộn nhân, sương — trộn sáng), hạc và cánh hoa. Màn tiêu đề thêm hiệu ứng cuộn tranh mở ra (một lần mỗi phiên).
 * Giảm chuyển động (`data-reduce-motion` ở <html>, hoặc prefers-reduced-motion): chỉ còn khung tĩnh. Tự dừng khi #boot đã `gone` hoặc tab ẩn.
 */
type SceneMode = 'title' | 'zone';

const REVEAL_KEY = 'dtl.scrollRevealed';
const CRANE = '<svg viewBox="0 0 64 26" aria-hidden="true"><path d="M2 14Q18-2 32 13Q46-2 62 14Q46 8 32 18Q18 8 2 14Z"/></svg>';

const reduced = (): boolean =>
  document.documentElement.dataset.reduceMotion === 'true' ||
  (document.documentElement.dataset.reduceMotion !== 'false' &&
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches);

let current: { el: HTMLElement; stop: () => void; url: string; mode: SceneMode } | null = null;

function layer(cls: string, k: number, url: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'u2s-l ' + cls;
  d.style.setProperty('--k', String(k));
  d.style.backgroundImage = `url("${url}")`;
  return d;
}

/** Dựng (hoặc đổi tranh) cảnh nền trong #boot. Trả về khi tranh nền đã đặt; lớp phụ nạp lười không chặn. */
export async function mountBootScene(boot: HTMLElement, url: string, mode: SceneMode): Promise<void> {
  if (current && current.url === url && current.mode === mode) return;
  current?.stop();
  const root = document.createElement('div');
  root.className = 'u2s' + (mode === 'title' ? ' u2s-title' : ' u2s-zone') + (url.includes('bac_hoang.') ? ' u2s-rift' : '');
  const reveal = mode === 'title' && !reduced() && sessionStorage.getItem(REVEAL_KEY) !== '1';
  const wrap = document.createElement('div');
  wrap.className = 'u2s-wrap' + (reveal ? ' u2s-reveal' : '');
  root.appendChild(wrap);
  wrap.append(layer('u2s-base', 0, url), layer('u2s-far', 0.25, url), layer('u2s-mid', 0.6, url), layer('u2s-near', 1.1, url));
  const sun = document.createElement('div');
  sun.className = 'u2s-shade';
  wrap.appendChild(sun);
  for (const [cls, delay, top] of mode === 'title'
    ? ([
        ['u2s-crane', -10, 15],
        ['u2s-crane u2s-crane2', -42, 24],
      ] as const)
    : ([['u2s-crane', -22, 18]] as const)) {
    const c = document.createElement('div');
    c.className = cls;
    c.style.setProperty('--top', top + '%');
    c.style.animationDelay = delay + 's';
    c.innerHTML = CRANE;
    wrap.appendChild(c);
  }
  const petals = document.createElement('div');
  petals.className = 'u2s-petals';
  const n = mode === 'title' ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = ((i * 37 + 11) % 100) + '%';
    p.style.animationDuration = 16 + ((i * 7) % 13) + 's';
    p.style.animationDelay = -((i * 5) % 29) + 's';
    p.style.setProperty('--s', String(0.7 + ((i * 3) % 7) / 10));
    petals.appendChild(p);
  }
  wrap.appendChild(petals);
  if (reveal) {
    const l = document.createElement('div');
    l.className = 'u2s-roller u2s-roller-l';
    const r = document.createElement('div');
    r.className = 'u2s-roller u2s-roller-r';
    root.append(l, r);
    try {
      sessionStorage.setItem(REVEAL_KEY, '1');
    } catch {
      /* sessionStorage bị chặn: cuộn mở lại ở lần sau, không sao */
    }
  }
  boot.insertBefore(root, boot.querySelector('.ts-art')?.nextSibling ?? boot.querySelector('.ts-scene'));
  boot.classList.add('u2-on');

  // Lớp rời (sương, cành tùng): nạp lười sau khung đầu, thêm vào khi về.
  let live = true;
  void Promise.all([loadArtUrl('layers', 'suong'), mode === 'title' ? loadArtUrl('layers', 'canh_tung') : Promise.resolve(null)]).then(
    ([mist, front]) => {
      if (!live) return;
      if (mist)
        for (const c of mode === 'title' ? ['u2s-mist u2s-mist1', 'u2s-mist u2s-mist2'] : ['u2s-mist u2s-mist1']) {
          const m = document.createElement('div');
          m.className = c;
          m.style.backgroundImage = `url("${mist}")`;
          wrap.insertBefore(m, sun);
        }
      if (front) {
        const f = layer('u2s-front', 2.2, front);
        wrap.insertBefore(f, sun);
      }
    },
  );

  // Trượt theo chuột / trôi chậm khi không có chuột. Chỉ ghi hai biến CSS mỗi khung.
  let mx = 0;
  let my = 0;
  let hasMouse = false;
  let raf = 0;
  const t0 = performance.now();
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    hasMouse = true;
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
  };
  const tick = (now: number) => {
    if (boot.classList.contains('gone') || !root.isConnected) return stop();
    if (!document.hidden && !reduced()) {
      const s = (now - t0) / 1000;
      const x = hasMouse ? mx * 14 : Math.sin(s / 9) * 10;
      const y = hasMouse ? my * 8 : Math.cos(s / 13) * 5;
      root.style.setProperty('--sx', x.toFixed(2));
      root.style.setProperty('--sy', y.toFixed(2));
    }
    raf = requestAnimationFrame(tick);
  };
  function stop() {
    live = false;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    root.remove();
    boot.classList.remove('u2-on');
    if (current?.el === root) current = null;
  }
  addEventListener('pointermove', onMove, { passive: true });
  raf = requestAnimationFrame(tick);
  current = { el: root, stop, url, mode };
}
