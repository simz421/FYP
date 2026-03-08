import { http } from "./http";

export type ThresholdRow = {
  id: number;
  device_id: string | null;
  node_id: number | null;
  parameter: string;
  min_value: number | null;
  max_value: number | null;
  is_enabled: boolean;
  updated_at: string;
};

type ListResponse = { ok: boolean; count?: number; data?: ThresholdRow[] };

export async function fetchThresholds(opts?: {
  device_id?: string;
  node_id?: number;
  parameter?: string;
}): Promise<ThresholdRow[]> {
  const qs = new URLSearchParams();
  if (opts?.device_id) qs.set("device_id", opts.device_id);
  if (opts?.node_id !== undefined) qs.set("node_id", String(opts.node_id));
  if (opts?.parameter) qs.set("parameter", opts.parameter);

  const path = `/api/settings/thresholds${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await http.get<ListResponse>(path);
  return res.data ?? [];
}

export async function upsertThreshold(payload: {
  scope: { device_id?: string; node_id?: number };
  parameter: string;
  min_value?: number;
  max_value?: number;
  is_enabled?: boolean;
}): Promise<any> {
  const qs = new URLSearchParams();
  if (payload.scope.device_id) qs.set("device_id", payload.scope.device_id);
  if (payload.scope.node_id !== undefined)
    qs.set("node_id", String(payload.scope.node_id));

  const path = `/api/settings/thresholds${qs.toString() ? `?${qs.toString()}` : ""}`;

  return http.put(path, {
    parameter: payload.parameter,
    min_value: payload.min_value,
    max_value: payload.max_value,
    is_enabled: payload.is_enabled ?? true,
  });
}
