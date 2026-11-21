import { type CSSProperties, type ReactNode } from 'react';
import {
  artifactLevelMods,
  BAR_SIZE,
  BONDED_ARTIFACT_ID,
  bondedLevel,
  C,
  CLONE_UNLOCK_LEVEL,
  SOUL_SCOUT,
  SOUL_SCOUT_CD_MS,
  soulUnlocked,
  SPIRIT_CD_MS,
  SPIRIT_MP,
  spiritUnlocked,
} from '@dtl/shared';
import { ARTIFACT, ITEM, itemName, resolveBarSkill, t, tierBar } from '@dtl/content';
import { Game } from '../../../game/engine';
import { ContentIcon, UiIcon } from '../../ContentIcon';
import { togglePanel, useUI } from '../../store';
import { IconFrame } from '../Slot';
import { useNow } from '../hud/common';

interface BtnProps {
  label: string;
  testid: string;
  icon: ReactNode;
  /** 0..1 phần hồi chiêu còn lại (0 = sẵn sàng). */
  cd?: number;
  /** Số giây còn lại hiện giữa nút (chỉ khi > 1 giây). */
  secs?: number;
  state?: 'ready' | 'cd' | 'nomp' | 'air' | 'charging' | 'empty';
  mc?: string;
  onPress: () => void;
  onRelease?: () => void;
}

/** Ô tiện ích cảm ứng: ≥ 44 px, bấm ngay khi chạm (Thần thức giữ ngón để sạc). Server vẫn kiểm mọi điều kiện. */
function UBtn({ label, testid, icon, cd = 0, secs = 0, state = 'ready', mc, onPress, onRelease }: BtnProps) {
  return (
    <button
      type="button"
      className="u2-slot u2-skill u2t-btn u2t-ubtn"
      style={mc ? ({ '--mc': mc } as CSSProperties) : undefined}
      data-state={state}
      data-cd={cd > 0 ? '1' : undefined}
      data-testid={testid}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.detail === 0) {
          onPress();
          onRelease?.();
        }
      }}
    >
      <IconFrame size="s">{icon}</IconFrame>
      {cd > 0 && <span className="u2-skill__cd" style={{ '--cd': cd } as CSSProperties} />}
      {secs > 1 && <span className="u2-skill__cdn">{Math.ceil(secs)}</span>}
    </button>
  );
}

const left = (until: number, now: number) => Math.max(0, until - now);

function Artifact() {
  const art = useUI((s) => s.method?.art);
  const cds = useUI((s) => s.cds);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const now = useNow(100);
  const def = art?.id ? ARTIFACT.get(art.id) : undefined;
  const item = art?.id ? ITEM.get(art.id) : undefined;
  if (!def || !item || !art)
    return (
      <UBtn
        label={t('ui.art.slot')}
        testid="touch-art"
        state="empty"
        icon={<span className="u2t-glyph">＋</span>}
        onPress={() => togglePanel('char')}
      />
    );
  const total = Math.max(1, def.cd * artifactLevelMods(art.lv).cdMul) * 1000;
  const l = left(cds[def.skill] ?? 0, now);
  const state = airborne ? 'air' : mp < def.mp ? 'nomp' : l > 80 ? 'cd' : 'ready';
  return (
    <UBtn
      label={itemName(item.id)}
      testid="touch-art"
      state={state}
      mc={'#' + def.color}
      cd={l > 80 ? Math.min(1, l / total) : 0}
      secs={l / 1000}
      icon={<ContentIcon def={item} />}
      onPress={() => Game.current?.useArtifact()}
    />
  );
}

function Bonded() {
  const level = useUI((s) => s.char?.level ?? 0);
  const cds = useUI((s) => s.cds);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const now = useNow(100);
  const lv = bondedLevel(level);
  const def = ARTIFACT.get(BONDED_ARTIFACT_ID);
  const item = ITEM.get(BONDED_ARTIFACT_ID);
  if (lv < 1 || !def || !item) return null;
  const total = Math.max(1, def.cd * artifactLevelMods(lv).cdMul) * 1000;
  const l = left(cds[def.skill] ?? 0, now);
  return (
    <UBtn
      label={itemName(item.id)}
      testid="touch-bonded"
      state={airborne ? 'air' : mp < def.mp ? 'nomp' : l > 80 ? 'cd' : 'ready'}
      mc={'#' + def.color}
      cd={l > 80 ? Math.min(1, l / total) : 0}
      secs={l / 1000}
      icon={<ContentIcon def={item} />}
      onPress={() => Game.current?.useBonded()}
    />
  );
}

function Spirit() {
  const level = useUI((s) => s.char?.level ?? 0);
  const sp = useUI((s) => s.spirit);
  const mp = useUI((s) => s.mp);
  useNow(100);
  if (!spiritUnlocked(level)) return null;
  const now = performance.now();
  const charging = sp.chUntil > now;
  const l = left(sp.cdUntil, now);
  return (
    <UBtn
      label={t('ui.spirit.title')}
      testid="touch-spirit"
      state={charging ? 'charging' : l > 80 ? 'cd' : mp < SPIRIT_MP ? 'nomp' : 'ready'}
      cd={!charging && l > 80 ? Math.min(1, l / SPIRIT_CD_MS) : 0}
      secs={charging ? 0 : l / 1000}
      icon={<UiIcon id="hud_than_thuc" fallback="👁" />}
      onPress={() => Game.current?.spiritHold(true)}
      onRelease={() => Game.current?.spiritHold(false)}
    />
  );
}

function Soul() {
  const level = useUI((s) => s.char?.level ?? 0);
  const soul = useUI((s) => s.soul);
  useNow(100);
  if (!soulUnlocked(level)) return null;
  const now = performance.now();
  const out = soul.k === SOUL_SCOUT;
  const l = left(soul.cdUntil, now);
  return (
    <UBtn
      label={t('ui.soul.title')}
      testid="touch-soul"
      state={out ? 'charging' : l > 80 ? 'cd' : 'ready'}
      cd={!out && l > 80 ? Math.min(1, l / SOUL_SCOUT_CD_MS) : 0}
      secs={out ? Math.max(0, (soul.until - now) / 1000) : l / 1000}
      icon={<UiIcon id="hud_nguyen_anh" fallback="👻" />}
      onPress={() => Game.current?.soulToggle()}
    />
  );
}

/** Phân thân (phím G) ở Hóa Thần; trong Thiên Nhân Kiếp hóa thần là thế thân. Client chỉ gửi ý định như phím G, server phân biệt và kiểm. */
function Clone() {
  const level = useUI((s) => s.char?.level ?? 0);
  const clone = useUI((s) => s.clone);
  const now = useNow(100);
  if (level < CLONE_UNLOCK_LEVEL) return null;
  const on = now < clone.until;
  const l = on ? clone.until - now : left(clone.cdUntil, now);
  return (
    <UBtn
      label={t('ui.clone.title')}
      testid="touch-clone"
      state={on ? 'charging' : l > 80 ? 'cd' : 'ready'}
      secs={l / 1000}
      icon={<span className="u2t-glyph">G</span>}
      onPress={() => {
        const eng = Game.current;
        if (!eng) return;
        if (eng.tribId === 'hoa_than' && useUI.getState().tribEnd > Date.now()) eng.send(C.TRIB_CLONE, {});
        else eng.send(C.CLONE, {});
      }}
    />
  );
}

/** Hàng chiêu bậc cao (Shift+số ở PC) cho người chơi cảm ứng. */
function Tier() {
  const method = useUI((s) => s.method);
  const level = useUI((s) => s.char?.level ?? 0);
  const cds = useUI((s) => s.cds);
  const gcdAt = useUI((s) => s.gcdAt);
  const mp = useUI((s) => s.mp);
  const airborne = useUI((s) => s.airborne);
  const now = useNow(100);
  return (
    <>
      {tierBar(method?.method, method?.br).map((sk, j) => {
        if (level < sk.unlock) return null;
        const rs = resolveBarSkill(method, sk);
        const ready = Math.max(cds[sk.id] ?? 0, gcdAt);
        const l = Math.max(0, ready - now);
        const total = (cds[sk.id] ?? 0) > gcdAt ? Math.max(1, rs.cd) * 1000 : 1000;
        return (
          <UBtn
            key={sk.id}
            label={t(`skill.${sk.id}.name`)}
            testid={'touch-tier-' + j}
            state={airborne ? 'air' : mp < sk.mp ? 'nomp' : l > 80 ? 'cd' : 'ready'}
            cd={l > 80 ? Math.min(1, l / total) : 0}
            secs={l / 1000}
            icon={<ContentIcon def={sk} />}
            onPress={() => Game.current?.useSkill(BAR_SIZE + 2 + j)}
          />
        );
      })}
    </>
  );
}

/** Ô tiện ích trên cảm ứng (hotbar phụ): pháp bảo, đan lô, thần thức, nguyên anh, phân thân, chiêu bậc cao. Nút chưa mở thì ẩn như bản PC. */
export function TouchUtility() {
  const char = useUI((s) => s.char);
  if (!char) return null;
  return (
    <div className="u2t-util" role="toolbar" aria-label={t('ui.touch.utility')} data-testid="touch-utility">
      <Artifact />
      <Bonded />
      <Spirit />
      <Soul />
      <Clone />
      <Tier />
    </div>
  );
}
