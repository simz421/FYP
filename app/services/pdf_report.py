from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


# -----------------------------
# Small helpers (Pylance-safe)
# -----------------------------

def _safe(v: Any, default: Any = "") -> Any:
    return default if v is None else v


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _as_list(v: Any) -> List[Any]:
    return v if isinstance(v, list) else []


def _fmt_num(v: Any) -> str:
    if v is None:
        return "N/A"
    try:
        return f"{float(v):.2f}"
    except Exception:
        return str(v)


def _param_label(p: str) -> str:
    return str(p).replace("_", " ").title()

# Add page numbers and footer
def add_page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(doc.pagesize[0] - 20, 20, f"Page {doc.page}")
    canvas.restoreState()
    
# -----------------------------
# Tables (dynamic)
# -----------------------------

def _build_summary_table(parameters: List[str], summary: Dict[str, Any]) -> Table:
    headers = ["Parameter", "Avg", "Min", "Max", "Count"]
    rows: List[List[str]] = [headers]

    for p in parameters:
        s = _as_dict(summary.get(p))
        rows.append(
            [
                _param_label(p),
                _fmt_num(s.get("avg")),
                _fmt_num(s.get("min")),
                _fmt_num(s.get("max")),
                str(_safe(s.get("count"), 0)),
            ]
        )

    t = Table(rows, colWidths=[5.0 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ]
        )
    )
    return t


def _build_quality_table(parameters: List[str], quality: Dict[str, Any]) -> Table:
    headers = ["Parameter", "Bucket", "Expected", "Observed", "Missing", "Coverage %"]
    rows: List[List[str]] = [headers]

    for p in parameters:
        q = _as_dict(quality.get(p))
        rows.append(
            [
                _param_label(p),
                str(_safe(q.get("bucket"), "")),
                str(_safe(q.get("expected_buckets"), 0)),
                str(_safe(q.get("observed_buckets"), 0)),
                str(_safe(q.get("missing_buckets"), 0)),
                str(_safe(q.get("coverage_pct"), 0)),
            ]
        )

    t = Table(rows, colWidths=[5.0 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (1, -1), "LEFT"),
            ]
        )
    )
    return t


def _build_series_preview_table(series: List[Dict[str, Any]], max_rows: int = 12) -> Table:
    headers = ["Bucket Start", "Avg", "Min", "Max", "Count"]
    rows: List[List[str]] = [headers]

    if not series:
        rows.append(["(no data)", "", "", "", ""])
        t = Table(rows, colWidths=[6.0 * cm, 2.3 * cm, 2.3 * cm, 2.3 * cm, 2.3 * cm])
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey)]))
        return t

    take = series[:max_rows] if len(series) <= max_rows else (series[: max_rows // 2] + series[-(max_rows // 2) :])

    for p in take:
        rows.append(
            [
                str(_safe(p.get("bucket_start"), "")),
                _fmt_num(p.get("avg")),
                _fmt_num(p.get("min")),
                _fmt_num(p.get("max")),
                str(_safe(p.get("count"), 0)),
            ]
        )

    t = Table(rows, colWidths=[6.0 * cm, 2.3 * cm, 2.3 * cm, 2.3 * cm, 2.3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ]
        )
    )
    return t


def _render_recommendations_block(
    story: List[Any],
    styles,
    recommendations: Dict[str, Any],
    *,
    max_alerts: int = 8,
    max_actions_per_alert: int = 3,
) -> None:
    """
    Adds a readable recommendations section to the PDF.
    Sorts CRITICAL first, then WARNING.
    """
    items = _as_list(recommendations.get("items"))
    if not items:
        story.append(Paragraph("No recommendations available.", styles["BodyText"]))
        return

    def _rank_level(level: Any) -> int:
        lv = str(level or "").upper()
        if lv == "CRITICAL":
            return 0
        if lv == "WARNING":
            return 1
        return 2

    items_sorted = sorted(
        (_as_dict(x) for x in items),
        key=lambda it: (_rank_level(it.get("level")), str(it.get("parameter") or "")),
    )[:max_alerts]

    for it in items_sorted:
        alert_id = it.get("alert_id")
        param = _param_label(str(_safe(it.get("parameter"), "")))
        level = str(_safe(it.get("level"), "")).upper()

        story.append(Paragraph(f"<b>Alert #{alert_id} — {param} ({level})</b>", styles["BodyText"]))

        recs = _as_list(it.get("recommendations"))[:max_actions_per_alert]
        if not recs:
            story.append(Paragraph("No actions suggested.", styles["BodyText"]))
            story.append(Spacer(1, 0.15 * cm))
            continue

        for r in recs:
            r = _as_dict(r)
            title = str(_safe(r.get("title"), "Action"))
            action = str(_safe(r.get("action"), ""))
            rationale = str(_safe(r.get("rationale"), ""))
            priority = str(_safe(r.get("priority"), ""))
            confidence = str(_safe(r.get("confidence"), ""))

            story.append(
                Paragraph(
                    f"• <b>{title}</b> (priority: {priority}, confidence: {confidence})<br/>"
                    f"{action}<br/>"
                    f"<i>{rationale}</i>",
                    styles["BodyText"],
                )
            )

        story.append(Spacer(1, 0.25 * cm))

def _build_thresholds_table(parameters: List[str], thresholds: Dict[str, Any]) -> Table:
    headers = ["Parameter", "Min", "Max", "Scope", "Enabled"]
    rows = [headers]

    for p in parameters:
        t = thresholds.get(p, {})
        rows.append(
            [
                _param_label(p),
                _fmt_num(t.get("min")),
                _fmt_num(t.get("max")),
                str(_safe(t.get("scope"), "")),
                "Yes" if t.get("enabled") else "No",
            ]
        )

    table = Table(
        rows,
        colWidths=[5.0 * cm, 2.5 * cm, 2.5 * cm, 3.0 * cm, 2.0 * cm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ]
        )
    )
    return table

# -----------------------------
# PDF Renderer (public)
# -----------------------------

def render_report_pdf(report: Dict[str, Any], *, title: str = "Smart Farm Telemetry Report") -> bytes:
    styles = getSampleStyleSheet()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=title,
    )

    story: List[Any] = []

    # Header
    story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    story.append(Spacer(1, 0.3 * cm))

    scope = _as_dict(report.get("scope"))
    parameters = _as_list(scope.get("parameters"))
    parameters = [str(p).strip().lower() for p in parameters if str(p).strip()]
    if not parameters:
        parameters = []

    story.append(
        Paragraph(
            f"Period: <b>{_safe(scope.get('start'))}</b> to <b>{_safe(scope.get('end'))}</b><br/>"
            f"Device: <b>{_safe(scope.get('device_id'), 'ALL')}</b> | "
            f"Node: <b>{_safe(scope.get('node_id'), 'ALL')}</b> | "
            f"Bucket: <b>{_safe(scope.get('bucket'), '')}</b>",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 0.4 * cm))

    # Summary table (dynamic)
    summary = _as_dict(report.get("summary"))
    if parameters:
        story.append(Paragraph("<b>Summary Statistics</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))
        story.append(_build_summary_table(parameters, summary))
        story.append(Spacer(1, 0.4 * cm))

    # Data quality table (dynamic)
    quality = _as_dict(report.get("data_quality"))
    if parameters:
        story.append(Paragraph("<b>Data Quality</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))
        story.append(_build_quality_table(parameters, quality))
        story.append(Spacer(1, 0.4 * cm))
    # Thresholds table (dynamic)
    
    thresholds = _as_dict(report.get("thresholds"))

    if parameters and thresholds:
        story.append(Paragraph("<b>Active Thresholds</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))
        story.append(_build_thresholds_table(parameters, thresholds))
        story.append(Spacer(1, 0.4 * cm))

    # Alerts section
    alerts = _as_dict(report.get("alerts"))
    if alerts:
        story.append(Paragraph("<b>Alerts Summary (Period)</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))

        by_level = _as_dict(alerts.get("by_level"))

        story.append(
            Paragraph(
                f"Total alerts: <b>{_safe(alerts.get('total_alerts'), 0)}</b><br/>"
                f"WARNING: <b>{_safe(by_level.get('WARNING'), 0)}</b><br/>"
                f"CRITICAL: <b>{_safe(by_level.get('CRITICAL'), 0)}</b>",
                styles["BodyText"],
            )
        )
        story.append(Spacer(1, 0.2 * cm))

        top_params = _as_list(alerts.get("top_parameters"))
        if top_params:
            rows = [["Parameter", "Count"]]
            for item in top_params[:10]:
                d = _as_dict(item)
                rows.append([_param_label(str(_safe(d.get("parameter"), ""))), str(_safe(d.get("count"), 0))])

            t = Table(rows, colWidths=[10.0 * cm, 3.0 * cm])
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                    ]
                )
            )
            story.append(t)

        story.append(Spacer(1, 0.4 * cm))

        incidents = _as_list(alerts.get("incidents"))
        if incidents:
            story.append(Paragraph("<b>Recent Incidents</b>", styles["Heading3"]))
            story.append(Spacer(1, 0.2 * cm))

            for inc in incidents[:10]:
                d = _as_dict(inc)
                story.append(
                    Paragraph(
                        f"- <b>{_param_label(str(_safe(d.get('parameter'), '')))}</b> "
                        f"({str(_safe(d.get('level'), ''))}) "
                        f"{str(_safe(d.get('severity'), ''))}: "
                        f"{str(_safe(d.get('message'), ''))} "
                        f"<br/><i>{str(_safe(d.get('created_at'), ''))}</i>",
                        styles["BodyText"],
                    )
                )

            story.append(Spacer(1, 0.4 * cm))
    # Recommendations section 
    recommendations = _as_dict(report.get("recommendations"))
    if recommendations:
        story.append(Paragraph("<b>Recommendations</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))
        _render_recommendations_block(story, styles, recommendations, max_alerts=8, max_actions_per_alert=3)
        story.append(Spacer(1, 0.4 * cm))

    # Series preview per parameter (dynamic)
    series = _as_dict(report.get("series"))
    if parameters and series:
        story.append(Paragraph("<b>Aggregated Series Preview</b>", styles["Heading2"]))
        story.append(Spacer(1, 0.2 * cm))

        for p in parameters:
            story.append(Paragraph(f"<b>{_param_label(p)}</b>", styles["Heading3"]))
            story.append(Spacer(1, 0.15 * cm))
            story.append(_build_series_preview_table(_as_list(series.get(p)), max_rows=12))
            story.append(Spacer(1, 0.35 * cm))

    doc.build(story)
    return buf.getvalue()
