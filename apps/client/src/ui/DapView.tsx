// Mục "Đạp Thiên" của tab Cửu Kiều ở Dẫn Kiều Nhân (TN-7, kết game): danh hiệu, lời kết, ghi công, chọn MỘT nguồn Cực nguyên (`C.DAP`), Bảng Thiên Lộ.
// Phần hiển thị thuần (nhận dữ liệu và hàm gửi qua props để test được, không kéo engine/store khi nạp). Chỉ hiện khi đủ chín cầu; xin vé từng cầu nằm ở tab Cửu Kiều.
// Client chỉ hiển thị `CharView` (`kieu`, `dap`) và gửi ý định; server phán điều kiện (đủ chín cầu, cạnh NPC, chỉ một lần).
import { C, type CharView, DAP_BONUS, DAP_IDS, KIEU_COUNT, type KieuBoardMsg } from '@dtl/shared';
import { t } from '@dtl/content';
import { Button, Divider } from './u2/win';

/** Phần thưởng của một nguồn Cực nguyên, dạng chữ ("+9% công, +3% thủ"). */
export function dapSummary(id: (typeof DAP_IDS)[number]): string {
  const b = DAP_BONUS[id];
  const parts: string[] = [];
  if (b.hp) parts.push(t('ui.kieu.stat.hp', { n: Math.round(b.hp * 100) }));
  if (b.mp) parts.push(t('ui.kieu.stat.mp', { n: Math.round(b.mp * 100) }));
  if (b.atk) parts.push(t('ui.kieu.stat.atk', { n: Math.round(b.atk * 100) }));
  if (b.def) parts.push(t('ui.kieu.stat.def', { n: Math.round(b.def * 100) }));
  return parts.join(', ');
}

/** Có hiện mục Đạp Thiên không: đủ chín cầu. */
export function showDap(char: Pick<CharView, 'kieu'>): boolean {
  return char.kieu >= KIEU_COUNT;
}

export function DapView({
  char,
  board,
  send,
  onCredits,
}: {
  char: Pick<CharView, 'kieu' | 'dap'>;
  board: KieuBoardMsg | null;
  send: (type: string, msg?: unknown) => void;
  /** Mở bảng ghi công (lời cảm ơn sau khi Đạp Thiên). */
  onCredits?: () => void;
}) {
  if (!showDap(char)) return null;
  return (
    <div className="shop-list" data-testid="dap-section">
      <Divider label={t('ui.kieu.dap_head')} />
      <div className="item-name">{t('ui.kieu.title_dap')}</div>
      <div className="k-dim" data-testid="kieu-epilogue">
        {t('ui.kieu.epilogue')}
      </div>
      {onCredits && <Button onClick={onCredits}>{t('ui.kieu.credits_open')}</Button>}
      <Divider label={t('ui.kieu.dap_title')} />
      <div className="k-dim">{t(char.dap ? 'ui.kieu.dap_chosen' : 'ui.kieu.dap_desc')}</div>
      {DAP_IDS.map((id) => (
        <div key={id} className="k-card shop-row" data-dap={id}>
          <div className="shop-info">
            <div className="item-name">{t(`origin.${id}.name`)}</div>
            <div className="k-dim">{t(`origin.${id}.desc`)}</div>
            <div className="k-dim">{dapSummary(id)}</div>
          </div>
          <Button variant="primary" disabled={!!char.dap} onClick={() => send(C.DAP, { id })}>
            {char.dap === id ? t('ui.kieu.dap_current') : t('ui.kieu.dap_pick')}
          </Button>
        </div>
      ))}
      <Divider label={t('ui.kieu.board_title')} />
      {!board ? (
        <div className="k-dim">{t('ui.kieu.board_loading')}</div>
      ) : board.rows.length === 0 ? (
        <div className="k-dim">{t('ui.kieu.board_empty')}</div>
      ) : (
        <ol className="kieu-board" data-testid="kieu-board">
          {board.rows.map((r, i) => (
            <li key={`${r.name}-${i}`} data-name={r.name}>
              <span className="item-name">{r.name}</span> <span className="k-dim">{new Date(r.ts).toLocaleDateString('vi-VN')}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="k-dim">{t('ui.kieu.board_total', { n: board?.total ?? 0 })}</div>
    </div>
  );
}
