# 出典・利用条件と配布範囲

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

`releases/watch/stresslog-watch-v0.5.2.apk` は本プロジェクトの実機確認済みデバッグビルドです。
時計の実行時データ（計測、接続トークン、PC秘密鍵）は同梱していません。
このAPKと現在のv0.5.4ソースは別バージョンであり、ソースからバイナリまでの完全な再現性は未達です。
署名に使った元の秘密鍵は同梱していません。
