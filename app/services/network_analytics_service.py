from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple

from sqlalchemy import func, and_, or_

from app.extensions import db
from app.models import Node, SensorReading, RouteEvent


def calculate_node_delivery_rate(
    device_id: str,
    hours: int = 24
) -> Dict[str, Any]:
    """
    Calculate data delivery success rate for a node.
    Formula: (Actual readings received) / (Expected readings based on heartbeat interval)
    
    Returns: {
        "device_id": "...",
        "period_hours": 24,
        "expected_readings": 100,
        "actual_readings": 95,
        "delivery_rate": 0.95,
        "delivery_rate_percent": "95.0%",
        "status": "Good" | "Warning" | "Poor"
    }
    """
    # Get the node
    node = Node.query.filter_by(device_id=device_id).first()
    if not node:
        return {"error": f"Node {device_id} not found"}
    
    # Calculate time window
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)
    
    # Count actual readings in this period
    actual_count = SensorReading.query.filter(
        SensorReading.device_id == device_id,
        SensorReading.timestamp >= start_time,
        SensorReading.timestamp <= end_time
    ).count()
    
    # Calculate expected readings based on heartbeat interval
    heartbeat_interval = node.heartbeat_interval_sec or 30
    total_seconds = hours * 3600
    expected_count = total_seconds // heartbeat_interval if heartbeat_interval > 0 else 0
    
    # Calculate delivery rate
    delivery_rate = actual_count / expected_count if expected_count > 0 else 0
    
    # Determine status
    if delivery_rate >= 0.95:
        status = "Good"
    elif delivery_rate >= 0.80:
        status = "Warning"
    else:
        status = "Poor"
    
    return {
        "device_id": device_id,
        "node_name": node.name,
        "period_hours": hours,
        "expected_readings": expected_count,
        "actual_readings": actual_count,
        "delivery_rate": round(delivery_rate, 3),
        "delivery_rate_percent": f"{delivery_rate * 100:.1f}%",
        "status": status,
        "heartbeat_interval_sec": heartbeat_interval,
        "calculation_window": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }


def calculate_network_health_summary(
    hours: int = 24
) -> Dict[str, Any]:
    """
    Calculate overall network health metrics for dashboard.
    """
    # Get all registered nodes
    nodes = Node.query.filter_by(is_registered=True).all()
    
    if not nodes:
        return {"error": "No registered nodes found"}
    
    # Calculate metrics for each node
    node_metrics = []
    total_expected = 0
    total_actual = 0
    online_count = 0
    
    for node in nodes:
        metrics = calculate_node_delivery_rate(node.device_id, hours)
        if "error" not in metrics:
            node_metrics.append(metrics)
            total_expected += metrics["expected_readings"]
            total_actual += metrics["actual_readings"]
        
        if node.status == "online":
            online_count += 1
    
    # Calculate network-wide delivery rate
    network_delivery = total_actual / total_expected if total_expected > 0 else 0
    
    # Count nodes by status
    offline_count = len(nodes) - online_count
    
    # Find nodes with poor performance (delivery < 80%)
    problem_nodes = [
        m for m in node_metrics 
        if m.get("delivery_rate", 1) < 0.80
    ]
    
    # Calculate average RSSI for online nodes
    avg_rssi = db.session.query(
        func.avg(Node.last_rssi)
    ).filter(
        Node.status == "online",
        Node.last_rssi.isnot(None)
    ).scalar() or 0
    
    return {
        "summary": {
            "total_nodes": len(nodes),
            "online_nodes": online_count,
            "offline_nodes": offline_count,
            "online_percentage": f"{(online_count / len(nodes)) * 100:.1f}%" if nodes else "0%",
            "network_delivery_rate": round(network_delivery, 3),
            "network_delivery_percent": f"{network_delivery * 100:.1f}%",
            "average_rssi": round(float(avg_rssi), 1),
            "problem_nodes_count": len(problem_nodes)
        },
        "node_metrics": node_metrics,
        "problem_nodes": [
            {
                "device_id": n["device_id"],
                "node_name": n["node_name"],
                "delivery_rate": n["delivery_rate_percent"],
                "status": n["status"]
            }
            for n in problem_nodes[:10]  # Limit to top 10
        ],
        "period_hours": hours,
        "calculated_at": datetime.utcnow().isoformat()
    }


def get_network_events_timeline(
    hours: int = 24,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get timeline of network events for visualization.
    Combines RouteEvents and node status changes.
    """
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)
    
    # Get route events
    route_events = RouteEvent.query.filter(
        RouteEvent.timestamp >= start_time,
        RouteEvent.timestamp <= end_time
    ).order_by(RouteEvent.timestamp.desc()).limit(limit).all()
    
    timeline = []
    
    for event in route_events:
        # Determine event type based on reason
        event_type = "info"
        if "OFFLINE" in event.reason:
            event_type = "error"
        elif "ONLINE" in event.reason:
            event_type = "success"
        elif "REGISTERED" in event.reason:
            event_type = "warning"
        
        timeline.append({
            "id": f"event_{event.id}",
            "timestamp": event.timestamp.isoformat(),
            "device_id": event.device_id,
            "event_type": event_type,
            "title": event.reason,
            "description": f"Device: {event.device_id}",
            "old_route": event.old_route,
            "new_route": event.new_route
        })
    
    # Sort by timestamp (newest first)
    timeline.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return timeline


def get_node_performance_history(
    device_id: str,
    days: int = 7
) -> Dict[str, Any]:
    """
    Get daily performance history for a node.
    Useful for trend analysis.
    """
    node = Node.query.filter_by(device_id=device_id).first()
    if not node:
        return {"error": f"Node {device_id} not found"}
    
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    
    history = []
    
    # For each day in the range
    current_date = start_date
    while current_date <= end_date:
        day_start = datetime(current_date.year, current_date.month, current_date.day)
        day_end = day_start + timedelta(days=1)
        
        # Count readings for this day
        count = SensorReading.query.filter(
            SensorReading.device_id == device_id,
            SensorReading.timestamp >= day_start,
            SensorReading.timestamp < day_end
        ).count()
        
        # Expected readings (based on 30 sec heartbeat = 2880/day)
        expected = 2880  # Default expectation
        
        history.append({
            "date": current_date.isoformat(),
            "day": current_date.strftime("%a"),
            "readings_count": count,
            "expected_readings": expected,
            "delivery_rate": count / expected if expected > 0 else 0
        })
        
        current_date += timedelta(days=1)
    
    return {
        "device_id": device_id,
        "node_name": node.name,
        "period_days": days,
        "history": history,
        "average_daily_readings": sum(h["readings_count"] for h in history) / len(history) if history else 0
    }