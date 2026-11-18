import { useEffect, useRef, useState } from 'react';
import { type Appearance, genderEnabled, type Gender, HAIRS, isRootId, parseAppearance, type RootId, validName } from '@dtl/shared';
import { APPEARANCE, t } from '@dtl/content';
import { assets } from '../game/core/assets';
import { playMusic, sfx, unlockAudio } from '../game/audio/audio';
import { TitleBackdrop } from '../game/world/backdrop';
import { lastZoneArt, setBootArt } from '../game/world/bootArt';
import { applyUiArt } from './Art';
import { CHR_V2_ON } from '../game/character/playerSkins';
import { Game } from '../game/engine';
import { prefetchManifest } from '../game/core/preload';
import { Hud } from './Hud';
import { RootPicker } from './Realm';
import { Corners } from './ngj';
import { Portrait } from './Art';
import { get, type Phase, set, useUI } from './store';
import { FLAGS, urlParams } from '../game/core/flags';

const GOOGLE_CLIENT_ID = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GOOGLE_CLIENT_ID ?? '';
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.hostname.endsWith('.localhost');
const DEV_LOGIN = IS_LOCAL || FLAGS.dev;

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}

function GoogleButton({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const init = () => {
      const g = (window as unknown as { google?: { accounts: { id: GoogleId } } }).google;
      if (cancelled || !g || !ref.current) return;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onToken(r.credential) });
      g.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', locale: 'vi' });
    };
    if ((window as unknown as { google?: unknown }).google) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [onToken]);
  return <div ref={ref} className="google-btn" />;
}

const LOOK_KEY = 'dtl.look';

/** Lựa chọn ngoại hình nhớ lần trước (hoặc `?dye=<id>` khi thử); không hợp lệ thì mặc định. */
function initialLook(): Appearance {
  const def: Appearance = { g: APPEARANCE.defaultGender, dye: APPEARANCE.defaultDye };
  const qs = urlParams();
  const q = qs.get('dye');
  if (q) return parseAppearance(APPEARANCE, { g: def.g, dye: q, ...(qs.get('hair') ? { hair: qs.get('hair') } : {}) }) ?? def;
  try {
    return parseAppearance(APPEARANCE, JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null')) ?? def;
  } catch {
    return def;
  }
}

/**
 * Chọn giới tính + màu áo khi tạo nhân vật (quyết định 6.4b). Chỉ gửi lựa chọn; server kiểm và chỉ áp dụng
 * khi tạo nhân vật mới. Giới tính chưa bật (enabled=false) hiện nhưng khóa.
 */
function LookPicker({ look, onChange }: { look: Appearance; onChange: (a: Appearance) => void }) {
  return (
    <div className="look-picker">
      <label>{t('ui.login.look')}</label>
      <div className="look-row">
        <span className="look-key">{t('ui.login.gender')}</span>
        {APPEARANCE.genders.map((g) => {
          const on = genderEnabled(APPEARANCE, g.id);
          return (
            <button
              key={g.id}
              type="button"
              className={'look-gender' + (look.g === g.id ? ' sel' : '')}
              disabled={!on}
              title={on ? undefined : t('ui.login.gender_soon')}
              onClick={() => onChange({ ...look, g: g.id as Gender })}
            >
              <Portrait id={'player_' + g.id} className="look-face" />
              <span>{t(`appearance.gender.${g.id}`)}</span>
            </button>
          );
        })}
      </div>
      <div className="look-row">
        <span className="look-key">{t('ui.login.robe')}</span>
        {APPEARANCE.dyes.map((d) => (
          <button
            key={d.id}
            type="button"
            className={'look-dye' + (look.dye === d.id ? ' sel' : '')}
            style={{ background: d.hex }}
            title={t(`appearance.dye.${d.id}`)}
            aria-label={t(`appearance.dye.${d.id}`)}
            onClick={() => onChange({ ...look, dye: d.id })}
          />
        ))}
        <span className="look-name">{t(`appearance.dye.${look.dye}`)}</span>
      </div>
      {CHR_V2_ON && (
      <div className="look-row">
        <span className="look-key">{t('ui.login.hair')}</span>
        {HAIRS.map((h) => (
          <button
            key={h}
            type="button"
            className={'look-gender' + ((look.hair ?? 'a') === h ? ' sel' : '')}
            onClick={() => onChange({ ...look, hair: h })}
          >
            <span>{t(`appearance.hair.${look.g}.${h}`)}</span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

const ROOT_KEY = 'dtl.root';

/** Linh căn chọn lần trước (null = để thiên ý định đoạt). */
function initialRoot(): RootId | null {
  const q = urlParams().get('root');
  if (isRootId(q)) return q;
  try {
    const v = localStorage.getItem(ROOT_KEY);
    return isRootId(v) ? v : null;
  } catch {
    return null;
  }
}

function Login() {
  const needName = useUI((s) => s.needName);
  const nameError = useUI((s) => s.nameError);
  const [name, setName] = useState(() => localStorage.getItem('dtl.devName') ?? '');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [look, setLookState] = useState(initialLook);
  const [root, setRootState] = useState<RootId | null>(initialRoot);
  const setRoot = (r: RootId | null) => {
    setRootState(r);
    if (r) localStorage.setItem(ROOT_KEY, r);
    else localStorage.removeItem(ROOT_KEY);
  };
  const setLook = (a: Appearance) => {
    setLookState(a);
    localStorage.setItem(LOOK_KEY, JSON.stringify(a));
  };

  const submitDev = () => {
    if (!validName(name)) return setErr(t('ui.err.name_invalid'));
    localStorage.setItem('dtl.devName', name.trim());
    Game.connect({ dev: name.trim(), ap: look, rt: root ?? undefined });
  };
  const submitName = () => {
    if (!validName(name)) return setErr(t('ui.err.name_invalid'));
    Game.connect({ token, name: name.trim(), ap: look, rt: root ?? undefined });
  };
  // Tiện cho kiểm thử: ?auto=<đạo hiệu> tự đăng nhập bằng tài khoản thử.
  useEffect(() => {
    const auto = FLAGS.auto;
    if (auto && DEV_LOGIN && validName(auto) && !needName) Game.connect({ dev: auto.trim(), ap: initialLook(), rt: initialRoot() ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onToken = (tk: string) => {
    setToken(tk);
    Game.connect({ token: tk });
  };

  return (
    <div className={'ts-card' + ' ngj-card'}>
      <Corners material="paper" />
      <p className="login-tag">{t('ui.tagline')}</p>

        {needName && token ? (
          <div className="login-form">
            <label>{t('ui.login.need_name')}</label>
            <input autoFocus value={name} maxLength={14} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitName()} />
            <div className="login-hint">{t('ui.login.name_rule')}</div>
            <LookPicker look={look} onChange={setLook} />
            <RootPicker value={root} onChange={setRoot} />
            <button className="btn primary" onClick={submitName}>
              {t('ui.login.enter')}
            </button>
          </div>
        ) : (
          <>
            {GOOGLE_CLIENT_ID && (
              <div className="login-form">
                <label>{t('ui.login.google_title')}</label>
                <GoogleButton onToken={onToken} />
                <div className="login-hint">{t('ui.login.google_hint')}</div>
              </div>
            )}
            {DEV_LOGIN && (
              <div className="login-form">
                <label>{t('ui.login.dev_title')}</label>
                <input
                  autoFocus
                  placeholder={t('ui.login.dev_name')}
                  value={name}
                  maxLength={14}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitDev()}
                />
                <div className="login-hint">{t('ui.login.dev_hint')}</div>
                <LookPicker look={look} onChange={setLook} />
                <RootPicker value={root} onChange={setRoot} />
                <button className="btn primary" onClick={submitDev}>
                  {t('ui.login.enter')}
                </button>
              </div>
            )}
            {!GOOGLE_CLIENT_ID && !DEV_LOGIN && <div className="login-error">{t('ui.login.no_method')}</div>}
          </>
        )}
      {(err || nameError) && <div className="login-error">{nameError || err}</div>}
    </div>
  );
}

// ---------- màn tiêu đề kiêm màn tải (M4-9) ----------

/** Mỗi dòng chữ màn tải giữ ít nhất chừng này để kịp đọc, kể cả khi bước tải xong nhanh hơn. */
const LINE_MS = 170;
/** Các mốc trong `Game.loadStats` (engine ghi lúc khởi động) và dòng chữ tương ứng. */
const STAGES: [stat: string, line: string][] = [
  ['rendererInit', 'ui.load.renderer'],
  ['env', 'ui.load.env'],
  ['terrainCoarse', 'ui.load.terrain'],
  ['sect', 'ui.load.sect'],
  ['minimap', 'ui.load.minimap'],
];
/** Phần thanh tiến độ dành cho byte asset (AssetCache theo manifest); còn lại là các mốc dựng thế giới. */
const ASSET_SHARE = 0.2;

/** Dòng chữ theo bối cảnh + thanh tiến độ thật; gọi `onDone` khi đã vào game và đọc hết các dòng. */
function LoadingPanel({ onDone }: { onDone: () => void }) {
  const [line, setLine] = useState('');
  const bar = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // Chuyển room (bí cảnh ↔ thế giới) thì thế giới đã dựng sẵn: chỉ một dòng.
    const transfer = !!Game.current?.loadStats.worldReady;
    const queue: string[] = [];
    const seen = new Set<string>();
    const push = (k: string) => {
      if (seen.has(k)) return;
      seen.add(k);
      queue.push(k);
    };
    let shownAt = -Infinity;
    let shown = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      const ready = get().phase === 'game';
      let target: number;
      if (transfer) {
        push('ui.load.transfer');
        target = ready ? 1 : 0.6;
      } else {
        push('ui.load.connect');
        const g = Game.current;
        let steps = 0;
        if (g) {
          push('ui.load.enter');
          steps++;
          for (const [stat, key] of STAGES) {
            if (g.loadStats[stat] === undefined) break;
            push(key);
            steps++;
          }
        }
        const ap = assets.progress();
        target = ready ? 1 : (steps / (STAGES.length + 2)) * (1 - ASSET_SHARE) + (ap.total ? (ap.loaded / ap.total) * ASSET_SHARE : 0);
      }
      if (ready) push('ui.load.ready');
      shown += (target - shown) * 0.3;
      if (bar.current) bar.current.style.transform = `scaleX(${shown.toFixed(4)})`;
      if (queue.length && now - shownAt >= LINE_MS) {
        setLine(t(queue.shift()!));
        shownAt = now;
      } else if (ready && !queue.length && now - shownAt >= LINE_MS * 3) {
        window.clearInterval(id);
        done.current();
      }
    }, 40);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className={'ts-card ts-loading' + ' ngj-card'} role="status" aria-live="polite">
      <Corners material="paper" />
      <p className="ts-line" key={line}>
        {line}
      </p>
      <div className="ts-bar">
        <div ref={bar} className="ts-bar-fill" />
      </div>
    </div>
  );
}

function ErrorPanel({ text }: { text: string }) {
  return (
    <div className={'ts-card' + ' ngj-card'}>
      <Corners material="paper" />
      <p className="login-error">{text}</p>
      <button
        className="btn primary"
        onClick={() => {
          Game.current?.dispose();
          set({ phase: 'login', error: '', needName: false });
        }}
      >
        {t('ui.login.retry')}
      </button>
    </div>
  );
}

/**
 * Cảnh nền 3D sau form đăng nhập. Chỉ dựng khi chưa có Game (lần vào đầu); chuyển room giữa
 * chừng thì màn tiêu đề dùng nền sương tĩnh của khung hình đầu.
 */
let backdrop: TitleBackdrop | null = null;
const bootEl = () => document.getElementById('boot');

function syncBackdrop(phase: Phase): void {
  const boot = bootEl();
  if (!boot) return;
  if (phase === 'game') return;
  if (phase === 'loading') {
    backdrop?.pause(); // nhường CPU/GPU cho Game đang dựng thế giới; giữ khung cuối
    return;
  }
  if (!backdrop && !Game.current) {
    const host = boot.querySelector<HTMLElement>('.ts-scene');
    if (!host) return;
    const b = new TitleBackdrop(host, () => boot.classList.add('lit'));
    backdrop = b;
    b.start().catch((e) => {
      console.warn('[title] không dựng được cảnh nền, giữ nền tĩnh:', e);
      if (backdrop === b) dropBackdrop();
    });
  }
  backdrop?.resume();
}

function dropBackdrop(): void {
  backdrop?.dispose();
  backdrop = null;
  bootEl()?.classList.remove('lit');
}

export function App() {
  // M6-1: biết sẵn tên file GLB trước khi bắt đầu kết nối (game/preload.ts).
  useEffect(prefetchManifest, []);
  // Tiếng bấm cho mọi nút giao diện (nút đóng bảng đã có tiếng gấp sách riêng).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !b.disabled && !b.classList.contains('window-close') && !b.classList.contains('k-close')) {
        // Nút chính (xác nhận: nâng cấp, tu luyện, nhập thế…) có tiếng xác nhận trầm; còn lại là tiếng bấm thường.
        const primary = b.matches("[data-variant='primary'], .btn.primary");
        sfx(primary ? 'ui_confirm' : 'ui_click', primary ? 0.6 : 0.7);
      }
    };
    // Lướt chuột qua nút/ô/tab: chạm trầm rất nhẹ (UI-5), mỗi phần tử một lần, cách nhau ≥ 70 ms. Tôn trọng ?mute=1 (đi qua bus ui → master).
    let lastEl: Element | null = null;
    let lastAt = 0;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const b = (e.target as Element | null)?.closest?.("button, [role='tab'], .ngj-slot, .k-slot");
      if (!b || b === lastEl || (b as HTMLButtonElement).disabled) return;
      lastEl = b;
      const now = performance.now();
      if (now - lastAt < 70) return;
      lastAt = now;
      sfx('ui_hover', 0.3);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onOver, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onOver, true);
    };
  }, []);
  // Thao tác đầu tiên ở màn tiêu đề (gõ đạo hiệu, bấm nút) mở khóa âm thanh để nhạc chủ đề phát được.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);
  const phase = useUI((s) => s.phase);
  useEffect(() => void applyUiArt(), []);
  // Tranh nền: màn tiêu đề ở đăng nhập, tranh vùng cuối cùng lúc nối/nạp (Codex, nạp lười).
  useEffect(() => {
    if (phase === 'login') void setBootArt('title', 'title');
    else if (phase === 'connecting' || phase === 'loading') void setBootArt(lastZoneArt(), 'zone');
  }, [phase]);
  const error = useUI((s) => s.error);
  // Nhạc chủ đề (`title`) ở màn đăng nhập và lần tải/kết nối đầu, khi chưa có Game nào đã vào thế giới. Một khi Game
  // đã vào (`ownsMusic`), MusicController của nó là chủ duy nhất của kênh nhạc: chuyển room (pha `loading`) hay màn
  // lỗi khi Game còn sống giữ nguyên nhạc vùng, không chen `title` (tránh tải thừa và phát lại bài vùng từ đầu).
  useEffect(() => {
    if (phase !== 'game' && !Game.current?.ownsMusic) playMusic('title', 2);
  }, [phase]);
  // Màn tiêu đề còn che game cho tới khi các dòng chữ tải đã hiện xong.
  const [title, setTitle] = useState(true);
  useEffect(() => {
    if (phase !== 'game') setTitle(true);
    syncBackdrop(phase);
  }, [phase]);
  useEffect(() => {
    bootEl()?.classList.toggle('gone', !title);
    if (title) return;
    const timer = window.setTimeout(dropBackdrop, 1000); // sau khi #boot mờ hẳn
    return () => window.clearTimeout(timer);
  }, [title]);

  return (
    <>
      {title && (
        <div className="title-screen">
          <div className="ts-sub">{t('ui.subtitle')}</div>
          {phase === 'login' && <Login />}
          {(phase === 'connecting' || phase === 'loading' || phase === 'game') && <LoadingPanel onDone={() => setTitle(false)} />}
          {phase === 'error' && <ErrorPanel text={error} />}
        </div>
      )}
      {phase === 'game' && !title && <Hud />}
    </>
  );
}
