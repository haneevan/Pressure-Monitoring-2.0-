from pressure_sensor import get_front_pressure, get_rear_pressure
from database import log_reading, setup_database
import time
import threading

def log_front_sensor():
    setup_database()
    while True:
        try:
            front_pressure = get_front_pressure()
            # Only log front pressure, rear as None
            log_reading(front_pressure, None)
            print(f"Logged: Front={front_pressure:.3f} MPa")
        except Exception as e:
            print(f"Front logging error: {e}")
        time.sleep(0.5)

def log_rear_sensor():
    setup_database()
    while True:
        try:
            rear_pressure = get_rear_pressure()
            # Only log rear pressure, front as None
            log_reading(None, rear_pressure)
            print(f"Logged: Rear={rear_pressure:.3f} MPa")
        except Exception as e:
            print(f"Rear logging error: {e}")
        time.sleep(0.5)

if __name__ == '__main__':
    # Run both loggers in parallel threads
    threading.Thread(target=log_front_sensor, daemon=True).start()
    threading.Thread(target=log_rear_sensor, daemon=True).start()
    while True:
        time.sleep(1)
