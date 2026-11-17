# 出典・利用条件と配布範囲

## Hongn2025由来の身体活動モデル

`web/src/domain/models/physical-context-v1.json` は以下の公開データから本プロジェクトで学習した派生モデルです。

- データ: Hongn, A., Bosch, F., Prado, L., & Bonomini, P. (2025). Wearable Device Dataset from Induced Stress and Structured Exercise Sessions, v1.0.1. PhysioNet. https://doi.org/10.13026/he0v-tf17
- 原著: Hongn, A., Bosch, F., Prado, L. E., Ferrández, J. M., & Bonomini, M. P. (2025). Wearable Physiological Signals under Acute Stress and Exercise Conditions. Scientific Data 12, 520. https://doi.org/10.1038/s41597-025-04845-9
- 提供ページ: https://physionet.org/content/wearable-device-dataset/1.0.1/ 。Open Data Commons Attribution License v1.0: https://opendatacommons.org/licenses/by/1-0/
- 評価のみ: Jarchi, D. & Casson, A. J. (2017). Description of a Database Containing Wrist PPG Signals Recorded during Physical Exercise with Both Accelerometer and Gyroscope Measures of Motion. https://doi.org/10.3390/data2010001 。Wrist PPG During Exercise v1.0.0, https://doi.org/10.13026/C2PQ1X 、https://physionet.org/content/wrist/1.0.0/ 。同ODC-By v1.0。
- PhysioNet標準引用: Pollard et al. (2026). PhysioNet as a global platform for biomedical research. https://doi.org/10.1038/s44360-026-00096-z

派生モデル、評価集計、32件の公開研究由来の数値特徴・出力fixtureを同梱。原波形は再配布していません。公開時は出典とODC-Byの条件を維持してください。WESADモデルの利用条件も引き続き適用されます。独自閾値と回復時間は `docs/ACTIVITY_CONTEXT.md` に明記。

## WESAD由来モデル

`web/src/domain/models/wesad-v1.json` はWESADを用いて本プロジェクトで学習した派生モデルです。
原著者: Philip Schmidt, Attila Reiss, Robert Duerichen, Claus Marberger, Kristof Van Laerhoven。

- 論文: https://doi.org/10.1145/3242969.3242985
- 大学公式配布・利用条件: https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html
- データセットDOI: https://doi.org/10.24432/C57K5T

公式配布ページは科学研究・非商用利用と、成果公開時の権利者明記を条件としています。
本保存は研究開発の再現・引き継ぎを目的とし、商用利用許諾を新たに付与するものではありません。
商用化・再配布範囲の変更は権利者の条件を確認してください。WESAD原データは同梱しません。

WESADに関して同梱するものは派生モデル、評価集計、出力照合用の特徴量fixtureです。
fixtureには学習データから抽出した数値特徴とモデル出力を含み、すべてが人工生成という意味ではありません。
生波形、質問票、使用者の計測履歴は同梱しません。

## 手法・ライブラリ

- 拍動検出: Elgendi et al. (2013), https://doi.org/10.1371/journal.pone.0076585 。独自の追加条件は報告書に明記。
- 学習用ECG処理: NeuroKit2 / Makowski et al. (2021), https://doi.org/10.3758/s13428-020-01516-y 。依存版は `tools/population/requirements-lock.txt`。
- Random Forest: Breiman (2001), https://doi.org/10.1023/A:1010933404324 。scikit-learnで学習し、JSON出力・TypeScript推定へ変換。
- npm依存関係: `web/package-lock.json`。各ライセンスはインストール後のパッケージ内で確認。
- Gradle Wrapper等の既存第三者バイナリは従来の提供条件に従います。

この文書は包括的なオープンソースライセンスではなく、従来コード全体へ新たな許諾を付与しません。

## 同梱時計APK

v0.6.0長時間計測版は `releases/watch/stresslog-watch-v0.6.0.apk` と `long-session.json`。
対応ソースはこのブランチの `watch-probe/`。既存の通常版と同じIDで計測するアプリで、UIプレビューとは異なります。
元PCではv0.5.2とv0.6.0の署名が一致することを確認済みです。署名秘密鍵のリポジトリへの追加は行っていません。
PCに保存される時系列・CSVは個人データであり、Git管理外です。

`releases/watch/stresslog-watch-v0.5.2.apk` は本プロジェクトの実機確認済みデバッグビルドです。
時計の実行時データ（計測、接続トークン、PC秘密鍵）は同梱していません。
このAPKとUIブランチのv0.5.5ソースは別バージョンであり、ソースからバイナリまでの完全な再現性は未達です。
署名に使った元の秘密鍵は同梱していません。

UIプレビューAPKはv0.5.5の `uiPreview` ビルドで再作成可能です。通常の時計計測APKとは別IDです。
