# 現行方式と新方式の比較アプリ

2026-11-17追加。ブランチ `feature/stress-comparison`。**現行方式は維持し、新方式を別アプリとして比較する。採用する方式はまだ決めていない。**

ソフトウェアとPC動作の確認記録は [STRESS_COMPARISON_VALIDATION.json](STRESS_COMPARISON_VALIDATION.json)。118件のWebテスト、31件の現行受信機テスト、4件の比較用受信機テストと両ビルドが通過。既に受信中の同じ時計データで両方式の数値、比較CSV、履歴復元を確認した。新たな時計操作は行っておらず、心理的ストレスの精度やブラウザの目視確認を実施したという意味ではない。

## 起動と比較

リポジトリの `Start-Comparison.cmd` を実行する。PC受信機が既に動いていればそのまま使用し、比較用の処理とWebを追加する。

- 現行アプリ: [localhost:5173](http://localhost:5173/?tab=live)
- 比較アプリ: [localhost:5174/compare.html](http://localhost:5174/compare.html)
- 比較アプリの停止: `powershell -ExecutionPolicy Bypass -File scripts/Stop-Comparison.ps1`

時計はこれまでどおりStressLogで計測する。比較のための追加インストール・ADB操作・追加センサー処理は不要。比較アプリはPC受信機の読み取りAPIを参照し、時計から別に送信させない。開始操作をPCから代行しない。

比較画面にA（現行）、B（新方式の試作）、同じ時刻軸のグラフ、直近の比較表を表示する。現行60秒と新方式120秒で観測窓は異なる。両方の測定時刻を保持する。値が同じ尺度に校正されているわけではなく、大小だけで採否を決めない。

新方式は約2分の連続データから始まり、おおむね30–40秒ごとに更新。過去6分の活動履歴も取得できた範囲で参照する。品質不足、通信断、再装着では新しい値を出せない場合がある。過去の履歴だけから新方式の記録を捏造・再生成しない。

グラフの橙の破線は現行の身体反応参考値で、運動時にも上がる。青は現行のストレス推定、緑は新方式。新方式の「時間統合前」も表示でき、平滑化の効果と分類の変化を区別できる。

## 保存・CSV

比較用のJSONLとCSVは `.stresslog-local/comparison/YYYY-MM-DD.{jsonl,csv}` へ保存する。現行の `daily-context-v2`、`daily`、最新値キャッシュは変更しない。比較アプリが動いている間はブラウザを閉じても保存を続ける。比較アプリ停止中の記録は作れない。

CSVには次の項目を含む。

```text
time_jst,current_at_jst,current_stress,current_body,current_state,
candidate_raw,candidate_smoothed,candidate_state,
heart_bpm,predicted_heart_bpm,heart_residual_bpm,prv_lnrmssd,prv_used,
log_enmo,log_jerk,lag_log_enmo,history_coverage,quality_weight
```

計算不能・保留は空欄で、0に変えない。新方式の状態はordinary / candidate / sustained。状態名は試作の計算上の区別で、心理状態の確定ではない。JSONLには両方式の特徴量も記録する。これらは個人の計測データで、GitHubへ含めない。

比較用APIは127.0.0.1:8786へ限定し、Webはlocalhost:5174。HostとOriginを検査し、GETのみ受け付ける。新しいLAN受信ポート・秘密情報・時計への接続設定は追加していない。

## 新方式の実装

[設計案](ACTIVITY_AWARE_STRESS_PROPOSAL.md)を基に、まず比較可能な範囲へ絞った研究用試作。原著と同じモデルの移植ではない。

1. 過去120秒を前後60秒へ分け、現行と同じ `populationFeatures` で心拍、体動、PRV品質を処理する。心拍は両半分の中央値の平均。体動はENMOとjerkの両半分の平均からlog変換。PRVは両半分が品質条件を満たした場合のlnRMSSDの平均であり、120秒の全拍動から計算したRMSSDと同一ではない。
2. 過去120–360秒の4つの60秒区間からlogENMOを取得。取得できない区間を補間せず、利用できた履歴の平均と被覆率を使う。全て欠ける場合は現在のlogENMOを代替入力とし、履歴被覆率0を明示する。この代替は学習時も同じ。
3. 安静・運動／回復区間の公開データで、活動量と履歴から心拍、品質が足りる場合のlnRMSSDを予測する母集団Random Forest回帰を学習。実測心拍−予測心拍、予測lnRMSSD−実測lnRMSSDを計算する。個人の事前基準は使わない。
4. これらの差、心拍の前後半差、PRV使用マスク、活動と履歴から、安静／ストレス課題／運動・回復の3クラスRandom Forestを学習。ストレス課題クラスの平均出力×100が時間統合前の値。心理的ストレスの強さや実生活での発生確率ではない。
5. PRVを使えない場合も学習内に含める。学習参加者のPRV特徴を欠測マスクへ変えた補助行を作り、元行と重みを半分ずつ分ける。架空のPRVは入力しない。
6. 時定数90秒の指数平滑化。PRVありは重み1、なしは0.65。これは信頼度の推定確率ではなく、試作の時間統合用の設計重み。
7. 平滑化後の値65以上が90秒続くとsustained、45未満が60秒続くと解除。重複窓の件数でなく、新しく経過した観測時間を加算。同じセンサー時刻の再取得では加算しない。45秒を超える観測間隔、新セッション、通信断、品質不足は時間状態を初期化する。

回帰は心拍32本（深さ4、leaf最小10）、PRV24本（深さ3、leaf最小5）。分類80本（entropy、深さ5、leaf最小5、split最小20、sqrt特徴選択）。乱数20261117。分類器の学習に使う活動補正の差は、学習参加者をさらに3組に分け、本人を含まない回帰から作る。外側の1人除外評価でもこの処理を繰り返す。

時計の心拍は約1.276秒間隔で届いたため、毎秒の値は要求しない。空の秒をNaNとして除外し、前後半それぞれ有効な30秒ビン以上、端からの間隔15秒以内、連続した心拍の欠落15秒以内、観測HRの80%以上の品質条件を確認する。空の秒のBPMを補間して増やさない。これらも本実装の工学的条件で、論文由来のカットオフではない。

予測分布の不確かさの学習、全身の姿勢推定、日常行動の正確な分類、出力の確率校正はまだ実装していない。活動量と予想値の差だけでストレスが特定できるとは仮定しない。PRVなしで運用する時間も多いため、表示を常にHRV由来の推定とは説明しない。

## 学習元・評価

Hongn et al.の [公開データv1.0.1](https://physionet.org/content/wearable-device-dataset/1.0.1/)、DOI `10.13026/he0v-tf17`、ODC-By 1.0を使用。原著は [Hongn et al. (2025), Scientific Data](https://doi.org/10.1038/s41597-025-04845-9)。本試作の学習はWESADのECGから作ったHRVではなく、手首BVP・HR・ACCを使用した。BVP 64Hzから100Hzへの補間で新しい測定情報が増えるわけではない。

原データと使用ファイルのSHA256を照合。問題が公表された重複・分割・タグ等の除外は `tools/population/comparison-artifacts/source-manifest.json`。原データZIPのSHA256は `afbff3e8e7230bdc765d0ccfc5c3460964021cdfefa8e351f8ad8f78a1b27c48`。

採用した35人、1,371窓（安静234、ストレス課題69、運動・回復1,068）。120秒窓・60秒刻み。PRV使用142窓。同一人の全プロトコルをまとめ、外側で1人ずつ除外。被験者が学習・評価の両方に入るランダムな窓分割は行わない。設定は今回の使用者の記録に合わせていない。

| 原著プロトコル区間 | 時間統合前50以上 | 時間統合前65以上 |
|---|---:|---:|
| 安静 | 9.4% | 0.4% |
| ストレス課題 | 30.4% | 17.4% |
| 運動・回復 | 0.0% | 0.0% |

この評価では運動に対する高値は少ないが、**ストレス課題の見逃しも多い**。0.0%は対象窓の結果で、運動による誤検出が起こらない保証ではない。AUC 0.893、3クラスbalanced accuracy 0.736も、実生活やPixel Watchでの精度を示すものではない。自転車運動中心で、運動と心理的ストレスが同時に生じる条件は含まない。

同じ終点で現行WESADの身体反応出力（後半60秒）と比較した集計も `comparison-artifacts/comparison.json` に記録。ただし、現行の保留判定はこのHongnデータで学習した配布モデルのため、そのまま適用すると評価に漏れが生じる。ここでは現行の運動・回復保留と新方式の時間統合を含めず、身体反応の出力対新方式の生出力の参考比較に限定した。現在の表示方式全体の優劣を示す表ではない。

時間統合後のイベント検出性能は、30秒刻みのラベル付き連続データで未評価。65・45・90秒等の設定は医学的な閾値ではない。滑らかにすることで、短い本当の反応も見逃す可能性がある。先行研究の本人別補正を母集団モデルへ変更しており、研究結果の精度を引き継いだものではない。

活動補正・持続確認の考え方は [van de Ven et al.](https://doi.org/10.1111/psyp.14721)、[Verkuil et al.](https://doi.org/10.1007/s12160-016-9795-7)、[Gjoreski et al.](https://doi.org/10.1016/j.jbi.2017.08.006) を参照。制約は設計案にも記載。

## 再現

通常の実行は同梱JSONを使いPython不要。Webの依存関係は現行と共有するが、別エントリ・別プロセスで起動する。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/Setup.ps1 -InstallNode
powershell -ExecutionPolicy Bypass -File scripts/Start-Comparison.ps1
powershell -ExecutionPolicy Bypass -File scripts/Verify-Comparison.ps1
```

任意の再学習は `tools/population/requirements-lock.txt` のPython環境と、利用条件に従って取得したZIPを使う。

```powershell
python tools/population/prepare_comparison.py <Hongn-v1.0.1.zip> .stresslog-local/comparison-research/windows.jsonl
node tools/population/extract-comparison.mjs .stresslog-local/comparison-research/windows.jsonl .stresslog-local/comparison-research/features.json
python tools/population/train_comparison.py .stresslog-local/comparison-research/features.json .stresslog-local/comparison-research/candidate
node tools/population/evaluate-comparison.mjs .stresslog-local/comparison-research/candidate/held-out.json tools/population/comparison-artifacts/comparison.json
```

`candidate/model.json` が `web/src/experimental/residual-model-v1.json`、ID `hongn-residual-wrist120-v1`。SHA256 `65cd8adc88745217598ab502221598fccfb647cc9971dab8661d3bbb5df72730`。学習・評価の集計と32件の公開データ由来の特徴量fixtureを同梱し、個人の計測記録と生波形は同梱しない。
