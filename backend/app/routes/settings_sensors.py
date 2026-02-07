from __future__ import annotations

from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from app.extensions import db
from app.models import SensorProfile, Node

settings_sensors_bp = Blueprint(
    "settings_sensors",
    __name__,
    url_prefix="/api/settings/sensors",
)

# -------------------------
# Helpers
# -------------------------
def _to_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)

def _normalize_device_id(v: Any) -> str:
    if v is None:
        raise ValueError("device_id is required")
    s = str(v).strip()
    if not s:
        raise ValueError("device_id is required")
    if len(s) > 64:
        raise ValueError("device_id too long (max 64)")
    return s

def _normalize_parameter(v: Any) -> str:
    if v is None:
        raise ValueError("parameter is required")
    s = str(v).strip().lower()
    if not s:
        raise ValueError("parameter is required")
    if len(s) > 64:
        raise ValueError("parameter too long (max 64)")
    return s

def _normalize_unit(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None

def profile_to_dict(p: SensorProfile) -> Dict[str, Any]:
    return {
        "id": p.id,
        "device_id": p.device_id,
        "node_id": p.node_id,
        "parameter": p.parameter,
        "unit": p.unit,
        "is_enabled": p.is_enabled,
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
    }

# =========================
# GET /api/settings/sensors
# =========================
@settings_sensors_bp.get("")
def list_profiles():
    """
    Optional query params:
      - device_id
      - node_id
      - parameter
    """
    try:
        device_id = (request.args.get("device_id") or "").strip()
        node_id = _to_int(request.args.get("node_id"))
        parameter = (request.args.get("parameter") or "").strip().lower()

        q = SensorProfile.query
        if device_id:
            q = q.filter(SensorProfile.device_id == device_id)
        if node_id is not None:
            q = q.filter(SensorProfile.node_id == node_id)
        if parameter:
            q = q.filter(SensorProfile.parameter == parameter)

        rows = q.order_by(SensorProfile.id.desc()).all()
        return jsonify({"ok": True, "count": len(rows), "data": [profile_to_dict(r) for r in rows]}), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500

# ==========================
# POST /api/settings/sensors
# ==========================
@settings_sensors_bp.post("")
def create_or_update_profile():
    """
    JSON body:
      {
        "device_id": "ESP32_02",
        "parameter": "temperature",
        "unit": "°C",
        "node_id": 1,              # optional
        "enabled": true            # optional (alias)
        "is_enabled": true         # optional (preferred)
      }
    """
    try:
        data: Dict[str, Any] = request.get_json(silent=True) or {}

        device_id = _normalize_device_id(data.get("device_id"))
        parameter = _normalize_parameter(data.get("parameter"))
        unit = _normalize_unit(data.get("unit"))

        node_id = data.get("node_id")
        if node_id is not None:
            node_id = int(node_id)

        # accept either "is_enabled" or "enabled"
        is_enabled = data.get("is_enabled", data.get("enabled", True))
        is_enabled = bool(is_enabled)

        # Validate: device must exist
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return jsonify({"ok": False, "error": "Device not found. Register device first."}), 404

        # Upsert: same device + parameter (+ node_id scope if you want)
        q = SensorProfile.query.filter_by(device_id=device_id, parameter=parameter)
        if node_id is None:
            q = q.filter(SensorProfile.node_id.is_(None))
        else:
            q = q.filter(SensorProfile.node_id == node_id)

        existing = q.first()
        if existing:
            existing.unit = unit
            existing.is_enabled = is_enabled
            existing.node_id = node_id
            db.session.commit()
            return jsonify({"ok": True, "updated": True, "data": profile_to_dict(existing)}), 200

        p = SensorProfile(
            device_id=device_id,
            parameter=parameter,
            unit=unit,
            node_id=node_id,
            is_enabled=is_enabled,
        )
        db.session.add(p)
        db.session.commit()
        return jsonify({"ok": True, "data": profile_to_dict(p)}), 201

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500

# ===================================
# PATCH /api/settings/sensors/<id>
# ===================================
@settings_sensors_bp.patch("/<int:profile_id>")
def update_profile(profile_id: int):
    data: Dict[str, Any] = request.get_json(silent=True) or {}
    p = SensorProfile.query.get(profile_id)
    if not p:
        return jsonify({"ok": False, "error": "Profile not found"}), 404

    if "unit" in data:
        p.unit = _normalize_unit(data.get("unit"))
    if "is_enabled" in data or "enabled" in data:
        p.is_enabled = bool(data.get("is_enabled", data.get("enabled")))
    if "node_id" in data:
        v = data.get("node_id")
        p.node_id = int(v) if v not in (None, "") else None

    db.session.commit()
    return jsonify({"ok": True, "data": profile_to_dict(p)}), 200

# ===================================
# DELETE /api/settings/sensors/<id>
# ===================================
@settings_sensors_bp.delete("/<int:profile_id>")
def delete_profile(profile_id: int):
    p = SensorProfile.query.get(profile_id)
    if not p:
        return jsonify({"ok": False, "error": "Profile not found"}), 404

    db.session.delete(p)
    db.session.commit()
    return jsonify({"ok": True}), 200
