from __future__ import annotations

from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, case

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


def get_alert_trends(*, hours: int = 24, bucket_min: int = 60, device_id=None, node_id=None, parameter=None):
    """
    Returns time-bucketed counts for WARNING/CRITICAL in the last N hours.
    Works with SQLite.
    """
    hours = max(1, min(int(hours), 168))
    bucket_min = max(5, min(int(bucket_min), 360))

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    # SQLite-friendly bucket key: YYYY-MM-DD HH:00 (or HH:30 etc if bucket_min != 60)
    # We'll bucket by minute block:
    # bucket_index = floor((strftime('%s', created_at) / 60) / bucket_min) * bucket_min
    # then render back into ISO timestamp
    created_col = AlertEvent.created_at

    # seconds since epoch (SQLite strftime('%s', ...))
    epoch_sec = func.strftime('%s', created_col)

    bucket_index = (func.cast(epoch_sec, db.Integer) / 60) / bucket_min
    bucket_index = func.floor(bucket_index)

    bucket_minute = bucket_index * bucket_min

    # bucket timestamp = epoch_start + bucket_minute minutes
    # We'll return a string timestamp for frontend
    bucket_ts = func.datetime(bucket_minute * 60, 'unixepoch')

    qy = db.session.query(
        bucket_ts.label("ts"),
        func.count(AlertEvent.id).label("total"),
        func.sum(case((func.lower(AlertEvent.level) == "warning", 1), else_=0)).label("warning"),
        func.sum(case((func.lower(AlertEvent.level) == "critical", 1), else_=0)).label("critical"),
    ).filter(AlertEvent.created_at >= since)

    if device_id:
        qy = qy.filter(AlertEvent.device_id == device_id)
    if node_id is not None:
        qy = qy.filter(AlertEvent.node_id == node_id)
    if parameter:
        qy = qy.filter(AlertEvent.parameter == parameter.strip().lower())

    qy = qy.group_by("ts").order_by("ts")

    rows = qy.all()

    buckets = []
    totals = {"warning": 0, "critical": 0}

    for r in rows:
        w = int(r.warning or 0)
        c = int(r.critical or 0)
        t = int(r.total or 0)
        totals["warning"] += w
        totals["critical"] += c

        # r.ts is like "2026-02-23 08:00:00"
        buckets.append({
            "ts": str(r.ts).replace(" ", "T") + "Z",
            "total": t,
            "warning": w,
            "critical": c,
        })

    return {
        "since": since.isoformat(),
        "hours": hours,
        "bucket_min": bucket_min,
        "buckets": buckets,
        "totals": totals,
    }