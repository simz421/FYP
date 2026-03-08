"""
System monitoring endpoints
"""
from flask import Blueprint, jsonify, request
from app.services.system_monitor import SystemMonitor

system_bp = Blueprint("system", __name__, url_prefix="/api/system")

@system_bp.get("/health")
def system_health():
    """
    GET /api/system/health
    Get comprehensive system health metrics
    """
    try:
        health_data = SystemMonitor.get_system_health()
        return jsonify({"ok": True, "data": health_data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@system_bp.get("/performance")
def system_performance():
    """
    GET /api/system/performance?hours=24
    Get system performance history
    """
    try:
        hours = int(request.args.get("hours", 24))
        hours = max(1, min(hours, 168))  # Limit 1-168 hours (1 week)
        
        performance_data = SystemMonitor.get_performance_history(hours)
        return jsonify({"ok": True, "data": performance_data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@system_bp.get("/services")
def service_health():
    """
    GET /api/system/services
    Check health of all system services
    """
    try:
        service_data = SystemMonitor.check_service_health()
        return jsonify({"ok": True, "data": service_data}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@system_bp.get("/metrics/summary")
def metrics_summary():
    """
    GET /api/system/metrics/summary
    Get key metrics summary for dashboard
    """
    try:
        health = SystemMonitor.get_system_health()
        
        summary = {
            "timestamp": health["timestamp"],
            "health_score": health["health_score"],
            "health_status": health["health_status"],
            "key_metrics": {
                "cpu_percent": health["cpu"]["percent"],
                "memory_percent": health["memory"]["percent"],
                "disk_percent": health["disk"]["percent"],
                "database_size_mb": health["database"]["size_mb"]
            },
            "alerts": [
                rec for rec in health.get("recommendations", [])
                if any(word in rec.lower() for word in ["high", "critical", "low", "attention"])
            ]
        }
        
        return jsonify({"ok": True, "data": summary}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500