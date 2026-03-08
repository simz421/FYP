from datetime import datetime
from flask import Blueprint, request, jsonify
import datetime
from app.models import SensorReading
from app.services.telemetry import ingest_telemetry
from app.services.websocket_service import broadcast_noc_refresh

sensors_bp = Blueprint("sensors", __name__, url_prefix="/api/sensors")

# ------------------------------------------------------------
# Telemetry ingestion (single OR batch)
# POST /api/sensors/telemetry/ingest
# ------------------------------------------------------------
@sensors_bp.post("/telemetry/ingest")
def telemetry_ingest():
    payload = request.get_json(silent=True) or {}
    status, body = ingest_telemetry(payload)

    # Realtime NOC refresh when telemetry arrives
    if 200 <= status < 300:
        broadcast_noc_refresh({
            "reason": "telemetry_ingest",
            "device_id": payload.get("device_id"),
            "timestamp": datetime.datetime.utcnow().isoformat()
        })

    return jsonify(body), status


# ------------------------------------------------------------
# Backward-compatible single-reading endpoint
# POST /api/sensors/readings
# Uses SAME ingestion service (DO NOT bypass it)
# ------------------------------------------------------------
@sensors_bp.post("/readings")
def add_reading():
    data = request.get_json(silent=True) or {}

    required = ["device_id", "sensor_type", "value"]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400

    status, body = ingest_telemetry(data)

    # Realtime NOC refresh when telemetry arrives
    if 200 <= status < 300:
        broadcast_noc_refresh({
            "reason": "single_reading",
            "device_id": data.get("device_id"),
            "timestamp": datetime.datetime.utcnow().isoformat()
        })

    return jsonify(body), status
# ------------------------------------------------------------
# List readings (for charts / debugging)
# GET /api/sensors/readings
# ------------------------------------------------------------
@sensors_bp.get("/readings")
def list_readings():
    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        return jsonify(error="limit must be an integer"), 400

    device_id = request.args.get("device_id")
    sensor_type = request.args.get("sensor_type")

    q = SensorReading.query
    if device_id:
        q = q.filter_by(device_id=device_id)
    if sensor_type:
        q = q.filter_by(sensor_type=sensor_type)

    rows = q.order_by(SensorReading.timestamp.desc()).limit(limit).all()

    return jsonify([
        {
            "id": r.id,
            "device_id": r.device_id,
            "sensor_type": r.sensor_type,
            "value": r.value,
            "timestamp": r.timestamp.isoformat() + "Z",
            "created_at": r.created_at.isoformat() + "Z",
        }
        for r in rows
    ]), 200
