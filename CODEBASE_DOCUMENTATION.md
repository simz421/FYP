# Smart Farm Network Management System

This document provides a comprehensive walkthrough of every file in the codebase. The analysis is organized by folder and groups related modules together. Whenever possible the description explains what the code does and how it helps achieve the project aim and objectives:

> **Aim:** Design and develop a Network Management System for IoT enabled smart farming that functions offline, collects local sensor data, displays real‑time readings, raises alerts, and generates reports.

---

## 1. Backend

The backend is a Flask application providing REST endpoints, MQTT ingestion, scheduling, and local storage using SQLite. It implements the core logic for data collection, alerting, reporting and network management.

### 1.1 Top‑level scripts

| File                    | Purpose                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.py`                | Application entry point. Imports `create_app` from `app` and starts Flask/SocketIO on port 5000 with debugger enabled. When the server starts it also initialises the MQTT client and background scheduler. Supports offline operation by binding to localhost and using a local SQLite database. |
| `test_all_endpoints.py` | Integration test suite that exercises every public API endpoint (registration, telemetry, alerts, reports, etc.). Helps verify that objective **i** (collect sensor data) and **ii** (display real‑time readings) are met by backing the dev workflow.                                            |
| `fix_nodes_columns.py`  | One‑off migration helper. Contains code to modify the `nodes` table structure when schema changes are required during development. Supports maintainability but not part of production flow.                                                                                                      |

### 1.2 `app` package

#### 1.2.1 Configuration & Extensions

- `config.py` – centralised constants and environment variables. Defines `SQLALCHEMY_DATABASE_URI` (defaults to `sqlite:///instance/nms.sqlite3`), MQTT broker settings, scheduler flags, and other toggles. Ensures the system can run without internet.
- `extensions.py` – instantiates Flask extensions used throughout the project:
  - `db` (SQLAlchemy) for object‑relational mapping.
  - `migrate` (Flask‑Migrate) for database migrations.
  - `cors` (Flask‑CORS) to allow front‑end requests when serving the dashboard locally.
  - `scheduler` (APScheduler) for periodic jobs such as alert evaluation.

#### 1.2.2 Data models (`models.py`)

Defines the SQLAlchemy ORM classes representing every persistent record:

- **SensorReading** – telemetry payloads, indexed by device, node and time. Stores raw values, units and a server timestamp. Used by ingestion code, queries, and reports.
- **Node** – network participants (sensors, gateways, server). Tracks registration state, last seen, RSSI, packet counts and uptime. Enables objective **iii** (fault detection) and network analytics.
- **Link** – directed edges between nodes for topology and diagnostics (RSSI, latency, status).
- **RouteEvent** – audit log of network changes (registrations, telemetry ingestion) used for history and debugging.
- **SensorProfile** – declared parameters that a node is expected to report (e.g. temperature). Supports configuration UI.
- **ThresholdRule** – min/max thresholds scoped globally, per device or per node. Core to alert evaluation logic and enabling notifications.
- **AlertEvent** – raised when a reading violates a threshold. Tracks severity, level, lifecycle (active/acked/resolved) and links back to the triggering reading. Enables real‑time alerts and reporting.
- **AuditLog** – generic action log (create/update/delete) capturing actor, resource and metadata. Useful for operators and the dashboard.

Each model includes constructors that accept `**kwargs` for flexibility and many indexes to support fast queries on low‑powered hardware.

#### 1.2.3 API documentation (`api_docs.py`)

Sets up a Swagger/OpenAPI server using `flask_restx`. The file defines namespaces (devices, sensors, alerts, network, reports, etc.), request/response models and example endpoints. When the app is running, visiting `/api/docs/ui` provides an interactive offline documentation UI. This aids developers and farmers in understanding available operations without internet, aligning with the project's accessibility objective.

#### 1.2.4 Blueprints (`routes` directory)

Each file in `app/routes` creates a `Blueprint` exposing a subset of the API. All blueprints are registered in `app/__init__.py`. They correspond roughly to user‑visible features:

- `health.py` – simple `/api/health` endpoint for liveness checks.
- `devices.py` – device registration, listing and status updates.
- `sensors.py` – read/write sensor profile information.
- `telemetry.py` – POST `/api/telemetry/readings` endpoint; delegates to `telemetry.ingest_telemetry`.
- `telemetry_queries.py` – query endpoints for retrieving readings (filtered, aggregated) used by the dashboard.
- `settings_sensors.py`, `settings_thresholds.py` – configuration endpoints for sensor and threshold rules.
- `alerts.py` – retrieve, acknowledge and resolve alerts.
- `reports.py` / `reports_pdf.py` – generate JSON/PDF reports over a time range (objective **iv**).
- `network.py` – network metrics (packets lost, signal strength) for diagnostics.
- `routing.py` & `network_management.py` – topology and route events used to visualise the mesh and manage nodes.
- `predictive.py` / `recommendations.py` – predictive analytics endpoints that forecast breaches and suggest corrective actions.
- `mqtt_status.py` – check connection status with the local MQTT broker.
- `system_monitor.py` – endpoints supporting the NOC view and system health.
- `data_export.py` – triggers CSV/JSON exports via `DataExporter`.
- `audit.py` – access audit logs for administrative oversight.
- `websocket.py` – upgrades HTTP requests to WebSocket connections; primarily used by the frontend for live updates.

Each route file contains decorators to parse request JSON, call the appropriate service function, and return JSON responses with HTTP status codes. They are the glue between the client (browser or device) and the business logic.

### 1.2.4.1 Detailed blueprint breakdown

Below is a file-by-file enumeration of every blueprint in the `app/routes` folder along with the HTTP endpoints it implements and a short description of what the code inside does. This level of detail allows a new developer to reconstruct the API surface precisely.

- **health.py**
  - `GET /api/health` – returns `{"ok": true, "status": "healthy"}` (or similar). Used by automated checks and the UI health card. Simple one‑liner.

- **devices.py**
  - Utility functions `_to_int`, `_to_float`, `node_to_dict` perform type conversions and serialize `Node` objects.
  - `GET /api/devices` – lists all registered nodes in descending ID order.
  - `POST /api/devices/register` – accepts JSON body with metadata, creates or updates a `Node`, logs a `RouteEvent` and an audit entry, and returns the created/updated node record.
  - `POST /api/devices/heartbeat` – heartbeat endpoint called by devices; updates `last_seen`, `last_rssi`, packet counters (`packets_received`, `packets_missed`), sets status to online, records a `RouteEvent`, and replies with current status. Protects against missing or unregistered device IDs.

- **sensors.py**
  - CRUD endpoints for sensor profiles: create, list, update, delete. Each operation validates input, calls `configuration_service` to persist and writes audit logs.

- **settings_sensors.py**
  - Wrappers around sensor profile management used by the Settings page. Supports bulk operations and returns human‑readable success messages.

- **settings_thresholds.py**
  - Endpoints to set, list and delete threshold rules. JSON payload contains `parameter`, `min_value`, `max_value`, optional `device_id`/`node_id`. Uses `configuration_service` and writes audit entries.

- **telemetry.py**
  - `POST /api/telemetry/readings` – receives telemetry payload(s), calls `ingest_telemetry` from `services/telemetry.py`, then returns a summary with status code 201 (created) or 200/400/403. Handles both single readings and batch arrays.

- **telemetry_queries.py**
  - `GET /api/telemetry/latest` – parameters control filtering by device/node/parameter or per‑sensor mode. Uses helper functions to parse query string and forwards to `services/telemetry_queries.get_latest_readings`.
  - `GET /api/telemetry/range` – accepts `start`/`end` times and optional `aggregate` flag. If aggregation requested it calls `get_aggregated_series`; otherwise returns raw readings via `get_range_readings`. Includes extensive input validation.

- **alerts.py**
  - `GET /api/alerts` – enterprise inbox with a rich set of query filters (device_id, node_id, parameter, status, severity, level, free‑text) and pagination. Legacy flags `active_only` and `acked_only` preserved. Delegates to `alerts_service.list_alerts_page`.
  - `POST /api/alerts/<id>/ack` – acknowledges an alert with optional note.
  - `POST /api/alerts/<id>/resolve` – resolves an active alert.
  - `GET /api/alerts/summary` – returns counts by level/severity for dashboard cards using `alerts_summary_service.get_alert_summary`.
  - `GET /api/alerts/trends` – returns time‑bucketed trend data for charting.

- **reports.py**
  - `GET /api/reports/daily`, `/hourly`, `/custom` – endpoints for generating JSON reports. Accepts query parameters for time range, device, parameters and bucket size. Internally calls `reports_service`.

- **reports_pdf.py**
  - Same endpoints as `reports.py` but returns a PDF; uses `pdf_report.render_report_pdf` to convert HTML templates to PDF and sends via Flask's `send_file`.

- **network.py**
  - `GET /api/network/health` – returns overall network health metrics computed by `network_analytics_service`. Includes packet loss, average latency, node counts.
  - `GET /api/network/ping` – performs on‑demand ping diagnostics using `network_diagnostics_service.ping_nodes`.

- **routing.py**
  - `GET /api/routing/topology` – returns a serialized graph of nodes and links; utilises `routing_service.get_topology`.
  - `POST /api/routing/link` – create/update a link between two nodes.

- **network_management.py**
  - `POST /api/network-management/scan` – triggers a manual network discovery or topology refresh.
  - `GET /api/network-management/events` – fetches `RouteEvent` log entries.

- **predictive.py**
  - `GET /api/predictive/alerts` – retrieves predictive alert rows from database; parameters control filtering.
  - `POST /api/predictive/run` – forces immediate predictive analytics run (used by scheduler or manual trigger).

- **recommendations.py**
  - `GET /api/recommendations` – returns a list of recommended actions computed by `recommendations_service` based on predictive alerts.

- **mqtt_status.py**
  - `GET /api/mqtt/status` – queries the MQTT client object attached to the Flask app and reports connection state.

- **system_monitor.py**
  - `GET /api/system/monitor` – returns server CPU/memory info and process uptime. Also proxies MQTT status and scheduler state for the NOC view.

- **data_export.py**
  - `GET /api/data-export/readings` – streams a CSV of telemetry using `DataExporter.export_readings_csv`.
  - `GET /api/data-export/alerts` – streams alerts CSV.
  - `GET /api/data-export/devices` – streams devices CSV.
  - `GET /api/data-export/topology` – returns JSON.
  - `GET /api/data-export/full-backup` – streams a ZIP containing full backup.
  - `POST /api/data-export/import` – accepts file upload, validates via `DataImporter.validate_backup_file`, and optionally imports data.

- **audit.py**
  - `GET /api/audit` – list audit logs with filters.
  - `GET /api/audit/<id>` – view a particular audit entry.

- **websocket.py**
  - Establishes namespace `/ws` for socket.io connections and defines event handlers for client subscriptions to `alerts` and `noc` channels. Mostly boilerplate; actual broadcasting is done in `services/websocket_service.py`.

This breakdown covers each route file’s public interface and describes the data flow from HTTP request to service call and, if relevant, to database or websocket broadcast. A developer replicating the system would need to implement the same endpoints and associated logic.

#### 1.2.5 Business logic (`services` directory)

The `services` folder implements the core algorithms that satisfy the project objectives:

- `telemetry.py` – validation/normalisation of incoming telemetry. Handles batch payloads, enforces device registration, writes `SensorReading` records, emits `RouteEvent` entries, triggers WebSocket broadcasts, logs actions and calls `alerts_service.evaluate_reading` for real‑time alerting (objective **iii**). Also provides helper functions to parse timestamps and parameters.
- `alerts_service.py` – evaluates thresholds, de‑duplicates alerts, escalates severity, auto‑resolves when values return to normal, and supports paging/filters. Contains helper routines such as `_compute_level` and `_auto_resolve_matching_alerts`. This module underpins the alerting system and is central to objectives **iii** and **iv**.
- `thresholds_service.py` – lookup of the most specific effective threshold rule for a given device/node/parameter. Used by `alerts_service` and configuration endpoints.
- `alerts_summary_service.py` – aggregates alert statistics for dashboard widgets (counts per severity/level, trends).
- `alert_reporting_service.py` – compiles periodic alert reports (e.g. daily summary) for export or email.
- `audit_service.py` – records audit logs; provides convenience methods such as `log_telemetry_ingestion`. Supports transparency and debugging.
- `configuration_service.py` – applies configuration changes (sensor profiles, thresholds) and writes audit entries.
- `data_export_service.py` – generates CSV or JSON exports of readings, alerts, devices and full backups (zip) and contains an importer for restoring from backups. Enables offline report generation and data portability, satisfying objective **iv**.
- `mqtt_service.py` – lightweight MQTT client that subscribes to the telemetry topic on the local broker. When messages arrive it forwards payloads to the same ingestion logic used by HTTP. This allows disconnected IoT devices using wireless networks to deliver data to the system.
- `websocket_service.py` – initialises Flask‑SocketIO, defines `broadcast_new_reading`, `broadcast_new_alert`, and attaches the socket instance to the app. The frontend consumes these events to display real‑time updates (**ii**).
- `network_analytics_service.py` – computes network metrics (packet loss, jitter, average latency) across nodes and generates topology information. This supports the NMS aspect of the project and addresses objective **iii** by detecting network faults.
- `network_diagnostics_service.py` – ping tests and locality checks; used by routes to perform on‑demand diagnostics.
- `monitoring.py` – background routines such as `check_nodes_online_status` which updates node status and RSSI counts. Plays into fault detection.
- `reports_service.py` – builds time‑bucketed reports from sensor readings; used by both JSON endpoints and PDF generation.
- `pdf_report.py` – uses a templating engine to render HTML reports as PDF documents.
- `predictive_analytics_service.py` – analyses historical data to forecast future threshold breaches and auto‑resolve stale predictive alerts. Enables the predictive and recommendation pages.
- `recommendations_service.py` – based on predictive alerts, formulates actionable suggestions for the farmer (e.g. "water field 3 in 2h").
- `realtime_events.py` – helper utilities for formatting events destined for SSE/WebSocket streams.
- `alerts_summary_service.py` _(again)_ – summarises alert data for dashboards.
- `alerts_reportin g_service.py` _(duplicate earlier)_ – deals with periodic alert reporting.

Each service returns plain Python dictionaries or ORM objects that are later serialized by the routes. They are written with offline operation in mind: all actions can run without network connectivity and rely solely on the local database.

#### 1.2.6 Jobs (`jobs` directory)

- `alert_jobs.py` – defines the `evaluate_latest_readings_job` scheduled task. Periodically scans the most recent readings and re‑runs alert evaluation to catch any missed conditions and auto‑resolve alerts. Registered by `app.setup_scheduler()`.

#### 1.2.7 Scripts (`scripts` directory)

- `init_migrations.py` – helper shell script invoked when setting up a clean instance to initialise Flask‑Migrate tables.
- `websocket.py` and `websocket_service.py` – older/alternate implementations of websocket support; included for historical reasons and backwards compatibility.

### 1.3 Instance folder

Contains the SQLite database `nms.sqlite3` and a copy of `requirements.txt` used on the device. This directory is writeable at runtime and holds all persistent data locally.

---

## 2. Frontend

The frontend is a Vite‑powered React TypeScript application that runs in the browser on the same machine as the backend. It consumes the REST API and WebSocket streams to provide a dashboard usable without internet access.

### 2.1 Configuration files

- `package.json` – lists dependencies (`react`, `socket.io-client`, `axios`, etc.) and build scripts. Ensures the UI can be built and served locally.
- `vite.config.ts` & `tsconfig.*` – Vite and TypeScript configuration for building the SPA.
- `eslint.config.js` – linting rules to maintain code quality.
- `public/index.html` – HTML template that bootstraps the React app.

### 2.2 Entry points

- `src/main.tsx` – renders `<App />` into the DOM; sets up any providers (e.g. theme).
- `src/App.tsx` – top‑level component that defines routes for pages, global layout, and connects to realtime hooks. It also handles authentication tokens and central application state.

### 2.3 API layer (`src/api`)

Each file corresponds to a backend resource and exposes functions to call the HTTP endpoints using `axios` wrappers:

- `http.ts` – configures the axios instance with base URL, interceptors for error handling, and token management.
- `alerts.ts`, `devices.ts`, `telemetry.ts`, `network.ts`, `reports.ts`, `routing.ts`, `settings_sensors.ts`, `settings_thresholds.ts`, `system_monitor.ts`, `predictive.ts`, `recommendations.ts`, `readings.ts`, `health.ts`, etc. – CRUD operations and specialised queries that return typed results. These functions are consumed by hooks and pages to fetch data for display or send commands.
- `tryPaths.ts` – utility to construct API URLs in a flexible way depending on environment.

This separation isolates network logic from UI components and facilitates offline testing by mocking the API layer.

### 2.4 Realtime (`src/realtime`)

WebSocket hooks provide live updates:

- `socket.ts` – initializes a `socket.io-client` connection to the backend. Automatically reconnects and exposes event names.
- `useAlertsSocket.ts` & `useNocSocket.ts` – custom React hooks that subscribe to alert and network‑of‑care channels respectively. They update local component state when messages arrive, enabling objective **ii** (real‑time display).

### 2.5 Components (`src/components`)

Organised by feature area:

- `alerts/` – `AlertsTable.tsx`, `AlertDetailsDrawer.tsx`, `SeverityBadge.tsx` – display the alert inbox, details and severity indicators.
- `layout/` – `AppLayout.tsx` provides header, side menu and footer used across all pages.
- `network/` – `TopologyGraph.tsx` renders the mesh topology using D3 or a canvas-based library.
- `noc/` – `KpiCards.tsx`, `WorstNodesTable.tsx`, `IncidentsFeed.tsx` – components for the network operations centre view.
- `system/` – `SystemMonitorCards.tsx` shows CPU, memory and MQTT status of the server.
- `ui/` – generic building blocks (`Button.tsx`, `Card.tsx`, `Input.tsx`, `Select.tsx`) that enforce consistent styling and behavior.
- `common/` – shared utilities such as `ErrorBoundary.tsx` to catch render errors.

Each component is fully typed and focuses on rendering data received from the API or realtime hooks. Their design emphasises simplicity so that farmers with limited technical skills can interpret the dashboard (operational feasibility).

### 2.6 Pages (`src/pages`)

High‑level views corresponding to the main tabs in the application:

- `Dashboard.tsx` – home screen summarising key statistics (alerts count, network health) using cards and charts.
- `Telemetry.tsx` – interactive graph of historical sensor data; allows parameter filtering and time window selection. Pulls from `/api/telemetry/queries` endpoints.
- `Alerts.tsx` – full alert inbox with filters and acknowledgement controls.
- `Reports.tsx` – triggers generation of JSON/PDF reports and displays exported data.
- `Settings.tsx` – UI for managing sensor profiles and threshold rules; uses forms that call the configuration API.
- `Predictive.tsx` & `Recommendations.tsx` – display forecasts and actionable suggestions generated by the backend.
- `Topology.tsx` – network map showing nodes and links.

Pages compose the components described above and hook into the API and realtime layers. They are the user‑facing interface that makes the project accessible to farmers.

### 2.7 Utilities (`src/utils`)

- `analytics.ts` – helper to compute statistics for charts (rolling averages, trends).
- `ensureArray.ts` – ensures a value is treated as an array.
- `insightsRules.ts` – maps parameter values to descriptive rules (used by recommendations).
- `networkMetrics.ts` – processes raw network data into display‑friendly formats.

### 2.8 Types (`src/types`)

TypeScript interfaces defining shapes of API responses, device records, alerts, etc. They enforce compile‑time correctness across the app.

### 2.9 Other assets

- `src/styles/enterprise.css` & `src/ui/theme.css` – custom CSS to style the dashboard with a clean, professional look.
- `README.md` (in frontend root) – documentation for building and running the front end.

---

## 3. Howeach file contributes to the project objectives

1. **Collect sensor data locally from multiple IoT devices**
   - `app/routes/telemetry.py` + `app/services/telemetry.py` ingest HTTP POSTs.
   - `mqtt_service.py` subscribes to local MQTT broker where ESP32/Arduino devices publish.
   - `app/models.SensorReading` stores the data in `instance/nms.sqlite3`.
   - Frontend pages such as `Telemetry.tsx` and widgets fetch this data via `readings.ts` and `telemetry.ts` APIs.

2. **Display real time sensor readings without requiring cloud access**
   - `app/services/websocket_service.py` broadcasts `new_reading` events.
   - `src/realtime` hooks listen for those events and update UI components instantly.
   - `Dashboard`, `Telemetry` and `Alerts` pages refresh automatically.

3. **Alert the user to network faults**
   - `alerts_service.py` and `thresholds_service.py` evaluate readings against rules defined via `settings_thresholds.py` routes.
   - `monitoring.py` job marks nodes offline if heartbeats stop.
   - `predictive_analytics_service.py` generates warnings ahead of time.
   - Alerts are surfaced in the frontend through `AlertsTable` and real‑time feeds (`useAlertsSocket`).

4. **Generate periodic reports on farm conditions**
   - `reports_service.py` compiles data into time‑bucketed buckets; `pdf_report.py` renders them.
   - `/api/reports` and `/api/reports/pdf` routes expose JSON and PDF files.
   - The frontend `Reports.tsx` page allows the user to select parameters and download files.
   - `data_export_service.py` provides additional CSV/backup exports for offline sharing.

---

## 4. Summary

The codebase is organised into clear layers—routes, services, models—with a focus on offline‑first operation. It includes both the backend logic required for data collection, storage, alerting and reporting as well as a React frontend that renders an intuitive dashboard. Every file contributes to the core objectives either directly (ingestion, alerting, visualization) or by supporting infrastructure (configuration, documentation, tests).

The system is scalable; additional sensors, alerts rules or network metrics can be added by extending the relevant models and services. Since all communication is local and the database is self‑contained, the solution is usable by farmers in rural areas with unreliable internet, fulfilling the project’s significance and feasibility analysis.

---

## 5. Detailed frontend file analysis

To recreate the frontend exactly, one must understand the role of each TypeScript/JS file and the API calls it makes. The following breakdown enumerates every source file under `src` and describes its purpose and interactions with the backend.

### 5.1 Entry and layout

- **src/main.tsx** – the ReactDOM entry point. It imports global CSS, wraps `<App />` with any context providers and calls `createRoot`. No API calls here; it simply bootstraps the SPA.
- **src/App.tsx** – defines the router (usually React Router) with routes corresponding to the pages (Dashboard, Alerts, Telemetry, etc.). It also initialises realtime sockets (`socket.ts`) and maintains authentication tokens in local storage. The component listens for global websocket events and can dispatch them to a context or state management solution.

### 5.2 API layer (`src/api`)

Each file exports functions which use the shared axios instance from `http.ts` to call backend routes. Developers replicating the system must implement the same functions as follows:

- **http.ts** – sets `baseURL` (e.g. `http://localhost:5000/api`), adds interceptors to attach Bearer tokens from local storage, handles 401 responses globally by redirecting to login. Export `axiosInstance`.

- **alerts.ts** – functions such as `listAlerts(params)`, `ackAlert(id,note)`, `resolveAlert(id)`, `getSummary(params)`, `getTrends(params)`. Each calls corresponding `/api/alerts` endpoints and returns typed JSON.

- **devices.ts** – `registerDevice(payload)`, `heartbeat(deviceId, stats)`, `getDevices()`; call `/api/devices` endpoints.

- **telemetry.ts** – `postReading(reading)` and `postBatch(readings)` map to `/api/telemetry/readings`.

- **readings.ts** – `getLatest(params)`, `getRange(params)` which hit `/api/telemetry/latest` and `/api/telemetry/range`.

- **network.ts** – `getNetworkHealth()`, `pingNodes(list)`; hit `/api/network/health` and `/api/network/ping`.

- **routing.ts** – `getTopology()`, `createLink(linkData)`; hit `/api/routing/topology` and `/api/routing/link`.

- **settings_sensors.ts** – CRUD wrappers around sensor profile endpoints (same as `sensors` service).

- **settings_thresholds.ts** – wrappers around threshold settings (`/api/settings/thresholds`).

- **system_monitor.ts** – `getSystemStatus()` which calls `/api/system/monitor`.

- **predictive.ts** – `getPredictiveAlerts()`, `runPredictive()` mapping to `/api/predictive/*`.

- **recommendations.ts** – `getRecommendations()` hitting `/api/recommendations`.

- **reports.ts** – `getReport(type, params)` and `getPdfReport(type, params)` which call `/api/reports/*` and `/api/reports/pdf/*`.

- **health.ts** – simple GET to `/api/health` used by initialisation and health check components.

- **tryPaths.ts** – utility that constructs URLs based on environment (development vs production), e.g. `buildUrl('/alerts')`.

These functions are pure wrappers; they forward parameters from the UI components and return promise‑based results. They are critical for offline testing since they can be mocked to return cached data.

### 5.3 Realtime hooks (`src/realtime`)

- **socket.ts** – imports `socket.io-client`, connects to backend `http://localhost:5000` (same origin). Listens for `connect`, `disconnect`, `new_reading`, `new_alert`, `alert_ack`, and `network_update` events. Exports the socket instance and helper `emit` functions.

- **useAlertsSocket.ts** – custom React hook that attaches `socket.on('new_alert', callback)` and cleans up on unmount. Returns the latest alert or list of alerts to the calling component.

- **useNocSocket.ts** – similar hook for network‑of‑care events (`network_update`, `node_status_change`).

### 5.4 Components (`src/components`)

Each component usually imports one or more API functions and sometimes realtime hooks.

- **alerts/AlertsTable.tsx** – renders a table of alerts. On mount it calls `listAlerts` with filters stored in local state. It also subscribes to `useAlertsSocket` to prepend incoming alerts. The table supports pagination, search, and action buttons that invoke `ackAlert` and `resolveAlert` API calls.

- **alerts/AlertDetailsDrawer.tsx** – side drawer that shows full alert information when a row is clicked. Can issue API calls to ack/resolve and update local state.

- **alerts/SeverityBadge.tsx** – simple presentational component mapping severity/level to colored badges.

- **layout/AppLayout.tsx** – provides navigation menu links which correspond to the routes defined in `App.tsx`. It does not call APIs itself.

- **network/TopologyGraph.tsx** – on mount it calls `getTopology` and renders nodes/edges using D3. It also subscribes to noc socket events to update the graph in real time.

- **noc/KpiCards.tsx** – fetches `/api/alerts/summary` and `/api/network/health` and displays key metrics. Subscribes to sockets to update counts.

- **noc/WorstNodesTable.tsx** – similar to alerts table but for network health; calls `getNetworkHealth()`.

- **noc/IncidentsFeed.tsx** – realtime log of events; listens to socket events and appends them to a scrolling feed.

- **system/SystemMonitorCards.tsx** – calls `getSystemStatus` periodically (e.g. every 10 seconds) and displays CPU, memory, MQTT status, scheduler state.

- **ui/Button.tsx**, **Card.tsx**, **Input.tsx**, **Select.tsx**, **Badge.tsx** – encapsulate styling and props; do not themselves initiate API calls.

- **common/ErrorBoundary.tsx** – React error boundary to catch exceptions in child components and display fallback UI; no API calls.

### 5.5 Pages (`src/pages`)

Each page orchestrates components and API calls:

- **Dashboard.tsx** – combines `KpiCards`, `IncidentsFeed`, and `TopologyGraph` (or subset). On mount it triggers initial fetches for alert summary and network health.

- **Telemetry.tsx** – contains a form to select device/parameter/time window. On submission it calls `getLatest` or `getRange` depending on mode and renders a chart (e.g. using Chart.js). It may require multiple API calls when the user changes parameters. It also listens for realtime new readings and optionally adds them to the graph if they match the current filter.

- **Alerts.tsx** – renders `AlertsTable` and `AlertDetailsDrawer`. Initializes with `listAlerts({ status: 'active' })` and updates via socket. Provides controls bound to `ackAlert` and `resolveAlert`.

- **Reports.tsx** – provides UI for selecting report type (daily/hourly/custom) and parameters. On generate it calls `getReport` or `getPdfReport` and triggers file download by creating a blob URL and clicking a hidden link.

- **Settings.tsx** – includes sub‑forms for sensor profiles and threshold rules. Each form calls `createSensorProfile`, `updateSensorProfile`, `createThreshold`, `updateThreshold` etc. It uses `listSensorProfiles` and `listThresholds` to populate tables.

- **Predictive.tsx** – calls `getPredictiveAlerts` and displays them in a table.

- **Recommendations.tsx** – calls `getRecommendations` and lists action items; may periodically refresh.

- **Topology.tsx** – duplicates functionality from `TopologyGraph` but often shows a full screen map with controls to add links.

### 5.6 Utility files

- **analytics.ts** – pure functions used by charts (compute averages, trend lines). Not directly tied to API, but used by pages that display graphs.

- **ensureArray.ts** – simple helper to convert a value to an array.

- **insightsRules.ts** – mapping table used by recommendations to translate sensor values into textual rules.

- **networkMetrics.ts** – formatting helpers to convert raw network health JSON into UI‑friendly structures.

### 5.7 Types (`src/types`)

Contains TypeScript interfaces for API request and response objects: `Alert`, `Device`, `Reading`, `NetworkHealth`, etc. These interfaces should exactly match the JSON returned by backend routes; mismatches indicate either an API change or a type error.

### 5.8 Styles and assets

The CSS files (`enterprise.css`, `theme.css`) define the look and feel. No logic here but must be included when assembling the HTML template in `public/index.html`.

### 5.9 Build and run

The frontend is built via `npm run build` (production) or `npm run dev` (development server). The development server proxies `/api` requests to the backend when run alongside `npm run dev` with Vite’s proxy config. For a self‑contained deployment the built assets (`dist` folder) can be served by a simple HTTP server or by integrating with Flask's static folder.

## 6. System workflow & offline operation

This section ties together the backend and frontend, describes the full data flow, and spells out the software stack required to recreate the system from scratch.

### 6.1 Software components & prerequisites

- **Python 3.10+** – used for the backend. Virtual environment recommended (venv).
- **Flask** and extensions (`Flask‑CORS`, `Flask‑Migrate`, `Flask‑SocketIO`, `APScheduler`).
- **SQLAlchemy** – ORM; uses SQLite by default. No external database server required.
- **Mosquitto MQTT broker** (or any MQTT server) running on localhost (1883) to receive device telemetry.
- **Node.js 16+** and **npm** – used to build the React frontend with Vite.
- **Git** – to clone the repository.

### 6.2 Initialization steps

1. **Clone the repo** and navigate to `backend` and `frontend` folders.
2. **Backend**:
   - `python -m venv venv` and `venv\Scripts\activate` (Windows).
   - `pip install -r requirements.txt`.
   - Ensure `instance/` directory exists; SQLite file created automatically.
   - Run `flask db init` (first time) and `flask db migrate && flask db upgrade` if using migrations (scripts under `app/scripts`).
   - Optionally configure environment variables for MQTT broker or database.
3. **Frontend**:
   - `npm install` in `frontend/`.
   - `npm run dev` starts development server with hot reload and proxies API requests to backend.
   - For production, `npm run build` produces `dist/` which can be deployed to any static host; configure Flask to serve `dist` or use a separate web server (e.g. nginx).
4. **Broker**:
   - Start Mosquitto with `mosquitto -v` or use Docker image. Ensure it listens on localhost port 1883.

### 6.3 Runtime behaviour

- **Device registration & telemetry ingestion**: IoT devices (e.g. ESP32 boards) connect to the local network and POST their registration metadata to `/api/devices/register`. They then periodically send telemetry to `/api/telemetry/readings` or publish to the MQTT topic `nms/telemetry/<device_id>`. The backend's `MQTTService` subscribes to `nms/telemetry/#` and forwards payloads to the same ingestion logic used by HTTP; this allows flexibility if devices speak HTTP or MQTT.

- **Telemetry service** (`app/services/telemetry.py`) validates inputs, writes `SensorReading` rows, logs a `RouteEvent`, and pushes a broadcast event through SocketIO with `broadcast_new_reading`. It also triggers alert evaluation via `alerts_service.evaluate_reading`.

- **Alert evaluation**: `alerts_service` fetches applicable threshold rules (via `thresholds_service.resolve_effective_threshold`), checks for violations, de‑duplicates existing alerts, creates new `AlertEvent` rows or resolves them. It returns a summary used by ingestion to include in HTTP response (useful for device diagnostics).

- **Background jobs**: APScheduler jobs defined in `app/setup_scheduler()` run every minute to re‑evaluate latest readings (`alert_jobs.evaluate_latest_readings_job`) and every five minutes to check node online statuses (`monitoring.check_nodes_online_status`). A 15‑minute job triggers predictive analytics tasks. Jobs run inside the Flask application context so they can access the database and services.

- **Websocket broadcasts**: `websocket_service` initialises `socketio` with namespaces; when a new reading or alert is created the service calls `broadcast_new_reading` or `broadcast_new_alert` which emits JSON messages to all connected clients. The frontend hooks update component state accordingly, providing live updates without polling.

- **Frontend interactions**: When a user visits a page, React components call the API wrapper functions described earlier. For example, the Telemetry page calls `getLatest({ device_id: "ESP32_01", limit: 100 })`. The axios instance performs a GET to `http://localhost:5000/api/telemetry/latest?device_id=ESP32_01&limit=100` and returns the data. The component then renders charts or tables. When new telemetry arrives over websocket, the same component’s hook adds the reading to the existing dataset if it matches current filters.

- **Offline operation**: no part of the system depends on external internet services. The backend uses local SQLite; MQTT broker runs on the same machine; the frontend is served either by Vite or by Flask as static files. All communication occurs over `localhost` or the local network (e.g. a farmer’s laptop connected to a Raspberry Pi). If network connectivity to the internet is absent, devices still publish to the broker, the backend still ingests and stores data, and the dashboard remains fully functional. Data exports and reports are generated locally and can be copied via USB or SD card.

- **Recreating from scratch**: A developer could follow the initialization steps above, implement the same API endpoints and service logic, recreate the React components/pages with the described API calls, and start with a blank database. The Markdown documentation, combined with code comments, provides all necessary details.

### 6.4 Additional considerations

- **Data caching**: While the system is not explicitly a PWA, the frontend could be extended to cache API responses in IndexedDB to survive browser restarts. However, because the backend is local, caching is rarely needed.
- **Energy constraints**: The use of Python, SQLite, and lightweight JavaScript frameworks keeps CPU and memory usage low, allowing deployment on single‑board computers running from batteries or solar.
- **Extensibility**: The architecture cleanly separates transport (HTTP/MQTT), business logic (services), and presentation (frontend). New features can be added by creating new model classes, services, and corresponding routes/pages.

---

> This document may be updated as the codebase evolves.
