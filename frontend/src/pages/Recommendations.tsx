// frontend/src/pages/Recommendations.tsx
import { useEffect, useMemo, useState } from "react";
import {
  getLatestRecommendations,
  type RecommendationItem,
} from "../api/recommendations";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Select from "../ui/Select";

const LS_REC_CACHE = "nms_recs_cache_v1";
const LS_REC_CACHE_AT = "nms_recs_cache_at_v1";
const LS_TASKS = "nms_recs_tasks_v1";

type TaskStatus = "open" | "done" | "snoozed";

type Task = {
  id: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;

  title: string;
  detail: string;
  priority: "low" | "medium" | "high" | "critical";
  device_id?: string;
  node_id?: string | number;
  parameter?: string;
  source_alert_ids?: Array<number | string>;
  evidence?: any;

  label?: string;
  assignee?: string;
  notes?: string;
  snoozed_until?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function uid(prefix = "task") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(LS_TASKS, JSON.stringify(tasks || []));
    // eslint-disable-next-line no-empty
  } catch {}
}

function loadTasks(): Task[] {
  return safeJsonParse<Task[]>(localStorage.getItem(LS_TASKS), []);
}

function saveCache(recs: any) {
  try {
    localStorage.setItem(LS_REC_CACHE, JSON.stringify(recs || {}));
    localStorage.setItem(LS_REC_CACHE_AT, nowIso());
    // eslint-disable-next-line no-empty
  } catch {}
}

function loadCache(): { json: any | null; at: string | null } {
  try {
    const s = localStorage.getItem(LS_REC_CACHE);
    const at = localStorage.getItem(LS_REC_CACHE_AT);
    return { json: s ? JSON.parse(s) : null, at };
  } catch {
    return { json: null, at: null };
  }
}

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  } catch {
    return ts;
  }
}

function toneForPriority(p: any): "neutral" | "good" | "warn" | "bad" {
  const pr = String(p || "").toLowerCase();
  if (pr === "critical" || pr === "high") return "bad";
  if (pr === "medium") return "warn";
  if (pr === "low") return "good";
  return "neutral";
}

function statusTone(s: TaskStatus): "neutral" | "good" | "warn" | "bad" {
  if (s === "done") return "good";
  if (s === "snoozed") return "warn";
  return "neutral";
}

function exportCsv(filename: string, rows: Record<string, any>[]) {
  const colSet = rows.reduce((set: Set<string>, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set<string>());
  const cols: string[] = Array.from(colSet);

  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n"))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csv = [cols.join(",")]
    .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(",")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Recommendations() {
  const [deviceId, setDeviceId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [limit, setLimit] = useState(30);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("open");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | "critical" | "high" | "medium" | "low"
  >("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [bundleAt, setBundleAt] = useState<string | null>(null);
  const [rawBundle, setRawBundle] = useState<any>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);

  useEffect(() => {
    setTasks(loadTasks());
    const cached = loadCache();
    if (cached.json) setRawBundle(cached.json);
    if (cached.at) setBundleAt(cached.at);
  }, []);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Auto-un-snooze
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status !== "snoozed" || !t.snoozed_until) return t;
          const due = new Date(t.snoozed_until).getTime();
          if (Number.isNaN(due)) return t;
          if (Date.now() >= due) {
            return {
              ...t,
              status: "open",
              snoozed_until: null,
              updated_at: nowIso(),
            };
          }
          return t;
        }),
      );
    }, 10_000);

    return () => window.clearInterval(timer);
  }, []);

  const recommendations: RecommendationItem[] = useMemo(() => {
    const b = rawBundle;
    const items =
      (Array.isArray(b?.items) ? b.items : null) ||
      (Array.isArray(b?.recommendations) ? b.recommendations : null) ||
      [];
    return items;
  }, [rawBundle]);

  const kpi = useMemo(() => {
    const open = tasks.filter((t) => t.status === "open").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const snoozed = tasks.filter((t) => t.status === "snoozed").length;
    const critical = tasks.filter(
      (t) => t.status === "open" && t.priority === "critical",
    ).length;
    const high = tasks.filter(
      (t) => t.status === "open" && t.priority === "high",
    ).length;
    return { open, done, snoozed, critical, high };
  }, [tasks]);

  async function refresh() {
    setErr(null);
    setLoading(true);
    try {
      const res = await getLatestRecommendations({
        device_id: deviceId.trim() || undefined,
        node_id: nodeId.trim() || undefined,
        limit,
      });

      if (!res.ok) throw new Error(res.error);

      setRawBundle(res.data);
      const at = nowIso();
      setBundleAt(at);
      saveCache(res.data);
    } catch (e: any) {
      setErr(e?.message || "Failed to load recommendations");

      // offline fallback
      const cached = loadCache();
      if (cached.json) setRawBundle(cached.json);
      if (cached.at) setBundleAt(cached.at);
    } finally {
      setLoading(false);
    }
  }

  function recToTask(r: RecommendationItem): Task {
    const title = r.title || r.label || "Recommendation";
    const detail = r.message || r.detail || r.action || JSON.stringify(r);
    const priority = (r.priority as any) || "medium";

    return {
      id: uid("rec"),
      status: "open",
      created_at: nowIso(),
      updated_at: nowIso(),
      title,
      detail,
      priority,
      device_id: r.device_id,
      node_id: r.node_id,
      parameter: r.parameter,
      source_alert_ids: r.source_alert_ids,
      evidence: r.evidence,
      label: r.label || "",
      assignee: "",
      notes: "",
      snoozed_until: null,
    };
  }

  function updateTask(id: string, patch: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, ...patch, updated_at: nowIso() } : t,
      ),
    );
  }

  function addTaskFromRec(r: RecommendationItem) {
    const t = recToTask(r);

    const dupe = tasks.find(
      (x) =>
        x.status === "open" &&
        x.title === t.title &&
        (x.device_id || "") === (t.device_id || "") &&
        (x.parameter || "") === (t.parameter || ""),
    );

    if (dupe) {
      setSelected(dupe);
      return;
    }

    setTasks([t, ...tasks]);
    setSelected(t);
  }

  function markDone(t: Task) {
    updateTask(t.id, { status: "done", snoozed_until: null });
  }

  function reopen(t: Task) {
    updateTask(t.id, { status: "open", snoozed_until: null });
  }

  function snooze(t: Task, minutes: number) {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    updateTask(t.id, { status: "snoozed", snoozed_until: until });
  }

  function openAlerts(t: Task) {
    const q = new URLSearchParams();
    if (t.device_id) q.set("device_id", String(t.device_id));
    q.set("active_only", "1");
    window.location.href = `/alerts?${q.toString()}`;
  }

  function openTopology(t: Task) {
    const q = new URLSearchParams();
    if (t.device_id) q.set("device_id", String(t.device_id));
    window.location.href = `/topology/pro?${q.toString()}`;
  }

  const filteredTasks = useMemo(() => {
    const s = search.trim().toLowerCase();

    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;
      if (!s) return true;

      const hay = [
        t.title,
        t.detail,
        t.device_id || "",
        t.parameter || "",
        t.label || "",
        t.assignee || "",
        t.notes || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(s);
    });
  }, [tasks, statusFilter, priorityFilter, search]);

  return (
    <div>
      {/* Toolbar */}
      <div className="nms-toolbar">
        <div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2 className="nms-title" style={{ margin: 0 }}>
              Recommendations
            </h2>
            <Badge tone="neutral">Ops To-Do Inbox</Badge>
            {kpi.critical > 0 ? (
              <Badge tone="bad">CRITICAL {kpi.critical}</Badge>
            ) : (
              <Badge tone="good">HEALTHY</Badge>
            )}
            {loading ? (
              <Badge tone="info">LOADING…</Badge>
            ) : (
              <Badge tone="neutral">READY</Badge>
            )}
          </div>

          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Convert incidents + predictive risk into actionable tasks
            (offline-first with local task queue).
          </div>

          {bundleAt ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              Last update:{" "}
              <b style={{ color: "var(--text)" }}>{fmtTs(bundleAt)}</b>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              exportCsv(
                `recommendations_tasks_${new Date().toISOString().slice(0, 10)}.csv`,
                (tasks || []).map((t) => ({
                  id: t.id,
                  status: t.status,
                  priority: t.priority,
                  title: t.title,
                  device_id: t.device_id || "",
                  parameter: t.parameter || "",
                  label: t.label || "",
                  assignee: t.assignee || "",
                  snoozed_until: t.snoozed_until || "",
                  created_at: t.created_at,
                  updated_at: t.updated_at,
                  notes: t.notes || "",
                })),
              );
            }}
          >
            Export CSV
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              const t: Task = {
                id: uid("manual"),
                status: "open",
                created_at: nowIso(),
                updated_at: nowIso(),
                title: "Manual task",
                detail: "Add notes and assign this task.",
                priority: "medium",
                label: "",
                assignee: "",
                notes: "",
                snoozed_until: null,
              };
              setTasks([t, ...tasks]);
              setSelected(t);
            }}
          >
            New Task
          </Button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#9f1239",
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          {err}
        </div>
      ) : null}

      {/* KPI Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Card title="Open" subtitle="Active tasks">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{kpi.open}</div>
        </Card>
        <Card title="Done" subtitle="Completed">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{kpi.done}</div>
        </Card>
        <Card title="Snoozed" subtitle="Deferred">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{kpi.snoozed}</div>
        </Card>
        <Card title="Critical Open" subtitle="Immediate action">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{kpi.critical}</div>
        </Card>
        <Card title="High Open" subtitle="Priority attention">
          <div style={{ fontSize: 28, fontWeight: 950 }}>{kpi.high}</div>
        </Card>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}
      >
        {/* Left: Builder + Suggestions */}
        <Card
          title="Suggestion Builder"
          subtitle="Fetch latest recommendations (offline cached) and convert into tasks"
          right={
            <Badge tone="neutral">{recommendations.length} suggestions</Badge>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 140px",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Device ID (optional)
              </div>
              <Input
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="ESP32_01"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Node ID (optional)
              </div>
              <Input
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Limit
              </div>
              <Select
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="50">50</option>
              </Select>
            </div>
          </div>

          <div
            style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <Button
              variant="primary"
              onClick={() => refresh()}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load Suggestions"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => refresh()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {recommendations.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Load suggestions to see recommended actions generated by the
                backend.
              </div>
            ) : (
              recommendations.slice(0, 12).map((r, idx) => {
                const pr = (r.priority || "medium") as any;
                const tone = toneForPriority(pr);
                const title = r.title || r.label || `Recommendation ${idx + 1}`;
                const detail = r.message || r.detail || r.action || "—";

                return (
                  <div
                    key={String(r.id ?? idx)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      padding: 12,
                      background: "rgba(255,255,255,0.75)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 950 }}>{title}</div>
                      <Badge tone={tone as any}>
                        {String(pr).toUpperCase()}
                      </Badge>
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: "var(--muted)",
                        lineHeight: 1.55,
                      }}
                    >
                      {detail}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {r.device_id ? (
                        <Badge tone="neutral">Device {r.device_id}</Badge>
                      ) : null}
                      {r.parameter ? (
                        <Badge tone="neutral">{r.parameter}</Badge>
                      ) : null}
                      <div style={{ marginLeft: "auto" }}>
                        <Button
                          variant="secondary"
                          onClick={() => addTaskFromRec(r)}
                        >
                          Create Task
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right: Inbox */}
        <Card
          title="Ops Inbox"
          subtitle="Filter, assign, snooze, and close tasks (offline-first)"
          right={<Badge tone="neutral">{filteredTasks.length} shown</Badge>}
        >
          {/* Filters */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1.3fr",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Status
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="open">Open</option>
                <option value="snoozed">Snoozed</option>
                <option value="done">Done</option>
                <option value="all">All</option>
              </Select>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Priority
              </div>
              <Select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
              >
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Search
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="device, irrigation, soil, network…"
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ padding: "10px 0" }}>Task</th>
                  <th style={{ padding: "10px 0" }}>Priority</th>
                  <th style={{ padding: "10px 0" }}>Status</th>
                  <th style={{ padding: "10px 0" }}>Device</th>
                  <th style={{ padding: "10px 0" }}>Owner</th>
                  <th style={{ padding: "10px 0" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 12, color: "var(--muted)" }}
                    >
                      No tasks match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.slice(0, 80).map((t) => {
                    return (
                      <tr
                        key={t.id}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "10px 0" }}>
                          <div style={{ fontWeight: 950 }}>{t.title}</div>
                          <div style={{ marginTop: 4, color: "var(--muted)" }}>
                            {t.label ? (
                              <b style={{ color: "var(--text)" }}>{t.label}</b>
                            ) : null}
                            {t.label ? " • " : ""}
                            updated {fmtTs(t.updated_at)}
                          </div>
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          <Badge tone={toneForPriority(t.priority) as any}>
                            {String(t.priority).toUpperCase()}
                          </Badge>
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          <Badge tone={statusTone(t.status) as any}>
                            {t.status.toUpperCase()}
                            {t.status === "snoozed" && t.snoozed_until
                              ? ` • until ${new Date(t.snoozed_until).toLocaleTimeString()}`
                              : ""}
                          </Badge>
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          {t.device_id ? (
                            <>
                              <b>{t.device_id}</b>
                              {t.parameter ? (
                                <span style={{ color: "var(--muted)" }}>
                                  {" "}
                                  • {t.parameter}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          {t.assignee || "—"}
                        </td>

                        <td style={{ padding: "10px 0" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Button
                              variant="secondary"
                              onClick={() => setSelected(t)}
                            >
                              View
                            </Button>

                            {t.status !== "done" ? (
                              <Button
                                variant="primary"
                                onClick={() => markDone(t)}
                              >
                                Done
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => reopen(t)}
                              >
                                Reopen
                              </Button>
                            )}

                            {t.status !== "snoozed" ? (
                              <Button
                                variant="secondary"
                                onClick={() => snooze(t, 60)}
                              >
                                Snooze 1h
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              Tip: Use <b>View</b> to open the drawer with notes, assignment,
              and drilldowns.
            </div>
          </div>
        </Card>
      </div>

      {/* Drawer */}
      {selected ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.40)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 60,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: "min(560px, 96vw)",
              height: "100%",
              background: "#fff",
              borderLeft: "1px solid var(--border)",
              padding: 14,
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 950, fontSize: 16 }}>
                  {selected.title}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Badge tone={toneForPriority(selected.priority) as any}>
                    {String(selected.priority).toUpperCase()}
                  </Badge>
                  <Badge tone={statusTone(selected.status) as any}>
                    {selected.status.toUpperCase()}
                  </Badge>
                  {selected.device_id ? (
                    <Badge tone="neutral">Device {selected.device_id}</Badge>
                  ) : null}
                  {selected.parameter ? (
                    <Badge tone="neutral">{selected.parameter}</Badge>
                  ) : null}
                </div>
              </div>

              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>

            <div style={{ marginTop: 12 }}>
              <Card
                title="Details"
                subtitle={`Created ${fmtTs(selected.created_at)} • Updated ${fmtTs(selected.updated_at)}`}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    lineHeight: 1.6,
                  }}
                >
                  {selected.detail}
                </div>
              </Card>
            </div>

            <div style={{ marginTop: 12 }}>
              <Card
                title="Ops Fields"
                subtitle="Label, assignee, and investigation notes"
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "var(--muted)",
                        marginBottom: 6,
                      }}
                    >
                      Label
                    </div>
                    <Input
                      value={selected.label || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelected({ ...selected, label: v });
                        updateTask(selected.id, { label: v });
                      }}
                      placeholder="irrigation, network, sensor…"
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "var(--muted)",
                        marginBottom: 6,
                      }}
                    >
                      Assignee
                    </div>
                    <Input
                      value={selected.assignee || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelected({ ...selected, assignee: v });
                        updateTask(selected.id, { assignee: v });
                      }}
                      placeholder="Technician A"
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "var(--muted)",
                        marginBottom: 6,
                      }}
                    >
                      Notes
                    </div>
                    <textarea
                      value={selected.notes || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelected({ ...selected, notes: v });
                        updateTask(selected.id, { notes: v });
                      }}
                      placeholder="Investigation notes / actions taken…"
                      style={{
                        width: "100%",
                        minHeight: 120,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "#fff",
                        resize: "vertical",
                      }}
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Button variant="primary" onClick={() => openAlerts(selected)}>
                Open Alerts
              </Button>
              <Button
                variant="secondary"
                onClick={() => openTopology(selected)}
              >
                Open Topology Pro
              </Button>

              {selected.status !== "done" ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    markDone(selected);
                    setSelected({ ...selected, status: "done" });
                  }}
                >
                  Mark Done
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    reopen(selected);
                    setSelected({ ...selected, status: "open" });
                  }}
                >
                  Reopen
                </Button>
              )}

              <Button
                variant="secondary"
                onClick={() => {
                  snooze(selected, 60);
                  setSelected({
                    ...selected,
                    status: "snoozed",
                    snoozed_until: new Date(
                      Date.now() + 60 * 60_000,
                    ).toISOString(),
                  });
                }}
              >
                Snooze 1h
              </Button>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary
                style={{ cursor: "pointer", fontWeight: 950, fontSize: 12 }}
              >
                Evidence / Raw
              </summary>
              <pre
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  background: "#0b1220",
                  color: "#e5e7eb",
                  borderRadius: 14,
                  padding: 12,
                  overflowX: "auto",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {JSON.stringify(selected, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
