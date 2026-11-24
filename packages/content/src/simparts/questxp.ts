// Tách từ sim.ts (tối ưu Đợt E): questxp.
import { TRUC_CO_LEVEL, KET_DAN_LEVEL, NGUYEN_ANH_LEVEL, HOA_THAN_LEVEL, xpNeed } from '@dtl/shared';
import { QUESTS } from '../index';

import { at } from '@dtl/shared';
import { pct } from './common';
import { main } from './pace1';

// ---------- tu vi từ nhiệm vụ chương 2 (E2-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q2_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s2_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = TRUC_CO_LEVEL; l < KET_DAN_LEVEL; l++) stageXp += xpNeed(l);
  const income = (l: number) => 400 * (12 + 7 * l) * 1.25 * 0.9;
  console.log('\nNhiệm vụ chương 2 (E2-H): tu vi thưởng so với chặng Trúc Cơ (nhịp thiết kế 4 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng   giờ tương đương');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(TRUC_CO_LEVEL, q.minLevel ?? TRUC_CO_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)} ${(q.rewards.xp / income(lv)).toFixed(2).padStart(10)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  const sideXp = sum(sideQ);
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sideXp} (${pct(sideXp / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 4 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 2 chiếm ${pct(mainShare)} chặng Trúc Cơ, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? TRUC_CO_LEVEL, TRUC_CO_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 3 (E3-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q3_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s3_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = KET_DAN_LEVEL; l < NGUYEN_ANH_LEVEL; l++) stageXp += xpNeed(l);
  console.log('\nNhiệm vụ chương 3 (E3-H): tu vi thưởng so với chặng Kết Đan (nhịp thiết kế 6 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(KET_DAN_LEVEL, q.minLevel ?? KET_DAN_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 6 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 3 chiếm ${pct(mainShare)} chặng Kết Đan, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? KET_DAN_LEVEL, KET_DAN_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 4 (E4-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q4_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s4_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = NGUYEN_ANH_LEVEL; l < HOA_THAN_LEVEL; l++) stageXp += xpNeed(l);
  console.log('\nNhiệm vụ chương 4 (E4-H): tu vi thưởng so với chặng Nguyên Anh (nhịp thiết kế 8 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(NGUYEN_ANH_LEVEL, q.minLevel ?? NGUYEN_ANH_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 8 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 4 chiếm ${pct(mainShare)} chặng Nguyên Anh, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? NGUYEN_ANH_LEVEL, NGUYEN_ANH_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 5 (DV3-H) ----------
{
  // Chặng Hóa Thần 28→31 theo `xpNeed` thật của shared (docs/DIVUC_DESIGN.md mục 2.2).
  const DESIGN_NEED = [28, 29, 30, 31].map((l) => xpNeed(l));
  const stageXp = DESIGN_NEED.reduce((a, b) => a + b, 0);
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q5_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s5_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  console.log(`\nNhiệm vụ chương 5 (DV3-H): tu vi thưởng so với chặng Hóa Thần → Anh Biến (nhịp thiết kế 10 giờ, tổng ${stageXp})`);
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    console.log(
      `${q.id.padEnd(19)} ${String(q.minLevel ?? 28).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 10 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 5 chiếm ${pct(mainShare)} chặng Hóa Thần, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = at(DESIGN_NEED, Math.min(Math.max((q.minLevel ?? 28) - 28, 0), 3));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

console.log('\nThử thách tâm ma (bình cảnh, Kiếm tu):');
for (const r of main.trialRows) console.log(r);
console.log(
  'máu/s: phần trăm máu tối đa mất mỗi giây khi đứng yên không né; mất/lần: sau khi trừ khiên + hồi nguyên, đã nhân kéo cụm; tọa: giây đả tọa hồi lại; tìm: giây tìm quái mỗi lần giết.',
);
