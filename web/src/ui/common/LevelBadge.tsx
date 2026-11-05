import { LEVEL_COLOR, LEVEL_LABEL, type StressLevel } from '../../domain/stressLevel';

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 低/中/高 のレベルバッジ（記録カード等で使用） */
export function LevelBadge({ level }: { level: StressLevel }) {
  return (
    <span
      className="level-badge"
      style={{ background: withAlpha(LEVEL_COLOR[level], 0.15), color: LEVEL_COLOR[level] }}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}
