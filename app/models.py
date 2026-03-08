from datetime import datetime
from typing import Any, Dict  # Add Dict import here
import json  # Add json import here

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
        db.Index('ix_sensor_reading_created_at_desc', db.desc('created_at')),
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

    # ===== NEW NETWORK METRICS FIELDS =====
    packets_received = db.Column(db.Integer, default=0)  # Total telemetry packets received
    packets_missed = db.Column(db.Integer, default=0)    # Estimated missed packets
    uptime_seconds = db.Column(db.Integer, default=0)    # Cumulative uptime
    # ===== END NEW FIELDS =====


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

# Add to app/models.py

class AuditLog(db.Model):
    """
    System audit log for tracking all significant actions
    """
    __tablename__ = "audit_logs"
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Action details
    action_type = db.Column(db.String(64), nullable=False, index=True)  # CREATE, UPDATE, DELETE, LOGIN, etc.
    action = db.Column(db.String(255), nullable=False)  # Human-readable description
    resource_type = db.Column(db.String(64), nullable=False, index=True)  # device, reading, alert, user
    resource_id = db.Column(db.String(64), index=True)  # ID of the affected resource
    
    # User/actor information
    actor_type = db.Column(db.String(32), default='system')  # system, user, device, api
    actor_id = db.Column(db.String(64), index=True)  # user_id, device_id, api_key
    
    # Context
    ip_address = db.Column(db.String(45))  # IPv4 or IPv6
    user_agent = db.Column(db.Text)
    request_method = db.Column(db.String(10))  # GET, POST, PUT, DELETE  # Fixed: Added comment symbol
    request_path = db.Column(db.String(255))
    
    # Details
    details = db.Column(db.Text)  # JSON string with detailed changes
    status = db.Column(db.String(20), default='success')  # success, failure, warning
    error_message = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    duration_ms = db.Column(db.Integer)  # How long the action took
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "action_type": self.action_type,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "actor_type": self.actor_type,
            "actor_id": self.actor_id,
            "ip_address": self.ip_address,
            "request_method": self.request_method,
            "request_path": self.request_path,
            "status": self.status,
            "details": json.loads(self.details) if self.details else {},
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "duration_ms": self.duration_ms
        }