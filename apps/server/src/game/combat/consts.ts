import { randomInt } from 'node:crypto';
import { fxSeed } from '@dtl/shared';

/** Chiêu khiêu khích với boss chỉ giữ chừng này thời gian (tỉ lệ). */
export const TAUNT_BOSS_MUL = 0.5;
/** Bộ trang bị (P3-4): bán kính hồi cho đồng đội. */
export const SET_HEAL_RADIUS = 14;
/**
 * Seed hình cho FX (tia sét, mưa kiếm, mây kiếp). Lấy từ `crypto`, KHÔNG từ `Math.random`: seed gửi
 * cho cả kênh, nếu dùng chung RNG với luật (chí mạng, rơi đồ, cường hóa) thì lộ thêm đầu ra để đoán
 * trạng thái RNG.
 */
export const visualSeed = () => fxSeed(() => randomInt(0x7fffffff) / 0x7fffffff);
export const LEASH = 48;
