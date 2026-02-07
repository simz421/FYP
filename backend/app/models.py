from datetime import datetime
from typing import Any

from .extensions import db


class SensorReading(db.Model):
    """
    Stores telemetry readings from devices.
    - device_id: external identifier used by ESP32/API
    - node_id: FK to Node for relational integrity
    - sensor_type: dynamic parameter name (temperature, humidity, soil_moisture, ph, light, etc.)
    """
    __tablename__ = "sensor_readings"

    id = db.Column(db.Integer, primary_key=True)

    device_id = db.Column(db.String(64), nullable=False, index=True)
    node_id = db.Column(db.Integer, db.ForeignKey("nodes.id"), nullable=True, index=True)

    sensor_type = db.Column(db.String(64), nullable=False, index=True)
    value = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(20))
    parameter = db.Column(db.String(50), nullable=False)
    # sampling time (from device if provided; otherwise server time)
    timestamp = db.Column(db.DateTime, nullable=False, index=True, default=datetime.utcnow)

    # server insert time (audit trail)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Optional relationship
    node = db.relationship("Node", backref=db.backref("readings", lazy=True))

    __table_args__ = (
        db.Index("ix_readings_device_sensor_time", "device_id", "sensor_type", "timestamp"),
        db.Index("ix_readings_node_sensor_time", "node_id", "sensor_type", "timestamp"),
    )

    # ✅ IMPORTANT: allow SQLAlchemy-style kwargs construction (fixes telemetry.py)
    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)


# Network Models
class Node(db.Model):
    __tablename__ = "nodes"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    node_type = db.Column(db.String(20))  # sensor, gateway, server
    status = db.Column(db.String(20), default="online")

    # Device lifecycle fields
    device_id = db.Column(db.String(80), unique=True, index=True)
    ip_address = db.Column(db.String(64))
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    heartbeat_interval_sec = db.Column(db.Integer, default=30)
    is_registered = db.Column(db.Boolean, default=False)
    last_rssi = db.Column(db.Integer)


class Link(db.Model):
    __tablename__ = "links"

    id = db.Column(db.Integer, primary_key=True)
    from_node = db.Column(db.Integer, db.ForeignKey("nodes.id"))
    to_node = db.Column(db.Integer, db.ForeignKey("nodes.id"))
    rssi = db.Column(db.Integer)  # signal strength
    latency = db.Column(db.Float)
    status = db.Column(db.String(20), default="up")


class RouteEvent(db.Model):
    """
    Persistent event/audit log used for:
    REGISTERED, ONLINE, OFFLINE, TELEMETRY_INGESTED, routing changes, etc.
    """
    __tablename__ = "route_events"

    id = db.Column(db.Integer, primary_key=True)

    # ✅ FIX: device_id should be STRING to match Node.device_id / telemetry payload
    device_id = db.Column(db.String(64), nullable=True, index=True)

    old_route = db.Column(db.String, nullable=True)
    new_route = db.Column(db.String, nullable=True)
    reason = db.Column(db.String, nullable=True)

    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Optional: keeps editors happy + allows kwargs construction
    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)


class SensorProfile(db.Model):
    """
    A declared sensor parameter that a device/node will report.
    Example: device ESP32_01 reports temperature and soil_moisture.
    """
    __tablename__ = "sensor_profiles"

    id = db.Column(db.Integer, primary_key=True)

    device_id = db.Column(db.String(64), nullable=False, index=True)
    node_id = db.Column(db.Integer, db.ForeignKey("nodes.id"), nullable=True, index=True)

    # parameter name/type (flexible)
    parameter = db.Column(db.String(64), nullable=False, index=True)

    unit = db.Column(db.String(16), nullable=True)  # optional e.g. "C", "%", "kPa"
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("device_id", "node_id", "parameter", name="uq_sensor_profile_scope_param"),
        db.Index("ix_sensor_profile_device_param", "device_id", "parameter"),
    )
    
    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)

class ThresholdRule(db.Model):
    """
    Min/Max thresholds per parameter.
    Supports scoping:
      - Global: device_id=NULL, node_id=NULL
      - Per device: device_id=..., node_id=NULL
      - Per node: node_id=...
    """
    __tablename__ = "threshold_rules"

    id = db.Column(db.Integer, primary_key=True)

    device_id = db.Column(db.String(64), nullable=True, index=True)
    node_id = db.Column(db.Integer, nullable=True, index=True)

    parameter = db.Column(db.String(64), nullable=False, index=True)

    min_value = db.Column(db.Float, nullable=True)
    max_value = db.Column(db.Float, nullable=True)

    is_enabled = db.Column(db.Boolean, default=True, nullable=False)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.Index("ix_threshold_scope_param", "device_id", "node_id", "parameter"),
    )
    
    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)

class AlertEvent(db.Model):
    """
    Persistent alerts when a reading violates thresholds.
    Lifecycle:
      ACTIVE -> ACKED -> RESOLVED (manual or auto)
    """
    __tablename__ = "alert_events"

    id = db.Column(db.Integer, primary_key=True)

    device_id = db.Column(db.String(64), nullable=False, index=True)
    node_id = db.Column(db.Integer, nullable=True, index=True)

    parameter = db.Column(db.String(64), nullable=False, index=True)

    reading_id = db.Column(db.Integer, db.ForeignKey("sensor_readings.id"), nullable=True, index=True)

    value = db.Column(db.Float, nullable=False)
    min_value = db.Column(db.Float, nullable=True)
    max_value = db.Column(db.Float, nullable=True)

    # BELOW_MIN | ABOVE_MAX
    severity = db.Column(db.String(16), nullable=False, index=True)

    # WARNING | CRITICAL
    level = db.Column(db.String(16), nullable=False, default="WARNING", index=True)

    message = db.Column(db.String(255), nullable=False)

    # lifecycle
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # acknowledgement
    is_acked = db.Column(db.Boolean, default=False, nullable=False, index=True)
    acked_at = db.Column(db.DateTime, nullable=True)
    ack_note = db.Column(db.String(255), nullable=True)

    # resolution
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by_reading_id = db.Column(db.Integer, db.ForeignKey("sensor_readings.id"), nullable=True, index=True)
    resolution_note = db.Column(db.String(255), nullable=True)
    
    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)