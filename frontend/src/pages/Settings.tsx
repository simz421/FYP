import { useEffect, useMemo, useState } from "react";
import {
  fetchDevices,
  registerDevice,
  type DeviceRow,
  computeOnlineState,
} from "../api/devices";
import {
  fetchSensorProfiles,
  upsertSensorProfile,
  patchSensorProfile,
  deleteSensorProfile,
  type SensorProfileRow,
} from "../api/settings_sensors";
import {
  fetchThresholds,
  upsertThreshold,
  type ThresholdRow,
} from "../api/settings_thresholds";

import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Select from "../ui/Select";

type TabKey = "devices" | "sensors" | "thresholds";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function fmtAgo(s?: string | null) {
  if (!s) return "—";
  const ms = Date.now() - new Date(s).getTime();
  if (!Number.isFinite(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(15,23,42,0.28)" : "var(--border)"}`,
        background: active
          ? "linear-gradient(180deg, var(--primary), var(--primary2))"
          : "rgba(15,23,42,0.04)",
        color: active ? "#fff" : "var(--text)",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
        boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<TabKey>("devices");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // =========================
  // DEVICES
  // =========================
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [devForm, setDevForm] = useState({
    device_id: "",
    name: "",
    node_type: "sensor",
    ip_address: "",
    heartbeat_interval_sec: "30",
    last_rssi: "",
  });

  async function loadDevices() {
    setErr(null);
    const res = await fetchDevices();
    setDevices(Array.isArray(res.data) ? res.data : []);
  }

  async function submitRegister() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        device_id: devForm.device_id.trim(),
        name: devForm.name.trim() || undefined,
        node_type: devForm.node_type.trim() || undefined,
        ip_address: devForm.ip_address.trim() || undefined,
        heartbeat_interval_sec: devForm.heartbeat_interval_sec
          ? Number(devForm.heartbeat_interval_sec)
          : undefined,
        last_rssi: devForm.last_rssi ? Number(devForm.last_rssi) : undefined,
      };
      await registerDevice(payload);
      await loadDevices();
      setDevForm((p) => ({ ...p, device_id: "", name: "" }));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to register device");
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // SENSOR PROFILES
  // =========================
  const [profiles, setProfiles] = useState<SensorProfileRow[]>([]);
  const [profileFilterDevice, setProfileFilterDevice] = useState("");
  const [profileForm, setProfileForm] = useState({
    device_id: "",
    parameter: "",
    unit: "",
    node_id: "",
    is_enabled: true,
  });

  async function loadProfiles() {
    setErr(null);
    const rows = await fetchSensorProfiles({
      device_id: profileFilterDevice.trim() || undefined,
    });
    setProfiles(rows);
  }

  async function submitProfile() {
    setBusy(true);
    setErr(null);
    try {
      await upsertSensorProfile({
        device_id: profileForm.device_id.trim(),
        parameter: profileForm.parameter.trim(),
        unit: profileForm.unit.trim() || undefined,
        node_id: profileForm.node_id ? Number(profileForm.node_id) : undefined,
        is_enabled: profileForm.is_enabled,
      });
      await loadProfiles();
      setProfileForm((p) => ({ ...p, parameter: "", unit: "", node_id: "" }));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save sensor profile");
    } finally {
      setBusy(false);
    }
  }

  async function toggleProfile(p: SensorProfileRow) {
    setBusy(true);
    setErr(null);
    try {
      await patchSensorProfile(p.id, { is_enabled: !p.is_enabled });
      await loadProfiles();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update profile");
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile(p: SensorProfileRow) {
    if (!confirm(`Delete sensor profile #${p.id}?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteSensorProfile(p.id);
      await loadProfiles();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete profile");
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // THRESHOLDS
  // =========================
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);
  const [thrFilter, setThrFilter] = useState({
    device_id: "",
    node_id: "",
    parameter: "",
  });

  const [thrForm, setThrForm] = useState({
    scope_device_id: "",
    scope_node_id: "",
    parameter: "",
    min_value: "",
    max_value: "",
    is_enabled: true,
  });

  async function loadThresholds() {
    setErr(null);
    const rows = await fetchThresholds({
      device_id: thrFilter.device_id.trim() || undefined,
      node_id: thrFilter.node_id ? Number(thrFilter.node_id) : undefined,
      parameter: thrFilter.parameter.trim() || undefined,
    });
    setThresholds(rows);
  }

  async function submitThreshold() {
    setBusy(true);
    setErr(null);
    try {
      await upsertThreshold({
        scope: {
          device_id: thrForm.scope_device_id.trim(),
          node_id: thrForm.scope_node_id
            ? Number(thrForm.scope_node_id)
            : undefined,
        },
        parameter: thrForm.parameter.trim(),
        min_value:
          thrForm.min_value === "" ? undefined : Number(thrForm.min_value),
        max_value:
          thrForm.max_value === "" ? undefined : Number(thrForm.max_value),
        is_enabled: thrForm.is_enabled,
      });
      await loadThresholds();
      setThrForm((p) => ({
        ...p,
        parameter: "",
        min_value: "",
        max_value: "",
      }));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save threshold rule");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadDevices().catch(() => {});
    loadProfiles().catch(() => {});
    loadThresholds().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const devicesOnlineStats = useMemo(() => {
    let online = 0;
    let offline = 0;
    let stale = 0;

    for (const d of devices || []) {
      const st = computeOnlineState(d as any);
      if (st === "online") online++;
      else if (st === "offline") offline++;
      else stale++;
    }

    return { online, offline, stale, total: devices.length };
  }, [devices]);

  return (
    <div>
      {/* Header */}
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
              Settings
            </h2>
            <Badge tone="neutral">Devices • Sensors • Thresholds</Badge>
            {busy ? (
              <Badge tone="info">SAVING…</Badge>
            ) : (
              <Badge tone="good">READY</Badge>
            )}
          </div>
          <div className="nms-subtitle" style={{ marginTop: 6 }}>
            Offline-first configuration console (fleet + profiles + rules)
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={() => {
              loadDevices().catch(() => {});
              loadProfiles().catch(() => {});
              loadThresholds().catch(() => {});
            }}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
      </div>

      {err ? (
        <Card
          title="Error"
          subtitle="Fix the issue and retry."
          accent="red"
          style={{ marginBottom: 12 }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: "#9f1239" }}>
            {err}
          </div>
        </Card>
      ) : null}

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <ToggleChip
          active={tab === "devices"}
          label="Devices"
          onClick={() => setTab("devices")}
        />
        <ToggleChip
          active={tab === "sensors"}
          label="Sensors"
          onClick={() => setTab("sensors")}
        />
        <ToggleChip
          active={tab === "thresholds"}
          label="Thresholds"
          onClick={() => setTab("thresholds")}
        />
      </div>

      {/* DEVICES */}
      {tab === "devices" ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "minmax(380px, 0.95fr) minmax(520px, 1.25fr)",
          }}
        >
          <Card
            title="Register Device"
            subtitle="Add or update a device in the offline fleet database"
            accent="blue"
            right={
              <Badge tone="neutral">Fleet: {devicesOnlineStats.total}</Badge>
            }
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Device ID
                  </div>
                  <Input
                    value={devForm.device_id}
                    onChange={(e) =>
                      setDevForm((p) => ({ ...p, device_id: e.target.value }))
                    }
                    placeholder="ESP32_01"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Name
                  </div>
                  <Input
                    value={devForm.name}
                    onChange={(e) =>
                      setDevForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Field Node A"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Node Type
                  </div>
                  <Select
                    value={devForm.node_type}
                    onChange={(e) =>
                      setDevForm((p) => ({ ...p, node_type: e.target.value }))
                    }
                  >
                    <option value="sensor">sensor</option>
                    <option value="gateway">gateway</option>
                  </Select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    IP Address (optional)
                  </div>
                  <Input
                    value={devForm.ip_address}
                    onChange={(e) =>
                      setDevForm((p) => ({ ...p, ip_address: e.target.value }))
                    }
                    placeholder="192.168.1.20"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Heartbeat (sec)
                  </div>
                  <Input
                    value={devForm.heartbeat_interval_sec}
                    onChange={(e) =>
                      setDevForm((p) => ({
                        ...p,
                        heartbeat_interval_sec: e.target.value,
                      }))
                    }
                    placeholder="30"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Last RSSI (optional)
                  </div>
                  <Input
                    value={devForm.last_rssi}
                    onChange={(e) =>
                      setDevForm((p) => ({ ...p, last_rssi: e.target.value }))
                    }
                    placeholder="-67"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  onClick={submitRegister}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Register"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDevForm({
                      device_id: "",
                      name: "",
                      node_type: "sensor",
                      ip_address: "",
                      heartbeat_interval_sec: "30",
                      last_rssi: "",
                    })
                  }
                  disabled={busy}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="Fleet"
            subtitle="Device list with online state derived from last_seen and heartbeat interval"
            accent="slate"
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge tone="good">Online: {devicesOnlineStats.online}</Badge>
                <Badge
                  tone={devicesOnlineStats.offline > 0 ? "bad" : "neutral"}
                >
                  Offline: {devicesOnlineStats.offline}
                </Badge>
                <Badge tone={devicesOnlineStats.stale > 0 ? "warn" : "neutral"}>
                  Stale: {devicesOnlineStats.stale}
                </Badge>
              </div>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Device
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Type
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      State
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Last seen
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => {
                    const st = computeOnlineState(d as any);
                    const tone =
                      st === "online"
                        ? "good"
                        : st === "offline"
                          ? "bad"
                          : "warn";
                    return (
                      <tr
                        key={d.device_id}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "10px 0", fontWeight: 950 }}>
                          {d.device_id}
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          {(d as any).node_type || "—"}
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          <Badge tone={tone as any}>
                            {String(st).toUpperCase()}
                          </Badge>
                        </td>
                        <td style={{ padding: "10px 0" }}>
                          {fmtDate((d as any).last_seen)}
                        </td>
                        <td
                          style={{ padding: "10px 0", color: "var(--muted)" }}
                        >
                          {fmtAgo((d as any).last_seen)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!devices.length ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  No devices yet.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {/* SENSORS */}
      {tab === "sensors" ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "minmax(380px, 0.95fr) minmax(520px, 1.25fr)",
          }}
        >
          <Card
            title="Sensor Profiles"
            subtitle="Enable/disable telemetry parameters per device"
            accent="blue"
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                >
                  Filter by device (optional)
                </div>
                <Input
                  value={profileFilterDevice}
                  onChange={(e) => setProfileFilterDevice(e.target.value)}
                  placeholder="ESP32_01"
                />
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="secondary"
                  onClick={() => loadProfiles()}
                  disabled={busy}
                >
                  Apply filter
                </Button>
              </div>

              <div style={{ height: 1, background: "rgba(15,23,42,0.08)" }} />

              <div style={{ fontWeight: 950 }}>Create / Update profile</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Device ID
                  </div>
                  <Input
                    value={profileForm.device_id}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        device_id: e.target.value,
                      }))
                    }
                    placeholder="ESP32_01"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Parameter
                  </div>
                  <Input
                    value={profileForm.parameter}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        parameter: e.target.value,
                      }))
                    }
                    placeholder="temperature"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Unit
                  </div>
                  <Input
                    value={profileForm.unit}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, unit: e.target.value }))
                    }
                    placeholder="°C"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 950, color: "#374151" }}
                  >
                    Node ID (optional)
                  </div>
                  <Input
                    value={profileForm.node_id}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, node_id: e.target.value }))
                    }
                    placeholder="1"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <ToggleChip
                  active={profileForm.is_enabled}
                  label={profileForm.is_enabled ? "Enabled" : "Disabled"}
                  onClick={() =>
                    setProfileForm((p) => ({ ...p, is_enabled: !p.is_enabled }))
                  }
                />

                <Button
                  variant="primary"
                  onClick={submitProfile}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="Profiles List"
            subtitle="Toggle enable state or delete profiles"
            accent="slate"
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Device
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Parameter
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Unit
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Enabled
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr
                      key={p.id}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "10px 0", fontWeight: 950 }}>
                        {p.device_id}
                      </td>
                      <td style={{ padding: "10px 0" }}>{p.parameter}</td>
                      <td style={{ padding: "10px 0" }}>{p.unit || "—"}</td>
                      <td style={{ padding: "10px 0" }}>
                        <Badge tone={p.is_enabled ? "good" : "neutral"}>
                          {p.is_enabled ? "YES" : "NO"}
                        </Badge>
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => toggleProfile(p)}
                            disabled={busy}
                          >
                            {p.is_enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => removeProfile(p)}
                            disabled={busy}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!profiles.length ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  No profiles yet.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {/* THRESHOLDS */}
      {tab === "thresholds" ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "minmax(380px, 0.95fr) minmax(520px, 1.25fr)",
          }}
        >
          <Card
            title="Threshold Rules"
            subtitle="Min/max thresholds that generate alerts"
            accent="blue"
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 950 }}>Filter</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <Input
                  value={thrFilter.device_id}
                  onChange={(e) =>
                    setThrFilter((p) => ({ ...p, device_id: e.target.value }))
                  }
                  placeholder="device_id"
                />
                <Input
                  value={thrFilter.node_id}
                  onChange={(e) =>
                    setThrFilter((p) => ({ ...p, node_id: e.target.value }))
                  }
                  placeholder="node_id"
                />
                <Input
                  value={thrFilter.parameter}
                  onChange={(e) =>
                    setThrFilter((p) => ({ ...p, parameter: e.target.value }))
                  }
                  placeholder="parameter"
                />
              </div>

              <Button
                variant="secondary"
                onClick={() => loadThresholds()}
                disabled={busy}
              >
                Apply filter
              </Button>

              <div style={{ height: 1, background: "rgba(15,23,42,0.08)" }} />

              <div style={{ fontWeight: 950 }}>Create / Update rule</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <Input
                  value={thrForm.scope_device_id}
                  onChange={(e) =>
                    setThrForm((p) => ({
                      ...p,
                      scope_device_id: e.target.value,
                    }))
                  }
                  placeholder="device_id (required)"
                />
                <Input
                  value={thrForm.scope_node_id}
                  onChange={(e) =>
                    setThrForm((p) => ({ ...p, scope_node_id: e.target.value }))
                  }
                  placeholder="node_id (optional)"
                />
              </div>

              <Input
                value={thrForm.parameter}
                onChange={(e) =>
                  setThrForm((p) => ({ ...p, parameter: e.target.value }))
                }
                placeholder="parameter (e.g. temperature)"
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <Input
                  value={thrForm.min_value}
                  onChange={(e) =>
                    setThrForm((p) => ({ ...p, min_value: e.target.value }))
                  }
                  placeholder="min_value (optional)"
                />
                <Input
                  value={thrForm.max_value}
                  onChange={(e) =>
                    setThrForm((p) => ({ ...p, max_value: e.target.value }))
                  }
                  placeholder="max_value (optional)"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <ToggleChip
                  active={thrForm.is_enabled}
                  label={thrForm.is_enabled ? "Enabled" : "Disabled"}
                  onClick={() =>
                    setThrForm((p) => ({ ...p, is_enabled: !p.is_enabled }))
                  }
                />

                <Button
                  variant="primary"
                  onClick={submitThreshold}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save rule"}
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="Rules List"
            subtitle="Current rules matching filter"
            accent="slate"
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Device
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Node
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Parameter
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>Min</th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>Max</th>
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      Enabled
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {thresholds.map((t) => (
                    <tr
                      key={t.id}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "10px 0", fontWeight: 950 }}>
                        {t.device_id}
                      </td>
                      <td style={{ padding: "10px 0" }}>{t.node_id ?? "—"}</td>
                      <td style={{ padding: "10px 0" }}>{t.parameter}</td>
                      <td style={{ padding: "10px 0" }}>
                        {t.min_value ?? "—"}
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        {t.max_value ?? "—"}
                      </td>
                      <td style={{ padding: "10px 0" }}>
                        <Badge tone={t.is_enabled ? "good" : "neutral"}>
                          {t.is_enabled ? "YES" : "NO"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!thresholds.length ? (
                <div style={{ marginTop: 10, color: "var(--muted)" }}>
                  No threshold rules yet.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
