# AIによる引き継ぎ

最初に `HANDOFF.md`、`docs/CURRENT_STATUS.md`、`docs/SETUP.md` を読む。
計算を変更する前に `docs/STRESS_ESTIMATION_REPORT.md` と `tools/population/MODEL_CARD.md` を読む。
このリポジトリだけで、Web・PC受信機・モデル・時計の確認済みAPKを取得できる。

## 現在の目的と境界

- 主開発対象は初代Pixel Watch → Wi-Fi → Windows PC → Webアプリ。
- 既定の推定は `wesad-population-rf60-v1`。体感入力・使用者の事前データは使わない。
- 将来は常時装着して強いストレス反応の持続を検知したいが、通知の追加は現在依頼されていない。
- 直前の依頼はGitHubへの現状保存、他PCでの再現、計算式と引用元の報告書。推定方式の変更は保留。
- 旧Androidアプリ・モック画面・個人基準方式を、現在の実測推定と混同しない。

## 時計に関する重要な状態

- 実機確認済みは `releases/watch/stresslog-watch-v0.5.2.apk`（versionCode 9）。
- `watch-probe/` のソースは **v0.5.4 / code 11の未解決の開発状態**。v0.5.3/4の省電力変更後に時計全体が操作不能になり、原因未確定。再起動しv0.5.2へ戻して正常動作を確認した。
- 同梱v0.5.2 APKを、このv0.5.4ソースから再ビルドできるとは主張しない。v0.5.2のソーススナップショット・元の署名鍵は回収できていない。
- 通常の再現では確認済みAPKを使う。現在の時計ソースを自動的にビルド・インストールしない。
- `Configure-Watch.ps1` は明示的な `-InstallVerifiedApk` があるときだけ同梱APKを入れる。初期化・アンインストールを自動実行しない。

## 再現と検証

Windows PowerShellでリポジトリ直下から:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1 -InstallNode
powershell -ExecutionPolicy Bypass -File .\scripts\Start.ps1
```

既存のNode.js 24.19+ / npmが使える場合は `-InstallNode` を省ける。OpenSSLはGit for Windowsに同梱。
検証は `scripts/Verify.ps1`（Webテスト・ビルド・受信機テスト・APK照合）。
依存関係の変更には `npm ci` とlockfileを使う。学習済みモデルの利用にPythonやWESAD原データは不要。

## 個人情報・説明の扱い

- `.stresslog-local/` は端末固有の秘密情報・計測データ・ログ・ダウンロード専用でGit管理外。
- トークン、秘密鍵、ADB鍵、個人の生波形、ブラウザDBを書き出してコミットしない。
- GitHubから取得しても、以前の個人計測履歴やブラウザDBは復元されない。新PCでは時計のADBペアリングと接続設定が必要。
- 0–100は未校正の分類器出力で、心理的ストレスの絶対量・診断・現実の確率ではない。
- 論文由来の考え方と、このプロジェクト独自の閾値・実装を区別する。新しい研究案を実装済みと書かない。
- モデルの出典とWESADの非商用・科学研究用途の条件を維持する。`NOTICE.md` を参照。
