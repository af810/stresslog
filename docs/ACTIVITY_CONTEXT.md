# 運動・体動とストレス推定の扱い（2026-11-17追加）

この変更は、歩行や腕の動きで上がった値を、そのまま心理的ストレスと表示する問題を軽減するためのものです。運動と心理的ストレスを完全に判別する仕組みではありません。使用者の体感や個人の事前データは使いません。通知機能は追加しません。

ソフトウェアとPC反映の確認記録は [ACTIVITY_CONTEXT_VALIDATION.json](ACTIVITY_CONTEXT_VALIDATION.json)。Web 112件・受信機31件のテスト、ビルド、運動判定の送信から保存までの確認が通過しています。計測停止中にPC受信機を更新し、旧ファイルのチェックサムが変わっていないことを確認しました。追加の実機計測とブラウザの目視確認は未実施です。

## 採用した計算

従来のWESADモデル `wesad-population-rf60-v1` と60秒の特徴量計算は維持します。従来の0–100の出力を「身体反応の参考値」として残し、別の身体活動モデルが表示の可否を判定します。

1. 直近60秒の心拍中央値、`ln(1+ENMO[mg])`、`ln(1+jerk[m/s³])` を入力。
2. Hongnらの公開データで学習した3クラスRandom Forest（安静、ストレス課題、運動・回復）を計算。運動クラスの出力が0.70以上なら保留。
3. 大きな体動も保留。logENMO > 4.01201592991、またはlogJerk > 3.5491151206320932が条件。安静・課題区間とWESADの99百分位から作った設計上の条件で、論文に記載された歩行判定閾値ではありません。
4. 最後の保留条件から120秒未満は回復区間として保留。この時間も設計上の目安で、医学的な回復時間ではありません。60秒窓なので動作から表示変化まで遅れます。
5. 保留中はストレス値を `null` にし、身体反応の参考値と状態を保存。0に置き換えたり、古い値を現在値として表示したりしません。条件から外れた区間のみ、従来モデルの値をストレス推定として表示します。

モデルIDは `hongn-physical-context-rf60-v1`、処理IDは `activity-context-rf60-recovery120-v1`。100本、entropy、深さ5、split最小20、leaf最小5、sqrt特徴選択、乱数20261117。参加者内の各クラスと各参加者の重みを調整しています。モデル出力は実生活の運動確率へ校正していません。

## 学習データと出典

- Hongn, A., Bosch, F., Prado, L. E., Ferrández, J. M., & Bonomini, M. P. (2025). *Wearable Physiological Signals under Acute Stress and Exercise Conditions*. Scientific Data 12, 520. [論文](https://doi.org/10.1038/s41597-025-04845-9)。
- Hongn, A., Bosch, F., Prado, L., & Bonomini, P. (2025). *Wearable Device Dataset from Induced Stress and Structured Exercise Sessions*, v1.0.1. [PhysioNet](https://physionet.org/content/wearable-device-dataset/1.0.1/)、[DOI](https://doi.org/10.13026/he0v-tf17)。Open Data Commons Attribution v1.0。
- PhysioNetの標準引用: Pollard et al. (2026), [PhysioNet as a global platform for biomedical research](https://doi.org/10.1038/s44360-026-00096-z)。

原データは18–30歳の健常者のEmpatica E4で、ストレス36人、自転車の有酸素運動30人、無酸素運動31人。今回はHR 1 HzとACC 32 Hzだけを利用し、ACCを25 Hzに補間。EDA・温度・質問票は入力しません。運動ラベルは自転車運動セッションの回復も含み、歩行ラベルではありません。

公式ノートブックのイベント境界に従い、60秒の重複なし窓を作成。ストレス課題、初期安静、十分な長さの課題間休息の後半を利用し、境界2秒を除外。公表された重複・分割・PPG被覆の問題がある一部セッションと不正なタグを除外しました。S02の重複ストレス、f07、f14のストレス、分割ファイル等の詳細は `tools/population/activity-artifacts/evaluation.json` の `dataPreparation.skipped` を参照。

採用データは35人、1,579窓（安静333、ストレス課題120、運動・回復1,126）。同一人の全プロトコルを同じグループとして、1人ずつ学習から外して評価しました。原データZIPのSHA256は `afbff3e8e7230bdc765d0ccfc5c3460964021cdfefa8e351f8ad8f78a1b27c48`。使用ファイルは公式SHA256SUMSと照合しています。

## 公開データでの確認結果

以下の「高値」は比較用に従来モデルの出力50以上としたもので、臨床的な高ストレスの基準ではありません。ストレス推定は既存の心拍・体動モデルのみで比較し、PRVモデルの運動時性能はこの表では検証していません。

| 区間 | 窓数 | 従来の高値率 | 判定追加後、全窓のうち高値を表示する率 | 保留率 |
|---|---:|---:|---:|---:|
| 安静 | 333 | 16.5% | 15.6% | 2.1% |
| ストレス課題 | 120 | 35.8% | 31.7% | 4.2% |
| 運動・回復 | 1,126 | 91.8% | 5.7% | 91.7% |

**高値表示の減少は主に保留の効果です。正しく「ストレスなし」と診断した割合ではありません。** 運動・回復区間でも保留されずに残った窓の68.1%は依然50以上でした。課題区間の高値表示も減っており、感度との交換条件があります。単純な3クラス判定のbalanced accuracyは0.740ですが、表示判定の精度と同一ではありません。

独立した [Wrist PPG During Exercise](https://physionet.org/content/wrist/1.0.0/)（Jarchi & Casson 2017、[論文](https://doi.org/10.3390/data2010001)、[データDOI](https://doi.org/10.13026/C2PQ1X)、同ODC-By）でも確認しました。8人19記録、歩行・走行・自転車の100窓はすべて保留になりました。従来は99窓が高値でしたが、安静対照がないため「100%の精度」とは言えません。心拍はECGの参照拍動から算出しており、時計の心拍センサーとの一致も未確認です。別時計系統の時刻を使用するため拍動時刻精度の検証でもありません。ACC欠測の1窓を除外。使用した各ファイルの公式チェックサムを照合します。

比較中に心拍のみの新モデルも試しましたが、安静区間の高値率が16.5%から38.1%へ悪化したため採用しません。`evaluation.json` の `cardiac` と `comparison.json` の `cardiacOnly...` / `newPositive...` はこの不採用候補です。**実装で使う結果は `oldModelWithContext...`**。同じ開発データで方式を選んでいるため、最終方式を未知データで評価し直した独立検証とは区別してください。

2分の回復待ちを含む連続時系列の表示率は上表で評価していません。実機、日常の手作業、運動と心理的ストレスの同時発生、年齢差・服薬・疾患・カフェインなどへの一般化は未検証です。運動中でもストレスが存在する可能性はあります。今夜の使用者の計測は終了しており、追加測定は行いませんでした。

## 表示・保存の互換性

- 主表示：判定を通過したストレス推定値。運動・回復中は保留理由を表示し、身体反応の参考値を併記。
- グラフ：緑は通過区間のみ。保留区間を線でつながない。チェックを入れると橙の身体反応参考値を全区間で表示。
- 新記録は `.stresslog-local/live/population/daily-context-v2/`。従来の `daily/` と `last-observation-v1.json` は書き換えません。新しい最後の値は `last-observation-context-v2.json`。
- 過去の記録は画面の「以前の記録（運動判定なし）」で参照。過去値を新方式の心理的ストレスへ読み替えません。
- CSV列は `time_jst,stress_score,body_response_score,activity_state,exercise_model_output,prv_used,outside_training_range`。保留時のstress_scoreは空欄。状態はeligible / movement / recovery、旧記録はlegacy_unfiltered。exercise_model_outputは0–1の未校正モデル出力です。
- API `/population-history` はschemaVersion 2。`?series=legacy` で以前の記録を読み取り専用で返します。`value` は互換性のため身体反応値を保持し、ストレス値は `stressValue` を使用します。
- 回復状態を受信機再起動後も復元。ただしライブ計測を勝手に開始しません。既存TLS・認証・自動探索・時計の低電池停止は変更しません。

## 再学習・評価の再現

通常利用では同梱JSONで動き、Pythonや研究原データは不要です。研究作業は `tools/population/requirements-lock.txt` の環境を使用します。原データは各提供元から利用条件に従って取得し、Git管理外へ置きます。WESADの特徴量は従来の `tools/population/MODEL_CARD.md` に従って準備してください。

```powershell
python tools/population/prepare_activity.py <Hongn-v1.0.1のZIP> <activity-features.json>
python tools/population/train_activity.py <WESAD-features.json> <activity-features.json> <候補出力フォルダ>
python tools/population/evaluate_activity.py <activity-features.json> <WESAD-features.json> web/src/domain/models/wesad-v1.json <候補出力フォルダ> <Wrist-v1.0.0展開フォルダ>
```

`physical-context.json` を `web/src/domain/models/physical-context-v1.json` として採用。SHA256 `9a1d0a6d0438e31d8ea37e56397a26ac82fedf9b0b48d1b60c9deacab0d93d48`。不採用の `cardiac-model.json` は利用しません。32件の数値fixtureとPython出力の一致をWebテストで確認します。生波形と使用者のデータはリポジトリへ含めません。
