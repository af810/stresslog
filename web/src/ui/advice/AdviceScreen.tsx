import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { analyze } from '../../domain/contextAnalyzer';
import { stressScoreColor } from '../../domain/stressLevel';
import { formatShortDateTime } from '../../util/dates';

export function AdviceScreen() {
  const moments = useLiveQuery(
    () => db.stressMoments.orderBy('timestamp').reverse().toArray(),
    [],
  );

  const insights = moments ? analyze(moments) : [];
  const history = (moments ?? []).filter(
    (m) => m.appliedSuggestion !== null && m.appliedSuggestion.trim() !== '',
  );

  return (
    <div className="screen advice">
      <h2 className="section-title">傾向とアドバイス</h2>
      {insights.map((insight, i) => (
        <div key={i} className="card card-secondary">
          <div className="insight-row">
            <span className="insight-icon">🤖</span>
            <div>{insight.message}</div>
          </div>
        </div>
      ))}

      {history.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 8 }}>
            過去に提案した解消法
          </h2>
          {history.map((moment) => (
            <div key={moment.id} className="card">
              <div className="muted">
                {formatShortDateTime(moment.timestamp)}
                <span style={{ color: stressScoreColor(moment.stressScore), marginLeft: 8 }}>
                  スコア {moment.stressScore}
                </span>
              </div>
              <div style={{ height: 4 }} />
              <div>{moment.appliedSuggestion}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
