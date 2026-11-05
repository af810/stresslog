// Android版 data/local/ のエンティティ定義の移植

/** 定期サンプリングで記録される、算出済みのストレス値1点分 */
export interface StressReading {
  id?: number;
  timestamp: number;
  stressScore: number;
  hrvRmssd: number | null;
  heartRate: number | null;
  baselineHrv: number | null;
  source: string;
}

export type TriggerType = 'AUTO' | 'MANUAL';

export type GripStrength = 'SMALL' | 'MEDIUM' | 'LARGE';

/** 強いストレスを感じた瞬間の記録（自動検知 or 手動記録） */
export interface StressMoment {
  id?: number;
  timestamp: number;
  stressScore: number;
  trigger: TriggerType;
  note: string | null;
  tags: string[];
  hrBefore: number | null;
  hrAfter: number | null;
  appliedSuggestion: string | null;
  /** 圧力センサー付きGraspeeを握ったか。旧レコードには存在しないため undefined もあり得る */
  gripped?: boolean;
  gripStrength?: GripStrength | null;
  /** 計測n秒間のrawAdc平均値。校正後のforceKgではなく生値で分類する */
  gripRawAdcAvg?: number | null;
}

/** 個人のHRV/心拍ベースライン（常に単一行で保持し、逐次更新する） */
export interface Baseline {
  id: number;
  meanHrv: number;
  stdHrv: number;
  meanRestingHr: number;
  sampleCount: number;
  updatedAt: number;
}

export const BASELINE_SINGLETON_ID = 0;

/** サンプルが十分集まるまでの暫定初期値 */
export function initialBaseline(): Baseline {
  return {
    id: BASELINE_SINGLETON_ID,
    meanHrv: 45.0,
    stdHrv: 10.0,
    meanRestingHr: 65.0,
    sampleCount: 0,
    updatedAt: 0,
  };
}

export interface HealthSample {
  timestamp: number;
  hrvRmssd: number;
  heartRate: number;
}

export interface DailyStressAggregate {
  dayStart: number;
  avgScore: number;
  maxScore: number;
}
