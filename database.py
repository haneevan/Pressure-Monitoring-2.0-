# database.py
# Handles all database interactions for the pressure monitoring system.

from datetime import datetime, timedelta
import json
import sqlite3

DB_FILE = 'pressure_data.db'
IDLE_PRESSURE_THRESHOLD = 0.029  # MPa — do not log readings at or below this

def setup_database():
    """
    Sets up the SQLite database and creates the required tables.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    cursor.execute('PRAGMA journal_mode=WAL;')
    
    # Create readings table (Pressure)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            front_pressure REAL,
            rear_pressure REAL
        )
    ''')
    
    # Create error_logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS error_logs (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            front_pressure REAL,
            rear_pressure REAL,
            error_type TEXT
        )
    ''')

    # NEW: Create env_readings table (BME680)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS env_readings (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            temperature REAL,
            humidity REAL,
            pressure_hpa REAL,
            gas_resistance REAL
        )
    ''')
    
    conn.commit()
    conn.close()

def log_reading(front_pressure, rear_pressure):
    """
    Logs a new pressure reading to the database.
    Will skip saving if both values are None or if any provided reading is at/below idle threshold.
    """
    # Don't log if there's no data
    if front_pressure is None and rear_pressure is None:
        return

    # Don't log if any available reading indicates the system is idle
    if (front_pressure is not None and front_pressure <= IDLE_PRESSURE_THRESHOLD) or \
       (rear_pressure is not None and rear_pressure <= IDLE_PRESSURE_THRESHOLD):
        return

    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cursor.execute('INSERT INTO readings (timestamp, front_pressure, rear_pressure) VALUES (?, ?, ?)',
                   (timestamp, front_pressure, rear_pressure))
    conn.commit()
    conn.close()

def log_env_reading(temp, humidity, pressure_hpa, gas):
    """
    NEW: Logs BME680 environmental data to the database.
    """
    if temp is None or humidity is None:
        return

    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    try:
        cursor.execute('''
            INSERT INTO env_readings (timestamp, temperature, humidity, pressure_hpa, gas_resistance)
            VALUES (?, ?, ?, ?, ?)
        ''', (timestamp, temp, humidity, pressure_hpa, gas))
        conn.commit()
    except Exception as e:
        print(f"Error logging environmental data: {e}")
    finally:
        conn.close()

# --- Retrieval Functions ---

def get_historical_env_readings():
    """
    NEW: Retrieves environmental readings for the last 24 hours.
    Used to populate Slide 2 graphs on page refresh.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    one_day_ago = (datetime.now() - timedelta(days=1)).isoformat()
    
    cursor.execute('''
        SELECT timestamp, temperature, humidity, pressure_hpa, gas_resistance 
        FROM env_readings 
        WHERE timestamp >= ? 
        ORDER BY timestamp ASC
    ''', (one_day_ago,))
    
    data = cursor.fetchall()
    conn.close()
    
    return [
        {
            'timestamp': r[0], 
            'temperature': r[1], 
            'humidity': r[2], 
            'pressure_hpa': r[3], 
            'gas_resistance': r[4]
        } for r in data
    ]

def log_error_event(front_pressure, rear_pressure, error_type):
    """
    Logs an error event to the database. Error logging continues 24/7.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    
    try:
        cursor.execute('''
            INSERT INTO error_logs (timestamp, front_pressure, rear_pressure, error_type)
            VALUES (?, ?, ?, ?)
        ''', (timestamp, front_pressure, rear_pressure, error_type))
        conn.commit()
    except Exception as e:
        print(f"Error logging error event: {e}")
    finally:
        conn.close()

def cleanup_old_data():
    """
    Removes data older than 30 days from all tables.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    cutoff_date = (datetime.now() - timedelta(days=30)).isoformat()
    
    try:
        cursor.execute('DELETE FROM readings WHERE timestamp < ?', (cutoff_date,))
        cursor.execute('DELETE FROM error_logs WHERE timestamp < ?', (cutoff_date,))
        # ADD THIS LINE BELOW:
        cursor.execute('DELETE FROM env_readings WHERE timestamp < ?', (cutoff_date,))
        
        conn.commit()
    except Exception as e:
        print(f"Error during cleanup: {e}")
    finally:
        conn.close()

def get_historical_readings(start_date=None, end_date=None):
    """
    Retrieves historical pressure readings. 
    If both start_date and end_date are provided, filters by the inclusive range.
    Otherwise, returns the last 24 hours of data.

    start_date and end_date should be in YYYY-MM-DD format (e.g., "2026-02-15").
    Invalid or mismatched inputs will be ignored and the default (last day)
    will be returned.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()

    if start_date and end_date:
        # guard against malformed dates; simple check for expected length
        if len(start_date) != 10 or len(end_date) != 10:
            print(f"get_historical_readings: bad date format start={start_date} end={end_date}")
        else:
            # Convert dates to include full day range (00:00:00 to 23:59:59)
            start_datetime = f"{start_date}T00:00:00"
            end_datetime = f"{end_date}T23:59:59"
            query = ('SELECT timestamp, front_pressure, rear_pressure FROM readings '
                     'WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC')
            print(f"Executing history query between {start_datetime} and {end_datetime}")
            cursor.execute(query, (start_datetime, end_datetime))
            data = cursor.fetchall()
            conn.close()
            return [
                {'timestamp': r[0], 'front_pressure': r[1], 'rear_pressure': r[2]}
                for r in data
            ]

    # Default behavior: last 24 hours (or fallback if validation above failed)
    one_day_ago = (datetime.now() - timedelta(days=1)).isoformat()
    query = ('SELECT timestamp, front_pressure, rear_pressure FROM readings '
             'WHERE timestamp >= ? ORDER BY timestamp ASC')
    print(f"Executing history query for last 24h since {one_day_ago}")
    cursor.execute(query, (one_day_ago,))
    data = cursor.fetchall()
    conn.close()
    return [
        {'timestamp': r[0], 'front_pressure': r[1], 'rear_pressure': r[2]}
        for r in data
    ]

def get_latest_reading():
    """
    Retrieves the latest pressure reading from the database.
    Returns a dictionary.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    cursor.execute('SELECT timestamp, front_pressure, rear_pressure FROM readings ORDER BY timestamp DESC LIMIT 1')
    data = cursor.fetchone()
    conn.close()
    
    if data:
        return {'timestamp': data[0], 'front_pressure': data[1], 'rear_pressure': data[2]}
    return None

def get_hourly_average_readings():
    """
    Calculates the average pressure for the last 10 minutes (was 1 hour).
    Returns a dictionary with the average values.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    
    # Calculate the timestamp for ten minutes ago
    ten_minutes_ago = datetime.now() - timedelta(minutes=10)
    
    # Query for all readings in the last 10 minutes
    cursor.execute('''
        SELECT AVG(front_pressure), AVG(rear_pressure)
        FROM readings
        WHERE timestamp >= ?
    ''', (ten_minutes_ago.isoformat(),))
    
    data = cursor.fetchone()
    conn.close()
    
    if data and data[0] is not None and data[1] is not None:
        return {'front_average': data[0], 'rear_average': data[1]}
    return {'front_average': 0.0, 'rear_average': 0.0} # Return 0 if no data is found

def get_minutes_average_readings():
    """
    Calculates the average pressure for the last minute.
    Returns a dictionary with the average values.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    
    # Calculate the timestamp for one minute ago
    one_minute_ago = datetime.now() - timedelta(minutes=1)
    
    # Query for all readings in the last minute
    cursor.execute('''
        SELECT AVG(front_pressure), AVG(rear_pressure)
        FROM readings
        WHERE timestamp >= ?
    ''', (one_minute_ago.isoformat(),))
    
    data = cursor.fetchone()
    conn.close()
    
    if data and data[0] is not None and data[1] is not None:
        return {'front_averageM': data[0], 'rear_averageM': data[1]}
    return {'front_averageM': 0.0, 'rear_averageM': 0.0} # Return 0 if no data is found

def get_historical_readings_json():
    """
    Retrieves historical pressure readings from the last minute.
    Returns a JSON formatted string.
    """
    readings = get_historical_readings()
    return json.dumps(readings)

def get_error_logs():
    """
    Retrieves error logs from the last 24 hours.
    Returns a list of dictionaries.
    """
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    cursor = conn.cursor()
    one_day_ago = datetime.now() - timedelta(days=1)
    cursor.execute('''
        SELECT timestamp, front_pressure, rear_pressure, error_type
        FROM error_logs
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
    ''', (one_day_ago.isoformat(),))
    data = cursor.fetchall()
    conn.close()
    
    return [
        {
            'timestamp': r[0],
            'front_pressure': r[1],
            'rear_pressure': r[2],
            'error_type': r[3]
        }
        for r in data
    ]
