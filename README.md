# StressLog

個人用ストレストラッキングアプリ。HRV・心拍から個人ベースラインとの乖離を計算してストレススコアを出し、通知・記録・グラフ表示・軽い対処法の提案を行う。Apple Watch等の実センサーは未接続のため、現状はモックデータ生成（`MockStressDataSource`）で動作を検証している。

このリポジトリには2つの実装がある。

| | 内容 | 動かし方 |
|---|---|---|
| **Android版**（このリポジトリのルート） | Kotlin / Jetpack Compose / Room / Hilt | 下記「Android版のビルド・実行」参照 |
| **[Web版](web/)** | React / TypeScript / Vite / Dexie(IndexedDB) / Web Bluetooth。Android版のドメインロジックをそのまま移植した静的SPA | [`web/README.md`](web/README.md) 参照。ブラウザから実機ESP32圧力センサーに直接BLE接続できる |

Web版は独立リポジトリ（[stresslog-web](https://github.com/af810/stresslog-web)）としても公開している。

## リポジトリ構成

```
app/                    Androidアプリ本体（Kotlin/Compose/Room/Hilt）
web/                    Web版（React/TypeScript、独立リポジトリと同期）
firmware/esp32_pressure/  圧力センサー用ESP32ファームウェア(NimBLE)
tools/ble/              実機なしでBLE検証するためのPython(Bumble)ツール
docs/                   設計ドキュメント・BLE仕様
archive_dev_scripts/    開発中の使い捨てデバッグスクリプト（通常は不要、詳細は同フォルダのREADME参照）
HANDOFF.md              開発環境の再構築手順・既知の落とし穴まとめ
```

## Android版のビルド・実行

必要環境やハマりどころの詳細は [`HANDOFF.md`](HANDOFF.md) を参照。要点のみ:

```powershell
$env:ANDROID_HOME = "<Android SDKパス>"
$env:JAVA_HOME = "<JDK 17パス>"
.\gradlew.bat installDebug
```

- パッケージ名: `com.nishi.stresslog`
- JDK 17 必須（Gradle 8.9 / AGP 8.7.2 の要件）
- `local.properties`（gitignore対象）に `sdk.dir=<SDK>` の設定が必要

## 圧力センサー(BLE)機能

ESP32 + 感圧抵抗(FSR)センサーからBLE経由で圧力値を受信する「センサー」タブがある。GATT仕様は [`docs/BLE_PRESSURE.md`](docs/BLE_PRESSURE.md) が唯一の正。実装の全体像は [`docs/PRESSURE_SENSOR_GUIDE.md`](docs/PRESSURE_SENSOR_GUIDE.md) を参照。

## ドキュメント

- [`docs/DESIGN.md`](docs/DESIGN.md) — v1設計
- [`docs/DESIGN_UI_V2.md`](docs/DESIGN_UI_V2.md) — UI再設計
- [`docs/BLE_PRESSURE.md`](docs/BLE_PRESSURE.md) — BLE GATT仕様
- [`docs/PRESSURE_SENSOR_GUIDE.md`](docs/PRESSURE_SENSOR_GUIDE.md) — 圧力センサー機能の実装ガイド
- [`HANDOFF.md`](HANDOFF.md) — 環境構築・既知の落とし穴
