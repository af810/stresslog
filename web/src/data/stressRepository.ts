import { db } from './db';
import {
  BASELINE_SINGLETON_ID,
  initialBaseline,
  type Baseline,
  type DailyStressAggregate,
  type GripStrength,
  type StressMoment,
  type StressReading,
} from './types';
import { MOCK_SOURCE_ID, readLatestSample } from './mockStressDataSource';
import { updateBaseline } from '../domain/baselineTracker';
import { calculateStressScore } from '../domain/stressCalculator';
import { startOfDay } from '../util/dates';

// Android版 data/repository/StressRepository.kt の移植。
// Flow での監視は各画面側で dexie-react-hooks の useLiveQuery が担う

export interface SampleResult {
  reading: StressReading;
  baseline: Baseline;
}

// ---- Readings ----

export async function getReadingsInRange(from: number, to: number): Promise<StressReading[]> {
  return db.stressReadings.where('timestamp').between(from, to, true, false).sortBy('timestamp');
}

/** RoomのGROUP BY相当。ローカルタイムの日単位で平均/最大を集計する */
export async function getDailyAggregates(from: number, to: number): Promise<DailyStressAggregate[]> {
  const readings = await getReadingsInRange(from, to);
  const byDay = new Map<number, { sum: number; max: number; count: number }>();
  for (const r of readings) {
    const day = startOfDay(r.timestamp);
    const agg = byDay.get(day) ?? { sum: 0, max: 0, count: 0 };
    agg.sum += r.stressScore;
    agg.max = Math.max(agg.max, r.stressScore);
    agg.count += 1;
    byDay.set(day, agg);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayStart, agg]) => ({
      dayStart,
      avgScore: agg.sum / agg.count,
      maxScore: agg.max,
    }));
}

/** データ源から1点取得し、ベースライン更新→スコア算出→記録までの一連の処理を行う */
export async function sampleOnce(): Promise<SampleResult> {
  const sample = readLatestSample();

  const current = (await db.baselines.get(BASELINE_SINGLETON_ID)) ?? initialBaseline();
  const baseline = updateBaseline(current, sample.hrvRmssd, sample.heartRate);
  await db.baselines.put(baseline);

  const score = calculateStressScore(sample.hrvRmssd, sample.heartRate, baseline);

  const reading: StressReading = {
    timestamp: sample.timestamp,
    stressScore: score,
    hrvRmssd: sample.hrvRmssd,
    heartRate: sample.heartRate,
    baselineHrv: baseline.meanHrv,
    source: MOCK_SOURCE_ID,
  };
  const id = await db.stressReadings.add(reading);
  return { reading: { ...reading, id }, baseline };
}

// ---- Moments ----

export async function getMoment(id: number): Promise<StressMoment | undefined> {
  return db.stressMoments.get(id);
}

export async function getMomentsInRange(from: number, to: number): Promise<StressMoment[]> {
  return db.stressMoments.where('timestamp').between(from, to, true, false).sortBy('timestamp');
}

export async function getLastAutoMomentTime(): Promise<number | null> {
  const autos = await db.stressMoments.where('trigger').equals('AUTO').toArray();
  if (autos.length === 0) return null;
  return Math.max(...autos.map((m) => m.timestamp));
}

export interface GripRecord {
  gripped: boolean;
  gripStrength: GripStrength | null;
  gripRawAdcAvg: number | null;
}

export async function recordManualMoment(
  score: number,
  note: string | null,
  tags: string[],
  currentHr: number | null,
  grip: GripRecord = { gripped: false, gripStrength: null, gripRawAdcAvg: null },
): Promise<number | undefined> {
  return db.stressMoments.add({
    timestamp: Date.now(),
    stressScore: score,
    trigger: 'MANUAL',
    note,
    tags,
    hrBefore: currentHr,
    hrAfter: null,
    appliedSuggestion: null,
    ...grip,
  });
}

export async function recordAutoMoment(
  reading: StressReading,
  appliedSuggestion: string | null,
): Promise<number | undefined> {
  return db.stressMoments.add({
    timestamp: reading.timestamp,
    stressScore: reading.stressScore,
    trigger: 'AUTO',
    note: null,
    tags: [],
    hrBefore: reading.heartRate,
    hrAfter: null,
    appliedSuggestion,
  });
}

export async function updateMoment(moment: StressMoment): Promise<void> {
  if (moment.id === undefined) return;
  await db.stressMoments.put(moment);
}
