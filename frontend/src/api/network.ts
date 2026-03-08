// src/api/network.ts
import { httpGet } from "./http";

/**
 * IMPORTANT:
 * Topology.tsx imports these named exports:
 * - getRoute
 * - getRouteTimeline
 * - getEnhancedTopology
 * - getNetworkMetrics
 * - pingDevice / tracerouteDevice / bandwidthTest
 *
 * This file exports ALL of them (fixes: "doesn't provide export named getRoute").
 */

export type NetworkMetrics = {
  total_nodes: number;
  online_nodes: number;
  network_health: number; // percent
  avg_signal_strength: number; // RSSI average
  problem_nodes: number;
  updated_at: string;
};

export type NetworkHealthSummary = {
  summary: {
    total_nodes: number;
    online_nodes: number;
    offline_nodes?: number;
    online_percentage?: string;

    network_delivery_rate?: number;
    network_delivery_percent?: string | number;

    network_delivery_percent_value?: number; // (if you ever add it later)
    average_rssi: number;
    problem_nodes_count: number;
  };
  node_metrics?: any[];
  problem_nodes?: any[];
  period_hours?: number;
  calculated_at: string;
};

export type NetworkEvent = {
  type?: string;
  timestamp?: string;
  message?: string;
  device_id?: string;
  severity?: string;
  [k: string]: any;
};

export type EnhancedNode = {
  id: number;
  device_id: string;
  name: string;
  type: string; // sensor/gateway/server
  status: string; // online/offline/degraded
  health: {
    status: string;
    color: string;
    delivery_rate: string | number; // "95.0%" or 0.95 depending on backend
    readings_received: number;
  };
  signal: {
    rssi: number | null;
    quality: string;
  };
  last_seen: string | null;
  packets_received: number;
};

export type EnhancedLink = {
  id: number;
  from: number;
  to: number;
  status: string; // up/down
  rssi: number | null;
  latency: number | null;
  strength: string; // strong/weak
};

export type EnhancedTopology = {
  nodes: EnhancedNode[];
  links: EnhancedLink[];
  summary: {
    total_nodes: number;
    online_nodes: number;
    gateways: number;
    last_updated: string;
  };
};

export type RouteResult = {
  device_id: string;
  gateway_id: number;
  route: Array<number | string>;
  total_cost: number | null;
  ok?: boolean;
  reason?: string;
};

export type RouteEvent = {
  id: number;
  device_id: string;
  old_route: string | null;
  new_route: string | null;
  reason: string;
  timestamp: string;
};

// ---------------------------
// Core Network APIs
// ---------------------------

export async function getNetworkMetrics() {
  // returns: { ok, data: NetworkMetrics }
  return httpGet<{ ok: boolean; data: NetworkMetrics }>("/api/network/metrics");
}

export async function getNetworkHealth(hours = 24) {
  // returns: { ok, data: NetworkHealthSummary }
  return httpGet<{ ok: boolean; data: NetworkHealthSummary }>(
    `/api/network/health?hours=${hours}`,
  );
}

export async function getNetworkEvents(hours = 24, limit = 50) {
  // returns: { ok, data: NetworkEvent[], count }
  return httpGet<{ ok: boolean; data: NetworkEvent[]; count?: number }>(
    `/api/network/events?hours=${hours}&limit=${limit}`,
  );
}

export async function getNodeHealth(deviceId: string, hours = 24) {
  return httpGet<{ ok: boolean; data: any }>(
    `/api/network/health/node/${encodeURIComponent(deviceId)}?hours=${hours}`,
  );
}

// ---------------------------
// Routing / Topology APIs
// ---------------------------

export async function getEnhancedTopology() {
  return httpGet<EnhancedTopology>("/api/routing/topology/enhanced");
}

/**
 * ✅ This is the missing export that caused your runtime error.
 */
export async function getRoute(deviceId: string) {
  return httpGet<RouteResult>(
    `/api/routing/route/${encodeURIComponent(deviceId)}`,
  );
}

export async function getRouteTimeline() {
  // your backend routing.py includes /events/timeline
  return httpGet<RouteEvent[]>("/api/routing/events/timeline");
}

// ---------------------------
// Diagnostics APIs (network_management.py)
// ---------------------------

export async function pingDevice(deviceId: string) {
  return httpGet<{ ok: boolean; data: any }>(
    `/api/network/diagnostics/ping/${encodeURIComponent(deviceId)}`,
  );
}

export async function tracerouteDevice(deviceId: string) {
  return httpGet<{ ok: boolean; data: any }>(
    `/api/network/diagnostics/traceroute/${encodeURIComponent(deviceId)}`,
  );
}

export async function bandwidthTest(deviceId: string) {
  return httpGet<{ ok: boolean; data: any }>(
    `/api/network/diagnostics/bandwidth/${encodeURIComponent(deviceId)}`,
  );
}
