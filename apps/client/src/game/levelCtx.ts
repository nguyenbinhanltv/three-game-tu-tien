import { LEVEL_ASSETS } from '@dtl/content';
import { type Biome, type LevelAssets, type Terrain, terrainOf } from '@dtl/shared';
import { ensureTestLevel, TEST_ASSETS, TEST_LEVEL } from './testLevel';

/**
 * Level đang hiển thị ở client (E1-D). Mọi code client hỏi độ cao/biome qua các hàm dưới (thay cho `heightAt` Vân Lam của shared),
 * nên khi `Game.enterLevel` đổi level thì địa hình, nhạc, bước chân, VFX… đổi theo mà không phải truyền địa hình qua từng hàm.
 * Hàm bọc chỉ thêm một lần gọi con trỏ; kết quả Vân Lam giống hệt bản shared.
 */
let curId = 'van_lam';
let cur: Terrain = terrainOf('van_lam');

export function levelId(): string {
  return curId;
}
export function levelTerrain(): Terrain {
  return cur;
}
export function setActiveLevel(id: string): Terrain {
  if (id === TEST_LEVEL) ensureTestLevel();
  cur = terrainOf(id);
  curId = id;
  return cur;
}

export function levelAssets(id: string): LevelAssets {
  if (id === TEST_LEVEL) return TEST_ASSETS;
  const a = LEVEL_ASSETS[id];
  if (!a) throw new Error(`levelAssets: level chưa khai báo levels/${id}.assets.json`);
  return a;
}
/** Level có địa hình/asset khai báo (cho `enterLevel` từ tin server hoặc nút thử). */
export function knownLevel(id: string): boolean {
  if (id === TEST_LEVEL) {
    ensureTestLevel(); // đăng ký địa hình trước khi ai gọi `terrainOf`
    return true;
  }
  return id in LEVEL_ASSETS;
}

export function heightAt(x: number, z: number): number {
  return cur.heightAt(x, z);
}
export function groundAt(x: number, z: number): number {
  return cur.groundAt(x, z);
}
export function inLakeWater(x: number, z: number): boolean {
  return cur.inWater(x, z);
}
export function biomeAt(x: number, z: number): Biome {
  return cur.biomeAt(x, z);
}
