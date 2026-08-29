/**
 * ESP32-DevKitC V4 + Walfront 薄膜感圧抵抗(FSR)センサー + ストレスLED
 *
 * GPIO34 (ADC1_CH6) の分圧回路からFSRの抵抗変化を読み取り、
 * BLEでAndroidアプリ(StressLogの「センサー」タブ)に通知する。
 * また、GPIO22に繋いだLEDをアプリからのBLE書き込みで点灯させ、
 * FSRを握るとファーム側で自動消灯する（ストレスアラートの確認・解除UI）。
 *
 * 仕様の唯一の正: ../../docs/BLE_PRESSURE.md
 * 開発中はPC上の tools/ble/fake_pressure_peripheral.py (Bumble) が
 * 同じ仕様で仮想ペリフェラルとして動くので、実機なしでアプリ側を検証できる
 * （ただしLED Characteristicは未実装）。
 * このファームを焼いた実機に差し替える際、アプリ側のコード変更は不要。
 *
 * 配線:
 *   3.3V ── FSR ──┬── GPIO34
 *                 └── 10kΩ ── GND
 *   (押すとFSRの抵抗が下がり、GPIO34の電圧・ADC値が上がる)
 *
 *   GPIO22 ── LED(+) ── 抵抗(220Ω程度) ── GND
 *
 * 必要ライブラリ: NimBLE-Arduino (h2zero/NimBLE-Arduino)
 * ボード設定: ESP32 Dev Module / Arduino core for ESP32
 */

#include <Arduino.h>
#include <NimBLEDevice.h>

// docs/BLE_PRESSURE.md と一致させること
static const char* SERVICE_UUID            = "f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10";
static const char* CHARACTERISTIC_UUID     = "f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10";
static const char* LED_CHARACTERISTIC_UUID = "f1a70003-8b2c-4e5d-9a6f-0c3b7d2e5a10";
static const char* DEVICE_NAME             = "StressLog-PS";

static const int PRESSURE_PIN = 34;  // ADC1_CH6。ADC2はBLE/Wi-Fi使用中に使えないため不可
static const int LED_PIN      = 22;
static const int ADC_MAX      = 4095;

// 「握った」とみなすADC生値のしきい値。アプリ側の小/中/大分類（設定画面で調整可能）とは
// 別で、LEDを消すためだけの単純な検知。FSR未配線のため暫定値。配線後に実測して調整する
static const int GRIP_DETECT_THRESHOLD = 700;

// LED消灯に必要な「握っていた合計時間」。連続して握り続ける必要はなく、
// 離してまた握るのを繰り返しても足し算で積み上がっていく
static const unsigned long GRIP_HOLD_REQUIRED_MS = 3000;

static const unsigned long SAMPLE_INTERVAL_MS = 100;  // 10Hz。docs/BLE_PRESSURE.md準拠

static NimBLEServer*         pServer;
static NimBLECharacteristic* pPressureCharacteristic;
static NimBLECharacteristic* pLedCharacteristic;
static unsigned long         lastSampleAt = 0;

// アプリがLED点灯を要求しているか。BLE書き込みコールバックとloop()の両方から触るためvolatile
static volatile bool stressLedRequested = false;

// 握っていた時間の累積（離してもリセットしない、足し算方式）。
// GRIP_HOLD_REQUIRED_MSに達したらLEDを消灯し、0に戻す
static unsigned long gripHoldAccumMs = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* server, NimBLEConnInfo& connInfo) override {
        Serial.println("Client connected");
    }
    void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
        Serial.println("Client disconnected - restart advertising");
        NimBLEDevice::startAdvertising();
    }
} serverCallbacks;

/** アプリがLED Characteristicに1バイト書き込んでくる（0x01=点灯要求, 0x00=消灯要求） */
class LedCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& connInfo) override {
        std::string value = characteristic->getValue();
        if (!value.empty()) {
            stressLedRequested = (value[0] != 0);
            if (stressLedRequested) {
                // 新しいアラートなので、前回までの握り時間の積み上げはリセットする
                gripHoldAccumMs = 0;
            }
        }
    }
} ledCallbacks;

/**
 * FSRの生ADC値から荷重[kg]を算出する。
 * 未校正の間はNaNを返す(docs/BLE_PRESSURE.md: 未校正時はNaNを送る)。
 *
 * 校正手順: 既知の重り(例: 100g, 500g, 1kg)をセンサーに載せてSerial出力の
 * rawAdcを記録し、区分線形またはフィット式をここに実装する。
 */
float rawAdcToForceKg(int rawAdc) {
    return NAN;  // TODO: 校正が済んだら区分線形近似などに差し替える
}

void sendPressureSample() {
    // 実機配線では未押下時にADCが最大(4095)付近になることを確認した
    // (3.3V-固定抵抗-GPIO34-FSR-GND の並びで、FSRが未押下=高抵抗のため)。
    // 送信するrawAdcは「大きいほど強く押されている」で統一するため反転する
    int rawAdc = ADC_MAX - analogRead(PRESSURE_PIN);
    float forceKg = rawAdcToForceKg(rawAdc);

    Serial.printf("rawAdc=%d\n", rawAdc);  // 配線確認用。動作確認できたら削除してよい

    // 握っている間だけ時間を積算する（離しても積算値はリセットしない＝足し算方式）。
    // 合計がGRIP_HOLD_REQUIRED_MSに達したらLED要求を解除する（消灯は「握って確認した」
    // ことの合図。離してもすぐには再点灯せず、次にアプリが点灯要求を送るまで消灯のまま）
    if (rawAdc >= GRIP_DETECT_THRESHOLD) {
        gripHoldAccumMs += SAMPLE_INTERVAL_MS;
        if (gripHoldAccumMs >= GRIP_HOLD_REQUIRED_MS) {
            stressLedRequested = false;
            gripHoldAccumMs = 0;  // 次のアラートに備えてリセット
        }
    }
    digitalWrite(LED_PIN, stressLedRequested ? HIGH : LOW);

    // docs/BLE_PRESSURE.md: [uint16 rawAdc LE][float32 forceKg LE] の6バイト
    uint8_t payload[6];
    payload[0] = (uint8_t)(rawAdc & 0xFF);
    payload[1] = (uint8_t)((rawAdc >> 8) & 0xFF);
    memcpy(&payload[2], &forceKg, sizeof(float));

    if (pServer->getConnectedCount() > 0) {
        pPressureCharacteristic->setValue(payload, sizeof(payload));
        pPressureCharacteristic->notify();
    }
}

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);  // 0-4095、docs/BLE_PRESSURE.md のrawAdcレンジと一致

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    NimBLEDevice::init(DEVICE_NAME);

    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(&serverCallbacks);

    NimBLEService* pService = pServer->createService(SERVICE_UUID);
    pPressureCharacteristic  = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
    );
    pPressureCharacteristic->setValue("");

    pLedCharacteristic = pService->createCharacteristic(
        LED_CHARACTERISTIC_UUID,
        NIMBLE_PROPERTY::WRITE
    );
    pLedCharacteristic->setCallbacks(&ledCallbacks);
    pLedCharacteristic->setValue((uint8_t)0);

    pService->start();

    NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->setName(DEVICE_NAME);
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->enableScanResponse(true);
    pAdvertising->start();

    Serial.println("Advertising as " + String(DEVICE_NAME));
}

void loop() {
    unsigned long now = millis();
    if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
        lastSampleAt = now;
        sendPressureSample();
    }
}
