import { http, okResult, errResult, type ApiResult } from "./http";

export type EnhancedTopology = {
  nodes: Array<{
    id: number;
    device_id: string;
    name: string;
    type: string; // gateway|sensor|...
    status: string; // online/offline
    health: {
      status: string;
      color: string;
      delivery_rate: string; // "95.0%"
      readings_received: number;
    };
    signal: {
      rssi: number | null;
      quality: string;
    };
    last_seen: string | null;
    packets_received: number;
  }>;
  links: Array<{
    id: number;
    from: number;
    to: number;
    status: string;
    rssi: number | null;
    latency: number | null;
    strength: string;
  }>;
  summary: {
    total_nodes: number;
    online_nodes: number;
    gateways: number;
    last_updated: string;
  };
};

export type RouteEvent = {
  id: number;
  device_id: string;
  old_route: any;
  new_route: any;
  reason: string;
  timestamp: string;
};

export async function getEnhancedTopology(): Promise<
  ApiResult<EnhancedTopology>
> {
  const path = "/api/routing/topology/enhanced";
  try {
    const res = await http.get<any>(path);
    const raw = (res as any)?.data ?? res;
    return okResult(raw, { usedPath: path });
  } catch (e: any) {
    return errResult(
      e?.message || "Failed to load enhanced topology",
      null as any,
      {
        usedPath: path,
      },
    );
  }
}

export async function getRouteTimeline(
  limit = 50,
): Promise<ApiResult<RouteEvent[]>> {
  const path = `/api/routing/events?limit=${limit}`;
  try {
    const res = await http.get<any>(path);
    const raw = (res as any)?.data ?? res;
    const data = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
    return okResult(data, { usedPath: path, count: data.length });
  } catch (e: any) {
    return errResult(e?.message || "Failed to load route events", [], {
      usedPath: path,
    });
  }
}
