from flask import Blueprint, request, jsonify

from app.services.alerts_service import (
    list_alerts_page,
    ack_alert,
    resolve_alert,
)
from app.services.alerts_summary_service import get_alert_summary
from app.services.alerts_summary_service import get_alert_trends

alerts_bp = Blueprint("alerts_bp", __name__, url_prefix="/api/alerts")


def _to_int(v):
    if v in (None, ""):
        return None
    return int(v)


# =========================
# GET /api/alerts
# =========================
@alerts_bp.get("")
def get_alerts():
    """
    List alerts (enterprise inbox).
    Filters (all optional):
      ?device_id=ESP32_01
      ?node_id=1
      ?parameter=temperature
      ?status=active|acked|resolved|all
      ?severity=BELOW_MIN|ABOVE_MAX
      ?level=WARNING|CRITICAL
      ?q=free text (message/device/parameter)
      ?limit=50
      ?offset=0

    Legacy flags still supported:
      ?active_only=true
      ?acked_only=true|false
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = request.args.get("parameter")

        # New enterprise filters
        status = (request.args.get("status") or "").strip().lower() or None
        severity = (request.args.get("severity") or "").strip().upper() or None
        level = (request.args.get("level") or "").strip().upper() or None
        q = (request.args.get("q") or "").strip() or None

        # Backward compatible flags
        active_only = (request.args.get("active_only") or "").lower() in {"1", "true", "yes"}

        acked_only_param = request.args.get("acked_only")
        acked_only = None
        if acked_only_param is not None:
            acked_only = acked_only_param.lower() in {"1", "true", "yes"}

        limit = int(request.args.get("limit") or 50)
        offset = int(request.args.get("offset") or 0)

        # If new 'status' is provided, it overrides legacy flags
        if status:
            if status == "active":
                active_only = True
                acked_only = None
            elif status == "acked":
                active_only = True
                acked_only = True
            elif status == "resolved":
                active_only = False
                acked_only = None
            elif status == "all":
                active_only = False
                acked_only = None
            else:
                return jsonify({"ok": False, "error": "Invalid status"}), 400

        items, total = list_alerts_page(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            active_only=active_only,
            acked_only=acked_only,
            severity=severity,
            level=level,
            q=q,
            limit=limit,
            offset=offset,
        )

        return jsonify({"ok": True, "count": int(total), "data": items}), 200

    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# POST /api/alerts/<id>/ack
# =========================
@alerts_bp.post("/<int:alert_id>/ack")
def post_ack_alert(alert_id: int):
    """
    Acknowledge an alert.
    Accepts payload:
      { "note": "..." }  OR  { "ack_note": "..." }
    """
    try:
        payload = request.get_json(silent=True) or {}
        note = payload.get("note", "")
        if not note:
            note = payload.get("ack_note", "")

        data = ack_alert(alert_id, note=note)
        return jsonify({"ok": True, "data": data}), 200
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# POST /api/alerts/<id>/resolve
# =========================
@alerts_bp.post("/<int:alert_id>/resolve")
def post_resolve_alert(alert_id: int):
    """
    Resolve an alert (ACTIVE -> resolved).
    """
    try:
        data = resolve_alert(alert_id)
        return jsonify({"ok": True, "data": data}), 200
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# GET /api/alerts/summary
# =========================
@alerts_bp.get("/summary")
def alerts_summary():
    """
    Dashboard summary endpoint.
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = request.args.get("parameter")

        data = get_alert_summary(device_id=device_id, node_id=node_id, parameter=parameter)
        return jsonify({"ok": True, "data": data}), 200
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500
    

# GET /api/alerts/trends
@alerts_bp.get("/trends")
def alerts_trends():
    try:
        hours = int(request.args.get("hours", 24))
        bucket_min = int(request.args.get("bucket_min", 60))

        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = request.args.get("parameter")

        data = get_alert_trends(
            hours=hours,
            bucket_min=bucket_min,
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500

    