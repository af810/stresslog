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
└ Characteristic f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10   properties: READ | NOTIFY
    CCCD (0x2902) あり（notify購読用）
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

## ESP32 配線

```
3.3V ── FSR ──┬── GPIO34 (ADC1_CH6)
              └── 10kΩ ── GND
```

- 押す → FSRの抵抗が下がる → GPIO34の電圧が上がる → ADC値が上がる
- **ADC1（GPIO32〜39）を使うこと。ADC2はWi-Fi/BLE無線使用中は使えない**
- GPIO34は入力専用・内部プルアップなし。分圧回路の読み取りに適する

## 校正（forceKgの算出）

未校正時は `forceKg = NaN` を送ってよい。校正する場合は、既知の重り（例: 100g, 500g, 1kg）を
センサーに載せて `rawAdc` を記録し、区分線形または簡単な指数フィットで
`rawAdc → forceKg` の変換テーブルを作る。変換ロジックはファームウェア側
（`esp32_pressure.ino` 内の `rawAdcToForceKg()`）に閉じ込め、この仕様書の
バイトフォーマットには影響しない。

## 各実装の対応表

| 実装 | 参照すべき値 |
|---|---|
| Bumble (`fake_pressure_peripheral.py`) | Service/Characteristic UUID, ローカル名, 6バイトフォーマット |
| Android (`PressureBleSpec.kt`) | 同上 + スキャンフィルタに使うService UUID |
| ESP32 (`esp32_pressure.ino`) | 同上 + 配線 + サンプリング/notify間隔 |

UUIDやバイトフォーマットを変更する場合は、この3ファイルと本仕様書を必ず同時に更新すること。
