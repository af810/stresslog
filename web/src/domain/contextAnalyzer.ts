import type { StressMoment } from '../data/types';

// domain/ContextAnalyzer.kt の移植

export interface StressInsight {
  message: string;
}

export interface FactorRank {
  rank: number;
  tag: string;
  count: number;
}

const MIN_SAMPLES = 5;
const MIN_GROUP_SAMPLES = 2;

const WEEKDAY_NAMES = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

function timeBucketOf(timestamp: number): string {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour <= 8) return '早朝';
  if (hour >= 9 && hour <= 11) return '午前';
  if (hour >= 12 && hour <= 13) return '昼';
  if (hour >= 14 && hour <= 17) return '午後';
  if (hour >= 18 && hour <= 20) return '夕方';
  return '夜間';
}

function tagInsight(moments: StressMoment[]): StressInsight | null {
  const byTag = new Map<string, number[]>();
  for (const m of moments) {
    for (const tag of m.tags) {
      const scores = byTag.get(tag) ?? [];
      scores.push(m.stressScore);
      byTag.set(tag, scores);
    }
  }
  let best: { tag: string; scores: number[]; avg: number } | null = null;
  for (const [tag, scores] of byTag) {
    if (scores.length < MIN_GROUP_SAMPLES) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (best === null || avg > best.avg) best = { tag, scores, avg };
  }
  if (best === null) return null;
  return {
    message: `「${best.tag}」の場面でストレスが高くなりやすい傾向があります（平均スコア ${best.avg.toFixed(0)}、${best.scores.length}件）。事前の準備や区切りを設けることで軽減できるかもしれません。`,
  };
}

function weekdayInsight(moments: StressMoment[]): StressInsight | null {
  const byWeekday = new Map<number, number>();
  for (const m of moments) {
    const dow = new Date(m.timestamp).getDay();
    byWeekday.set(dow, (byWeekday.get(dow) ?? 0) + 1);
  }
  let best: { dow: number; count: number } | null = null;
  for (const [dow, count] of byWeekday) {
    if (count < MIN_GROUP_SAMPLES) continue;
    if (best === null || count > best.count) best = { dow, count };
  }
  if (best === null) return null;
  return {
    message: `${WEEKDAY_NAMES[best.dow]}にストレスの記録が集中しています（過去${best.count}件）。この曜日は事前に余裕を持ったスケジュールを意識してみましょう。`,
  };
}

function timeOfDayInsight(moments: StressMoment[]): StressInsight | null {
  const byBucket = new Map<string, number>();
  for (const m of moments) {
    const bucket = timeBucketOf(m.timestamp);
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + 1);
  }
  let best: { bucket: string; count: number } | null = null;
  for (const [bucket, count] of byBucket) {
    if (count < MIN_GROUP_SAMPLES) continue;
    if (best === null || count > best.count) best = { bucket, count };
  }
  if (best === null) return null;
  return {
    message: `${best.bucket}の時間帯にストレスを感じやすい傾向があります（過去${best.count}件）。この時間の前に短い休憩を挟むと予防になるかもしれません。`,
  };
}

/**
 * 蓄積された StressMoment（強いストレスを感じた瞬間）から、
 * タグ・時間帯・曜日の傾向を集計し、回避のヒントを提示する。
 * 統計的な集計のみで、MLモデルは使わない（MVP）。
 */
export function analyze(moments: StressMoment[]): StressInsight[] {
  if (moments.length < MIN_SAMPLES) {
    return [
      {
        message:
          'まだ記録が少ないため、傾向はまだ見えていません。記録を続けると、ストレスが高まりやすい状況が見えてきます。',
      },
    ];
  }

  const insights: StressInsight[] = [];
  const tag = tagInsight(moments);
  if (tag) insights.push(tag);
  const weekday = weekdayInsight(moments);
  if (weekday) insights.push(weekday);
  const timeOfDay = timeOfDayInsight(moments);
  if (timeOfDay) insights.push(timeOfDay);

  if (insights.length === 0) {
    insights.push({
      message: '特定の強い傾向はまだ見つかっていません。記録を続けることで精度が上がります。',
    });
  }
  return insights;
}

/** タグの出現件数トップ3を「よくあるストレス要因」として返す */
export function rankFactors(moments: StressMoment[]): FactorRank[] {
  const counts = new Map<string, number>();
  for (const m of moments) {
    for (const tag of m.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count], index) => ({ rank: index + 1, tag, count }));
}
