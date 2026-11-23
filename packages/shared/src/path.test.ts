import { describe, expect, it } from 'vitest';
import { methodOfVoice, pathErrors, pathOfKey, poseIdFor, registerMethodVoices, voiceOf, type PathDef } from './index';

const P = (id: string, o: Partial<PathDef> = {}): PathDef => ({
  id,
  role: 'dps',
  methods: [id + '_m'],
  dao: 'kiem',
  art: 'kiem',
  voice: 'kt',
  gm: id,
  weapons: ['sword'],
  palette: { core: '000000', body: '111111', rim: '222222', accent: '333333', shadow: '444444' },
  tint: 'ffffff',
  match: [],
  synergy: { gives: [], wants: [] },
  ...o,
});
const PATHS = [P('a'), P('b', { role: 'tank', match: ['kim_than', 'ho_phap'] }), P('c', { role: 'support', match: ['dan_su'] })];
const METHODS = [
  { id: 'a_m', role: 'dps' as const },
  { id: 'b_m', role: 'tank' as const },
  { id: 'c_m', role: 'support' as const },
];
const VOICES = ['kt', 'hp', 'ds', 'dt'];

describe('hướng tu (VS-3)', () => {
  it('tra theo id công pháp, id hướng, rồi mới tới chuỗi con trong match; không ra thì undefined', () => {
    expect(pathOfKey(PATHS, 'b_m')?.id).toBe('b');
    expect(pathOfKey(PATHS, 'c')?.id).toBe('c');
    expect(pathOfKey(PATHS, 'xx_ho_phap_yy')?.id).toBe('b');
    expect(pathOfKey(PATHS, 'la')).toBeUndefined();
    expect(pathOfKey(PATHS, undefined)).toBeUndefined();
    expect(pathOfKey(PATHS, '')).toBeUndefined();
  });
  it('kiểm dữ liệu', () => {
    const marks = new Set(['kiem_an']);
    expect(pathErrors(PATHS, METHODS, marks, VOICES)).toEqual([]);
    const bad = (list: PathDef[], methods = METHODS) => pathErrors(list, methods, marks, VOICES).join(' | ');
    expect(bad([...PATHS, P('a')])).toMatch(/trùng id/);
    expect(bad([P('a'), P('b', { role: 'tank', methods: ['a_m'] }), PATHS[2]!])).toMatch(/đã thuộc hướng a/);
    expect(bad(PATHS, [...METHODS, { id: 'le', role: 'dps' }])).toMatch(/không thuộc hướng tu nào/);
    expect(bad([P('a', { role: 'tank' }), PATHS[1]!, PATHS[2]!])).toMatch(/lệch vai/);
    expect(bad([P('a', { tint: 'xyz' }), PATHS[1]!, PATHS[2]!])).toMatch(/tint/);
    expect(bad([P('a', { voice: 'zz' as never }), PATHS[1]!, PATHS[2]!])).toMatch(/voice/);
    expect(bad([P('a', { synergy: { gives: ['la' as never], wants: [] } }), PATHS[1]!, PATHS[2]!])).toMatch(/ấn "la"/);
    expect(bad([P('a', { gm: 'b' }), PATHS[1]!, PATHS[2]!])).toMatch(/bí danh GM/);
  });
  it('bộ động tác theo công pháp do bảng đăng ký quyết định; chưa đăng ký hay id lạ thì giọng kiếm tu', () => {
    registerMethodVoices({});
    expect(voiceOf('b_m')).toBe('kt');
    registerMethodVoices({ a_m: 'kt', b_m: 'hp', c_m: 'ds' });
    expect(voiceOf('b_m')).toBe('hp');
    expect(voiceOf('la')).toBe('kt');
    expect(voiceOf(undefined)).toBe('kt');
    expect(methodOfVoice('ds')).toBe('c_m');
    expect(poseIdFor('phi_kiem', { combo: 1, method: 'b_m' })).toBe('phi_kiem_2_hp');
    expect(poseIdFor('van_kiem', { method: 'b_m' })).toBe('van_kiem');
  });
});
