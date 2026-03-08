// frontend/src/pages/Reports.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  downloadPdf,
  getDailyReport,
  getDailyReportPdfUrl,
  getPeriodReport,
  getPeriodReportPdfUrl,
  getWeeklyReport,
  getWeeklyReportPdfUrl,
  type ReportBucket,
  type ReportJson,
  type ReportType,
} from "../api/reports";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Select from "../ui/Select";

const LS_LAST_REPORT = "nms_reports_last_json_v1";
const LS_LAST_REPORT_AT = "nms_reports_last_json_at_v1";

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isoStartOfDay(ymd: string) {
  return `${ymd}T00:00:00`;
}
function isoEndOfDay(ymd: string) {
  return `${ymd}T23:59:59`;
}

function saveLast(json: any) {
  try {
    localStorage.setItem(LS_LAST_REPORT, JSON.stringify(json || {}));
    localStorage.setItem(LS_LAST_REPORT_AT, new Date().toISOString());
  } catch {
    // ignore
  }
}

function loadLast(): { json: ReportJson | null; at: string | null } {
  try {
    const s = localStorage.getItem(LS_LAST_REPORT);
    const at = localStorage.getItem(LS_LAST_REPORT_AT);
    const json = s ? (JSON.parse(s) as ReportJson) : null;
    return { json, at };
  } catch {
    return { json: null, at: null };
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
        {label}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

export default function Reports() {
  const [type, setType] = useState<ReportType>("daily");
  const [bucket, setBucket] = useState<ReportBucket>("hour");

  // Scope filters
  const [deviceId, setDeviceId] = useState("");
  const [nodeId, setNodeId] = useState("");

  const [parameters, setParameters] = useState(
    "temperature,humidity,soil_moisture",
  );

  // Date controls
  const [day, setDay] = useState(todayYmd());
  const [weekStart, setWeekStart] = useState(todayYmd());
  const [periodStart, setPeriodStart] = useState(isoStartOfDay(todayYmd()));
  const [periodEnd, setPeriodEnd] = useState(isoEndOfDay(todayYmd()));

  // Results
  const [json, setJson] = useState<ReportJson | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const cached = loadLast();
    if (cached.json) setJson(cached.json);
    if (cached.at) setLastAt(cached.at);
  }, []);

  const queryCommon = useMemo(() => {
    return {
      device_id: deviceId.trim() || undefined,
      node_id: nodeId.trim() || undefined,
      bucket,
      parameters: parameters.trim() || undefined,
    };
  }, [bucket, deviceId, nodeId, parameters]);

  async function runJson() {
    setErr(null);
    setLoading(true);
    try {
      let res: ReportJson;

      if (type === "daily") {
        res = await getDailyReport({ ...queryCommon, day });
      } else if (type === "weekly") {
        res = await getWeeklyReport({ ...queryCommon, week_start: weekStart });
      } else {
        res = await getPeriodReport({
          ...queryCommon,
          start: periodStart,
          end: periodEnd,
        });
      }

      if (!res?.ok) {
        throw new Error(res?.error || "Report generation failed");
      }

      setJson(res);
      const now = new Date().toISOString();
      setLastAt(now);
      saveLast(res);
    } catch (e: any) {
      setErr(e?.message || "Failed to generate report");

      // offline-safe fallback
      const cached = loadLast();
      if (cached.json) setJson(cached.json);
      if (cached.at) setLastAt(cached.at);
    } finally {
      setLoading(false);
    }
  }

  async function runPdf() {
    setErr(null);
    setDownloading(true);
    try {
      let url = "";
      let filename = "report.pdf";

      if (type === "daily") {
        url = getDailyReportPdfUrl({ ...queryCommon, day });
        filename = `daily_report_${day}.pdf`;
      } else if (type === "weekly") {
        url = getWeeklyReportPdfUrl({ ...queryCommon, week_start: weekStart });
        filename = `weekly_report_${weekStart}.pdf`;
      } else {
        url = getPeriodReportPdfUrl({
          ...queryCommon,
          start: periodStart,
          end: periodEnd,
        });
        filename = `period_report_${(periodStart || "start").slice(0, 10)}_${(periodEnd || "end").slice(0, 10)}.pdf`;
      }

      await downloadPdf(url, filename);
    } catch (e: any) {
      setErr(e?.message || "PDF download failed");
    } finally {
      setDownloading(false);
    }
  }

  const scope = json?.scope || null;
  const alerts = json?.alerts || null;
  const recs = json?.recommendations || null;
  const quality = json?.data_quality || null;

  const statusTone =
    json?.ok === true ? "good" : err ? "bad" : ("neutral" as any);

  return (
    <div className="nms-page">
      {/* Header */}
      <div className="nms-toolbar">
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <h2 style={{ fontSize: 22, fontWeight: 950, margin: 0 }}>
              Reports Console
            </h2>
            <Badge tone={statusTone as any}>
              {json?.ok ? "READY" : err ? "ERROR" : "IDLE"}
            </Badge>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            Generate JSON reports + export PDF (offline-first) •{" "}
            <b>/api/reports</b>
          </div>
          {lastAt ? (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Last cached report: <b>{new Date(lastAt).toLocaleString()}</b>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={runJson} disabled={loading}>
            {loading ? "Generating…" : "Generate JSON"}
          </Button>
          <Button variant="secondary" onClick={runPdf} disabled={downloading}>
            {downloading ? "Downloading…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {err ? (
        <div style={{ marginTop: 12 }}>
          <Card
            title="Report Error"
            subtitle="Offline-first: showing last cached report if available."
            style={{
              borderColor: "#fecaca",
              background: "#fff1f2",
            }}
          >
            <div style={{ color: "#9f1239", fontSize: 13, fontWeight: 800 }}>
              {err}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Body */}
      <div className="nms-grid-2">
        {/* Left: Controls */}
        <Card
          title="Report Builder"
          accent="blue"
          subtitle="Choose report type, scope filters and time window."
        >
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Report type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="period">Custom Period</option>
              </Select>
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Field label="Bucket">
                <Select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value as any)}
                >
                  <option value="minute">Minute</option>
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                </Select>
              </Field>

              <Field label="Parameters (comma list)">
                <Input
                  value={parameters}
                  onChange={(e) => setParameters(e.target.value)}
                  placeholder="temperature,humidity,soil_moisture"
                />
              </Field>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Field label="Device ID (optional)">
                <Input
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="ESP32_01"
                />
              </Field>

              <Field label="Node ID (optional)">
                <Input
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                  placeholder="1"
                />
              </Field>
            </div>

            {/* Type-specific date controls */}
            {type === "daily" ? (
              <Field label="Day">
                <Input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </Field>
            ) : null}

            {type === "weekly" ? (
              <Field
                label="Week start"
                hint="Backend expects week_start (YYYY-MM-DD)"
              >
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                />
              </Field>
            ) : null}

            {type === "period" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Start (ISO)">
                  <Input
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    placeholder="2026-02-23T00:00:00"
                  />
                </Field>
                <Field label="End (ISO)">
                  <Input
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    placeholder="2026-02-23T23:59:59"
                  />
                </Field>

                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Tip: for quick “full day”, use{" "}
                  <b>{isoStartOfDay(todayYmd())}</b> →{" "}
                  <b>{isoEndOfDay(todayYmd())}</b>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Right: Preview */}
        <Card
          title="Report Preview"
          accent="slate"
          style={{
            background: "#f1f5f9",
          }}
          subtitle={
            json?.ok
              ? "Summary, quality, incidents and recommendations."
              : "Generate a report to see preview."
          }
          right={
            json?.ok ? (
              <Badge tone="good">OK</Badge>
            ) : (
              <Badge tone="neutral">—</Badge>
            )
          }
        >
          {!json ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Generate a report to see scope, thresholds, alerts and
              recommendations.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {/* Scope */}
              <Card
                title="Scope"
                subtitle="Applied filters and time window"
                style={{ background: "#f9fafb" }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div>
                    <b>Device:</b> {scope?.device_id ?? "—"}
                  </div>
                  <div>
                    <b>Node:</b> {scope?.node_id ?? "—"}
                  </div>
                  <div>
                    <b>Start:</b> {scope?.start ?? "—"}
                  </div>
                  <div>
                    <b>End:</b> {scope?.end ?? "—"}
                  </div>
                  <div>
                    <b>Bucket:</b> {scope?.bucket ?? "—"}
                  </div>
                  <div>
                    <b>Parameters:</b>{" "}
                    {Array.isArray(scope?.parameters)
                      ? scope!.parameters!.join(", ")
                      : "—"}
                  </div>
                </div>
              </Card>

              {/* Data quality */}
              <Card
                title="Data Quality"
                subtitle="Coverage + missing buckets (top 6 parameters)"
                style={{ background: "#f9fafb" }}
              >
                {!quality ? (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>—</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {Object.keys(quality)
                      .slice(0, 6)
                      .map((k) => {
                        const q = (quality as any)[k];
                        const cov =
                          typeof q?.coverage_pct === "number"
                            ? q.coverage_pct
                            : null;

                        const tone =
                          cov == null
                            ? "neutral"
                            : cov >= 90
                              ? "good"
                              : cov >= 70
                                ? "warn"
                                : "bad";

                        return (
                          <div
                            key={k}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontWeight: 900, color: "#374151" }}>
                              {k}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <Badge tone={tone as any}>
                                {cov == null ? "—" : `${cov}%`}
                              </Badge>
                              <span style={{ color: "#6b7280" }}>
                                missing: {q?.missing_buckets ?? "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Card>

              {/* Alerts summary */}
              <Card
                title="Incident Summary"
                subtitle="What went wrong in the selected time window"
                style={{ background: "#f9fafb" }}
              >
                {!alerts ? (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>—</div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div>
                      <b>Total incidents:</b>{" "}
                      {alerts?.total_incidents ?? alerts?.count ?? "—"}
                    </div>
                    <div>
                      <b>By severity:</b>{" "}
                      {alerts?.by_severity
                        ? JSON.stringify(alerts.by_severity)
                        : "—"}
                    </div>
                    <div>
                      <b>Top incidents:</b>{" "}
                      {Array.isArray(alerts?.incidents)
                        ? alerts.incidents.length
                        : "—"}
                    </div>
                  </div>
                )}
              </Card>

              {/* Recommendations */}
              <Card
                title="Recommendations"
                subtitle="Actionable suggestions produced by backend engines"
                style={{ background: "#f9fafb" }}
              >
                {!recs ? (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>—</div>
                ) : Array.isArray(recs) ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {recs.slice(0, 6).map((r: any, idx: number) => (
                      <div key={idx} style={{ fontSize: 12, color: "#374151" }}>
                        <div style={{ fontWeight: 900 }}>
                          {r?.title || r?.label || `Recommendation ${idx + 1}`}
                        </div>
                        <div style={{ color: "#6b7280", marginTop: 3 }}>
                          {r?.message ||
                            r?.detail ||
                            r?.action ||
                            JSON.stringify(r)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre
                    style={{
                      fontSize: 12,
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      padding: 10,
                      borderRadius: 12,
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(recs, null, 2)}
                  </pre>
                )}
              </Card>

              {/* Raw JSON */}
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                    color: "#374151",
                  }}
                >
                  Raw JSON
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    padding: 10,
                    borderRadius: 12,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(json, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
