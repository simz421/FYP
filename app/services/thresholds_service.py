from __future__ import annotations

from datetime import datetime
from typing import Optional, Dict, Any, List

from app.extensions import db
from app.models import SensorProfile, ThresholdRule


def register_sensor_profile(
    *,
    device_id: str,
    node_id: Optional[int],
    parameter: str,
    unit: Optional[str] = None,
    is_enabled: bool = True,
) -> Dict[str, Any]:
    if not device_id:
        raise ValueError("device_id is required")
    parameter = (parameter or "").strip().lower()
    if not parameter:
        raise ValueError("parameter is required")

    row = SensorProfile.query.filter_by(device_id=device_id, node_id=node_id, parameter=parameter).first()
    if not row:
        row = SensorProfile(device_id=device_id, node_id=node_id, parameter=parameter)

    row.unit = unit
    row.is_enabled = bool(is_enabled)

    db.session.add(row)
    db.session.commit()

    return sensor_profile_to_dict(row)


def list_sensor_profiles(*, device_id: Optional[str] = None, node_id: Optional[int] = None) -> List[Dict[str, Any]]:
    q = SensorProfile.query
    if device_id:
        q = q.filter(SensorProfile.device_id == device_id)
    if node_id is not None:
        q = q.filter(SensorProfile.node_id == node_id)
    q = q.order_by(SensorProfile.device_id.asc(), SensorProfile.parameter.asc())
    return [sensor_profile_to_dict(x) for x in q.all()]


def upsert_threshold_rule(
    *,
    device_id: Optional[str],
    node_id: Optional[int],
    parameter: str,
    min_value: Optional[float],
    max_value: Optional[float],
    is_enabled: bool = True,
) -> Dict[str, Any]:
    parameter = (parameter or "").strip().lower()
    if not parameter:
        raise ValueError("parameter is required")

    if min_value is not None:
        min_value = float(min_value)
    if max_value is not None:
        max_value = float(max_value)
    if min_value is not None and max_value is not None and min_value > max_value:
        raise ValueError("min_value cannot be greater than max_value")

    # scope precedence is handled elsewhere; here we just upsert at the requested scope
    q = ThresholdRule.query.filter_by(device_id=device_id, node_id=node_id, parameter=parameter)
    row = q.first()
    if not row:
        row = ThresholdRule(device_id=device_id, node_id=node_id, parameter=parameter)

    row.min_value = min_value
    row.max_value = max_value
    row.is_enabled = bool(is_enabled)
    row.updated_at = datetime.utcnow()

    db.session.add(row)
    db.session.commit()

    return threshold_rule_to_dict(row)


def list_threshold_rules(
    *,
    device_id: Optional[str] = None,
    node_id: Optional[int] = None,
    parameter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q = ThresholdRule.query
    if device_id is not None:
        q = q.filter(ThresholdRule.device_id == device_id)
    if node_id is not None:
        q = q.filter(ThresholdRule.node_id == node_id)
    if parameter:
        q = q.filter(ThresholdRule.parameter == parameter.strip().lower())
    q = q.order_by(ThresholdRule.parameter.asc(), ThresholdRule.updated_at.desc())
    return [threshold_rule_to_dict(x) for x in q.all()]


def resolve_effective_threshold(
    *,
    device_id: str,
    node_id: Optional[int],
    parameter: str,
) -> Optional[Dict[str, Any]]:
    """
    Precedence:
      1) node-specific (node_id, parameter)
      2) device-specific (device_id, parameter)
      3) global (NULL, NULL, parameter)
    Returns None if no rule exists.
    """
    parameter = (parameter or "").strip().lower()
    if not parameter:
        raise ValueError("parameter is required")

    if node_id is not None:
        r = (
            ThresholdRule.query.filter_by(node_id=node_id, parameter=parameter, is_enabled=True)
            .order_by(ThresholdRule.updated_at.desc())
            .first()
        )
        if r:
            return threshold_rule_to_dict(r)

    r = (
        ThresholdRule.query.filter_by(device_id=device_id, node_id=None, parameter=parameter, is_enabled=True)
        .order_by(ThresholdRule.updated_at.desc())
        .first()
    )
    if r:
        return threshold_rule_to_dict(r)

    r = (
        ThresholdRule.query.filter_by(device_id=None, node_id=None, parameter=parameter, is_enabled=True)
        .order_by(ThresholdRule.updated_at.desc())
        .first()
    )
    if r:
        return threshold_rule_to_dict(r)

    return None


def sensor_profile_to_dict(row: SensorProfile) -> Dict[str, Any]:
    return {
        "id": row.id,
        "device_id": row.device_id,
        "node_id": row.node_id,
        "parameter": row.parameter,
        "unit": row.unit,
        "is_enabled": row.is_enabled,
        "created_at": row.created_at.isoformat(),
    }


def threshold_rule_to_dict(row: ThresholdRule) -> Dict[str, Any]:
    return {
        "id": row.id,
        "device_id": row.device_id,
        "node_id": row.node_id,
        "parameter": row.parameter,
        "min_value": row.min_value,
        "max_value": row.max_value,
        "is_enabled": row.is_enabled,
        "updated_at": row.updated_at.isoformat(),
    }


def get_active_thresholds_for_scope(
    *,
    device_id: str | None,
    node_id: int | None,
    parameters: list[str],
) -> dict[str, dict]:
    """Returns active threshold preview per parameter."""
    out: dict[str, dict] = {}
    
    for p in parameters:
        # Try node-specific first
        rule = None
        if node_id is not None:
            rule = ThresholdRule.query.filter_by(
                node_id=node_id,
                parameter=p,
                is_enabled=True
            ).first()
        
        # Then device-specific
        if not rule and device_id:
            rule = ThresholdRule.query.filter_by(
                device_id=device_id,
                node_id=None,
                parameter=p,
                is_enabled=True
            ).first()
        
        # Then global
        if not rule:
            rule = ThresholdRule.query.filter_by(
                device_id=None,
                node_id=None,
                parameter=p,
                is_enabled=True
            ).first()
        
        if rule:
            scope = "node" if rule.node_id else "device" if rule.device_id else "global"
            out[p] = {
                "min": rule.min_value,
                "max": rule.max_value,
                "scope": scope,
                "enabled": rule.is_enabled,
            }
        else:
            out[p] = {
                "min": None,
                "max": None,
                "scope": "none",
                "enabled": False,
            }
    
    return out