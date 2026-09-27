"""Weather context. It never replaces an uploaded solar profile."""
#importing the necessary libraries for handling JSON, environment variables, date and time, and making HTTP requests
import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen
from dotenv import load_dotenv

load_dotenv()

def get_weather():
    key = os.getenv("WEATHER_API_KEY")
    if not key:
        return {"status": "DEMO WEATHER MODE", "timestamp": datetime.now(timezone.utc).isoformat(), "temperature_c": 28.0, "cloud_cover_percent": 35.0, "solar_irradiance_w_m2": 650.0, "humidity_percent": 58.0, "wind_speed_m_s": 3.2, "solar_input_label": "ESTIMATED / SCENARIO INPUT"}
    try:
        params = urlencode({"lat": os.getenv("WEATHER_LAT", "19.0760"), "lon": os.getenv("WEATHER_LON", "72.8777"), "appid": key, "units": "metric"})
        with urlopen("https://api.openweathermap.org/data/2.5/weather?" + params, timeout=8) as response:
            payload = json.load(response)
        clouds = float(payload.get("clouds", {}).get("all", 0))
        return {"status": "LIVE WEATHER", "timestamp": datetime.now(timezone.utc).isoformat(), "temperature_c": payload.get("main", {}).get("temp"), "cloud_cover_percent": clouds, "solar_irradiance_w_m2": round(1000 * (1 - clouds / 100), 1), "humidity_percent": payload.get("main", {}).get("humidity"), "wind_speed_m_s": payload.get("wind", {}).get("speed"), "solar_input_label": "ESTIMATED / SCENARIO INPUT"}
    except Exception as exc:
        return {"status": "WEATHER UNAVAILABLE", "timestamp": datetime.now(timezone.utc).isoformat(), "temperature_c": None, "cloud_cover_percent": None, "solar_irradiance_w_m2": None, "humidity_percent": None, "wind_speed_m_s": None, "solar_input_label": "ESTIMATED / SCENARIO INPUT", "error": str(exc)}
