# StressLog 引き継ぎメモ

別PCのClaude Codeでこのリポジトリを開いたら、まずこのファイルを読んでください。
設計の詳細は `docs/DESIGN.md`（v1設計）と `docs/DESIGN_UI_V2.md`（v2 UI再設計、モックアップ準拠）を参照。

## プロジェクト概要

個人用ストレストラッキングAndroidアプリ「StressLog」。HRV・心拍から個人ベースラインとの乖離でストレススコアを算出し、通知・記録・グラフ表示・軽い対処法提案を行う。Apple Watchは持っていないため、Health Connect経由の実データ取得は将来対応とし、現状は `MockStressDataSource` でモック生成。

## 現在の状態（2026-07-11時点）

- v1実装完了 → v2 UI再設計（モックアップ画像準拠）完了 → 1か月分・10分間隔の合成データ再生成、済み
- 5タブ構成（ホーム/記録/分析/アドバイス/設定）すべて動作確認済み、クラッシュなし
- エミュレータ上のアプリDB自体（シード済みデータ）はgit管理外。同じデータが必要なら下記「合成データの再投入」手順を再実行
- 別PC（Android Studio未導入・クリーン環境）でゼロから再現し、5タブ全描画・FATAL 0件を確認済み
- **圧力センサー(BLE)機能を追加、6番目のタブ「センサー」として実装済み**。詳細は下記「圧力センサー(BLE)機能」参照

## 環境構築（新PCで必要な作業）

Android Studio は必須ではない。GUIウィザードを使わず、cmdline-tools だけで一式構築できる（2026-07-10に実証済み）。

1. **JDK 17** を導入。Gradle 8.9 / AGP 8.7.2 の要件で、Ver.22等では噛み合わない
   ```powershell
   winget install --id Microsoft.OpenJDK.17
   # → C:\Program Files\Microsoft\jdk-17.x.x-hotspot
   ```
   Android Studio を入れる場合は同梱JBR（`C:\Program Files\Android\Android Studio\jbr`）でもよい
2. **cmdline-tools** を取得し `<SDK>\cmdline-tools\latest\` に展開（zip内の `cmdline-tools` を `latest` にリネーム配置する点に注意）
   - https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
3. `ANDROID_HOME` を `<SDK>` に設定。以降 `sdkmanager` でパッケージ導入
   ```powershell
   # ライセンス同意は対話式。yを並べたファイルをstdinに流し込む。
   # PowerShellは < リダイレクトを持たないので cmd /c 経由で呼ぶこと（パイプでは届かない）
   cmd /c "sdkmanager.bat --licenses --sdk_root=<SDK> < yes.txt"
   sdkmanager --sdk_root=<SDK> --install `
     platform-tools "platforms;android-35" "build-tools;35.0.0" `
     emulator "system-images;android-35;google_apis;x86_64"
   ```
4. AVD作成（AVD名: `Pixel_7_API35`）。`emulator -list-avds` で確認可能
   ```powershell
   avdmanager create avd -n Pixel_7_API35 -k "system-images;android-35;google_apis;x86_64" -d pixel_7
   ```
5. `local.properties`（gitignore対象）に `sdk.dir=<SDK>` を書く。無いとGradleがSDKを解決できない

`gradle-wrapper.jar` はリポジトリにコミット済み（43,504 bytes）。手動DLは不要。

## ビルド・実行

```powershell
$env:ANDROID_HOME = "<SDKパス>"
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd Pixel_7_API35
# 起動待ち
& "$env:ANDROID_HOME\platform-tools\adb.exe" wait-for-device
.\gradlew.bat installDebug
```

初回ビルドはGradleディストリビューション取得込みで8分程度かかる。

起動前に通知権限を付与しておく（下記「ハマりどころ」参照）:

```powershell
adb shell pm grant com.nishi.stresslog android.permission.POST_NOTIFICATIONS
adb shell am start -n com.nishi.stresslog/.MainActivity
```

パッケージ名: `com.nishi.stresslog` / DBファイル名: `stresslog.db`

## ハマりどころ（既知の落とし穴）

- **初回起動が権限ダイアログで止まる**: `POST_NOTIFICATIONS` の実行時権限ダイアログ（`GrantPermissionsActivity`）が前面に出てMainActivityが立ち上がらず、`pidof` も空を返すためクラッシュと紛らわしい。`adb shell pm grant com.nishi.stresslog android.permission.POST_NOTIFICATIONS` を先に流せば回避できる
- **`_build/*.ps1` のパスは前PC決め打ち**: `install_run.ps1` などが `C:\Users\akimi\Desktop\AndroidDev\Sdk` やAPKの絶対パスを直書きしている。別PCではそのまま動かないので `adb` / `gradlew` を直接叩くか、パスを書き換える
- **Kotlin 2.0 + Compose**: `org.jetbrains.kotlin.plugin.compose` プラグインが別途必須（Compose CompilerがKotlinコンパイラから分離された）
- **PowerShellスクリプトの日本語文字化け**: `.ps1` に日本語を含めて `powershell -File` で実行するとBOMなしだと文字化け/パースエラーになることがある。`[System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding($true))` でBOM付き保存する
- **PowerShellの負数リテラル引数**: `Foo -4.0 4.0` のように関数に負の数を直接渡すと文字列結合的な誤動作をすることがある。一度変数に入れてから渡す
- **Git BashでのADBパス変換**: `adb push file /data/local/tmp/x` のような絶対パスをGit Bash経由で叩くとWindowsパスに化けて失敗する。`//data/local/tmp/x` のように先頭を `//` にするとMSYSの自動変換を回避できる
- **UIタップ座標**: スクリーンショットのピクセル位置を目視で拡大率換算して当てずっぽうでタップするとレイアウト変更のたびにズレる。`adb shell uiautomator dump` → pull → `bounds="[...]"` を読むほうが確実
- **アプリDBの直接操作**: `adb shell run-as com.nishi.stresslog sh -c 'sqlite3 /data/data/com.nishi.stresslog/databases/stresslog.db "..."'` でroot不要でクエリ可能。書き込み前は `am force-stop com.nishi.stresslog` でロック回避

## 合成データの再投入（1か月・10分間隔）

`_build/seed.sql` はコミット済みなので、**同じデータでよければ `gen_seed.ps1` の再実行は不要**。pushするだけでよい。
なお投入前に一度アプリを起動してDBファイルを生成しておくこと（未起動だと `stresslog.db` が存在しない）。

```bash
powershell -File "_build/gen_seed.ps1"   # 日付を「今」に合わせたい場合のみ。_build/seed.sql を再生成
adb push "_build/seed.sql" //data/local/tmp/seed.sql
adb shell am force-stop com.nishi.stresslog
adb shell "run-as com.nishi.stresslog sh -c 'cat /data/local/tmp/seed.sql | sqlite3 /data/data/com.nishi.stresslog/databases/stresslog.db'"
```

`_build/gen_seed.ps1` は30日分×144サンプル/日（10分間隔）でHRV/心拍/ストレススコアを乱数生成しSQLを出力。`_build/make_excel.py`（要Python + openpyxl）でreadings/momentsをxlsxにエクスポート可能。

コミット済み `seed.sql` の中身: readings 4320件（2026-06-09〜07-09）、moments 157件（AUTO 136 / MANUAL 21）。
**タイムスタンプは生成時点で固定**なので、後日投入すると「今日」のデータが存在しない状態になる。ホームの「今日の記録 0回」や記録タブの初期表示が空になるのはこのためで、バグではない。日付を現在に合わせたい場合のみ `gen_seed.ps1` を再実行する（実行時刻から30日遡って生成される）。

## 圧力センサー(BLE)機能

ESP32-DevKitC V4 + Walfront薄膜感圧抵抗(FSR)センサーから圧力値をBLEで受信し、
6番目のタブ「センサー」にリアルタイム表示する機能。Room・StressCalculator等の
既存ストレススコア機能には一切触れない完全な追加。

- GATT仕様の唯一の正: `docs/BLE_PRESSURE.md`（UUID・6バイトのnotifyフォーマット・配線図・校正手順）
- アプリ側: `data/ble/`（BLEクライアント、UUID定数の集約は`PressureBleSpec.kt`のみ）+ `ui/sensor/`（画面・ViewModel）
- ESP32ファーム: `firmware/esp32_pressure/esp32_pressure.ino`（NimBLE-Arduino）
- PC側の仮想ペリフェラル（Android実機なしで検証するための開発ツール）: `tools/ble/fake_pressure_peripheral.py`

### 実機なしでの検証方法（Google Bumble + netsim）

Androidエミュレータは内蔵の仮想Bluetoothコントローラ**netsim**を持っており、Google製の
Python BluetoothスタックBumbleが`android-netsim` transportでそこに直接ぶら下がれる。
PC上でBumbleを「仮想の圧力センサーBLEペリフェラル」として動かせば、エミュレータ内の
アプリは本物の`BluetoothLeScanner`/`BluetoothGatt` APIで、本物のGATT通信としてそれを
スキャン・接続・購読できる。2026-07-11に実証済み（下記手順で接続・10Hz notify・波形描画まで確認済み）。

```powershell
# 1. Bumbleとその依存(android-netsim transportがgrpcを使う。requirements.txtに含めているので pip install -r で足りる)
py -3.11 -m venv tools/ble/.venv
tools/ble/.venv/Scripts/pip install -r tools/ble/requirements.txt

# 2. エミュレータは netsim 有効化フラグ付きで起動すること(BLE開発時のみ必要)
emulator -avd Pixel_7_API35 -packet-streamer-endpoint default

# 3. 仮想圧力センサーを起動。"StressLog-PS" として advertise が始まる
tools/ble/.venv/Scripts/python tools/ble/fake_pressure_peripheral.py tools/ble/device1.json android-netsim

# 4. アプリ側にBLE権限を付与してから起動
adb shell pm grant com.nishi.stresslog android.permission.BLUETOOTH_SCAN
adb shell pm grant com.nishi.stresslog android.permission.BLUETOOTH_CONNECT
adb shell am start -n com.nishi.stresslog/.MainActivity
```

「センサー」タブ→「デバイスをスキャン」→ 数秒で「接続済み（StressLog-PS）」になり、圧力値と波形が10Hzで動き続ける。

実機ESP32に差し替える際は、このBumbleプロセスを止めてESP32(esp32_pressure.ino書き込み済み)の
電源を入れるだけでよい。アプリ側のコード変更は不要（同じUUID/フォーマットで待ち受けているため）。

### この機能追加でハマった点

- **`android-netsim` transportは`grpc`パッケージに依存するが、`bumble`本体のpipインストールには含まれない**: `ModuleNotFoundError: No module named 'grpc'`になる。`requirements.txt`に`grpcio`/`protobuf`を明記して同梱済み
- **広告データがレガシー広告の31バイト上限を超えると拡張広告にフォールバックし、netsimの仮想コントローラがそれを未サポートで`HCI_Error(INVALID_COMMAND_PARAMETERS_ERROR)`になる**: `CompleteLocalName`(14バイト)+128bit `ServiceUUID`のリスト(18バイト)の合計32バイトが原因だった。ローカル名を`advertising_data`、サービスUUIDを`scan_response_data`に分けて解決（`fake_pressure_peripheral.py`参照）。Androidのアクティブスキャンは両方をマージしてから`ScanFilter`にかけるため、`setServiceUuid`によるフィルタは引き続き機能する
- **スクリーンショットの解像度と表示解像度が異なる**: `adb exec-out screencap`は実機解像度(例: 1080x2400)のPNGを返すが、Claudeに表示される画像は縮小表示（例: 900x2000、倍率1.2）されることがある。目視でタップ座標を決める際は表示上のピクセル位置を「表示倍率」で逆算してから`adb shell input tap`に渡す必要がある。確実なのは従来どおり`uiautomator dump`で`bounds`を読む方法

- Analysis画面の時間帯別ヒートマップ集計: 設計書はSQLでUTCバケット集計する想定だったが、タイムゾーンバグを避けるためKotlin側で `Calendar.HOUR_OF_DAY` を使ったローカルタイム集計に変更
- Records画面: 設計書には日/週/月切替の想定があったが、モックアップ画像に忠実に日送りのみのシンプルな構成にした

## 未着手・今後の選択肢

- Health Connect経由の実データ取得（現在は`di/DataSourceModule.kt`で`MockStressDataSource`をバインド。実装差し替えはこの1箇所）
- ストレス発生時の状況分析→回避アドバイス（design docのstretch goal、未着手）
- UI微調整（色味・余白・文言）は前回「気になる部分あれば」とオープンのまま
