# 実機確認済み時計アプリ

- ファイル: `stresslog-watch-v0.5.2.apk`
- パッケージ: `com.nishi.stresslog.watchprobe`
- versionName: `0.5.2` / versionCode: `9`
- 2,521,568 bytes
- SHA-256: `710e392a7cd2c22ccc1e6b4b3d79026c5dc871b6e8c4dab15ea512cb6ef06f00`

元PCでインストールし、7分計測・通信・自動停止・終了後の時計操作を確認したデバッグAPK。
通常の再現は `scripts/Configure-Watch.ps1 -InstallVerifiedApk` を使う。

UIブランチの`watch-probe/`はv0.5.5（v0.5.4の計測サービスを維持）であり、このAPKの元ソースではない。
v0.5.2の正確なソースと元の署名秘密鍵は未回収。ソースからの完全なビルド再現性は未達。
APKには実行後の時計データ・PC接続用トークンを含めない。新PCごとに接続設定する。

このAPKの署名を維持したままインストールできるが、既存の新しい版からのダウングレードや
別署名アプリへの上書きはAndroidに拒否される場合がある。自動アンインストールはしない。

別IDの `stresslog-watch-ui-preview.apk` はUI確認専用。センサー・通信の権限と計測サービスを無効にしています。
確認済みv0.5.2を置き換えず、別アプリとして入ります。手順は `docs/WATCH_UI.md`。
