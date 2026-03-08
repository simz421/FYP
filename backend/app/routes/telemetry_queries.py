from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from app.services.telemetry_queries import (
    get_latest_readings,
    get_range_readings,
    get_aggregated_series,
    parse_range_params,
)

# NOTE:
# - Keep blueprint WITHOUT url_prefix here if you register with url_prefix="/api" in app factory.
# - If you do NOT add a prefix when registering, set url_prefix="/api" here instead.
telemetry_query_bp = Blueprint("telemetry_query_bp", __name__)


# -------------------------
# Helpers
# -------------------------

def _int_param(name: str, default: int = 0) -> int:
    v = request.args.get(name, None)
    if v is None or v == "":
        return default
    return int(v)


def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)


def _normalize_parameter() -> Optional[str]:
    """
    Backward-compatible:
      - accept parameter=...
      - accept sensor_type=... (old naming)
    """
    p = request.args.get("parameter")
    if not p:
        p = request.args.get("sensor_type")  # backward compatible
    if not p:
        return None
    p = p.strip().lower()
    return p or None


def _bucket_to_minutes(bucket: str) -> int:
    b = (bucket or "").strip().lower()
    if b == "minute":
        return 1
    if b == "hour":
        return 60
    if b == "day":
        return 1440
    # default to hour
    return 60


def _truthy(v: Optional[str]) -> bool:
    if v is None:
        return False
    return v.strip().lower() in {"1", "true", "yes", "y", "on"}


# =========================
# GET /api/telemetry/latest
# =========================
@telemetry_query_bp.get("/telemetry/latest")
def telemetry_latest():
    """
    Dashboard options:
      - latest across everything:
          /api/telemetry/latest?limit=50

      - filter by device:
          /api/telemetry/latest?device_id=ESP32_01

      - filter by node:
          /api/telemetry/latest?node_id=1

      - filter by parameter (dynamic):
          /api/telemetry/latest?parameter=ph
        (also supports old query name: sensor_type=ph)

      - per-parameter latest cards:
          /api/telemetry/latest?mode=per_sensor&device_id=ESP32_01
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = _normalize_parameter()
        limit = _int_param("limit", 50)
        mode = (request.args.get("mode") or "").strip().lower()

        # Base fetch
        data = get_latest_readings(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            limit=limit if mode != "per_sensor" else max(limit, 200),
        )

        # Optional: per-parameter latest summary
        if mode == "per_sensor":
            latest_by_param: Dict[str, Dict[str, Any]] = {}
            for r in data:
                p = (r.get("sensor_type") or "").strip().lower()
                if p and p not in latest_by_param:
                    latest_by_param[p] = r
            out = list(latest_by_param.values())
            return jsonify({"ok": True, "mode": "per_sensor", "count": len(out), "data": out}), 200

        return jsonify({"ok": True, "count": len(data), "data": data}), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# GET /api/telemetry/range
# =========================
@telemetry_query_bp.get("/telemetry/range")
def telemetry_range():
    """
    Raw readings in a time range:
      /api/telemetry/range?start=2026-01-24T00:00:00&end=2026-01-24T23:59:59&parameter=temperature

    Aggregated series:
      /api/telemetry/range?start=...&end=...&parameter=temperature&aggregate=true&bucket=hour

    Params:
      device_id, node_id
      parameter (or sensor_type)
      start, end (ISO)
      aggregate=true/false
      bucket=minute|hour|day   (only when aggregate=true)
      limit (raw mode only)
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = _normalize_parameter()

        start_str = request.args.get("start")
        end_str = request.args.get("end")
        if not start_str or not end_str:
            raise ValueError("start and end are required (ISO8601)")

        start, end = parse_range_params(start_str, end_str)

        aggregate = _truthy(request.args.get("aggregate"))
        if aggregate:
            bucket = (request.args.get("bucket") or "hour").strip().lower()
            bucket_minutes = _bucket_to_minutes(bucket)

            series = get_aggregated_series(
                start=start,
                end=end,
                bucket_minutes=bucket_minutes,
                device_id=device_id,
                node_id=node_id,
                parameter=parameter,
            )

            return jsonify(
                {
                    "ok": True,
                    "mode": "aggregated",
                    "bucket": bucket,
                    "bucket_minutes": bucket_minutes,
                    "parameter": parameter,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "count": len(series),
                    "data": series,
                }
            ), 200

        # Raw readings mode
        limit = _int_param("limit", 5000)
        readings = get_range_readings(
            start=start,
            end=end,
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            limit=limit,
        )

        return jsonify(
            {
                "ok": True,
                "mode": "raw",
                "parameter": parameter,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "count": len(readings),
                "data": readings,
            }
        ), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500
