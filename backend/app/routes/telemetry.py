# app/routes/telemetry.py
from flask import Blueprint, jsonify, request

from app.services.telemetry import ingest_telemetry

bp = Blueprint("telemetry", __name__, url_prefix="/api/telemetry")


@bp.post("/readings")
def post_readings():
    payload = request.get_json(force=True) or {}
    status, body = ingest_telemetry(payload)
    return jsonify(body), status
