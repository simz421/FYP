from datetime import datetime
from typing import Any, Dict, List, Tuple

from app.extensions import db
from app.models import Node, SensorReading, RouteEvent  # RouteEvent exists
from app.services.alerts_service import evaluate_reading  # evaluator (auto-resolve + levels)
from app.services.websocket_service import broadcast_new_reading, broadcast_new_alert
from app.services.audit_service import AuditLogger

def _parse_timestamp(ts: Any) -> datetime:
    """
    Accepts:
    - None -> utcnow
    - ISO8601 string -> datetime
    - Unix epoch (int/float) -> datetime
    """
    if ts is None:
        return datetime.utcnow()

    if isinstance(ts, (int, float)):
        return datetime.utcfromtimestamp(ts)

    if isinstance(ts, str):
        s = ts.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(s).replace(tzinfo=None)
        except ValueError:
            raise ValueError("Invalid timestamp format. Use ISO8601 or epoch seconds.")

    raise ValueError("Invalid timestamp type.")


def _get_registered_node(device_id: str) -> Node:
    node = Node.query.filter_by(device_id=device_id).first()
    if not node or not getattr(node, "is_registered", False):
        raise PermissionError("Device not registered.")
    return node


def _normalize_parameter(sensor_type: Any) -> str:
    """
    sensor_type is your dynamic 'parameter' name.
    """
    p = (sensor_type or "").strip().lower()
    if not p:
        raise ValueError("sensor_type (parameter) is required")
    if len(p) > 64:
        raise ValueError("sensor_type too long (max 64 chars)")
    return p


def ingest_telemetry(payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """
    Payload shapes:
    1) Single:
       { "device_id": "...", "sensor_type": "temperature", "value": 25.4, "unit":"C", "timestamp": "..." }

    2) Batch:
       { "device_id": "...", "readings": [ {..}, {..} ] }
    """
    device_id = (payload.get("device_id") or "").strip()
    if not device_id:
        return 400, {"error": "device_id is required"}

    # Validate registration
    try:
        node = _get_registered_node(device_id)
    except PermissionError as e:
        return 403, {"error": str(e)}

    readings: List[Dict[str, Any]]
    if isinstance(payload.get("readings"), list):
        readings = payload["readings"]
    else:
        readings = [payload]

    if not readings:
        return 400, {"error": "No readings provided"}

    to_insert: List[SensorReading] = []
    rejected: List[Dict[str, Any]] = []

    for r in readings:
        sensor_type_raw = r.get("sensor_type")
        raw_value = r.get("value", None)
        ts = r.get("timestamp", None)
        unit = r.get("unit", None)

        try:
            sensor_type = _normalize_parameter(sensor_type_raw)
        except ValueError as e:
            rejected.append({"reading": r, "reason": str(e)})
            continue

        if raw_value is None:
            rejected.append({"reading": r, "reason": "value is required"})
            continue

        try:
            value_f = float(raw_value)
        except (TypeError, ValueError):
            rejected.append({"reading": r, "reason": "value must be numeric"})
            continue

        try:
            dt = _parse_timestamp(ts)
        except ValueError as e:
            rejected.append({"reading": r, "reason": str(e)})
            continue

        # ✅ IMPORTANT FIX:
        # Your SensorReading model has BOTH:
        #   sensor_type (dynamic parameter)
        #   parameter (NOT NULL)
        # So we set parameter = sensor_type to satisfy the schema.
        to_insert.append(
            SensorReading(
                device_id=device_id,
                node_id=node.id,
                sensor_type=sensor_type,
                parameter=sensor_type,   # ✅ FIX for NOT NULL column
                value=value_f,
                unit=unit,
                timestamp=dt,
            )
        )

    if not to_insert and rejected:
        return 400, {"error": "All readings rejected", "rejected": rejected}

    # Save telemetry
    db.session.add_all(to_insert)

    # Audit trail
    db.session.add(
        RouteEvent(
            device_id=device_id,  # ✅ string matches your models.py
            old_route=None,
            new_route=None,
            reason=f"TELEMETRY_INGESTED count={len(to_insert)} rejected={len(rejected)}",
            timestamp=datetime.utcnow(),
        )
    )

    db.session.commit()  # ensures SensorReading IDs exist
    # Add WebSocket broadcasting
    for reading in to_insert:
        broadcast_data = {
            'device_id': reading.device_id,
            'node_id': reading.node_id,
            'parameter': reading.sensor_type,
            'value': float(reading.value),
            'unit': reading.unit,
            'timestamp': reading.timestamp.isoformat() if reading.timestamp else None,
            'reading_id': reading.id
        }
        broadcast_new_reading(broadcast_data)

    AuditLogger.log_telemetry_ingestion(
    device_id=device_id,
    count=len(to_insert),
    details={
        'readings_count': len(to_insert),
        'rejected_count': len(rejected),
        'parameters': list(set([r.sensor_type for r in to_insert]))
    }
    )
    
    # ✅ Alert evaluation hook
    evaluations = []
    for reading in to_insert:
        try:
            evaluations.append(evaluate_reading(reading, auto_resolve=True))
        except Exception as e:
            # Alerts must NEVER break ingestion
            evaluations.append({"created": None, "resolved": [], "skipped": True, "reason": f"alert_eval_failed: {e}"})

    return 201, {
        "status": "ok",
        "device_id": device_id,
        "inserted": len(to_insert),
        "rejected": rejected,
        "evaluations": evaluations,  # useful for testing
    }
