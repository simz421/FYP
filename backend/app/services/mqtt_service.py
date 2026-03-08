# backend/app/services/mqtt_service.py
import json
import threading
import time
from typing import Optional

import paho.mqtt.client as mqtt

from app.extensions import db
from app.models import SensorReading
from datetime import datetime


class MQTTService:
    """
    Runs a background MQTT client that subscribes to telemetry topics and stores readings in SQLite.
    """

    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        topic: str,
        client_id: str = "nms_backend",
        username: Optional[str] = None,
        password: Optional[str] = None,
        keepalive: int = 60,
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.topic = topic
        self.client_id = client_id
        self.username = username
        self.password = password
        self.keepalive = keepalive

        self._client = mqtt.Client(client_id=self.client_id, clean_session=True)
        if self.username:
            self._client.username_pw_set(self.username, self.password)

        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.on_disconnect = self._on_disconnect

        self._thread: Optional[threading.Thread] = None
        self._stop_flag = threading.Event()

        self._connected = False
        self._last_error = None
        self._last_message_at = None

        # We set this later (Flask app instance)
        self._app = None

    def attach_app(self, app):
        """
        Attach Flask app so we can create an app context inside callbacks.
        """
        self._app = app

    def start(self):
        if not self._app:
            raise RuntimeError("MQTTService: attach_app(app) must be called before start().")

        if self._thread and self._thread.is_alive():
            return  # already running

        self._stop_flag.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_flag.set()
        try:
            self._client.disconnect()
        except Exception:
            pass

    def status(self):
        return {
            "connected": self._connected,
            "topic": self.topic,
            "broker": f"{self.broker_host}:{self.broker_port}",
            "last_message_at": self._last_message_at,
            "last_error": self._last_error,
        }

    def _run(self):
        """
        Connect loop with reconnection logic.
        """
        while not self._stop_flag.is_set():
            try:
                self._client.connect(self.broker_host, self.broker_port, self.keepalive)
                self._client.loop_start()

                # Wait until stop is requested
                while not self._stop_flag.is_set():
                    time.sleep(0.5)

                self._client.loop_stop()
                return

            except Exception as e:
                self._connected = False
                self._last_error = f"MQTT connect/run error: {e}"
                time.sleep(2)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            self._last_error = None
            client.subscribe(self.topic, qos=0)
        else:
            self._connected = False
            self._last_error = f"MQTT on_connect failed rc={rc}"

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            self._last_error = f"MQTT unexpected disconnect rc={rc}"

    def _on_message(self, client, userdata, msg):
        """
        Expected message JSON:
        {
          "device_id": "ESP32_01",
          "sensor_type": "temperature",
          "value": 26.5,
          "timestamp": "2026-02-13T18:00:00"   (optional)
        }
        """
        self._last_message_at = datetime.utcnow().isoformat()

        try:
            raw = msg.payload.decode("utf-8", errors="replace")
            data = json.loads(raw)

            required = ["device_id", "sensor_type", "value"]
            missing = [k for k in required if k not in data]
            if missing:
                self._last_error = f"MQTT message missing fields: {missing}"
                return

            # optional timestamp
            created_at = None
            if "timestamp" in data and data["timestamp"]:
                try:
                    created_at = datetime.fromisoformat(str(data["timestamp"]).replace("Z", ""))
                except Exception:
                    created_at = None

            # IMPORTANT: run DB work inside Flask app context
            with self._app.app_context():
                reading = SensorReading(
                    device_id=str(data["device_id"]),
                    sensor_type=str(data["sensor_type"]),
                    value=float(data["value"]),
                )

                # If your SensorReading model has created_at, set it:
                if hasattr(reading, "created_at") and created_at:
                    setattr(reading, "created_at", created_at)

                db.session.add(reading)
                db.session.commit()

        except Exception as e:
            self._last_error = f"MQTT on_message error: {e}"