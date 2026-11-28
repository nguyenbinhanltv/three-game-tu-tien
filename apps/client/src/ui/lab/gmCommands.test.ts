import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { t } from '@dtl/content';
import { describe, expect, it } from 'vitest';
import { GM_CMDS, GM_IN_BALANCE, GM_NAMES, gmBuild, gmDefaults, gmOptions } from './gmCommands';

const server = readFileSync(fileURLToPath(new URL('../../../../server/src/game/gm/index.ts', import.meta.url)), 'utf8');
/** Mọi `case '<lệnh>'` ở mức lệnh GM (lùi 6 khoảng trắng) của server. */
const serverCmds = [...new Set([...server.matchAll(/^ {6}case '([a-z]+)':/gm)].map((m) => m[1]!))];
/** Lệnh nội bộ (đối số con của `state`, bí danh) không cần hàng riêng. */
const SUB = new Set(['break', 'stun', 'weak', 'chant', 'clear']);
/** Nhóm lệnh chưa có hàng điều khiển (làm ở các PR kế tiếp); danh sách này chỉ được rút ngắn. */
const PENDING = new Set<string>([]);

describe('bảng lệnh GM của tab Lệnh GM', () => {
  it('mọi lệnh server đều có hàng, nằm ở Cân bằng, là lệnh con, hoặc đang chờ PR kế', () => {
    const missing = serverCmds.filter((c) => !GM_NAMES.has(c) && !(GM_IN_BALANCE as readonly string[]).includes(c) && !SUB.has(c) && !PENDING.has(c));
    expect(missing).toEqual([]);
  });
  it('mỗi hàng có khóa duy nhất', () => {
    const keys = GM_CMDS.map((c) => c.key ?? c.name);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('mọi lệnh trong bảng có thật ở server', () => {
    expect(GM_CMDS.filter((c) => !serverCmds.includes(c.name)).map((c) => c.name)).toEqual([]);
  });
  it('mọi nhãn i18n (lệnh, tham số, giá trị chọn) đều có', () => {
    const keys = new Set<string>();
    for (const c of GM_CMDS) {
      keys.add('ui.gm.cmd.' + (c.key ?? c.name));
      for (const p of c.params) {
        keys.add('ui.gm.param.' + p.k);
        for (const o of p.opts ?? []) keys.add('ui.gm.opt.' + o);
      }
      for (const x of c.extra ?? []) keys.add('ui.gm.extra.' + x.k);
    }
    const bad = [...keys].filter((k) => t(k) === k || t(k).startsWith('['));
    expect(bad).toEqual([]);
  });
  it('ghép lệnh: mặc định hợp lệ, thiếu/ngoài biên thì null, tham số tùy chọn bỏ đuôi', () => {
    const by = (n: string) => GM_CMDS.find((c) => c.name === n)!;
    expect(gmBuild(by('level'), gmDefaults(by('level')))).toBe('level 20');
    expect(gmBuild(by('level'), { level: '99' })).toBeNull();
    expect(gmBuild(by('level'), { level: '' })).toBeNull();
    expect(gmBuild(by('god'), { onoff: '' })).toBe('god');
    expect(gmBuild(by('trib'), { trib: '', stage: '' })).toBe('trib');
    expect(gmBuild(by('trib'), { trib: 'ngu_suy', stage: '3' })).toBe('trib ngu_suy 3');
    expect(gmBuild(by('trib'), { trib: '', stage: '3' })).toBeNull();
    expect(gmBuild(by('dye'), { dye: 'a b' })).toBeNull();
    expect(gmBuild(by('kit'), { tier: '2', branch: 'kiem', plus: '10', gender: 'm' })).toBe('kit 2 kiem +10 m');
    expect(gmBuild(by('kit'), { tier: '2', branch: 'kiem', plus: '', gender: 'f' })).toBe('kit 2 kiem f');
    expect(gmBuild(by('find'), { keyword: 'liet mach' })).toBe('find liet mach');
    expect(gmBuild(by('weapon'), { weapon: 'itm_liet_mach_kiem', plus: '10' })).toBe('weapon itm_liet_mach_kiem +10');
    expect(gmBuild(by('plus'), { plus_n: '10', slot: '' })).toBe('plus 10');
    expect(gmBuild(GM_CMDS.find((c) => c.key === 'tp_xz')!, { x: '2048', z: '2088' })).toBe('tp 2048 2088');
    expect(gmBuild(by('tp'), { place: 'boss' })).toBe('tp boss');
    expect(gmBuild(by('state'), { state: 'break', sec: '10' })).toBe('state break 10');
    expect(gmBuild(by('help'), { cmd_name: '' })).toBe('help');
    expect(gmBuild(by('build'), { method: 'lac_kiem_quyet', level: '30' })).toBe('build lac_kiem_quyet 30');
  });
  it('mỗi nguồn id có danh sách không rỗng', () => {
    for (const c of GM_CMDS) for (const p of c.params) if (p.src) expect(gmOptions(p.src).length, `${c.name}.${p.k}`).toBeGreaterThan(0);
  });
});
