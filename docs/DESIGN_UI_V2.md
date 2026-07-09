# StressLog UI v2 — デザイン刷新設計書

参照: `Desktop\AndroidDev\アプリイメージ.jpg`（3画面のモックアップ）

> **方針**: データ層（Room/Repository/StressCalculator/WorkManager）は v1 のまま変更しない。
> 変更は UI 層（Compose）と、集計用の DAO クエリ追加のみ。
> 実装前に v1 の動作する状態を git commit しておくこと（ロールバック可能にする）。

---

## 0. 全体構成の変更

### ボトムナビ: 3タブ → 5タブ
| タブ | 内容 | v1からの変化 |
|---|---|---|
| ホーム | ゲージ + 今日の記録ドット + アドバイスカード | 再構成 |
| 記録 | 日/週/月タブ + 日付ナビ + タイムライン（スパークライン付き） | 大幅刷新 |
| 分析 | 折れ線 + 時間帯ヒートマップ + 要因ランキング | 新設（v1の「推移」を吸収） |
| アドバイス | 提案履歴 + 傾向アドバイス一覧 | 新設（ContextAnalyzer の出力先） |
| 設定 | v1 のまま | 変更なし |

### 配色システム（3段階レベル）
モックに合わせ、スコアを3レベルに区分して全画面で統一する。

```kotlin
enum class StressLevel(val label: String, val color: Color) {
    LOW("低",  Color(0xFF4CAF50)),   // 緑
    MID("中",  Color(0xFFFFA726)),   // オレンジ
    HIGH("高", Color(0xFFE53935));   // 赤
    companion object {
        fun of(score: Int) = when { score < 40 -> LOW; score < 70 -> MID; else -> HIGH }
    }
}
```
- 赤の濃淡（ヒートマップ用）: `Color.Red.copy(alpha = normalizedScore)` ではなく、
  白→赤の線形補間 `lerp(Color(0xFFFFF5F5), Color(0xFFC62828), t)` を使う（視認性のため）。
- ダークテーマでは補間の起点を surface 色にする。

---

## 1. ホーム画面（モック左）

上から順に:

1. **現在のストレスレベル カード**
   - 見出し「現在のストレスレベル」+ 最終計測日時（`M/d(E) HH:mm`）
   - 円形ゲージ（v1 の `StressGauge` を流用、中央に `42 /100` 表記に変更）
   - 状態文言: 「やや落ち着いています」等（レベル別に3種）
   - サブ文言: 「深呼吸や軽いストレッチがおすすめです」（SuggestionEngine の短縮版）

2. **今日の記録 カード**
   - 見出し + 「3回のストレス反応を検知」（当日 `score>=70` の reading 数 + 手動 Moment 数）
   - **ドットタイムライン**: 横軸 0時〜24時。当日の StressMoment + 高スコア reading を
     時刻位置にレベル色のドットで打つ。Canvas 1本で実装（新規 `DotTimeline.kt`）
   - 軸ラベル: 0時 / 6時 / 12時 / 18時 / 24時

3. **直近のアドバイス カード**
   - ロボットアイコン（Material Icons の `SmartToy`）+ ContextAnalyzer の最新インサイト1件
   - 「すべてのアドバイスを見る >」→ アドバイスタブへ遷移

v1 にあった「今すぐ計測（デバッグ用）」ボタンは設定画面へ移動。
「今ストレスを感じた」ボタンは FAB（画面右下固定）に変更。

## 2. 記録画面（モック中央）

- 上部: 日/週/月 セグメント（v1 流用）+ **日付ナビゲータ** `＜ 2026年7月9日(木) ＞`
  - 状態は ViewModel に `selectedDate` を持ち、前後日へ移動。週/月選択時は週送り/月送り
- 本体: 選択日の **Moment タイムラインリスト**。各カードは:
  - 左: 時刻（`HH:mm`）
  - レベルバッジ: 「高」「中」「低」をレベル色の枠付きチップで
  - 検知理由テキスト（2行）:
    - AUTO: 「心拍変動の上昇を検知」+ 補足（時間帯から推定した一言。例: 会議の開始直後に上昇）
    - MANUAL: ユーザーのメモ・タグ
  - 右: **スパークライン**（その Moment の前後±30分の readings をレベル色で描画、
    新規 `Sparkline.kt`、既存 `getReadingsInRange` を流用）+ `>` シェブロン
  - タップ → 既存の MomentDetailScreen へ
- 記録が無い日は「この日の記録はありません」

## 3. 分析画面（モック右）

- 上部: 日/週/月 セグメント
- **① ストレスレベルの推移 カード**
  - 見出し + 期間表記（`5/14(火) 〜 5/20(月)`）+ 右上に大きく **期間平均 `54 /100`**（レベル色）
  - 折れ線グラフ: 日別平均を線で結び、**各点をそのレベル色のドット**で描画
    （`StressLineChart` を拡張: `pointColorByLevel: Boolean` を追加）
  - 縦軸に「高/中/低」の3目盛りラベル
- **② 時間帯別の傾向 カード（ヒートマップ）**
  - 横軸: 0時〜24時（2時間刻み12列）、縦軸: 高/中/低 の3行
  - セル: その期間・その時間帯で該当レベルだった計測の頻度を、行のベース色の濃淡で表現
  - 新規 `TimeOfDayHeatmap.kt`（Canvas）。データは新規 DAO クエリ（下記）
- **③ よくあるストレス要因（推定） カード**
  - Moment のタグを件数でランキング、上位3件
  - `1位` バッジ（赤）/ `2位`（オレンジ）/ `3位`（黄）+ タグ名 + `(n回)`
  - ContextAnalyzer に `rankFactors(moments): List<FactorRank>` を追加
- **月タブ選択時**: ①の代わりに **カレンダーヒートマップ** を表示
  - 月のカレンダーグリッド（7列×5〜6行）。各日セルを日平均スコアで白→赤の濃淡に塗る
  - セル内に日付数字。データ無しの日は無色
  - 新規 `CalendarHeatmap.kt`。これが「日ごとのストレスを赤の濃さで」の実装
  - セルタップ → 記録タブのその日へ遷移

## 4. アドバイス画面（新設）

- ContextAnalyzer の全インサイト（傾向とアドバイス）をカードリストで
- 過去に通知した提案（Moment.appliedSuggestion）の履歴
- v1 で Moments 画面上部にあった「傾向とアドバイス」はこちらへ移動

## 5. 追加が必要な DAO クエリ

```kotlin
// 時間帯ヒートマップ用: 時間帯(2h) × レベルの件数
@Query("""
  SELECT (timestamp % 86400000) / 7200000 AS hourBucket,
         CASE WHEN stressScore < 40 THEN 0 WHEN stressScore < 70 THEN 1 ELSE 2 END AS level,
         COUNT(*) AS cnt
  FROM stress_readings WHERE timestamp BETWEEN :from AND :to
  GROUP BY hourBucket, level
""")
suspend fun getHourlyLevelCounts(from: Long, to: Long): List<HourlyLevelCount>
// 注意: timestamp はUTC基準なのでローカル時刻補正（+TZオフセット）を Repository 側で行う

// カレンダーヒートマップは既存 getDailyAggregates をそのまま利用
```

## 6. 新規/変更ファイル一覧

```
ui/common/   DotTimeline.kt        [新規] ホームのドットタイムライン
             Sparkline.kt          [新規] 記録リストのミニ波形
             TimeOfDayHeatmap.kt   [新規] 時間帯×レベルのヒートマップ
             CalendarHeatmap.kt    [新規] 月カレンダー濃淡マップ
             StressLevel.kt        [新規] 3段階レベルの enum + 配色
             StressLineChart.kt    [変更] レベル色ドット・軸ラベル対応
ui/home/     HomeScreen.kt         [新規] (dashboard を置き換え)
ui/records/  RecordsScreen.kt      [新規] 日付ナビ + タイムライン
ui/analysis/ AnalysisScreen.kt     [新規] (trend を置き換え)
ui/advice/   AdviceScreen.kt       [新規]
ui/StressLogRoot.kt               [変更] 5タブ化
data/local/StressReadingDao.kt    [変更] ヒートマップ用クエリ追加
domain/ContextAnalyzer.kt         [変更] rankFactors 追加
```

## 7. 実装フェーズ

1. **P1**: StressLevel enum + 5タブ化 + 画面の器（既存内容を移設して常時ビルド可能に）
2. **P2**: ホーム刷新（ゲージ表記、ドットタイムライン、アドバイスカード、FAB）
3. **P3**: 記録画面（日付ナビ、タイムラインカード、スパークライン）
4. **P4**: 分析画面（折れ線強化 → ヒートマップ → 要因ランキング → カレンダーヒートマップ）
5. **P5**: アドバイス画面 + 仕上げ（各フェーズ末にエミュレータでスクリーンショット確認）

## 8. モックとの意図的な差分

- モックの「AIによる分析・アドバイス」の文言 → 実装はルールベース分析なので
  画面上は「分析にもとづくアドバイス」等の表現にする（実態に合わせる）
- 検知理由の文言（「会議の開始直後に上昇」等）は、タグ・時間帯からのテンプレ生成で近似
