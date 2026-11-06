# StressLog 引き継ぎ入口（2026-11-06）

時計UI改善ブランチの追加は `docs/WATCH_UI.md`。UIプレビューを通常の計測アプリと混同しない。

## 新しいAIへ渡す依頼文

> このリポジトリのAGENTS.md、HANDOFF.md、docs/CURRENT_STATUS.md、docs/SETUP.md、docs/STRESS_ESTIMATION_REPORT.mdを読み、Windowsで現在のWebアプリとPC受信機を再現してください。まずscripts/Setup.ps1で環境を整え、テスト・ビルドを確認してください。時計は同梱の確認済みv0.5.2 APKを使い、watch-probe内の開発中の通常版を勝手にインストールしないでください。時計UIプレビューを扱う場合はdocs/WATCH_UI.mdも読んでください。時計との接続が必要なところで、ワイヤレスデバッグの現在のアドレスを私に案内してください。通知機能や新しい推定方式は、この引き継ぎで追加しないでください。

## この保存時点の状態

- Windows PC上のWebアプリと受信機が主対象。初代Pixel WatchからWi-Fiで直接送る。
- 既定モデルは `wesad-population-rf60-v1`。60秒の心拍・体動、使える場合はPRVで0–100を出す。
- 使用者の体感・個人基準は入力にしない。学習済みモデルを同梱し、利用開始時に再学習は不要。
- 7分計測の受信・推定・表示・自動停止は実機確認済み。心理的ストレスの精度は未検証。
- 最新値がない場合、架空の現在値を作らず、保存があれば日時付きの最後の値を表示する。
- 旧ホーム等はモックデータ。実測の入口は `?tab=live`。
- 時計は確認済みv0.5.2を維持。このブランチのv0.5.5はUI更新で、v0.5.4の計測サービスを変更していない。
- 将来の用途は「常時装着し、強いストレス反応の持続を検出」。通知は現時点で追加しない。
- 研究候補は報告書の将来案に記録。今回のGitHub保存でモデルを変更しない。

## 再現の入口

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1 -InstallNode
powershell -ExecutionPolicy Bypass -File .\scripts\Start.ps1
```

時計接続・ファイアウォール・証明書・署名の注意は `docs/SETUP.md`。
Android Studio、Python、WESAD原データは、同梱モデルでのWeb実行には不要。
新PCではADBペアリングとPC専用の新しい証明書・トークンの時計への設定が必要。

## コードの入口

| 目的 | ファイル |
|---|---|
| ライブ表示 | `web/src/ui/analysis/LiveScreen.tsx` / `PopulationStressCard.tsx` |
| 共通特徴量・入力品質 | `web/src/domain/populationFeatures.ts` |
| 0–100の推定 | `web/src/domain/populationStress.ts` |
| 学習済みモデル | `web/src/domain/models/wesad-v1.json` |
| 拍動検出・PRV | `web/src/domain/elgendi.ts` / `prv.ts` |
| PC受信 | `tools/live/bridge.mjs` / `state.mjs` |
| 最新値の保存 | `tools/live/population-store.mjs` |
| 再学習・評価 | `tools/population/prepare_wesad.py` / `extract-features.mjs` / `train.py` |

## GitHubでは再現しないもの

以前の個人の計測データ、ブラウザ内の履歴と設定、時計のADBペアリング、秘密鍵・トークン、
元PCのツールチェーンとキャッシュは含めない。これらをGitHubから復元したと説明しない。
個人履歴も必要になった場合は、別途プライベートな移行方法を用意する。

旧Android版の引き継ぎは `docs/archive/ANDROID_HANDOFF_20260711.md` に保管。
このファイルと `docs/CURRENT_STATUS.md` を現在の状態として優先する。
