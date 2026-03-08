from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from datetime import timedelta

from flask import Blueprint, jsonify, request, make_response

from app.services.reports_service import (
    build_daily_report,
    build_weekly_report,
    build_period_report,
)

# If your PDF generator is named differently, adjust this import:
# - some projects use: from app.services.pdf_report import render_report_pdf
# - others use: from app.services.reports_pdf import render_report_pdf
from app.services.pdf_report import render_report_pdf


reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


# -----------------------------
# Helpers
# -----------------------------

def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(v)


def _parse_iso_date(s: str) -> datetime:
    """
    Accepts:
      - YYYY-MM-DD
      - ISO datetime (we will take the date portion)
    Returns a datetime at 00:00:00.
    """
    if not s:
        raise ValueError("Missing date")
    s = s.strip()
    # If ISO datetime, keep first 10 chars for date
    if len(s) >= 10:
        s = s[:10]
    return datetime.fromisoformat(s)


def _parse_iso_datetime(s: str) -> datetime:
    """
    Accepts:
      - YYYY-MM-DD
      - YYYY-MM-DDTHH:MM:SS
      - YYYY-MM-DDTHH:MM:SSZ
      - YYYY-MM-DDTHH:MM:SS+00:00
    Returns naive datetime.
    """
    if not s:
        raise ValueError("Missing datetime")
    s = s.strip().replace("Z", "+00:00")
    if len(s) == 10:
        return datetime.fromisoformat(s)
    return datetime.fromisoformat(s).replace(tzinfo=None)


def _parse_parameters_param(raw: Optional[str]) -> Optional[List[str]]:
    """
    parameters=temperature,humidity,ph
    Returns list of normalized parameter names.
    """
    if not raw:
        return None
    parts = [p.strip().lower() for p in raw.split(",")]
    parts = [p for p in parts if p]
    return parts or None


# -----------------------------
# JSON endpoints
# -----------------------------

@reports_bp.get("/daily")
def get_daily_report():
    """
    GET /api/reports/daily?day=2026-01-24&device_id=ESP32_01&bucket=hour&parameters=temperature,humidity
    """
    try:
        day_str = request.args.get("day")
        if not day_str:
            return jsonify({"ok": False, "error": "day is required (YYYY-MM-DD)"}), 400

        day = _parse_iso_date(day_str)
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "hour"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        data = build_daily_report(
            day=day,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )
        return jsonify(data), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


@reports_bp.get("/weekly")
def get_weekly_report():
    """
    Preferred:
      GET /api/reports/weekly?week_start=2026-01-22&device_id=ESP32_01&bucket=day&parameters=temperature,ph

    Backward compatible:
      GET /api/reports/weekly?week_end=2026-01-24  (we convert to week_start = week_end - 6 days)
    """
    try:
        week_start_str = request.args.get("week_start")
        week_end_str = request.args.get("week_end")

        if not week_start_str and not week_end_str:
            return jsonify({"ok": False, "error": "Provide week_start (YYYY-MM-DD) or week_end (YYYY-MM-DD)"}), 400

        if week_start_str:
            week_start = _parse_iso_date(week_start_str)
        else:
            # week_end provided
            week_end = _parse_iso_date(week_end_str)  # type: ignore[arg-type]
            week_start = week_end - timedelta(days=6)

        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "day"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        data = build_weekly_report(
            week_start=week_start,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )
        return jsonify(data), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500

@reports_bp.get("/period")
def get_period_report():
    """
    GET /api/reports/period?start=2026-01-24T00:00:00&end=2026-01-25T00:00:00&bucket=hour&parameters=temperature,ph
    """
    try:
        start_str = request.args.get("start")
        end_str = request.args.get("end")
        if not start_str or not end_str:
            return jsonify({"ok": False, "error": "start and end are required (ISO8601)"}), 400

        start = _parse_iso_datetime(start_str)
        end = _parse_iso_datetime(end_str)

        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "hour"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        data = build_period_report(
            start=start,
            end=end,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )
        return jsonify(data), 200

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


# -----------------------------
# PDF endpoints
# -----------------------------

@reports_bp.get("/daily.pdf")
def get_daily_report_pdf():
    """
    GET /api/reports/daily.pdf?day=2026-01-24&device_id=ESP32_01&bucket=hour&parameters=temperature,humidity
    """
    try:
        day_str = request.args.get("day")
        if not day_str:
            return jsonify({"ok": False, "error": "day is required (YYYY-MM-DD)"}), 400

        day = _parse_iso_date(day_str)
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "hour"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        report = build_daily_report(
            day=day,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report)

        resp = make_response(pdf_bytes)
        resp.headers["Content-Type"] = "application/pdf"
        resp.headers["Content-Disposition"] = f'attachment; filename="daily_report_{day_str}.pdf"'
        return resp

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


@reports_bp.get("/weekly.pdf")
def get_weekly_report_pdf():
    """
    GET /api/reports/weekly.pdf?week_start=2026-01-22&device_id=ESP32_01&bucket=day&parameters=temperature,ph
    """
    try:
        ws_str = request.args.get("week_start")
        if not ws_str:
            return jsonify({"ok": False, "error": "week_start is required (YYYY-MM-DD)"}), 400

        week_start = _parse_iso_date(ws_str)
        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "day"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        report = build_weekly_report(
            week_start=week_start,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report)

        resp = make_response(pdf_bytes)
        resp.headers["Content-Type"] = "application/pdf"
        resp.headers["Content-Disposition"] = f'attachment; filename="weekly_report_{ws_str}.pdf"'
        return resp

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500


@reports_bp.get("/period.pdf")
def get_period_report_pdf():
    """
    GET /api/reports/period.pdf?start=...&end=...&bucket=hour&parameters=soil_moisture
    """
    try:
        start_str = request.args.get("start")
        end_str = request.args.get("end")
        if not start_str or not end_str:
            return jsonify({"ok": False, "error": "start and end are required (ISO8601)"}), 400

        start = _parse_iso_datetime(start_str)
        end = _parse_iso_datetime(end_str)

        device_id = request.args.get("device_id")
        node_id = _to_int(request.args.get("node_id"))
        bucket = request.args.get("bucket") or "hour"
        parameters = _parse_parameters_param(request.args.get("parameters"))

        report = build_period_report(
            start=start,
            end=end,
            bucket=bucket,
            device_id=device_id,
            node_id=node_id,
            parameters=parameters,
        )

        pdf_bytes = render_report_pdf(report)

        resp = make_response(pdf_bytes)
        resp.headers["Content-Type"] = "application/pdf"
        resp.headers["Content-Disposition"] = 'attachment; filename="period_report.pdf"'
        return resp

    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Server error"}), 500
