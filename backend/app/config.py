import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
    DB_PATH = os.path.join(BASE_DIR, "instance", "nms.sqlite3")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False


# Add these for production
    SCHEDULER_API_ENABLED = False  # Disable APScheduler API for security
    MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "localhost")
    MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
    MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", 60))
    
    # Add for performance
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }

# MQTT (local broker)
MQTT_BROKER_HOST = "127.0.0.1"
MQTT_BROKER_PORT = 1883

# Subscribe topic:
# This accepts all devices publishing to nms/telemetry/<device_id>
MQTT_TELEMETRY_TOPIC = "nms/telemetry/#"

# Optional credentials
MQTT_USERNAME = None
MQTT_PASSWORD = None