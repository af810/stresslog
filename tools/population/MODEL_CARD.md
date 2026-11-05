# WESAD汎用ストレス反応モデル v1

保存日: 2026-11-06。モデルID: `wesad-population-rf60-v1`。
数式、引用元、品質条件、評価の解釈は [計算報告書](../../docs/STRESS_ESTIMATION_REPORT.md) にまとめる。

## 用途と意味

利用者の事前データ・体感入力なしで、60秒の心拍・体動と利用可能なPRVから0–100を表示する研究用試作。
WESADを使って本プロジェクトで新しく学習したモデルであり、原著の精度の再現ではない。
値はRandom Forestの正クラス出力×100。心理的ストレスの絶対量、診断、日常の校正済み確率ではない。

## データと利用条件

- Schmidt et al. (2018), *Introducing WESAD, a Multimodal Dataset for Wearable Stress and Affect Detection*.
  [論文DOI](https://doi.org/10.1145/3242969.3242985)、[大学公式配布・利用条件](https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html)。
- 15人、ラベル2を正、1/3を負。他の条件・質問票は使わない。
- 大学配布ZIP: 2,249,444,501 bytes、SHA-1 `bae786bf599ef28e42e1c2e18da9b84d685e84e7`。
- 科学研究・非商用用途と出典表示の条件を維持。原データは同梱しない。詳細は[NOTICE](../../NOTICE.md)。
- 学習の心拍・HRVは胸部ECG（NeuroKit2）、体動は手首ACC。
- 時計ではネイティブ心拍とPPG由来PRVへ置き換わる。機器・計測方式の差は未解決。

## 特徴量と学習

基本: 心拍中央値、log(1+平均ENMO mg)、log(1+平均jerk)。
拡張: 基本にlnRMSSD、lnSDNN、pNN50を追加。
PRVの条件を満たさなければ基本モデルへ戻る。必須入力自体が足りなければ新しい数値は作らない。

100本のRandom Forest、entropy、max_depth=5、min_samples_split=20、min_samples_leaf=5、
max_features=sqrt、random_state=20261106。被験者・クラスの寄与を重み付けで均等化。
個人データによる正規化や評価対象の本人を含む学習は行わない。

LOSO（15回）による本プロジェクトの評価:

| 指標 | 心拍・体動 | 心拍・体動・HRV |
|---|---:|---:|
| 窓数 | 526 | 469 |
| ストレス窓 | 154 | 130 |
| AUC | 0.9045 | 0.8649 |
| Balanced accuracy | 0.8119 | 0.7900 |
| Macro F1 | 0.7779 | 0.7595 |

両モデルの対象窓は異なるため、比較だけでHRV追加の効果を判断しない。
全fold等は`artifacts/evaluation.json`。手首BVPへの転用評価はストレス窓が少なく、汎用精度の証明に使わない。
Pixel Watchの7分動作確認は済んでいるが、心理的ストレスの精度と日常生活の妥当性は未検証。
評価JSONの`pixelWatchValidation`は学習時点の転用精度の未検証状態を表し、機能試験と区別する。

## ファイル

- モデル: `../../web/src/domain/models/wesad-v1.json`
- SHA-256: `cc9b301992234ea37dfc0de5c57781c0bc543f1feb5d1afdb0ff5671922e2899`
- 特徴量: `../../web/src/domain/populationFeatures.ts`
- 推定器: `../../web/src/domain/populationStress.ts`
- 評価・64例の出力照合: `artifacts/`
- `artifacts/source-hashes.json` は元PCで学習した時点のパス・改行形式での記録。
  今回の移行では保存ディレクトリとPythonの描画キャッシュ位置を変更したが、学習済みモデルと特徴量の数式は変更していない。

## 再学習（任意、利用だけなら不要）

リポジトリ直下で実行。Python 3.13を別途導入し、大学公式リンクからWESAD.zipを取得する。
以下は`node`がPATHにある場合。移行用のローカルNodeを使う場合は、ドットソースした
`scripts/Environment.ps1`の`Get-StressLogNode`で得た実行ファイルを使ってもよい。

```powershell
py -3.13 -m venv .stresslog-local/population/.venv
$python = '.\.stresslog-local\population\.venv\Scripts\python.exe'
& $python -m pip install -r .\tools\population\requirements-lock.txt
$env:PYTHONUTF8 = '1'
# 原データは .stresslog-local/population/source/WESAD.zip に保存しておく
& $python .\tools\population\prepare_wesad.py .\.stresslog-local\population\source\WESAD.zip .\.stresslog-local\population\prepared
node .\tools\population\extract-features.mjs .\.stresslog-local\population\prepared\windows.jsonl .\.stresslog-local\population\prepared\features.json
& $python .\tools\population\train.py .\.stresslog-local\population\prepared\features.json .\web\src\domain\models\wesad-v1.json .\tools\population\artifacts
powershell -ExecutionPolicy Bypass -File .\scripts\Verify.ps1
```

前処理はZIPのSHA-1を確認し、numpy配列復元に必要なグローバルだけを許可したUnpicklerを使う。
巨大な原データ、変換した窓、Python環境は`.stresslog-local/`に保持してコミットしない。
モデルを再学習した場合は、出力fixture・評価・報告書・チェックサムを合わせて更新する。
今回の保存作業では再学習していない。
