import { describe, expect, it } from 'vitest';
import { initialBaseline, type Baseline } from '../../data/types';
import { calculateStressScore } from '../stressCalculator';

// Kotlin版 StressCalculator に同じ入力を通した期待値でパリティを検証する

function baseline(overrides: Partial<Baseline> = {}): Baseline {
  return { ...initialBaseline(), ...overrides };
}

describe('calculateStressScore', () => {
  it('ベースラインどおりの入力なら中央値50', () => {
    // zHrv=0, zHr=0 → 50
    expect(calculateStressScore(45, 65, baseline())).toBe(50);
  });

  it('HRV低下+心拍上昇でスコアが上がる', () => {
    // zHrv=(45-25)/10=2, zHr=(95-65)/15=2, raw=0.7*2+0.3*2=2 → 50+40=90
    expect(calculateStressScore(25, 95, baseline())).toBe(90);
  });

  it('HRV上昇+心拍低下は0にクランプされる', () => {
    // zHrv=-3.5, zHr=-1.333…, raw=-2.85 → 50-57=-7 → 0
    expect(calculateStressScore(80, 45, baseline())).toBe(0);
  });

  it('極端なストレス方向は100にクランプされる', () => {
    expect(calculateStressScore(10, 150, baseline())).toBe(100);
  });

  it('stdHrvが小さすぎるときはMIN_STD=3で正規化する', () => {
    // std=1→3に底上げ: zHrv=(45-42)/3=1, zHr=0, raw=0.7 → 50+14=64
    expect(calculateStressScore(42, 65, baseline({ stdHrv: 1 }))).toBe(64);
  });

  it('0.5はKotlin roundToIntと同じく正の無限大方向へ丸める', () => {
    // zHrv=(45-42.5)/10=0.25, raw=0.175 → 50+3.5=53.5 → 54
    expect(calculateStressScore(42.5, 65, baseline())).toBe(54);
  });
});
