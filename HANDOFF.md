# StressLog 引き継ぎメモ

別PCのClaude Codeでこのリポジトリを開いたら、まずこのファイルを読んでください。
設計の詳細は `docs/DESIGN.md`（v1設計）と `docs/DESIGN_UI_V2.md`（v2 UI再設計、モックアップ準拠）を参照。

## プロジェクト概要

個人用ストレストラッキングAndroidアプリ「StressLog」。HRV・心拍から個人ベースラインとの乖離でストレススコアを算出し、通知・記録・グラフ表示・軽い対処法提案を行う。Apple Watchは持っていないため、Health Connect経由の実データ取得は将来対応とし、現状は `MockStressDataSource` でモック生成。

## 現在の状態（2026-07-10時点）

- v1実装完了 → v2 UI再設計（モックアップ画像準拠）完了 → 1か月分・10分間隔の合成データ再生成、済み
- 直近コミット: `regen seed data: 1 month at 10-min intervals, add Excel export tooling`
- 5タブ構成（ホーム/記録/分析/アドバイス/設定）すべて動作確認済み、クラッシュなし
- エミュレータ上のアプリDB自体（シード済みデータ）はgit管理外。同じデータが必要なら下記「合成データの再投入」手順を再実行

## 環境構築（新PCで必要な作業）

1. **Android Studio**をインストール（SDK込み一式）
2. SDKのインストール先を `任意のフォルダ\AndroidDev\Sdk` のように独立させる場合は `ANDROID_HOME` をそこに向ける
3. AVD名: `Pixel_7_API35`（Pixel 7 / API 35）。`emulator -list-avds` で確認可能
4. **JAVA_HOME**: システムのデフォルトJavaがVer.22等でGradleと噛み合わない場合、Android Studio同梱のJBRを使う
   ```
   C:\Program Files\Android\Android Studio\jbr
   ```
5. Gradle wrapperの `gradle-wrapper.jar` が欠けている場合は手動DLが必要な場合あり（Android Studioが自動生成しないケースがあった）

## ビルド・実行

```powershell
$env:ANDROID_HOME = "<SDKパス>"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd Pixel_7_API35
# 起動待ち
& "$env:ANDROID_HOME\platform-tools\adb.exe" wait-for-device
.\gradlew.bat installDebug
```

パッケージ名: `com.nishi.stresslog` / DBファイル名: `stresslog.db`

## ハマりどころ（既知の落とし穴）

- **Kotlin 2.0 + Compose**: `org.jetbrains.kotlin.plugin.compose` プラグインが別途必須（Compose CompilerがKotlinコンパイラから分離された）
- **PowerShellスクリプトの日本語文字化け**: `.ps1` に日本語を含めて `powershell -File` で実行するとBOMなしだと文字化け/パースエラーになることがある。`[System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding($true))` でBOM付き保存する
- **PowerShellの負数リテラル引数**: `Foo -4.0 4.0` のように関数に負の数を直接渡すと文字列結合的な誤動作をすることがある。一度変数に入れてから渡す
- **Git BashでのADBパス変換**: `adb push file /data/local/tmp/x` のような絶対パスをGit Bash経由で叩くとWindowsパスに化けて失敗する。`//data/local/tmp/x` のように先頭を `//` にするとMSYSの自動変換を回避できる
- **UIタップ座標**: スクリーンショットのピクセル位置を目視で拡大率換算して当てずっぽうでタップするとレイアウト変更のたびにズレる。`adb shell uiautomator dump` → pull → `bounds="[...]"` を読むほうが確実
- **アプリDBの直接操作**: `adb shell run-as com.nishi.stresslog sh -c 'sqlite3 /data/data/com.nishi.stresslog/databases/stresslog.db "..."'` でroot不要でクエリ可能。書き込み前は `am force-stop com.nishi.stresslog` でロック回避

## 合成データの再投入（1か月・10分間隔）

```bash
powershell -File "_build/gen_seed.ps1"   # _build/seed.sql を生成
adb push "_build/seed.sql" //data/local/tmp/seed.sql
adb shell am force-stop com.nishi.stresslog
adb shell "run-as com.nishi.stresslog sh -c 'cat /data/local/tmp/seed.sql | sqlite3 /data/data/com.nishi.stresslog/databases/stresslog.db'"
```

`_build/gen_seed.ps1` は30日分×144サンプル/日（10分間隔）でHRV/心拍/ストレススコアを乱数生成しSQLを出力。`_build/make_excel.py`（要Python + openpyxl）でreadings/momentsをxlsxにエクスポート可能。

## 設計上の意図的な既存設計書からの逸脱（v2実装時）

- Analysis画面の時間帯別ヒートマップ集計: 設計書はSQLでUTCバケット集計する想定だったが、タイムゾーンバグを避けるためKotlin側で `Calendar.HOUR_OF_DAY` を使ったローカルタイム集計に変更
- Records画面: 設計書には日/週/月切替の想定があったが、モックアップ画像に忠実に日送りのみのシンプルな構成にした

## 未着手・今後の選択肢

- Health Connect経由の実データ取得（現在は`di/DataSourceModule.kt`で`MockStressDataSource`をバインド。実装差し替えはこの1箇所）
- ストレス発生時の状況分析→回避アドバイス（design docのstretch goal、未着手）
- UI微調整（色味・余白・文言）は前回「気になる部分あれば」とオープンのまま
