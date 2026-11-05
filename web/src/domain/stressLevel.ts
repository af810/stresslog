// Android版 ui/common/StressLevel.kt の移植。閾値・色コードを一致させる
export type StressLevel = 'LOW' | 'MID' | 'HIGH';

export const LEVEL_LABEL: Record<StressLevel, string> = {
  LOW: '低',
  MID: '中',
  HIGH: '高',
};

export const LEVEL_COLOR: Record<StressLevel, string> = {
  LOW: '#4CAF50',
  MID: '#FFA726',
  HIGH: '#E53935',
};

export function levelOf(score: number): StressLevel {
  if (score < 40) return 'LOW';
  if (score < 70) return 'MID';
  return 'HIGH';
}

export function stressScoreColor(score: number): string {
  return LEVEL_COLOR[levelOf(score)];
}

const HEATMAP_LOW = { r: 0xff, g: 0xf5, b: 0xf5 };
const HEATMAP_HIGH = { r: 0xc6, g: 0x28, b: 0x28 };

/** 0.0(データなし/低)〜1.0(高)の強さを白→赤の濃淡に変換する（カレンダー/ヒートマップ共通） */
export function heatColor(intensity: number): string {
  const t = Math.min(1, Math.max(0, intensity));
  const r = Math.round(HEATMAP_LOW.r + (HEATMAP_HIGH.r - HEATMAP_LOW.r) * t);
  const g = Math.round(HEATMAP_LOW.g + (HEATMAP_HIGH.g - HEATMAP_LOW.g) * t);
  const b = Math.round(HEATMAP_LOW.b + (HEATMAP_HIGH.b - HEATMAP_LOW.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
