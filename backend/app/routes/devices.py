from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Node, RouteEvent
from app.services.audit_service import AuditLogger

devices_bp = Blueprint("devices", __name__, url_prefix="/api/devices")



def _to_int(v, default=None):
    try:
        if v is None or v == "":
            return default
        return int(v)
    except Exception:
        return default


def _to_float(v, default=None):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except Exception:
        return default


def node_to_dict(n: Node):
    return {
        "id": n.id,
        "device_id": n.device_id,
        "name": n.name,
        "node_type": n.node_type,
        "status": n.status,
        "ip_address": n.ip_address,
        "last_seen": n.last_seen.isoformat() if n.last_seen else None,
        "heartbeat_interval_sec": n.heartbeat_interval_sec,
        "is_registered": n.is_registered,
        "last_rssi": n.last_rssi,
    }

# =========================
# GET /api/devices
# =========================
@devices_bp.get("")
def list_devices():
    nodes = Node.query.order_by(Node.id.desc()).all()
    return jsonify({"ok": True, "data": [node_to_dict(n) for n in nodes]}), 200
# =========================
# POST /api/devices/register
# =========================

@devices_bp.post("/register")
def register_device():
    """
    Registers (or re-registers) a device.

    JSON body:
      {
        "device_id": "ESP32_01",
        "name": "Field Sensor 1",          # optional
        "node_type": "sensor",             # optional: sensor/gateway/server
        "ip_address": "192.168.1.50",      # optional
        "heartbeat_interval_sec": 30,      # optional
        "last_rssi": -65                   # optional
      }
    """
    try:
        data: Dict[str, Any] = request.get_json(silent=True) or {}

        device_id = (data.get("device_id") or "").strip()
        if not device_id:
            return jsonify({"ok": False, "error": "device_id is required"}), 400

        name = (data.get("name") or "").strip()
        node_type = (data.get("node_type") or "sensor").strip().lower()  # ✅ correct key
        ip_address = (data.get("ip_address") or "").strip() or None

        hb = _to_int(data.get("heartbeat_interval_sec"))
        rssi = _to_int(data.get("last_rssi"))  # ✅ integer

        node = Node.query.filter_by(device_id=device_id).first()
        is_new = node is None

        if is_new:
            node = Node()
            node.device_id = device_id
            node.name = name or device_id
            node.node_type = node_type
            node.status = "online"
            node.last_seen = datetime.utcnow()
            node.heartbeat_interval_sec = hb or 30
            node.is_registered = True
            node.last_rssi = rssi
            node.ip_address = ip_address
            db.session.add(node)

        else:
            # Refresh metadata on re-register
            if name:
                node.name = name
            if node_type:
                node.node_type = node_type
            node.ip_address = ip_address

            if hb is not None and hb > 0:
                node.heartbeat_interval_sec = hb
            if rssi is not None:
                node.last_rssi = rssi

            node.is_registered = True
            node.status = "online"
            node.last_seen = datetime.utcnow()

        # Log event (REGISTERED / RE-REGISTERED)
        db.session.add(
            RouteEvent(
                device_id=node.device_id,
                old_route=None,
                new_route=None,
                reason="REGISTERED" if is_new else "RE-REGISTERED",
                timestamp=datetime.utcnow(),
            )
        )

        db.session.commit()

        AuditLogger.log_device_registration(
            device_id=device_id,
             is_new=is_new,
             details={
             'name': node.name,
            'node_type': node.node_type,
            'ip_address': node.ip_address,
            'heartbeat_interval': node.heartbeat_interval_sec,
            'rssi': node.last_rssi
            }
        )

        return (
            jsonify(
                {
                    "ok": True,
                    "is_new": is_new,
                    "data": {
                        "id": node.id,
                        "device_id": node.device_id,
                        "name": node.name,
                        "node_type": node.node_type,
                        "status": node.status,
                        "last_seen": node.last_seen.isoformat() if node.last_seen else None,
                        "heartbeat_interval_sec": node.heartbeat_interval_sec,
                        "is_registered": node.is_registered,
                        "last_rssi": node.last_rssi,
                        "ip_address": node.ip_address,
                    },
                }
            ),
            201 if is_new else 200,
        )

    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500

    

# =========================
# POST /api/devices/heartbeat
# =========================
@devices_bp.post("/heartbeat")
def device_heartbeat():
    """
    Updates last_seen and keeps device online.
    Also increments packet counters for network analytics.

    JSON body:
      {
        "device_id": "ESP32_01",
        "last_rssi": -62,   # optional
        "packets_sent": 150 # optional (if device reports it)
      }
    """
    try:
        data: Dict[str, Any] = request.get_json(silent=True) or {}

        device_id = (data.get("device_id") or "").strip()
        if not device_id:
            return jsonify({"ok": False, "error": "device_id is required"}), 400

        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return jsonify({"ok": False, "error": "Device not registered"}), 404

        # Update RSSI if provided
        rssi = _to_int(data.get("last_rssi"))
        if rssi is not None:
            node.last_rssi = rssi

        # ===== NEW: Update packet counters =====
        # If device reports packets_sent, we can use it
        # Otherwise, we increment packets_received for each heartbeat
        # (assuming each heartbeat represents successful communication)
        
        # Increment packets_received (this is a network-level packet)
        node.packets_received = (node.packets_received or 0) + 1
        
        # If device provides its own packet count
        device_packets_sent = _to_int(data.get("packets_sent"))
        if device_packets_sent is not None:
            # Calculate missed packets
            if node.packets_received and device_packets_sent > node.packets_received:
                node.packets_missed = (node.packets_missed or 0) + (device_packets_sent - node.packets_received)
        # ===== END NEW =====

        # Update uptime if node is coming online
        if node.status != "online":
            node.status = "online"
        
        node.last_seen = datetime.utcnow()

        db.session.add(
            RouteEvent(
                device_id=node.device_id,  # ✅ FIXED: use string device_id
                old_route=None,
                new_route=None,
                reason="ONLINE",
                timestamp=datetime.utcnow(),
            )
        )

        db.session.commit()

        return jsonify({
            "ok": True, 
            "device_id": device_id, 
            "status": "online",
            "packets_received": node.packets_received
        }), 200

    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


