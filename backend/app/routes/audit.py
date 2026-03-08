"""
Audit logging endpoints
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from app.models import AuditLog
from app.services.audit_service import AuditLogger

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit")

@audit_bp.get("/logs")
def get_audit_logs():
    """
    GET /api/audit/logs
    Retrieve audit logs with filtering
    
    Query parameters:
    - start: Start date (ISO format)
    - end: End date (ISO format)
    - resource_type: Filter by resource type
    - action_type: Filter by action type
    - actor_id: Filter by actor ID
    - limit: Maximum results (default: 100)
    """
    try:
        start_str = request.args.get("start")
        end_str = request.args.get("end")
        resource_type = request.args.get("resource_type")
        action_type = request.args.get("action_type")
        actor_id = request.args.get("actor_id")
        limit = int(request.args.get("limit", 100))
        
        start_date = None
        end_date = None
        
        if start_str:
            start_date = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        if end_str:
            end_date = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
        
        logs = AuditLogger.get_audit_logs(
            start_date=start_date,
            end_date=end_date,
            resource_type=resource_type,
            action_type=action_type,
            actor_id=actor_id,
            limit=limit
        )
        
        return jsonify({
            "ok": True,
            "count": len(logs),
            "data": logs
        }), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@audit_bp.get("/summary")
def get_audit_summary():
    """
    GET /api/audit/summary?days=7
    Get audit log summary for dashboard
    """
    try:
        days = int(request.args.get("days", 7))
        days = max(1, min(days, 365))  # Limit to 1 year
        
        summary = AuditLogger.get_audit_summary(days=days)
        return jsonify({"ok": True, "data": summary}), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@audit_bp.get("/activity")
def get_recent_activity():
    """
    GET /api/audit/activity
    Get recent system activity for dashboard
    """
    try:
        # Get logs from last 24 hours
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(hours=24)
        
        logs = AuditLogger.get_audit_logs(
            start_date=start_date,
            end_date=end_date,
            limit=50
        )
        
        # Format for activity feed
        activities = []
        for log in logs:
            activities.append({
                "id": log["id"],
                "action": log["action"],
                "description": f"{log['actor_type'].title()} {log['action'].lower()} {log['resource_type']}",
                "details": log.get("details", {}),
                "timestamp": log["created_at"],
                "status": log["status"],
                "resource_type": log["resource_type"],
                "actor": log["actor_id"] or log["actor_type"]
            })
        
        return jsonify({
            "ok": True,
            "count": len(activities),
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "data": activities
        }), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@audit_bp.get("/stats")
def get_audit_statistics():
    """
    GET /api/audit/stats
    Get audit log statistics
    """
    try:
        # Get logs from last 30 days
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        logs = AuditLog.query.filter(
            AuditLog.created_at >= start_date,
            AuditLog.created_at <= end_date
        ).all()
        
        if not logs:
            return jsonify({"ok": True, "data": {"message": "No audit logs found"}}), 200
        
        # Calculate daily activity
        daily_activity = {}
        for log in logs:
            date_key = log.created_at.date().isoformat() if log.created_at else "unknown"
            daily_activity[date_key] = daily_activity.get(date_key, 0) + 1
        
        # Get top resources
        resource_counts = {}
        for log in logs:
            resource = log.resource_type
            resource_counts[resource] = resource_counts.get(resource, 0) + 1
        
        # Get success rate
        success_count = sum(1 for log in logs if log.status == 'success')
        success_rate = (success_count / len(logs)) * 100
        
        return jsonify({
            "ok": True,
            "data": {
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                    "days": 30
                },
                "total_actions": len(logs),
                "success_rate": round(success_rate, 1),
                "daily_activity": [
                    {"date": date, "count": count}
                    for date, count in sorted(daily_activity.items())
                ],
                "top_resources": [
                    {"resource": resource, "count": count}
                    for resource, count in sorted(resource_counts.items(), 
                                                  key=lambda x: x[1], reverse=True)[:10]
                ],
                "summary": {
                    "avg_daily_actions": round(len(logs) / 30, 1),
                    "peak_day": max(daily_activity.values()) if daily_activity else 0,
                    "unique_resources": len(resource_counts)
                }
            }
        }), 200
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500