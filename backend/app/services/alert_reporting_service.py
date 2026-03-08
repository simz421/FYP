from __future__ import annotations

from typing import Optional, Dict, Any, List
from sqlalchemy import func

from app.extensions import db
from app.models import AlertEvent


def get_alert_stats_for_period(
    *,
    start,
    end,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    limit_incidents: int = 20,
) -> Dict[str, Any]:
    """
    Summarize alerts created within [start, end] for reports.
    Uses AlertEvent.created_at (server-side time).
    """

    q = AlertEvent.query.filter(
        AlertEvent.created_at >= start,
        AlertEvent.created_at <= end,
    )

    if device_id:
        q = q.filter(AlertEvent.device_id == device_id)
    if node_id is not None:
        q = q.filter(AlertEvent.node_id == node_id)

    total = q.count()

    by_level_rows = (
        q.with_entities(AlertEvent.level, func.count(AlertEvent.id))
        .group_by(AlertEvent.level)
        .all()
    )
    by_level = {lvl: int(cnt) for (lvl, cnt) in by_level_rows}

    by_param_rows = (
        q.with_entities(AlertEvent.parameter, func.count(AlertEvent.id))
        .group_by(AlertEvent.parameter)
        .order_by(func.count(AlertEvent.id).desc())
        .all()
    )
    top_parameters = [{"parameter": p, "count": int(c)} for (p, c) in by_param_rows[:10]]

    incidents = (
        q.order_by(AlertEvent.created_at.desc())
        .limit(max(1, min(int(limit_incidents), 100)))
        .all()
    )

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "total_alerts": int(total),
        "by_level": {
            "WARNING": int(by_level.get("WARNING", 0)),
            "CRITICAL": int(by_level.get("CRITICAL", 0)),
        },
        "top_parameters": top_parameters,
        "incidents": [alert_incident_dict(a) for a in incidents],
    }


def alert_incident_dict(a: AlertEvent) -> Dict[str, Any]:
    min_v = float(a.min_value) if a.min_value is not None else None
    max_v = float(a.max_value) if a.max_value is not None else None
    value = float(a.value)

    if a.severity == "BELOW_MIN" and min_v is not None:
        distance = max(0.0, min_v - value)
    elif a.severity == "ABOVE_MAX" and max_v is not None:
        distance = max(0.0, value - max_v)
    else:
        distance = 0.0

    distance_pct = None
    if min_v is not None and max_v is not None and max_v > min_v:
        distance_pct = round((distance / (max_v - min_v)) * 100.0, 2)

    return {
        "id": a.id,
        "created_at": a.created_at.isoformat(),
        "device_id": a.device_id,
        "node_id": a.node_id,
        "parameter": a.parameter,
        "severity": a.severity,
        "level": getattr(a, "level", None),
        "value": value,
        "min_value": min_v,
        "max_value": max_v,
        "distance": round(distance, 4),
        "distance_pct": distance_pct,
        "message": a.message,
        "is_active": a.is_active,
        "is_acked": getattr(a, "is_acked", None),
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }
