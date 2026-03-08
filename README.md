# COMPREHENSIVE CODEBASE ANALYSIS: Smart Farm Network Management System

## PROJECT OVERVIEW

Your project is an **Offline-First Network Management System (NMS) for Rural Smart Farming** with real-time monitoring, predictive analytics, and enterprise-grade alert management for IoT devices (ESP32 sensors).

**Key Features:**

- Real-time telemetry ingestion from 50+ IoT devices
- Threshold-based alert generation with severity levels
- Predictive analytics for breach forecasting
- Network topology visualization
- MQTT integration for device communication
- WebSocket real-time updates
- PDF report generation
- Audit logging & device management
- Offline-first architecture

---

## TECHNOLOGY STACK

### **Backend:**

- **Framework:** Flask 3.1.2 with Flask-SocketIO 5.6.0
- **Database:** SQLite (SQLAlchemy 2.0.46 ORM)
- **Task Scheduling:** APScheduler 3.11.2 (background jobs)
- **Protocol:** MQTT (Paho 2.1.0), WebSocket (Flask-SocketIO)
- **Authentication:** Flask-CORS 6.0.2
- **Data Export:** ReportLab 4.4.9 (PDF generation)
- **Utils:** APScheduler, Python-dotenv, Gunicorn

### **Frontend:**

- **Framework:** React 19.2.0 with TypeScript 5.9.3
- **Router:** React Router DOM 7.13.0
- **HTTP Client:** Axios 1.13.5
- **Real-time:** Socket.io-client 4.8.3
- **Charting:** Recharts 3.7.0
- **Build Tool:** Vite 7.3.1
- **Styling:** Custom CSS with theme system

---

## DATABASE SCHEMA & MODELS

### **Core Data Models** (`app/models.py`)

#### **1. SensorReading**

```
- id (PK)
- device_id (string, indexed)
- node_id (FK to Node, indexed)
- sensor_type (parameter name: temperature, humidity, etc.)
- value (float)
- unit (C, %, etc.)
- parameter
- timestamp (sampling time from device)
- created_at (server insert time)
```

**Purpose:** Store telemetry readings from IoT devices. Indexed for fast queries by device, sensor type, and time.

---

#### **2. Node**

```
- id (PK)
- name
- node_type (sensor, gateway, server)
- status (online, offline)
- device_id (unique, indexed)
- ip_address
- last_seen (datetime)
- heartbeat_interval_sec (default 30)
- is_registered (boolean)
- last_rssi (signal strength)
- packets_received, packets_missed, uptime_seconds (network metrics)
```

**Purpose:** Represents a network device with lifecycle management and connectivity tracking.

---

#### **3. AlertEvent**

```
- id (PK)
- device_id, node_id
- parameter (sensor type being monitored)
- value, min_value, max_value (threshold context)
- severity (BELOW_MIN, ABOVE_MAX)
- level (WARNING, CRITICAL)
- message (human-readable)
- is_active, is_acked (flags)
- created_at, acked_at, resolved_at
- ack_note, resolution_note
- distance, distance_pct (how far outside threshold)
```

**Purpose:** Stores alert events triggered by threshold violations, with lifecycle tracking.

---

#### **4. SensorProfile**

```
- id (PK)
- device_id, node_id
- parameter (flexible parameter name)
- unit (optional: C, %, kPa)
- is_enabled
- created_at
- Unique constraint: (device_id, node_id, parameter)
```

**Purpose:** Declare what sensors each device reports (sensor discovery).

---

#### **5. ThresholdRule**

```
- id (PK)
- device_id (nullable)
- node_id (nullable)
- parameter
- min_value, max_value
- Scoping: Global (both null) | Per-device | Per-node
```

**Purpose:** Min/max thresholds per parameter with flexible scoping hierarchy.

---

#### **6. Link**

```
- id (PK)
- from_node, to_node (FKs)
- rssi (signal strength)
- latency
- status (up, down)
```

**Purpose:** Network topology links between nodes.

---

#### **7. RouteEvent**

```
- id (PK)
- device_id (string, indexed)
- old_route, new_route
- reason
- timestamp
```

**Purpose:** Audit log for routing changes and device events (REGISTERED, ONLINE, OFFLINE).

---

#### **8. AuditLog**

```
- id (PK)
- action_type (CREATE, UPDATE, DELETE)
- action, resource_type, resource_id
- actor_type, actor_id
- ip_address, user_agent, request_method, request_path
- details (JSON), status, error_message
- duration_ms, created_at
```

**Purpose:** Complete audit trail of all system actions for compliance.

---

## BACKEND FILE STRUCTURE & ARCHITECTURE

### **Root Entry Point**

#### **run.py** (27 lines)

```python
- Initializes Flask app via create_app()
- Attaches SocketIO for WebSocket support
- Runs development server on 0.0.0.0:5000 with auto-reload
```

**How it works:** Entry point for Flask + SocketIO server.

---

### **Core App Setup** (`app/`)

#### **app/**init**.py** (216 lines)

```python
Core Flask application factory with:

def create_app():
  - Initialize Flask app
  - Load config from Config class
  - Setup database (db.create_all())
  - Register CORS
  - Initialize migrations (Flask-Migrate)
  - Register 19 blueprints (routes)
  - Setup background scheduler with 3 periodic jobs:
    * job_check_nodes() - Monitor online/offline status every 30s
    * job_eval_alerts() - Re-evaluate readings & auto-resolve every 60s
    * job_predictive_alerts() - Generate predictive breach alerts every 3600s
  - Initialize WebSocket handlers
```

**How it works:** Single-responsibility factory that bootstraps entire app with all extensions, routes, and background jobs.

---

#### **app/config.py** (25 lines)

```python
Config class with:
- SECRET_KEY (dev-secret or env var)
- SQLALCHEMY_DATABASE_URI (SQLite @ instance/nms.sqlite3)
- SQLALCHEMY_TRACK_MODIFICATIONS = False
- MQTT_BROKER_URL/PORT (localhost:1883)
- MQTT_TELEMETRY_TOPIC = "nms/telemetry/#"
- Database pool settings (recycle, pre_ping)
```

**How it works:** Centralized configuration with sensible defaults and environment overrides.

---

#### **app/extensions.py** (8 lines)

```python
Initializes shared Flask extensions:
- db (SQLAlchemy)
- cors (Flask-CORS)
- migrate (Flask-Migrate)
- scheduler (APScheduler BackgroundScheduler)
```

**How it works:** Prevents circular imports by separating extension init from app factory.

---

#### **app/models.py** (264 lines)

All 8 core SQLAlchemy models as detailed in "Database Schema" section above.
**How it works:** ORM layer with relationships, indexes, and validation.

---

### **Configuration & Documentation**

#### **app/api_docs.py** (257 lines)

```python
Flask-RESTX Swagger/OpenAPI documentation with:
- 8 namespaces: devices, sensors, alerts, reports, network, routing, config, system
- Request/response model definitions
- Interactive UI at /api/docs/ui
- Security schema for Bearer token auth
```

**How it works:** Auto-generates swagger docs from Flask blueprint metadata.

---

### **Routes Layer** (`app/routes/` - 19 blueprint files)

#### **app/routes/sensors.py** (92 lines)

```
POST /api/sensors/telemetry/ingest
- Ingests single OR batch telemetry readings
- Calls ingest_telemetry() service
- Broadcasts real-time NOC refresh via WebSocket

POST /api/sensors/readings
- Backward-compatible single reading endpoint
- Uses same ingest_telemetry() service

GET /api/sensors/readings?device_id=X&sensor_type=Y&limit=50
- List readings for debugging/charting
```

**How it works:** Gateway for all sensor telemetry ingestion with real-time broadcast.

---

#### **app/routes/devices.py** (250 lines)

```
GET /api/devices
- List all registered devices (nodes)

POST /api/devices/register
- Register/re-register device with device_id, name, node_type, ip, rssi
- Auto-creates Node record or updates existing
- Logs audit event

GET /api/devices/<id>
- Get device details

PUT /api/devices/<id>
- Update device metadata

DELETE /api/devices/<id>
- Soft-delete device

GET /api/devices/<id>/status
- Get detailed device status with network metrics
```

**How it works:** Device lifecycle management (CRUD + registration).

---

#### **app/routes/alerts.py** (182 lines)

```
GET /api/alerts?device_id=X&node_id=Y&parameter=Z&status=active|acked|resolved&level=WARNING|CRITICAL&q=search
- List alerts with enterprise filtering
- Supports pagination (limit, offset)
- Free-text search on message/device/parameter

POST /api/alerts/<id>/ack
- Acknowledge alert with optional note

POST /api/alerts/<id>/resolve
- Resolve alert (ACTIVE → resolved)

GET /api/alerts/summary
- Dashboard summary (counts by status/severity)

GET /api/alerts/trends?hours=24&bucket=hour
- Alert time-series for charting
```

**How it works:** Alert inbox with full-lifecycle management and analytics.

---

#### **app/routes/telemetry.py** (10 lines)

```
POST /api/telemetry/readings
- Wrapper around ingest_telemetry() service
- Normalizes payload and returns status
```

**How it works:** Alternative telemetry endpoint for flexibility.

---

#### **app/routes/network.py** (166 lines)

```
GET /api/network/health?hours=24
- Overall network health summary (delivery %, latency stats)

GET /api/network/health/node/<device_id>?hours=24
- Per-node delivery rate & performance metrics

GET /api/network/events?hours=24&limit=50
- Timeline of network events (REGISTERED, ONLINE, OFFLINE, routing changes)

GET /api/network/metrics
- Real-time network KPIs (bandwidth utilization, packet loss, etc.)

POST /api/network/ping/<device_id>
- Ping device and return latency

POST /api/network/traceroute/<device_id>
- Trace route to device through topology
```

**How it works:** Network diagnostics and health monitoring.

---

#### **app/routes/predictive.py** (288 lines)

```
GET /api/predictive/breach_risk?device_id=X&parameter=Y&hours_ahead=24
- Predict threshold breach in next N hours using trend analysis

GET /api/predictive/forecast?device_id=X&parameter=Y&hours_ahead=6
- Forecast sensor trend (simple linear regression)

GET /api/predictive/network_risk?device_id=X&lookback_days=7
- Predict device failure risk (alerts + last_seen + RSSI)

GET /api/predictive/patterns?device_id=X&parameter=Y&days=30
- Analyze daily patterns (peaks/troughs per hour-of-day)

GET /api/predictive/maintenance
- Fleet maintenance schedule suggestions
```

**How it works:** AI/ML layer using trend analysis and anomaly detection.

---

#### **app/routes/reports.py** (308 lines)

```
GET /api/reports/daily?day=2026-01-24&device_id=X&bucket=hour&parameters=temp,humidity
- Build daily report (aggregated readings per hour/metric)

GET /api/reports/weekly?week=2026-01-20&device_id=X
- Weekly aggregation with trends

GET /api/reports/period?from=...&to=...
- Custom date range reports

POST /api/reports/pdf?day=2026-01-24
- Generate PDF report (via ReportLab)
```

**How it works:** Data aggregation and report rendering.

---

#### **app/routes/health.py** (8 lines)

```
GET /api/health
- Simple health check (returns {"status": "ok"})
```

**How it works:** Kubernetes/load-balancer health probe.

---

#### **app/routes/settings_sensors.py** (192 lines)

```
GET /api/settings/sensors?device_id=X&node_id=Y&parameter=Z
- List sensor profiles (what each device reports)

POST /api/settings/sensors
- Create new sensor profile

PUT /api/settings/sensors/<id>
- Update sensor profile

DELETE /api/settings/sensors/<id>
- Delete sensor profile
```

**How it works:** Sensor metadata management.

---

#### **app/routes/settings_thresholds.py** (139 lines)

```
PUT /api/settings/thresholds?device_id=X&node_id=Y
- Create/update threshold rule (min/max for parameter)

GET /api/settings/thresholds?device_id=X&node_id=Y
- List threshold rules with inheritance resolution

DELETE /api/settings/thresholds/<id>
- Delete threshold rule
```

**How it works:** Flexible threshold hierarchy (global → per-device → per-node).

---

#### **Other Routes** (audit, data_export, mqtt_status, system_monitor, recommendations, routing, etc.)

Each follows same pattern: GET/POST/PUT/DELETE operations calling corresponding service layer.

---

### **Services Layer** (`app/services/` - 18 service modules)

#### **app/services/telemetry.py** (185 lines)

```python
def ingest_telemetry(payload):
  - Parses device_id (required)
  - Validates device is registered
  - Supports single reading OR batch {"readings": [...]}
  - For each reading:
    * Normalizes parameter (lowercase)
    * Parses timestamp (ISO8601, Unix epoch, or default to now)
    * Creates SensorReading record
    * Calls evaluate_reading() to check thresholds
    * Broadcasts new reading via WebSocket
    * Returns alert if created
  - Logs AuditLog entry
  - Returns 400/403/200 with detailed response
```

**Core function:** Single ingestion entrypoint for all telemetry (REST + MQTT).

---

#### **app/services/alerts_service.py** (391 lines)

```python
def evaluate_reading(reading, auto_resolve=True, dedupe_window_minutes=10):
  - Gets effective threshold (device/node/global hierarchy)
  - Checks violation: is value < min OR > max?
  - If normal & auto_resolve=True: resolve matching active alerts
  - If violated:
    * Computes severity (BELOW_MIN or ABOVE_MAX)
    * Computes level (WARNING or CRITICAL based on distance)
    * Builds human message: "Temperature 42°C exceeds max 35°C by 7°C"
    * Dedupes: checks if similar alert exists in last 10 min
    * Creates AlertEvent record (or escalates existing)
    * Broadcasts new alert via WebSocket
  - Returns dict with {"created", "resolved", "skipped", "reason"}

def list_alerts_page(...):
  - Join AlertEvent + reads device/node names
  - Filter by: device_id, node_id, parameter, status, severity, level, free-text
  - Pagination (limit, offset)
  - Returns (items, total_count)

def ack_alert(alert_id, note=""):
  - Marks alert as acked
  - Records ack_note
  - Updates acked_at timestamp

def resolve_alert(alert_id):
  - Marks alert as resolved (is_active=False)
  - Records resolved_at

def alert_to_dict():
  - Serialize AlertEvent to client-friendly dict
```

**Core logic:** Threshold evaluation, alert creation with deduping, lifecycle management.

---

#### **app/services/alerts_summary_service.py**

```python
def get_alert_summary():
  - Counts by status (active/acked/resolved)
  - Counts by level (WARNING/CRITICAL)
  - Top devices by alert count
  - Returns dashboard KPIs

def get_alert_trends(hours=24, bucket='hour'):
  - Time-series of alert counts per bucket
  - Returns [(timestamp, count), ...]
```

**Aggregation layer:** Dashboard metrics extracted from alert events.

---

#### **app/services/thresholds_service.py**

```python
def resolve_effective_threshold(device_id, node_id, parameter):
  - Implements threshold hierarchy:
    1. Device-specific: device_id=X, node_id=NULL
    2. Node-specific: node_id=Y (any device in that node)
    3. Global: device_id=NULL, node_id=NULL
  - Returns first match from hierarchy
  - Returns None if no rule found

def upsert_threshold_rule(device_id, node_id, parameter, min/max, enabled):
  - Create or update threshold rule
  - Returns serialized rule
```

**Scoping engine:** Implements flexible threshold inheritance.

---

#### **app/services/telemetry_queries.py**

```python
def get_latest_readings(device_id=None, parameter=None, hours=24, limit=100):
  - Query SensorReading with filters & time window
  - Order by timestamp DESC
  - Return list of dicts

def get_readings_in_window(device_id, parameter, start, end):
  - Exact date range query for reports

def get_sensor_stats(device_id, parameter, hours):
  - Returns mean, min, max, stddev
```

**Data query layer:** Flexible reading retrieval for charting, stats, predictions.

---

#### **app/services/monitoring.py** (50 lines)

```python
def check_nodes_online_status():
  - Background job (runs every 30s)
  - For each registered node:
    * Compute cutoff: now - (heartbeat_interval_sec * 3)
    * If last_seen < cutoff: mark offline, log RouteEvent
    * If last_seen >= cutoff and was offline: mark online, log RouteEvent
  - Commit all changes

Offline multiplier logic: device goes offline if no heartbeat in 3x interval
Example: 30s heartbeat → offline after 90s no activity
```

**Background task:** Continuous device health monitoring.

---

#### **app/services/network_analytics_service.py**

```python
def calculate_network_health_summary(hours=24):
  - Compute fleet-wide delivery rate (packets_received / expected)
  - Average latency across links
  - Packet loss percentage
  - Total online/offline nodes
  - Returns summary dict for dashboard

def calculate_node_delivery_rate(device_id, hours):
  - Per-device delivery %
  - Uptime calculation
  - Link quality stats

def get_network_events_timeline(hours, limit):
  - Query RouteEvent table
  - Sort by timestamp DESC
  - Return [(timestamp, event_type, device_id, message), ...]
```

**Network intelligence:** KPI calculations for dashboard.

---

#### **app/services/predictive_analytics_service.py**

```python
class PredictiveAnalytics:

  @static
  def predict_sensor_trend(device_id, parameter, hours_ahead):
    - Fetch recent readings (past 7 days)
    - Fit linear regression to trend
    - Extrapolate forward hours_ahead
    - Return PredictionResult(device_id, parameter, predicted_value, confidence, rationale)

  @static
  def predict_threshold_breach(device_id, parameter, hours_ahead):
    - Forecast trend (as above)
    - Compare to min/max thresholds
    - If breach likely within hours_ahead:
      * Return {breach_risk: HIGH/MEDIUM/LOW, time_to_breach_hours, ...}
    - Create AlertEvent with type=PREDICTIVE

  @static
  def predict_network_failure(device_id, lookback_days):
    - Analyze alert frequency, last_seen, RSSI
    - Score failure risk 0-100
    - Return recommendations (e.g., "Check antenna", "Replace device")

  @static
  def analyze_seasonal_patterns(device_id, parameter, days):
    - Group readings by hour-of-day
    - Find peaks/troughs
    - Detect anomalies in each bucket
    - Return {hourly_patterns, anomaly_count, ...}

  @static
  def predict_maintenance_schedule():
    - Fleet-wide device health assessment
    - Recommend maintenance dates
```

**ML layer:** Trend forecasting, breach prediction, anomaly detection.

---

#### **app/services/websocket_service.py** (202 lines)

```python
socketio = SocketIO(cors_allowed_origins="*")

@socketio.on('connect')
@socketio.on('disconnect')
@socketio.on('join_room') → join "alerts", "noc", "device_XXX", etc.
@socketio.on('leave_room')

def broadcast_new_reading(reading_data):
  - Emit "new_reading" to "device_XXX" room
  - Emit "telemetry_updated" to "noc" room

def broadcast_new_alert(alert_data):
  - Emit "alert_created" to "alerts" room
  - Emit "noc_refresh" to "noc" room (triggers dashboard update)

def broadcast_noc_refresh(reason_dict):
  - Emit "noc_refresh" with reason (telemetry_ingest, alert_created, etc.)
  - Clients listen and refetch NOC data via REST APIs

Track connected_clients = {client_id: {connected_at, rooms}}
```

**Real-time backbone:** WebSocket event distribution with room-based targeting.

---

#### **app/services/audit_service.py** (237 lines)

```python
class AuditLogger:

  @static
  def log_action(action_type, action, resource_type, resource_id, details, actor_type, status, error_message):
    - Captures request context (IP, user-agent, method, path)
    - Creates AuditLog record
    - Returns audit entry

  @static
  def log_device_registration(device_id, is_new, details):
    - Wrapper for device events

  @static
  def log_threshold_change(device_id, parameter, old/new values):
    - Wrapper for configuration changes

  @static
  def get_audit_logs(resource_type, resource_id, hours, limit):
    - Query audit trail by resource
    - Pagination
```

**Compliance layer:** Full audit trail for all operations.

---

#### **app/services/mqtt_service.py** (169 lines)

```python
class MQTTService:
  def __init__(broker_host, broker_port, topic, ...):
    - Initialize Paho MQTT client
    - Set handlers (on_connect, on_message, on_disconnect)

  def start():
    - Spawn background thread
    - Connect to broker
    - Subscribe to topic (nms/telemetry/#)
    - Loop forever (reconnects automatically)

  def _on_connect():
    - Subscribe to configured topic
    - Update self._connected = True

  def _on_message(client, userdata, msg):
    - Parse JSON payload from topic nms/telemetry/<device_id>
    - Call ingest_telemetry(payload) in Flask app context

  def stop():
    - Graceful shutdown

  def status():
    - Return {connected, broker, last_message_at, last_error}
```

**MQTT integration:** Background service for device communication protocol.

---

#### **Other Services:**

- **reports_service.py**: Aggregate readings into daily/weekly/period reports
- **pdf_report.py**: Render reports to PDF using ReportLab
- **data_export_service.py**: CSV/JSON export for external analysis
- **recommendations_service.py**: Generate actionable recommendations from alerts
- **network_diagnostics_service.py**: Advanced diagnostics (ping, traceroute, bandwidth test)
- **routing_service.py**: Network route optimization
- **system_monitor.py**: System-level metrics (CPU, memory, DB size)
- **configuration_service.py**: Device configuration management
- **alert_reporting_service.py**: Alert aggregation for reports

---

### **Background Jobs** (`app/jobs/`)

#### **app/jobs/alert_jobs.py** (36 lines)

```python
def evaluate_latest_readings_job(app, limit=200):
  - Gets last N readings (SensorReading table)
  - For each reading: calls evaluate_reading() again
  - Purpose: Safety net to re-evaluate and auto-resolve stale alerts
  - Runs every 60 seconds via APScheduler
```

**Scheduled task:** Ensures no readings slip through evaluation.

---

### **Initialization Scripts** (`app/scripts/`)

- **init_migrations.py**: Initialize Flask-Migrate schema
- **db_commands.sh**: Database utility commands
- **websocket.py**: WebSocket standalone service (deprecated in favor of SocketIO)

---

## FRONTEND STRUCTURE

### **Root Entry**

#### **src/main.tsx** (11 lines)

```tsx
- Mounts React app to #root DOM element
- Wraps with ErrorBoundary component
- Imports global styles (enterprise.css, theme.css)
```

**How it works:** Standard React 19 entry point.

---

#### **src/App.tsx** (42 lines)

```tsx
BrowserRouter with Routes:
├── /              → Dashboard
├── /telemetry     → Telemetry charting
├── /alerts        → Alert inbox
├── /topology      → Network visualization
├── /topology/pro  → Pro topology
├── /reports       → Report generation
├── /settings      → Device/sensor/threshold configuration
├── /predictive    → Predictive analytics
├── /recommendations → Actionable recommendations
└── /*             → Fallback to Dashboard

All routes wrapped in AppLayout (shell with navbar)
```

**How it works:** Single-page app router with persistent layout.

---

### **Pages** (`src/pages/`)

#### **src/pages/Dashboard.tsx** (1224 lines)

```tsx
Main NOC (Network Operations Center) dashboard with:

Key Components:
- KPI Cards (online devices, active alerts, avg latency, delivery %)
- System Health Chart (temperature, humidity trends)
- WorstNodesTable (devices with highest alert counts)
- IncidentsFeed (recent alerts timeline)
- NetworkMetrics (bandwidth, packet loss, uptime)

Features:
- Real-time NOC socket updates (useNocSocket hook)
- LocalStorage caching (metrics, topology, alerts, system stats)
- Smart data refresh (refetch if cache > 150s old)
- Error handling with fallback UI

Data Sources:
- fetchHealth() → { devices_online, alerts_active, ... }
- fetchDevices() → list of nodes
- fetchAlerts() → active/acked/resolved counts
- getNetworkMetrics() → bandwidth, latency, packet loss
- getEnhancedTopology() → topology graph data
- getNetworkEvents() → incident timeline

Purpose: Real-time fleet status at a glance
```

**Core dashboard:** High-level NOC visibility.

---

#### **src/pages/Alerts.tsx** (786 lines)

```tsx
Enterprise alert inbox with:

Features:
- Filtering: status (all/active/acked/resolved), level (all/WARNING/CRITICAL), direction (all/BELOW_MIN/ABOVE_MAX)
- Free-text search (message, device_id, parameter)
- Sorting: newest, critical_first, oldest
- Real-time updates via useAlertsSocket hook
- Batch actions (ack multiple, resolve multiple)

Key Controls:
- Alert status chips (toggle active/acked/resolved)
- Severity filter dropdown
- Direction filter (above/below min/max)
- Search input with debounce
- Sort menu

Components:
- SeverityBadge (color-coded alert level)
- AlertsTable (main alert list with columns)
- AlertDetailsDrawer (side panel for alert detail)

Data:
- fetchAlerts(query) → paginated alert list
- ackAlert(id, note) → POST to /api/alerts/<id>/ack
- resolveAlert(id) → POST to /api/alerts/<id>/resolve
- fetchAlertTrends() → time-series for alert chart

Purpose: Alert management interface
```

**Alert management:** Full-featured alert inbox.

---

#### **src/pages/Topology.tsx** (1960 lines)

```tsx
Network topology visualization with:

Features:
- Interactive graph visualization (TopologyGraph component)
- Node filtering by type (all/sensor/gateway/server) & status (all/online/offline/degraded)
- Device detail panels on node click
- Network KPI overlay (delivery %, latency, packet loss)
- Route timeline (historical routing events)
- Network diagnostics (ping, traceroute, bandwidth test)

Key Operations:
- GET /api/network/enhanced-topology → node/link graph data
- POST /api/network/ping/<device_id> → latency test
- POST /api/network/traceroute/<device_id> → path trace
- POST /api/network/bandwidth-test/<device_id> → capacity test
- GET /api/network/route/<device_id> → current route

Components:
- TopologyGraph (D3.js or Recharts-based force-directed graph)
- KpiCards (real-time metrics)

Purpose: Visual network management
```

**Topology visualization:** Network graph with diagnostics.

---

#### **src/pages/Telemetry.tsx**

```tsx
Multi-parameter telemetry charting with:

Features:
- Device selector dropdown
- Parameter checkboxes (temperature, humidity, soil_moisture, etc.)
- Time range picker (1h, 6h, 24h, 7d, 30d)
- Interactive Recharts (line/area chart)
- Trend indicators (rising ↑, falling ↓, stable →)
- Min/max threshold lines overlaid

Data:
- fetchLatestReadings(device_id, parameter, hours) → time-series
- Min/max from thresholds

Purpose: Deep dive into sensor trends
```

**Telemetry analysis:** Detailed sensor tracing.

---

#### **src/pages/Reports.tsx**

```tsx
Report generation with:

Features:
- Date range picker (daily/weekly/custom period)
- Device selector
- Parameter selector (multi-select)
- Aggregation bucket (hour/day)
- PDF export button

Data:
- GET /api/reports/daily?day=...&device_id=...
- POST /api/reports/pdf (generates downloadable PDF)

Purpose: Data aggregation & PDF export
```

**Report generation:** Summarized data export.

---

#### **src/pages/Settings.tsx** (1062 lines)

```tsx
Configuration hub with 3 main tabs:

1. DEVICES TAB
   - List all registered devices
   - Register new device (device_id, name, type, IP)
   - Edit device properties
   - Delete device
   - View last_seen, RSSI, uptime

2. SENSORS TAB
   - List sensor profiles (what each device reports)
   - Add parameter to device
   - Enable/disable parameters
   - View units (C, %, kPa, etc.)

3. THRESHOLDS TAB
   - List min/max rules
   - Scoping: global/per-device/per-node
   - Create/edit/delete rules
   - Effective threshold calculation

Data:
- fetchDevices() → list of nodes
- registerDevice(device_id, name, type, ip) → create
- fetchSensorProfiles(device_id) → []
- upsertSensorProfile() → create/update
- fetchThresholds(device_id, node_id) → []
- upsertThreshold() → create/update

Purpose: System administration/configuration
```

**Settings management:** Device and configuration hub.

---

#### **Other Pages:**

- **Predictive.tsx**: Breach forecasting, failure risk scoring
- **Recommendations.tsx**: Actionable recommendations from alerts

---

### **Components** (`src/components/`)

#### **Layout**

**src/components/layout/AppLayout.tsx** (336 lines)

```tsx
Enterprise shell/sidebar with:

Navigation:
- Dashboard (/)
- Telemetry (/telemetry)
- Alerts (/alerts)
- Topology (/topology)
- Reports (/reports)
- Settings (/settings)
- Predictive (/predictive)
- Recommendations (/recommendations)
- Topology Pro (/topology/pro)

Header:
- System health dot (green/red)
- "Last synced X minutes ago"
- Backend connectivity status
- API endpoint display

Footer:
- Copyright & version

Features:
- Active route highlighting
- Responsive sidebar toggle
- Real-time connectivity monitoring (useNocSocket)
- Health check polling

Purpose: Persistent navigation shell
```

**Main layout:** Consistent app wrapper.

---

#### **Alerts Components**

**src/components/alerts/AlertsTable.tsx**

```tsx
Tabular display of alerts with columns:
- Status badge (active/acked/resolved)
- Severity (color-coded)
- Device ID
- Parameter
- Value + min/max
- Message
- Age (created_at)
- Actions (ack, resolve)

Features:
- Click to expand detail
- Batch select checkbox
- Sort column headers
```

**src/components/alerts/AlertDetailsDrawer.tsx**

```tsx
Side panel detail view:
- Full message
- Threshold context (min/max)
- Timeline (created → acked at → resolved at)
- Notes (ack_note, resolution_note)
- Related readings chart
- Action buttons
```

**src/components/alerts/SeverityBadge.tsx**

```tsx
Color-coded badge:
- CRITICAL: red
- WARNING: yellow
- INFO: blue
```

---

#### **Network Components**

**src/components/network/TopologyGraph.tsx**

```tsx
Force-directed graph visualization:
- Nodes: colored by status (online=green, offline=red)
- Links: thickness by signal strength (RSSI)
- Hover: show device name & metrics
- Click: open detail panel
- Drag: reposition nodes
- Zoom: mouse wheel
```

---

#### **Data/Charts Components**

**src/components/data/Charts/TelemetryChart.tsx**

```tsx
Recharts LineChart:
- X-axis: timestamp
- Y-axis: sensor value
- Multiple lines per parameter
- Min/max threshold bands
- Tooltip with detail on hover
- Legend with parameter names
```

**src/components/data/Charts/HealthTrendChart.tsx**

```tsx
Aggregated health metrics:
- Delivery % over time
- Uptime % over time
- Alert count over time
- Stacked area chart
```

---

#### **System Components**

**src/components/system/SystemMonitorCards.tsx**

```tsx
KPI cards showing:
- CPU utilization
- Memory usage
- Database size
- API response time
- WebSocket connections
- Uptime
```

---

#### **NOC Components**

**src/components/noc/KpiCards.tsx**

```tsx
Large KPI displays:
- Online/offline device counts
- Active alert count
- Network health % (delivery)
- Average latency (ms)
```

**src/components/noc/IncidentsFeed.tsx**

```tsx
Recent alerts feed (scrollable list):
- Timestamp
- Device
- Alert message
- Status badge
- 15-minute window default
```

**src/components/noc/WorstNodesTable.tsx**

```tsx
Devices with highest issues:
- Device name
- Alert count
- RSSI signal strength
- Last seen
- Status
```

---

#### **Common Components**

**src/components/common/ErrorBoundary.tsx** (React class component)

```tsx
- Catches all component errors
- Displays crash screen with error message
- Directs user to DevTools Console
```

---

### **API Client Layer** (`src/api/`)

Each file exports functions that wrap `http.get|post|put|delete` calls:

#### **src/api/http.ts** (98 lines)

```typescript
export const BASE = "http://127.0.0.1:5000" (from VITE_API_BASE env var)

export type ApiResult<T> = {
  ok: boolean
  data: T
  count?: number
  error?: string
  usedPath?: string
}

async function request<T>(method, path, body?, opts?): Promise<T>:
  - Construct full URL
  - Handle Content-Type header
  - Throw on non-2xx with error preview
  - Parse JSON safely
  - Return typed response

Export: get, post, put, patch, delete helpers
```

**Foundation:** HTTP client with error handling.

---

#### **src/api/alerts.ts** (238 lines)

```typescript
export async function fetchAlerts(query: AlertsQuery): Promise<AlertEvent[]>
  - GET /api/alerts with filters
  - Normalizes response (handles variations in backend format)

export async function ackAlert(id: number, note?: string): Promise<AlertEvent>
  - POST /api/alerts/<id>/ack

export async function resolveAlert(id: number): Promise<AlertEvent>
  - POST /api/alerts/<id>/resolve

export async function fetchAlertTrends(hours?, bucket?): Promise<AlertTrendBucket[]>
  - GET /api/alerts/trends
```

---

#### **src/api/devices.ts**

```typescript
export async function fetchDevices(): Promise<Device[]>
  - GET /api/devices

export async function registerDevice(data): Promise<Device>
  - POST /api/devices/register

export async function updateDevice(id, data): Promise<Device>
  - PUT /api/devices/<id>

export async function deleteDevice(id): Promise<void>
  - DELETE /api/devices/<id>

export function computeOnlineState(device): "online" | "offline"
  - Client-side helper: compares last_seen to now
```

---

#### **src/api/network.ts**

```typescript
export async function getEnhancedTopology(): Promise<EnhancedTopology>
  - GET /api/network/topology (nodes + links graph data)

export async function getNetworkMetrics(): Promise<NetworkMetrics>
  - GET /api/network/metrics

export async function getNetworkHealth(): Promise<NetworkHealthSummary>
  - GET /api/network/health

export async function getNetworkEvents(): Promise<NetworkEvent[]>
  - GET /api/network/events

export async function pingDevice(device_id): Promise<number> (latency ms)
  - POST /api/network/ping/<device_id>

export async function tracerouteDevice(device_id): Promise<TraceHop[]>
  - POST /api/network/traceroute/<device_id>

export async function bandwidthTest(device_id): Promise<BandwidthResult>
  - POST /api/network/bandwidth-test/<device_id>
```

---

#### **src/api/settings_sensors.ts**

```typescript
export async function fetchSensorProfiles(device_id?): Promise<SensorProfileRow[]>
  - GET /api/settings/sensors

export async function upsertSensorProfile(data): Promise<SensorProfileRow>
  - POST /api/settings/sensors

export async function patchSensorProfile(id, data): Promise<SensorProfileRow>
  - PATCH /api/settings/sensors/<id>

export async function deleteSensorProfile(id): Promise<void>
  - DELETE /api/settings/sensors/<id>
```

---

#### **src/api/settings_thresholds.ts**

```typescript
export async function fetchThresholds(device_id?, node_id?): Promise<ThresholdRow[]>
  - GET /api/settings/thresholds

export async function upsertThreshold(device_id, node_id, parameter, min, max): Promise<ThresholdRow>
  - PUT /api/settings/thresholds

export async function deleteThreshold(id): Promise<void>
  - DELETE /api/settings/thresholds/<id>
```

---

#### **Other API modules:**

- **health.ts**: GET /api/health
- **readings.ts**: GET /api/sensors/readings (telemetry)
- **telemetry.ts**: GET /api/telemetry/readings
- **system_monitor.ts**: GET /api/system/monitor (CPU, memory, uptime)
- **reports.ts**: GET /api/reports/daily|weekly|period, POST /api/reports/pdf
- **predictive.ts**: GET /api/predictive/breach_risk, /forecast, /network_risk, /patterns
- **recommendations.ts**: GET /api/recommendations
- **routing.ts**: GET /api/network/routing
- **tryPaths.ts**: Utility for API endpoint fallback logic

---

### **Real-time Communication** (`src/realtime/`)

#### **src/realtime/socket.ts** (16 lines)

```typescript
import { io, Socket } from "socket.io-client"

export function getSocket(): Socket:
  - Singleton socket connection to backend
  - Configured with transports: ["websocket", "polling"]
  - Reconnects automatically
  - Lazy initialized on first call
```

**WebSocket singleton:** Shared across all components.

---

#### **src/realtime/useAlertsSocket.ts**

```typescript
export function useAlertsSocket(): {
  latest: AlertEvent[]
  connected: boolean
}:
  - Custom React hook
  - Joins "alerts" room on mount
  - Listens to "alert_created" event
  - Updates state when new alerts arrive
  - Returns latest alerts + connection status
```

**Alerts subscription:** Real-time alert stream.

---

#### **src/realtime/useNocSocket.ts**

```typescript
export function useNocSocket(): {
  nocRefresh: { reason: string, timestamp: string }
  connected: boolean
}:
  - Joins "noc" room on mount
  - Listens to "noc_refresh" events
  - Triggers dashboard data refetch
  - Returns refresh signal + connection status
```

**NOC subscription:** Real-time dashboard refresh signal.

---

### **Types** (`src/types/`)

#### **src/types/api.ts** (90 lines)

```typescript
export type Device = {
  id?: number
  device_id: string
  node_type?: string
  status?: "online" | "offline" | "unknown"
  ip_address?: string | null
  last_seen?: string | null
  last_rssi?: number | null
  is_registered?: boolean
}

export type AlertEvent = {
  id: number
  device_id?: string | null
  node_id?: number | null
  parameter?: string | null
  value?: number | null
  severity?: string (ABOVE_MAX, BELOW_MIN)
  level?: string (CRITICAL, WARNING)
  message?: string | null
  min_value?: number | null
  max_value?: number | null
  distance?: number | null
  distance_pct?: number | null
  is_active?: boolean
  is_acked?: boolean
  created_at?: string | null
  acked_at?: string | null
  ack_note?: string | null
  resolved_at?: string | null
  reading_id?: number | null
}

export type SensorReading = {
  id: number
  device_id?: string | null
  sensor_type?: string | null
  value?: number | null
  created_at?: string | null
  timestamp?: string | null
}
```

**Core data types:** TypeScript interfaces for API contracts.

---

#### **src/types/alerts.ts**

```typescript
Specific alert type definitions
```

#### **src/types/devices.ts**

```typescript
Specific device type definitions
```

---

### **Utilities** (`src/utils/`)

#### **src/utils/analytics.ts** (80 lines)

```typescript
export type Trend = "rising" | "falling" | "stable"

export function mean(nums): number
  - Average of array

export function stddev(nums): number
  - Standard deviation

export function slope(values): number
  - Linear regression slope for trend detection

export function classifyTrend(values, threshold): Trend
  - Returns "rising" | "falling" | "stable"

export function countAnomalies(values, zThreshold): number
  - Count outliers using z-score

export function pctChange(current, previous): number
  - Percentage change calculation
```

**Statistical utilities:** Analytics helper functions.

---

#### **src/utils/ensureArray.ts**

```typescript
export function ensureArray<T>(x: T | T[] | undefined): T[]
  - Normalizes input to always be array
  - Handles null/undefined
```

#### **src/utils/insightsRules.ts**

```typescript
Insight generation rules (e.g., "High deviation detected in temperature")
```

#### **src/utils/networkMetrics.ts**

```typescript
Network metrics calculation helpers
```

---

### **UI Components** (`src/ui/`)

#### **src/ui/Card.tsx**

```tsx
Reusable card wrapper:
- Padding, border, shadow
- Rounded corners
- Used throughout app for content sections
```

#### **src/ui/Button.tsx**

```tsx
Button variants:
- primary (gradient background)
- secondary (outline)
- danger (red)
- Supports loading state
```

#### **src/ui/Badge.tsx**

```tsx
Small label badges:
- Color variants (green=success, red=error, yellow=warning, blue=info)
- Used for status pills, severity labels
```

#### **src/ui/Input.tsx**

```tsx
Text input field with:
- Placeholder
- Optional label
- Error state
- onChange callback
```

#### **src/ui/Select.tsx**

```tsx
Select dropdown with:
- Options array
- Optional label
- onChange callback
- Value binding
```

---

### **Styling**

#### **src/ui/theme.ts** (TypeScript constants)

```typescript
export const colors = {
  primary: "#0066cc",
  primary2: "#0052a3",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  ...
}

export const shadows = {
  sm: "0 1px 2px rgba(...)",
  md: "0 4px 6px rgba(...)",
  ...
}
```

#### **src/ui/theme.css**

```css
CSS variables for theming:
--primary: #0066cc
--primary2: #0052a3
--text: #0f172a
--border: rgba(15,23,42,0.12)
--shadow-sm: 0 1px 2px rgba(...)
--shadow-md: 0 4px 6px rgba(...)
```

#### **src/styles/enterprise.css**

```css
Global enterprise styling:
- Base font family (system-ui)
- Color palette
- Responsive grid
- Typography scales
- Component defaults
```

---

## DATA FLOW ARCHITECTURE

### **1. TELEMETRY INGESTION FLOW**

```
Device (ESP32)
  ↓ (MQTT OR HTTP)
Backend telemetry endpoint
  ├─ POST /api/sensors/telemetry/ingest (MQTT via MQTTService)
  └─ POST /api/sensors/readings (HTTP)
    ↓
ingest_telemetry() service
  ├─ Validate device registration
  ├─ Normalize parameter name
  ├─ Parse timestamp
  └─ Create SensorReading DB record
    ↓
evaluate_reading() service
  ├─ Resolve effective threshold (device → node → global)
  ├─ Check violation (value < min OR > max?)
  ├─ If normal: auto-resolve matching alerts
  ├─ If violated:
  │   ├─ Create AlertEvent
  │   ├─ Dedupe in 10-min window
  │   ├─ Score severity/level/message
  │   └─ Broadcast via WebSocket
  └─ Return alert data
    ↓
broadcast_new_reading() → WebSocket "new_reading" to device room
broadcast_new_alert() → WebSocket "alert_created" to alerts room
broadcast_noc_refresh() → WebSocket "noc_refresh" to noc room
    ↓
Frontend (React)
  ├─ useAlertsSocket hook receives "alert_created"
  ├─ updates local alerts state
  ├─ useNocSocket hook receives "noc_refresh"
  └─ refetches Dashboard data via REST APIs
```

---

### **2. ALERT LIFECYCLE FLOW**

```
1. CREATION
   Reading violates threshold
   → AlertEvent created with is_active=True

2. ACKNOWLEDGEMENT
   User clicks "Ack" button in Alerts page
   → POST /api/alerts/<id>/ack
   → ack_alert() service updates acked_at, is_acked=True
   → Frontend updates UI, shows ack as checked

3. AUTO-RESOLUTION
   New reading enters normal range
   → evaluate_reading() finds matching active alerts
   → Marks resolved_at, is_active=False
   → Broadcasts resolution via WebSocket

4. MANUAL RESOLUTION
   User clicks "Resolve" button
   → POST /api/alerts/<id>/resolve
   → resolve_alert() service marks is_active=False
```

---

### **3. DEVICE REGISTRATION & MONITORING FLOW**

```
New device joins network
  ↓
POST /api/devices/register
  ├─ device_id, name, ip_address, heartbeat_interval_sec, last_rssi
  ├─ Create/update Node record
  ├─ Set is_registered=True
  ├─ Log AuditLog entry
  └─ Return device dict
    ↓
Background job: check_nodes_online_status() (every 30s)
  ├─ For each registered node:
  │   ├─ cutoff = now - (heartbeat_interval_sec * 3)
  │   ├─ If last_seen < cutoff: mark offline, log RouteEvent
  │   └─ If last_seen >= cutoff and was offline: mark online, log RouteEvent
  └─ Commit changes
    ↓
Frontend monitors device status in Dashboard
  ├─ Real-time updates via useNocSocket
  └─ Green dot = online, Red dot = offline
```

---

### **4. PREDICTIVE ANALYTICS FLOW**

```
Frontend requests breach prediction
  ↓
GET /api/predictive/breach_risk?device_id=ESP32_01&parameter=temperature&hours_ahead=24
  ↓
PredictiveAnalytics service
  ├─ Fetch last 7 days of readings for device + parameter
  ├─ Fit linear regression (y = mx + b)
  ├─ Extrapolate forward 24 hours
  ├─ Compare predicted value to min/max thresholds
  ├─ If breach likely: create AlertEvent with type=PREDICTIVE
  └─ Return {breach_risk: HIGH/MEDIUM/LOW, time_to_breach_hours, predicted_value}
    ↓
Frontend displays breach risk overlay on Predictive page
  ├─ Chart shows historical trend + forecasted line
  ├─ Threshold bands highlighted
  └─ Recommendation: "Temperature may exceed max in 12 hours. Consider proactive maintenance."
```

---

### **5. CONFIGURATION HIERARCHY FLOW**

```
Frontend sets threshold in Settings page
  ↓
PUT /api/settings/thresholds?device_id=ESP32_01&parameter=temperature
{
  "min_value": 10,
  "max_value": 35,
  "is_enabled": true
}
  ↓
upsert_threshold_rule() service
  └─ Create/update ThresholdRule record
    ↓
When new reading arrives:
    ↓
resolve_effective_threshold(device_id="ESP32_01", node_id=null, parameter="temperature")
  ├─ Query 1: ThresholdRule WHERE device_id="ESP32_01" AND node_id=NULL
  │   └─ Found: use min=10, max=35 ✓
  ├─ If not found, query 2: WHERE node_id=node.id (any device in node)
  ├─ If not found, query 3: WHERE device_id=NULL AND node_id=NULL (global)
  └─ Return rule or None
    ↓
evaluate_reading() uses returned threshold for violation check
```

---

### **6. NETWORK VISUALIZATION FLOW**

```
Frontend loads Topology page
  ↓
GET /api/network/enhanced-topology
  ├─ Join Node + Link tables
  ├─ Enrich with alerts per device
  ├─ Include metrics (delivery %, latency)
  └─ Return {nodes: [{id, device_id, status, alerts_count, ...}], links: [{from, to, rssi, ...}]}
    ↓
TopologyGraph component
  ├─ Parse node/link data
  ├─ Render force-directed graph (D3.js or Recharts)
  ├─ Color nodes: green=online, red=offline
  ├─ Thickness links: based on RSSI strength
  └─ Click node → show device detail panel
    ↓
User clicks "Ping" button on device
  ↓
POST /api/network/ping/ESP32_01
  ├─ Backend sends MQTT ping request
  ├─ Device responds with timestamp
  ├─ Backend calculates latency
  └─ Return {latency_ms: 45}
    ↓
Frontend updates device detail with latency
```

---

## KEY DESIGN PATTERNS

### **1. Layered Architecture**

```
Frontend (React UI)
    ↓ HTTP + WebSocket
API Client Layer (src/api/*)
    ↓ REST calls
Flask Routes (app/routes/*)
    ↓ Business logic delegation
Service Layer (app/services/*)
    ↓ Database operations
Data Layer (SQLAlchemy ORM)
    ↓
SQLite Database
```

### **2. Real-time Broadcasting**

```
- Event occurs (alert_created, new_reading, noc_refresh)
- Service calls broadcast_new_alert(), broadcast_noc_refresh()
- SocketIO emits to subscribed rooms
- Clients listen via useAlertsSocket, useNocSocket hooks
- UI state updates automatically
```

### **3. Threshold Hierarchy**

```
Global threshold (broadest scope)
  ↓
Per-node threshold (device group)
  ↓
Per-device threshold (most specific)

Lookup order: device → node → global
First match wins (fail-safe to global)
```

### **4. Background Jobs**

```
APScheduler runs recurring tasks:
- Every 30s: check_nodes_online_status() - device health
- Every 60s: evaluate_latest_readings_job() - safety-net alert re-evaluation
- Every 3600s: predictive alert generation - breach forecasting
```

### **5. Deduplication**

```
When alert created:
- Check if similar alert exists in last 10 min
- If yes: update level/value instead of creating new
- Prevents alert storm from rapid readings
```

### **6. Audit Trail**

```
All user actions logged to AuditLog:
- Device registration, configuration changes
- Alert acknowledgements, resolutions
- Report exports
- IP address, user-agent, request details preserved
```

---

## KEY TECHNOLOGIES & THEIR ROLES

| Technology           | Purpose                                |
| -------------------- | -------------------------------------- |
| **Flask**            | HTTP API framework                     |
| **SQLAlchemy**       | ORM for database abstraction           |
| **APScheduler**      | Background job scheduling              |
| **Flask-SocketIO**   | Real-time WebSocket communication      |
| **Paho MQTT**        | IoT device protocol integration        |
| **ReportLab**        | PDF generation from data               |
| **React**            | Frontend UI framework                  |
| **TypeScript**       | Type-safe frontend code                |
| **Recharts**         | Data visualization charting            |
| **Socket.io-client** | WebSocket client for real-time updates |
| **Vite**             | Ultra-fast frontend build tool         |
| **SQLite**           | Lightweight offline-first database     |

---

## SUMMARY

Your **Smart Farm NMS** is a **production-grade IoT monitoring platform** with:

1. **Real-time telemetry ingestion** from 50+ devices via MQTT/HTTP
2. **Intelligent alert system** with threshold hierarchy, deduplication, and lifecycle management
3. **Predictive analytics** for breach forecasting and network failure prediction
4. **Enterprise features** (audit logging, PDF reports, configuration management)
5. **Offline-first architecture** (no internet required for core functionality)
6. **Real-time dashboarding** with live WebSocket updates
7. **Flexible scoping** (global/per-node/per-device configuration)
8. **Responsive UI** with charts, topology visualization, and data export

**Total codebase:** ~54 Python modules + ~28 TypeScript modules + comprehensive styling/config files.

---

**Document Generated:** February 28, 2026  
**System:** Smart Farm Network Management System (NMS)  
**Status:** Production-Ready
