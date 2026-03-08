from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy import func, and_, or_

from app.extensions import db
from app.models import SensorReading, AlertEvent
from app.services.thresholds_service import resolve_effective_threshold


# How far outside threshold becomes CRITICAL (fraction of threshold range or absolute fallback)
CRITICAL_RATIO = 0.20  # 20% beyond limit relative to range
CRITICAL_ABS_FALLBACK = 5.0  # if range isn't available, 5 units beyond min/max


def evaluate_reading(
    reading: SensorReading,
    *,
    auto_resolve: bool = True,
    dedupe_window_minutes: int = 10,
) -> Dict[str, Any]:
    """
    Evaluates a reading against effective thresholds.
    - If violated: create/refresh alert
    - If normal and auto_resolve=True: resolve matching active alerts
    Returns info about actions taken.
    """
    parameter = (reading.sensor_type or "").strip().lower()
    if not parameter:
        return {"created": None, "resolved": [], "skipped": True, "reason": "missing parameter"}

    rule = resolve_effective_threshold(
        device_id=reading.device_id,
        node_id=reading.node_id,
        parameter=parameter,
    )
    if not rule:
        return {"created": None, "resolved": [], "skipped": True, "reason": "no threshold rule"}

    min_v = rule.get("min_value")
    max_v = rule.get("max_value")
    value = float(reading.value)

    violation = _check_violation(value, min_v, max_v)
    if not violation:
        resolved = []
        if auto_resolve:
            resolved = _auto_resolve_matching_alerts(
                device_id=reading.device_id,
                node_id=reading.node_id,
                parameter=parameter,
                reading_id=reading.id,
                value=value,
                min_v=min_v,
                max_v=max_v,
            )
        return {"created": None, "resolved": resolved, "skipped": False, "reason": "normal"}

    severity = violation  # BELOW_MIN | ABOVE_MAX
    level = _compute_level(value, min_v, max_v, severity)
    msg = _build_message(parameter, value, min_v, max_v, severity, level)

    # Dedupe: avoid creating same alert repeatedly in short time window
    recent = (
        AlertEvent.query.filter_by(
            device_id=reading.device_id,
            node_id=reading.node_id,
            parameter=parameter,
            severity=severity,
            is_active=True,
        )
        .order_by(AlertEvent.created_at.desc())
        .first()
    )
    if recent and _within_window(recent.created_at, dedupe_window_minutes):
        # Optionally escalate level if new reading is worse
        if _should_escalate(recent.level, level):
            recent.level = level
            recent.value = value
            recent.min_value = min_v
            recent.max_value = max_v
            recent.message = msg
            db.session.add(recent)
            db.session.commit()
            return {"created": alert_to_dict(recent), "resolved": [], "skipped": False, "reason": "dedupe_escalate_or_refresh"}

        return {"created": None, "resolved": [], "skipped": False, "reason": "deduped"}

    alert = AlertEvent(
        device_id=reading.device_id,
        node_id=reading.node_id,
        parameter=parameter,
        reading_id=reading.id,
        value=value,
        min_value=min_v,
        max_value=max_v,
        severity=severity,
        level=level,
        message=msg,
        is_active=True,
    )
    db.session.add(alert)
    db.session.commit()

    return {"created": alert_to_dict(alert), "resolved": [], "skipped": False, "reason": "created"}

# adding batch processing for performance
def evaluate_readings_batch(readings: List[SensorReading]) -> List[Dict[str, Any]]:
    """Process multiple readings efficiently"""
    results = []
    for reading in readings:
        results.append(evaluate_reading(reading))
    return results

def _within_window(dt: Optional[datetime], minutes: int) -> bool:
    if not dt:
        return False
    return dt >= (datetime.utcnow() - timedelta(minutes=minutes))


def _check_violation(value: float, min_v, max_v) -> Optional[str]:
    if min_v is not None and value < float(min_v):
        return "BELOW_MIN"
    if max_v is not None and value > float(max_v):
        return "ABOVE_MAX"
    return None


def _compute_level(value: float, min_v, max_v, severity: str) -> str:
    """
    WARNING vs CRITICAL based on distance outside threshold.
    - If both min and max exist, we use range-based severity.
    - If only one bound exists, use absolute fallback.
    """
    min_f = float(min_v) if min_v is not None else None
    max_f = float(max_v) if max_v is not None else None

    if min_f is not None and max_f is not None and max_f > min_f:
        rng = max_f - min_f
        if severity == "BELOW_MIN":
            diff = min_f - value
        else:
            diff = value - max_f
        return "CRITICAL" if diff >= (CRITICAL_RATIO * rng) else "WARNING"

    # Fallback: absolute distance
    if severity == "BELOW_MIN" and min_f is not None:
        return "CRITICAL" if (min_f - value) >= CRITICAL_ABS_FALLBACK else "WARNING"
    if severity == "ABOVE_MAX" and max_f is not None:
        return "CRITICAL" if (value - max_f) >= CRITICAL_ABS_FALLBACK else "WARNING"

    return "WARNING"


def _should_escalate(old_level: str, new_level: str) -> bool:
    order = {"WARNING": 1, "CRITICAL": 2}
    return order.get(new_level, 1) > order.get(old_level, 1)


def _build_message(parameter: str, value: float, min_v, max_v, severity: str, level: str) -> str:
    if severity == "BELOW_MIN":
        diff = (float(min_v) - value) if min_v is not None else 0.0
        return f"[{level}] {parameter} below min by {diff:.2f}: value={value}, min={min_v}"
    diff = (value - float(max_v)) if max_v is not None else 0.0
    return f"[{level}] {parameter} above max by {diff:.2f}: value={value}, max={max_v}"




def _auto_resolve_matching_alerts(
    *,
    device_id: str,
    node_id: Optional[int],
    parameter: str,
    reading_id: Optional[int],
    value: float,
    min_v,
    max_v,
) -> List[Dict[str, Any]]:
    """
    When value returns within range, resolve any active alerts for this scope+parameter.
    """
    # Only resolve if it is truly within range
    if min_v is not None and value < float(min_v):
        return []
    if max_v is not None and value > float(max_v):
        return []

    active_alerts = (
        AlertEvent.query.filter_by(
            device_id=device_id,
            node_id=node_id,
            parameter=parameter,
            is_active=True,
        )
        .order_by(AlertEvent.created_at.asc())
        .all()
    )

    resolved = []
    for a in active_alerts:
        a.is_active = False
        a.resolved_at = datetime.utcnow()
        a.resolved_by_reading_id = reading_id
        a.resolution_note = f"Auto-resolved: value back to normal ({value}) within [{min_v},{max_v}]"
        db.session.add(a)
        resolved.append(alert_to_dict(a))

    if resolved:
        db.session.commit()

    return resolved

from sqlalchemy import or_

def list_alerts_page(
    *,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
    active_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    acked_only: Optional[bool] = None,
    severity: Optional[str] = None,  # BELOW_MIN / ABOVE_MAX
    level: Optional[str] = None,     # WARNING / CRITICAL
    q: Optional[str] = None,         # free text
) -> tuple[List[Dict[str, Any]], int]:
    """
    Enterprise inbox query with paging + filters.
    Returns (items, total_count).
    """
    qy = AlertEvent.query

    if device_id:
        qy = qy.filter(AlertEvent.device_id == device_id)
    if node_id is not None:
        qy = qy.filter(AlertEvent.node_id == node_id)
    if parameter:
        qy = qy.filter(AlertEvent.parameter == parameter.strip().lower())

    if active_only:
        qy = qy.filter(AlertEvent.is_active == True)  # noqa: E712

    if acked_only is True:
        qy = qy.filter(AlertEvent.is_acked == True)  # noqa: E712
    if acked_only is False:
        qy = qy.filter(AlertEvent.is_acked == False)  # noqa: E712

    if severity:
        qy = qy.filter(AlertEvent.severity == severity.strip().upper())

    if level:
        qy = qy.filter(AlertEvent.level == level.strip().upper())

    if q:
        like = f"%{q.strip()}%"
        qy = qy.filter(
            or_(
                AlertEvent.message.ilike(like),
                AlertEvent.device_id.ilike(like),
                AlertEvent.parameter.ilike(like),
            )
        )

    total = qy.count()

    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))

    rows = (
        qy.order_by(AlertEvent.created_at.desc())
        .offset(off)
        .limit(lim)
        .all()
    )

    return [alert_to_dict(a) for a in rows], int(total)



def list_alerts(
    *,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
    active_only: bool = False,
    limit: int = 200,
    acked_only: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """
    Backward compatible wrapper for old callers.
    """
    items, _total = list_alerts_page(
        device_id=device_id,
        node_id=node_id,
        parameter=parameter,
        active_only=active_only,
        acked_only=acked_only,
        limit=limit,
        offset=0,
    )
    return items


def resolve_alert(alert_id: int) -> Dict[str, Any]:
    a = AlertEvent.query.get(alert_id)
    if not a:
        raise ValueError("Alert not found")

    if a.is_active:
        a.is_active = False
        a.resolved_at = datetime.utcnow()
        a.resolution_note = "Manually resolved by user"
        db.session.add(a)
        db.session.commit()

    return alert_to_dict(a)


def _distance_info(value: float, min_v, max_v, severity: str) -> Dict[str, Any]:
    """
    Returns distance outside threshold and optional percent-of-range.
    No DB changes needed (computed on the fly).
    """
    min_f = float(min_v) if min_v is not None else None
    max_f = float(max_v) if max_v is not None else None

    if severity == "BELOW_MIN" and min_f is not None:
        distance = max(0.0, min_f - value)
    elif severity == "ABOVE_MAX" and max_f is not None:
        distance = max(0.0, value - max_f)
    else:
        distance = 0.0

    distance_pct = None
    if min_f is not None and max_f is not None and max_f > min_f:
        rng = max_f - min_f
        distance_pct = round((distance / rng) * 100.0, 2)

    return {"distance": round(distance, 4), "distance_pct": distance_pct}


def alert_to_dict(a: AlertEvent) -> Dict[str, Any]:
    info = _distance_info(float(a.value), a.min_value, a.max_value, a.severity)

    return {
        "id": a.id,
        "device_id": a.device_id,
        "node_id": a.node_id,
        "parameter": a.parameter,
        "reading_id": a.reading_id,
        "value": float(a.value),
        "min_value": a.min_value,
        "max_value": a.max_value,
        "severity": a.severity,   # BELOW_MIN / ABOVE_MAX
        "level": a.level,         # WARNING / CRITICAL
        "distance": info["distance"],           # ✅ NEW
        "distance_pct": info["distance_pct"],   # ✅ NEW
        "message": a.message,
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat(),
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        "resolved_by_reading_id": a.resolved_by_reading_id,
        "resolution_note": a.resolution_note,
        "is_acked": a.is_acked,
        "acked_at": a.acked_at.isoformat() if a.acked_at else None,
        "ack_note": a.ack_note,
    }

def ack_alert(alert_id: int, note: str = "") -> Dict[str, Any]:
    a = AlertEvent.query.get(alert_id)
    if not a:
        raise ValueError("Alert not found")

    if not a.is_active:
        # you can still ack resolved alerts, but usually not needed
        # We'll allow it but it won’t matter much
        pass

    if not a.is_acked:
        a.is_acked = True
        a.acked_at = datetime.utcnow()
        a.ack_note = (note or "").strip()[:255]
        db.session.add(a)
        db.session.commit()

    return alert_to_dict(a)
