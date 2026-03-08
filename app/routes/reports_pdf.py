from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from flask import Blueprint, jsonify, make_response, request

from app.services.pdf_report import render_report_pdf
from app.services.reports_service import build_daily_report, build_period_report, build_weekly_report
from app.services.telemetry_queries import parse_range_params


reports_pdf_bp = Blueprint("reports_pdf", __name__, url_prefix="/api/reports")


# -------------------------
# Helpers
# -------------------------

def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)


def _parse_day(value: str) -> datetime:
    """
    Accepts 'YYYY-MM-DD' (recommended) or ISO datetime (uses date portion).
    Returns a datetime.
    """
    value = (value or "").strip()
    if not value:
        raise ValueError("Missing date")

    # Keep only date portion if ISO
    if len(value) >= 10:
        value = value[:10]
    return datetime.fromisoformat(value)


def _parse_parameters(raw: Optional[str]) -> Optional[List[str]]:
    """
    parameters=temperature,humidity,ph
    """
    if not raw:
        return None
    parts = [p.strip().lower() for p in raw.split(",") if p.strip()]
    return parts or None


def _pdf_response(pdf_bytes: bytes, filename: str):
    resp = make_response(pdf_bytes)
    resp.headers["Content-Type"] = "application/pdf"
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


# =========================
# DAILY PDF
# =========================

@reports_pdf_bp.get("/daily.pdf")
def daily_pdf():
    """
    /api/reports/daily.pdf?day=2026-01-24&device_id=ESP32_01&bucket=hour&parameters=temperature,humidity
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = (request.args.get("bucket") or "hour").strip().lower()
        parameters = _parse_parameters(request.args.get("parameters"))

        day_str = request.args.get("day")
        if not day_str:
            return jsonify({"ok": False, "error": "day is required (YYYY-MM-DD)"}), 400

        day = _parse_day(day_str)

        report = build_daily_report(
            day=day,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report, title="Daily Smart Farm Report")
        filename = f"daily_report_{day.date().isoformat()}.pdf"
        return _pdf_response(pdf_bytes, filename)

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# WEEKLY PDF
# =========================

@reports_pdf_bp.get("/weekly.pdf")
def weekly_pdf():
    """
    Preferred:
      /api/reports/weekly.pdf?week_start=2026-01-22&device_id=ESP32_01&bucket=day&parameters=temperature,ph

    Backward compatible:
      /api/reports/weekly.pdf?week_end=2026-01-24  (we convert to week_start = week_end - 6 days)
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = (request.args.get("bucket") or "day").strip().lower()
        parameters = _parse_parameters(request.args.get("parameters"))

        week_start_str = request.args.get("week_start")
        week_end_str = request.args.get("week_end")

        if not week_start_str and not week_end_str:
            return jsonify(
                {"ok": False, "error": "Provide week_start (YYYY-MM-DD) or week_end (YYYY-MM-DD)"},
            ), 400

        if week_start_str:
            week_start = _parse_day(week_start_str)
        else:
            week_end = _parse_day(week_end_str)  # type: ignore[arg-type]
            week_start = week_end - timedelta(days=6)

        report = build_weekly_report(
            week_start=week_start,   # ✅ FIXED: correct argument name
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report, title="Weekly Smart Farm Report")
        filename = f"weekly_report_starting_{week_start.date().isoformat()}.pdf"
        return _pdf_response(pdf_bytes, filename)

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# =========================
# PERIOD PDF
# =========================

@reports_pdf_bp.get("/period.pdf")
def period_pdf():
    """
    /api/reports/period.pdf?start=2026-01-20T00:00:00&end=2026-01-24T23:59:59&bucket=hour&parameters=ph,ec
    """
    try:
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = (request.args.get("bucket") or "hour").strip().lower()
        parameters = _parse_parameters(request.args.get("parameters"))

        start_str = request.args.get("start")
        end_str = request.args.get("end")
        if not start_str or not end_str:
            return jsonify({"ok": False, "error": "start and end are required (ISO8601)"}), 400

        start, end = parse_range_params(start_str, end_str)

        report = build_period_report(
            start=start,
            end=end,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report, title="Period Smart Farm Report")
        filename = f"period_report_{start.date().isoformat()}_to_{end.date().isoformat()}.pdf"
        return _pdf_response(pdf_bytes, filename)

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500
