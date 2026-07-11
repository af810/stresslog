/**
 * ESP32-DevKitC V4 + Walfront 薄膜感圧抵抗(FSR)センサー
 *
 * GPIO34 (ADC1_CH6) の分圧回路からFSRの抵抗変化を読み取り、
 * BLEでAndroidアプリ(StressLogの「センサー」タブ)に通知する。
 *
 * 仕様の唯一の正: ../../docs/BLE_PRESSURE.md
 * 開発中はPC上の tools/ble/fake_pressure_peripheral.py (Bumble) が
 * 同じ仕様で仮想ペリフェラルとして動くので、実機なしでアプリ側を検証できる。
 * このファームを焼いた実機に差し替える際、アプリ側のコード変更は不要。
 *
 * 配線:
 *   3.3V ── FSR ──┬── GPIO34
 *                 └── 10kΩ ── GND
 *   (押すとFSRの抵抗が下がり、GPIO34の電圧・ADC値が上がる)
 *
 * 必要ライブラリ: NimBLE-Arduino (h2zero/NimBLE-Arduino)
 * ボード設定: ESP32 Dev Module / Arduino core for ESP32
 */

#include <Arduino.h>
#include <NimBLEDevice.h>

// docs/BLE_PRESSURE.md と一致させること
static const char* SERVICE_UUID        = "f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10";
static const char* CHARACTERISTIC_UUID = "f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10";
static const char* DEVICE_NAME         = "StressLog-PS";

static const int PRESSURE_PIN = 34;  // ADC1_CH6。ADC2はBLE/Wi-Fi使用中に使えないため不可
static const int ADC_MAX      = 4095;

static const unsigned long SAMPLE_INTERVAL_MS = 100;  // 10Hz。docs/BLE_PRESSURE.md準拠

static NimBLEServer*         pServer;
static NimBLECharacteristic* pPressureCharacteristic;
static unsigned long         lastSampleAt = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* server, NimBLEConnInfo& connInfo) override {
        Serial.println("Client connected");
    }
    void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
        Serial.println("Client disconnected - restart advertising");
        NimBLEDevice::startAdvertising();
    }
} serverCallbacks;

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
    int   rawAdc  = analogRead(PRESSURE_PIN);
    float forceKg = rawAdcToForceKg(rawAdc);

    Serial.printf("rawAdc=%d\n", rawAdc);  // 配線確認用。動作確認できたら削除してよい

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

    NimBLEDevice::init(DEVICE_NAME);

    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(&serverCallbacks);

    NimBLEService* pService = pServer->createService(SERVICE_UUID);
    pPressureCharacteristic  = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
    );
    pPressureCharacteristic->setValue("");
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
