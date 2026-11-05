import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMomentsInRange, getReadingsInRange } from '../../data/stressRepository';
import type { StressMoment } from '../../data/types';
import { levelOf } from '../../domain/stressLevel';
import { GRIP_STRENGTH_LABEL } from '../../strings';
import { formatDateLabel, formatTime, shiftDay, startOfDay } from '../../util/dates';
import { LevelBadge } from '../common/LevelBadge';
import { Sparkline } from '../common/Sparkline';

const SPARKLINE_WINDOW_MS = 30 * 60 * 1000;

function inferCause(moment: StressMoment): string {
  if (moment.trigger === 'MANUAL' && moment.note && moment.note.trim() !== '') {
    return moment.note;
  }
  if (moment.tags.length > 0) {
    return `「${moment.tags.join('・')}」が影響した可能性があります`;
  }
  const hour = new Date(moment.timestamp).getHours();
  if (hour >= 6 && hour <= 8) return '睡眠不足による負荷の可能性があります';
  if (hour >= 9 && hour <= 11) return '午前中の業務負荷による上昇の可能性があります';
  if (hour >= 12 && hour <= 13) return '昼の予定によるプレッシャーの可能性があります';
  if (hour >= 14 && hour <= 17) return '長時間の作業による負荷の可能性があります';
  if (hour >= 18 && hour <= 21) return '夕方の疲労蓄積による可能性があります';
  return '生活リズムの乱れによる可能性があります';
}

export function RecordsScreen({ onOpenMoment }: { onOpenMoment: (id: number) => void }) {
  const [selectedDayStart, setSelectedDayStart] = useState(() => startOfDay(Date.now()));
  const canGoNext = selectedDayStart < startOfDay(Date.now());

  const items = useLiveQuery(async () => {
    const dayEnd = selectedDayStart + 24 * 60 * 60 * 1000;
    const moments = (await getMomentsInRange(selectedDayStart, dayEnd)).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    const dayReadings = await getReadingsInRange(
      selectedDayStart - SPARKLINE_WINDOW_MS,
      dayEnd + SPARKLINE_WINDOW_MS,
    );
    return moments.map((moment) => ({
      moment,
      sparklineScores: dayReadings
        .filter(
          (r) =>
            r.timestamp >= moment.timestamp - SPARKLINE_WINDOW_MS &&
            r.timestamp <= moment.timestamp + SPARKLINE_WINDOW_MS,
        )
        .map((r) => r.stressScore),
      causeText: inferCause(moment),
    }));
  }, [selectedDayStart]);

  return (
    <div className="screen records">
      <div className="date-nav">
        <button
          className="icon-btn"
          onClick={() => setSelectedDayStart((d) => shiftDay(d, -1))}
          aria-label="前の日"
        >
          ‹
        </button>
        <div className="date-nav-label">{formatDateLabel(selectedDayStart)}</div>
        <button
          className="icon-btn"
          onClick={() => canGoNext && setSelectedDayStart((d) => shiftDay(d, 1))}
          disabled={!canGoNext}
          aria-label="次の日"
        >
          ›
        </button>
      </div>

      {items !== undefined && items.length === 0 && (
        <div className="empty-state">この日の記録はありません</div>
      )}

      {(items ?? []).map(({ moment, sparklineScores, causeText }) => {
        const level = levelOf(moment.stressScore);
        return (
          <button
            key={moment.id}
            className="card record-card"
            onClick={() => moment.id !== undefined && onOpenMoment(moment.id)}
          >
            <span className="record-time">{formatTime(moment.timestamp)}</span>
            <LevelBadge level={level} />
            <span className="record-body">
              <span className="record-trigger">
                {moment.trigger === 'AUTO' ? '心拍変動の上昇を検知' : '手動で記録'}
                {moment.gripped && moment.gripStrength && (
                  <span className="muted"> ・握り {GRIP_STRENGTH_LABEL[moment.gripStrength]}</span>
                )}
              </span>
              <span className="muted record-cause">{causeText}</span>
            </span>
            {sparklineScores.length >= 2 && <Sparkline scores={sparklineScores} level={level} />}
          </button>
        );
      })}
    </div>
  );
}
