from datetime import datetime
from flask import Blueprint, jsonify, request
from app.services.network_diagnostics_service import (
    NetworkDiagnostics,
    diagnose_network_bottlenecks
)
from app.services.configuration_service import DeviceConfiguration
from app.services.predictive_analytics_service import PredictiveAnalytics

network_mgmt_bp = Blueprint("network_management", __name__, url_prefix="/api/network")


# ============================================
# DIAGNOSTICS ENDPOINTS
# ============================================

@network_mgmt_bp.get("/diagnostics/ping/<string:device_id>")
def ping_device(device_id: str):
    """
    GET /api/network/diagnostics/ping/ESP32_01
    Ping a device to check connectivity.
    """
    try:
        result = NetworkDiagnostics.ping_device(device_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/diagnostics/traceroute/<string:device_id>")
def traceroute_to_gateway(device_id: str):
    """
    GET /api/network/diagnostics/traceroute/ESP32_01
    Trace network path from device to gateway.
    """
    try:
        result = NetworkDiagnostics.traceroute_to_gateway(device_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/diagnostics/bandwidth/<string:device_id>")
def bandwidth_test(device_id: str):
    """
    GET /api/network/diagnostics/bandwidth/ESP32_01
    Run bandwidth/latency test for a device.
    """
    try:
        result = NetworkDiagnostics.bandwidth_test_simulation(device_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/diagnostics/sweep")
def network_sweep():
    """
    GET /api/network/diagnostics/sweep
    Perform network-wide diagnostic sweep.
    """
    try:
        result = NetworkDiagnostics.network_sweep()
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 500
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/diagnostics/bottlenecks")
def network_bottlenecks():
    """
    GET /api/network/diagnostics/bottlenecks
    Identify network bottlenecks.
    """
    try:
        result = diagnose_network_bottlenecks()
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 500
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.post("/diagnostics/simulate-failure/<int:link_id>")
def simulate_link_failure(link_id: int):
    """
    POST /api/network/diagnostics/simulate-failure/1
    Simulate a link failure (for testing purposes).
    """
    try:
        result = NetworkDiagnostics.simulate_link_failure(link_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================
# CONFIGURATION MANAGEMENT ENDPOINTS
# ============================================

@network_mgmt_bp.get("/config/<string:device_id>")
def get_device_config(device_id: str):
    """
    GET /api/network/config/ESP32_01
    Get current configuration for a device.
    """
    try:
        result = DeviceConfiguration.get_device_config(device_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.put("/config/<string:device_id>")
def update_device_config(device_id: str):
    """
    PUT /api/network/config/ESP32_01
    Update device configuration.
    """
    try:
        config_updates = request.get_json(silent=True) or {}
        
        if not config_updates:
            return jsonify({"ok": False, "error": "No configuration provided"}), 400
        
        result = DeviceConfiguration.update_device_config(device_id, config_updates)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.post("/config/bulk")
def apply_bulk_config():
    """
    POST /api/network/config/bulk
    Apply configuration to multiple devices.
    """
    try:
        data = request.get_json(silent=True) or {}
        
        device_ids = data.get("device_ids", [])
        config_template = data.get("config", {})
        
        if not device_ids or not config_template:
            return jsonify({
                "ok": False,
                "error": "Both 'device_ids' and 'config' are required"
            }), 400
        
        result = DeviceConfiguration.apply_bulk_configuration(device_ids, config_template)
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/config/templates")
def get_config_templates():
    """
    GET /api/network/config/templates
    Get pre-defined configuration templates.
    """
    try:
        result = DeviceConfiguration.get_configuration_templates()
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/config/compliance/<string:device_id>")
def check_config_compliance(device_id: str):
    """
    GET /api/network/config/compliance/ESP32_01
    Check device configuration compliance.
    """
    try:
        result = DeviceConfiguration.check_config_compliance(device_id)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================
# PREDICTIVE ANALYTICS ENDPOINTS
# ============================================

@network_mgmt_bp.get("/predict/trend/<string:device_id>/<string:parameter>")
def predict_sensor_trend(device_id: str, parameter: str):
    """
    GET /api/network/predict/trend/ESP32_01/temperature?hours=6
    Predict future sensor readings.
    """
    try:
        hours = int(request.args.get("hours", 6))
        hours = max(1, min(hours, 72))  # Limit to 1-72 hours
        
        result = PredictiveAnalytics.predict_sensor_trend(device_id, parameter, hours)
        
        return jsonify({
            "ok": True,
            "data": {
                "device_id": result.device_id,
                "parameter": result.parameter,
                "predicted_value": round(result.predicted_value, 2),
                "confidence": result.confidence,
                "prediction_horizon": result.prediction_horizon,
                "rationale": result.rationale,
                "timestamp": result.timestamp.isoformat()
            }
        }), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/predict/failure/<string:device_id>")
def predict_device_failure(device_id: str):
    """
    GET /api/network/predict/failure/ESP32_01?days=7
    Predict device failure likelihood.
    """
    try:
        days = int(request.args.get("days", 7))
        days = max(1, min(days, 30))
        
        result = PredictiveAnalytics.predict_network_failure(device_id, days)
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 404
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/predict/patterns/<string:device_id>/<string:parameter>")
def analyze_seasonal_patterns(device_id: str, parameter: str):
    """
    GET /api/network/predict/patterns/ESP32_01/temperature?days=30
    Analyze daily/seasonal patterns.
    """
    try:
        days = int(request.args.get("days", 30))
        days = max(1, min(days, 365))
        
        result = PredictiveAnalytics.analyze_seasonal_patterns(device_id, parameter, days)
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@network_mgmt_bp.get("/predict/maintenance")
def predict_maintenance_schedule():
    """
    GET /api/network/predict/maintenance
    Predict optimal maintenance schedule.
    """
    try:
        result = PredictiveAnalytics.predict_maintenance_schedule()
        
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"]}), 500
        
        return jsonify({"ok": True, "data": result}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================
# NETWORK INTELLIGENCE DASHBOARD
# ============================================

@network_mgmt_bp.get("/intelligence/summary")
def network_intelligence_summary():
    """
    GET /api/network/intelligence/summary
    Comprehensive network intelligence summary.
    Combines diagnostics, predictions, and recommendations.
    """
    try:
        # Get diagnostics
        diagnostics = NetworkDiagnostics.network_sweep()
        
        # Get bottlenecks
        bottlenecks = diagnose_network_bottlenecks()
        
        # Get maintenance prediction
        maintenance = PredictiveAnalytics.predict_maintenance_schedule()
        
        # Combine into comprehensive report
        summary = {
            "timestamp": datetime.utcnow().isoformat(),
            "diagnostics": {
                "health_score": diagnostics.get("health_score", 0) if "error" not in diagnostics else 0,
                "issues_found": diagnostics.get("issues_found", 0) if "error" not in diagnostics else 0,
                "status": diagnostics.get("health_status", "unknown") if "error" not in diagnostics else "error"
            },
            "performance": {
                "bottlenecks": bottlenecks.get("bottlenecks_found", 0) if "error" not in bottlenecks else 0,
                "critical_bottlenecks": bottlenecks.get("summary", {}).get("critical_bottlenecks", 0) if "error" not in bottlenecks else 0
            },
            "maintenance": {
                "devices_needing_maintenance": maintenance.get("devices_needing_maintenance", 0) if "error" not in maintenance else 0,
                "high_priority": maintenance.get("priority_breakdown", {}).get("high", 0) if "error" not in maintenance else 0
            },
            "recommendations": []
        }
        
        # Generate recommendations
        if "error" not in diagnostics and diagnostics.get("health_score", 100) < 80:
            summary["recommendations"].append({
                "priority": "high",
                "action": "Run detailed network diagnostics to identify issues",
                "reason": f"Network health score is {diagnostics.get('health_score')}%"
            })
        
        if "error" not in bottlenecks and bottlenecks.get("bottlenecks_found", 0) > 0:
            summary["recommendations"].append({
                "priority": "medium",
                "action": "Address network bottlenecks to improve performance",
                "reason": f"Found {bottlenecks.get('bottlenecks_found')} potential bottlenecks"
            })
        
        if "error" not in maintenance and maintenance.get("devices_needing_maintenance", 0) > 0:
            summary["recommendations"].append({
                "priority": "medium",
                "action": "Schedule preventive maintenance for devices",
                "reason": f"{maintenance.get('devices_needing_maintenance')} devices need attention"
            })
        
        return jsonify({"ok": True, "data": summary}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500