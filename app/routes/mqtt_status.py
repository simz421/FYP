# backend/app/routes/mqtt_status.py
from flask import Blueprint, current_app, jsonify

bp = Blueprint("mqtt_status", __name__, url_prefix="/api/mqtt")


@bp.get("/status")
def mqtt_status():
    svc = current_app.extensions.get("mqtt_service")
    if not svc:
        return jsonify({"connected": False, "error": "MQTT service not initialized"}), 500
    return jsonify(svc.status())