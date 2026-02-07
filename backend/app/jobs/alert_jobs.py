from __future__ import annotations

from app.models import SensorReading
from app.services.telemetry_queries import get_latest_readings
from app.services.alerts_service import evaluate_reading


def evaluate_latest_readings_job(app, limit: int = 200) -> None:
    """
    Periodic safety-net job (runs under Flask app context).
    Re-evaluates latest readings and auto-resolves alerts.
    """
    with app.app_context():
        rows = get_latest_readings(limit=limit)

        for r in rows:
            try:
                reading = SensorReading.query.get(r["id"])
                if not reading:
                    continue
                evaluate_reading(reading, auto_resolve=True)
            except Exception:
                # keep scheduler resilient
                continue
