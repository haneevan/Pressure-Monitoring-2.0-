import time
import random
import math

# --- SIMULATION TOGGLE ---
USE_SIMULATION = True  # Set to False when connecting to the real sensor
# -------------------------

if not USE_SIMULATION:
    try:
        import bme680
    except ImportError:
        print("BME680 library not found. Falling back to simulation.")
        USE_SIMULATION = True

class MockBME680:
    """Simulates the bme680 library structure and data generation"""
    def __init__(self):
        self.data = MockData()
        self.start_time = time.time()
        self.heat_stable = True

    def set_humidity_oversample(self, val): pass
    def set_pressure_oversample(self, val): pass
    def set_temperature_oversample(self, val): pass
    def set_filter(self, val): pass
    def set_gas_status(self, val): pass
    def set_gas_heater_temperature(self, val): pass
    def set_gas_heater_duration(self, val): pass
    def select_gas_heater_profile(self, val): pass

    def get_sensor_data(self):
        t = time.time() - self.start_time
        # Simulate Temperature (20-25°C range with sine wave)
        self.data.temperature = 22.5 + 2.5 * math.sin(t * 0.1) + random.uniform(-0.1, 0.1)
        # Simulate Pressure (Standard atm 1013.25 +/- noise)
        self.data.pressure = 1013.25 + 5 * math.sin(t * 0.05) + random.uniform(-0.2, 0.2)
        # Simulate Humidity (30-50% range)
        self.data.humidity = 40 + 10 * math.sin(t * 0.08) + random.uniform(-0.5, 0.5)
        # Simulate Gas Resistance (steady climb then plateau)
        self.data.gas_resistance = 50000 + 10000 * math.sin(t * 0.02) + random.uniform(-500, 500)
        self.data.heat_stable = True
        return True

class MockData:
    def __init__(self):
        self.temperature = 0
        self.pressure = 0
        self.humidity = 0
        self.gas_resistance = 0
        self.heat_stable = False

# --- Initialization ---
try:
    if USE_SIMULATION:
        sensor = MockBME680()
        print("Running in SIMULATION mode")
    else:
        sensor = bme680.BME680(0x77)
        sensor.set_humidity_oversample(bme680.OS_2X)
        sensor.set_pressure_oversample(bme680.OS_4X)
        sensor.set_temperature_oversample(bme680.OS_8X)
        sensor.set_filter(bme680.FILTER_SIZE_3)
        print("Running with REAL sensor")
except Exception as e:
    print(f"Initialization error: {e}")

# --- Functional Interface ---

def get_temperature():
    if sensor.get_sensor_data():
        return round(sensor.data.temperature, 2)
    return None

def get_atm_pressure():
    if sensor.get_sensor_data():
        return round(sensor.data.pressure, 2)
    return None

def get_humidity():
    if sensor.get_sensor_data():
        return round(sensor.data.humidity, 2)
    return None

def get_gas_resistance():
    if sensor.get_sensor_data() and sensor.data.heat_stable:
        return round(sensor.data.gas_resistance, 0)
    return "Heating..."

# Test loop
if __name__ == "__main__":
    try:
        while True:
            print(f"Temp: {get_temperature()}C | Pressure: {get_atm_pressure()}hPa | Humidity: {get_humidity()}%")
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopped.")