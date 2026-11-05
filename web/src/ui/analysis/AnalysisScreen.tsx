import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getDailyAggregates,
  getMomentsInRange,
  getReadingsInRange,
} from '../../data/stressRepository';
import type { DailyStressAggregate } from '../../data/types';
import { rankFactors } from '../../domain/contextAnalyzer';
import { LEVEL_COLOR, levelOf } from '../../domain/stressLevel';
import { daysAgo, formatShortDate, shiftDay, startOfDay } from '../../util/dates';
import { CalendarHeatmap, type CalendarDayCell } from '../common/CalendarHeatmap';
import { StressLineChart, type LinePoint } from '../common/StressLineChart';
import { TimeOfDayHeatmap, type HourlyLevelCount } from '../common/TimeOfDayHeatmap';

type AnalysisPeriod = 'DAY' | 'WEEK' | 'MONTH';

const PERIODS: [AnalysisPeriod, string][] = [
  ['DAY', '日'],
  ['WEEK', '週'],
  ['MONTH', '月'],
];

const RANK_COLORS: Record<number, string> = {
  1: LEVEL_COLOR.HIGH,
  2: LEVEL_COLOR.MID,
  3: LEVEL_COLOR.LOW,
};

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildHourlyLevelCounts(scoresByTime: [number, number][]): HourlyLevelCount[] {
  const counts = new Map<string, HourlyLevelCount>();
  for (const [timestamp, score] of scoresByTime) {
    const bucket = Math.floor(new Date(timestamp).getHours() / 2);
    const level = levelOf(score);
    const key = `${bucket}:${level}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { hourBucket: bucket, level, count: 1 });
  }
  return [...counts.values()];
}

function buildMonthCells(
  from: number,
  to: number,
  byDay: Map<number, DailyStressAggregate>,
): CalendarDayCell[] {
  const cells: CalendarDayCell[] = [];
  let day = startOfDay(from);
  while (day <= to) {
    cells.push({
      dayOfMonth: new Date(day).getDate(),
      dayStart: day,
      avgScore: byDay.get(day)?.avgScore ?? null,
    });
    day = shiftDay(day, 1);
  }
  return cells;
}

export function AnalysisScreen() {
  const [period, setPeriod] = useState<AnalysisPeriod>('WEEK');

  const state = useLiveQuery(async () => {
    const now = Date.now();
    const from =
      period === 'DAY' ? startOfDay(now) : period === 'WEEK' ? daysAgo(7) : daysAgo(30);

    const readings = await getReadingsInRange(from, Number.MAX_SAFE_INTEGER);
    const moments = await getMomentsInRange(from, Number.MAX_SAFE_INTEGER);
    const hourlyLevelCounts = buildHourlyLevelCounts(
      readings.map((r) => [r.timestamp, r.stressScore]),
    );
    const factorRanks = rankFactors(moments);

    const periodAverage =
      readings.length > 0
        ? Math.trunc(readings.reduce((sum, r) => sum + r.stressScore, 0) / readings.length)
        : null;

    let linePoints: LinePoint[] = [];
    let calendarCells: CalendarDayCell[] = [];
    let periodLabel: string;

    if (period === 'DAY') {
      linePoints = readings.map((r) => ({ timestamp: r.timestamp, score: r.stressScore }));
      periodLabel = '本日';
    } else if (period === 'WEEK') {
      const aggregates = await getDailyAggregates(from, Number.MAX_SAFE_INTEGER);
      linePoints = aggregates.map((a) => ({
        timestamp: a.dayStart,
        score: Math.trunc(a.avgScore),
      }));
      periodLabel = `${formatShortDate(from)} 〜 ${formatShortDate(now)}`;
    } else {
      const aggregates = await getDailyAggregates(from, Number.MAX_SAFE_INTEGER);
      const byDay = new Map(aggregates.map((a) => [a.dayStart, a]));
      calendarCells = buildMonthCells(from, now, byDay);
      periodLabel = '過去30日間';
    }

    return { periodAverage, linePoints, calendarCells, hourlyLevelCounts, factorRanks, periodLabel };
  }, [period]);

  const averageLevel = levelOf(state?.periodAverage ?? 0);

  return (
    <div className="screen analysis">
      <div className="segmented">
        {PERIODS.map(([p, label]) => (
          <button
            key={p}
            className={`segmented-item${period === p ? ' selected' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card trend-card">
        <div className="row-between">
          <div>
            <div className="card-title">
              {period === 'MONTH' ? '月間の傾向' : 'ストレスレベルの推移'}
            </div>
            <div className="muted">{state?.periodLabel ?? ''}</div>
          </div>
          {state?.periodAverage != null && (
            <div
              className="average-badge"
              style={{
                background: withAlpha(LEVEL_COLOR[averageLevel], 0.15),
                color: LEVEL_COLOR[averageLevel],
              }}
            >
              <span className="average-badge-label">期間平均</span>
              <span className="average-badge-value">{state.periodAverage} /100</span>
            </div>
          )}
        </div>
        <div style={{ height: 12 }} />
        {period === 'MONTH' ? (
          <CalendarHeatmap cells={state?.calendarCells ?? []} />
        ) : (
          <StressLineChart points={state?.linePoints ?? []} colorPointsByLevel />
        )}
      </div>

      <div className="card">
        <div className="card-title">時間帯別の傾向</div>
        <div style={{ height: 8 }} />
        <TimeOfDayHeatmap counts={state?.hourlyLevelCounts ?? []} />
      </div>

      {state && state.factorRanks.length > 0 && (
        <div className="card">
          <div className="card-title">よくあるストレス要因（推定）</div>
          <div style={{ height: 8 }} />
          {state.factorRanks.map((rank) => (
            <div key={rank.rank} className="factor-row">
              <span className="factor-left">
                <span
                  className="rank-badge"
                  style={{
                    background: withAlpha(RANK_COLORS[rank.rank] ?? LEVEL_COLOR.LOW, 0.2),
                    color: RANK_COLORS[rank.rank] ?? LEVEL_COLOR.LOW,
                  }}
                >
                  {rank.rank}位
                </span>
                <span>{rank.tag}</span>
              </span>
              <span className="muted">({rank.count}回)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
