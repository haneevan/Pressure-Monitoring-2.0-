# AtsuKanshi.py - Corrected Global Scope
import os
from datetime import datetime
from flask import Flask, render_template, jsonify, request
import threading
import time
import atexit
import RPi.GPIO as GPIO
from apscheduler.schedulers.background import BackgroundScheduler
from pressure_sensorSIM import (
    get_front_pressure, 
    get_rear_pressure, 
    setup_gpio, 
    check_pressure_threshold
)
from database import (
    setup_database, 
    log_reading, 
    get_historical_readings, 
    get_hourly_average_readings, 
    get_minutes_average_readings,
    cleanup_old_data,
    get_error_logs,
    log_env_reading,
    get_historical_env_readings,
)
from temperature_sensor import (
    get_temperature, 
    get_atm_pressure, 
    get_humidity, 
    get_gas_resistance,
)

app = Flask(__name__)

# --- GLOBAL VARIABLES ---
latest_front_pressure = 0.0
latest_rear_pressure = 0.0
latest_temp = 0.0
latest_humidity = 0.0
latest_pressure_hpa = 0.0
latest_gas = "Heating..."
latest_reading_timestamp = None
scheduler = None

def initialize_system():
    """
    Initializes the database, starts the background logging thread,
    and sets up the cleanup scheduler.
    """
    global scheduler  # Declare scheduler as global
    
    setup_database()
    setup_gpio()
    
    # Set up the cleanup scheduler
    scheduler = BackgroundScheduler()
    scheduler.add_job(cleanup_old_data, 'cron', hour=18, minute=5)
    scheduler.start()
    
    # Start the background logging thread
    t = threading.Thread(target=background_logging_task, daemon=True)
    t.start()

def background_logging_task():
    # VERY IMPORTANT: Declare all these as global so the loop updates the values the API reads
    global latest_front_pressure, latest_rear_pressure, latest_reading_timestamp
    global latest_temp, latest_humidity, latest_pressure_hpa, latest_gas
    
    print("Starting background sensor logging task...")
    last_bme_update = 0
    BME_INTERVAL = 60 

    while True:
        try:
            current_time = time.time()
            
            # 1. FAST SENSORS (Pressure)
            f_press = get_front_pressure()
            r_press = get_rear_pressure()
            
            if f_press is not None and r_press is not None:
                check_pressure_threshold(f_press, r_press)
                
                # Update the GLOBAL variables
                latest_front_pressure = f_press
                latest_rear_pressure = r_press
                latest_reading_timestamp = datetime.now().isoformat()
                
                log_reading(f_press, r_press)

            # 2. SLOW SENSORS (BME680)
            if current_time - last_bme_update >= BME_INTERVAL:
                latest_temp = get_temperature()
                latest_humidity = get_humidity()
                latest_pressure_hpa = get_atm_pressure()
                latest_gas = get_gas_resistance()
                
                log_env_reading(latest_temp, latest_humidity, latest_pressure_hpa, latest_gas)
                last_bme_update = current_time
                print(f"BME680 Updated: {latest_temp}C")

        except Exception as e:
            print(f"Error in background task: {e}")
        
        time.sleep(0.5)

@app.route('/')
def index():
    """
    Renders the main dashboard HTML page.
    """
    return render_template('dashboard.html')

@app.route('/api/realtime')
def get_realtime_data():
    # If the background task is working correctly, this will no longer be None
    if latest_reading_timestamp:
        return jsonify({
            'timestamp': latest_reading_timestamp,
            'front_pressure': latest_front_pressure,
            'rear_pressure': latest_rear_pressure,
            'temperature': latest_temp,
            'humidity': latest_humidity,
            'pressure_hpa': latest_pressure_hpa,
            'gas_resistance': latest_gas
        })
    return jsonify({'error': 'No data available yet'}), 404

@app.route('/api/history')
def api_history():
    """Returns a list of historical readings.

    Query parameters:
    - start_date: YYYY-MM-DD
    - end_date: YYYY-MM-DD

    If both dates are omitted the default is the last 24 hours of data
    (and the response will be trimmed to the most recent 100 points).
    """
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        print(f"History request received, start_date={start_date}, end_date={end_date}")

        data = get_historical_readings(start_date, end_date)

        # If no specific range, just return the most recent points
        # to keep the initial load fast
        if not start_date and not end_date:
            trimmed = data[-100:]
            print(f"Returning {len(trimmed)} of {len(data)} total rows (recent 24h)")
            return jsonify(trimmed)

        print(f"Returning {len(data)} rows for requested range")
        return jsonify(data)
    except Exception as e:
        print(f"History API Error: {e}")
        return jsonify([]), 500

@app.route('/api/history/env')
def api_env_history():
    data = get_historical_env_readings()
    return jsonify(data)

@app.route('/api/average/hour')
def get_average_hourly_data():
    """
    API endpoint to get the average pressure over the last hour.
    """
    data = get_hourly_average_readings()
    if data:
        return jsonify(data)
    return jsonify({'error': 'No data available'}), 404

@app.route('/api/average/minute')
def get_average_minute_data():
    """
    API endpoint to get the average pressure over the last minute.
    """
    data = get_minutes_average_readings()
    if data:
        return jsonify(data)
    return jsonify({'error': 'No data available'}), 404

@app.route('/history')
def history():
    """
    Render History Page. showing graph for recent 24h and date
    """
    return render_template('history.html')
    
@app.route('/logs')
def logs():
    """
    Renders the log page HTML file.
    """
    return render_template('log.html')   

@app.route('/api/log')
def get_log_data():
    """
    API endpoint to get all historical pressure readings for both sensors.
    Used by log.html for live log display.
    """
    data = get_historical_readings()  # Should return a list of dicts with timestamp, front_pressure, rear_pressure
    return jsonify(data)

@app.route('/api/error-log')
def get_error_log_data():
    """API endpoint for error logs"""
    error_logs = get_error_logs()
    return jsonify(error_logs)

if __name__ == '__main__':
    print(f"DEBUG: Starting Process ID: {os.getpid()}") # Add this line
    
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        initialize_system()
    
    app.run(host='0.0.0.0', port=5000, debug=False)

@atexit.register
def cleanup():
    """Ensure GPIO is cleaned up and scheduler is shut down when the application exits"""
    global scheduler  # Reference the global scheduler
    GPIO.cleanup()
    if scheduler:  # Only shutdown if scheduler exists
        scheduler.shutdown()
