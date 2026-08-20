# 圧力センサー(BLE)機能 実装ガイド

2026-07-11のセッションで追加した「ESP32 + 圧力センサー」機能について、
何をやったか・どのコードが何を担当しているかをまとめたもの。
GATTの仕様（UUID・バイトフォーマット）そのものは `BLE_PRESSURE.md` を正とし、
このファイルは「全体像を読んで理解するための地図」として使う。

## 今回やったこと（時系列サマリ）

1. **Android実機がない状態から、BLE開発を進める方法を検討**
   Androidエミュレータは内蔵の仮想Bluetoothコントローラ「netsim」を持っており、
   Google製のPython BluetoothスタックBumbleがそこに直接ぶら下がれることを確認。
   実機なしでもBLEスキャン・接続・notify受信までエミュレータ内で検証できる方針にした。

2. **GATT仕様を決めてから3つの実装を作った**（設計→実装の順）
   仕様書(`BLE_PRESSURE.md`)を先に固定し、Android側・Bumble側・ESP32ファームの
   3つがそれを共通の正として実装する形にした。

3. **PC上でBumble仮想ペリフェラルを動かし、エミュレータのアプリと接続・10Hz notify・
   波形描画までEnd-to-Endで動作確認**（実機なしで到達できるところまでは確認済み）。

4. **実機ESP32-DevKitC V4を接続し、ファームウェアを書き込み**
   - USBシリアルドライバ(CP2102N)が未導入で認識されず → Silicon Labs公式ドライバを導入
   - Arduino IDE 2付属の`arduino-cli`でESP32ボードコア・NimBLE-Arduinoを導入してコンパイル・書き込み
   - 書き込み直後、`assert failed: npl_freertos_mutex_pend`でクラッシュ・再起動ループに遭遇
     → 原因はESP32 Arduinoコア3.3.7以降の既知の回帰バグ。コアを**3.3.6にダウングレード**して解決
   - 書き込み後、クラッシュなく起動し「Advertising as StressLog-PS」を確認
   - PC実機のBluetoothでも実際にスキャンし、`StressLog-PS`(`88:F1:55:11:CD:5A`)を検出。
     マイコン単体でのBLE動作は実証済み

5. **圧力センサー(FSR)を配線して実測テスト → 現在ここで止まっている**
   デバッグ用に`rawAdc`をSerialへ常時出力するようファームを修正して書き込み直したが、
   押しても押さなくても`rawAdc=0`のまま変化しない。**配線側の問題を調査中、未解決**。

## ファイル一覧（どのコードが何をしているか）

### 仕様書
| ファイル | 役割 |
|---|---|
| `docs/BLE_PRESSURE.md` | GATTの唯一の正。サービス/キャラクタリスティックUUID、6バイトのnotifyフォーマット(`rawAdc`+`forceKg`)、ESP32の配線図、校正手順を定義。**下記すべての実装はこれに従う** |

### Androidアプリ側（`app/src/main/java/com/nishi/stresslog/`）
| ファイル | 役割 |
|---|---|
| `data/ble/PressureBleSpec.kt` | UUID定数とバイト列パース処理。**仕様が変わったら触るのはここだけ** |
| `data/ble/PressureSample.kt` | 受信データを表す`PressureSample`、接続状態を表す`PressureConnectionState`(Idle/Scanning/Connecting/Connected/Disconnected/Error) |
| `data/ble/PressureBleClient.kt` | 実際のBLEスキャン・接続・notify購読処理。`BluetoothLeScanner`/`BluetoothGatt`を直接叩き、`StateFlow`/`SharedFlow`として公開 |
| `di/BleModule.kt` | `BluetoothAdapter`をHiltでDI提供する（既存の`DatabaseModule.kt`と同じパターン） |
| `ui/sensor/SensorViewModel.kt` | `PressureBleClient`を購読し、直近100サンプルのリングバッファと接続状態をUI用にまとめる |
| `ui/sensor/SensorScreen.kt` | 「センサー」タブの画面。BLE権限の実行時リクエスト、接続状態表示、圧力値、スキャン/切断ボタン |
| `ui/sensor/PressureWaveform.kt` | `rawAdc`の推移を折れ線描画する専用Canvasコンポーネント（既存`Sparkline.kt`とは値域が違うため新規作成） |
| `ui/StressLogRoot.kt`（既存ファイルを編集） | ボトムナビに6番目のタブ「センサー」を追加 |
| `AndroidManifest.xml`（既存ファイルを編集） | `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`等のBLE権限を追加 |

既存のストレススコア機能（Room、`StressCalculator`、他5タブ）は一切変更していない。

### ESP32ファームウェア
| ファイル | 役割 |
|---|---|
| `firmware/esp32_pressure/esp32_pressure.ino` | NimBLE-Arduinoで`BLE_PRESSURE.md`のGATTを実装。GPIO34のADCを10Hzで読み、BLE接続中のみnotify送信。現在はデバッグ用に`rawAdc`を常時Serial出力する行が入っている（配線確認できたら削除してよい） |

書き込み環境: Arduino IDE 2付属の`arduino-cli`、ESP32ボードコア**3.3.6**（3.3.7以降はNimBLEとの既知の相性問題でクラッシュするため固定）、NimBLE-Arduino 2.5.0。

### 開発用ツール（実機なし検証用）
| ファイル | 役割 |
|---|---|
| `tools/ble/fake_pressure_peripheral.py` | Bumbleで動く仮想BLE圧力センサー。`BLE_PRESSURE.md`と同じ仕様でGATTサーバを立て、`android-netsim` transportでエミュレータの仮想無線に接続する。実機ESP32が使えない場面での代替 |
| `tools/ble/device1.json` | Bumbleデバイスの設定ファイル（デバイス名・アドレス等） |
| `tools/ble/requirements.txt` | Bumbleの依存関係（`bumble`, `grpcio`, `protobuf`。`android-netsim` transportがgrpcを使うため） |

## データの流れ

**実機ESP32を使う場合:**
```
FSR(圧力) → ESP32 GPIO34 ADC → NimBLE notify(10Hz)
  → Android BluetoothGatt → PressureBleClient → SensorViewModel → SensorScreen(画面表示)
```

**実機なしで検証する場合（PC + エミュレータ）:**
```
tools/ble/fake_pressure_peripheral.py（Bumble） → android-netsim(エミュレータの仮想無線)
  → Android BluetoothGatt → PressureBleClient → SensorViewModel → SensorScreen(画面表示)
```
どちらも`docs/BLE_PRESSURE.md`の同じ仕様に従っているため、Android側のコードは共通。

## 既知の問題: Arduino IDEのボードマネージャがESP32コアを自動更新してクラッシュする

2026-07-11のセッションでコアを**3.3.6に固定**して解決したはずが、後日Arduino IDE 2のボードマネージャが
バックグラウンドで`esp32:esp32`コアを**3.3.10**まで自動更新し、同じ症状（`assert failed: npl_freertos_mutex_pend`、
`rst:0x10 (RTCWDT_RTC_RESET)`の再起動ループ、BLE advertiseに到達しない＝ブラウザ/アプリのデバイス選択に出てこない）
が再発した。arduino-cliは**バージョン付きでのuninstallを受け付けない**ため、無指定でuninstallしてから
3.3.6を入れ直す必要がある。

```powershell
# 1. バージョン無指定でアンインストール（付随ツールも含めて全部消える）
arduino-cli core uninstall esp32:esp32

# 2. 3.3.6を入れ直す
arduino-cli core install esp32:esp32@3.3.6

# 3. 再コンパイル・再書き込み
arduino-cli compile --fqbn esp32:esp32:esp32 --upload -p COM4 firmware/esp32_pressure
```

再発防止のため、Arduino IDEのボードマネージャで自動更新が走っていないか（またはネットワークが疎通する状態で
IDEを開きっぱなしにしていないか）を疑うこと。シリアルモニタでリセットループのログが出ていたら、まずこのコア
バージョンを疑うのが早い（`arduino-cli core list`で現在のアクティブバージョンを確認できる）。

## 現状のステータス

- ✅ Bumble仮想ペリフェラル ↔ エミュレータ上のアプリ: 接続・10Hz notify・波形描画まで確認済み
- ✅ 実機ESP32へのファーム書き込み: 成功、クラッシュなし、BLE advertise確認済み(PC実機Bluetoothでも検出、2026-08-14のコア再発時も3.3.6再固定で復旧確認済み)
- ⬜ 実機ESP32 ↔ 実機FSRセンサー: **FSR未配線のため未検証**（GPIO34はフローティングで`rawAdc`が2100〜2560あたりを揺れているだけ。配線後に再検証すること）
- ⬜ 実機ESP32 ↔ Androidアプリ: 未検証（Android実機がないため。Web版なら`web/`からブラウザで直接BLE接続して検証可能。手順は`web/README.md`参照）

より詳しいセットアップ手順・ハマりどころは `HANDOFF.md` の「圧力センサー(BLE)機能」セクション参照。
