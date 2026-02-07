from __future__ import annotations

from typing import Optional, Dict, Any, List
from sqlalchemy import func

from app.extensions import db
from app.models import AlertEvent


def get_alert_summary(
    *,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Dashboard-friendly summary of alerts:
      - total alerts (active + all-time)
      - active count
      - active by level (WARNING/CRITICAL)
      - active by parameter
      - most recent alert timestamp
    """
    base = db.session.query(AlertEvent)

    if device_id:
        base = base.filter(AlertEvent.device_id == device_id)
    if node_id is not None:
        base = base.filter(AlertEvent.node_id == node_id)
    if parameter:
        base = base.filter(AlertEvent.parameter == parameter.strip().lower())

    total_count = base.count()

    active_q = base.filter(AlertEvent.is_active == True)  # noqa: E712
    active_count = active_q.count()

    # active by level
    level_rows = (
        active_q.with_entities(AlertEvent.level, func.count(AlertEvent.id))
        .group_by(AlertEvent.level)
        .all()
    )
    active_by_level = {lvl: int(cnt) for (lvl, cnt) in level_rows}

    # active by parameter
    param_rows = (
        active_q.with_entities(AlertEvent.parameter, func.count(AlertEvent.id))
        .group_by(AlertEvent.parameter)
        .order_by(func.count(AlertEvent.id).desc())
        .all()
    )
    active_by_parameter = [{"parameter": p, "count": int(c)} for (p, c) in param_rows]

    # most recent alert time (active or not)
    latest_time = (
        base.with_entities(func.max(AlertEvent.created_at))
        .scalar()
    )

    return {
        "scope": {
            "device_id": device_id,
            "node_id": node_id,
            "parameter": parameter.strip().lower() if parameter else None,
        },
        "total_alerts": int(total_count),
        "active_alerts": int(active_count),
        "active_by_level": {
            "WARNING": int(active_by_level.get("WARNING", 0)),
            "CRITICAL": int(active_by_level.get("CRITICAL", 0)),
        },
        "active_by_parameter": active_by_parameter,
        "latest_alert_created_at": latest_time.isoformat() if latest_time else None,
    }
