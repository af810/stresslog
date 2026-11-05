import { describe, expect, it } from 'vitest';
import { initialBaseline, type Baseline } from '../../data/types';
import { updateBaseline } from '../baselineTracker';

// Kotlin版 BaselineTracker (EMA + 適応アルファ) とのパリティ検証。
// 期待値は Kotlin と同じ式 newVar=(1-α)(σ²+α·diff²) を手計算したもの

function baseline(sampleCount: number): Baseline {
  return { ...initialBaseline(), sampleCount };
}

describe('updateBaseline', () => {
  it('sampleCount<20 は α=0.2 (境界: 19件目)', () => {
    const updated = updateBaseline(baseline(19), 55, 70, 1000);
    // newMean=45+0.2*10=47, diff=8, var=0.8*(100+0.2*64)=90.24
    expect(updated.meanHrv).toBeCloseTo(47, 10);
    expect(updated.stdHrv).toBeCloseTo(Math.sqrt(90.24), 10);
    expect(updated.meanRestingHr).toBeCloseTo(66, 10);
    expect(updated.sampleCount).toBe(20);
    expect(updated.updatedAt).toBe(1000);
  });

  it('20<=sampleCount<100 は α=0.05 (境界: 20件目)', () => {
    const updated = updateBaseline(baseline(20), 55, 70, 1000);
    // newMean=45.5, diff=9.5, var=0.95*(100+0.05*90.25)=99.286875
    expect(updated.meanHrv).toBeCloseTo(45.5, 10);
    expect(updated.stdHrv).toBeCloseTo(Math.sqrt(99.286875), 10);
    expect(updated.meanRestingHr).toBeCloseTo(65.25, 10);
  });

  it('境界: 99件目も α=0.05', () => {
    const updated = updateBaseline(baseline(99), 55, 70, 1000);
    expect(updated.meanHrv).toBeCloseTo(45.5, 10);
  });

  it('sampleCount>=100 は α=0.02 (境界: 100件目)', () => {
    const updated = updateBaseline(baseline(100), 55, 70, 1000);
    // newMean=45.2, diff=9.8, var=0.98*(100+0.02*96.04)=99.882384
    expect(updated.meanHrv).toBeCloseTo(45.2, 10);
    expect(updated.stdHrv).toBeCloseTo(Math.sqrt(99.882384), 10);
    expect(updated.meanRestingHr).toBeCloseTo(65.1, 10);
  });

  it('標準偏差が0以下になる場合は現在値を維持する（Kotlinのフォールバック）', () => {
    const zeroStd: Baseline = { ...baseline(0), stdHrv: 0 };
    // hrv=meanHrv → diff=0 → var=0 → sqrt=0 → フォールバックで current.stdHrv(=0) を維持
    const updated = updateBaseline(zeroStd, 45, 65, 1000);
    expect(updated.stdHrv).toBe(0);
  });

  it('心拍もEMAで更新される', () => {
    const updated = updateBaseline(baseline(0), 45, 80, 1000);
    // meanRestingHr=65+0.2*15=68
    expect(updated.meanRestingHr).toBeCloseTo(68, 10);
  });
});
