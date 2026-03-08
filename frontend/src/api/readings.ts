import { http, okResult, errResult } from "./http";
import type { SensorReading } from "../types/api";
import type { ApiResult } from "./http";

export async function fetchLatestReadings(
  limit = 10,
): Promise<ApiResult<SensorReading[]>> {
  try {
    const res = await http.get<any>("/api/sensors/readings");
    const all = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : [];
    return okResult(all.slice(0, limit), { usedPath: "/api/sensors/readings" });
  } catch {
    return errResult("Failed to fetch readings", []);
  }
}
