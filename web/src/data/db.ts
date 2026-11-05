import Dexie, { type EntityTable } from 'dexie';
import type { Baseline, StressMoment, StressReading } from './types';

// Android版 Room の stresslog.db に対応する IndexedDB スキーマ
class StressLogDatabase extends Dexie {
  stressReadings!: EntityTable<StressReading, 'id'>;
  stressMoments!: EntityTable<StressMoment, 'id'>;
  baselines!: EntityTable<Baseline, 'id'>;

  constructor() {
    super('stresslog');
    this.version(1).stores({
      stressReadings: '++id, timestamp',
      stressMoments: '++id, timestamp, trigger',
      baselines: 'id',
    });
  }
}

export const db = new StressLogDatabase();
