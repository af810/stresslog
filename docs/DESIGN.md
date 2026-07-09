# StressLog — 設計書

Apple Watch / ウェアラブルのストレス指標を記録・可視化し、ストレス解消を促す個人用 Android アプリ。

> **前提**: 開発者は Apple Watch 非所持。iOS/HealthKit は使わず **Android + Health Connect** で構築する。
> 当面はウェアラブル実機がないため **シミュレーションデータ源** で開発し、データ源は差し替え可能な設計にする。
> **コーディングは Claude Sonnet が担当。本書はその実装仕様。**

---

## 0. 技術的前提（重要）

### 「ストレス値」は生データとして存在しない
Apple Watch も Garmin も、内部的には **HRV（心拍変動）と心拍数からストレス指標を算出**している。本アプリも同方式を採る。

- **HRV (RMSSD / SDNN)**: 副交感神経活動の指標。ストレスが高いと HRV は低下する。
- **心拍数 / 安静時心拍**: 補助指標。
- **算出の核となる思想**: 「個人ごとのベースラインからの逸脱」を見る。絶対値ではなく、その人の平常時からどれだけ外れているかでストレスを評価する。（＝個人内の状態逸脱の検出。研究テーマと同じ発想）

### Health Connect（Android のヘルスデータ基盤）
- iOS の HealthKit 相当。Wear OS / Fitbit / Samsung Health などのデータを統一 API で読める。
- 読み取る Record: `HeartRateRecord`, `HeartRateVariabilityRmssdRecord`。
- 実機ウェアラブルが手に入ったら、ここを繋ぐだけで実データが流れる。

---

## 1. 技術スタック

| 領域 | 採用技術 | 理由 |
|---|---|---|
| 言語 | Kotlin | Android 標準 |
| UI | Jetpack Compose + Material 3 | 宣言的 UI、標準 |
| アーキテクチャ | MVVM + Repository | 標準的、テスト容易 |
| DB | Room (SQLite) | ローカル記録の永続化 |
| 非同期 | Kotlin Coroutines + Flow | 標準 |
| DI | Hilt | 依存注入、データ源差し替えに有効 |
| バックグラウンド | WorkManager | 定期サンプリング・通知 |
| グラフ | Vico (Compose 対応) | Compose ネイティブ、日/週/月表示に対応 |
| ヘルスデータ | Health Connect Client | 実データ源 |
| 最小 SDK | API 26 (Android 8) / target API 35 | Health Connect は API 28+ 推奨 |

---

## 2. アーキテクチャ全体

```
UI (Compose)
   ├─ DashboardScreen   … 現在のストレス + 直近グラフ
   ├─ TrendScreen       … 日/週/月グラフ切替
   ├─ MomentsScreen     … 強ストレス瞬間の記録一覧
   ├─ MomentDetailScreen… 個別の記録 + 前後の生体データ
   └─ SettingsScreen    … 閾値・データ源・通知設定
        │
   ViewModel (状態保持・UI ロジック)
        │
   Repository (単一の窓口)
        ├─ StressDataSource  ← interface（差し替え可能）
        │     ├─ MockStressDataSource        （開発用・現在これを使う）
        │     └─ HealthConnectStressDataSource（実機導入時に有効化）
        ├─ StressDao (Room)  … 算出済みストレス値の記録
        ├─ MomentDao (Room)  … 強ストレス瞬間の記録
        └─ SuggestionEngine  … ルールベースの解消法提案
        │
   Domain
        ├─ StressCalculator  … HRV+心拍 → ストレス指数
        ├─ BaselineTracker   … 個人ベースラインの更新
        └─ ContextAnalyzer   … 状況分析・回避アドバイス
```

**設計の肝**: `StressDataSource` を interface にし、Hilt で注入する。開発中は `MockStressDataSource`（乱数＋日内リズムでそれらしいストレス波形を生成）、実機導入時に `HealthConnectStressDataSource` に切り替えるだけで全機能が動く。

---

## 3. データモデル（Room）

### StressReading（算出済みストレス値、定期記録）
```kotlin
@Entity(tableName = "stress_readings")
data class StressReading(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,          // epoch millis
    val stressScore: Int,         // 0-100（0=平穏, 100=高ストレス）
    val hrvRmssd: Double?,        // 元データ（ms）
    val heartRate: Int?,          // 元データ（bpm）
    val baselineHrv: Double?,     // その時点の個人ベースライン
    val source: String            // "mock" / "health_connect"
)
```

### StressMoment（強ストレス瞬間の記録）
```kotlin
@Entity(tableName = "stress_moments")
data class StressMoment(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val stressScore: Int,
    val trigger: TriggerType,     // AUTO（閾値超え自動）/ MANUAL（ユーザー手動記録）
    val note: String?,            // ユーザーメモ（何があったか）
    val tags: List<String>,       // "仕事","会議","移動" 等（状況タグ）
    val hrBefore: Int?, val hrAfter: Int?,  // 前後の心拍
    val appliedSuggestion: String? // 提案した解消法
)
```

### 個人ベースライン
```kotlin
@Entity(tableName = "baselines")
data class Baseline(
    @PrimaryKey val id: Int = 0,   // 単一行
    val meanHrv: Double,           // 移動平均
    val stdHrv: Double,            // 標準偏差
    val meanRestingHr: Double,
    val sampleCount: Int,
    val updatedAt: Long
)
```

---

## 4. ストレス指数の算出（StressCalculator）

個人ベースラインからの逸脱を 0-100 に写像する。

```
入力: hrv (RMSSD, ms), hr (bpm), baseline(meanHrv, stdHrv, meanRestingHr)

1. HRV の z スコア:  z_hrv = (baseline.meanHrv - hrv) / baseline.stdHrv
   （HRV が下がる = ストレス高 なので符号を反転して正の値がストレス方向）
2. 心拍の逸脱:       z_hr  = (hr - baseline.meanRestingHr) / 15.0  // 15bpm を目安スケール
3. 合成:            raw   = 0.7 * z_h= 0.7*z_hrv + 0.3 * z_hr
4. 0-100 に写像:    score = clamp(50 + raw * 20, 0, 100)
```

- **ベースライン未確立時**（起動直後）: 収集した生データが少ないうちは「学習中」と表示し、暫定的に固定基準で算出。
- **BaselineTracker**: 就寝中や安静時のデータで meanHrv / stdHrv をオンラインに更新（指数移動平均）。これにより季節・体調変化に追従する。

> **研究との接続点**: この「自己教師ありで個人ベースラインを作り、逸脱の方向・強度で状態を判定する」構造は、修士研究（FPS 操作の個人内ドリフト検出）と同型。将来 SNN / 時系列モデルに置き換える余地を残す。

---

## 5. 機能仕様（要件との対応）

### 要件① ストレス値の読み込みと記録
- `WorkManager` で定期（例: 15分毎）に `StressDataSource` から HRV/心拍を取得 →`StressCalculator` で算出 →`StressReading` として保存。
- MVP では `MockStressDataSource` が日内リズム（朝低・日中変動・夕方上昇など）＋ノイズでリアルな波形を生成。

### 要件② 閾値超えで通知
- サンプリング時に `stressScore >= threshold`（デフォルト 70、設定変更可）を検知したら通知。
- 通知チャネル: `stress_alerts`。通知タップでダッシュボードへ遷移。
- チャタリング防止: 一度通知したら一定時間（例 30分）は再通知しないクールダウン。
- **自動記録**: 閾値超えは `StressMoment(trigger=AUTO)` として自動保存。

### 要件③ 強ストレス瞬間の記録＋グラフ確認
- `MomentsScreen`: 記録の時系列一覧。AUTO / MANUAL をアイコンで区別。
- `MomentDetailScreen`: その瞬間の前後 ±30分の `StressReading` を折れ線グラフ表示。メモ・タグ編集可。
- ダッシュボードに「今ストレスを感じた」ボタン → 手動で `StressMoment(trigger=MANUAL)` を記録。

### 要件④ 日/週/月グラフ
- `TrendScreen` にセグメント切替（日・週・月）。
- 日: 時刻別の折れ線。週/月: 日別の平均＋最大をバー＋線で。
- 集計は Room のクエリで期間集約（AVG, MAX, GROUP BY 日付）。

### 要件⑤ ストレス解消法の提案（SuggestionEngine）
- **ルールベース**（MVP）。入力: 現在の score、時間帯、直近の傾向、タグ。
- 例:
  - 高 score かつ日中 → 「1分の深呼吸」「席を立って歩く」
  - 高 score かつ夜間 → 「画面を閉じる」「ストレッチ」
  - 継続的に高い → 「マインドフルネス呼吸（4-7-8）」を提案
- 提案は通知にも本文として載せる。採用したかを `StressMoment.appliedSuggestion` に記録し、後の分析へ。

### 要件⑥ 状況分析・回避アドバイス（ContextAnalyzer）
- **MVP（統計的分析）**: 蓄積した `StressMoment` のタグ・時間帯・曜日を集計し、「ストレスが高くなりやすいパターン」を提示。
  - 例:「火曜の午前にストレスが高い傾向（過去 5 回中 4 回）。前日に準備しておくと軽減できるかも」
  - 例:「"会議" タグの平均 score が最も高い」
- **発展（将来）**: 生体データ時系列を特徴量化し、状態分類/異常検知モデル（研究の延長）で予兆検知。MVP では未実装、拡張ポイントとして interface を用意。

---

## 6. 画面一覧とナビゲーション

Bottom Navigation（3タブ）＋詳細画面。

1. **Dashboard**: 現在の score（大きな円ゲージ）、状態ラベル（平穏/やや高/高）、直近24hのミニグラフ、「今ストレスを感じた」ボタン、提案カード。
2. **Trend**: 日/週/月グラフ。
3. **Moments**: 強ストレス瞬間の一覧 → タップで Detail。
4. Settings（Dashboard の歯車から）: 閾値、サンプリング間隔、データ源（Mock/Health Connect）、通知 ON/OFF。

---

## 7. 実装フェーズ（Sonnet への指示順序）

**Phase 1 — 土台**
1. プロジェクト雛形（Compose, Hilt, Room, Navigation）
2. データモデル・DAO・Database
3. `StressDataSource` interface + `MockStressDataSource`

**Phase 2 — 中核**
4. `StressCalculator` + `BaselineTracker`
5. Repository
6. WorkManager 定期サンプリング → 保存

**Phase 3 — UI**
7. Dashboard（ゲージ + ミニグラフ + 手動記録ボタン）
8. Trend（日/週/月 Vico グラフ）
9. Moments 一覧 + Detail

**Phase 4 — 通知・提案**
10. 閾値通知 + クールダウン + 自動 Moment 記録
11. `SuggestionEngine`（ルールベース）

**Phase 5 — 分析・実データ**
12. `ContextAnalyzer`（統計集計）
13. `HealthConnectStressDataSource`（実機導入時）

**各フェーズ末でエミュレータ（Pixel_7_API35）で動作確認する。**

---

## 8. 依存ライブラリ（想定 version は実装時に最新を確認）

```kotlin
// build.gradle.kts (app)
implementation("androidx.compose.material3:material3")
implementation("androidx.navigation:navigation-compose")
implementation("androidx.room:room-runtime")
implementation("androidx.room:room-ktx")
ksp("androidx.room:room-compiler")
implementation("com.google.dagger:hilt-android")
ksp("com.google.dagger:hilt-compiler")
implementation("androidx.hilt:hilt-work")
implementation("androidx.work:work-runtime-ktx")
implementation("com.patrykandpatrick.vico:compose-m3")   // グラフ
implementation("androidx.health.connect:connect-client") // 実データ源
```

---

## 9. 割り切り（MVP の非対象）

- クラウド同期・アカウント（ローカル完結）
- iOS 版（Apple Watch 連携は Mac 環境が必要になったら別途）
- ML による予測（ルール/統計で代替、interface だけ用意）
- ウィジェット・Wear OS アプリ本体
