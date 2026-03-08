from flask import Blueprint, jsonify, request
from app.services.network_analytics_service import (
    calculate_network_health_summary,
    calculate_node_delivery_rate,
    get_network_events_timeline,
    get_node_performance_history
)

network_bp = Blueprint("network", __name__, url_prefix="/api/network")


@network_bp.get("/health")
def network_health():
    """
    GET /api/network/health
    Returns overall network health summary.
    
    Optional query param: ?hours=24 (time window for analysis)
    """
    try:
        hours = int(request.args.get("hours", 24))
        hours = max(1, min(hours, 168))  # Limit to 1-168 hours (1 week)
        
        summary = calculate_network_health_summary(hours)
        
        return jsonify({
            "ok": True,
            "data": summary
        }), 200
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"Failed to calculate network health: {str(e)}"
        }), 500


@network_bp.get("/health/node/<string:device_id>")
def node_health(device_id: str):
    """
    GET /api/network/health/node/ESP32_01
    Returns detailed health metrics for a specific node.
    
    Optional query param: ?hours=24
    """
    try:
        hours = int(request.args.get("hours", 24))
        hours = max(1, min(hours, 168))
        
        metrics = calculate_node_delivery_rate(device_id, hours)
        
        if "error" in metrics:
            return jsonify({
                "ok": False,
                "error": metrics["error"]
            }), 404
        
        return jsonify({
            "ok": True,
            "data": metrics
        }), 200
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"Failed to calculate node health: {str(e)}"
        }), 500


@network_bp.get("/events")
def network_events():
    """
    GET /api/network/events
    Returns timeline of recent network events.
    
    Optional query params:
    - ?hours=24 (time window)
    - ?limit=50 (max events)
    """
    try:
        hours = int(request.args.get("hours", 24))
        hours = max(1, min(hours, 168))
        
        limit = int(request.args.get("limit", 50))
        limit = max(1, min(limit, 200))
        
        events = get_network_events_timeline(hours, limit)
        
        return jsonify({
            "ok": True,
            "count": len(events),
            "data": events
        }), 200
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"Failed to get network events: {str(e)}"
        }), 500


@network_bp.get("/performance/<string:device_id>")
def node_performance(device_id: str):
    """
    GET /api/network/performance/ESP32_01
    Returns historical performance data for trend analysis.
    
    Optional query param: ?days=7
    """
    try:
        days = int(request.args.get("days", 7))
        days = max(1, min(days, 30))  # Limit to 30 days
        
        history = get_node_performance_history(device_id, days)
        
        if "error" in history:
            return jsonify({
                "ok": False,
                "error": history["error"]
            }), 404
        
        return jsonify({
            "ok": True,
            "data": history
        }), 200
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"Failed to get performance history: {str(e)}"
        }), 500


@network_bp.get("/metrics")
def network_metrics():
    """
    GET /api/network/metrics
    Returns key network metrics for dashboard widgets.
    Lightweight version of /health endpoint.
    """
    try:
        summary = calculate_network_health_summary(24)
        
        if "error" in summary:
            return jsonify({"ok": False, "error": summary["error"]}), 500
        
        # Extract just the key metrics for dashboard widgets
        metrics = {
            "total_nodes": summary["summary"]["total_nodes"],
            "online_nodes": summary["summary"]["online_nodes"],
            "network_health": summary["summary"]["network_delivery_percent"],
            "avg_signal_strength": summary["summary"]["average_rssi"],
            "problem_nodes": summary["summary"]["problem_nodes_count"],
            "updated_at": summary["calculated_at"]
        }
        
        return jsonify({
            "ok": True,
            "data": metrics
        }), 200
        
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": f"Failed to get network metrics: {str(e)}"
        }), 500