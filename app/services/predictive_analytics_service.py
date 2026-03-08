from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import statistics
from dataclasses import dataclass

from app.services.thresholds_service import resolve_effective_threshold
from app.extensions import db
from app.models import SensorReading, Node, AlertEvent


@dataclass
class PredictionResult:
    """Container for prediction results."""
    device_id: str
    parameter: str
    predicted_value: float
    confidence: float
    prediction_horizon: str  # "1h", "6h", "24h"
    timestamp: datetime
    rationale: str


class PredictiveAnalytics:
    """
    Predictive analytics for anticipating network and sensor issues.
    Uses simple statistical methods (in a real system, you'd use ML).
    """

    @staticmethod
    def predict_sensor_trend(
        device_id: str,
        parameter: str,
        hours_ahead: int = 6
    ) -> PredictionResult:
        """
        Predict future sensor readings based on historical trends.
        Uses simple linear regression on recent data.
        """
        # Get recent readings (last 24 hours)
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=24)

        readings = SensorReading.query.filter(
            SensorReading.device_id == device_id,
            SensorReading.sensor_type == parameter,
            SensorReading.timestamp >= start_time,
            SensorReading.timestamp <= end_time
        ).order_by(SensorReading.timestamp.asc()).all()

        if len(readings) < 10:
            # Not enough data for prediction
            avg_value = statistics.mean([r.value for r in readings]) if readings else 0

            return PredictionResult(
                device_id=device_id,
                parameter=parameter,
                predicted_value=avg_value,
                confidence=0.3,
                prediction_horizon=f"{hours_ahead}h",
                timestamp=end_time,
                rationale="Insufficient historical data for accurate prediction"
            )

        # Simple linear trend calculation
        values = [r.value for r in readings]
        timestamps = [r.timestamp.timestamp() for r in readings]

        # Calculate simple slope (change per hour)
        predicted_value = None
        confidence = None
        rationale = None

        if len(values) >= 2:
            time_span_hours = (timestamps[-1] - timestamps[0]) / 3600
            value_change = values[-1] - values[0]
            hourly_change = value_change / time_span_hours if time_span_hours > 0 else 0

            # Predict future value
            predicted_value = values[-1] + (hourly_change * hours_ahead)

            # Calculate confidence based on data consistency
            variance = statistics.variance(values) if len(values) > 1 else 0
            avg_value = statistics.mean(values)

            # Simple confidence calculation
            if variance == 0:
                confidence = 0.9
            else:
                # Coefficient of variation (lower is better)
                cv = (statistics.stdev(values) / avg_value) if avg_value != 0 else 1
                confidence = max(0.1, 1.0 - min(cv, 0.9))

            trend_direction = "increasing" if hourly_change > 0.01 else "decreasing" if hourly_change < -0.01 else "stable"

            rationale = (
                f"Based on {len(values)} readings over {time_span_hours:.1f} hours, "
                f"{parameter} shows a {trend_direction} trend ({hourly_change:+.3f}/hour). "
                f"Predicted value in {hours_ahead} hours: {predicted_value:.2f}"
            )
        else:
            # Fallback
            avg_value = statistics.mean(values)
            predicted_value = avg_value
            confidence = 0.5
            rationale = "Using average of historical values due to insufficient trend data"

        return PredictionResult(
            device_id=device_id,
            parameter=parameter,
            predicted_value=predicted_value,
            confidence=round(confidence, 2) if confidence is not None else 0.5,
            prediction_horizon=f"{hours_ahead}h",
            timestamp=end_time,
            rationale=rationale or "Using average of historical values due to insufficient trend data"
        )

    @staticmethod
    def predict_threshold_breach(
        device_id: str,
        parameter: str,
        hours_ahead: int = 24,
    ) -> Dict[str, Any]:
        """
        Predict if a device will breach its effective threshold within the horizon.
        Uses simple linear extrapolation on last 24h of readings.

        Returns:
          - effective_threshold: {min_value, max_value, scope, updated_at} or None
          - forecast_points: [{ts, value}] hourly points
          - breach: {will_breach, direction, time_to_breach_hours, breach_at, breach_value}
          - risk: {risk_score, risk_level}
        """
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=24)

        # Find node_id for scope resolution (if exists)
        node = Node.query.filter_by(device_id=device_id).first()
        node_id = node.id if node else None

        parameter = (parameter or "").strip().lower()
        if not parameter:
            raise ValueError("parameter is required")

        # Effective threshold (node > device > global)
        rule = resolve_effective_threshold(device_id=device_id, node_id=node_id, parameter=parameter)

        # If no thresholds exist, still return forecast, but no breach logic
        min_v = rule.get("min_value") if rule else None
        max_v = rule.get("max_value") if rule else None

        # Recent readings for trend
        readings = SensorReading.query.filter(
            SensorReading.device_id == device_id,
            SensorReading.sensor_type == parameter,
            SensorReading.timestamp >= start_time,
            SensorReading.timestamp <= end_time
        ).order_by(SensorReading.timestamp.asc()).all()

        if len(readings) < 2:
            # Not enough data to model
            last_val = readings[-1].value if readings else 0.0
            pts = []
            for h in range(0, max(1, hours_ahead) + 1):
                ts = end_time + timedelta(hours=h)
                pts.append({"ts": ts.isoformat(), "value": float(last_val)})

            return {
                "device_id": device_id,
                "parameter": parameter,
                "effective_threshold": rule,
                "forecast_points": pts,
                "breach": {
                    "will_breach": False,
                    "direction": None,
                    "time_to_breach_hours": None,
                    "breach_at": None,
                    "breach_value": None,
                    "reason": "Insufficient readings for breach prediction"
                },
                "risk": {"risk_score": 10, "risk_level": "low"},
                "timestamp": end_time.isoformat(),
            }

        values = [float(r.value) for r in readings]
        ts = [r.timestamp.timestamp() for r in readings]

        time_span_hours = (ts[-1] - ts[0]) / 3600.0
        if time_span_hours <= 0:
            hourly_change = 0.0
        else:
            hourly_change = (values[-1] - values[0]) / time_span_hours

        current_value = values[-1]

        # Build hourly forecast points
        hours_ahead = max(1, min(int(hours_ahead), 72))
        pts: List[Dict[str, Any]] = []
        for h in range(0, hours_ahead + 1):
            t = end_time + timedelta(hours=h)
            v = current_value + (hourly_change * h)
            pts.append({"ts": t.isoformat(), "value": float(v)})

        # Determine breach
        will_breach = False
        direction = None
        ttb = None
        breach_at = None
        breach_value = None

        if min_v is None and max_v is None:
            # no threshold configured
            risk_score = 10
            risk_level = "low"
            reason = "No active threshold configured for this parameter"
            return {
                "device_id": device_id,
                "parameter": parameter,
                "effective_threshold": rule,
                "forecast_points": pts,
                "breach": {
                    "will_breach": False,
                    "direction": None,
                    "time_to_breach_hours": None,
                    "breach_at": None,
                    "breach_value": None,
                    "reason": reason
                },
                "risk": {"risk_score": risk_score, "risk_level": risk_level},
                "timestamp": end_time.isoformat(),
            }

        for h, p in enumerate(pts):
            v = p["value"]
            if max_v is not None and v > float(max_v):
                will_breach = True
                direction = "high"
                ttb = h
                breach_at = p["ts"]
                breach_value = v
                break
            if min_v is not None and v < float(min_v):
                will_breach = True
                direction = "low"
                ttb = h
                breach_at = p["ts"]
                breach_value = v
                break

        # Risk scoring (simple enterprise-friendly heuristic)
        if not will_breach:
            risk_score = 20 if abs(hourly_change) > 0.5 else 10
            risk_level = "low" if risk_score <= 20 else "medium"
        else:
            # nearer breach = higher risk
            frac = 1.0 - (float(ttb) / float(hours_ahead)) if ttb is not None else 1.0
            risk_score = int(min(100, 70 + (frac * 30)))
            if risk_score >= 90:
                risk_level = "critical"
            elif risk_score >= 75:
                risk_level = "high"
            else:
                risk_level = "medium"

        rationale = (
            f"Trend slope: {hourly_change:+.3f}/hour from {len(values)} readings (24h window). "
            f"Current value: {current_value:.2f}. "
            + (f"Threshold min={min_v}, max={max_v}. " if (min_v is not None or max_v is not None) else "")
            + (f"Breach predicted in ~{ttb}h ({direction})." if will_breach else "No breach predicted within horizon.")
        )

        return {
            "device_id": device_id,
            "parameter": parameter,
            "effective_threshold": rule,
            "forecast_points": pts,
            "breach": {
                "will_breach": will_breach,
                "direction": direction,
                "time_to_breach_hours": ttb,
                "breach_at": breach_at,
                "breach_value": breach_value,
                "rationale": rationale,
            },
            "risk": {
                "risk_score": risk_score,
                "risk_level": risk_level,
            },
            "timestamp": end_time.isoformat(),
        }

    @staticmethod
    def fleet_breach_scan(
        parameter: str,
        hours_ahead: int = 24,
        limit: int = 50,
        only_registered: bool = True,
    ) -> Dict[str, Any]:
        """
        Scan fleet for threshold breach risk and rank results.
        Enterprise "early warning inbox".

        Returns:
          {
            ok: True,
            parameter,
            hours_ahead,
            generated_at,
            total_devices,
            returned,
            items: [
              {
                device_id,
                node_id,
                node_name,
                current_value,
                slope_per_hour,
                threshold: {min_value, max_value, scope...} | None,
                breach: {will_breach, direction, eta_hours, breach_at, breach_value},
                risk: {risk_score, risk_level},
              }, ...
            ]
          }
        """
        parameter = (parameter or "").strip().lower()
        if not parameter:
            raise ValueError("parameter is required")

        hours_ahead = max(1, min(int(hours_ahead), 72))
        limit = max(1, min(int(limit), 200))

        q = Node.query
        if only_registered:
            q = q.filter_by(is_registered=True)

        nodes: List[Node] = q.order_by(Node.device_id.asc()).all()
        items: List[Dict[str, Any]] = []

        for node in nodes:
            device_id = node.device_id
            if not device_id:
                continue

            try:
                data = PredictiveAnalytics.predict_threshold_breach(
                    device_id=device_id,
                    parameter=parameter,
                    hours_ahead=hours_ahead,
                )

                pts = data.get("forecast_points") or []
                current_value = None
                slope = None

                if len(pts) >= 2:
                    current_value = float(pts[0].get("value", 0.0))
                    slope = float(pts[1].get("value", 0.0)) - float(pts[0].get("value", 0.0))
                elif len(pts) == 1:
                    current_value = float(pts[0].get("value", 0.0))
                    slope = 0.0

                breach = data.get("breach") or {}
                risk = data.get("risk") or {}
                thr = data.get("effective_threshold")

                items.append(
                    {
                        "device_id": device_id,
                        "node_id": node.id,
                        "node_name": node.name,
                        "current_value": current_value,
                        "slope_per_hour": slope,
                        "threshold": thr,
                        "breach": {
                            "will_breach": bool(breach.get("will_breach")),
                            "direction": breach.get("direction"),
                            "eta_hours": breach.get("time_to_breach_hours"),
                            "breach_at": breach.get("breach_at"),
                            "breach_value": breach.get("breach_value"),
                        },
                        "risk": {
                            "risk_score": int(risk.get("risk_score") or 0),
                            "risk_level": risk.get("risk_level") or "low",
                        },
                        "timestamp": data.get("timestamp"),
                    }
                )
            except Exception:
                # If one device fails, keep scan stable for the rest of the fleet
                continue

        # Sorting: (1) predicted breach first, (2) higher score first, (3) sooner ETA first
        def sort_key(x: Dict[str, Any]):
            will = 1 if (x.get("breach") or {}).get("will_breach") else 0
            score = int((x.get("risk") or {}).get("risk_score") or 0)
            eta = (x.get("breach") or {}).get("eta_hours")
            eta_val = int(eta) if isinstance(eta, int) else 10_000
            return (-will, -score, eta_val)

        items.sort(key=sort_key)

        items = items[:limit]

        return {
            "parameter": parameter,
            "hours_ahead": hours_ahead,
            "generated_at": datetime.utcnow().isoformat(),
            "total_devices": len(nodes),
            "returned": len(items),
            "items": items,
        }

    @staticmethod
    def predict_network_failure(
        device_id: str,
        lookback_days: int = 7
    ) -> Dict[str, Any]:
        """
        Predict likelihood of device failure based on historical patterns.
        """
        node = Node.query.filter_by(device_id=device_id).first()
        if not node:
            return {"error": f"Device {device_id} not found"}

        # Analyze historical alerts for this device
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=lookback_days)

        alerts = AlertEvent.query.filter(
            AlertEvent.device_id == device_id,
            AlertEvent.created_at >= start_time,
            AlertEvent.created_at <= end_time
        ).all()

        # Analyze heartbeat patterns
        # In a real system, you'd analyze time-between-failures
        alert_count = len(alerts)

        # Simple risk calculation
        if alert_count == 0:
            risk_score = 10  # Low risk
            risk_level = "low"
        elif alert_count <= 5:
            risk_score = 40  # Medium risk
            risk_level = "medium"
        elif alert_count <= 15:
            risk_score = 70  # High risk
            risk_level = "high"
        else:
            risk_score = 90  # Critical risk
            risk_level = "critical"

        # Adjust based on last seen
        if node.last_seen:
            hours_since_seen = (end_time - node.last_seen).total_seconds() / 3600
            expected_interval = (node.heartbeat_interval_sec or 30) / 3600

            if hours_since_seen > expected_interval * 3:
                risk_score = min(100, risk_score + 30)
                risk_level = "high" if risk_score > 50 else risk_level

        # Generate recommendations
        recommendations = []
        if risk_level in ["high", "critical"]:
            recommendations.append("Consider preventive maintenance or device replacement")
            recommendations.append("Check physical connections and power supply")

        if node.last_rssi and node.last_rssi < -85:
            recommendations.append("Improve signal strength by repositioning device")

        return {
            "device_id": device_id,
            "node_name": node.name,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "analysis_period_days": lookback_days,
            "alerts_in_period": alert_count,
            "last_seen": node.last_seen.isoformat() if node.last_seen else None,
            "current_status": node.status,
            "signal_strength": node.last_rssi,
            "prediction_horizon": "7 days",
            "confidence": 0.7 if alert_count > 0 else 0.5,
            "recommendations": recommendations,
            "timestamp": end_time.isoformat()
        }

    @staticmethod
    def analyze_seasonal_patterns(
        device_id: str,
        parameter: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Analyze daily/seasonal patterns in sensor data.
        """
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=days)

        readings = SensorReading.query.filter(
            SensorReading.device_id == device_id,
            SensorReading.sensor_type == parameter,
            SensorReading.timestamp >= start_time,
            SensorReading.timestamp <= end_time
        ).order_by(SensorReading.timestamp.asc()).all()

        if len(readings) < 24:  # Need at least 24 readings
            return {
                "device_id": device_id,
                "parameter": parameter,
                "status": "insufficient_data",
                "message": f"Need at least 24 readings, got {len(readings)}",
                "readings_analyzed": len(readings)
            }

        # Group by hour of day to find daily patterns
        hourly_patterns = {}
        for hour in range(24):
            hour_readings = [r for r in readings if r.timestamp.hour == hour]
            if hour_readings:
                values = [r.value for r in hour_readings]
                hourly_patterns[hour] = {
                    "count": len(values),
                    "avg": statistics.mean(values),
                    "min": min(values),
                    "max": max(values),
                    "std": statistics.stdev(values) if len(values) > 1 else 0
                }

        # Find peak and trough hours
        if hourly_patterns:
            peak_hour = max(hourly_patterns.items(), key=lambda x: x[1]["avg"])[0]
            trough_hour = min(hourly_patterns.items(), key=lambda x: x[1]["avg"])[0]

            peak_value = hourly_patterns[peak_hour]["avg"]
            trough_value = hourly_patterns[trough_hour]["avg"]
            daily_variation = peak_value - trough_value

            # Determine if pattern is significant
            pattern_significant = daily_variation > (statistics.mean([p["std"] for p in hourly_patterns.values()]) * 2)

            pattern_description = (
                f"Strong daily pattern detected: peaks at {peak_hour:02d}:00 ({peak_value:.1f}), "
                f"lows at {trough_hour:02d}:00 ({trough_value:.1f})"
                if pattern_significant else
                "No strong daily pattern detected"
            )

            return {
                "device_id": device_id,
                "parameter": parameter,
                "status": "analyzed",
                "days_analyzed": days,
                "readings_analyzed": len(readings),
                "daily_pattern": {
                    "significant": pattern_significant,
                    "description": pattern_description,
                    "peak_hour": peak_hour,
                    "trough_hour": trough_hour,
                    "daily_variation": daily_variation,
                    "hourly_averages": hourly_patterns
                },
                "statistics": {
                    "overall_avg": statistics.mean([r.value for r in readings]),
                    "overall_std": statistics.stdev([r.value for r in readings]) if len(readings) > 1 else 0,
                    "data_points": len(readings),
                    "date_range": {
                        "start": start_time.isoformat(),
                        "end": end_time.isoformat()
                    }
                },
                "timestamp": end_time.isoformat()
            }

        return {
            "device_id": device_id,
            "parameter": parameter,
            "status": "no_pattern",
            "message": "Could not analyze patterns",
            "readings_analyzed": len(readings)
        }

    @staticmethod
    def predict_maintenance_schedule() -> Dict[str, Any]:
        """
        Predict optimal maintenance schedule based on device health and usage.
        """
        # Get all devices
        nodes = Node.query.filter_by(is_registered=True).all()

        if not nodes:
            return {"error": "No registered devices found"}

        maintenance_plan = []

        for node in nodes:
            # Calculate maintenance score based on various factors
            score = 0
            factors = []

            # Factor 1: Uptime (longer uptime = higher chance of needing maintenance)
            if node.last_seen:
                uptime_days = (datetime.utcnow() - node.last_seen).days
                if uptime_days > 30:
                    score += 30
                    factors.append(f"Long uptime ({uptime_days} days)")

            # Factor 2: Alert history
            recent_alerts = AlertEvent.query.filter(
                AlertEvent.device_id == node.device_id,
                AlertEvent.created_at >= datetime.utcnow() - timedelta(days=7)
            ).count()

            if recent_alerts > 10:
                score += 40
                factors.append(f"High alert frequency ({recent_alerts} in 7 days)")
            elif recent_alerts > 5:
                score += 20
                factors.append(f"Moderate alert frequency ({recent_alerts} in 7 days)")

            # Factor 3: Signal strength
            if node.last_rssi and node.last_rssi < -85:
                score += 25
                factors.append(f"Weak signal (RSSI: {node.last_rssi} dBm)")

            # Determine maintenance priority
            if score >= 50:
                priority = "high"
                recommended_action = "Schedule maintenance within 7 days"
            elif score >= 30:
                priority = "medium"
                recommended_action = "Schedule maintenance within 30 days"
            else:
                priority = "low"
                recommended_action = "Routine check within 90 days"

            if score > 20:  # Only include devices needing some attention
                maintenance_plan.append({
                    "device_id": node.device_id,
                    "node_name": node.name,
                    "node_type": node.node_type,
                    "maintenance_score": score,
                    "priority": priority,
                    "factors": factors,
                    "recommended_action": recommended_action,
                    "last_maintenance": "Never"  # In real system, track this
                })

        # Sort by priority score
        maintenance_plan.sort(key=lambda x: x["maintenance_score"], reverse=True)

        return {
            "analysis_date": datetime.utcnow().isoformat(),
            "devices_analyzed": len(nodes),
            "devices_needing_maintenance": len(maintenance_plan),
            "priority_breakdown": {
                "high": len([m for m in maintenance_plan if m["priority"] == "high"]),
                "medium": len([m for m in maintenance_plan if m["priority"] == "medium"]),
                "low": len([m for m in maintenance_plan if m["priority"] == "low"])
            },
            "maintenance_plan": maintenance_plan,
            "recommended_schedule": {
                "immediate": [m for m in maintenance_plan if m["priority"] == "high"],
                "within_30_days": [m for m in maintenance_plan if m["priority"] == "medium"],
                "within_90_days": [m for m in maintenance_plan if m["priority"] == "low"]
            }
        }

    @staticmethod
    def _risk_to_severity(risk_level: str) -> str:
        lvl = (risk_level or "").lower()
        if lvl in ("critical",):
            return "critical"
        if lvl in ("high",):
            return "high"
        if lvl in ("medium",):
            return "medium"
        return "low"

    @staticmethod
    def _predictive_alert_message(
        device_id: str,
        parameter: str,
        breach: Dict[str, Any],
        thr: Optional[Dict[str, Any]],
        risk: Dict[str, Any],
    ) -> str:
        eta = breach.get("time_to_breach_hours")
        direction = breach.get("direction")
        bval = breach.get("breach_value")
        bat = breach.get("breach_at")
        min_v = thr.get("min_value") if thr else None
        max_v = thr.get("max_value") if thr else None
        score = risk.get("risk_score")
        lvl = risk.get("risk_level")

        parts = [
            f"Predictive breach risk detected for {device_id}.",
            f"Parameter={parameter}.",
            f"Risk={lvl} ({score}/100).",
        ]
        if eta is not None:
            parts.append(f"ETA≈{eta}h.")
        if direction:
            parts.append(f"Direction={direction}.")
        if bval is not None:
            parts.append(f"Predicted breach value={float(bval):.2f}.")
        if bat:
            parts.append(f"Predicted breach at={bat}.")
        if min_v is not None or max_v is not None:
            parts.append(f"Threshold(min={min_v}, max={max_v}).")

        return " ".join(parts)

    @staticmethod
    def create_predictive_breach_alerts(
        *,
        parameter: str,
        hours_ahead: int = 24,
        eta_max_hours: int = 6,
        limit: int = 200,
        only_registered: bool = True,
        create_only_if_threshold_exists: bool = True,
    ) -> Dict[str, Any]:
        """
        Convert imminent predicted breaches into AlertEvent rows (predictive alerts).
        - Dedupe: if an *active* predictive alert exists for (device_id, parameter), we skip.
        - Policy: only create if breach predicted within eta_max_hours.
        - Optional: only create if an effective threshold exists (recommended).
        """
        parameter = (parameter or "").strip().lower()
        if not parameter:
            raise ValueError("parameter is required")

        hours_ahead = max(1, min(int(hours_ahead), 72))
        eta_max_hours = max(1, min(int(eta_max_hours), 72))
        limit = max(1, min(int(limit), 500))

        # Reuse your existing fleet scan logic if present.
        # If you don’t have fleet_breach_scan in this file, remove this call and iterate nodes directly.
        scan = PredictiveAnalytics.fleet_breach_scan(
            parameter=parameter,
            hours_ahead=hours_ahead,
            limit=limit,
            only_registered=only_registered,
        )

        items = (scan or {}).get("items") or []
        created = 0
        skipped_existing = 0
        skipped_policy = 0
        errors = 0

        created_ids: List[int] = []

        for it in items:
            try:
                device_id = it.get("device_id")
                if not device_id:
                    skipped_policy += 1
                    continue

                breach = it.get("breach") or {}
                risk = it.get("risk") or {}
                thr = it.get("threshold")

                will = bool(breach.get("will_breach"))
                eta = breach.get("eta_hours")

                if not will:
                    skipped_policy += 1
                    continue
                if eta is None or not isinstance(eta, int):
                    skipped_policy += 1
                    continue
                if eta > eta_max_hours:
                    skipped_policy += 1
                    continue

                if create_only_if_threshold_exists:
                    if not thr or (thr.get("min_value") is None and thr.get("max_value") is None):
                        skipped_policy += 1
                        continue

                # Dedupe rule: active predictive alert already exists for this device+parameter
                existing = AlertEvent.query.filter(
                    AlertEvent.device_id == device_id,
                    AlertEvent.parameter == parameter,
                    AlertEvent.level == "predictive",   # <- we tag predictive alerts here
                    AlertEvent.is_active == True,
                ).order_by(AlertEvent.created_at.desc()).first()

                if existing:
                    skipped_existing += 1
                    continue

                severity = PredictiveAnalytics._risk_to_severity(risk.get("risk_level"))
                msg = PredictiveAnalytics._predictive_alert_message(
                    device_id=device_id,
                    parameter=parameter,
                    breach={
                        "time_to_breach_hours": breach.get("eta_hours"),
                        "direction": breach.get("direction"),
                        "breach_value": breach.get("breach_value"),
                        "breach_at": breach.get("breach_at"),
                    },
                    thr=thr,
                    risk={
                        "risk_score": risk.get("risk_score"),
                        "risk_level": risk.get("risk_level"),
                    },
                )

                # Create alert row using the fields your CSV exporter shows exist:
                # device_id, parameter, value, min_value, max_value, severity, level, message, is_active, is_acked, resolved_at
                a = AlertEvent(
                    device_id=device_id,
                    parameter=parameter,
                    value=breach.get("breach_value") if breach.get("breach_value") is not None else it.get("current_value"),
                    min_value=thr.get("min_value") if thr else None,
                    max_value=thr.get("max_value") if thr else None,
                    severity=severity,
                    level="predictive",
                    message=msg,
                    is_active=True,
                    is_acked=False,
                    resolved_at=None,
                )

                db.session.add(a)
                db.session.commit()

                created += 1
                created_ids.append(a.id)

                # Best-effort broadcast (won’t crash if you don’t have it)
                try:
                    from app.services.websocket_service import broadcast_event  # type: ignore
                    broadcast_event("alert_created", {
                        "id": a.id,
                        "device_id": a.device_id,
                        "parameter": a.parameter,
                        "severity": a.severity,
                        "level": a.level,
                        "message": a.message,
                        "created_at": a.created_at.isoformat() if getattr(a, "created_at", None) else None,
                        "is_active": a.is_active,
                    })
                except Exception:
                    pass

            except Exception:
                db.session.rollback()
                errors += 1

        return {
            "ok": True,
            "parameter": parameter,
            "hours_ahead": hours_ahead,
            "eta_max_hours": eta_max_hours,
            "limit": limit,
            "only_registered": only_registered,
            "created": created,
            "created_ids": created_ids,
            "skipped_existing": skipped_existing,
            "skipped_policy": skipped_policy,
            "errors": errors,
            "generated_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def auto_resolve_predictive_alerts(
        *,
        parameter: str,
        hours_ahead: int = 24,
        eta_max_hours: int = 6,
        limit: int = 500,
        resolve_if_no_threshold: bool = True,
        resolve_if_insufficient_data: bool = True,
    ) -> Dict[str, Any]:
        """
        Auto-resolve predictive alerts that are no longer imminent.

        Strategy:
        - Find active predictive alerts for parameter
        - Recompute breach risk
        - Resolve if:
            a) no breach predicted within eta_max_hours
            b) (optional) no effective threshold exists
            c) (optional) insufficient data
        """

        parameter = (parameter or "").strip().lower()
        if not parameter:
            raise ValueError("parameter is required")

        hours_ahead = max(1, min(int(hours_ahead), 72))
        eta_max_hours = max(1, min(int(eta_max_hours), 72))
        limit = max(1, min(int(limit), 2000))

        # Load active predictive alerts for this parameter
        q = AlertEvent.query.filter(
            AlertEvent.parameter == parameter,
            AlertEvent.level == "predictive",
            AlertEvent.is_active == True,
        ).order_by(AlertEvent.created_at.desc())

        alerts = q.limit(limit).all()

        resolved = 0
        kept = 0
        errors = 0
        resolved_ids: List[int] = []

        now = datetime.utcnow()

        for a in alerts:
            try:
                device_id = a.device_id
                if not device_id:
                    kept += 1
                    continue

                # Recompute breach prediction
                data = PredictiveAnalytics.predict_threshold_breach(
                    device_id=device_id,
                    parameter=parameter,
                    hours_ahead=hours_ahead,
                )

                thr = data.get("effective_threshold")
                breach = data.get("breach") or {}
                will = bool(breach.get("will_breach"))
                eta = breach.get("time_to_breach_hours")

                # Detect insufficient-data signal
                reason = (breach.get("reason") or "").lower()
                insufficient = "insufficient" in reason

                # Policy checks
                no_threshold = (thr is None) or (
                    thr.get("min_value") is None and thr.get("max_value") is None
                )

                imminent = False
                if will and isinstance(eta, int) and eta <= eta_max_hours:
                    imminent = True

                should_resolve = False
                resolve_reason = ""

                if not imminent:
                    should_resolve = True
                    resolve_reason = (
                        f"Predictive breach no longer imminent (ETA>{eta_max_hours}h or no breach)."
                    )

                if resolve_if_no_threshold and no_threshold:
                    should_resolve = True
                    resolve_reason = "No active threshold configured (auto-resolve policy)."

                if resolve_if_insufficient_data and insufficient:
                    should_resolve = True
                    resolve_reason = "Insufficient data for prediction (auto-resolve policy)."

                if should_resolve:
                    a.is_active = False
                    a.resolved_at = now

                    # If your model has these fields, set them safely:
                    if hasattr(a, "resolve_note"):
                        setattr(a, "resolve_note", resolve_reason)
                    if hasattr(a, "resolved_reason"):
                        setattr(a, "resolved_reason", resolve_reason)

                    db.session.add(a)
                    db.session.commit()

                    resolved += 1
                    resolved_ids.append(a.id)

                    # Best-effort broadcast
                    try:
                        from app.services.websocket_service import broadcast_event  # type: ignore
                        broadcast_event("alert_resolved", {
                            "id": a.id,
                            "device_id": a.device_id,
                            "parameter": a.parameter,
                            "severity": a.severity,
                            "level": a.level,
                            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
                            "is_active": a.is_active,
                        })
                    except Exception:
                        pass
                else:
                    kept += 1

            except Exception:
                db.session.rollback()
                errors += 1

        return {
            "parameter": parameter,
            "hours_ahead": hours_ahead,
            "eta_max_hours": eta_max_hours,
            "limit": limit,
            "resolve_if_no_threshold": resolve_if_no_threshold,
            "resolve_if_insufficient_data": resolve_if_insufficient_data,
            "active_checked": len(alerts),
            "resolved": resolved,
            "resolved_ids": resolved_ids,
            "kept_active": kept,
            "errors": errors,
            "generated_at": datetime.utcnow().isoformat(),
        }