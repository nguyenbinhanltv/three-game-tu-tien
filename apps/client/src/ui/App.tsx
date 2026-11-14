import { useEffect, useRef, useState } from 'react';
import { validName } from '@dtl/shared';
import { t } from '@dtl/content';
import { sfx } from '../game/audio';
import { Game } from '../game/engine';
import { Hud } from './Hud';
import { set, useUI } from './store';

const GOOGLE_CLIENT_ID = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GOOGLE_CLIENT_ID ?? '';
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.hostname.endsWith('.localhost');
const DEV_LOGIN = IS_LOCAL || new URLSearchParams(window.location.search).has('dev');

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

function Login() {
  const needName = useUI((s) => s.needName);
  const nameError = useUI((s) => s.nameError);
  const [name, setName] = useState(() => localStorage.getItem('dtl.devName') ?? '');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');

  const submitDev = () => {
    if (!validName(name)) return setErr(t('ui.err.name_invalid'));
    localStorage.setItem('dtl.devName', name.trim());
    Game.connect({ dev: name.trim() });
  };
  const submitName = () => {
    if (!validName(name)) return setErr(t('ui.err.name_invalid'));
    Game.connect({ token, name: name.trim() });
  };
  // Tiện cho kiểm thử: ?auto=<đạo hiệu> tự đăng nhập bằng tài khoản thử.
  useEffect(() => {
    const auto = new URLSearchParams(window.location.search).get('auto');
    if (auto && DEV_LOGIN && validName(auto) && !needName) Game.connect({ dev: auto.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onToken = (tk: string) => {
    setToken(tk);
    Game.connect({ token: tk });
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-sword" aria-hidden="true" />
        <h1>{t('ui.title')}</h1>
        <div className="login-sub">{t('ui.subtitle')}</div>
        <p className="login-tag">{t('ui.tagline')}</p>

        {needName && token ? (
          <div className="login-form">
            <label>{t('ui.login.need_name')}</label>
            <input autoFocus value={name} maxLength={14} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitName()} />
            <div className="login-hint">{t('ui.login.name_rule')}</div>
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
    </div>
  );
}

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-sword" aria-hidden="true" />
        <h1>{t('ui.title')}</h1>
        <div className="login-sub">{t('ui.subtitle')}</div>
        <p className={error ? 'login-error' : 'login-tag'}>{text}</p>
        {error ? (
          <button
            className="btn primary"
            onClick={() => {
              Game.current?.dispose();
              set({ phase: 'login', error: '', needName: false });
            }}
          >
            {t('ui.login.retry')}
          </button>
        ) : (
          <div className="spinner" />
        )}
      </div>
    </div>
  );
}

export function App() {
  // Tiếng bấm cho mọi nút giao diện (nút đóng bảng đã có tiếng gấp sách riêng).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !b.disabled && !b.classList.contains('window-close')) sfx('ui_click', 0.7);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  const phase = useUI((s) => s.phase);
  const error = useUI((s) => s.error);
  return (
    <>
      {phase === 'login' && <Login />}
      {phase === 'connecting' && <Splash text={t('ui.login.connecting')} />}
      {phase === 'loading' && <Splash text={t('ui.login.loading')} />}
      {phase === 'error' && <Splash text={error} error />}
      {phase === 'game' && <Hud />}
    </>
  );
}
