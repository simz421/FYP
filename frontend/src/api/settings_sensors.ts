import { http } from "./http";

export type SensorProfileRow = {
  id: number;
  device_id: string;
  node_id: number | null;
  parameter: string;
  unit: string | null;
  is_enabled: boolean;
  created_at?: string | null;
};

type ListResponse = {
  ok: boolean;
  count?: number;
  data?: SensorProfileRow[];
};

export async function fetchSensorProfiles(opts?: {
  device_id?: string;
  node_id?: number;
  parameter?: string;
}): Promise<SensorProfileRow[]> {
  const qs = new URLSearchParams();
  if (opts?.device_id) qs.set("device_id", opts.device_id);
  if (opts?.node_id !== undefined) qs.set("node_id", String(opts.node_id));
  if (opts?.parameter) qs.set("parameter", opts.parameter);

  const path = `/api/settings/sensors${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await http.get<ListResponse>(path);
  return res.data ?? [];
}

export async function upsertSensorProfile(payload: {
  device_id: string;
  parameter: string;
  unit?: string;
  node_id?: number;
  is_enabled?: boolean;
}): Promise<any> {
  return http.post("/api/settings/sensors", payload);
}

export async function patchSensorProfile(
  id: number,
  payload: { unit?: string; is_enabled?: boolean; node_id?: number | null },
): Promise<any> {
  return http.patch(`/api/settings/sensors/${id}`, payload);
}

export async function deleteSensorProfile(id: number): Promise<any> {
  return http.delete(`/api/settings/sensors/${id}`);
}
