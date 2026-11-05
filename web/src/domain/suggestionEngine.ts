// domain/SuggestionEngine.kt の移植

/**
 * 現在のストレス状況に応じて、軽いストレス解消法をルールベースで提案する。
 * MVPでは統計/MLは使わず、スコア帯・時間帯・直近傾向で分岐する。
 */
export function suggest(
  score: number,
  timestamp: number = Date.now(),
  recentTrendRising: boolean = false,
): string {
  const hour = new Date(timestamp).getHours();
  const isNight = hour < 6 || hour >= 21;
  const isDaytime = hour >= 6 && hour <= 17;

  if (score >= 85) {
    return 'かなり高いストレス反応が出ています。4-7-8呼吸法（4秒吸う→7秒止める→8秒吐くを3セット）を試してみましょう。';
  }
  if (recentTrendRising && score >= 60) {
    return 'ここ最近、ストレスが高い状態が続いています。一度作業の手を止めて、5分だけ休憩を取りましょう。';
  }
  if (score >= 70 && isDaytime) {
    return '1分だけ席を立って歩いてみましょう。軽い運動が交感神経の高ぶりを鎮めます。';
  }
  if (score >= 70 && isNight) {
    return '画面から少し離れて深呼吸を。夜のブルーライトは交感神経をさらに刺激することがあります。';
  }
  if (score >= 70) {
    return '肩を上げ下げして力を抜き、ゆっくり深呼吸を3回してみましょう。';
  }
  if (score >= 55) {
    return '軽くストレッチをして、意識的に肩の力を抜いてみましょう。';
  }
  return '落ち着いた状態です。この調子を保ちましょう。';
}
