# 圧力センサー BLE 仕様

ESP32-DevKitC V4 + Walfront 薄膜感圧抵抗(FSR)センサーから、圧力値をBLEで
Androidアプリに送るための仕様。**この文書がSingle Source of Truthであり、
下記3つの実装はすべてここに準拠する**。

- PC側テスト用仮想ペリフェラル: `tools/ble/fake_pressure_peripheral.py` (Bumble)
- Androidアプリ側クライアント: `app/src/main/java/com/nishi/stresslog/data/ble/PressureBleSpec.kt`
- ESP32ファームウェア: `firmware/esp32_pressure/esp32_pressure.ino`

## Advertising

- Local Name: `StressLog-PS`
- Advertising データに Service UUID (下記) を含める。アプリはこれでスキャンをフィルタする

## GATT構成

```
Service          f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10
├ Characteristic f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10   properties: READ | NOTIFY
│   CCCD (0x2902) あり（notify購読用）
└ Characteristic f1a70003-8b2c-4e5d-9a6f-0c3b7d2e5a10   properties: WRITE
    ストレスLED制御（後述）
```

### 値のフォーマット（6バイト、リトルエンディアン）

| オフセット | 型 | 名前 | 内容 |
|---|---|---|---|
| 0–1 | uint16 | rawAdc | ADCの生値。0–4095（ESP32 ADCは12bit） |
| 2–5 | float32 | forceKg | 校正後の荷重[kg]。**未校正の間はNaNを送る** |

- Notify間隔: 100ms（10Hz）
- ATTデフォルトMTU(23バイト、実効20バイト)に対し6バイトなので、MTU交渉は不要

`rawAdc` と `forceKg` を両方送るのが要点。FSRの校正カーブ（後述）が決まる前でも
`rawAdc` だけで画面表示・通信確認ができ、開発が校正待ちで止まらない。

## ストレスLED（GPIO22）制御

アプリがストレススコアの閾値超過を検知したら、LED制御Characteristic
(`f1a70003-...`) に1バイト書き込んで ESP32 の GPIO22 に繋いだLEDを点灯させる。

| 書き込む値 | 意味 |
|---|---|
| `0x01` | ストレス閾値超過 → LED点灯を要求 |
| `0x00` | 閾値以下に戻った → LED消灯を要求 |

- ESP32はこの要求とは別に、自分でFSRの `rawAdc` を監視している。
  `rawAdc` が握り検知しきい値（ファーム内 `GRIP_DETECT_THRESHOLD`）を超えている間、
  100ms(サンプリング間隔)ずつ「握っていた時間」を積算する（ファーム内
  `gripHoldAccumMs`）。**離しても積算値はリセットされず、離してまた握るのを
  繰り返しても足し算で積み上がる。** 合計が `GRIP_HOLD_REQUIRED_MS`（3秒）に
  達した時点で、アプリからの要求に関わらず **LEDを消灯し、要求状態を "消灯" に
  リセットする**（＝製品を一定時間握ることでアラートを確認・解除する動作）。
  次に点灯するのはアプリが再度 `0x01` を書き込んだとき（このとき積算値も0に
  リセットされ、次のアラートは改めて3秒分の握りが必要になる）
- この解除ロジックはファームウェア側に閉じているため、BLE未接続でも動作する
- 現状Web版のみがこのCharacteristicに書き込む。Android実機クライアント
  (`PressureBleClient.kt`) と開発用仮想ペリフェラル (`fake_pressure_peripheral.py`)
  は未対応（読み取り専用の疎通確認にのみ使う場合は影響しない）

## ESP32 配線

```
3.3V ── FSR ──┬── GPIO34 (ADC1_CH6)
              └── 10kΩ ── GND

GPIO22 ── LED(+) ──┬
                    抵抗(220Ω程度) ── GND
```

- 押す → FSRの抵抗が下がる → GPIO34の電圧が上がる → ADC値が上がる（想定）
- **ADC1（GPIO32〜39）を使うこと。ADC2はWi-Fi/BLE無線使用中は使えない**
- GPIO34は入力専用・内部プルアップなし。分圧回路の読み取りに適する
- GPIO22は汎用デジタル出力。LEDのアノード側に直列抵抗（220Ω程度）を挟んでGNDへ

### 既知の問題: 実機で未押下時にrawAdcが4095(最大)付近になる

上記の配線図は「FSRが3.3V側、固定抵抗がGND側」の想定だが、実機では未押下時に
`analogRead()`が4095付近を返すことを確認した。これは配線が逆
（3.3V-固定抵抗-GPIO34-FSR-GND）になっている場合の挙動と一致する
（FSR未押下＝高抵抗のため、分圧の大部分がFSR側に掛かり、ノード電圧が3.3V付近になる）。

BLEで送るrawAdcは常に「大きいほど強く押されている」で統一したいため、
配線を直さずに **ファームウェア側で反転**して送信している
（`esp32_pressure.ino`: `rawAdc = ADC_MAX - analogRead(PRESSURE_PIN)`）。
配線を後から直した場合はこの反転処理を削除すること。

## 校正（forceKgの算出）

未校正時は `forceKg = NaN` を送ってよい。校正する場合は、既知の重り（例: 100g, 500g, 1kg）を
センサーに載せて `rawAdc` を記録し、区分線形または簡単な指数フィットで
`rawAdc → forceKg` の変換テーブルを作る。変換ロジックはファームウェア側
（`esp32_pressure.ino` 内の `rawAdcToForceKg()`）に閉じ込め、この仕様書の
バイトフォーマットには影響しない。

## 各実装の対応表

| 実装 | 参照すべき値 |
|---|---|
| Bumble (`fake_pressure_peripheral.py`) | Service/Characteristic UUID, ローカル名, 6バイトフォーマット（LED Characteristicは未実装） |
| Android (`PressureBleSpec.kt`) | 同上 + スキャンフィルタに使うService UUID（LED Characteristicは未実装） |
| Web (`pressureBleSpec.ts` / `pressureBleClient.ts`) | 同上 + LED Characteristic UUID・書き込み |
| ESP32 (`esp32_pressure.ino`) | 同上 + 配線 + サンプリング/notify間隔 + LED制御・握り検知しきい値 |

UUIDやバイトフォーマットを変更する場合は、この3ファイルと本仕様書を必ず同時に更新すること。
