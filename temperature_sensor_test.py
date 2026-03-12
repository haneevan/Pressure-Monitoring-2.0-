import bme680
import time

try:
    # センサーの初期化（アドレスを0x77に指定）
    #sensor = bme680.BME680(bme680.I2C_ADDR_PRIMARY) # 0x76
    # もし上記でエラーが出る場合は以下を試してください
    sensor = bme680.BME680(0x77)

    print("BME680 読み取り開始 (Ctrl+C で終了)")

    # センサー設定（精度を高めるためのオーバーサンプリング設定）
    sensor.set_humidity_oversample(bme680.OS_2X)
    sensor.set_pressure_oversample(bme680.OS_4X)
    sensor.set_temperature_oversample(bme680.OS_8X)
    sensor.set_filter(bme680.FILTER_SIZE_3)

    while True:
        if sensor.get_sensor_data():
            output = "温度: {0:.2f} C, 気圧: {1:.2f} hPa, 湿度: {2:.2f} %RH".format(
                sensor.data.temperature,
                sensor.data.pressure,
                sensor.data.humidity)
            
            # ガスセンサー（空気質）のデータがある場合
            if sensor.data.heat_stable:
                print("{0}, ガス抵抗: {1} Ohms".format(output, sensor.data.gas_resistance))
            else:
                print(output)

        time.sleep(1)

except KeyboardInterrupt:
    print("\n終了します")
