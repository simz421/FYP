from flask import Blueprint, request, jsonify
from app.services.alerts_service import list_alerts, ack_alert
from app.services.alerts_summary_service import get_alert_summary

alerts_bp = Blueprint("alerts_bp", __name__)


def _to_int(v):
    if v in (None, ""):
        return None
    return int(v)


# =========================
# GET /api/alerts
# =========================
@alerts_bp.get("/alerts")
def get_alerts():
    """
    List alerts.
    Filters:
      ?device_id=ESP32_01
      ?node_id=1
      ?parameter=temperature
      ?active_only=true
      ?acked_only=true | false
      ?limit=200
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        parameter = request.args.get("parameter")

        active_only = (request.args.get("active_only") or "").lower() in {"1", "true", "yes"}

        acked_only_param = request.args.get("acked_only")
        acked_only = None
        if acked_only_param is not None:
            acked_only = acked_only_param.lower() in {"1", "true", "yes"}

        limit = int(request.args.get("limit") or 200)

        data = list_alerts(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            active_only=active_only,
            acked_only=acked_only,
            limit=limit,
        )

        return jsonify({"ok": True, "count": len(data), "data": data}), 200

    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# POST /api/alerts/<id>/ack
# =========================
@alerts_bp.post("/alerts/<int:alert_id>/ack")
def post_ack_alert(alert_id: int):
    """
    Acknowledge an alert (ACTIVE -> ACKED).
    """
    try:
        payload = request.get_json(silent=True) or {}
        note = payload.get("note", "")
        data = ack_alert(alert_id, note=note)
        return jsonify({"ok": True, "data": data}), 200
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# GET /api/alerts/summary
# =========================
@alerts_bp.get("/alerts/summary")
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
