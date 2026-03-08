from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services.predictive_analytics_service import PredictiveAnalytics

predictive_bp = Blueprint("predictive", __name__, url_prefix="/api/predictive")

@predictive_bp.get("/predictive/breach_risk")
def breach_risk():
    """
    Threshold breach prediction overlay.
    Query:
      ?device_id=ESP32_01
      ?parameter=temperature
      ?hours_ahead=24
    """
    try:
        device_id = (request.args.get("device_id") or "").strip()
        parameter = (request.args.get("parameter") or "").strip()
        hours_ahead = int(request.args.get("hours_ahead") or 24)

        if not device_id or not parameter:
            return jsonify({"ok": False, "error": "device_id and parameter are required"}), 400

        hours_ahead = max(1, min(hours_ahead, 72))

        data = PredictiveAnalytics.predict_threshold_breach(
            device_id=device_id,
            parameter=parameter,
            hours_ahead=hours_ahead,
        )

        return jsonify({"ok": True, "data": data}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500

@predictive_bp.get("/predictive/forecast")
def forecast():
    """
    Forecast a sensor trend using recent readings.
    Query:
      ?device_id=ESP32_01
      ?parameter=temperature
      ?hours_ahead=6   (default 6)
    """
    try:
        device_id = (request.args.get("device_id") or "").strip()
        parameter = (request.args.get("parameter") or "").strip()
        hours_ahead = int(request.args.get("hours_ahead") or 6)

        if not device_id or not parameter:
            return jsonify({"ok": False, "error": "device_id and parameter are required"}), 400

        hours_ahead = max(1, min(hours_ahead, 72))

        pred = PredictiveAnalytics.predict_sensor_trend(
            device_id=device_id,
            parameter=parameter,
            hours_ahead=hours_ahead,
        )

        return jsonify(
            {
                "ok": True,
                "data": {
                    "device_id": pred.device_id,
                    "parameter": pred.parameter,
                    "predicted_value": pred.predicted_value,
                    "confidence": pred.confidence,
                    "prediction_horizon": pred.prediction_horizon,
                    "timestamp": pred.timestamp.isoformat(),
                    "rationale": pred.rationale,
                },
            }
        ), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500


@predictive_bp.get("/predictive/network_risk")
def network_risk():
    """
    Predict device failure risk based on alerts + last_seen + RSSI
    Query:
      ?device_id=ESP32_01
      ?lookback_days=7
    """
    try:
        device_id = (request.args.get("device_id") or "").strip()
        lookback_days = int(request.args.get("lookback_days") or 7)

        if not device_id:
            return jsonify({"ok": False, "error": "device_id is required"}), 400

        lookback_days = max(1, min(lookback_days, 90))

        res = PredictiveAnalytics.predict_network_failure(
            device_id=device_id, lookback_days=lookback_days
        )

        if isinstance(res, dict) and res.get("error"):
            return jsonify({"ok": False, "error": res["error"]}), 404

        return jsonify({"ok": True, "data": res}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500


@predictive_bp.get("/predictive/patterns")
def patterns():
    """
    Analyze daily patterns (peaks/troughs per hour-of-day).
    Query:
      ?device_id=ESP32_01
      ?parameter=temperature
      ?days=30
    """
    try:
        device_id = (request.args.get("device_id") or "").strip()
        parameter = (request.args.get("parameter") or "").strip()
        days = int(request.args.get("days") or 30)

        if not device_id or not parameter:
            return jsonify({"ok": False, "error": "device_id and parameter are required"}), 400

        days = max(1, min(days, 180))

        res = PredictiveAnalytics.analyze_seasonal_patterns(
            device_id=device_id, parameter=parameter, days=days
        )

        return jsonify({"ok": True, "data": res}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500


@predictive_bp.get("/predictive/maintenance")
def maintenance():
    """
    Fleet maintenance schedule suggestions.
    """
    try:
        res = PredictiveAnalytics.predict_maintenance_schedule()
        if isinstance(res, dict) and res.get("error"):
            return jsonify({"ok": False, "error": res["error"]}), 404
        return jsonify({"ok": True, "data": res}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500


@predictive_bp.get("/predictive/fleet_breach_scan")
def fleet_breach_scan():
    """
    Fleet early warning inbox.
    Query:
      ?parameter=temperature
      ?hours_ahead=24
      ?limit=50
      ?only_registered=1
    """
    try:
        parameter = (request.args.get("parameter") or "").strip()
        hours_ahead = int(request.args.get("hours_ahead") or 24)
        limit = int(request.args.get("limit") or 50)
        only_registered = (request.args.get("only_registered") or "1").strip() != "0"

        if not parameter:
            return jsonify({"ok": False, "error": "parameter is required"}), 400

        data = PredictiveAnalytics.fleet_breach_scan(
            parameter=parameter,
            hours_ahead=hours_ahead,
            limit=limit,
            only_registered=only_registered,
        )

        return jsonify({"ok": True, "data": data}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500



@predictive_bp.post("/predictive/alertify")
def alertify_predictive_breaches():
    """
    Create predictive alerts (AlertEvent) from imminent predicted breaches.

    Body JSON (or query params):
      parameter: temperature
      hours_ahead: 24
      eta_max_hours: 6
      limit: 200
      only_registered: true
      create_only_if_threshold_exists: true
    """
    try:
        body = request.get_json(silent=True) or {}

        def _arg(name, default=None):
            v = body.get(name)
            if v is None:
                v = request.args.get(name, default)
            return v

        parameter = (_arg("parameter", "") or "").strip()
        hours_ahead = int(_arg("hours_ahead", 24) or 24)
        eta_max_hours = int(_arg("eta_max_hours", 6) or 6)
        limit = int(_arg("limit", 200) or 200)

        only_registered_raw = _arg("only_registered", True)
        only_registered = (str(only_registered_raw).lower() not in ("0", "false", "no"))

        thr_only_raw = _arg("create_only_if_threshold_exists", True)
        create_only_if_threshold_exists = (str(thr_only_raw).lower() not in ("0", "false", "no"))

        if not parameter:
            return jsonify({"ok": False, "error": "parameter is required"}), 400

        data = PredictiveAnalytics.create_predictive_breach_alerts(
            parameter=parameter,
            hours_ahead=hours_ahead,
            eta_max_hours=eta_max_hours,
            limit=limit,
            only_registered=only_registered,
            create_only_if_threshold_exists=create_only_if_threshold_exists,
        )

        return jsonify({"ok": True, "data": data}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500


@predictive_bp.post("/predictive/auto_resolve")
def auto_resolve_predictive():
    """
    Auto-resolve predictive alerts that are no longer imminent.

    Body JSON (or query params):
      parameter: temperature
      hours_ahead: 24
      eta_max_hours: 6
      limit: 500
      resolve_if_no_threshold: true
      resolve_if_insufficient_data: true
    """
    try:
        body = request.get_json(silent=True) or {}

        def _arg(name, default=None):
            v = body.get(name)
            if v is None:
                v = request.args.get(name, default)
            return v

        parameter = (_arg("parameter", "") or "").strip()
        hours_ahead = int(_arg("hours_ahead", 24) or 24)
        eta_max_hours = int(_arg("eta_max_hours", 6) or 6)
        limit = int(_arg("limit", 500) or 500)

        no_thr_raw = _arg("resolve_if_no_threshold", True)
        resolve_if_no_threshold = (str(no_thr_raw).lower() not in ("0", "false", "no"))

        ins_raw = _arg("resolve_if_insufficient_data", True)
        resolve_if_insufficient_data = (str(ins_raw).lower() not in ("0", "false", "no"))

        if not parameter:
            return jsonify({"ok": False, "error": "parameter is required"}), 400

        data = PredictiveAnalytics.auto_resolve_predictive_alerts(
            parameter=parameter,
            hours_ahead=hours_ahead,
            eta_max_hours=eta_max_hours,
            limit=limit,
            resolve_if_no_threshold=resolve_if_no_threshold,
            resolve_if_insufficient_data=resolve_if_insufficient_data,
        )

        return jsonify({"ok": True, "data": data}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e) or "Server error"}), 500