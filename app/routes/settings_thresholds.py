from __future__ import annotations

from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request

from app.services.thresholds_service import (
    upsert_threshold_rule,
    list_threshold_rules,
)

# ✅ IMPORTANT: Align with your API convention
# This makes the endpoints:
#   PUT  /api/settings/thresholds
#   GET  /api/settings/thresholds
settings_thresholds_bp = Blueprint(
    "settings_thresholds",
    __name__,
    url_prefix="/api/settings/thresholds",
)

# -------------------------
# Helpers
# -------------------------

def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)

def _to_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    return float(v)

def _normalize_parameter(p: Any) -> str:
    if p is None:
        raise ValueError("parameter is required")
    p2 = str(p).strip().lower()
    if not p2:
        raise ValueError("parameter is required")
    if len(p2) > 64:
        raise ValueError("parameter too long (max 64)")
    return p2

# =========================
# PUT /api/settings/thresholds
# =========================
@settings_thresholds_bp.put("")
def put_threshold():
    """
    Create or update a threshold rule.

    Query scope:
      - device_id (optional)
      - node_id   (optional)

    Body JSON:
      {
        "parameter": "temperature",
        "min_value": 10,
        "max_value": 35,
        "is_enabled": true
      }
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))

        payload: Dict[str, Any] = request.get_json(silent=True) or {}

        parameter = _normalize_parameter(payload.get("parameter"))
        min_value = _to_float(payload.get("min_value"))
        max_value = _to_float(payload.get("max_value"))
        is_enabled = bool(payload.get("is_enabled", True))

        data = upsert_threshold_rule(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            min_value=min_value,
            max_value=max_value,
            is_enabled=is_enabled,
        )

        return jsonify(
            {
                "ok": True,
                "scope": {"device_id": device_id, "node_id": node_id},
                "data": data,
            }
        ), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# GET /api/settings/thresholds
# =========================
@settings_thresholds_bp.get("")
def get_thresholds():
    """
    List threshold rules (optionally filtered).

    Optional query params:
      - device_id
      - node_id
      - parameter
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        param_raw = request.args.get("parameter")

        parameter: Optional[str] = None
        if param_raw:
            parameter = _normalize_parameter(param_raw)

        rows = list_threshold_rules(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
        )

        return jsonify(
            {
                "ok": True,
                "count": len(rows),
                "data": rows,
            }
        ), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500