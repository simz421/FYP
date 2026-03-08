from __future__ import annotations

from typing import Any, Dict, List, Optional


def _norm(p: Optional[str]) -> str:
    return (p or "").strip().lower()


def _mk(
    *,
    title: str,
    action: str,
    priority: str,
    rationale: str,
    confidence: str = "medium",
) -> Dict[str, Any]:
    return {
        "title": title,
        "action": action,
        "priority": priority,      # low|medium|high
        "confidence": confidence,  # low|medium|high
        "rationale": rationale,
    }


def generate_recommendations_for_alert(alert: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Input: alert dict (like alert_to_dict / incident dict):
      {
        parameter, severity (BELOW_MIN/ABOVE_MAX), level (WARNING/CRITICAL),
        value, min_value, max_value, distance, distance_pct, device_id, node_id
      }

    Output: list of recommended actions (offline rule-based).
    """
    param = _norm(alert.get("parameter"))
    severity = _norm(alert.get("severity"))       # below_min / above_max
    level = _norm(alert.get("level"))             # warning / critical

    value = alert.get("value")
    min_v = alert.get("min_value")
    max_v = alert.get("max_value")
    distance = alert.get("distance")
    distance_pct = alert.get("distance_pct")

    # Priority: CRITICAL => high, WARNING => medium (default)
    priority = "high" if level == "critical" else "medium"

    recs: List[Dict[str, Any]] = []

    # -------------------------
    # Soil moisture rules
    # -------------------------
    if param in {"soil_moisture", "soil moisture", "moisture"}:
        if severity == "below_min":
            recs.append(
                _mk(
                    title="Increase irrigation",
                    action="Irrigate the affected zone and confirm pump/valve operation. Re-check sensor reading after 10–20 minutes.",
                    priority=priority,
                    confidence="high",
                    rationale=f"Soil moisture is below minimum threshold (value={value}, min={min_v}).",
                )
            )
            recs.append(
                _mk(
                    title="Inspect for irrigation faults",
                    action="Check for blocked drippers, leaks, empty tank, or pump failure. Validate soil moisture sensor placement and wiring.",
                    priority="high" if level == "critical" else "medium",
                    confidence="medium",
                    rationale="Low moisture can be caused by insufficient water delivery or sensor issues.",
                )
            )
        elif severity == "above_max":
            recs.append(
                _mk(
                    title="Reduce irrigation / prevent waterlogging",
                    action="Pause or reduce irrigation for the affected zone. Inspect drainage and soil saturation.",
                    priority=priority,
                    confidence="high",
                    rationale=f"Soil moisture is above maximum threshold (value={value}, max={max_v}).",
                )
            )

    # -------------------------
    # Temperature rules
    # -------------------------
    elif param in {"temperature", "temp"}:
        if severity == "above_max":
            recs.append(
                _mk(
                    title="Reduce heat stress",
                    action="Provide shade (shade net), increase ventilation, and irrigate appropriately to cool the crop area.",
                    priority=priority,
                    confidence="high",
                    rationale=f"Temperature is above maximum threshold (value={value}, max={max_v}).",
                )
            )
        elif severity == "below_min":
            recs.append(
                _mk(
                    title="Prevent cold stress",
                    action="Use covers/mulch, reduce night exposure, and ensure seedlings are protected. Consider adjusting planting schedule if persistent.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"Temperature is below minimum threshold (value={value}, min={min_v}).",
                )
            )

    # -------------------------
    # Humidity rules
    # -------------------------
    elif param in {"humidity", "relative_humidity", "rh"}:
        if severity == "above_max":
            recs.append(
                _mk(
                    title="Reduce humidity to prevent fungal disease",
                    action="Increase ventilation, avoid watering leaves late in the day, and ensure adequate plant spacing.",
                    priority=priority,
                    confidence="high",
                    rationale=f"Humidity is above maximum threshold (value={value}, max={max_v}).",
                )
            )
        elif severity == "below_min":
            recs.append(
                _mk(
                    title="Increase humidity (if needed)",
                    action="Irrigate earlier in the day, reduce excessive ventilation, and consider misting if appropriate for the crop.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"Humidity is below minimum threshold (value={value}, min={min_v}).",
                )
            )

    # -------------------------
    # pH rules
    # -------------------------
    elif param in {"ph"}:
        if severity == "below_min":
            recs.append(
                _mk(
                    title="Correct low pH (acidic)",
                    action="Apply lime/dolomite as recommended for the crop and soil type. Verify pH sensor calibration.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"pH is below minimum threshold (value={value}, min={min_v}).",
                )
            )
        elif severity == "above_max":
            recs.append(
                _mk(
                    title="Correct high pH (alkaline)",
                    action="Consider sulfur/acidifying fertilizers as appropriate. Verify pH sensor calibration.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"pH is above maximum threshold (value={value}, max={max_v}).",
                )
            )

    # -------------------------
    # EC rules
    # -------------------------
    elif param in {"ec", "electrical_conductivity"}:
        if severity == "above_max":
            recs.append(
                _mk(
                    title="Reduce salinity / nutrient concentration",
                    action="Flush with clean water if appropriate, and review fertilizer concentration. Inspect for over-fertilization.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"EC is above maximum threshold (value={value}, max={max_v}).",
                )
            )
        elif severity == "below_min":
            recs.append(
                _mk(
                    title="Increase nutrient concentration cautiously",
                    action="Review fertilizer mix and dosing schedule. Increase gradually to avoid overshoot.",
                    priority=priority,
                    confidence="medium",
                    rationale=f"EC is below minimum threshold (value={value}, min={min_v}).",
                )
            )

    # -------------------------
    # Generic fallback rules
    # -------------------------
    else:
        if severity == "below_min":
            recs.append(
                _mk(
                    title="Investigate low reading",
                    action="Confirm the sensor is functioning and correctly placed. Check wiring/power. Take a manual measurement if possible.",
                    priority=priority,
                    confidence="low",
                    rationale=f"{param or 'Parameter'} is below minimum threshold (value={value}, min={min_v}).",
                )
            )
        elif severity == "above_max":
            recs.append(
                _mk(
                    title="Investigate high reading",
                    action="Confirm the sensor is functioning and correctly placed. Check for environmental causes. Take a manual measurement if possible.",
                    priority=priority,
                    confidence="low",
                    rationale=f"{param or 'Parameter'} is above maximum threshold (value={value}, max={max_v}).",
                )
            )

    # -------------------------
    # Add severity context (distance)
    # -------------------------
    if distance is not None:
        # add a general note recommendation if it’s very severe
        if (isinstance(distance_pct, (int, float)) and distance_pct >= 50) or (level == "critical"):
            recs.insert(
                0,
                _mk(
                    title="Treat as urgent",
                    action="Prioritize this incident and verify multiple readings to rule out sensor faults. Take immediate corrective action.",
                    priority="high",
                    confidence="high",
                    rationale=f"Severity level is {level.upper()} with distance={distance} (distance_pct={distance_pct}).",
                )
            )

    return recs


def generate_recommendations_for_summary(incidents: List[Dict[str, Any]], limit: int = 30) -> Dict[str, Any]:
    """
    Build a recommendations bundle for a list of incidents (e.g. report incidents).
    Returns:
      { "count": N, "items": [ {alert_id, parameter, level, recommendations[...]}, ... ] }
    """
    items: List[Dict[str, Any]] = []

    for inc in incidents[: max(1, limit)]:
        recs = generate_recommendations_for_alert(inc)
        items.append(
            {
                "alert_id": inc.get("id"),
                "parameter": inc.get("parameter"),
                "level": inc.get("level"),
                "recommendations": recs,
            }
        )

    return {"count": len(items), "items": items}
