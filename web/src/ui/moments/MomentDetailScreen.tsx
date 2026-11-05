import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getMoment, getReadingsInRange, updateMoment } from '../../data/stressRepository';
import { stressScoreColor } from '../../domain/stressLevel';
import { GRIP_STRENGTH_LABEL, QUICK_TAGS } from '../../strings';
import { formatFullDateTime } from '../../util/dates';
import { StressLineChart } from '../common/StressLineChart';

const WINDOW_MS = 30 * 60 * 1000;

export function MomentDetailScreen({
  momentId,
  onBack,
}: {
  momentId: number;
  onBack: () => void;
}) {
  const data = useLiveQuery(async () => {
    const moment = await getMoment(momentId);
    if (!moment) return { moment: undefined, surrounding: [] };
    const surrounding = await getReadingsInRange(
      moment.timestamp - WINDOW_MS,
      moment.timestamp + WINDOW_MS,
    );
    return { moment, surrounding };
  }, [momentId]);

  const moment = data?.moment;

  const [note, setNote] = useState('');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  // momentのロード完了時に編集フォームへ反映（Androidの remember(moment.id) 相当）
  useEffect(() => {
    if (moment) {
      setNote(moment.note ?? '');
      setTags(new Set(moment.tags));
    }
  }, [moment?.id]);

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    if (!moment) return;
    await updateMoment({
      ...moment,
      note: note.trim() === '' ? null : note,
      tags: [...tags],
    });
    setSaved(true);
  };

  return (
    <div className="detail-overlay">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          ←
        </button>
        <span className="topbar-title">記録の詳細</span>
      </div>

      <div className="screen">
        {data === undefined ? (
          <div className="loading-text">読み込み中…</div>
        ) : !moment ? (
          <div className="loading-text">記録が見つかりませんでした</div>
        ) : (
          <>
            <div className="detail-header">
              <div className="detail-date">{formatFullDateTime(moment.timestamp)}</div>
              <div className="detail-score" style={{ color: stressScoreColor(moment.stressScore) }}>
                ストレススコア: {moment.stressScore}
              </div>
            </div>

            <div className="card">
              <div className="card-title">前後±30分の推移</div>
              <div style={{ height: 8 }} />
              <StressLineChart
                points={data.surrounding.map((r) => ({
                  timestamp: r.timestamp,
                  score: r.stressScore,
                }))}
              />
            </div>

            {moment.gripped && (
              <div className="card">
                <div className="card-title">Graspeeを握った強さ</div>
                <div style={{ height: 4 }} />
                <div>
                  {moment.gripStrength ? GRIP_STRENGTH_LABEL[moment.gripStrength] : '計測なし'}
                  {moment.gripRawAdcAvg != null && (
                    <span className="muted"> (rawAdc平均: {Math.round(moment.gripRawAdcAvg)})</span>
                  )}
                </div>
              </div>
            )}

            {moment.appliedSuggestion && moment.appliedSuggestion.trim() !== '' && (
              <div className="card">
                <div className="card-title">提案した解消法</div>
                <div style={{ height: 4 }} />
                <div>{moment.appliedSuggestion}</div>
              </div>
            )}

            <div className="card-title" style={{ marginTop: 8 }}>
              状況タグ
            </div>
            <div style={{ height: 8 }} />
            <div className="chip-row">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  className={`chip${tags.has(tag) ? ' selected' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div style={{ height: 16 }} />
            <input
              className="text-field"
              type="text"
              placeholder="メモ（何があったか）"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
            />

            <div style={{ height: 16 }} />
            <button className="btn full" onClick={() => void save()}>
              {saved ? '保存しました ✓' : '保存'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
