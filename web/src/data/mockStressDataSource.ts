import type { HealthSample } from './types';

// data/source/MockStressDataSource.kt の移植

export const MOCK_SOURCE_ID = 'mock';

// 一過性スパイクの残り継続時間（連続で呼ばれてもしばらく高値が続くようにする）
let spikeRemaining = 0;
let spikeIntensity = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function hourOfDayFraction(epochMillis: number): number {
  const d = new Date(epochMillis);
  return d.getHours() + d.getMinutes() / 60;
}

function dailyRhythm(hour: number): number {
  // 深夜(0-5時)は低い、日中にかけて緩やかに上昇し、13-18時あたりにピーク、夜は下降
  const peakShift = hour - 15.0; // 15時をピークにする
  const gaussianLike = Math.exp(-(peakShift * peakShift) / (2 * 6.0 * 6.0));
  const nightDamp = hour < 5 || hour > 23 ? 0.05 : 1.0;
  const base = 0.15 + 0.35 * gaussianLike;
  return Math.max(0, base * nightDamp);
}

/**
 * 開発・デモ用のダミーデータ源。実機ウェアラブルなしで全機能を試せるように、
 * 日内リズム（朝穏やか→日中変動→夕方に高まりやすい）＋ノイズ＋時々の
 * 一過性ストレススパイクでそれらしい波形を作る。
 */
export function readLatestSample(): HealthSample {
  const now = Date.now();
  const baseLoad = dailyRhythm(hourOfDayFraction(now));

  // ランダムに一過性スパイクを発生させる（約5%の確率で新規発生）
  if (spikeRemaining <= 0 && Math.random() < 0.05) {
    spikeRemaining = 1 + Math.floor(Math.random() * 3); // 数サンプル分持続
    spikeIntensity = randomBetween(0.3, 0.7);
  }
  let spikeLoad = 0;
  if (spikeRemaining > 0) {
    spikeRemaining -= 1;
    spikeLoad = spikeIntensity;
  }

  const load = Math.min(1.0, baseLoad + spikeLoad);

  // load が高いほど HRV は下がり、心拍は上がる
  const hrv = Math.min(80, Math.max(10, 55.0 - load * 30.0 + randomBetween(-4, 4)));
  const hr = Math.min(150, Math.max(45, Math.trunc(62 + load * 35 + randomBetween(-5, 5))));

  return { timestamp: now, hrvRmssd: hrv, heartRate: hr };
}
