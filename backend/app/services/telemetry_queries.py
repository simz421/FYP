from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, cast, func, Float, Integer

from app.extensions import db
from app.models import SensorReading


# -----------------------------
# Helpers
# -----------------------------

def _parse_iso_datetime(s: str) -> datetime:
    """
    Parses ISO8601 date/time strings.
    Accepts:
      - "2026-01-24"
      - "2026-01-24T12:30:00"
      - "2026-01-24T12:30:00Z"
      - "2026-01-24T12:30:00+00:00"
    Returns naive datetime (UTC-ish, consistent with your server storage).
    """
    if not s or not isinstance(s, str):
        raise ValueError("Invalid datetime string")

    s = s.strip()
    if len(s) == 10:  # YYYY-MM-DD
        return datetime.fromisoformat(s)

    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except ValueError:
        raise ValueError("Invalid datetime format. Use ISO8601.")


def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)


def _normalize_parameter(p: Optional[str]) -> Optional[str]:
    if p is None:
        return None
    p = p.strip().lower()
    return p or None


@dataclass
class QueryFilters:
    device_id: Optional[str] = None
    node_id: Optional[int] = None
    parameter: Optional[str] = None  # dynamic parameter name (sensor_type)


def _validate_filters(filters: QueryFilters) -> None:
    # Dynamic parameters: we do NOT restrict sensor_type anymore.
    if filters.device_id and len(filters.device_id) > 64:
        raise ValueError("device_id is too long (max 64)")
    if filters.node_id is not None and filters.node_id <= 0:
        raise ValueError("node_id must be a positive integer")
    if filters.parameter and len(filters.parameter) > 64:
        raise ValueError("parameter is too long (max 64)")


def reading_to_dict(r: SensorReading) -> Dict[str, Any]:
    return {
        "id": r.id,
        "device_id": r.device_id,
        "node_id": r.node_id,
        "sensor_type": r.sensor_type,
        "value": float(r.value),
        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
    }


def parse_range_params(start_str: str, end_str: str) -> Tuple[datetime, datetime]:
    start = _parse_iso_datetime(start_str)
    end = _parse_iso_datetime(end_str)
    if end < start:
        raise ValueError("end must be >= start")
    return start, end


# -----------------------------
# Queries
# -----------------------------

def get_latest_readings(
    *,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Returns most recent readings (for dashboard "latest" widgets).
    """
    filters = QueryFilters(
        device_id=(device_id.strip() if device_id else None),
        node_id=node_id,
        parameter=_normalize_parameter(parameter),
    )
    _validate_filters(filters)

    q = SensorReading.query

    if filters.device_id:
        q = q.filter(SensorReading.device_id == filters.device_id)
    if filters.node_id is not None:
        q = q.filter(SensorReading.node_id == filters.node_id)
    if filters.parameter:
        q = q.filter(SensorReading.sensor_type == filters.parameter)

    q = q.order_by(SensorReading.timestamp.desc()).limit(max(1, min(int(limit), 500)))

    return [reading_to_dict(r) for r in q.all()]


def get_range_readings(
    *,
    start: datetime,
    end: datetime,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
    limit: int = 5000,
) -> List[Dict[str, Any]]:
    """
    Returns readings within a time window (for charts).
    """
    filters = QueryFilters(
        device_id=(device_id.strip() if device_id else None),
        node_id=node_id,
        parameter=_normalize_parameter(parameter),
    )
    _validate_filters(filters)

    q = SensorReading.query.filter(
        SensorReading.timestamp >= start,
        SensorReading.timestamp <= end,
    )

    if filters.device_id:
        q = q.filter(SensorReading.device_id == filters.device_id)
    if filters.node_id is not None:
        q = q.filter(SensorReading.node_id == filters.node_id)
    if filters.parameter:
        q = q.filter(SensorReading.sensor_type == filters.parameter)

    q = q.order_by(SensorReading.timestamp.asc()).limit(max(1, min(int(limit), 50000)))

    return [reading_to_dict(r) for r in q.all()]


def get_aggregated_series(
    *,
    start: datetime,
    end: datetime,
    bucket_minutes: int = 60,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Aggregates readings into time buckets (avg/min/max/count per bucket).
    SQLite-safe bucketing via unix epoch math.

    Returns:
      [
        {"bucket_start": "...", "avg": 12.3, "min": 10.0, "max": 15.1, "count": 5},
        ...
      ]
    """
    if bucket_minutes <= 0:
        raise ValueError("bucket_minutes must be > 0")

    filters = QueryFilters(
        device_id=(device_id.strip() if device_id else None),
        node_id=node_id,
        parameter=_normalize_parameter(parameter),
    )
    _validate_filters(filters)

    interval_sec = int(bucket_minutes) * 60

    # SQLite: strftime('%s', timestamp) gives unix epoch seconds as string
    epoch_sec = cast(func.strftime("%s", SensorReading.timestamp), Integer)

    # bucket_epoch = (epoch_sec / interval_sec) * interval_sec
    bucket_epoch = (epoch_sec / interval_sec) * interval_sec

    # bucket_start as ISO-like string
    # func.datetime(bucket_epoch, 'unixepoch') -> 'YYYY-MM-DD HH:MM:SS'
    bucket_start = func.datetime(bucket_epoch, "unixepoch").label("bucket_start")

    q = db.session.query(
        bucket_start,
        cast(func.avg(SensorReading.value), Float).label("avg_value"),
        cast(func.min(SensorReading.value), Float).label("min_value"),
        cast(func.max(SensorReading.value), Float).label("max_value"),
        cast(func.count(SensorReading.id), Integer).label("count"),
    ).filter(
        SensorReading.timestamp >= start,
        SensorReading.timestamp <= end,
    )

    if filters.device_id:
        q = q.filter(SensorReading.device_id == filters.device_id)
    if filters.node_id is not None:
        q = q.filter(SensorReading.node_id == filters.node_id)
    if filters.parameter:
        q = q.filter(SensorReading.sensor_type == filters.parameter)

    q = q.group_by(bucket_start).order_by(bucket_start.asc())

    rows = q.all()

    out: List[Dict[str, Any]] = []
    for r in rows:
        # r.bucket_start is a string like "2026-01-24 14:00:00"
        # keep it as-is or convert to ISO "T" format for frontend
        bucket_str = str(r.bucket_start).replace(" ", "T") if r.bucket_start is not None else None

        out.append(
            {
                "bucket_start": bucket_str,
                "avg": r.avg_value,
                "min": r.min_value,
                "max": r.max_value,
                "count": r.count,
            }
        )

    return out


# -----------------------------
# Convenience: commonly-used dashboard ranges
# -----------------------------

def get_last_hours_range(hours: int = 24) -> Tuple[datetime, datetime]:
    end = datetime.utcnow()
    start = end - timedelta(hours=max(1, int(hours)))
    return start, end
