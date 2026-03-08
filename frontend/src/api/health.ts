import { http, okResult, errResult } from "./http";
import type { ApiResult } from "./http";

export type HealthResponse = {
  status?: string;
  message?: string;
  uptime_seconds?: number;
  time?: string;
};

export async function fetchHealth(): Promise<ApiResult<HealthResponse>> {
  try {
    const res = await http.get<any>("/api/health");
    const data = (res as any)?.data || res || {};
    return okResult(data as HealthResponse);
  } catch {
    return errResult("Failed to fetch health", {});
  }
}
