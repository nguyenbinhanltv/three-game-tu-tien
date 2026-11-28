import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { C } from '@dtl/shared';
import { t } from '@dtl/content';
import { Game } from '../../game/engine';
import { Button } from '../u2/win';
import './gmlab.css';
import { GM_CMDS, GM_GROUPS, gmBuild, gmDefaults, gmOptions, type GmCmd, type GmGroup, type GmParam, type GmValues } from './gmCommands';

/** Gửi lệnh GM qua chat: server kiểm quyền (chỉ tài khoản thử) và tham số rồi mới làm; client không tự đổi gì. */
function send(cmd: string): void {
  Game.current?.send(C.CHAT, { m: '/gm ' + cmd });
}

const MAX_SHOWN = 60;

/** Ô chọn id có tìm: gõ để lọc theo tên hoặc id, chọn trong danh sách đã lọc (tối đa MAX_SHOWN dòng). */
function SrcField({ p, value, onChange }: { p: GmParam; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const all = gmOptions(p.src!);
  const k = q.trim().toLowerCase();
  const list = (k ? all.filter((o) => o.label.toLowerCase().includes(k)) : all).slice(0, MAX_SHOWN);
  const cur = list.some((o) => o.id === value) ? value : (list[0]?.id ?? '');
  useEffect(() => {
    if (cur !== value) onChange(cur);
  }, [cur, value, onChange]);
  return (
    <>
      <input className="gm-find" placeholder={t('ui.gm.lab.find')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <select value={cur} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

function Field({ p, value, onChange }: { p: GmParam; value: string; onChange: (v: string) => void }) {
  const label = t('ui.gm.param.' + p.k);
  let input;
  if (p.kind === 'src') input = <SrcField p={p} value={value} onChange={onChange} />;
  else if (p.kind === 'pick')
    input = (
      <select value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {p.opt && <option value="">{t('ui.gm.opt.none')}</option>}
        {p.opts!.map((o) => (
          <option key={o} value={o}>
            {t('ui.gm.opt.' + o)}
          </option>
        ))}
      </select>
    );
  else if (p.kind === 'int')
    input = <input className="gm-num" type="number" min={p.min} max={p.max} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
  else input = <input className="gm-text" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
  return (
    <label>
      <span>{label}</span>
      {input}
    </label>
  );
}

function CmdRow({ c }: { c: GmCmd }) {
  const [v, setV] = useState<GmValues>(() => gmDefaults(c));
  const cmd = gmBuild(c, v);
  const help = t('gm.cmd.' + c.name);
  const tip = help.startsWith('gm.cmd.') || help.startsWith('[') ? undefined : help;
  return (
    <div className="debug-row wrap gm-cmd" data-cmd={c.name}>
      <b title={tip}>{t('ui.gm.cmd.' + c.name)}</b>
      {c.params.map((p) => (
        <Field key={p.k} p={p} value={v[p.k] ?? ''} onChange={(x) => setV((o) => ({ ...o, [p.k]: x }))} />
      ))}
      <Button size="s" variant="primary" disabled={!cmd} title={cmd ? '/gm ' + cmd : undefined} onClick={() => cmd && send(cmd)}>
        {t('ui.gm.lab.gm.run')}
      </Button>
      {c.extra?.map((x) => (
        <Button key={x.k} size="s" onClick={() => send(x.cmd)}>
          {t('ui.gm.extra.' + x.k)}
        </Button>
      ))}
    </div>
  );
}

const win = { open: false };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
let host: HTMLDivElement | null = null;

/** Mở/đóng cửa sổ lệnh GM (gốc React riêng gắn vào body để không phụ thuộc tab đang mở và không đẩy chiều cao bảng F3). */
export function gmWindow(open: boolean): void {
  win.open = open;
  if (open && !host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    createRoot(host).render(<GmWindow />);
  }
  for (const f of subs) f();
}

const useOpen = () => useSyncExternalStore(subscribe, () => win.open);

/** Cửa sổ nổi bên phải: sáu nhóm lệnh, danh sách cuộn bên trong để luôn nằm trọn khung 720p. Lệnh nhóm Cân bằng ở tab Cân bằng. */
function GmWindow() {
  const open = useOpen();
  const [g, setG] = useState<GmGroup>('char');
  if (!open) return null;
  const rows = GM_CMDS.filter((c) => c.group === g);
  return (
    <div className="gm-win" role="dialog" aria-label={t('ui.gm.lab.tab.gm')}>
      <div className="gm-win-head">
        <b>{t('ui.gm.lab.tab.gm')}</b>
        <Button size="s" onClick={() => gmWindow(false)}>
          {t('ui.gm.lab.gm.close')}
        </Button>
      </div>
      <div className="debug-row wrap gm-groups">
        {GM_GROUPS.map((k) => (
          <Button key={k} size="s" variant={k === g ? 'primary' : undefined} onClick={() => setG(k)}>
            {t('ui.gm.lab.gm.group.' + k)}
          </Button>
        ))}
      </div>
      <div className="gm-list">{rows.length ? rows.map((c) => <CmdRow key={c.name} c={c} />) : <div className="debug-row">{t('ui.gm.lab.gm.empty')}</div>}</div>
    </div>
  );
}

/** Tab "Lệnh GM" trong tab Diễn Võ: nút mở/đóng cửa sổ lệnh. */
export function GmLab() {
  const open = useOpen();
  return (
    <div className="debug-row wrap">
      <Button size="s" variant="primary" onClick={() => gmWindow(!open)}>
        {t(open ? 'ui.gm.lab.gm.close' : 'ui.gm.lab.gm.open')}
      </Button>
      <span>{t('ui.gm.lab.gm.hint')}</span>
    </div>
  );
}
