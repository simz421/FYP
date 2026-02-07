from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services.alerts_service import list_alerts
from app.services.recommendations_service import generate_recommendations_for_summary

recommendations_bp = Blueprint("recommendations", __name__)


@recommendations_bp.get("/recommendations/latest")
def latest_recommendations():
    """
    Returns recommendations for the latest active alerts.
    Optional filters:
      ?device_id=ESP32_01
      ?node_id=1
      ?limit=20
    """
    try:
        device_id = request.args.get("device_id")
        node_id = request.args.get("node_id")
        node_id = int(node_id) if node_id else None
        limit = int(request.args.get("limit") or 20)

        # active_only=True gets only unresolved active alerts
        alerts = list_alerts(device_id=device_id, node_id=node_id, parameter=None, active_only=True, acked_only=None, limit=limit)

        bundle = generate_recommendations_for_summary(alerts, limit=limit)
        return jsonify({"ok": True, "data": bundle}), 200

    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500
