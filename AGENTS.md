# AIによる引き継ぎ

## 2026-11-17の更新を優先

- 現在の作業ブランチは `feature/long-session`、時計ソースはv0.6.0 / code13。
- ユーザーは長時間計測・低電池停止・接続簡略化を依頼。その後「最高値ではなく値を時系列でずっと見たい」「CSVでも記録したい」と明示した。
- `docs/LONG_SESSION.md` と `docs/LONG_SESSION_VALIDATION.json` を現状として読む。下記のv0.5.5の説明は以前の保存時点のもの。
- ユーザーが指定した時計へv0.6.0を上書き更新し、使用者本人が連続計測を開始。個人データは `.stresslog-local/` のみ。
- 既定停止残量20％、10/20/30％選択。自動開始は画面のスイッチで選ぶ。再起動や電池停止後に勝手に復活させない。
- PC受信機は日別JSONLとCSVへ約15秒以上の間隔で数値を記録。モデルと特徴量の計算方式は変更しない。
- 初回設定後の毎日の利用でADBを要求しない。保存済みHTTPS先の再試行とHMAC付きUDP8789探索を使用。信頼は元の証明書へ固定し、有効期限も検査。
- 時計フリーズの根本原因は未確定だが、v0.6.0では以前のライフサイクルロック・off-body停止再開・AlarmManager再起動を削除。長期安定性と電池寿命は未検証と明記する。
- このPCではv0.5.2とv0.6.0のAPK署名が一致することを確認済み。元ソースv0.5.2が回収できたという意味ではない。
- 見かけの復旧のためにデータを捏造・補間しない。欠測やCSV保存エラーを隠さない。

最初に `HANDOFF.md`、`docs/CURRENT_STATUS.md`、`docs/SETUP.md` を読む。
計算を変更する前に `docs/STRESS_ESTIMATION_REPORT.md` と `tools/population/MODEL_CARD.md` を読む。
このリポジトリだけで、Web・PC受信機・モデル・時計の確認済みAPKを取得できる。

## 現在の目的と境界

- 主開発対象は初代Pixel Watch → Wi-Fi → Windows PC → Webアプリ。
- 既定の推定は `wesad-population-rf60-v1`。体感入力・使用者の事前データは使わない。
- 将来は常時装着して強いストレス反応の持続を検知したいが、通知の追加は現在依頼されていない。
- GitHub保存・報告書作成後、時計側UIの改善を依頼された。UI作業は `ui/watch-refresh`。推定方式の変更は保留。
- 旧Androidアプリ・モック画面・個人基準方式を、現在の実測推定と混同しない。

## 時計に関する重要な状態

- 実機確認済みは `releases/watch/stresslog-watch-v0.5.2.apk`（versionCode 9）。
- このUIブランチの `watch-probe/` は **v0.5.5 / code 12**。UIのみ更新し、v0.5.4の未解決の計測サービスは変更していない。v0.5.3/4で発生したフリーズの原因は未確定。
- 同梱v0.5.2 APKを、このv0.5.5ソースから再ビルドできるとは主張しない。v0.5.2のソーススナップショット・元の署名鍵は回収できていない。
- UIプレビューは別ID `com.nishi.stresslog.watchprobe.preview`。センサー・通信等の権限を除き、計測サービスと診断Activityを無効にした別アプリ。通常版を置き換えない。詳細は `docs/WATCH_UI.md`。
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
