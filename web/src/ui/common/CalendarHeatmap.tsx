import { heatColor } from '../../domain/stressLevel';

export interface CalendarDayCell {
  dayOfMonth: number;
  dayStart: number;
  avgScore: number | null;
}

/** 月間カレンダーを日平均スコアの赤の濃淡で塗るヒートマップ */
export function CalendarHeatmap({ cells }: { cells: CalendarDayCell[] }) {
  if (cells.length === 0) return null;

  const firstDow = new Date(cells[0].dayStart).getDay(); // 0=日曜

  const weeks: (CalendarDayCell | null)[][] = [];
  let currentWeek: (CalendarDayCell | null)[] = new Array<CalendarDayCell | null>(7).fill(null);
  let col = firstDow;
  for (const cell of cells) {
    currentWeek[col] = cell;
    col++;
    if (col === 7) {
      weeks.push(currentWeek);
      currentWeek = new Array<CalendarDayCell | null>(7).fill(null);
      col = 0;
    }
  }
  if (col !== 0) weeks.push(currentWeek);

  return (
    <div className="calendar-heatmap">
      <div className="calendar-row">
        {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
          <div key={label} className="calendar-dow">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="calendar-row">
          {week.map((cell, ci) => {
            if (!cell) return <div key={ci} className="calendar-cell" />;
            const intensity = cell.avgScore !== null ? cell.avgScore / 100 : 0;
            const bg = cell.avgScore !== null ? heatColor(intensity) : 'transparent';
            return (
              <div key={ci} className="calendar-cell">
                <div
                  className="calendar-day"
                  style={{
                    background: bg,
                    color: intensity > 0.5 ? '#fff' : '#1c1b1f',
                  }}
                >
                  {cell.dayOfMonth}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
