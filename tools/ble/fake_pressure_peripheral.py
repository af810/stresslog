# 圧力センサー(ESP32 + Walfront FSR)の代わりに動く、開発用の仮想BLEペリフェラル。
# Android実機がない環境でも、Bumbleがandroid-netsim経由でエミュレータの仮想無線に
# つながることを利用し、アプリ側のBLEスキャン/接続/notify購読を本物のGATT通信として
# 検証できるようにする。バイトフォーマット/UUIDは docs/BLE_PRESSURE.md が正。
#
# 使い方:
#   python fake_pressure_peripheral.py device1.json android-netsim
#
# 実機ESP32に差し替えるときは、このプロセスを止めて本物のESP32の電源を入れるだけでよい。
# アプリ側のコードは一切変更不要（同じUUID/フォーマットで待ち受けているため）。

import asyncio
import math
import random
import struct
import sys
import time

import bumble.logging
from bumble import data_types
from bumble.core import AdvertisingData
from bumble.device import Device
from bumble.gatt import Characteristic, CharacteristicValue, Service
from bumble.transport import open_transport
from bumble.utils import AsyncRunner

# docs/BLE_PRESSURE.md と一致させること
PRESSURE_SERVICE_UUID = "f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10"
PRESSURE_CHARACTERISTIC_UUID = "f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10"

ADC_MAX = 4095
NOTIFY_INTERVAL_SECONDS = 0.1  # 10Hz


class PressureSimulator:
    """FSRを指で「たまに押す」ような波形を合成する。
    普段は低いベースライン付近でノイズし、確率的に押下スパイクが発生して
    数百msかけて立ち上がり／減衰する。
    """

    def __init__(self) -> None:
        self._press_remaining = 0
        self._press_intensity = 0.0
        self._current_raw_adc = 0
        self.advance()

    def advance(self) -> int:
        """1ティック分だけ状態を進め、新しいrawAdcを返す。通知ループから1回だけ呼ぶ。"""
        baseline = 80 + 20 * math.sin(time.time() * 0.5)

        if self._press_remaining <= 0 and random.random() < 0.03:
            self._press_remaining = random.randint(10, 30)  # 1〜3秒持続
            self._press_intensity = random.uniform(1500, 3800)

        press_load = 0.0
        if self._press_remaining > 0:
            self._press_remaining -= 1
            press_load = self._press_intensity

        noise = random.uniform(-15, 15)
        value = baseline + press_load + noise
        self._current_raw_adc = int(max(0, min(ADC_MAX, value)))
        return self._current_raw_adc

    @property
    def current_raw_adc(self) -> int:
        """状態を進めずに直近値を返す。read要求に応じるためのもの。"""
        return self._current_raw_adc


def raw_adc_to_force_kg(raw_adc: int) -> float:
    # 未校正。実運用では既知の重りで作った変換テーブルに差し替える
    # (docs/BLE_PRESSURE.md の「校正」参照)。ここではダミーの線形近似。
    if raw_adc < 100:
        return 0.0
    return round((raw_adc - 100) / ADC_MAX * 5.0, 3)


def encode_sample(raw_adc: int, force_kg: float) -> bytes:
    return struct.pack("<Hf", raw_adc, force_kg)


async def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python fake_pressure_peripheral.py <device-config> <transport-spec>")
        print("example: python fake_pressure_peripheral.py device1.json android-netsim")
        return

    simulator = PressureSimulator()

    async with await open_transport(sys.argv[2]) as hci_transport:
        device = Device.from_config_file_with_hci(
            sys.argv[1], hci_transport.source, hci_transport.sink
        )

        def read_pressure(_connection):
            raw_adc = simulator.current_raw_adc
            return encode_sample(raw_adc, raw_adc_to_force_kg(raw_adc))

        pressure_characteristic = Characteristic(
            PRESSURE_CHARACTERISTIC_UUID,
            Characteristic.Properties.READ | Characteristic.Properties.NOTIFY,
            Characteristic.READABLE,
            CharacteristicValue(read=read_pressure),
        )
        pressure_service = Service(PRESSURE_SERVICE_UUID, [pressure_characteristic])
        device.add_services([pressure_service])

        # レガシー広告は31バイト上限。ローカル名+128bit UUIDの合計が収まらず
        # 拡張広告にフォールバックするとnetsimの仮想コントローラが対応しておらず
        # HCI_Error(INVALID_COMMAND_PARAMETERS_ERROR)になる。ローカル名を主広告、
        # サービスUUIDをスキャンレスポンスに分けて両方を31バイト以内に収める。
        # Androidのアクティブスキャンはスキャンレスポンスも取得してマージするため、
        # ScanFilter.setServiceUuid()によるフィルタは引き続き機能する。
        device.advertising_data = bytes(
            AdvertisingData([data_types.CompleteLocalName("StressLog-PS")])
        )
        device.scan_response_data = bytes(
            AdvertisingData(
                [data_types.IncompleteListOf128BitServiceUUIDs([pressure_service.uuid])]
            )
        )

        def on_subscription(connection, notify_enabled, indicate_enabled):
            if notify_enabled or indicate_enabled:
                print(f"=== {connection} subscribed")
                AsyncRunner.spawn(
                    device.notify_subscriber(connection, pressure_characteristic)
                )

        pressure_characteristic.on("subscription", on_subscription)

        await device.power_on()
        await device.start_advertising(auto_restart=True)

        print("=== advertising as 'StressLog-PS', waiting for subscribers...")
        while True:
            await asyncio.sleep(NOTIFY_INTERVAL_SECONDS)
            raw_adc = simulator.advance()
            pressure_characteristic.value = encode_sample(
                raw_adc, raw_adc_to_force_kg(raw_adc)
            )
            await device.notify_subscribers(pressure_characteristic)


bumble.logging.setup_basic_logging("INFO")
asyncio.run(main())
